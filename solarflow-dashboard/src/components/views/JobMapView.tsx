// Map of work-order locations. Geocodes each job address (free OSM/Nominatim
// via the shared validateAddress helper, results cached in localStorage so we
// only pay the rate-limited lookup once) and plots colored pins on an
// OpenStreetMap base layer.
//
// Features:
//  - Status filter (defaults to Active) so dispatch sees live work only.
//  - Two-way highlight: hovering a list row highlights its pin and vice-versa.
//  - Multi-select work orders (checkbox / pin click) to build a route, with a
//    "selected only" focus toggle.
//  - Optional primary action (e.g. dispatch "Assign to contractor") that
//    receives the selected ids; the contractor side just uses selection +
//    focus to show the orders it cares about.
//
// The "Optimize route" action is the integration point for the next version: an
// agent will call the Google Maps Routes API
// (https://developers.google.com/maps/documentation/routes) to order the stops
// and assign a technician. It is intentionally disabled here.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Sparkles, MapPin, Loader2, AlertTriangle, Filter, CheckSquare } from 'lucide-react';
import { ViewJob, fullAddress } from './jobViewTypes';
import { geocodeAddress } from '../../lib/addressValidator';

interface JobMapViewProps {
  jobs: ViewJob[];
  onOpen: (id: string) => void;
  /** Enable multi-select of work orders (checkboxes + selectable pins). */
  selectable?: boolean;
  /** Optional primary action over the current selection (e.g. assign to contractor). */
  primaryAction?: { label: string; onClick: (selectedIds: string[]) => void };
}

interface Coord { lat: number; lon: number }

const COORD_CACHE_KEY = 'solarops_geocode_cache';
// Priority → pin color. Red = top priority, yellow = lowest, warm ramp between.
const PRIORITY_HEX: Record<string, string> = {
  critical: '#dc2626', high: '#f97316', normal: '#f59e0b', low: '#facc15',
};
const PRIORITY_LEGEND: Array<{ label: string; hex: string }> = [
  { label: 'Critical', hex: PRIORITY_HEX['critical'] ?? '#dc2626' },
  { label: 'High',     hex: PRIORITY_HEX['high'] ?? '#f97316' },
  { label: 'Medium',   hex: PRIORITY_HEX['normal'] ?? '#f59e0b' },
  { label: 'Low',      hex: PRIORITY_HEX['low'] ?? '#facc15' },
];

// Service type → pin glyph so the map reads at a glance. Order matters: the
// first match wins, so more specific kinds are checked before broader ones
// ("Inverter Change with initial site visit" must read as inverter, not site
// visit; "Site visit - Roof/Home Run Inspection" must read as roof).
type ServiceKind = 'optimizer' | 'inverter' | 'battery' | 'roof' | 'inspection' | 'site_visit' | 'other';
function serviceKind(serviceType?: string): ServiceKind {
  const s = (serviceType ?? '').toLowerCase();
  if (s.includes('optimizer') || s.includes('microinverter')) return 'optimizer';
  if (s.includes('battery')) return 'battery';
  if (s.includes('roof') || s.includes('home run') || s.includes('reroof')) return 'roof';
  if (s.includes('inverter') || s.includes('commission')) return 'inverter';
  if (s.includes('inspection') || s.includes('quick review') || s.includes('simple')) return 'inspection';
  if (s.includes('site visit') || s.includes('site_visit') || s.includes('communication') || s.includes('transfer') || s.includes('site')) return 'site_visit';
  return 'other';
}

