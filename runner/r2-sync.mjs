// One-way, add-only copy of uploaded annual reports to Cloudflare R2.
//
// The documents volume holds one folder per report, named by the PDF's SHA-256
// (r_<sha256>/original.pdf, pages.json, meta.json, summary.json, ...). Each cycle uploads
// files that are new or changed since the last successful upload (size + mtime, then
// MD5 checked against R2's ETag). Nothing is ever deleted remotely: a lost or wiped
// local volume can not remove the off-machine copy. Run by runner/cloud-backup.mjs.
import {createHash} from 'node:crypto';
import {readdir, readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';

const MAX_OBJECT = 300 * 1024 * 1024; // Cloudflare's REST upload limit per object
const SETTLE_MS = 60_000; // skip files written in the last minute (an upload in progress)
const TYPES = {pdf: 'application/pdf', json: 'application/json'};

export function r2Client({token, account, bucket, fetcher = fetch}) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${encodeURIComponent(bucket)}/objects/`;
  return async function put(key, body, contentType, attempt = 1) {
    try {
      const r = await fetcher(base + key.split('/').map(encodeURIComponent).join('/'), {
        method: 'PUT',
        headers: {Authorization: 'Bearer ' + token, 'Content-Type': contentType},
        body,
        signal: AbortSignal.timeout(15 * 60_000),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || json.success === false) {
        const msg = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || 'HTTP ' + r.status;
        throw Object.assign(Error(msg), {retry: r.status === 429 || r.status >= 500});
      }
      return json.result || {};
    } catch (e) {
      if ((e.retry || e.name === 'TimeoutError' || e.cause) && attempt < 4) {
        await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
        return put(key, body, contentType, attempt + 1);
      }
      throw e;
    }
  };
}

/** Files to back up: every regular file inside r_* report folders. */
export async function listReportFiles(root) {
  const out = [];
  for (const dir of await readdir(root, {withFileTypes: true})) {
    if (!dir.isDirectory() || !dir.name.startsWith('r_')) continue;
    for (const f of await readdir(join(root, dir.name), {withFileTypes: true})) {
      if (!f.isFile() || f.name.endsWith('.tmp')) continue;
      const path = join(root, dir.name, f.name), s = await stat(path);
      out.push({key: `${dir.name}/${f.name}`, path, size: s.size, mtimeMs: Math.round(s.mtimeMs)});
    }
  }
  return out.sort((a, b) => a.size - b.size); // small metadata first
}

/** One cycle. `state.files[key]` = {size, mtimeMs, md5} of the last verified upload. */
export async function syncDocuments({root, put, loadState, saveState, bucket, prefix = 'reports/', now = Date.now}) {
  const started = now();
  let state = await loadState();
  if (!state || state.bucket !== bucket) state = {bucket, files: {}};
  const summary = {uploaded: 0, bytes: 0, skipped: [], failed: []};
  const files = await listReportFiles(root);
  for (const f of files) {
    const prev = state.files[f.key];
    if (prev && prev.size === f.size && prev.mtimeMs === f.mtimeMs) continue;
    if (now() - f.mtimeMs < SETTLE_MS) continue; // still being written; next cycle
    if (f.size > MAX_OBJECT) {
      summary.skipped.push(`${f.key} (${Math.round(f.size / 1048576)} MB is over the 300 MB upload limit)`);
      continue;
    }
    try {
      const body = await readFile(f.path);
      const md5 = createHash('md5').update(body).digest('hex');
      if (prev && prev.md5 === md5 && prev.size === f.size) {
        state.files[f.key] = {...prev, mtimeMs: f.mtimeMs};
      } else {
        const result = await put(prefix + f.key, body, TYPES[f.key.split('.').pop()] || 'application/octet-stream');
        const etag = String(result.etag || '').replace(/"/g, '');
        if (etag && etag !== md5) throw Error(`checksum mismatch after upload (R2 ${etag}, local ${md5})`);
        if (Number.isFinite(Number(result.size)) && Number(result.size) !== f.size) throw Error(`size mismatch after upload (R2 ${result.size}, local ${f.size})`);
        state.files[f.key] = {size: f.size, mtimeMs: f.mtimeMs, md5, uploadedAt: new Date(now()).toISOString()};
        summary.uploaded++;
        summary.bytes += f.size;
      }
      await saveState(state);
    } catch (e) {
      summary.failed.push(`${f.key}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  state.lastSyncAt = new Date(now()).toISOString();
  state.lastResult = summary.failed.length ? 'failed' : 'ok';
  await saveState(state);
  const onDisk = new Set(files.map((f) => f.key));
  return {...summary, files: files.length, backedUp: Object.keys(state.files).filter((k) => onDisk.has(k)).length, ms: now() - started};
}
