import fs from 'node:fs';
import { createRequire } from 'node:module';
const { makeCustomerSync } = createRequire(import.meta.url)('../api/_trelloCustomerSync.ts') as typeof import('../api/_trelloCustomerSync');

// Runs the SAME server implementation for a targeted backfill/verification.
const jobId = process.argv[2];
if (!jobId?.startsWith('job-')) throw new Error('Supply an exact SolarOps job ID');
const env = Object.fromEntries(fs.readFileSync('.env.backfill.local', 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
}));
const sync = makeCustomerSync({ databaseUrl: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
  apiKey: env.TRELLO_API_KEY, token: env.TRELLO_API_TOKEN, allowedBoard: id => id === '6a5a58e06fbf97144b5d96c9' });
console.log(JSON.stringify(await sync.sync(jobId)));
