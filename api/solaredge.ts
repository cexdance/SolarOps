/**
 * SolarOps, SolarEdge API Proxy (Monitoring API v2)
 *
 * SolarEdge retires the v1 Monitoring API on 2026-11-01. This proxy talks v2
 * (X-API-Key header, /v2/...) but keeps serving the five v1-shaped paths the
 * client already calls, so no screen had to change:
 *
 *   /sites/list            -> /v2/sites (all pages) + /v2/alerts (all pages)
 *   /site/{id}/overview    -> /v2/sites/{id}/energy, by YEAR and by DAY
 *   /site/{id}/details     -> /v2/sites/{id}
 *   /site/{id}/energy      -> /v2/sites/{id}/energy
 *   /site/{id}/equipment   -> /v2/sites/{id}/devices
 *
 * Any other path is refused. The key comes only from SOLAREDGE_API_KEY; the
 * api_key a browser may still send (old v1 key from Settings) is ignored.
 *
 * v2 limits: 25 calls/minute, monthly credit budget, 50 rows per page (fixed).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';

const V2 = 'https://monitoringapi.solaredge.com/v2';
const PAGE = 50; // v2 page size is fixed; pageSize/size/limit are ignored

// Cache durations by endpoint pattern (seconds)
function getCacheDuration(path: string): number {
  if (path.includes('/energy'))    return 3600;   // 1 hour, production charts
  if (path.includes('/overview'))  return 21600;  // 6 hours
  if (path.includes('/equipment')) return 3600;   // 1 hour
  if (path.includes('/sites'))     return 21600;  // 6 hours, site list (rarely changes)
  return 3600;
}

// ── v2 -> v1 reshaping (pure, exported for tests) ────────────────────────────

export interface V2Site {
  siteId: number;
  name: string;
  peakPower: number;
  installationDate: string | null;
  activationStatus: string;
  note?: string;
  location: {
    address?: string; city?: string; state?: string; zip?: string; country?: string;
    latitude?: number; longitude?: number; timezone?: string;
  };
  accountId?: number;
  lastUpdateTime?: string;
}

export interface V2Alert { siteId: number; impact: number; status: string }

export interface V2Energy { values: { timestamp: string; value: number | null }[] }

// ACTIVE -> Active, the casing v1 used and the client compares against.
const v1Status = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

export function toV1SitesList(sites: V2Site[], alerts: V2Alert[]) {
  const bySite = new Map<number, { n: number; max: number }>();
  for (const a of alerts) {
    if (a.status !== 'OPEN') continue;
    const cur = bySite.get(a.siteId) ?? { n: 0, max: 0 };
    bySite.set(a.siteId, { n: cur.n + 1, max: Math.max(cur.max, a.impact ?? 0) });
  }
  return {
    sites: {
      count: sites.length,
      site: sites.map(s => ({
        id: s.siteId,
        name: s.name,
        status: v1Status(s.activationStatus),
        peakPower: s.peakPower,
        installationDate: s.installationDate ? s.installationDate.slice(0, 10) : null,
        ptoDate: null, // not in v2
        notes: s.note ?? '',
        alertQuantity: bySite.get(s.siteId)?.n ?? 0,
        highestImpact: bySite.get(s.siteId)?.max ?? 0,
        location: {
          country: s.location?.country ?? '',
          state: s.location?.state ?? '',
          city: s.location?.city ?? '',
          address: s.location?.address ?? '',
          zip: s.location?.zip ?? '',
        },
      })),
    },
  };
}

const sum = (e: V2Energy) => e.values.reduce((t, v) => t + (v.value ?? 0), 0);
const last = (e: V2Energy) => e.values.at(-1)?.value ?? 0;

// yearly: resolution=YEAR since 2000. daily: resolution=DAY since the 1st of this month.
export function toV1Overview(yearly: V2Energy, daily: V2Energy) {
  return {
    overview: {
      lifeTimeData:  { energy: sum(yearly) },
      lastYearData:  { energy: last(yearly) },
      lastMonthData: { energy: sum(daily) },
      lastDayData:   { energy: last(daily) },
    },
  };
}

export function toV1Details(s: V2Site) {
  return {
    details: {
      id: s.siteId,
      name: s.name,
      accountId: s.accountId,
      status: v1Status(s.activationStatus),
      peakPower: s.peakPower,
      installationDate: s.installationDate ? s.installationDate.slice(0, 10) : null,
      lastUpdateTime: s.lastUpdateTime,
      location: { ...s.location, lat: s.location?.latitude, lng: s.location?.longitude },
    },
  };
}

export function toV1Energy(e: V2Energy, timeUnit: string) {
  return {
    energy: {
      timeUnit,
      unit: 'Wh',
      values: e.values.map(v => ({ date: v.timestamp, value: v.value })),
    },
  };
}

// v1 took local dates (YYYY-MM-DD); v2 wants UTC instants and buckets by the
// site's local day. ponytail: noon UTC lands on the same local date for any
// site between UTC-11 and UTC+11, which covers the Americas fleet.
export function energyRange(startDate: string, endDate: string, timeUnit: string) {
  return new URLSearchParams({
    from: `${startDate}T12:00:00Z`,
    to: `${endDate}T23:59:59Z`,
    resolution: (timeUnit || 'DAY').toUpperCase(),
  });
}

// ── upstream ──────────────────────────────────────────────────────────────────

class Upstream extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function v2(apiKey: string, path: string, params?: URLSearchParams): Promise<any> {
  const res = await fetch(`${V2}${path}${params ? `?${params}` : ''}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Upstream(res.status, body?.detail || body?.title || `SolarEdge ${res.status}`);
  return body;
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

// ponytail: per-instance memo, not shared across cold starts. It stops one
// user's page load from spending ~21 upstream calls twice in a row; a shared
// store (KV/Supabase) is the upgrade if credit usage says it's needed.
let listMemo: { at: number; body: unknown } | null = null;
const LIST_MEMO_MS = 5 * 60_000;

async function sitesList(apiKey: string) {
  if (listMemo && Date.now() - listMemo.at < LIST_MEMO_MS) return listMemo.body;
  const sites = await allPages<V2Site>(async p =>
    (await v2(apiKey, '/sites', new URLSearchParams({ page: String(p) }))).sites?.site ?? []);
  const alerts = await allPages<V2Alert>(async p => {
    const rows = await v2(apiKey, '/alerts', new URLSearchParams({ page: String(p) }));
    return Array.isArray(rows) ? rows : [];
  });
  const body = toV1SitesList(sites, alerts);
  listMemo = { at: Date.now(), body };
  return body;
}

const SITE_PATH = /^\/site\/(\d+)\/(overview|details|energy|equipment)$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require a signed-in caller BEFORE anything else. This endpoint returns
  // customer names and street addresses for every monitored site and spends the
  // SolarEdge quota on each call; until 2026-08-03 it did both for anyone on the
  // internet. Every client call site already sends the token via authedFetch.
  if (!(await requireUser(req, res))) return;

  // .trim() strips trailing \n that Vercel env-pull can embed in quoted values
  const apiKey = (process.env.SOLAREDGE_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'SolarEdge API key not configured. Set SOLAREDGE_API_KEY.' });
  }

  const q = req.query as Record<string, string>;
  const path = q.path || '/sites/list';
  const site = SITE_PATH.exec(path);
  if (path !== '/sites/list' && !site) {
    return res.status(400).json({ error: `Unsupported SolarEdge path: ${path}` });
  }

  try {
    let body: unknown;
    if (!site) {
      // The first page carries every site; later pages are empty. All five
      // client paging loops stop on count reached or an empty page, so this
      // costs one upstream sweep instead of one per client page.
      body = Number(q.startIndex || 0) > 0
        ? { sites: { count: 0, site: [] } }
        : await sitesList(apiKey);
    } else {
      const [, id, kind] = site;
      if (kind === 'details') {
        body = toV1Details(await v2(apiKey, `/sites/${id}`));
      } else if (kind === 'equipment') {
        body = { devices: await v2(apiKey, `/sites/${id}/devices`) };
      } else if (kind === 'energy') {
        const today = new Date().toISOString().slice(0, 10);
        body = toV1Energy(
          await v2(apiKey, `/sites/${id}/energy`, energyRange(q.startDate || today, q.endDate || today, q.timeUnit)),
          (q.timeUnit || 'DAY').toUpperCase(),
        );
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const [yearly, daily] = await Promise.all([
          v2(apiKey, `/sites/${id}/energy`, energyRange('2000-01-01', today, 'YEAR')),
          v2(apiKey, `/sites/${id}/energy`, energyRange(`${today.slice(0, 8)}01`, today, 'DAY')),
        ]);
        body = toV1Overview(yearly, daily);
      }
    }

    // SolarEdge monitoring data is org-wide (identical for every staff user), so
    // cache at the shared CDN edge (s-maxage) to protect the credit budget.
    const cacheSecs = getCacheDuration(path);
    res.setHeader('Cache-Control', `public, max-age=${cacheSecs}, s-maxage=${cacheSecs}, stale-while-revalidate=${cacheSecs}`);
    return res.status(200).json(body);
  } catch (err) {
    if (err instanceof Upstream) {
      if (err.status === 429) {
        return res.status(429).json({ error: 'SolarEdge rate limit hit (25 calls/minute or monthly credits). Try again shortly.' });
      }
      if (err.status === 401 || err.status === 403) {
        return res.status(403).json({ error: `SolarEdge denied the request: ${err.message}` });
      }
      return res.status(err.status >= 500 ? 502 : err.status).json({ error: `SolarEdge: ${err.message}` });
    }
    console.error('[SolarEdge proxy] upstream error:', err);
    return res.status(502).json({ error: 'Could not reach SolarEdge API. Check network connectivity.' });
  }
}
