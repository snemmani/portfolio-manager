import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {syncDocuments, r2Client} from '../runner/r2-sync.mjs';

const root = mkdtempSync(join(tmpdir(), 'r2-sync-'));
try {
  const old = Date.now() / 1000 - 3600;
  const file = (key, body, mtime = old) => { const p = join(root, key); mkdirSync(join(p, '..'), {recursive: true}); writeFileSync(p, body); utimesSync(p, mtime, mtime); };
  file('r_aaa/original.pdf', '%PDF-1 report');
  file('r_aaa/pages.json', '[{"page":1}]');
  file('r_aaa/meta.json', '{"status":"ready"}');
  file('r_aaa/meta.json.tmp', 'partial');
  file('chunks/upload-1/chunk-0', 'in progress');
  const bucketStore = new Map();
  let puts = [], corrupt = false;
  const put = async (key, body, type) => {
    puts.push(key);
    bucketStore.set(key, {body: Buffer.from(body), type});
    const md5 = createHash('md5').update(corrupt ? 'x' : body).digest('hex');
    return {key, size: String(body.length), etag: md5};
  };
  let state = null;
  const io = {root, put, bucket: 'b1', loadState: async () => state && JSON.parse(JSON.stringify(state)), saveState: async (s) => { state = JSON.parse(JSON.stringify(s)); }};

  let r = await syncDocuments(io);
  assert.equal(r.uploaded, 3, 'Every file in a report folder is uploaded once');
  assert.deepEqual([...bucketStore.keys()].sort(), ['reports/r_aaa/meta.json', 'reports/r_aaa/original.pdf', 'reports/r_aaa/pages.json'], 'Temporary files and in-progress upload chunks are skipped');
  assert.equal(bucketStore.get('reports/r_aaa/original.pdf').type, 'application/pdf', 'PDFs are stored with their content type');

  puts = [];
  r = await syncDocuments(io);
  assert.equal(puts.length, 0, 'Unchanged files are not uploaded again');

  file('r_aaa/meta.json', '{"status":"ready","summary":"yes"}');
  file('r_aaa/summary.json', '{"ok":true}');
  file('r_bbb/original.pdf', 'fresh upload', Date.now() / 1000);
  puts = [];
  r = await syncDocuments(io);
  assert.deepEqual(puts.sort(), ['reports/r_aaa/meta.json', 'reports/r_aaa/summary.json'], 'Changed and new files upload; a file written in the last minute waits for the next cycle');

  file('r_aaa/pages.json', '[{"page":1}]', old + 10);
  puts = [];
  r = await syncDocuments(io);
  assert.equal(puts.length, 0, 'A touched file with identical content is recognised by its checksum and not re-sent');

  rmSync(join(root, 'r_aaa'), {recursive: true});
  r = await syncDocuments(io);
  assert.ok(bucketStore.has('reports/r_aaa/original.pdf'), 'Deleting a local report never deletes the R2 copy');

  corrupt = true;
  file('r_ccc/original.pdf', 'another report');
  r = await syncDocuments(io);
  assert.match(r.failed[0], /checksum mismatch/, 'An upload whose ETag does not match the local MD5 is reported as failed');
  assert.ok(!state.files['r_ccc/original.pdf'], 'A failed upload is retried on the next cycle');
  corrupt = false;
  r = await syncDocuments(io);
  assert.equal(r.uploaded, 1, 'The retry succeeds once the checksum matches');

  const calls = [];
  const client = r2Client({token: 't', account: 'acc', bucket: 'arthapalana-reports', fetcher: async (url, init) => { calls.push({url, init}); return new Response(JSON.stringify({success: true, result: {etag: 'e', size: '1'}})); }});
  await client('reports/r_x/meta.json', Buffer.from('1'), 'application/json');
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/r2/buckets/arthapalana-reports/objects/reports/r_x/meta.json', 'Objects are written through the account R2 API');
  assert.equal(calls[0].init.method, 'PUT');
  console.log('PASS: R2 report backup uploads new and changed files once, skips temporary and in-progress files, waits for settled writes, recognises unchanged content, verifies every upload by MD5 ETag, retries failures and never deletes remote copies.');
} finally {
  rmSync(root, {recursive: true, force: true});
}
