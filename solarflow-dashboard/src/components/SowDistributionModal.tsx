/**
 * SOW Distribution Report — v2 (Professional A4 redesign)
 *
 * Clean, print-ready Scope-of-Work completion report.
 * Auto-triggered when a Work Order is marked "completed".
 * Distributed to the SOW list (Anthony Lopez, Daniel Matos, Cesar Jurado)
 * via @mention notifications.
 *
 * Sections:
 *   1. Header — company logo bar + WO# + completion date
 *   2. Job Details — client, address, service type, dates
 *   3. Manpower — contractor, hours, travel
 *   4. Weather — real weather from Open-Meteo for service date
 *   5. Work Order Notes — job.notes before photos
 *   6. Photos — by category (empty categories skipped)
 *   7. Field Notes — contractor completionNotes
 *   8. Service Report — admin serviceReport
 *   9. Next Steps
 *
 * Print: targets A4 via @page CSS injected in component.
 */

import React, { useEffect, useState } from 'react';
import {
  X, FileText, MapPin, Calendar, Clock,
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Wind,
  AlertTriangle, CheckCircle, Briefcase, FileCheck, ChevronRight,
} from 'lucide-react';
import { Job, WOPhoto } from '../types';
import { Contractor } from '../types/contractor';
import { MentionUser } from './ui/MentionTextarea';

// ── Constants ─────────────────────────────────────────────────────────────────

export const SOW_DISTRIBUTION_NAMES = ['Anthony Lopez', 'Daniel Matos', 'Cesar Jurado'];

const PHOTO_CATEGORIES: WOPhoto['category'][] = ['before', 'after', 'process', 'serial', 'parts'];
const PHOTO_CATEGORY_LABELS: Record<WOPhoto['category'], string> = {
  before:  'Before',
  after:   'After',
  process: 'In Progress',
  serial:  'Serial Numbers',
  parts:   'Parts / Equipment',
};
const CATEGORY_COLOR: Record<WOPhoto['category'], string> = {
  before:  '#3b82f6',
  after:   '#10b981',
  process: '#f59e0b',
  serial:  '#8b5cf6',
  parts:   '#64748b',
};

// ── WMO Weather Code → label + icon ──────────────────────────────────────────

function weatherFromCode(code: number, tempMaxF: number, tempMinF: number, precipIn: number, windMph: number): {
  label: string;
  detail: string;
  icon: React.ReactNode;
  warning: boolean;
} {
  let label = 'Clear';
  let Icon = Sun;
  let warning = false;

  if (code === 0)             { label = 'Clear Sky';         Icon = Sun; }
  else if (code <= 3)         { label = 'Partly Cloudy';     Icon = Cloud; }
  else if (code <= 48)        { label = 'Fog / Haze';        Icon = Cloud; warning = true; }
  else if (code <= 67)        { label = 'Rain';              Icon = CloudRain; warning = true; }
  else if (code <= 77)        { label = 'Snow';              Icon = CloudSnow; warning = true; }
  else if (code <= 82)        { label = 'Rain Showers';      Icon = CloudRain; warning = true; }
  else if (code <= 86)        { label = 'Snow Showers';      Icon = CloudSnow; warning = true; }
  else if (code >= 95)        { label = 'Thunderstorm';      Icon = CloudLightning; warning = true; }

  const detail = `High ${tempMaxF}°F · Low ${tempMinF}°F · Wind ${windMph} mph${precipIn > 0 ? ` · Precip ${precipIn.toFixed(2)}"` : ''}`;

  return { label, detail, icon: <Icon className="w-5 h-5" />, warning };
}

// ── Open-Meteo weather fetch ──────────────────────────────────────────────────

interface WeatherResult {
  label: string;
  detail: string;
  icon: React.ReactNode;
  warning: boolean;
  date: string;
}

