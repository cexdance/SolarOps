import { createHash, randomUUID } from 'node:crypto';

type RecordData = Record<string, any>;
/** `marker` is how the sync finds its own comment again (it sits inside the
 *  tag line's link URL). `legacyMarker` is the full-line marker comments carried
 *  before 2026-10-01, so those are rewritten in place rather than duplicated. */
type Comment = { marker: string; legacyMarker: string; text: string };
const START = '<!-- SolarOps customer sync -->';
const END = '<!-- /SolarOps customer sync -->';
export function linkedCardId(job: RecordData): string | undefined {
  const id = job.trelloCardId || /^job-trello-([a-f0-9]{24})$/i.exec(job.id || '')?.[1];
  return /^[a-f0-9]{24}$/i.test(id || '') ? id : undefined;
}
const clean = (x: unknown) => String(x ?? '').trim();

// ── The one-line tag every SolarOps comment ends with (2026-10-01) ─────────
//
// Owner: "If we need to tag that it's coming from SolarOps, keep it under 1 line
// with date and author." Trello renders `[SolarOps](url)` as the single word
// SolarOps, so the tag reads "SolarOps · Cesar Jurado · Sep 30, 2026" while the
// URL carries the record id the sync needs to find the comment again.
const APP_URL = 'https://solarflow-dashboard-sooty.vercel.app';
export function soLink(kind: 'activity' | 'rma', id: string): string {
  return `${APP_URL}/#so-${kind}-${encodeURIComponent(id)}`;
}
/** The exact substring the sync searches for: the link target, closing paren included. */
export function soMarker(kind: 'activity' | 'rma', id: string): string {
  return `(${soLink(kind, id)})`;
}
/** Any marker SolarOps has ever written, old full-line style or new link style. */
export const SOLAROPS_MARKER = /SolarOps (?:RMA ID|activity ID|audit ID|audit import|record notes):|#so-(?:activity|rma)-/;

