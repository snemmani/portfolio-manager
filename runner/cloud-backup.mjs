// Off-machine backup loop: the app's local D1 database -> Cloudflare D1 (incremental,
// verified, wipe-guarded) and uploaded annual reports -> Cloudflare R2 (add-only).
// Each part is optional and fails independently; the app never depends on either.
import {readFile, writeFile, rename} from 'node:fs/promises';
import {syncOnce, findSource, d1Client} from './d1-sync.mjs';
import {syncDocuments, r2Client} from './r2-sync.mjs';

const env = process.env;
const {CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, D1_DATABASE_ID: database, R2_BUCKET: bucket} = env;
const minutes = Math.max(5, Number(env.BACKUP_MINUTES) || 15);
const stamp = () => new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'}) + ' IST';
const stateIO = (file) => ({
  loadState: async () => JSON.parse(await readFile(file, 'utf8').catch(() => 'null')),
  saveState: async (s) => {
    await writeFile(file + '.tmp', JSON.stringify(s), {mode: 0o600});
    await rename(file + '.tmp', file);
  },
});

if (!token || !account || (!database && !bucket)) {
  console.error('Cloud backup is not configured: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the app secrets, and D1_DATABASE_ID and/or R2_BUCKET in compose.');
  process.exit(1);
}
const jobs = [];
if (database) {
  const query = d1Client({token, account, database}), io = stateIO(env.D1_SYNC_STATE || '/data/d1-sync-state.json');
  const dir = env.D1_LOCAL_DIR || '/data/v3/d1/miniflare-D1DatabaseObject/';
  jobs.push(['d1_sync', async () => syncOnce({source: await findSource(dir), query, database, allowShrink: env.D1_SYNC_ALLOW_SHRINK === '1', ...io})]);
}
if (bucket) {
  const put = r2Client({token, account, bucket}), io = stateIO(env.R2_SYNC_STATE || '/data/r2-sync-state.json');
  jobs.push(['r2_sync', () => syncDocuments({root: env.DOCUMENTS_DIR || '/documents', put, bucket, ...io})]);
}

let stopped = false, wake;
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { stopped = true; wake?.(); });
console.log(`${stamp()} Cloud backup every ${minutes} min: ${[database && 'D1 ' + database, bucket && 'R2 ' + bucket].filter(Boolean).join(', ')}.`);
while (!stopped) {
  for (const [event, job] of jobs) {
    if (stopped) break;
    try {
      const r = await job();
      const bad = r.refused?.length || r.mismatched?.length || r.failed?.length || r.skipped?.length;
      (bad ? console.error : console.log)(`${stamp()} ${JSON.stringify({event, ...r})}`);
    } catch (e) {
      console.error(`${stamp()} ${JSON.stringify({event: event + '_failed', error: String(e?.message || e).slice(0, 300)})}`);
    }
  }
  if (!stopped) await new Promise((res) => { wake = res; setTimeout(res, minutes * 60_000); });
}
