/** Pure production monitor rules. Shared by the background worker and API. */
export const RECIPIENTS = ['cesar.jurado@conexsol.us'];
export interface Site { siteId: number; name: string; activationStatus?: string; lastUpdateTime?: string; location?: { state?: string; timezone?: string; city?: string; country?: string } }
export interface Alert { siteId: number; status: string; type: string; firstTrigger?: string }
export interface Reading { timestamp: string; value: number | null }
export interface Finding { kind: 'communication' | 'production'; detail: string; since?: string; weeklyWh?: number; averageWh?: number; dropPercent?: number }
export interface Evaluation { siteId: number; name: string; checkedAt: string; findings: Finding[]; production: 'checked' | 'insufficient' | 'error'; communication: 'checked' | 'unknown'; error?: string; window: string }
export interface Review { id: string; siteId: number; name: string; kind: Finding['kind']; finding: Finding; openedAt: string; lastCheckedAt: string; active: boolean; status: 'open' | 'in_review' | 'reviewed'; reviewer?: string; reviewedAt?: string; notes?: string; notifiedAt?: string }
export interface ReviewState { reviews: Review[]; lastRun?: { startedAt: string; completedAt?: string; status: 'running' | 'complete' | 'partial' | 'failed'; total: number; checked: number; insufficient: number; unknownCommunication: number; errors: number; error?: string }; recipients: string[]; energyCache?: Record<string, { refreshedDay: string; values: Reading[] }> }
export const emptyState = (): ReviewState => ({ reviews: [], recipients: [...RECIPIENTS] });
export function floridaSite(site: Site): boolean {
  const state = (site.location?.state ?? '').trim().toLowerCase();
  if (state) return state === 'fl' || state === 'florida';
  return /^US[\s-]\d+/i.test(site.name.trim());
}
export function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}
export function localDay(now: Date, timezone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** Timestamp evidence must carry a timezone. Never interpret a poll time as telemetry. */
export function evidenceTime(value?: string): number | null {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? time : null;
}
export function evaluate(site: Site, alerts: Alert[], readings: Reading[] | null, now = new Date()): Evaluation {
  const today = localDay(now, site.location?.timezone || 'America/New_York');
  const end = shiftDay(today, -1); const start = shiftDay(today, -77);
  const result: Evaluation = { siteId: site.siteId, name: site.name, checkedAt: now.toISOString(), findings: [], production: readings ? 'insufficient' : 'error', communication: 'unknown', window: `${shiftDay(today, -7)} to ${end}` };
  const last = evidenceTime(site.lastUpdateTime);
  const faults = alerts.filter(a => a.siteId === site.siteId && a.status === 'OPEN' && ['SITE_COMMUNICATION_FAULT', 'RAPID_SITE_COMMUNICATION_FAULT'].includes(a.type));
  const starts = faults.map(a => evidenceTime(a.firstTrigger)).filter((t): t is number => t !== null && t <= now.getTime());
  if (last !== null && last <= now.getTime() || starts.length) result.communication = 'checked';
  const since = starts.length ? Math.min(...starts) : last;
  if (since !== null && now.getTime() - since >= 48 * 3600000) {
    result.findings.push({ kind: 'communication', since: new Date(since).toISOString(), detail: `No communication for ${Math.floor((now.getTime() - since) / 3600000)} hours (48-hour threshold).` });
  }
  // A complete alert response with no open communication fault can clear an old fault.
  // Unknown last-update evidence stays visible in coverage rather than fabricating freshness.
  const days = new Map<string, number | null>();
  for (const r of readings ?? []) {
    const day = r.timestamp.slice(0, 10);
    if (day >= start && day <= end) days.set(day, typeof r.value === 'number' && Number.isFinite(r.value) && r.value >= 0 ? r.value : null);
  }
  const values: number[] = [];
  for (let i = 0; i < 77; i++) {
    const v = days.get(shiftDay(start, i)); if (v === undefined || v === null) return result; values.push(v);
  }
  const averageWh = values.slice(0, 70).reduce((a, b) => a + b, 0) / 10;
  if (averageWh <= 0) return result;
  result.production = 'checked';
  const weeklyWh = values.slice(70).reduce((a, b) => a + b, 0);
  const dropPercent = (1 - weeklyWh / averageWh) * 100;
  if (weeklyWh <= averageWh * 0.6) result.findings.push({ kind: 'production', weeklyWh, averageWh, dropPercent, detail: `Production down ${dropPercent.toFixed(1)}%: ${(weeklyWh / 1000).toFixed(1)} kWh versus ${(averageWh / 1000).toFixed(1)} kWh prior 10-week average. Period ${result.window}.` });
  return result;
}
/** Preserve human decisions, create one incident per condition episode, never clear on failed reads. */
export function reconcile(state: ReviewState, evaluations: Evaluation[]): ReviewState {
  const reviews = state.reviews.map(r => ({ ...r }));
  for (const e of evaluations) for (const kind of ['communication', 'production'] as const) {
    const finding = e.findings.find(f => f.kind === kind);
    const current = [...reviews].reverse().find(r => r.siteId === e.siteId && r.kind === kind && r.active);
    const reliable = kind === 'production' ? e.production === 'checked' : !e.error;
    if (finding && current) { current.finding = finding; current.name = e.name; current.lastCheckedAt = e.checkedAt; }
    else if (finding) reviews.push({ id: `${e.siteId}:${kind}:${e.checkedAt}`, siteId: e.siteId, name: e.name, kind, finding, openedAt: e.checkedAt, lastCheckedAt: e.checkedAt, active: true, status: 'open' });
    else if (current && reliable) { current.active = false; current.lastCheckedAt = e.checkedAt; }
  }
  return { ...state, reviews, recipients: [...RECIPIENTS] };
}
export function reviewSubject(reviews: Review[]): string {
  const kinds = [...new Set(reviews.map(r => r.kind === 'communication' ? '48h communication outage' : '40% production drop'))].join(' / ');
  const count = new Set(reviews.map(r => r.siteId)).size;
  return `SolarOps: ${count} Florida ${count === 1 ? 'site needs' : 'sites need'} human review | ${kinds}`;
}

/** DAY resolution permits at most one month. Buffers include local boundary days. */
export function energyWindows(start: string, end: string): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  for (let day = start; day <= end; day = shiftDay(day, 26)) {
    const last = shiftDay(day, 25) < end ? shiftDay(day, 25) : end;
    windows.push({ from: `${shiftDay(day, -1)}T00:00:00Z`, to: `${shiftDay(last, 1)}T23:59:59Z` });
  }
  return windows;
}