async function fetchWeatherForDate(address: string, dateISO: string): Promise<WeatherResult | null> {
  try {
    // Extract date portion (YYYY-MM-DD)
    const date = dateISO.split('T')[0];

    // Step 1: Geocode address using Nominatim
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'SolarOps/1.0' } });
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json();
    if (!geoData?.[0]) return null;

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    // Step 2: Fetch historical weather from Open-Meteo archive
    const wUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`;
    const wRes = await fetch(wUrl);
    if (!wRes.ok) return null;
    const wData = await wRes.json();

    const daily = wData?.daily;
    if (!daily?.weathercode?.[0] == null) return null;

    const code       = daily.weathercode[0] ?? 0;
    const tempMax    = daily.temperature_2m_max[0] ?? 0;
    const tempMin    = daily.temperature_2m_min[0] ?? 0;
    const precip     = daily.precipitation_sum[0] ?? 0;
    const wind       = daily.windspeed_10m_max[0] ?? 0;

    const result = weatherFromCode(code, tempMax, tempMin, precip, wind);
    return { ...result, date };
  } catch {
    return null;
  }
}

// ── Keywords that suggest contractor noted weather issues ──────────────────────
const WEATHER_KEYWORDS = ['rain', 'wind', 'storm', 'thunder', 'lightning', 'cloud', 'hot',
  'cold', 'humid', 'heat', 'flood', 'wet', 'delay', 'weather'];

function hasWeatherContent(text?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return WEATHER_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  job: Job;
  siteName: string;
  siteAddress?: string;
  customer?: { name?: string; email?: string };
  contractors?: Contractor[];
  technicians?: { id: string; name: string }[];
  users?: MentionUser[];
  onClose: () => void;
}

// ── Section wrapper ───────────────────────────────────────────────────────────

const Section: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode; accent?: boolean }> = ({
  label, icon, children, accent,
}) => (
  <div className="sow-section space-y-3">
    <div className="flex items-center gap-2.5">
      {icon && <span className="text-orange-500">{icon}</span>}
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <div className={`flex-1 h-px ${accent ? 'bg-orange-200' : 'bg-slate-150'}`} style={{ background: accent ? '#fed7aa' : '#e8ecf0' }} />
    </div>
    {children}
  </div>
);

// ── Info row ──────────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value?: string | React.ReactNode; mono?: boolean; wide?: boolean }> = ({
  label, value, mono, wide,
}) => (
  value ? (
    <div className="flex gap-3 items-baseline">
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide shrink-0" style={{ width: wide ? '7rem' : '5.5rem' }}>
        {label}
      </span>
      <span className={`text-[11px] text-slate-800 flex-1 leading-snug ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  ) : null
);

// ── Print styles injected as <style> ─────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  @page {
    size: A4 portrait;
    margin: 16mm 18mm 18mm 18mm;
  }
  body * { visibility: hidden !important; }
  #sow-dist-print-area, #sow-dist-print-area * { visibility: visible !important; }
  #sow-dist-print-area {
    position: fixed !important;
    inset: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    background: white !important;
  }
  .sow-toolbar { display: none !important; }
  .sow-section { break-inside: avoid; }
  .sow-photo-grid { break-inside: avoid; }
  img { break-inside: avoid; }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

