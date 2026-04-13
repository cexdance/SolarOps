// SolarFlow - Job Detail / Active Call Flow
// Flow: Pre-Start → [Before Photo Modal] → Active Call → [After Photo Modal] → Completed
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft, MapPin, Phone, Clock, AlertTriangle, AlertCircle,
  Play, Camera, CheckCircle, Package, FileText, Send, X, Plus,
  Trash2, Wrench, Zap, Thermometer, User, Mail, DollarSign,
  Star, MessageSquare, Navigation, ShieldAlert, Image, Check,
  Cloud, CloudRain, Sun, Wind, Sparkles, ChevronDown, ChevronUp,
  HardHat,
} from 'lucide-react';
import { ContractorJob, JobStatusContractor, ServiceStatus, PhotoCategory, JobPart } from '../../types/contractor';
import {
  addJobXp, calcJobXpBreakdown, getLevelInfo, getNextLevel,
  getLevelProgress, loadXpData, AddXpResult, addBonusXp,
} from '../../lib/contractorGamification';

interface JobDetailProps {
  job: ContractorJob;
  contractorId: string;
  onBack: () => void;
  onUpdateJob: (updatedJob: ContractorJob) => void;
  onXpEarned?: () => void;
  onUpsellLead?: (job: ContractorJob, notes: string) => void;
  currentWeather?: string;
}

type CallPhase = 'pre_start' | 'active' | 'completed';
type ActiveTab  = 'photos' | 'report' | 'safety';

function getPhotoTabs(isNewInstall?: boolean, isOptimizerJob?: boolean, isInverterJob?: boolean): { id: PhotoCategory; label: string; required?: boolean }[] {
  // Inverter change gets its own dedicated tab set
  if (isInverterJob) {
    return [
      { id: 'old_serial',      label: 'Old Serial #',    required: true },
      { id: 'string_voltage',  label: 'String Voltages', required: true },
      { id: 'cabinet_old',     label: 'Old Cabinet',     required: true },
      { id: 'cabinet_new',     label: 'New Cabinet',     required: true },
      { id: 'new_serial',      label: 'New Serial #',    required: true },
      { id: 'inv_overview',    label: 'Wall Overview',   required: true },
    ];
  }

  const base: { id: PhotoCategory; label: string; required?: boolean }[] = [
    { id: 'before',  label: 'Before',    required: true },
    { id: 'serial',  label: 'Serial #',  required: isOptimizerJob },
    { id: 'voltage', label: 'Volt Test', required: isOptimizerJob },
    { id: 'parts',   label: 'Parts'     },
    { id: 'process', label: 'Process'   },
    { id: 'after',   label: 'After',    required: true },
  ];
  if (isNewInstall) {
    base.push(
      { id: 'progress', label: 'Progress', required: true },
      { id: 'ppe',      label: 'PPE',      required: true },
    );
  }
  // Only include voltage tab for optimizer jobs
  if (!isOptimizerJob) return base.filter(t => t.id !== 'voltage');
  return base;
}

const SERVICE_STATUS_OPTIONS: { id: ServiceStatus; label: string; color: string }[] = [
  { id: 'fully_operational',     label: 'Fully Operational',    color: 'border-emerald-400 bg-emerald-50 text-emerald-700' },
  { id: 'partially_operational', label: 'Partially Operational', color: 'border-amber-400 bg-amber-50 text-amber-700'     },
  { id: 'pending_parts',         label: 'Pending Parts',         color: 'border-blue-400 bg-blue-50 text-blue-700'         },
  { id: 'could_not_complete',    label: 'Could Not Complete',    color: 'border-red-400 bg-red-50 text-red-700'            },
];

// ─── Live call timer ───────────────────────────────────────────────────────────
const useElapsedTime = (startedAt?: string) => {
  const [elapsed, setElapsed] = useState('0:00');
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
};


