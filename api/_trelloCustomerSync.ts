import { createHash, randomUUID } from 'node:crypto';

type RecordData = Record<string, any>;
type Comment = { marker: string; text: string };
const START = '<!-- SolarOps customer sync -->';
const END = '<!-- /SolarOps customer sync -->';
export function linkedCardId(job: RecordData): string | undefined {
  const id = job.trelloCardId || /^job-trello-([a-f0-9]{24})$/i.exec(job.id || '')?.[1];
  return /^[a-f0-9]{24}$/i.test(id || '') ? id : undefined;
}
const clean = (x: unknown) => String(x ?? '').trim();
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
  const comments: Comment[] = [];
  for (const r of job.rmaEntries || []) {
    if (!r.id) continue;
    const marker = `SolarOps RMA ID: ${r.id}`;
    const body = [`RMA imported from SolarOps service order ${job.woNumber || job.id}`, `Customer: ${name}`];
    if (address) body.push(`Address: ${address}`);
    for (const [label, value] of Object.entries({ Manufacturer: r.manufacturer, Part: r.partDescription,
      'RMA number': r.rmaNumber, 'Case number': r.caseNumber, 'RMA status': r.rmaStatus, 'Legacy status': r.status,
      'Compensation collected': r.compensationCollected, 'Compensation amount': r.compensationAmount,
      'Compensation collected at': r.compensationCollectedAt, Created: r.createdAt, 'Created by': r.createdBy, Updated: r.updatedAt })) {
      if (value !== undefined && value !== null && clean(value)) body.push(`${label}: ${value}`);
    }
    comments.push({ marker, text: [...body, marker].join('\n') });
  }
  const activities = new Map<string, RecordData>();
  for (const a of [...(customer.activityHistory || []), ...(job.activityHistory || [])]) {
    // Never export a Trello-origin event back to Trello, including previous imports.
    if (!a.id || /^trello[-:]/i.test(a.id) || /SolarOps (?:RMA ID|activity ID|audit ID|record notes):/.test(a.description || '')) continue;
    activities.set(a.id, a);
  }
  for (const a of activities.values()) {
    const marker = `SolarOps activity ID: ${a.id}`;
    comments.push({ marker, text: [`SolarOps activity — ${name}`, `Original date: ${a.timestamp || 'Not recorded'}`,
      `Author: ${a.userName || 'Not recorded'}`, `Type: ${a.type || 'activity'}`, '', a.description || a.details || '', marker].join('\n') });
  }
  for (const a of job.auditLog || []) {
    if (!a.id) continue;
    const marker = `SolarOps audit ID: ${a.id}`;
    comments.push({ marker, text: [`SolarOps audit — ${job.woNumber || job.id}`, `Original date: ${a.timestamp || 'Not recorded'}`,
      `Author: ${a.userName || 'Not recorded'}`, `Action: ${a.action || 'updated'}`, '', a.details || '', marker].join('\n') });
  }
  const seenNotes = new Set<string>();
  for (const source of [customer, job]) {
    if (!clean(source.notes) || seenNotes.has(source.notes)) continue;
    seenNotes.add(source.notes);
    const marker = `SolarOps record notes: ${source.id}`;
    comments.push({ marker, text: `SolarOps record notes — ${name}\n\n${source.notes}\n\n${marker}` });
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
    const r = await fetcher(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Customer sync Trello ${method} ${r.status}`);
    return r.json();
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
      const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
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
        // Adopt previous one-time imports by their stable marker.
        const found = existing.find(a => (a.data?.text || '').split('\n').includes(c.marker));
        // Previous audit backfills stored the audit IDs in one combined comment.
        if (!found && c.marker.startsWith('SolarOps audit ID:') && existing.some(a => (a.data?.text || '').includes(`SolarOps audit import: ${jobId}`) && a.data.text.includes(c.marker.slice('SolarOps audit ID: '.length)))) continue;
        if (found?.data.text === c.text) continue;
        await renew();
        const result = found
          ? await trello(`cards/${cardId}/actions/${found.id}/comments`, 'PUT', { text: c.text })
          : await trello(`cards/${cardId}/actions/comments`, 'POST', { text: c.text });
        if (found) updated++; else { posted++; existing.push(result); }
      }
      await renew();
      await db('on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: stateKey, value: { hash, cardId, syncedAt: new Date().toISOString() } }) });
      return { cardId, posted, updated };
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
