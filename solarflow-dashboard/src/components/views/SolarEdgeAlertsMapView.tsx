// Map of SolarEdge sites with active alerts. Geocodes each site's address
// (shared Nominatim cache with JobMapView/SiteMapView, so addresses already
// looked up elsewhere resolve instantly) and plots a pin per alerted site,
// colored by highest alert impact.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { SolarEdgeSite } from '../../lib/solarEdgeSites';
import { geocodeAddress } from '../../lib/addressValidator';

interface Props {
  sites: SolarEdgeSite[];
  alertOverrides: Map<string, { count: number; impact: string }>;
  ackedSites: Set<string>;
  onOpenSite: (site: SolarEdgeSite) => void;
  onAckAlert: (siteId: string) => void;
}

interface Coord { lat: number; lon: number }

const COORD_CACHE_KEY = 'solarops_geocode_cache';
function loadCoordCache(): Record<string, Coord> {
  try { return JSON.parse(localStorage.getItem(COORD_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveCoordCache(cache: Record<string, Coord>) {
  try { localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota - ignore */ }
}

// Same palette as the table's alert badge (monitoringColumns.tsx IMPACT_COLORS).
const IMPACT_HEX: Record<string, string> = {
  '0': '#94a3b8', '1': '#3b82f6', '2': '#eab308', '3': '#f97316', '4': '#dc2626', '5': '#b91c1c', '6': '#7f1d1d',
};

function pinIcon(hex: string, acked: boolean): L.DivIcon {
  const size = 26;
  return L.divIcon({
    className: 'solarops-pin',
    html: `<div style="background:${acked ? '#94a3b8' : hex};width:${size}px;height:${size}px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);opacity:${acked ? 0.55 : 1}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

const InvalidateOnResize: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const t = setTimeout(() => map.invalidateSize(), 350);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [map]);
  return null;
};

const FitBounds: React.FC<{ points: [number, number][]; sig: string }> = ({ points, sig }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 13); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sig]);
  return null;
};

export const SolarEdgeAlertsMapView: React.FC<Props> = ({ sites, alertOverrides, ackedSites, onOpenSite, onAckAlert }) => {
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [failed, setFailed] = useState(0);
  const cacheRef = useRef<Record<string, Coord>>(loadCoordCache());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cache = cacheRef.current;
      const resolved: Record<string, Coord> = {};
      for (const s of sites) {
        const key = s.address.toLowerCase();
        if (key && cache[key]) resolved[s.siteId] = cache[key];
      }
      if (!cancelled) setCoords({ ...resolved });

      const pending = sites.filter(s => {
        const key = s.address.toLowerCase();
        return key && !cache[key];
      });
      if (pending.length === 0) { setFailed(0); return; }

      setGeocoding(true);
      let fails = 0;
      for (const s of pending) {
        if (cancelled) return;
        const key = s.address.toLowerCase();
        try {
          const coord = await geocodeAddress({ address: s.address });
          if (coord) {
            cache[key] = coord;
            resolved[s.siteId] = coord;
            if (!cancelled) setCoords({ ...resolved });
          } else { fails++; }
        } catch { fails++; }
        if (!cancelled) setFailed(fails);
      }
      saveCoordCache(cache);
      if (!cancelled) setGeocoding(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [sites]);

  const points = useMemo<[number, number][]>(
    () => sites.map(s => coords[s.siteId]).filter((c): c is Coord => !!c).map(c => [c.lat, c.lon]),
    [sites, coords],
  );
  const boundsSig = useMemo(() => sites.map(s => (coords[s.siteId] ? s.siteId : '')).join('|'), [sites, coords]);
  const located = sites.filter(s => coords[s.siteId]).length;

  return (
    <div className="relative bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: 560 }}>
      <MapContainer center={[27.6648, -81.5158]} zoom={6} className="h-full w-full" style={{ background: '#e8eef0' }}>
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={points} sig={boundsSig} />
        <InvalidateOnResize />
        {sites.map(site => {
          const c = coords[site.siteId];
          if (!c) return null;
          const ov = alertOverrides.get(site.siteId);
          const count = ov?.count ?? site.alerts;
          const impact = ov?.impact ?? site.highestImpact;
          const acked = ackedSites.has(site.siteId);
          return (
            <Marker key={site.siteId} position={[c.lat, c.lon]} icon={pinIcon(IMPACT_HEX[impact] ?? '#dc2626', acked)}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 !m-0">{site.clientId || site.siteName}</p>
                  <p className="text-xs text-slate-500 !mt-1 !mb-0">{site.address}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-white whitespace-nowrap ${acked ? 'bg-slate-400' : ''}`}
                      style={acked ? undefined : { background: IMPACT_HEX[impact] ?? '#dc2626' }}>
                      {count} alert{count !== 1 ? 's' : ''}{acked ? ' (acked)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button onClick={() => onOpenSite(site)} className="text-xs font-semibold text-orange-600 hover:underline cursor-pointer">Open</button>
                    <button onClick={() => onAckAlert(site.siteId)} className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer">
                      {acked ? 'Unacknowledge' : 'Acknowledge'}
                    </button>
                    <a
                      href={`https://monitoring.solaredge.com/monitoring/site/${site.siteId}/alerts`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> SolarEdge
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {sites.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm bg-white/80">
          No sites with active alerts match your filters.
        </div>
      )}

      {(geocoding || failed > 0) && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1.5 text-xs flex items-center gap-2">
          {geocoding && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />}
          {geocoding
            ? <span className="text-slate-600">Locating addresses... {located}/{sites.length}</span>
            : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{failed} address{failed !== 1 ? 'es' : ''} not located</span>}
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 rounded-lg shadow px-2.5 py-2 text-[10px] text-slate-600 flex items-center gap-1.5">
        <MapPin className="w-3 h-3 text-orange-500" />
        {located} of {sites.length} alerted sites located
      </div>
    </div>
  );
};
