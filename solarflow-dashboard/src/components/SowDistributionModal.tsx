/**
 * SOW Distribution Report
 *
 * Clean, print-ready Scope-of-Work completion report.
 * Auto-triggered when a Work Order is marked "completed".
 * Distributed to the SOW list (Anthony Lopez, Daniel Matos, Cesar Jurado)
 * via @mention notifications.
 *
 * Sections:
 *   1. Header — company + WO# + completion date
 *   2. Job Details — client, address, service type, dates
 *   3. Manpower — tech, contractor, hours, travel
 *   4. Weather — contractor weather notes if present, else "no issues"
 *   5. Photos — by category (empty categories skipped)
 *   6. Field Notes — contractor completionNotes + admin serviceReport + nextSteps
 */

import React from 'react';
import {
  X, FileText, User, MapPin, Calendar, Clock,
  CloudSun, AlertTriangle, CheckCircle,
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
  serial:  'Serial #',
  parts:   'Parts / Equipment',
};
const CATEGORY_COLOR: Record<WOPhoto['category'], string> = {
  before:  'bg-blue-500',
  after:   'bg-emerald-500',
  process: 'bg-amber-500',
  serial:  'bg-violet-500',
  parts:   'bg-slate-500',
};

// Keywords that suggest the contractor noted weather issues
const WEATHER_KEYWORDS = ['rain', 'wind', 'storm', 'thunder', 'lightning', 'cloud', 'hot',
  'cold', 'humid', 'heat', 'flood', 'wet', 'delay', 'weather'];

function hasWeatherContent(text?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return WEATHER_KEYWORDS.some(kw => lower.includes(kw));
}

function extractWeatherLines(text: string): string[] {
  return text.split('\n').filter(line =>
    WEATHER_KEYWORDS.some(kw => line.toLowerCase().includes(kw))
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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

const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2 print:break-inside-avoid">
    <div className="flex items-center gap-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</p>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
    {children}
  </div>
);

// ── Row helper ────────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value?: string | React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  value ? (
    <div className="flex gap-3">
      <span className="text-xs text-slate-400 shrink-0 w-24">{label}</span>
      <span className={`text-xs text-slate-800 flex-1 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  ) : null
);

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
  const woPhotos = job.woPhotos ?? [];
  const contractor = contractors.find(c => c.id === job.contractorId);
  const technician = technicians.find(t => t.id === job.technicianId);

  const contractorLabel = [contractor?.contactName, contractor?.businessName]
    .filter(Boolean).join(' · ') || '—';
  const techLabel = technician?.name || '—';

  // Weather
  const contractorNotes = job.completionNotes ?? '';
  const weatherInNotes  = hasWeatherContent(contractorNotes);
  const weatherLines    = weatherInNotes ? extractWeatherLines(contractorNotes) : [];

  // Photos grouped by category
  const photoGroups = PHOTO_CATEGORIES
    .map(cat => ({ cat, photos: woPhotos.filter(p => p.category === cat) }))
    .filter(g => g.photos.length > 0);

  // Dates
  const scheduledLabel = job.scheduledDate
    ? formatDate(job.scheduledDate)
    : '—';
  const completedLabel = job.completedAt
    ? formatDate(job.completedAt)
    : formatDate(new Date().toISOString());

  // Labor hours
  const laborHrs = job.laborHours
    ? `${job.laborHours} hr${job.laborHours !== 1 ? 's' : ''}`
    : '—';
  const travelLabel = job.travelMiles ? `${job.travelMiles} mi` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 print:p-0 print:inset-auto print:bg-transparent">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col print:shadow-none print:rounded-none print:max-h-none print:max-w-none">

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0 print:hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">SOW Completion Report</h2>
            <p className="text-[11px] text-slate-400">Print or save as PDF · auto-generated on completion</p>
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

        {/* ── Scrollable body ── */}
        <div
          className="overflow-y-auto p-6 space-y-6 print:p-6 print:overflow-visible"
          id="sow-dist-print-area"
        >

          {/* ── Letterhead ─────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-900">
            <div>
              <p className="text-lg font-black text-slate-900 tracking-tight">CONEXSOL ENERGY</p>
              <p className="text-xs text-slate-500 mt-0.5">Scope of Work — Completion Report</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-slate-900 font-mono">{job.woNumber ?? '—'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Completed {completedLabel}</p>
            </div>
          </div>

          {/* ── Job Details ─────────────────────────────────────────── */}
          <Section label="Job Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              <Row label="Client" value={<span className="font-semibold">{siteName || customer?.name || '—'}</span>} />
              <Row label="WO #" value={job.woNumber} mono />
              <Row label="Address" value={siteAddress || job.siteAddress} />
              <Row label="Service" value={job.serviceType} />
              <Row label="Scheduled" value={scheduledLabel} />
              <Row label="Completed" value={completedLabel} />
            </div>
          </Section>

          {/* ── Manpower ────────────────────────────────────────────── */}
          <Section label="Manpower">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
              <Row label={<span className="flex items-center gap-1"><User className="w-3 h-3 shrink-0" />Technician</span> as any} value={techLabel} />
              <Row label="Contractor" value={contractorLabel} />
              <Row label="Labor" value={laborHrs} />
              {travelLabel && <Row label="Travel" value={travelLabel} />}
            </div>
          </Section>

          {/* ── Weather ─────────────────────────────────────────────── */}
          <Section label="Weather">
            {weatherInNotes ? (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-amber-800">Contractor reported weather conditions</p>
                  {weatherLines.map((line, i) => (
                    <p key={i} className="text-xs text-amber-700">{line.trim()}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-500">
                <CloudSun className="w-4 h-4 shrink-0" />
                <p className="text-xs">No weather issues reported by contractor</p>
              </div>
            )}
          </Section>

          {/* ── Photos by category ──────────────────────────────────── */}
          {photoGroups.length > 0 && (
            <Section label={`Photos (${woPhotos.length} total)`}>
              <div className="space-y-4">
                {photoGroups.map(({ cat, photos }) => (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLOR[cat]}`} />
                      <p className="text-xs font-semibold text-slate-600">
                        {PHOTO_CATEGORY_LABELS[cat]}
                        <span className="ml-1.5 text-[10px] text-slate-400 font-normal">({photos.length})</span>
                      </p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {photos.map(photo => (
                        <div
                          key={photo.id}
                          className="aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200"
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

          {/* ── Contractor Field Notes ───────────────────────────────── */}
          {contractorNotes.trim() && (
            <Section label="Contractor Field Notes">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {contractorNotes.trim()}
              </p>
            </Section>
          )}

          {/* ── Service Report (admin/tech) ──────────────────────────── */}
          {job.serviceReport?.trim() && (
            <Section label="Service Report">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {job.serviceReport.trim()}
              </p>
            </Section>
          )}

          {/* ── Next Steps ──────────────────────────────────────────── */}
          {job.nextSteps?.trim() && (
            <Section label="Next Steps">
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <p className="text-sm text-orange-800 whitespace-pre-wrap leading-relaxed">
                  {job.nextSteps.trim()}
                </p>
              </div>
            </Section>
          )}

          {/* ── Footer ──────────────────────────────────────────────── */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle className="w-4 h-4" />
              <p className="text-xs font-semibold">Work Order Completed</p>
            </div>
            <p className="text-[10px] text-slate-400">
              Conexsol Energy · Generated {new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