// White inline-SVG glyphs drawn inside the colored pin disc. Styled to echo the
// reference set (power optimizer, inverter, roof, clipboard, multimeter) while
// keeping our flat white-stroke look.
const GLYPH_SVG: Record<ServiceKind, string> = {
  // Power optimizer: TO-220-style component, body + leg nub + three legs.
  optimizer:  '<rect x="7" y="3.5" width="10" height="9" rx="1.2"/><path d="M12 3.5V2"/><path d="M9.5 12.5v7.5M12 12.5v7.5M14.5 12.5v7.5"/>',
  // Inverter: enclosure with the DC→AC diagonal and a small sine wave.
  inverter:   '<rect x="3.5" y="3.5" width="17" height="17" rx="2.2"/><path d="M18.5 5.5 5.5 18.5"/><path d="M5.5 15.4c1 0 1-1.8 2-1.8s1 1.8 2 1.8"/>',
  // Battery storage.
  battery:    '<rect x="2.5" y="7.5" width="15" height="9" rx="2"/><path d="M20.5 11v2"/><path d="M6 11v2M9.5 11v2"/>',
  // Roof visit: house with a small hammer.
  roof:       '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.2V20h13V10.2"/><path d="M13.2 8.6h3.4v2.4h-3.4z"/><path d="M14.9 11 11 15.2"/>',
  // Inspection: clipboard with a checklist.
  inspection: '<rect x="6" y="4.5" width="12" height="15.5" rx="2"/><rect x="9" y="2.8" width="6" height="3" rx="1"/><path d="M9.5 10.2h5M9.5 13.6h5M9.5 17h3"/>',
  // Site visit / communications: a multimeter (dial + two probe leads).
  site_visit: '<rect x="3" y="4.5" width="11" height="13" rx="2"/><circle cx="8.5" cy="9.5" r="1.9"/><path d="M7.6 14.4h1.8"/><path d="M15 8.2l4.6 2.2M15 12l4.6 2.2"/>',
  // Generic service: wrench.
  other:      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
};
const SERVICE_LEGEND: Array<{ kind: ServiceKind; label: string }> = [
  { kind: 'optimizer',  label: 'Optimizer' },
  { kind: 'inverter',   label: 'Inverter' },
  { kind: 'battery',    label: 'Battery' },
  { kind: 'roof',       label: 'Roof Visit' },
  { kind: 'inspection', label: 'Inspection' },
  { kind: 'site_visit', label: 'Site Visit' },
  { kind: 'other',      label: 'Other' },
];
function glyphSvg(kind: ServiceKind, px: number, stroke = '#fff'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPH_SVG[kind]}</svg>`;
}

// A status counts as "inactive" (hidden under the Active filter) when it reads
// as a terminal state. Matched loosely so it works for both the contractor
// statuses (completed/cancelled) and staff statuses (closed/paid/invoiced).
function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase();
  return !/(complet|cancel|closed|paid|invoic|archiv|reject)/.test(s);
}

function loadCoordCache(): Record<string, Coord> {
  try { return JSON.parse(localStorage.getItem(COORD_CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function saveCoordCache(cache: Record<string, Coord>) {
  try { localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota - ignore */ }
}

// Colored disc pin with a white service-type glyph inside. Color = priority,
// glyph = service kind, so the map reads at a glance. Selected pins get an
// emerald ring; the highlighted pin grows and gets a dark border. Never depends
// on Leaflet's (bundler-broken) default marker images.
function pinIcon(hex: string, kind: ServiceKind, opts: { selected: boolean; highlighted: boolean }): L.DivIcon {
  const size = opts.highlighted ? 34 : 26;
  const glyph = Math.round(size * 0.58);
  const border = opts.highlighted ? '3px solid #0f172a' : '2px solid #fff';
  const ring = opts.selected ? 'box-shadow:0 0 0 3px #10b981, 0 1px 3px rgba(0,0,0,.4);' : 'box-shadow:0 1px 3px rgba(0,0,0,.4);';
  return L.divIcon({
    className: 'solarops-pin',
    html: `<div style="background:${hex};width:${size}px;height:${size}px;border-radius:50%;border:${border};${ring}display:flex;align-items:center;justify-content:center;">${glyphSvg(kind, glyph)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

// Leaflet sizes its tile grid once at mount. On mobile the container often
// mounts at 0 height (flex layout settles late), leaving the map a blank gray
// box. Re-measure on any container resize and once shortly after mount.
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

// Fit the map to the given pins. Keyed on a stable signature so it only refits
// when the visible set changes - not on every hover/selection.
const FitBounds: React.FC<{ points: [number, number][]; sig: string }> = ({ points, sig }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 12); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sig]);
  return null;
};