export const SowDistributionModal: React.FC<Props> = ({
  job,
  siteName,
  siteAddress,
  customer,
  contractors = [],
  technicians = [],
  onClose,
}) => {
  const [weather, setWeather] = useState<WeatherResult | null | 'loading'>('loading');

  const woPhotos      = job.woPhotos ?? [];
  const contractor    = contractors.find(c => c.id === job.contractorId);

  const contractorLabel = [contractor?.contactName, contractor?.businessName]
    .filter(Boolean).join(' · ') || null;

  // Weather fetch on mount
  const addressForGeo = siteAddress || job.siteAddress || '';
  const weatherDate   = job.scheduledDate || job.completedAt || '';

  useEffect(() => {
    if (!addressForGeo || !weatherDate) {
      setWeather(null);
      return;
    }
    setWeather('loading');
    fetchWeatherForDate(addressForGeo, weatherDate).then(result => {
      setWeather(result);
    });
  }, [addressForGeo, weatherDate]);

  // Photos grouped by category
  const photoGroups = PHOTO_CATEGORIES
    .map(cat => ({ cat, photos: woPhotos.filter(p => p.category === cat) }))
    .filter(g => g.photos.length > 0);

  // Contractor notes (completion notes)
  const contractorNotes = job.completionNotes ?? '';
  const contractorHasWeather = hasWeatherContent(contractorNotes);

  // Dates
  const scheduledLabel = formatDate(job.scheduledDate);
  const completedLabel = job.completedAt ? formatDate(job.completedAt) : formatDate(new Date().toISOString());
  const generatedLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Labor
  const laborHrs  = job.laborHours ? `${job.laborHours} hr${job.laborHours !== 1 ? 's' : ''}` : null;
  const travelLbl = job.travelMiles ? `${job.travelMiles} mi` : null;

  // WO Notes
  const woNotes = job.notes?.trim() || '';

  return (
    <>
      {/* Injected print styles */}
      <style>{PRINT_STYLE}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 print:hidden">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

          {/* ── Toolbar ── */}
          <div className="sow-toolbar flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-slate-900">SOW Completion Report</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">A4 print-ready · auto-generated on completion</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Print / PDF
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* ── Scrollable / printable body ── */}
          <div className="overflow-y-auto print:overflow-visible" id="sow-dist-print-area">
            <div className="p-7 space-y-7">

              {/* ── Letterhead ──────────────────────────────────────── */}
              <div className="flex items-start justify-between gap-4 pb-5 border-b-2 border-slate-900">
                {/* Left: brand */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                  >
                    <span className="text-white font-black text-sm">C</span>
                  </div>
                  <div>
                    <p className="text-base font-black text-slate-900 tracking-tight leading-none">CONEXSOL ENERGY</p>
                    <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-widest mt-0.5">Scope of Work — Completion Report</p>
                  </div>
                </div>

                {/* Right: WO# + date */}
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-slate-900 font-mono">{job.woNumber ?? '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Completed {completedLabel}</p>
                </div>
              </div>

              {/* ── Job Details ─────────────────────────────────────── */}
              <Section label="Job Details" icon={<Briefcase className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                  <Row label="Client"    value={<strong>{siteName || customer?.name || '—'}</strong>} wide />
                  <Row label="WO #"      value={job.woNumber} mono wide />
                  <Row label="Address"   value={siteAddress || job.siteAddress} wide />
                  <Row label="Service"   value={job.serviceType} wide />
                  <Row label="Scheduled" value={scheduledLabel} wide />
                  <Row label="Completed" value={completedLabel} wide />
                </div>
              </Section>

              {/* ── Manpower ──────────────────────────────────────────── */}
              <Section label="Manpower" icon={<FileCheck className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
                  {contractorLabel && <Row label="Contractor" value={contractorLabel} wide />}
                  {laborHrs        && <Row label="Labor"      value={laborHrs} wide />}
                  {travelLbl       && <Row label="Travel"     value={travelLbl} wide />}
                  {!contractorLabel && !laborHrs && (
                    <p className="text-xs text-slate-400 col-span-2">No manpower data recorded.</p>
                  )}
                </div>
              </Section>

              {/* ── Weather ───────────────────────────────────────────── */}
              <Section label="Weather" icon={<Sun className="w-3.5 h-3.5" />}>
                {weather === 'loading' ? (
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-4 h-4 border-2 border-slate-200 border-t-orange-400 rounded-full animate-spin" />
                    <p className="text-xs">Fetching weather for {formatDateShort(weatherDate)}…</p>
                  </div>
                ) : weather ? (
                  <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                    weather.warning
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-sky-50 border-sky-200'
                  }`}>
                    <span className={weather.warning ? 'text-amber-500 mt-0.5' : 'text-sky-500 mt-0.5'}>
                      {weather.icon}
                    </span>
                    <div>
                      <p className={`text-sm font-bold ${weather.warning ? 'text-amber-800' : 'text-sky-800'}`}>
                        {weather.label}
                        {weather.warning && (
                          <span className="ml-2 text-[10px] font-semibold bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded-full uppercase">
                            Weather Event
                          </span>
                        )}
                      </p>
                      <p className={`text-xs mt-0.5 ${weather.warning ? 'text-amber-700' : 'text-sky-700'}`}>
                        {formatDateShort(weatherDate)} · {weather.detail}
                      </p>
                      {contractorHasWeather && (
                        <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Contractor also reported weather-related conditions
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-600 font-medium">Weather data unavailable</p>
                      <p className="text-[10px] text-slate-400">Service date: {formatDateShort(weatherDate)}</p>
                      {contractorHasWeather && (
                        <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Contractor reported weather conditions in field notes
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </Section>

              {/* ── Work Order Notes ─────────────────────────────────── */}
              {woNotes && (
                <Section label="Work Order Notes" icon={<FileText className="w-3.5 h-3.5" />}>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{woNotes}</p>
                  </div>
                </Section>
              )}

              {/* ── Photos by category ────────────────────────────────── */}
              {photoGroups.length > 0 && (
                <Section label={`Photos (${woPhotos.length} total)`} icon={<MapPin className="w-3.5 h-3.5" />}>
                  <div className="space-y-5">
                    {photoGroups.map(({ cat, photos }) => (
                      <div key={cat} className="sow-photo-grid">
                        {/* Category header */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: CATEGORY_COLOR[cat] }}
                          />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            {PHOTO_CATEGORY_LABELS[cat]}
                            <span className="ml-2 font-normal text-slate-400">({photos.length})</span>
                          </p>
                          <div className="flex-1 h-px bg-slate-100" />
                        </div>

                        {/* Photo grid */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {photos.map(photo => (
                            <div
                              key={photo.id}
                              className="aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm"
                            >
                              <img
                                src={photo.storageUrl ?? photo.dataUrl}
                                alt={photo.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Contractor Field Notes ───────────────────────────── */}
              {contractorNotes.trim() && (
                <Section label="Contractor Field Notes" icon={<ChevronRight className="w-3.5 h-3.5" />}>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{contractorNotes.trim()}</p>
                  </div>
                </Section>
              )}

              {/* ── Service Report ───────────────────────────────────── */}
              {job.serviceReport?.trim() && (
                <Section label="Service Report" icon={<FileCheck className="w-3.5 h-3.5" />}>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{job.serviceReport.trim()}</p>
                  </div>
                </Section>
              )}

              {/* ── Next Steps ───────────────────────────────────────── */}
              {job.nextSteps?.trim() && (
                <Section label="Next Steps" icon={<AlertTriangle className="w-3.5 h-3.5" />} accent>
                  <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-800 whitespace-pre-wrap leading-relaxed">{job.nextSteps.trim()}</p>
                  </div>
                </Section>
              )}

              {/* ── Footer ──────────────────────────────────────────── */}
              <div className="pt-5 border-t-2 border-slate-900 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  <p className="text-xs font-bold">Work Order Completed</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                    Conexsol Energy · Generated {generatedLabel}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Print-only version (no modal chrome) ── */}
      <div className="hidden print:block" id="sow-print-page" aria-hidden>
        {/* This is intentionally empty — the @media print CSS targets #sow-dist-print-area above */}
      </div>
    </>
  );
};
