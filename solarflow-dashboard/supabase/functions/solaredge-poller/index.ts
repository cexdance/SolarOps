// SolarOps — SolarEdge Polling Edge Function (Deno runtime, Monitoring API v2)
//
// Runs 2×/day at 9am and 1pm ET. Per run:
//   1. Pulls every site (/v2/sites) and every open SolarEdge alert (/v2/alerts)
//   2. Builds each site's alert list from SolarEdge's own alerts, plus a
//      "site not active" flag
//   3. Detects alerts that closed since the last run (by SolarEdge alertId)
//   4. Upserts a `solar:{siteId}` row in the `app_data` table
//   5. Supabase Realtime fans the change out to every connected client
//
// Why fleet-wide: v1 fetched one overview per site (~360 calls/run). v2 allows
// 25 calls/minute, so that would take ~15 minutes. Two paged endpoints cover the
// whole fleet in ~21 calls. SolarEdge's alerts replace the old homemade
// heuristics (stale data >24h, zero power in daylight).
//
// Required Supabase secrets (set in the dashboard, Edge Functions → Secrets):
//   - SOLAREDGE_API_KEY            (v2 Developer Platform key)
//   - SUPABASE_URL                 (auto-provided in Edge Function env)
//   - SUPABASE_SERVICE_ROLE_KEY    (auto-provided)
//
// Deploy:
//   supabase functions deploy solaredge-poller --no-verify-jwt
// Schedule (Supabase dashboard → Database → Cron Jobs):
//   Runs 2×/day at 9am (UTC-4 EDT = 1pm UTC) and 1pm (UTC-4 = 5pm UTC):
//   DELETE FROM cron.job WHERE jobname = 'solaredge-poll';
//   SELECT cron.schedule('solaredge-poll', '0 13,17 * * *',
//     $$ SELECT net.http_post(
//          url := 'https://<project-ref>.supabase.co/functions/v1/solaredge-poller',
//          headers := jsonb_build_object('Authorization', 'Bearer <anon-key>')
//        ) $$);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const V2 = "https://monitoringapi.solaredge.com/v2";
const PAGE = 50; // v2 page size is fixed

interface V2Site {
  siteId: number;
  name: string;
  activationStatus: string;
}

interface V2Alert {
  alertId: number;
  siteId: number;
  category: string;
  type: string;
  impact: number;
  status: string;
  component?: { name?: string };
}

type Alert = { alertId?: number; type: string; severity: 'info' | 'warning' | 'critical'; message: string };

interface AppDataValue {
  siteId: number;
  siteName: string;
  status: string;
  currentPower: number;
  lastUpdateTime: string;
  lastPolled: string;
  alerts: Alert[];
}

async function v2<T>(apiKey: string, path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${V2}${path}`, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' } });
    // One retry on the per-minute limit; a second 429 fails the run loudly.
    if (res.status === 429 && attempt === 0) {
      await new Promise(r => setTimeout(r, 30_000));
      continue;
    }
    if (!res.ok) throw new Error(`SolarEdge ${path} ${res.status}`);
    return await res.json() as T;
  }
}

async function allPages<T>(fetchPage: (page: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page < 100; page++) {
    const rows = await fetchPage(page);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ponytail: SolarEdge impact runs 1-9; these cut points are a first guess.
// Tune once someone has watched real alerts come through.
const severity = (impact: number): Alert['severity'] => (impact >= 7 ? 'critical' : impact >= 4 ? 'warning' : 'info');

function siteAlerts(site: V2Site, open: V2Alert[]): Alert[] {
  const alerts: Alert[] = open.map(a => ({
    alertId: a.alertId,
    type: a.type.toLowerCase(),
    severity: severity(a.impact),
    message: `${a.category}: ${a.type}${a.component?.name ? ` on ${a.component.name}` : ''}`,
  }));
  if (site.activationStatus && site.activationStatus !== 'ACTIVE') {
    alerts.push({ type: 'inverter_offline', severity: 'warning', message: `Site status: ${site.activationStatus}` });
  }
  return alerts;
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  const apiKey = Deno.env.get('SOLAREDGE_API_KEY')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey || !supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SOLAREDGE_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const sites = await allPages(async p =>
      (await v2<{ sites?: { site?: V2Site[] } }>(apiKey, `/sites?page=${p}`)).sites?.site ?? []);
    const alerts = await allPages(async p => {
      const rows = await v2<V2Alert[]>(apiKey, `/alerts?page=${p}`);
      return Array.isArray(rows) ? rows : [];
    });

    const openBySite = new Map<number, V2Alert[]>();
    for (const a of alerts) {
      if (a.status !== 'OPEN') continue;
      openBySite.set(a.siteId, [...(openBySite.get(a.siteId) ?? []), a]);
    }

    const { data: existing } = await supabase.from('app_data').select('key, value').like('key', 'solar:%');
    const prevById = new Map<number, AppDataValue>();
    for (const row of existing ?? []) {
      const v = row.value as AppDataValue | null;
      if (v?.siteId) prevById.set(v.siteId, v);
    }

    const now = new Date().toISOString();
    const rows = [];
    const notifications = [];
    for (const site of sites) {
      const newAlerts = siteAlerts(site, openBySite.get(site.siteId) ?? []);
      const prev = prevById.get(site.siteId);

      // Only alerts carrying a SolarEdge alertId can "close". Rows written by the
      // v1 poller have none, so the first v2 run doesn't fire a resolved
      // notification for every legacy heuristic alert.
      const closed = (prev?.alerts ?? []).filter(pa =>
        pa.alertId != null && !newAlerts.some(na => na.alertId === pa.alertId));
      for (const c of closed) {
        notifications.push({
          user_id: site.siteId.toString(), // Site ID as proxy for customer notification
          type: 'alert_resolved',
          title: `Alert Resolved: ${site.name}`,
          message: `${c.message} - Closed in SolarEdge portal`,
          related_job_id: null,
          related_contractor_id: null,
          related_customer_id: null,
          read: false,
          created_at: now,
        });
      }

      const value: AppDataValue = {
        siteId: site.siteId,
        siteName: site.name,
        status: site.activationStatus,
        // Fleet endpoints carry no live power or last-update time; keep the last
        // known values rather than overwrite them with zeros.
        currentPower: prev?.currentPower ?? 0,
        lastUpdateTime: prev?.lastUpdateTime ?? '',
        lastPolled: now,
        alerts: newAlerts,
      };
      rows.push({ key: `solar:${site.siteId}`, value, updated_at: now });
    }

    const { error } = await supabase.from('app_data').upsert(rows, { onConflict: 'key' });
    if (error) throw new Error(`app_data upsert: ${error.message}`);
    if (notifications.length) {
      const { error: nErr } = await supabase.from('notifications').insert(notifications);
      if (nErr) console.error('[solaredge-poller] notifications insert:', nErr.message); // don't fail the run
    }

    return new Response(JSON.stringify({
      status: 'ok',
      sitesTotal: sites.length,
      openAlerts: alerts.filter(a => a.status === 'OPEN').length,
      sitesWithAlerts: openBySite.size,
      resolvedNotifications: notifications.length,
      elapsedMs: Date.now() - startedAt,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[solaredge-poller] fatal:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