const JobMapView: React.FC<JobMapViewProps> = ({ jobs, onOpen, selectable = true, primaryAction }) => {
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [failed, setFailed] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const cacheRef = useRef<Record<string, Coord>>(loadCoordCache());
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Distinct statuses present, for the filter chips.
  const statuses = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jobs) if (!m.has(j.status)) m.set(j.status, j.statusLabel);
    return [...m.entries()];
  }, [jobs]);

  // Jobs after the status filter only. Geocoding keys off this set so we never
  // pay the rate-limited lookup for orders the user has filtered out, and so
  // selecting orders never re-triggers geocoding.
  const statusFilteredJobs = useMemo(() => {
    if (statusFilter === 'active') return jobs.filter(j => isActiveStatus(j.status));
    if (statusFilter === 'all') return jobs;
    return jobs.filter(j => j.status === statusFilter);
  }, [jobs, statusFilter]);

  // Geocode each visible job address we do not already have a coordinate for.
  // Sequential to respect Nominatim's ~1 req/sec policy; cached results resolve
  // instantly. Pins appear as each lookup resolves.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cache = cacheRef.current;
      const resolved: Record<string, Coord> = {};
      let fails = 0;
      for (const j of statusFilteredJobs) {
        const key = fullAddress(j).toLowerCase();
        if (key && cache[key]) resolved[j.id] = cache[key];
      }
      if (!cancelled) setCoords({ ...resolved });

      const pending = statusFilteredJobs.filter(j => {
        const key = fullAddress(j).toLowerCase();
        return key && !cache[key];
      });
      if (pending.length === 0) { setFailed(0); return; }

      setGeocoding(true);
      for (const j of pending) {
        if (cancelled) return;
        const key = fullAddress(j).toLowerCase();
        try {
          const coord = await geocodeAddress({ address: j.address, city: j.city, state: j.state, zip: j.zip });
          if (coord) {
            cache[key] = coord;
            resolved[j.id] = coord;
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
  }, [statusFilteredJobs]);

  // Jobs actually rendered: status-filtered, then optional selected-only focus.
  const visibleJobs = useMemo(() => {
    const v = selectedOnly ? statusFilteredJobs.filter(j => selected.has(j.id)) : statusFilteredJobs;
    return [...v].sort((a, b) => {
      const ka = `${a.scheduledDate ?? ''}${a.scheduledTime ?? ''}`;
      const kb = `${b.scheduledDate ?? ''}${b.scheduledTime ?? ''}`;
      return ka.localeCompare(kb);
    });
  }, [statusFilteredJobs, selectedOnly, selected]);

  const points = useMemo<[number, number][]>(
    () => visibleJobs.map(j => coords[j.id]).filter((c): c is Coord => !!c).map(c => [c.lat, c.lon]),
    [visibleJobs, coords],
  );
  const boundsSig = useMemo(
    () => visibleJobs.map(j => (coords[j.id] ? j.id : '')).join('|'),
    [visibleJobs, coords],
  );

  const located = visibleJobs.filter(j => coords[j.id]).length;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Clicking a pin highlights it and scrolls the matching list row into view.
  const focusFromPin = (id: string) => {
    setHighlightId(id);
    rowRefs.current[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar: status filter + selection controls */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        {[{ id: 'active', label: 'Active' }, { id: 'all', label: 'All' },
          ...statuses.map(([id, label]) => ({ id, label }))].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setStatusFilter(id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
        {selectable && (
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            {selected.size > 0 && (
              <>
                <button
                  onClick={() => setSelectedOnly(v => !v)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedOnly ? 'bg-emerald-600 text-white' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {selectedOnly ? 'Showing selected' : 'Selected only'}
                </button>
                <button onClick={() => { setSelected(new Set()); setSelectedOnly(false); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer">
                  Clear ({selected.size})
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map */}
        <div className="relative flex-1 min-h-[280px]">
          <MapContainer center={[27.6648, -81.5158]} zoom={6} className="h-full w-full" style={{ background: '#e8eef0' }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBounds points={points} sig={boundsSig} />
            <InvalidateOnResize />
            {visibleJobs.map(job => {
              const c = coords[job.id];
              if (!c) return null;
              return (
                <Marker
                  key={job.id}
                  position={[c.lat, c.lon]}
                  icon={pinIcon(PRIORITY_HEX[job.priority] ?? '#f59e0b', serviceKind(job.serviceType), { selected: selected.has(job.id), highlighted: highlightId === job.id })}
                  eventHandlers={{ click: () => focusFromPin(job.id) }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {job.clientNumber && (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{job.clientNumber}</span>
                        )}
                        <p className="font-semibold text-slate-900 !m-0">{job.title}</p>
                      </div>
                      <p className="text-xs text-slate-500 !mt-1 !mb-0">{fullAddress(job)}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white whitespace-nowrap">{job.statusLabel}</span>
                        {job.priority && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-white whitespace-nowrap capitalize"
                            style={{ background: PRIORITY_HEX[job.priority] ?? '#f59e0b' }}
                          >
                            {job.priority === 'normal' ? 'medium' : job.priority}
                          </span>
                        )}
                        {job.serviceType && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 whitespace-nowrap">{job.serviceType}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <button onClick={() => onOpen(job.id)} className="text-xs font-semibold text-orange-600 hover:underline cursor-pointer">Open</button>
                        {selectable && (
                          <button onClick={() => toggleSelect(job.id)} className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer">
                            {selected.has(job.id) ? 'Remove from route' : 'Add to route'}
                          </button>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Legend: priority colors + service glyphs */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 rounded-lg shadow px-2.5 py-2 max-w-[220px]">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Priority</p>
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
              {PRIORITY_LEGEND.map(p => (
                <span key={p.label} className="flex items-center gap-1 text-[10px] text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full inline-block border border-white shadow-sm" style={{ background: p.hex }} />
                  {p.label}
                </span>
              ))}
            </div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-1 mt-2">Service</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {SERVICE_LEGEND.map(s => (
                <span key={s.kind} className="flex items-center gap-1 text-[10px] text-slate-600">
                  <span
                    className="w-3.5 h-3.5 rounded-full bg-slate-500 inline-flex items-center justify-center flex-shrink-0"
                    dangerouslySetInnerHTML={{ __html: glyphSvg(s.kind, 9) }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {(geocoding || failed > 0) && (
            <div className="absolute top-3 left-3 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1.5 text-xs flex items-center gap-2">
              {geocoding && <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />}
              {geocoding ? <span className="text-slate-600">Locating addresses... {located}/{visibleJobs.length}</span>
                : <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{failed} address{failed !== 1 ? 'es' : ''} not located</span>}
            </div>
          )}
        </div>

        {/* Route / selection panel */}
        <div className="lg:w-80 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col max-h-[40vh] lg:max-h-none">
          <div className="p-3 border-b border-slate-200">
            {primaryAction ? (
              <button
                disabled={selected.size === 0}
                onClick={() => primaryAction.onClick([...selected])}
                className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
                  selected.size === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600 cursor-pointer'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                {primaryAction.label}{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            ) : (
              <button
                disabled
                title="Coming next version: an agent will optimize this route via the Google Maps Routes API and assign a technician."
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-400 rounded-lg py-2 text-sm font-semibold cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                Optimize route (coming soon)
              </button>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              {located} of {visibleJobs.length} stops located{selected.size > 0 ? ` · ${selected.size} selected` : ''}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {visibleJobs.map((job, i) => {
              const hasCoord = !!coords[job.id];
              const isSel = selected.has(job.id);
              const isHi = highlightId === job.id;
              return (
                <div
                  key={job.id}
                  onMouseEnter={() => setHighlightId(job.id)}
                  onMouseLeave={() => setHighlightId(prev => (prev === job.id ? null : prev))}
                  className={`flex items-start gap-2 rounded-lg border p-2 transition-colors ${
                    isHi ? 'border-orange-400 bg-orange-50' : isSel ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'
                  }`}
                >
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSelect(job.id)}
                      className="mt-1 w-4 h-4 accent-emerald-600 flex-shrink-0 cursor-pointer"
                    />
                  )}
                  <button
                    ref={el => { rowRefs.current[job.id] = el; }}
                    onClick={() => onOpen(job.id)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      {job.clientNumber && <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">{job.clientNumber}</span>}
                      <span className="text-sm font-semibold text-slate-900 truncate">{job.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                      {hasCoord ? <MapPin className="w-3 h-3 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-500" />}
                      <span className="truncate">{job.city}{job.state ? `, ${job.state}` : ''}</span>
                      <span>·</span>
                      <span>{job.statusLabel}</span>
                      {job.priority && job.priority !== 'normal' && (
                        <>
                          <span>·</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                            job.priority === 'critical' ? 'bg-red-100 text-red-700' :
                            job.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {job.priority}
                          </span>
                        </>
                      )}
                      {job.serviceType && (
                        <>
                          <span>·</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 whitespace-nowrap">
                            {job.serviceType}
                          </span>
                        </>
                      )}
                    </p>
                  </button>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{job.scheduledTime ?? ''}</span>
                </div>
              );
            })}
            {visibleJobs.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">No work orders match this filter</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobMapView;