/** "Cesar Jurado (Admin)" -> "Cesar Jurado"; a placeholder author is dropped. */
export function tagAuthor(name: unknown): string | undefined {
  const s = clean(name).replace(/\s*\(admin\)\s*$/i, '');
  return !s || /^not recorded$/i.test(s) ? undefined : s;
}
/** "Sep 30, 2026" in the office's time zone, so an evening note keeps its day. */
export function tagDate(iso: unknown): string | undefined {
  const d = new Date(clean(iso));
  if (!clean(iso) || Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
}
export function tagLine(kind: 'activity' | 'rma', id: string, author: unknown, when: unknown): string {
  return [`[SolarOps](${soLink(kind, id)})`, tagAuthor(author), tagDate(when)].filter(Boolean).join(' · ');
}

/**
 * An OLD-format SolarOps comment in a category the sync no longer posts
 * (2026-10-01): automatic job/field updates, audit entries, the raw JSON audit
 * dump, and record-notes copies. Only these are ever deleted.
 *
 * Deliberately narrow. A comment without a SolarOps marker is a person's and is
 * never touched. Old-format notes and RMAs are NOT retired: the sync rewrites
 * them in place, and one whose source record is gone is left alone rather than
 * guessed at.
 */
export function isRetiredComment(text: string): boolean {
  if (/#so-(?:activity|rma)-/.test(text)) return false;                 // current format
  if (/^SolarOps audit ID:/m.test(text)) return true;
  if (/SolarOps audit import:/.test(text)) return true;
  if (/^SolarOps record notes:/m.test(text)) return true;
  if (/^SolarOps activity ID:/m.test(text)) {
    const type = (text.match(/^Type: (.*)$/m) || [])[1];
    return !!type && type !== 'note_added' && type !== 'activity';
  }
  return false;
}

/** Bump when the comment FORMAT changes, so every card gets one pass even where
 *  the underlying records did not change (the sync skips identical content). */
const FORMAT_VERSION = 'v2-2026-10-01';

const humanize = (s: unknown) => { const t = clean(s).replace(/_/g, ' '); return t ? t[0].toUpperCase() + t.slice(1) : ''; };

/** One RMA as one readable line (plus the case number when it differs). No
 *  dollar amounts: money stays out of shared surfaces (SHOW_MONEY). */
export function rmaComment(r: RecordData): string {
  const head = [r.rmaNumber ? `RMA ${clean(r.rmaNumber)}` : 'RMA (number pending)',
    clean(r.partDescription), clean(r.manufacturer), humanize(r.rmaStatus || r.status)].filter(Boolean).join(' · ');
  const lines = [head];
  if (clean(r.caseNumber) && clean(r.caseNumber) !== clean(r.rmaNumber)) lines.push(`Case ${clean(r.caseNumber)}`);
  if (r.compensationCollected === true) lines.push('Compensation collected');
  return `${lines.join('\n')}\n\n${tagLine('rma', r.id, r.createdBy, r.createdAt)}`;
}
export function customerSyncContent(job: RecordData, customer: RecordData) {
  const name = [customer.clientId, customer.name || job.clientName].filter(Boolean).join(' ');
  const address = [customer.address || job.siteAddress, customer.city, [customer.state, customer.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const lines = [START, `Customer: ${name}`, 'Record type: Customer (converted from lead)'];
  for (const [label, value] of Object.entries({ Address: address, Phone: customer.phone, Email: customer.email,
    'Service Order': job.woNumber, Service: job.serviceType, 'Service order status': job.woStatus,
    'Site ID': job.siteTransferSiteId || customer.solarEdgeSiteId || job.solarEdgeSiteId,
    'Inverter serial': job.siteTransferInverterSerial })) {
    if (clean(value)) lines.push(`${label}: ${clean(value)}`);
  }
  lines.push(END);
  // ONLY what someone working the card in Trello needs: real notes and RMAs
  // (owner decision 2026-10-01). Everything else this used to post was
  // internal bookkeeping that read as noise on the board: 315 automatic "work
  // order updated" lines with no author, 139 audit entries (85 of them just
  // "Fields updated"), field-edit diffs, and copies of the lead email that is
  // already the card description. All of it still lives in SolarOps.
  const comments: Comment[] = [];
  for (const r of job.rmaEntries || []) {
    if (!r.id) continue;
    comments.push({ marker: soMarker('rma', r.id), legacyMarker: `SolarOps RMA ID: ${r.id}`, text: rmaComment(r) });
  }
  const activities = new Map<string, RecordData>();
  for (const a of [...(customer.activityHistory || []), ...(job.activityHistory || [])]) {
    // Never export a Trello-origin event back to Trello, including previous imports.
    if (!a.id || /^trello[-:]/i.test(a.id) || SOLAROPS_MARKER.test(a.description || '')) continue;
    // Notes only. A missing type is free text from an older writer, so it counts.
    if (a.type && a.type !== 'note_added') continue;
    if (!clean(a.description || a.details)) continue;
    activities.set(a.id, a);
  }
  for (const a of activities.values()) {
    comments.push({
      marker: soMarker('activity', a.id),
      legacyMarker: `SolarOps activity ID: ${a.id}`,
      text: `${clean(a.description || a.details)}\n\n${tagLine('activity', a.id, a.userName, a.timestamp)}`,
    });
  }
  return { name, block: lines.join('\n'), comments };
}
export function mergeCustomerDescription(desc: string, block: string): string {
  const start = desc.indexOf(START), end = desc.indexOf(END);
  if (start >= 0 && end >= start) return desc.slice(0, start) + block + desc.slice(end + END.length);
  // Preserve all human-authored and historical text outside the managed block.
  return `${block}\n\n${desc}`.trim();
}

export function makeCustomerSync(options: { databaseUrl: string; serviceKey: string; apiKey: string; token: string; allowedBoard: (id: string) => boolean; fetcher?: typeof fetch }) {
  const fetcher = options.fetcher || fetch;
  const dbHeaders = { apikey: options.serviceKey, Authorization: `Bearer ${options.serviceKey}`, 'Content-Type': 'application/json' };
  async function db(query: string, init: RequestInit = {}) {
    const r = await fetcher(`${options.databaseUrl}/rest/v1/app_data?${query}`, { ...init, headers: { ...dbHeaders, ...init.headers }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Customer sync database ${r.status}`);
    const text = await r.text();
    return text ? JSON.parse(text) : [];
  }
  async function get(key: string) { return (await db(`key=eq.${encodeURIComponent(key)}&select=value`))[0]?.value; }
  async function trello(path: string, method = 'GET', body?: RecordData) {
    const url = new URL(`https://api.trello.com/1/${path}`);
    url.searchParams.set('key', options.apiKey); url.searchParams.set('token', options.token);
    // Trello allows 100 requests / 10 s per token; a cleanup pass on a busy card
    // can exceed that, so back off on 429 instead of failing the whole card.
    for (let attempt = 0; ; attempt++) {
      const r = await fetcher(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      if (r.status === 429 && attempt < 4) { await new Promise(res => setTimeout(res, 1500 * (attempt + 1))); continue; }
      if (!r.ok) throw new Error(`Customer sync Trello ${method} ${r.status}`);
      return r.json();
    }
  }
  async function sync(jobId: string) {
    let job = await get(`job:${jobId}`);
    const cardId = job && linkedCardId(job);
    if (!cardId || !job.customerId) return { skipped: 'not a linked customer' };
    const lockKey = `trello_sync_lock:${cardId}`, owner = randomUUID();
    const lease = () => ({ owner, expires: new Date(Date.now() + 120000).toISOString() });
    const insert = await db('on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ key: lockKey, value: lease() }) });
    if (!insert.length) {
      const claimed = await db(`key=eq.${lockKey}&value->>expires=lt.${encodeURIComponent(new Date().toISOString())}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value: lease() }) });
      if (!claimed.length) return { retry: true, skipped: 'sync in progress' };
    }
    try {
      // Re-read after the lock: a queued request must not write an older snapshot.
      job = await get(`job:${jobId}`);
      if (!job || linkedCardId(job) !== cardId || !job.customerId) return { skipped: 'link changed' };
      const customer = await get(`customer:${job.customerId}`);
      if (!customer) return { retry: true, skipped: 'customer not saved yet' };
      const content = customerSyncContent(job, customer);
      const hash = createHash('sha256').update(FORMAT_VERSION + JSON.stringify(content)).digest('hex');
      const stateKey = `trello_customer_sync:${jobId}`;
      if ((await get(stateKey))?.hash === hash) return { skipped: 'unchanged' };
      const card = await trello(`cards/${cardId}?fields=idBoard,name,desc,closed`);
      if (!options.allowedBoard(card.idBoard)) throw new Error('Customer sync board not allowed');
      if (card.closed) return { skipped: 'archived card' };
      const desc = mergeCustomerDescription(card.desc || '', content.block);
      if (desc.length > 16384 || content.comments.some(c => c.text.length > 16384)) throw new Error('Customer sync content exceeds Trello limit');
      const existing: RecordData[] = [];
      for (let before = ''; ;) {
        const page = await trello(`cards/${cardId}/actions?filter=commentCard&limit=1000${before ? `&before=${before}` : ''}`);
        existing.push(...page); if (page.length < 1000) break; before = page[page.length - 1].id;
      }
      async function renew() {
        const r = await db(`key=eq.${lockKey}&value->>owner=eq.${owner}&value->>expires=gt.${encodeURIComponent(new Date().toISOString())}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ value: lease() }) });
        if (!r.length) throw new Error('Customer sync lease expired');
      }
      await renew();
      if (card.name !== content.name || card.desc !== desc) await trello(`cards/${cardId}`, 'PUT', { name: content.name, desc });
      let posted = 0, updated = 0;
      for (const c of content.comments) {
        // Find our own comment by its link marker, or by the full-line marker it
        // carried before the 2026-10-01 format, so old ones are rewritten in
        // place instead of duplicated.
        const found = existing.find(a => {
          const t = a.data?.text || '';
          return t.includes(c.marker) || t.split('\n').includes(c.legacyMarker);
        });
        if (found?.data.text === c.text) continue;
        await renew();
        const result = found
          ? await trello(`cards/${cardId}/actions/${found.id}/comments`, 'PUT', { text: c.text })
          : await trello(`cards/${cardId}/actions/comments`, 'POST', { text: c.text });
        if (found) updated++; else { posted++; existing.push(result); }
      }
      // Retire our own old bookkeeping comments on this card (see
      // isRetiredComment). Never a person's comment: the marker is required.
      let removed = 0;
      for (const a of existing) {
        if (!isRetiredComment(a.data?.text || '')) continue;
        await renew();
        await trello(`actions/${a.id}`, 'DELETE');
        removed++;
      }
      await renew();
      await db('on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: stateKey, value: { hash, cardId, syncedAt: new Date().toISOString() } }) });
      return { cardId, posted, updated, removed };
    } finally {
      await db(`key=eq.${lockKey}&value->>owner=eq.${owner}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    }
  }
  async function customerJobs(customerId: string): Promise<string[]> {
    const rows = await db(`key=like.job:*&value->>customerId=eq.${encodeURIComponent(customerId)}&select=value`);
    return rows.filter((r: any) => linkedCardId(r.value)).map((r: any) => r.value.id);
  }
  return { sync, customerJobs };
}
