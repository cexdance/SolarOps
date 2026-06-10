// Map of work-order locations. Geocodes each job address (free OSM/Nominatim
// via the shared validateAddress helper, results cached in localStorage so we
// only pay the rate-limited lookup once) and plots colored pins on an
// OpenStreetMap base layer. A side panel lists the stops in schedule order.
//
// The "Optimize route" action is the integration point for the next version:
// an agent will call the Google Maps Routes API
// (https://developers.google.com/maps/documentation/routes) to order the stops
// and assign a technician. It is intentionally disabled here.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Sparkles, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { ViewJob, fullAddress } from './jobViewTypes';
import { validateAddress } from '../../lib/addressValidator';

interface JobMapViewProps {
  jobs: ViewJob[];
  onOpen: (id: string) => void;
}

interface Coord { lat: number; lon: number }

const COORD_CACHE_KEY = 'solarops_geocode_cache';
const PRIORITY_HEX: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', normal: '#3b82f6', low: '#94a3b8',
};

function loadCoordCache(): Record<string, Coord> {
  try { return JSON.parse(localStorage.getItem(COORD_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveCoordCache(cache: Record<string, Coord>) {
  try { localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota - ignore */ }
}

// Colored teardrop pin so we never depend on Leaflet's (bundler-broken) default
// marker images and can encode priority by color.
function pinIcon(hex: string): L.DivIcon {
  return L.divIcon({
    className: 'solarops-pin',
    html: `<div style="background:${hex};width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -16],
  });
}

// Fit the map to all plotted pins whenever the set of coordinates changes.
const FitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 12); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
};

const JobMapView: React.FC<JobMapViewProps> = ({ jobs, onOpen }) => {
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [failed, setFailed] = useState(0);
  const cacheRef = useRef<Record<string, Coord>>(loadCoordCache());

  // Geocode every job address that we do not already have a coordinate for.
  // Sequential so we stay within Nominatim's ~1 req/sec policy; cached results
  // resolve instantly. Pins appear as each lookup resolves.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cache = cacheRef.current;
      const resolved: Record<string, Coord> = {};
      let fails = 0;

      // Seed from cache first so cached jobs render immediately.
      for (const j of jobs) {
        const key = fullAddress(j).toLowerCase();
        if (key && cache[key]) resolved[j.id] = cache[key];
      }
      if (!cancelled) setCoords({ ...resolved });

      const pending = jobs.filter(j => {
        const key = fullAddress(j).toLowerCase();
        return key && !cache[key];
      });
      if (pending.length === 0) { setFailed(0); return; }

      setGeocoding(true);
      for (const j of pending) {
        if (cancelled) return;
        const key = fullAddress(j).toLowerCase();
        try {
          const r = await validateAddress({ address: j.address, city: j.city, state: j.state, zip: j.zip });
          const lat = r.normalized?.lat, lon = r.normalized?.lon;
          if (typeof lat === 'number' && typeof lon === 'number') {
            cache[key] = { lat, lon };
            resolved[j.id] = { lat, lon };
            if (!cancelled) setCoords({ ...resolved });
          } else {
            fails++;
          }
        } catch {
          fails++;
        }
        if (!cancelled) setFailed(fails);
      }
      saveCoordCache(cache);
      if (!cancelled) setGeocoding(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [jobs]);

  const points = useMemo<[number, number][]>(
    () => Object.values(coords).map(c => [c.lat, c.lon]),
    [coords],
  );

  // Schedule order = the working "route" until the optimizer ships.
  const orderedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const ka = `${a.scheduledDate ?? ''}${a.scheduledTime ?? ''}`;
      const kb = `${b.scheduledDate ?? ''}${b.scheduledTime ?? ''}`;
      return ka.localeCompare(kb);
    });
  }, [jobs]);

  const located = Object.keys(coords).length;

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
      {/* Map */}
      <div className="relative flex-1 min-h-[280px]">
        <MapContainer center={[27.6648, -81.5158]} zoom={6} className="h-full w-full" style={{ background: '#e8eef0' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {jobs.map(job => {
            const c = coords[job.id];
            if (!c) return null;
            return (
              <Marker key={job.id} position={[c.lat, c.lon]} icon={pinIcon(PRIORITY_HEX[job.priority] ?? '#3b82f6')}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold text-slate-900">{job.title}</p>
                    <p className="text-xs text-slate-500">{fullAddress(job)}</p>
                    <p className="text-xs mt-1"><span className="font-semibold">{job.statusLabel}</span>{job.serviceType ? ` - ${job.serviceType}` : ''}</p>
                    <button onClick={() => onOpen(job.id)} className="mt-1.5 text-xs font-semibold text-orange-600 hover:underline cursor-pointer">
                      Open work order
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Geocode status pill */}
        {(geocoding || failed > 0) && (
          <div className="absolute top-3 left-3 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1.5 text-xs flex items-center gap-2">
            {geocoding && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />}
            {geocoding ? <span className="text-slate-600">Locating addresses... {located}/{jobs.length}</span>
              : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{failed} address{failed !== 1 ? 'es' : ''} not located</span>}
          </div>
        )}
      </div>

      {/* Route panel */}
      <div className="lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col max-h-[40vh] lg:max-h-none">
        <div className="p-3 border-b border-slate-200">
          <button
            disabled
            title="Coming next version: an agent will optimize this route via the Google Maps Routes API and assign a technician."
            className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-400 rounded-lg py-2 text-sm font-semibold cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            Optimize route (coming soon)
          </button>
          <p className="text-[11px] text-slate-400 mt-1.5 text-center">
            {located} of {jobs.length} stops located
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {orderedJobs.map((job, i) => {
            const hasCoord = !!coords[job.id];
            return (
              <button
                key={job.id}
                onClick={() => onOpen(job.id)}
                className="w-full text-left flex items-start gap-2 rounded-lg border border-slate-200 hover:border-orange-300 p-2 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{job.title}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                    {hasCoord ? <MapPin className="w-3 h-3 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-500" />}
                    {job.city}{job.state ? `, ${job.state}` : ''}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{job.scheduledTime ?? ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default JobMapView;