// ─── Compact After-Photo Sheet ─────────────────────────────────────────────────
const AfterPhotoSheet: React.FC<{
  onCapture: (dataUrl: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}> = ({ onCapture, onSkip, onCancel }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-t-2xl p-5 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900 text-base">After photo <span className="text-slate-400 font-normal text-sm">(optional)</span></p>
            <p className="text-xs text-slate-500 mt-0.5">Document the completed work before leaving</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {preview ? (
          <img src={preview} alt="" className="w-full h-40 object-cover rounded-xl border border-slate-200" />
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm hover:border-orange-300 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <Camera className="w-5 h-5" />
            Take After Photo
          </button>
        )}

        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />

        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Skip & Complete
          </button>
          {preview && (
            <button
              onClick={() => onCapture(preview)}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <span className="flex items-center justify-center gap-1.5"><Check className="w-4 h-4" />Save & Complete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
export const JobDetail: React.FC<JobDetailProps> = ({ job, contractorId, onBack, onUpdateJob, onXpEarned, onUpsellLead, currentWeather }) => {
  const isCompleted = job.status === 'completed';
  const [phase, setPhase] = useState<CallPhase>(
    isCompleted ? 'completed' : (job.status === 'in_progress' || job.status === 'documentation') ? 'active' : 'pre_start'
  );
  const [showAfterModal, setShowAfterModal] = useState(false);

  // Photos
  const [photos, setPhotos] = useState(() => ({
    before: [],
    serial: [],
    parts: [],
    process: [],
    after: [],
    progress: [],
    ppe: [],
    voltage: [],
    old_serial: [],
    string_voltage: [],
    cabinet_old: [],
    cabinet_new: [],
    new_serial: [],
    inv_overview: [],
    ...job.photos,
  }));
  const isOptimizerJob = /optimizer|microinverter/i.test(job.serviceType ?? '');
  const isInverterJob  = /inverter/i.test(job.serviceType ?? '') && !isOptimizerJob;
  const [optimizerCount, setOptimizerCount] = useState(job.optimizerCount ?? 1);

  // Compute dynamic pricing for optimizer jobs: $180 base (up to 4), $60 each additional
  const optimizerTotal = optimizerCount <= 4 ? 180 : 180 + (optimizerCount - 4) * 60;

  const photoTabs = getPhotoTabs(job.isNewInstall, isOptimizerJob, isInverterJob);
  const [activePhotoTab, setActivePhotoTab] = useState<PhotoCategory>('before');
  const addPhotoRef = useRef<HTMLInputElement>(null);

  // Service report
  const [serviceStatus,   setServiceStatus]   = useState<ServiceStatus>(job.serviceStatus ?? 'fully_operational');
  const [serviceNotes,    setServiceNotes]     = useState(job.operationalNotes ?? '');
  const [nextSteps,       setNextSteps]        = useState(job.nextSteps ?? '');
  const [requireFollowUp, setRequireFollowUp]  = useState(job.requiresFollowUp ?? false);
  const [parts,           setParts]            = useState<JobPart[]>(job.parts ?? []);
  const [showAddPart,     setShowAddPart]      = useState(false);
  const [newPart,         setNewPart]          = useState({ name: '', partNumber: '', quantity: 1, unitPrice: 0 });
  const [partsReimbursement, setPartsReimbursement] = useState(job.partsReimbursementRequested ?? false);

  // Safety
  const [safetyConcern,   setSafetyConcern]    = useState(false);
  const [safetyDetails,   setSafetyDetails]    = useState('');

  // Active tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('photos');

  // Invoice sent state (simulated)
  const [invoiceSent, setInvoiceSent] = useState(job.invoiceStatus === 'sent');

  // Contractor invoice number
  const [contractorInvoiceNumber, setContractorInvoiceNumber] = useState(job.contractorInvoiceNumber ?? '');

  // XP gamification
  const [xpResult, setXpResult]       = useState<AddXpResult | null>(null);
  const [showXpBreakdown, setShowXpBreakdown] = useState(false);

  // Upsell referral
  const [upsellFlagged, setUpsellFlagged] = useState(job.upsellFlagged ?? false);
  const [upsellNotes, setUpsellNotes]     = useState(job.upsellNotes ?? '');
  const [upsellXp, setUpsellXp]           = useState<number | null>(null);

  // Live XP preview — recalculates as user fills out the report
  const previewXp = useMemo(() => {
    const preview: ContractorJob = {
      ...job,
      status: 'completed',
      photos,
      serviceStatus,
      operationalNotes: serviceNotes,
      nextSteps,
      parts,
      completedAt: job.completedAt ?? new Date().toISOString(),
    };
    return calcJobXpBreakdown(preview);
  }, [job, photos, serviceStatus, serviceNotes, nextSteps, parts]);

  // Elapsed timer
  const elapsed = useElapsedTime(phase === 'active' ? job.startedAt : undefined);

  // Auto-save photos + notes whenever they change during an active job
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    if (phase !== 'active') return;
    onUpdateJob({ ...job, photos, operationalNotes: serviceNotes });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, serviceNotes]);

  const addPhoto = (category: PhotoCategory, dataUrl: string) => {
    setPhotos(prev => ({ ...prev, [category]: [...prev[category], dataUrl] }));
  };

  const removePhoto = (category: PhotoCategory, idx: number) => {
    setPhotos(prev => ({ ...prev, [category]: prev[category].filter((_,i) => i !== idx) }));
  };

  const handleAdditionalPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => addPhoto(activePhotoTab, reader.result as string);
      reader.readAsDataURL(file);
    });
    if (addPhotoRef.current) addPhotoRef.current.value = '';
  };

  // ── Start Call: immediately start clock, photo is optional ────────────────
  const handleStartCall = () => {
    const now = new Date().toISOString();
    const updated: ContractorJob = { ...job, status: 'in_progress', startedAt: now, photos };
    onUpdateJob(updated);
    setPhase('active');
  };

  const handleBeforePhotoCaptured = (dataUrl: string) => {
    const updatedPhotos = { ...photos, before: [...photos.before, dataUrl] };
    setPhotos(updatedPhotos);
    setShowBeforeModal(false);
    onUpdateJob({ ...job, photos: updatedPhotos });
  };

  // ── Complete Call: finish immediately, after photo optional ────────────────
  const handleCompleteCall = (afterPhoto?: string) => {
    const updatedPhotos = afterPhoto
      ? { ...photos, after: [...photos.after, afterPhoto] }
      : photos;
    setPhotos(updatedPhotos);
    setShowAfterModal(false);

    let notes = serviceNotes;
    if (safetyConcern && safetyDetails) notes += `\n\n[SAFETY CONCERN]: ${safetyDetails}`;

    const now = new Date().toISOString();
    const partsTotal = parts.reduce((s, p) => s + p.totalPrice, 0);
    const updated: ContractorJob = {
      ...job,
      status: 'completed',
      completedAt: now,
      photos: updatedPhotos,
      serviceStatus,
      operationalNotes: notes,
      nextSteps,
      requiresFollowUp: requireFollowUp,
      parts,
      partsAmount: partsTotal,
      invoiceStatus: 'pending',
      paymentStatus: 'pending',
      partsReimbursementRequested: parts.length > 0 ? partsReimbursement : false,
      upsellFlagged,
      upsellNotes: upsellFlagged ? upsellNotes : undefined,
      upsellLeadCreated: upsellFlagged ? true : undefined,
      ...(isOptimizerJob ? { optimizerCount } : {}),
    };
    onUpdateJob(updated);
    setPhase('completed');

    // Award XP for this completed job
    const result = addJobXp(contractorId, updated);
    if (!result.alreadyCounted) {
      setXpResult(result);
      onXpEarned?.();
    }

    // Award upsell XP + create CRM lead
    if (upsellFlagged) {
      const UPSELL_XP = 150;
      addBonusXp(contractorId, UPSELL_XP);
      setUpsellXp(UPSELL_XP);
      onUpsellLead?.(updated, upsellNotes);
    }

    // Simulate invoice auto-send after 1.5s
    setTimeout(() => {
      onUpdateJob({ ...updated, invoiceStatus: 'sent', invoiceSentAt: new Date().toISOString() });
      setInvoiceSent(true);
    }, 1500);
  };

  const handleAfterPhotoCaptured = (dataUrl: string) => handleCompleteCall(dataUrl);

  const handleAddPart = () => {
    if (!newPart.name) return;
    const part: JobPart = { id: `p-${Date.now()}`, ...newPart, totalPrice: newPart.quantity * newPart.unitPrice };
    setParts(prev => [...prev, part]);
    setNewPart({ name: '', partNumber: '', quantity: 1, unitPrice: 0 });
    setShowAddPart(false);
  };

  // Weather icon helper
  const WeatherIcon = () => {
    if (currentWeather === 'cloudy') return <Cloud className="w-4 h-4 text-slate-500" />;
    if (currentWeather === 'rainy')  return <CloudRain className="w-4 h-4 text-blue-500" />;
    if (currentWeather === 'windy')  return <Wind className="w-4 h-4 text-sky-500" />;
    return <Sun className="w-4 h-4 text-amber-400" />;
  };

  // ── Compact after-photo sheet (shown over existing UI) ─────────────────────
  if (showAfterModal) {
    return (
      <AfterPhotoSheet
        onCapture={handleAfterPhotoCaptured}
        onSkip={() => handleCompleteCall()}
        onCancel={() => setShowAfterModal(false)}
      />
    );
  }

  // ── XP Celebration Modal ────────────────────────────────────────────────────
  if (xpResult && xpResult.xpEarned > 0) {
    const { breakdown, xpEarned, badgeXpBonus, newBadges, leveledUp, prevLevel, currentLevel } = xpResult;
    const xpData = loadXpData(contractorId);
    const progress = getLevelProgress(xpData.totalXp);
    return (
      <div className="fixed inset-0 z-[600] bg-slate-950 flex flex-col overflow-y-auto">
        {/* Hero */}
        <div className="bg-gradient-to-b from-orange-600 to-amber-500 px-6 pt-12 pb-8 text-center text-white flex-shrink-0">
          <div className="text-6xl mb-3">🎉</div>
          <h1 className="text-3xl font-black tracking-tight">Call Complete!</h1>
          <div className="mt-2 text-5xl font-black">+{xpEarned + badgeXpBonus} XP</div>
          {badgeXpBonus > 0 && (
            <p className="text-amber-200 text-sm mt-1">includes +{badgeXpBonus} XP badge bonus</p>
          )}

          {/* Level progress */}
          <div className="mt-5 bg-white/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">{currentLevel.emoji} {currentLevel.name}</span>
              <span className="text-sm">{xpData.totalXp.toLocaleString()} XP</span>
            </div>
            <div className="h-3 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
            </div>
            {getNextLevel(xpData.totalXp) && (
              <p className="text-xs text-amber-200 mt-1.5">
                {(getNextLevel(xpData.totalXp)!.minXp - xpData.totalXp).toLocaleString()} XP to {getNextLevel(xpData.totalXp)!.name}
              </p>
            )}
          </div>

          {/* Level up banner */}
          {leveledUp && prevLevel && (
            <div className="mt-3 bg-white text-orange-700 rounded-xl px-4 py-2.5 font-bold text-sm flex items-center justify-center gap-2">
              ⬆️ Level Up! {prevLevel.emoji} {prevLevel.name} → {currentLevel.emoji} {currentLevel.name}
            </div>
          )}
        </div>

        {/* XP Breakdown */}
        <div className="flex-1 px-4 py-5 space-y-3">
          <h2 className="text-white font-bold text-sm uppercase tracking-wide">XP Breakdown</h2>
          <div className="bg-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-700">
            {breakdown.items.filter(i => i.achieved).map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-200 flex items-center gap-2">
                  <span className="text-green-400">✓</span>{item.label}
                </span>
                <span className="text-sm font-bold text-orange-400">+{item.points}</span>
              </div>
            ))}
          </div>

          {/* Missed items */}
          {breakdown.items.some(i => !i.achieved) && (
            <>
              <h2 className="text-slate-500 font-bold text-xs uppercase tracking-wide pt-2">Could have earned more</h2>
              <div className="bg-slate-900 rounded-2xl overflow-hidden divide-y divide-slate-800">
                {breakdown.items.filter(i => !i.achieved).map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-xs text-slate-600">+{item.points}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* New badges */}
          {newBadges.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-white font-bold text-sm uppercase tracking-wide pt-2">New Badges Earned!</h2>
              {newBadges.map(badge => (
                <div key={badge.id} className="bg-slate-800 border border-amber-500/40 rounded-2xl flex items-center gap-3 px-4 py-3">
                  <span className="text-3xl">{badge.emoji}</span>
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">{badge.name}</p>
                    <p className="text-slate-400 text-xs">{badge.description}</p>
                  </div>
                  <span className="text-amber-400 font-bold text-sm">+{badge.xpBonus}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setXpResult(null)}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-base mt-2 cursor-pointer"
          >
            View Job Summary
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header */}
      <header className={`sticky top-0 z-10 border-b border-slate-200 ${
        phase === 'active' ? 'bg-orange-600 text-white' : 'bg-white'
      }`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className={`p-2 rounded-lg cursor-pointer ${phase === 'active' ? 'hover:bg-orange-700' : 'hover:bg-slate-100'}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-xs font-semibold uppercase tracking-wide ${phase === 'active' ? 'text-orange-200' : 'text-slate-400'}`}>
              {phase === 'pre_start' ? job.serviceType : phase === 'active' ? 'CALL IN PROGRESS' : 'COMPLETED'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={`font-bold text-sm truncate ${phase === 'active' ? 'text-white' : 'text-slate-900'}`}>
                {job.customerName}
              </h1>
              {job.isNewInstall && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                  <HardHat className="w-3 h-3" /> New Install
                </span>
              )}
            </div>
          </div>

          {/* Live timer */}
          {phase === 'active' && (
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-orange-200">Time on site</p>
              <p className="text-lg font-bold font-mono text-white">{elapsed}</p>
            </div>
          )}
          {phase === 'completed' && (
            <span className="flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
              <CheckCircle className="w-3.5 h-3.5" />Completed
            </span>
          )}
        </div>
      </header>

      <div className="p-4 pb-32 space-y-4 max-w-xl mx-auto">

        {/* ── PRE-START: Customer info + Start Call CTA ────────────────────── */}
        {phase === 'pre_start' && (
          <>
            {/* Customer card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900">{job.customerName}</h2>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                  job.status === 'en_route' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  {job.status === 'en_route' ? 'En Route' : 'In Queue'}
                </span>
              </div>

              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(job.address+', '+job.city+', '+job.state)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-2 text-sm text-blue-600 hover:underline"
              >
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{job.address}, {job.city}, {job.state} {job.zip}</span>
              </a>

              <div className="flex gap-3">
                <a href={`tel:${job.customerPhone}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  <Phone className="w-4 h-4" />Call
                </a>
                <a href={`https://maps.google.com/?q=${job.latitude},${job.longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />Navigate
                </a>
              </div>
            </div>

            {/* Work order details */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-orange-500" />
                Work Order Details
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Service Type</p>
                  <p className="font-medium text-slate-800">{job.serviceType}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Scheduled</p>
                  <p className="font-medium text-slate-800">{job.scheduledDate} {job.scheduledTime}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Est. Duration</p>
                  <p className="font-medium text-slate-800">{job.estimatedDuration} min</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Your Pay</p>
                  <p className="font-bold text-emerald-700">${job.contractorTotalPay.toFixed(0)}</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1 text-xs uppercase tracking-wide">Work Description</p>
                {job.description}
              </div>
              {job.notes && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700">
                  <p className="font-semibold mb-1 text-xs uppercase tracking-wide text-slate-400">Notes</p>
                  {job.notes}
                </div>
              )}
              {job.parts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Parts to Install</p>
                  <div className="space-y-1.5">
                    {job.parts.map(p => (
                      <div key={p.id} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">#{p.partNumber} × {p.quantity}</p>
                        </div>
                        <span className="font-semibold text-slate-700">${p.totalPrice.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weather note */}
            <div className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
              <WeatherIcon />
              <span className="capitalize">{currentWeather || 'Sunny'} conditions today</span>
              {(currentWeather === 'rainy' || currentWeather === 'windy') && (
                <span className="ml-auto text-xs text-amber-700 font-semibold">⚠ Review safety protocols</span>
              )}
            </div>
          </>
        )}

        {/* ── ACTIVE CALL: tabs for Photos / Report / Safety ───────────────── */}
        {phase === 'active' && (
          <>
            {/* Compact customer info */}
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400">On site at</p>
                <p className="font-semibold text-slate-900 truncate">{job.address}, {job.city}</p>
              </div>
              <a href={`tel:${job.customerPhone}`} className="p-2 bg-slate-100 rounded-lg text-slate-600 cursor-pointer">
                <Phone className="w-4 h-4" />
              </a>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-slate-200 rounded-xl p-1">
              {([
                { id: 'photos', label: 'Photos', icon: Camera },
                { id: 'report', label: 'Report',  icon: FileText },
                { id: 'safety', label: 'Safety',  icon: ShieldAlert },
              ] as { id: ActiveTab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {id === 'safety' && safetyConcern && (
                    <span className="w-2 h-2 rounded-full bg-red-500 ml-0.5" />
                  )}
                </button>
              ))}
            </div>

            {/* ── PHOTOS TAB ────────────────────────────────────────────────── */}
            {activeTab === 'photos' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                {/* Category selector */}
                <div className="flex gap-1.5 flex-wrap mb-4">
                  {photoTabs.map(({ id, label, required }) => {
                    const count = photos[id]?.length ?? 0;
                    const done  = count > 0;
                    return (
                      <button
                        key={id}
                        onClick={() => setActivePhotoTab(id)}
                        className={`flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          activePhotoTab === id
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : done
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        {done && <Check className="w-3 h-3" />}
                        {label}
                        {required && !done && <span className="text-red-500 ml-0.5">*</span>}
                        {count > 0 && <span className="ml-0.5">({count})</span>}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  {activePhotoTab === 'before'         && 'Document the site on arrival — optional but recommended.'}
                  {activePhotoTab === 'serial'         && (isOptimizerJob ? `Photograph the serial number label of EACH replaced optimizer/microinverter. Need ${optimizerCount} photo${optimizerCount !== 1 ? 's' : ''}.` : 'Photograph serial number labels — old and new equipment.')}
                  {activePhotoTab === 'voltage'        && `Photograph the voltage test reading for EACH replaced optimizer/microinverter. Need ${optimizerCount} photo${optimizerCount !== 1 ? 's' : ''}.`}
                  {activePhotoTab === 'parts'          && 'Document all replacement parts used on this job.'}
                  {activePhotoTab === 'process'        && 'Capture the work in progress — wiring, installation steps.'}
                  {activePhotoTab === 'after'          && 'Add after photos here, or via the prompt when completing the call.'}
                  {activePhotoTab === 'progress'       && 'Document installation progress — panels, racking, wiring milestones.'}
                  {activePhotoTab === 'ppe'            && 'All crew members must be wearing full PPE. Required before completing.'}
                  {activePhotoTab === 'old_serial'     && 'Photograph the serial number label on the existing/old inverter before removal.'}
                  {activePhotoTab === 'string_voltage' && 'Photograph the voltage reading for each string before disconnecting.'}
                  {activePhotoTab === 'cabinet_old'    && 'Photograph the inside of the existing inverter cabinet before removal.'}
                  {activePhotoTab === 'cabinet_new'    && 'Photograph the inside of the new inverter cabinet after installation.'}
                  {activePhotoTab === 'new_serial'     && 'Photograph the serial number label on the newly installed inverter.'}
                  {activePhotoTab === 'inv_overview'   && 'Photograph the full overview of the new inverter mounted on the wall.'}
                </p>

                <div className="grid grid-cols-3 gap-2">
                  {(photos[activePhotoTab] ?? []).map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      {activePhotoTab !== 'after' && (
                        <button
                          onClick={() => removePhoto(activePhotoTab, i)}
                          className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {activePhotoTab !== 'after' && (
                    <button
                      onClick={() => addPhotoRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-orange-400 hover:text-orange-500 transition-colors cursor-pointer"
                    >
                      <Camera className="w-6 h-6" />
                      <span className="text-xs mt-1">Add</span>
                    </button>
                  )}
                  {activePhotoTab === 'after' && photos.after.length === 0 && (
                    <button
                      onClick={() => addPhotoRef.current?.click()}
                      className="col-span-3 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs hover:border-orange-300 hover:text-orange-500 transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Add after photo
                    </button>
                  )}
                </div>

                <input ref={addPhotoRef} type="file" accept="image/*" multiple capture="environment"
                  onChange={handleAdditionalPhoto} className="hidden" />

                {/* Quick notes field — always visible on Photos tab */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Notes
                  </label>
                  <textarea
                    value={serviceNotes}
                    onChange={e => setServiceNotes(e.target.value)}
                    placeholder="Add notes about the work, findings, or observations…"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
            )}

            {/* ── REPORT TAB ────────────────────────────────────────────────── */}
            {activeTab === 'report' && (
              <div className="space-y-4">

                {/* ── Optimizer / Microinverter Count ─────────────────────────── */}
                {isOptimizerJob && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      Optimizers / Microinverters Changed
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setOptimizerCount(c => Math.max(1, c - 1))}
                        className="w-10 h-10 rounded-xl bg-white border border-amber-300 text-amber-700 font-bold text-lg flex items-center justify-center cursor-pointer hover:bg-amber-100 transition-colors"
                      >−</button>
                      <div className="flex-1 text-center">
                        <span className="text-4xl font-black text-slate-900">{optimizerCount}</span>
                        <p className="text-xs text-slate-500 mt-0.5">unit{optimizerCount !== 1 ? 's' : ''} replaced</p>
                      </div>
                      <button
                        onClick={() => setOptimizerCount(c => c + 1)}
                        className="w-10 h-10 rounded-xl bg-amber-500 text-white font-bold text-lg flex items-center justify-center cursor-pointer hover:bg-amber-600 transition-colors"
                      >+</button>
                    </div>
                    <div className="mt-3 pt-3 border-t border-amber-200 flex items-center justify-between">
                      <div className="text-xs text-amber-700">
                        {optimizerCount <= 4
                          ? <span>Base rate covers 1–4 units</span>
                          : <span>Base $180 + {optimizerCount - 4} additional × $60</span>
                        }
                      </div>
                      <div className="text-lg font-black text-amber-700">${optimizerTotal}</div>
                    </div>
                    {(photos.serial.length < optimizerCount || photos.voltage.length < optimizerCount) && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                          Photos tab: {photos.serial.length}/{optimizerCount} serial # · {photos.voltage.length}/{optimizerCount} voltage test required
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* System status */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">System Status After Service</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SERVICE_STATUS_OPTIONS.map(({ id, label, color }) => (
                      <button key={id} onClick={() => setServiceStatus(id)}
                        className={`p-3 text-xs font-semibold rounded-xl border-2 text-left transition-all cursor-pointer ${
                          serviceStatus === id ? color : 'border-slate-200 text-slate-500 bg-white'
                        }`}
                      >
                        {serviceStatus === id && <Check className="w-3.5 h-3.5 mb-1" />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Service notes */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    What was done / Findings
                  </label>
                  <textarea
                    value={serviceNotes}
                    onChange={e => setServiceNotes(e.target.value)}
                    placeholder="Describe the work performed, observations, and any findings..."
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                {/* Parts used */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Parts Used</p>
                    <button onClick={() => setShowAddPart(!showAddPart)}
                      className="flex items-center gap-1 text-xs text-orange-600 font-semibold cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />Add Part
                    </button>
                  </div>

                  {showAddPart && (
                    <div className="mb-3 p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-200">
                      <input type="text" placeholder="Part name" value={newPart.name}
                        onChange={e => setNewPart({...newPart, name: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      <div className="grid grid-cols-3 gap-2">
                        <input type="text" placeholder="Part #" value={newPart.partNumber}
                          onChange={e => setNewPart({...newPart, partNumber: e.target.value})}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                        <input type="number" placeholder="Qty" value={newPart.quantity}
                          onChange={e => setNewPart({...newPart, quantity: parseInt(e.target.value)||1})}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                        <input type="number" placeholder="$Price" value={newPart.unitPrice||''}
                          onChange={e => setNewPart({...newPart, unitPrice: parseFloat(e.target.value)||0})}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none" />
                      </div>
                      <button onClick={handleAddPart}
                        className="w-full py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold cursor-pointer">
                        Add Part
                      </button>
                    </div>
                  )}

                  {parts.length === 0 && !showAddPart && (
                    <p className="text-xs text-slate-400 text-center py-3">No parts added yet</p>
                  )}
                  {parts.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">#{p.partNumber} × {p.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">${p.totalPrice.toFixed(0)}</span>
                        <button onClick={() => setParts(prev => prev.filter((_,j) => j !== i))}
                          className="text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}

                  {parts.length > 0 && (
                    <label className={`flex items-start gap-3 mt-3 pt-3 border-t border-slate-100 cursor-pointer rounded-xl p-2 transition-colors ${partsReimbursement ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={partsReimbursement}
                        onChange={e => setPartsReimbursement(e.target.checked)}
                        className="w-4 h-4 accent-blue-600 rounded mt-0.5 shrink-0"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Request parts reimbursement</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          ${parts.reduce((s,p) => s + p.totalPrice, 0).toFixed(2)} total — accounting will review and include in your payment
                        </p>
                      </div>
                    </label>
                  )}
                </div>

                {/* Follow-up */}
                {serviceStatus !== 'fully_operational' && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Follow-up Required</p>
                    <textarea value={nextSteps} onChange={e => setNextSteps(e.target.value)}
                      placeholder="Describe next steps or parts needed..."
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={requireFollowUp} onChange={e => setRequireFollowUp(e.target.checked)}
                        className="w-4 h-4 accent-orange-500 rounded" />
                      <span className="text-sm text-slate-700">Flag for follow-up visit</span>
                    </label>
                  </div>
                )}

                {/* ── Upsell Opportunity ──────────────────────────────────── */}
                <div className={`rounded-2xl border-2 transition-all ${upsellFlagged ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'} p-4`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={upsellFlagged}
                      onChange={e => setUpsellFlagged(e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-violet-600 rounded flex-shrink-0 cursor-pointer"
                    />
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${upsellFlagged ? 'text-violet-900' : 'text-slate-800'}`}>
                        🌟 Flag upsell opportunity
                      </p>
                      <p className={`text-xs mt-0.5 ${upsellFlagged ? 'text-violet-700' : 'text-slate-500'}`}>
                        Spotted an upgrade, expansion, or new service the client might want? Flag it — earns you +150 XP and creates a sales lead.
                      </p>
                    </div>
                  </label>
                  {upsellFlagged && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={upsellNotes}
                        onChange={e => setUpsellNotes(e.target.value)}
                        placeholder="Describe the opportunity (e.g., client interested in battery storage, aging panels, monitoring upgrade, panel expansion...)"
                        rows={3}
                        autoFocus
                        className="w-full px-3 py-2 border-2 border-violet-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      />
                      <p className="text-xs text-violet-600 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        A sales lead will be created when you complete the job — +150 XP bonus
                      </p>
                    </div>
                  )}
                </div>

                {/* ── XP Live Preview ─────────────────────────────────────── */}
                <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 overflow-hidden">
                  <button
                    onClick={() => setShowXpBreakdown(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-bold text-orange-800">Report Quality</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-orange-600">+{previewXp.earned} XP</span>
                      {showXpBreakdown ? <ChevronUp className="w-4 h-4 text-orange-400" /> : <ChevronDown className="w-4 h-4 text-orange-400" />}
                    </div>
                  </button>

                  {showXpBreakdown && (
                    <div className="px-4 pb-4 space-y-1">
                      {previewXp.items.map((item, i) => (
                        <div key={i} className={`flex items-center justify-between text-xs ${item.achieved ? 'text-slate-700' : 'text-slate-400'}`}>
                          <span className="flex items-center gap-1.5">
                            <span>{item.achieved ? '✅' : '⬜'}</span>
                            {item.label}
                          </span>
                          <span className={`font-semibold ${item.achieved ? 'text-orange-600' : 'text-slate-300'}`}>
                            +{item.points}
                          </span>
                        </div>
                      ))}
                      <div className="pt-2 mt-2 border-t border-orange-200 flex justify-between text-xs font-bold text-orange-800">
                        <span>Potential if you complete all</span>
                        <span>+{previewXp.possible} XP</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SAFETY TAB ────────────────────────────────────────────────── */}
            {activeTab === 'safety' && (
              <div className="space-y-4">
                <div className={`rounded-2xl border-2 p-4 transition-all ${
                  safetyConcern ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
                }`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={safetyConcern} onChange={e => setSafetyConcern(e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-red-500 rounded flex-shrink-0 cursor-pointer" />
                    <div>
                      <p className={`font-semibold text-sm ${safetyConcern ? 'text-red-800' : 'text-slate-800'}`}>
                        Safety concerns identified on this job site
                      </p>
                      <p className={`text-xs mt-0.5 ${safetyConcern ? 'text-red-600' : 'text-slate-500'}`}>
                        Check this box if you observed any safety hazards, PPE issues, roof conditions, heat exposure, electrical risks, or other safety-relevant observations.
                      </p>
                    </div>
                  </label>

                  {safetyConcern && (
                    <div className="mt-4 space-y-2">
                      <label className="block text-xs font-semibold text-red-700 uppercase tracking-wide">
                        Safety Concern Details <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={safetyDetails}
                        onChange={e => setSafetyDetails(e.target.value)}
                        placeholder="Describe the safety concern in detail. Include location, severity, and any immediate actions taken..."
                        rows={5}
                        className="w-full px-3 py-2 border-2 border-red-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                        autoFocus
                      />
                      <p className="text-xs text-red-600">
                        This report will be flagged for review by the ConexSol safety team.
                      </p>
                    </div>
                  )}
                </div>

                {!safetyConcern && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    No safety concerns reported for this job.
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-600">Safety reminders for this job:</p>
                  {(currentWeather === 'rainy') && <p>• Wet metal roof surfaces — do not perform roof work in rain</p>}
                  {(currentWeather === 'windy') && <p>• Wind conditions — check gusts before handling panels on roof</p>}
                  <p>• Fall protection required for any roof pitch &gt; 4:12</p>
                  <p>• Hydrate every 20 min in outdoor heat — monitor for heat illness</p>
                  <p>• Verify LOTO before touching any electrical connections</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── COMPLETED ───────────────────────────────────────────────────── */}
        {phase === 'completed' && (
          <div className="space-y-4">
            {/* Hero success */}
            <div className="bg-emerald-600 rounded-2xl p-6 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-9 h-9 text-white" />
              </div>
              <h2 className="text-xl font-bold">Call Complete</h2>
              <p className="text-emerald-200 text-sm mt-1">
                {job.completedAt && new Date(job.completedAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
              {job.startedAt && job.completedAt && (() => {
                const mins = Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 60000);
                return (
                  <p className="text-white font-bold text-2xl mt-2">
                    {Math.floor(mins/60) > 0 ? `${Math.floor(mins/60)}h ` : ''}{mins % 60}m on site
                  </p>
                );
              })()}
            </div>

            {/* XP earned summary */}
            {(() => {
              const data = loadXpData(contractorId);
              const level = getLevelInfo(data.totalXp);
              const progress = getLevelProgress(data.totalXp);
              const next = getNextLevel(data.totalXp);
              const jobEntry = data.jobHistory.find(h => h.jobId === job.id);
              if (!jobEntry) return null;
              return (
                <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-4 text-white">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span className="font-bold text-sm">XP Earned This Job</span>
                    </div>
                    <span className="text-xl font-black">+{jobEntry.xp} XP</span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-orange-200">{level.emoji} {level.name} · {data.totalXp.toLocaleString()} XP total</span>
                    {next && <span className="text-orange-200">{(next.minXp - data.totalXp).toLocaleString()} to {next.name}</span>}
                  </div>
                  <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full" style={{ width: `${progress * 100}%` }} />
                  </div>
                </div>
              );
            })()}

            {/* Invoice & notifications */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Client Invoice
              </h3>

              {!invoiceSent ? (
                <div className="flex items-center gap-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Generating invoice...</p>
                    <p className="text-xs text-amber-600">Sending to {job.customerEmail || 'client'}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">Invoice sent to client</p>
                      <p className="text-xs text-emerald-600">{job.customerEmail || job.customerName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-800">SMS notification sent</p>
                      <p className="text-xs text-emerald-600">{job.customerPhone}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Your payment */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Your Payment
              </h3>
              <div className="flex items-center justify-between px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div>
                  <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Work order earnings</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    {job.contractorPayUnit === 'flat' ? 'Flat rate' : `${job.contractorPayRate}/hr`}
                  </p>
                </div>
                <p className="text-2xl font-bold text-emerald-700">${job.contractorTotalPay.toFixed(2)}</p>
              </div>
              {job.partsReimbursementRequested && job.parts?.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800">Parts reimbursement pending</p>
                    <p className="text-xs text-blue-600">${job.partsAmount?.toFixed(2)} — under review by accounting</p>
                  </div>
                </div>
              )}
              {/* Contractor invoice number */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Your Invoice # (submitted for payment)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={contractorInvoiceNumber}
                    onChange={e => setContractorInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-2026-001"
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <button
                    onClick={() => {
                      const updated = { ...job, contractorInvoiceNumber: contractorInvoiceNumber.trim() };
                      onUpdateJob(updated);
                    }}
                    disabled={contractorInvoiceNumber.trim() === (job.contractorInvoiceNumber ?? '')}
                    className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Save
                  </button>
                </div>
                {job.contractorInvoiceNumber && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Saved: {job.contractorInvoiceNumber}
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-400 text-center">Payment processed after accounting review</p>
            </div>

            {/* Google Review CTA */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-slate-900">Ask for a Google Review</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Send the client our Google review link — reviews help our business grow and support your continued work.
              </p>
              <a
                href="https://g.page/r/YOUR-GOOGLE-REVIEW-LINK/review"
                target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                <Star className="w-5 h-5" />
                Open Google Review Link
              </a>
              <p className="text-xs text-slate-400 text-center mt-2">
                Copy the link and share it with {job.customerName} via text or email
              </p>
            </div>

            {/* Upsell confirmation */}
            {job.upsellLeadCreated && (
              <div className="bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Sales Lead Created!</p>
                    <p className="text-violet-200 text-xs">+150 XP upsell bonus earned</p>
                  </div>
                </div>
                {job.upsellNotes && (
                  <p className="text-xs text-violet-200 bg-white/10 rounded-xl px-3 py-2 mt-2">
                    "{job.upsellNotes}"
                  </p>
                )}
                <p className="text-xs text-violet-300 mt-2">
                  The sales team has been notified and will follow up with {job.customerName}.
                </p>
              </div>
            )}

            {/* Upsell XP toast (shown only on this session's completion) */}
            {upsellXp && !job.upsellLeadCreated && (
              <div className="bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl p-4 text-white text-center">
                <p className="text-2xl font-black">+{upsellXp} XP</p>
                <p className="text-violet-200 text-sm">Upsell referral bonus</p>
              </div>
            )}

            {/* Job summary */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="font-semibold text-slate-900">Job Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">System Status</span>
                  <span className={`font-semibold ${
                    job.serviceStatus === 'fully_operational' ? 'text-emerald-700' :
                    job.serviceStatus === 'partially_operational' ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {job.serviceStatus?.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) ?? 'Fully Operational'}
                  </span>
                </div>
                {(isInverterJob
                  ? ['old_serial','string_voltage','cabinet_old','cabinet_new','new_serial','inv_overview'] as PhotoCategory[]
                  : [...(['before','serial','parts','process','after'] as PhotoCategory[]), ...(job.isNewInstall ? ['progress','ppe'] as PhotoCategory[] : [])]
                ).map(cat => {
                  const labelMap: Partial<Record<PhotoCategory, string>> = {
                    old_serial: 'Old Serial #', string_voltage: 'String Voltages',
                    cabinet_old: 'Old Cabinet', cabinet_new: 'New Cabinet',
                    new_serial: 'New Serial #', inv_overview: 'Wall Overview',
                  };
                  return (
                    <div key={cat} className="flex justify-between">
                      <span className="text-slate-500">{labelMap[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1)} photos</span>
                      <span className="font-medium">{photos[cat]?.length ?? 0}</span>
                    </div>
                  );
                })}
                {parts.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Parts used</span>
                    <span className="font-medium">{parts.length}</span>
                  </div>
                )}
                {safetyConcern && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs text-red-700 font-semibold">Safety concern flagged for review</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Fixed bottom CTAs ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 pb-safe">
        {phase === 'pre_start' && (
          <button
            onClick={handleStartCall}
            className="w-full flex items-center justify-center gap-2 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-base transition-colors cursor-pointer"
          >
            <Play className="w-6 h-6" />
            Start Call
          </button>
        )}

        {phase === 'active' && (
          <button
            onClick={() => {
              // Safety validation
              if (safetyConcern && !safetyDetails.trim()) {
                setActiveTab('safety');
                return;
              }
              setShowAfterModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-base transition-colors cursor-pointer"
          >
            <CheckCircle className="w-6 h-6" />
            Complete Call
          </button>
        )}

        {phase === 'completed' && (
          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 text-white font-bold rounded-xl text-sm cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
        )}
      </div>
    </div>
  );
};

export default JobDetail;
