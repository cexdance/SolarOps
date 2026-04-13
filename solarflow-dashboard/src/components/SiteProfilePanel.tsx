// Site Profile Panel — full customer window with Overview, Story, Work Orders, Notes
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, FileText, MessageSquare, Trash2, Upload, Image, File,
  Send, Clock, User, ChevronDown, ChevronUp, Save, Zap,
  AlertTriangle, Sun, Calendar, ExternalLink, Wrench,
  TrendingUp, TrendingDown, ClipboardList, MapPin,
  CheckCircle, ChevronRight, Plus,
} from 'lucide-react';
import {
  SiteProfile, SiteNote, SiteAttachment, SiteClientStatus,
  CLIENT_STATUS_CONFIG, getProfile, saveProfile, addNote,
  deleteNote, updateClientStatus, fileToAttachment, formatBytes,
} from '../lib/siteProfileStore';
import { SolarEdgeSite } from '../lib/solarEdgeSites';
import { Job, Customer, WOStatus } from '../types';
import { WorkOrderPanel } from './WorkOrderPanel';
import { Contractor, ContractorJob } from '../types/contractor';

// WO status display helpers (WOStatus-aware, falls back to JobStatus)
const WO_STATUS_COLOR_FULL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  quote_sent: 'bg-blue-100 text-blue-700',
  quote_approved: 'bg-violet-100 text-violet-700',
  scheduled: 'bg-amber-100 text-amber-700',
  new: 'bg-blue-100 text-blue-700', assigned: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700',
  invoiced: 'bg-purple-100 text-purple-700', paid: 'bg-green-100 text-green-700',
};
const WO_STATUS_LABEL_FULL: Record<string, string> = {
  draft: 'Draft', quote_sent: 'Quote Sent', quote_approved: 'Quote Approved',
  scheduled: 'Scheduled', new: 'New', assigned: 'Assigned',
  in_progress: 'In Progress', completed: 'Completed', invoiced: 'Invoiced', paid: 'Paid',
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const jobProfit = (j: Job) => (j.totalAmount || 0) - (j.laborHours * j.laborRate) - (j.partsCost || 0);

// ─── Status Combobox ──────────────────────────────────────────────────────
const getStatusCfg = (value: string) =>
  CLIENT_STATUS_CONFIG[value as SiteClientStatus] ?? null;

const StatusSelector: React.FC<{
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState(value ?? '');
  const ref    = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input when value changes externally
  useEffect(() => {
    const cfg = value ? getStatusCfg(value) : null;
    setInput(cfg ? cfg.label : (value ?? ''));
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Commit whatever is typed
        const trimmed = input.trim();
        if (trimmed === '') onChange(undefined);
        else {
          // If the user typed text that matches a label, store the key
          const match = (Object.entries(CLIENT_STATUS_CONFIG) as [SiteClientStatus, typeof CLIENT_STATUS_CONFIG[SiteClientStatus]][])
            .find(([, cfg]) => cfg.label.toLowerCase() === trimmed.toLowerCase());
          onChange(match ? match[0] : trimmed);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [input, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed === '') onChange(undefined);
      else {
        const match = (Object.entries(CLIENT_STATUS_CONFIG) as [SiteClientStatus, typeof CLIENT_STATUS_CONFIG[SiteClientStatus]][])
          .find(([, cfg]) => cfg.label.toLowerCase() === trimmed.toLowerCase());
        onChange(match ? match[0] : trimmed);
      }
      setOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  const handleSelect = (key: string, label: string) => {
    setInput(label);
    onChange(key);
    setOpen(false);
  };

  // Filter suggestions by input
  const suggestions = (Object.entries(CLIENT_STATUS_CONFIG) as [SiteClientStatus, typeof CLIENT_STATUS_CONFIG[SiteClientStatus]][])
    .filter(([, cfg]) => cfg.label.toLowerCase().includes(input.toLowerCase()));

  const cfg = value ? getStatusCfg(value) : null;
  const isCustom = value && !cfg;

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center gap-1.5 rounded-lg border text-sm font-medium transition-colors
        ${cfg
          ? `${cfg.bg} ${cfg.color} ${cfg.border}`
          : isCustom
            ? 'bg-slate-100 text-slate-700 border-slate-300'
            : 'bg-white text-slate-500 border-slate-200'}`}
      >
        {cfg?.critical && <AlertTriangle className="w-3.5 h-3.5 ml-2.5 flex-shrink-0" />}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Set status…"
          className="bg-transparent outline-none px-3 py-1.5 w-44 placeholder:text-slate-400 placeholder:font-normal"
        />
        <button
          onClick={() => { setOpen(!open); inputRef.current?.focus(); }}
          className="pr-2 cursor-pointer opacity-50 hover:opacity-100"
          tabIndex={-1}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          {value && (
            <button
              onMouseDown={e => { e.preventDefault(); setInput(''); onChange(undefined); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50 cursor-pointer border-b border-slate-100"
            >
              Clear status
            </button>
          )}

          {/* Predefined suggestions */}
          {suggestions.length > 0 && (
            <div className="py-1">
              <p className="px-3 pt-1 pb-1 text-xs text-slate-400 uppercase tracking-wide">Suggestions</p>
              {suggestions.map(([key, cfg]) => (
                <button
                  key={key}
                  onMouseDown={e => { e.preventDefault(); handleSelect(key, cfg.label); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer
                    ${key === value ? `${cfg.bg} ${cfg.color}` : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  {cfg.critical
                    ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-500" />
                    : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.bg.replace('-100', '-500')}`} />}
                  {cfg.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom value option */}
          {input.trim() && !suggestions.find(([, c]) => c.label.toLowerCase() === input.trim().toLowerCase()) && (
            <div className="border-t border-slate-100 py-1">
              <button
                onMouseDown={e => { e.preventDefault(); onChange(input.trim()); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
                Use "<span className="font-medium">{input.trim()}</span>"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Attachment chip ───────────────────────────────────────────────────────
const AttachmentChip: React.FC<{ att: SiteAttachment; onRemove?: () => void }> = ({ att, onRemove }) => {
  const isImage = att.type.startsWith('image/');
  return (
    <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1.5 text-xs group">
      {isImage && att.dataUrl
        ? <img src={att.dataUrl} alt={att.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
        : <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center flex-shrink-0">
            {isImage ? <Image className="w-4 h-4 text-slate-500" /> : <File className="w-4 h-4 text-slate-500" />}
          </div>}
      <div className="min-w-0">
        <p className="font-medium text-slate-700 truncate max-w-[120px]">{att.name}</p>
        <p className="text-slate-400">{formatBytes(att.size)}</p>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="ml-1 p-0.5 rounded hover:bg-red-100 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

// ─── Drop zone ────────────────────────────────────────────────────────────
const DropZone: React.FC<{ onFiles: (files: File[]) => void; compact?: boolean }> = ({ onFiles, compact }) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    onFiles(Array.from(e.dataTransfer.files));
  }, [onFiles]);
  return (
    <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={handleDrop} onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg cursor-pointer transition-colors
        ${dragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}
        ${compact ? 'px-3 py-2 flex items-center gap-2' : 'px-4 py-6 flex flex-col items-center gap-2'}`}>
      <input ref={inputRef} type="file" multiple className="hidden"
        onChange={e => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
      <Upload className={`text-slate-400 ${compact ? 'w-4 h-4' : 'w-6 h-6'}`} />
      {compact
        ? <span className="text-xs text-slate-500">Attach files</span>
        : <><p className="text-sm font-medium text-slate-600">Drop files here or click to upload</p>
            <p className="text-xs text-slate-400">Images stored as preview · All file types accepted</p></>}
    </div>
  );
};

// ─── Note entry ────────────────────────────────────────────────────────────
const NoteEntry: React.FC<{ note: SiteNote; onDelete: () => void }> = ({ note, onDelete }) => {
  const [expanded, setExpanded] = useState(true);
  const date = new Date(note.createdAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-orange-400 border-2 border-white shadow-sm" />
      <div className="absolute left-1.5 top-4 bottom-0 w-px bg-slate-200" />
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <User className="w-3.5 h-3.5" />
            <span className="font-medium text-slate-700">{note.author || 'Staff'}</span>
            <Clock className="w-3 h-3 ml-1" />
            <span>{dateStr} · {timeStr}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded(!expanded)} className="p-1 rounded hover:bg-slate-100 text-slate-400 cursor-pointer">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 hover:text-red-500 text-slate-400 cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {expanded && (
          <div className="px-3 py-2.5">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            {note.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {note.attachments.map(att => <AttachmentChip key={att.id} att={att} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Panel ────────────────────────────────────────────────────────────
type Tab = 'overview' | 'story' | 'workorders' | 'notes';

interface Props {
  site: SolarEdgeSite;
  jobs: Job[];
  customers: Customer[];
  contractors?: Contractor[];
  currentUserName: string;
  currentUserRole?: string;
  onClose: () => void;
  onNavigateToJobs: () => void;
  onCreateJob?: (job: Partial<Job>) => void;
  onUpdateJob?: (job: Job) => void;
  onDispatchContractorJob?: (job: ContractorJob) => void;
}

export const SiteProfilePanel: React.FC<Props> = ({
  site, jobs, customers, contractors = [], currentUserName, currentUserRole,
  onClose, onNavigateToJobs, onCreateJob, onUpdateJob, onDispatchContractorJob,
}) => {
  const [tab, setTab]               = useState<Tab>('overview');
  const [profile, setProfile]       = useState<SiteProfile>(() => getProfile(site.siteId));
  const [descText, setDescText]     = useState(profile.description);
  const [descAtts, setDescAtts]     = useState<SiteAttachment[]>(profile.descriptionAttachments);
  const [descDirty, setDescDirty]   = useState(false);
  const [noteText, setNoteText]     = useState('');
  const [noteAtts, setNoteAtts]     = useState<SiteAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [approvingQuote, setApprovingQuote] = useState(false);

  // WorkOrderPanel state
  const [woOpen, setWoOpen]       = useState(false);
  const [woTarget, setWoTarget]   = useState<Job | undefined>(undefined);

  const openNewWO  = () => { setWoTarget(undefined); setWoOpen(true); };
  const openEditWO = (job: Job) => { setWoTarget(job); setWoOpen(true); };

  const handleWOSave = (partial: Partial<Job>) => {
    if (woTarget && onUpdateJob) {
      onUpdateJob({ ...woTarget, ...partial } as Job);
    } else if (onCreateJob) {
      onCreateJob({ ...partial, customerId: customer?.id ?? '' });
    }
  };

  useEffect(() => {
    const p = getProfile(site.siteId);
    setProfile(p); setDescText(p.description);
    setDescAtts(p.descriptionAttachments); setDescDirty(false);
  }, [site.siteId]);

  // Find linked customer & jobs
  const customer = customers.find(c =>
    c.solarEdgeSiteId === site.siteId || c.clientId === site.clientId
  );
  const siteJobs = customer ? jobs.filter(j => j.customerId === customer.id) : [];
  const openJobs   = siteJobs.filter(j => !['completed','invoiced','paid'].includes(j.status));
  const closedJobs = siteJobs.filter(j => ['completed','invoiced','paid'].includes(j.status));
  const totalRevenue = siteJobs.reduce((s, j) => s + (j.totalAmount || 0), 0);
  const totalProfit  = siteJobs.reduce((s, j) => s + jobProfit(j), 0);
  const margin       = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const handleStatusChange = (status: string | undefined) => {
    updateClientStatus(site.siteId, status);
    setProfile(prev => ({ ...prev, clientStatus: status }));
  };

  const handleSaveDescription = () => {
    const updated = { ...profile, description: descText, descriptionAttachments: descAtts };
    saveProfile(updated); setProfile(updated); setDescDirty(false);
  };

  const handleDescFiles = async (files: File[]) => {
    const atts = await Promise.all(files.map(fileToAttachment));
    setDescAtts(prev => [...prev, ...atts]); setDescDirty(true);
  };

  const handleNoteFiles = async (files: File[]) => {
    const atts = await Promise.all(files.map(fileToAttachment));
    setNoteAtts(prev => [...prev, ...atts]);
  };

  const handleSubmitNote = async () => {
    if (!noteText.trim() && noteAtts.length === 0) return;
    setSubmitting(true);
    const note = addNote(site.siteId, noteText.trim(), currentUserName, noteAtts);
    setProfile(prev => ({ ...prev, notes: [note, ...prev.notes] }));
    setNoteText(''); setNoteAtts([]); setSubmitting(false);
  };

  const handleApproveQuote = () => {
    setApprovingQuote(true);
    // Change status to WO Pending and log a note
    handleStatusChange('wo_pending');
    addNote(site.siteId, 'Quote approved — Work Order sent to contractor queue.', currentUserName, []);
    setProfile(prev => ({
      ...prev,
      clientStatus: 'wo_pending',
      notes: [{ id: `note-${Date.now()}`, content: 'Quote approved — Work Order sent to contractor queue.', author: currentUserName, createdAt: new Date().toISOString(), attachments: [] }, ...prev.notes],
    }));
    setApprovingQuote(false);
    onNavigateToJobs();
  };

  const isSystemDown = site.alerts > 0 && parseInt(site.highestImpact) >= 4;
  const cfg = profile.clientStatus ? CLIENT_STATUS_CONFIG[profile.clientStatus] : null;

  const TABS: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'overview',    label: 'Overview',     icon: Sun },
    { id: 'story',       label: 'Story',        icon: FileText },
    { id: 'workorders',  label: 'Work Orders',  icon: ClipboardList, badge: siteJobs.length },
    { id: 'notes',       label: 'Notes',        icon: MessageSquare, badge: profile.notes.length },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {site.clientId && (
                  <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                    {site.clientId}
                  </span>
                )}
                <span className="text-xs text-slate-400 font-mono">#{site.siteId}</span>
                {isSystemDown && !profile.clientStatus && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    <AlertTriangle className="w-3 h-3" /> Alert detected
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1 truncate">{site.siteName || 'Unnamed Site'}</h2>
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                <MapPin className="w-3 h-3" />
                <span>{site.address}</span>
              </div>
            </div>

            {/* Status + close */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusSelector value={profile.clientStatus} onChange={handleStatusChange} />
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quote approval CTA */}
          {profile.clientStatus === 'quote_approval' && (
            <div className="mt-3 flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              <div className="flex-1 text-xs text-violet-700">
                <span className="font-semibold">Quote pending approval.</span> Once approved, a Work Order will be sent to the contractor queue.
              </div>
              <button
                onClick={handleApproveQuote}
                disabled={approvingQuote}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Approve Quote
              </button>
            </div>
          )}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 flex-shrink-0 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors cursor-pointer
                ${tab === id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon className="w-4 h-4" />
              {label}
              {badge !== undefined && badge > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold
                  ${tab === id ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Overview ─────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="p-5 space-y-5">

              {/* Site status + SolarEdge link */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${site.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {site.status}
                  </span>
                  {site.systemType && <span className="text-xs text-slate-500">{site.systemType}</span>}
                </div>
                <a href={`https://monitoring.solaredge.com/solaredge-web/p/site/${site.siteId}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors cursor-pointer">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in SolarEdge
                </a>
              </div>

              {/* Alert banner */}
              {site.alerts > 0 && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm
                  ${parseInt(site.highestImpact) >= 4
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span><span className="font-semibold">{site.alerts} active alert{site.alerts !== 1 ? 's' : ''}</span> — highest impact level {site.highestImpact}</span>
                </div>
              )}

              {/* Site info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Install Date',  value: site.installDate || '—',      icon: Calendar },
                  { label: 'PTO Date',      value: site.ptoDate || '—',          icon: Calendar },
                  { label: 'Peak Power',    value: site.peakPower ? `${site.peakPower} kW` : '—', icon: Zap },
                  { label: 'Last Update',   value: site.lastUpdate?.split(' ')[0] || '—', icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 font-mono">{value}</p>
                  </div>
                ))}
              </div>

              {/* Module info */}
              {site.module && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Solar Module</p>
                  <p className="text-sm font-medium text-slate-800">{site.module}</p>
                </div>
              )}

              {/* Energy metrics */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Energy Production</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Today',    value: site.todayKwh },
                    { label: 'Month',    value: site.monthKwh },
                    { label: 'Year',     value: site.yearKwh },
                    { label: 'Lifetime', value: site.lifetimeKwh },
                  ].map(({ label, value }) => {
                    const display = !value ? '—'
                      : value >= 1000 ? `${(value / 1000).toFixed(2)} MWh`
                      : `${value.toFixed(1)} kWh`;
                    return (
                      <div key={label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">{label}</p>
                        <p className={`text-sm font-bold font-mono ${value ? 'text-slate-800' : 'text-slate-300'}`}>{display}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financials summary */}
              {siteJobs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Financials</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Revenue',    value: `$${totalRevenue.toLocaleString()}`, color: 'text-slate-800' },
                      { label: 'Profit',     value: `$${totalProfit.toLocaleString()}`,  color: totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500' },
                      { label: 'Margin',     value: `${margin.toFixed(0)}%`,             color: margin >= 20 ? 'text-emerald-600' : margin >= 0 ? 'text-amber-600' : 'text-red-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">{label}</p>
                        <p className={`text-sm font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Story ────────────────────────────────────────────────────── */}
          {tab === 'story' && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Customer Story / Description
                </label>
                <textarea value={descText}
                  onChange={e => { setDescText(e.target.value); setDescDirty(true); }}
                  placeholder="Describe the customer's system, history, special requirements, past issues…"
                  rows={8}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg resize-none
                    focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent
                    placeholder:text-slate-300 leading-relaxed" />
              </div>
              {descAtts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Attached Files</p>
                  <div className="flex flex-wrap gap-2">
                    {descAtts.map(att => (
                      <AttachmentChip key={att.id} att={att}
                        onRemove={() => { setDescAtts(prev => prev.filter(a => a.id !== att.id)); setDescDirty(true); }} />
                    ))}
                  </div>
                </div>
              )}
              <DropZone onFiles={handleDescFiles} />
              {descDirty && (
                <button onClick={handleSaveDescription}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer">
                  <Save className="w-4 h-4" />Save Changes
                </button>
              )}
              {!descDirty && (profile.description || descAtts.length > 0) && (
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last updated {new Date(profile.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}

          {/* ── Work Orders ──────────────────────────────────────────────── */}
          {tab === 'workorders' && (
            <div className="p-5 space-y-4">
              {/* Create WO button */}
              {onCreateJob && (
                <button
                  onClick={openNewWO}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer w-full justify-center"
                >
                  <Plus className="w-4 h-4" />
                  New Work Order
                </button>
              )}

              {siteJobs.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No work orders yet.</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total WOs', value: siteJobs.length, color: 'text-slate-800' },
                      { label: 'Open',      value: openJobs.length, color: openJobs.length > 0 ? 'text-amber-600' : 'text-slate-400' },
                      { label: 'Completed', value: closedJobs.length, color: 'text-emerald-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* WO list */}
                  <div className="space-y-2">
                    {siteJobs.map(job => {
                      const profit = jobProfit(job);
                      const displayStatus = job.woStatus ?? job.status;
                      return (
                        <div
                          key={job.id}
                          onClick={() => openEditWO(job)}
                          className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{job.title || job.serviceType}</p>
                              <p className="text-xs text-slate-400 font-mono">{job.woNumber || job.id.slice(0, 12)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${WO_STATUS_COLOR_FULL[displayStatus] || 'bg-slate-100 text-slate-600'}`}>
                                {WO_STATUS_LABEL_FULL[displayStatus] || displayStatus}
                              </span>
                              {job.urgency && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                                  ${job.urgency === 'critical' ? 'bg-red-100 text-red-700'
                                  : job.urgency === 'high' ? 'bg-orange-100 text-orange-700'
                                  : job.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-slate-100 text-slate-500'}`}>
                                  {job.urgency}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <div className="flex items-center gap-3">
                              {job.scheduledDate && (
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{job.scheduledDate}</span>
                              )}
                              {job.laborHours > 0 && <span>{job.laborHours}h labor</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              {job.totalAmount > 0 && <span className="font-medium text-slate-700">${job.totalAmount.toLocaleString()}</span>}
                              {job.totalAmount > 0 && (
                                <span className={`flex items-center gap-0.5 font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {profit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  ${Math.abs(profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button onClick={onNavigateToJobs}
                    className="text-sm text-orange-500 hover:text-orange-700 transition-colors cursor-pointer">
                    View all in Work Orders →
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Notes ────────────────────────────────────────────────────── */}
          {tab === 'notes' && (
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-3">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Add Interaction Note
                </label>
                <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                  placeholder="Log a call, site visit, email, or any client interaction…"
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none bg-white
                    focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent
                    placeholder:text-slate-300 leading-relaxed"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitNote(); }} />
                {noteAtts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {noteAtts.map(att => (
                      <AttachmentChip key={att.id} att={att}
                        onRemove={() => setNoteAtts(prev => prev.filter(a => a.id !== att.id))} />
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <DropZone onFiles={handleNoteFiles} compact />
                  <button onClick={handleSubmitNote}
                    disabled={submitting || (!noteText.trim() && noteAtts.length === 0)}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40
                      disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer">
                    <Send className="w-4 h-4" />Save Note
                  </button>
                </div>
                <p className="text-xs text-slate-400">⌘+Enter to save quickly</p>
              </div>

              {profile.notes.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No notes yet.</p>
                </div>
              ) : (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
                    Timeline · {profile.notes.length} {profile.notes.length === 1 ? 'entry' : 'entries'}
                  </p>
                  {profile.notes.map(note => (
                    <NoteEntry key={note.id} note={note}
                      onDelete={() => {
                        deleteNote(site.siteId, note.id);
                        setProfile(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== note.id) }));
                      }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* WorkOrderPanel — stacked over site panel */}
      {woOpen && (
        <WorkOrderPanel
          job={woTarget}
          siteId={site.siteId}
          siteName={site.siteName}
          clientId={site.clientId}
          siteAddress={site.address}
          siteInstallDate={site.installDate}
          clientPaidJobCount={closedJobs.length}
          onClose={() => setWoOpen(false)}
          onSave={handleWOSave}
          onUpdateSiteStatus={(id, status) => handleStatusChange(status)}
          onDispatch={onDispatchContractorJob}
          contractors={contractors}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
        />
      )}
    </>
  );
};
