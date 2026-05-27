// SolarOps — SolarEdge Polling Edge Function (Deno runtime)
//
// Runs 2×/day at 9am and 1pm ET. For each SolarEdge site:
//   1. Fetches the live `overview` from SolarEdge's monitoring API
//   2. Computes derived alert flags (offline, no production, comm loss)
//   3. Compares alerts with stored alerts to detect closures in SolarEdge web
//   4. Upserts a `solar:{siteId}` row in the `app_data` table
//   5. Subabase Realtime fans the change out to every connected client (<200ms)
//
// On-demand detailed data (production charts, equipment details) are fetched via
// user-triggered "Sync Now" button in SolarEdgeMonitoring component.
//
// Required Supabase secrets (set via `supabase secrets set KEY=value`):
//   - SOLAREDGE_API_KEY
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

const SOLAREDGE_BASE = "https://monitoringapi.solaredge.com";
const SITES_PER_PAGE = 100;
// 300 calls/day ÷ 2 runs/day = 150 calls/run. Covers all sites in 2 cycles/day.
const MAX_OVERVIEW_CALLS_PER_RUN = 150;

interface SolarEdgeSite {
  id: number;
  name: string;
  status: string;
  peakPower: number;
  installationDate: string;
}

interface SiteOverview {
  lastUpdateTime: string;
  currentPower: { power: number };
  lifeTimeData: { energy: number };
  measuredBy: string;
}

interface AppDataValue {
  siteId: number;
  siteName: string;
  status: string;
  currentPower: number;
  lastUpdateTime: string;
  lastPolled: string;
  alerts: Array<{ type: string; severity: 'info' | 'warning' | 'critical'; message: string }>;
}

async function fetchSiteList(apiKey: string, startIndex: number): Promise<SolarEdgeSite[]> {
  const url = `${SOLAREDGE_BASE}/sites/list?api_key=${apiKey}&size=${SITES_PER_PAGE}&startIndex=${startIndex}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`SolarEdge /sites/list ${res.status}`);
  const json = await res.json() as { sites: { site: SolarEdgeSite[] } };
  return json.sites?.site ?? [];
}

async function fetchOverview(apiKey: string, siteId: number): Promise<SiteOverview | null> {
  const url = `${SOLAREDGE_BASE}/site/${siteId}/overview?api_key=${apiKey}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json() as { overview: SiteOverview };
  return json.overview ?? null;
}

function deriveAlerts(site: SolarEdgeSite, overview: SiteOverview | null): AppDataValue['alerts'] {
  const alerts: AppDataValue['alerts'] = [];

  if (!overview) {
    alerts.push({ type: 'communication_loss', severity: 'critical', message: 'No overview data returned' });
    return alerts;
  }

  // Stale data — last update more than 24h ago
  const lastUpdate = new Date(overview.lastUpdateTime).getTime();
  const hoursSince = (Date.now() - lastUpdate) / 3_600_000;
  if (Number.isFinite(hoursSince) && hoursSince > 24) {
    alerts.push({
      type: 'communication_loss',
      severity: 'critical',
      message: `No data for ${Math.round(hoursSince)}h`,
    });
  }

  // Zero production during daylight (rough heuristic: 9am-5pm site-local approx via UTC offset)
  const hour = new Date().getUTCHours();
  const daylightUtc = hour >= 13 && hour <= 22; // ~9am-6pm ET
  if (daylightUtc && overview.currentPower?.power === 0) {
    alerts.push({
      type: 'production_drop',
      severity: 'warning',
      message: 'Zero production during daylight hours',
    });
  }

  // Site status reported as not active
  if (site.status && site.status.toLowerCase() !== 'active') {
    alerts.push({
      type: 'inverter_offline',
      severity: 'warning',
      message: `Site status: ${site.status}`,
    });
  }

  return alerts;
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  const apiKey = Deno.env.get('SOLAREDGE_API_KEY');
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
    // 1. Pull the site list (single page is usually enough for SolarOps' ~150 sites)
    const sites = await fetchSiteList(apiKey, 0);

    // 2. Pick the N stalest sites (longest time since lastPolled) to poll this run.
    //    This rotates through all sites over time without burning the per-day quota.
    const { data: existing } = await supabase
      .from('app_data')
      .select('key, value')
      .like('key', 'solar:%');

    const lastPolledById = new Map<number, number>();
    for (const row of existing ?? []) {
      const v = row.value as AppDataValue | null;
      if (v?.siteId && v?.lastPolled) {
        lastPolledById.set(v.siteId, new Date(v.lastPolled).getTime());
      }
    }

    const ranked = sites
      .map(s => ({ site: s, lastPolled: lastPolledById.get(s.id) ?? 0 }))
      .sort((a, b) => a.lastPolled - b.lastPolled)
      .slice(0, MAX_OVERVIEW_CALLS_PER_RUN);

    // 3. Fetch overview for each, build the row, upsert, detect closed alerts
    const upserts = await Promise.all(ranked.map(async ({ site }) => {
      const overview = await fetchOverview(apiKey, site.id).catch(() => null);
      const newAlerts = deriveAlerts(site, overview);

      // Fetch previous alerts to detect closures in SolarEdge web
      const { data: prevRow } = await supabase
        .from('app_data')
        .select('value')
        .eq('key', `solar:${site.id}`)
        .single();
      const prevAlerts = (prevRow?.value as AppDataValue | null)?.alerts ?? [];

      // Detect closed alerts (were in previous, not in current)
      const closedAlerts = prevAlerts.filter(pa =>
        !newAlerts.some(na => na.type === pa.type)
      );

      // Emit closure notifications to the customer
      for (const closedAlert of closedAlerts) {
        await supabase.from('notifications').insert({
          user_id: site.id.toString(), // Site ID as proxy for customer notification
          type: 'alert_resolved',
          title: `Alert Resolved: ${site.name}`,
          message: `${closedAlert.message} - Closed in SolarEdge portal`,
          related_job_id: null,
          related_contractor_id: null,
          related_customer_id: null,
          read: false,
          created_at: new Date().toISOString(),
        }).catch(() => null); // Don't fail the entire run if notification fails
      }

      const value: AppDataValue = {
        siteId: site.id,
        siteName: site.name,
        status: site.status,
        currentPower: overview?.currentPower?.power ?? 0,
        lastUpdateTime: overview?.lastUpdateTime ?? '',
        lastPolled: new Date().toISOString(),
        alerts: newAlerts,
      };

      const { error } = await supabase
        .from('app_data')
        .upsert({
          key: `solar:${site.id}`,
          value,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

      return { siteId: site.id, ok: !error, error: error?.message, closedAlerts: closedAlerts.length };
    }));

    const successes = upserts.filter(u => u.ok).length;
    const failures = upserts.filter(u => !u.ok);

    return new Response(JSON.stringify({
      status: 'ok',
      sitesTotal: sites.length,
      sitesPolled: ranked.length,
      successes,
      failures,
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
