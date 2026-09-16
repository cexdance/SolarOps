import { authedFetch } from './supabase';

// A failed Trello request must not fail the already-committed SolarOps save.
// Keep identifiers only, not customer data, for retry after reload/offline.
const KEY = 'solarops_trello_customer_outbox';
let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function read(): string[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(ids: string[]) { localStorage.setItem(KEY, JSON.stringify(ids)); }
export function queueTrelloCustomerRows(rows: { key: string; value: unknown }[]) {
  if (typeof window === 'undefined') return;
  const pending = new Set(read());
  for (const row of rows) {
    const value = row.value as { id?: string; customerId?: string; trelloCardId?: string };
    if (row.key.startsWith('customer:') || (row.key.startsWith('job:') && value.customerId && (value.trelloCardId || value.id?.startsWith('job-trello-')))) pending.add(row.key);
  }
  try { write([...pending]); } catch { /* Nightly server sweep also reconciles. */ }
  if (!timer) timer = setTimeout(() => { timer = undefined; void drain(); }, 2000);
}
async function drain() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    for (const key of read()) {
      // Remove before sending so a new save arriving during the request is
      // retained as another attempt, rather than acknowledged accidentally.
      write(read().filter(k => k !== key));
      try {
        const customer = key.startsWith('customer:');
        const response = await authedFetch('/api/trello-card', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ syncRecord: true, [customer ? 'customerId' : 'jobId']: key.slice(key.indexOf(':') + 1) }) });
        if (!response.ok) throw new Error(`Trello customer sync ${response.status}`);
      } catch (error) {
        write([...new Set([...read(), key])]);
        console.warn('[trello-customer-sync] queued for retry', error);
        break;
      }
    }
  } finally {
    running = false;
    if (read().length && !timer) timer = setTimeout(() => { timer = undefined; void drain(); }, 30000);
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void drain(); });
  window.addEventListener('supabase-sync-success', () => { void drain(); });
}
