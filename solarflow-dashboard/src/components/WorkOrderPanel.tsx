// WorkOrderPanel — full WO create/edit slide-over
// Opened from SiteProfilePanel or SolarEdgeMonitoring

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  X, ChevronRight, Plus, Trash2, Upload, FileText,
  CheckCircle, Clock, AlertTriangle, DollarSign, Wrench,
  Camera, ClipboardList, Package, ZapOff, Zap, UserCheck,
  ShieldCheck, ReceiptText, Banknote, TrendingUp, TrendingDown, Users,
  RotateCcw, History, Navigation, Loader2, RefreshCw,
} from 'lucide-react';
import { Job, WOStatus, WOLineItem, WOPhoto, WOServiceStatus, WO_TO_JOB_STATUS, RMAEntry, AuditEntry } from '../types';
import { updateClientStatus } from '../lib/siteProfileStore';
import { createXeroQuote, isXeroConnected } from '../lib/xeroService';
import { Contractor, ContractorJob, JobPriority, ServiceRate } from '../types/contractor';
import { loadServiceRates } from '../lib/contractorStore';
import { searchParts, CatalogPart } from '../lib/partsCatalog';
import { AddressAutocomplete, GMAPS_KEY_STORAGE, loadGoogleMaps } from './AddressAutocomplete';
import { AddressLink } from './AddressLink';

// ─── constants ────────────────────────────────────────────────────────────────

const WO_STAGES: { key: WOStatus; label: string; short: string }[] = [
  { key: 'draft',          label: 'Draft',           short: 'Draft' },
  { key: 'quote_sent',     label: 'Quote Sent',      short: 'Quote' },
  { key: 'quote_approved', label: 'Quote Approved',  short: 'Approved' },
  { key: 'scheduled',      label: 'Scheduled',       short: 'Sched.' },
  { key: 'in_progress',    label: 'In Progress',     short: 'Active' },
  { key: 'completed',      label: 'Completed',       short: 'Done' },
  { key: 'invoiced',       label: 'Invoiced',        short: 'Invoiced' },
  { key: 'paid',           label: 'Paid',            short: 'Paid' },
];

const STAGE_INDEX: Record<WOStatus, number> = Object.fromEntries(
  WO_STAGES.map((s, i) => [s.key, i])
) as Record<WOStatus, number>;

const ACTION_CONFIG: Record<WOStatus, { label: string; color: string } | null> = {
  draft:          { label: 'Send Quote',          color: 'bg-blue-600 hover:bg-blue-700' },
  quote_sent:     { label: 'Mark Quote Approved', color: 'bg-violet-600 hover:bg-violet-700' },
  contact_client: { label: 'Contact Client',      color: 'bg-cyan-600 hover:bg-cyan-700' },
  quote_approved: { label: 'Schedule & Assign',   color: 'bg-orange-600 hover:bg-orange-700' },
  scheduled:      { label: 'Start Work',          color: 'bg-amber-500 hover:bg-amber-600' },
  in_progress:    { label: 'Mark Complete',       color: 'bg-green-600 hover:bg-green-700' },
  completed:      { label: 'Generate Invoice',    color: 'bg-blue-600 hover:bg-blue-700' },
  invoiced:       { label: 'Mark Paid',           color: 'bg-emerald-700 hover:bg-emerald-800' },
  paid:           null,
};

// Service-account WOs skip the quote flow — admin approval replaces it
const SERVICE_ACCOUNT_ACTIONS: Record<WOStatus, { label: string; color: string; adminOnly?: boolean } | null> = {
  draft:          { label: 'Submit for Admin Approval', color: 'bg-blue-600 hover:bg-blue-700' },
  quote_sent:     { label: 'Approve Expense',           color: 'bg-violet-600 hover:bg-violet-700', adminOnly: true },
  contact_client: { label: 'Contact Client',            color: 'bg-cyan-600 hover:bg-cyan-700' },
  quote_approved: { label: 'Schedule',                  color: 'bg-orange-600 hover:bg-orange-700' },
  scheduled:      { label: 'Start Work',                color: 'bg-amber-500 hover:bg-amber-600' },
  in_progress:    { label: 'Mark Complete',             color: 'bg-green-600 hover:bg-green-700' },
  completed:      { label: 'Close Expense',             color: 'bg-blue-600 hover:bg-blue-700' },
  invoiced:       { label: 'Mark Settled',              color: 'bg-emerald-700 hover:bg-emerald-800' },
  paid:           null,
};

const SE_COMP_SERVICE_TYPES = new Set(['repair', 'maintenance']); // expand as needed

const NEXT_STATUS: Record<WOStatus, WOStatus | null> = {
  draft:          'quote_sent',
  quote_sent:     'quote_approved',
  contact_client: 'scheduled',
  quote_approved: 'scheduled',
  scheduled:      'in_progress',
  in_progress:    'completed',
  completed:      'invoiced',
  invoiced:       'paid',
  paid:           null,
};

const LINE_ITEM_TYPES: WOLineItem['type'][] = ['labor', 'part', 'other'];
const PHOTO_CATEGORIES: WOPhoto['category'][] = ['before', 'after', 'serial', 'process', 'parts'];

const PHOTO_CATEGORY_LABELS: Record<WOPhoto['category'], string> = {
  before:  'Before',
  after:   'After',
  serial:  'Serial #',
  process: 'In Progress',
  parts:   'Parts / Equipment',
};

const SERVICE_STATUS_OPTIONS: { key: WOServiceStatus; label: string; icon: React.ReactNode }[] = [
  { key: 'fully_operational',    label: 'Fully Operational',      icon: <Zap className="w-4 h-4 text-emerald-600" /> },
  { key: 'partially_operational',label: 'Partially Operational',  icon: <ZapOff className="w-4 h-4 text-amber-600" /> },
  { key: 'pending_parts',        label: 'Pending Parts',          icon: <Package className="w-4 h-4 text-blue-600" /> },
  { key: 'could_not_complete',   label: 'Could Not Complete',     icon: <AlertTriangle className="w-4 h-4 text-red-600" /> },
];

// ─── constants ────────────────────────────────────────────────────────────────

const OFFICE_ADDRESS = '814 Ponce de Leon Blvd, Coral Gables, FL 33134'; // HQ — update in Settings

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns driving distance in miles via Google Maps DistanceMatrixService.
 *  Falls back to Nominatim + OSRM if no Google Maps API key is configured. */
async function calcDrivingMiles(origin: string, destination: string): Promise<number> {
  const apiKey = sessionStorage.getItem(GMAPS_KEY_STORAGE)
    || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string)
    || '';

  // ── Google Maps path ───────────────────────────────────────────────────────
  if (apiKey) {
    try {
      await loadGoogleMaps(apiKey);
      const google = (window as any).google;
      if (google?.maps?.DistanceMatrixService) {
        return new Promise<number>((resolve, reject) => {
          const svc = new google.maps.DistanceMatrixService();
          svc.getDistanceMatrix(
            {
              origins: [origin],
              destinations: [destination],
              travelMode: google.maps.TravelMode.DRIVING,
              unitSystem: google.maps.UnitSystem.IMPERIAL,
            },
            (response: any, status: string) => {
              if (status !== 'OK') { reject(new Error(`DistanceMatrix: ${status}`)); return; }
              const el = response?.rows?.[0]?.elements?.[0];
              if (el?.status !== 'OK') { reject(new Error(`Element status: ${el?.status}`)); return; }
              // distance.value is in metres
              resolve(Math.round(el.distance.value / 1609.34));
            }
          );
        });
      }
    } catch (e) {
      console.warn('[calcDrivingMiles] Google Maps failed, falling back to OSRM:', e);
    }
  }

  // ── Fallback: Nominatim geocode + OSRM routing ─────────────────────────────
  const geocode = async (addr: string) => {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'SolarOps/1.0' } }
    );
    if (!r.ok) throw new Error(`Nominatim failed: ${r.status}`);
    const d = await r.json();
    if (!d[0]) throw new Error(`Address not found: ${addr}`);
    return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) };
  };
  const [o, t] = await Promise.all([geocode(origin), geocode(destination)]);
  const route = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${t.lon},${t.lat}?overview=false`
  );
  if (!route.ok) throw new Error(`OSRM failed: ${route.status}`);
  const rd = await route.json();
  if (rd.code !== 'Ok') throw new Error(`OSRM error: ${rd.code}`);
  return Math.round(rd.routes[0].distance / 1609.34);
}

const generateWONumber = (): string => {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(Date.now()).slice(-5);
  return `WO-${yymm}-${seq}`;
};

const newLineItem = (): WOLineItem => ({
  id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  type: 'labor',
  description: '',
  quantity: 1,
  unitCost: 0,
  totalCost: 0,
});

const calcLineItemTotal = (item: WOLineItem) =>
  Math.round(item.quantity * item.unitCost * 100) / 100;

const sumLineItems = (items: WOLineItem[]) => {
  const labor = items.filter(i => i.type === 'labor').reduce((a, i) => a + i.totalCost, 0);
  const parts = items.filter(i => i.type !== 'labor').reduce((a, i) => a + i.totalCost, 0);
  return { labor, parts, total: labor + parts };
};

// ─── Parts catalog autocomplete ───────────────────────────────────────────────

const PartDescriptionInput: React.FC<{
  value: string;
  partNumber: string;
  type: WOLineItem['type'];
  onChange: (desc: string) => void;
  onPartNumberChange: (pn: string) => void;
  onSelect: (part: CatalogPart) => void;
}> = ({ value, type, onChange, onSelect }) => {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CatalogPart[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keep query in sync when parent resets the row
  React.useEffect(() => { setQuery(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    if (type === 'part' && v.length >= 2) {
      setResults(searchParts(v));
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSelect = (part: CatalogPart) => {
    setQuery(part.name);
    setOpen(false);
    onSelect(part);
  };

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={handleChange}
        onFocus={() => { if (type === 'part' && query.length >= 2) setOpen(true); }}
        placeholder="Description…"
        className="w-full text-sm border-0 focus:outline-none bg-transparent"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 top-full z-50 w-72 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {results.map(part => (
            <button
              key={part.id}
              type="button"
              onMouseDown={() => handleSelect(part)}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-0"
            >
              <div className="text-sm font-medium text-slate-800 truncate">{part.name}</div>
              <div className="text-xs text-slate-400">
                {part.partNumber || part.sku}
                <span className="ml-2 capitalize text-slate-300">{part.category}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── types ────────────────────────────────────────────────────────────────────

export interface WorkOrderPanelProps {
  job?: Job;                // existing WO (edit) or undefined (create)
  siteId: string;
  siteName: string;
  clientId?: string;
  siteAddress?: string;
  siteInstallDate?: string; // ISO date — used for SE compensation eligibility check
  clientPaidJobCount?: number; // number of paid/closed WOs for this client — triggers recurring discount
  onClose: () => void;
  onSave: (job: Partial<Job>) => void;
  onDeleteJob?: (jobId: string) => void;
  onUpdateSiteStatus?: (siteId: string, status: string) => void;
  onDispatch?: (job: ContractorJob) => void;
  contractors?: Contractor[];
  technicians?: { id: string; name: string }[];
  currentUserName?: string;
  currentUserRole?: string; // 'admin' | 'coo' | 'technician'
  xeroConnected?: boolean;
  customer?: import('../types').Customer;
  onQuoteSent?: (quoteId: string, quoteNumber: string, onlineUrl: string) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export const WorkOrderPanel: React.FC<WorkOrderPanelProps> = ({
  job,
  siteId,
  siteName,
  clientId,
  siteAddress,
  siteInstallDate,
  clientPaidJobCount = 0,
  onClose,
  onSave,
  onDeleteJob,
  onUpdateSiteStatus,
  onDispatch,
  contractors = [],
  technicians = [],
  currentUserName = 'Staff',
  currentUserRole = 'technician',
  xeroConnected,
  customer,
  onQuoteSent,
}) => {
  const isNew = !job;
  const xeroReady = xeroConnected ?? isXeroConnected();
  const serviceRates: ServiceRate[] = loadServiceRates();

  // Core form state
  const [woStatus, setWoStatus] = useState<WOStatus>(job?.woStatus ?? 'draft');
  const [title, setTitle]           = useState(job?.title ?? '');
  const [serviceType, setServiceType] = useState(job?.serviceType ?? '');
  // Initialize serviceCode - if job has serviceType but no serviceCode, try to match from rates
  const [serviceCode, setServiceCode] = useState(() => {
    if (job?.serviceCode) return job.serviceCode;
    if (job?.serviceType) {
      const rates = loadServiceRates();
      const matched = rates.find(r => r.serviceName === job.serviceType);
      return matched?.serviceCode ?? '';
    }
    return '';
  });
  const [scheduledDate, setScheduledDate] = useState(job?.scheduledDate ?? new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState(job?.scheduledTime ?? '08:00');
  const [urgency, setUrgency]       = useState(job?.urgency ?? 'medium');
  const [notes, setNotes]           = useState(job?.notes ?? '');
  const [quoteAmount, setQuoteAmount] = useState<number>(job?.quoteAmount ?? 0);
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  // RMA — pre-populate with PowerCare case number for new WOs
  const defaultRmaEntries: RMAEntry[] = (() => {
    if (job?.rmaEntries) return job.rmaEntries;
    if (!job && customer?.isPowerCare && customer.powerCareCaseNumber) {
      return [{
        id: `rma-pc-${Date.now()}`,
        manufacturer: 'SolarEdge',
        partDescription: 'PowerCare Program',
        rmaNumber: customer.powerCareCaseNumber,
        status: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      }];
    }
    return [];
  })();
  const [rmaEntries, setRmaEntries] = useState<RMAEntry[]>(defaultRmaEntries);
  const [showRmaForm, setShowRmaForm] = useState(false);
  const [rmaForm, setRmaForm] = useState({ manufacturer: '', partDescription: '', rmaNumber: '', status: 'pending' as RMAEntry['status'] });
  // Travel miles
  const [travelMiles, setTravelMiles] = useState<number>(job?.travelMiles ?? 0);
  const [travelCalcStatus, setTravelCalcStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    job?.travelMiles ? 'done' : 'idle'
  );
  const [travelFromAddress, setTravelFromAddress] = useState(OFFICE_ADDRESS);
  // Audit trail
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(job?.auditLog ?? []);
  // Delete confirmation (0=idle, 1=first confirm, 2=confirmed)
  const [deleteStep, setDeleteStep] = useState(0);
  // Xero quote state
  const [quoteSending, setQuoteSending] = useState(false);
  const [quoteResult, setQuoteResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [technicianId, setTechnicianId] = useState(job?.technicianId ?? '');
  const [isPowercare, setIsPowercare] = useState(job?.isPowercare ?? false);
  const [laborHours, setLaborHours] = useState<number>(job?.laborHours ?? 1);
  const [partsCostDirect, setPartsCostDirect] = useState<number>(job?.partsCost ?? 0);

  // Line items
  const [lineItems, setLineItems]   = useState<WOLineItem[]>(job?.lineItems ?? []);

  // Photos
  const [woPhotos, setWoPhotos]     = useState<WOPhoto[]>(job?.woPhotos ?? []);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<WOPhoto['category']>('before');

  // Service report
  const [serviceReport, setServiceReport]   = useState(job?.serviceReport ?? '');
  const [serviceStatus, setServiceStatus]   = useState<WOServiceStatus | undefined>(job?.serviceStatus);
  const [requiresFollowUp, setRequiresFollowUp] = useState(job?.requiresFollowUp ?? false);
  const [nextSteps, setNextSteps]           = useState(job?.nextSteps ?? '');
  const [jobCompletion, setJobCompletion]   = useState<number>(job?.jobCompletion ?? 0);

  // Contractor assignment
  const [assignedContractorId, setAssignedContractorId] = useState(job?.contractorId ?? '');
  const [contractorPayRate, setContractorPayRate] = useState<number>(job?.contractorPayRate ?? 125);
  const [contractorPayUnit, setContractorPayUnit] = useState<'hour' | 'flat'>(job?.contractorPayUnit ?? 'flat');

  // Serial number tracking (inverter / optimizer swaps)
  const [sowOldSN, setSowOldSN] = useState(job?.oldSerialNumber ?? '');
  const [sowNewSN, setSowNewSN] = useState(job?.newSerialNumber ?? '');
  const snOldCamRef = useRef<HTMLInputElement>(null);
  const snNewCamRef = useRef<HTMLInputElement>(null);

  // Service-type helpers
  const isInverterJob  = serviceType.toLowerCase().includes('inverter');
  const isOptimizerJob = serviceType.toLowerCase().includes('optimizer');
  const isSerialJob    = isInverterJob || isOptimizerJob;

  // Preset parts by job type (injected when SOW modal opens)
  const INVERTER_PARTS = [
    { description: 'Conduit 3/4" Metal Coupling',        quantity: 2, unitCost: 3.50 },
    { description: 'Liquid Tight 3/4"',                  quantity: 1, unitCost: 12.00 },
    { description: 'Liquid Tight 3/4" 180° Connector',   quantity: 1, unitCost: 8.50 },
    { description: '3/4" Liquid Tight 90° Connector',    quantity: 2, unitCost: 7.00 },
  ];
  const OPTIMIZER_PARTS = [
    { description: 'MC4 Connector',                      quantity: 2, unitCost: 2.50 },
  ];

  const injectPresetParts = () => {
    const presets = isInverterJob ? INVERTER_PARTS : isOptimizerJob ? OPTIMIZER_PARTS : [];
    if (presets.length === 0) return;
    setLineItems(prev => {
      const existingDescs = new Set(prev.map(i => i.description.toLowerCase()));
      const toAdd = presets
        .filter(p => !existingDescs.has(p.description.toLowerCase()))
        .map(p => ({
          ...newLineItem(),
          type: 'part' as WOLineItem['type'],
          description: p.description,
          quantity: p.quantity,
          unitCost: p.unitCost,
          totalCost: p.quantity * p.unitCost,
        }));
      return [...prev, ...toAdd];
    });
  };

  // BarcodeDetector QR scan helper (Chrome/Safari native, no library needed)
  const scanBarcodeFromFile = async (
    file: File,
    onResult: (sn: string) => void
  ) => {
    if (!('BarcodeDetector' in window)) {
      alert('QR scanning is not supported in this browser. Enter the serial number manually.');
      return;
    }
    try {
      const img = await createImageBitmap(file);
      // @ts-ignore — BarcodeDetector is not yet in TypeScript lib
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'data_matrix', 'code_39'] });
      const barcodes = await detector.detect(img);
      if (barcodes.length > 0) {
        onResult(barcodes[0].rawValue);
      } else {
        alert('No barcode found in image. Enter the serial number manually.');
      }
    } catch {
      alert('Could not read barcode. Enter the serial number manually.');
    }
  };

  const approvedContractors = contractors.filter(c => c.status === 'approved');
  const assignedContractor  = approvedContractors.find(c => c.id === assignedContractorId);

  // SE Compensation
  const [seCompClaimed, setSeCompClaimed] = useState(job?.seCompensationClaimed ?? false);

  // Site age for SE comp eligibility
  const siteAgeYears = useMemo(() => {
    if (!siteInstallDate) return null;
    const installMs = new Date(siteInstallDate).getTime();
    if (isNaN(installMs)) return null;
    return (Date.now() - installMs) / (365.25 * 24 * 3600 * 1000);
  }, [siteInstallDate]);

  // SE compensation: aggregate from warranty SolarEdge parts
  const seCompTotal = useMemo(() =>
    lineItems
      .filter(i => i.isWarrantyPart && i.manufacturer?.toLowerCase().includes('solaredge'))
      .reduce((s, i) => s + (i.seCompAmount || 0), 0),
  [lineItems]);

  const seCompEligible = siteAgeYears !== null && siteAgeYears < 5 && seCompTotal > 0;

  // Service account expense
  const [isServiceAccountExpense, setIsServiceAccountExpense] = useState(job?.isServiceAccountExpense ?? false);
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'coo';

  // Discount — 10% for any of these types
  const isRecurringClient = clientPaidJobCount > 2;
  type DiscountType = 'repeating_client' | 'military' | 'friends_family';
  const [discountType, setDiscountType] = useState<DiscountType | ''>(
    job?.discountType ?? (job?.isRecurringClient ? 'repeating_client' : '')
  );
  const applyRecurringDiscount = discountType !== ''; // kept for legacy compat

  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'parts' | 'photos' | 'report'>('overview');

  // Auto-calc travel miles when siteAddress is available and status is idle
  useEffect(() => {
    if (!siteAddress || travelCalcStatus !== 'idle') return;
    setTravelCalcStatus('loading');
    calcDrivingMiles(travelFromAddress, siteAddress)
      .then(miles => { setTravelMiles(miles); setTravelCalcStatus('done'); })
      .catch(err => {
        console.warn('[WorkOrderPanel] Travel miles calculation failed:', err?.message || err);
        setTravelCalcStatus('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteAddress, travelCalcStatus]);

  // Build ContractorJob from current WO state
  const buildContractorJob = (woNumber: string): ContractorJob => {
    const urgencyToJobPriority = (u: string): JobPriority =>
      u === 'critical' ? 'critical' : u === 'high' ? 'high' : u === 'medium' ? 'normal' : 'low';

    const totalLabor = lineItems.filter(i => i.type === 'labor').reduce((s, i) => s + i.totalCost, 0);
    const totalParts = lineItems.filter(i => i.type !== 'labor').reduce((s, i) => s + i.totalCost, 0);
    const contractorPay = contractorPayUnit === 'flat'
      ? contractorPayRate
      : contractorPayRate * (lineItems.filter(i => i.type === 'labor').reduce((s, i) => s + i.quantity, 0) || 1);

    return {
      id: `cj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceJobId: job?.id,
      contractorId: assignedContractorId,
      customerId: customer?.id ?? '',
      customerName: siteName,
      customerPhone: customer?.phone ?? '',
      customerEmail: customer?.email,
      address: siteAddress ?? customer?.address ?? '',
      city: customer?.city ?? '', state: customer?.state ?? 'FL', zip: customer?.zip ?? '',
      latitude: 0, longitude: 0,
      serviceType: serviceType,
      description: notes || title || `Work Order ${woNumber}`,
      priority: urgencyToJobPriority(urgency),
      status: 'assigned',
      isRecurringClient: applyRecurringDiscount,
      urgency: urgency as ContractorJob['urgency'],
      isPowercare: false,
      scheduledDate,
      scheduledTime,
      estimatedDuration: 120,
      assignedAt: new Date().toISOString(),
      notes,
      photos: { before: [], serial: [], parts: [], process: [], after: [], progress: [], ppe: [], voltage: [], old_serial: [], string_voltage: [], cabinet_old: [], cabinet_new: [], new_serial: [], inv_overview: [] },
      parts: lineItems.filter(i => i.type === 'part').map(i => ({
        id: i.id,
        name: i.description,
        partNumber: i.partNumber ?? '',
        quantity: i.quantity,
        unitPrice: i.unitCost,
        totalPrice: i.totalCost,
      })),
      laborAmount: totalLabor,
      partsAmount: totalParts,
      markupPercent: 0,
      totalAmount: quoteAmount || totalLabor + totalParts,
      contractorPayRate,
      contractorPayUnit,
      contractorTotalPay: contractorPay,
      payRate: contractorPayRate,
      payUnit: contractorPayUnit,
      totalPay: contractorPay,
    };
  };

  // Workflow action: advance status
  const handleWorkflowAction = async () => {
    const next = NEXT_STATUS[woStatus];
    if (!next) return;

    if (isServiceAccountExpense) {
      if (woStatus === 'quote_sent' && !isAdmin) return;
    } else {
      if (woStatus === 'draft') {
        // Send quote via Xero if connected
        if (xeroReady && customer) {
          setQuoteSending(true);
          setQuoteResult(null);
          try {
            const _labor = lineItems.filter(i => i.type === 'labor').reduce((s, i) => s + i.totalCost, 0);
            const _parts = lineItems.filter(i => i.type !== 'labor').reduce((s, i) => s + i.totalCost, 0);
            const jobSnapshot: any = {
              id: job?.id ?? `wo-${Date.now()}`,
              title: title || `WO – ${siteName}`,
              serviceType,
              laborHours,
              laborRate: _labor / (laborHours || 1),
              partsCost: _parts,
            };
            const result = await createXeroQuote({ customer, job: jobSnapshot });
            setQuoteResult(
              result.success
                ? { ok: true, msg: `Quote ${result.quoteNumber ?? ''} sent via Xero` }
                : { ok: false, msg: result.error ?? 'Xero error' }
            );
            if (!result.success) return;
            if (result.quoteId && onQuoteSent) {
              onQuoteSent(result.quoteId, result.quoteNumber ?? '', result.onlineUrl ?? '');
            }
          } catch (e) {
            setQuoteResult({ ok: false, msg: String(e) });
            return;
          } finally {
            setQuoteSending(false);
          }
        }
        updateClientStatus(siteId, 'quote_approval');
        onUpdateSiteStatus?.(siteId, 'quote_approval');
      }
      if (woStatus === 'quote_sent') {
        updateClientStatus(siteId, 'wo_pending');
        onUpdateSiteStatus?.(siteId, 'wo_pending');
      }
    }

    if (woStatus === 'quote_approved' && onDispatch) {
      const woNum = job?.woNumber ?? generateWONumber();
      onDispatch(buildContractorJob(woNum));
      if (!isServiceAccountExpense) {
        updateClientStatus(siteId, 'wo_pending');
        onUpdateSiteStatus?.(siteId, 'wo_pending');
      }
    }

    setWoStatus(next);
    // Auto-save so kanban status stays in sync — panel stays open for further editing
    handleSave(next, true);
  };

  // Line item helpers
  const addLineItem = () => setLineItems(prev => [...prev, newLineItem()]);

  const updateLineItem = (id: string, field: keyof WOLineItem, value: string | number | boolean) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitCost') {
        updated.totalCost = calcLineItemTotal(updated);
      }
      return updated;
    }));
  };

  const removeLineItem = (id: string) => setLineItems(prev => prev.filter(i => i.id !== id));

  // Photo upload
  const handlePhotoFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const photo: WOPhoto = {
          id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: uploadCategory,
          name: file.name,
          dataUrl: e.target?.result as string,
          createdAt: new Date().toISOString(),
        };
        setWoPhotos(prev => [...prev, photo]);
      };
      reader.readAsDataURL(file);
    });
  }, [uploadCategory]);

  const removePhoto = (id: string) => setWoPhotos(prev => prev.filter(p => p.id !== id));

  // RMA
  const handleAddRma = () => {
    if (!rmaForm.manufacturer || !rmaForm.partDescription) return;
    const entry: RMAEntry = {
      id: `rma-${Date.now()}`,
      manufacturer: rmaForm.manufacturer,
      partDescription: rmaForm.partDescription,
      rmaNumber: rmaForm.rmaNumber,
      status: rmaForm.status,
      createdAt: new Date().toISOString(),
      createdBy: currentUserName,
    };
    setRmaEntries(prev => [...prev, entry]);
    setRmaForm({ manufacturer: '', partDescription: '', rmaNumber: '', status: 'pending' });
    setShowRmaForm(false);
  };

  // Delete
  const handleDelete = () => {
    if (deleteStep === 0) { setDeleteStep(1); return; }
    if (deleteStep === 1) { onDeleteJob?.(job!.id); onClose(); }
  };

  // Save — optionally override woStatus (used when auto-saving after stage advance)
  const handleSave = (statusOverride?: WOStatus, keepOpen?: boolean) => {
    const effectiveWoStatus = statusOverride ?? woStatus;
    const { labor, parts, total } = sumLineItems(lineItems);
    const fallbackTotal = laborHours * contractorPayRate + partsCostDirect;
    const baseQuote = quoteAmount > 0 ? quoteAmount : (total > 0 ? total : fallbackTotal);
    const effectiveQuote = applyRecurringDiscount ? baseQuote * 0.9 : baseQuote;
    const partialJob: Partial<Job> = {
      ...(job ?? {}),
      title: title || `WO – ${siteName}`,
      serviceType: serviceType as Job['serviceType'],
      status: WO_TO_JOB_STATUS[effectiveWoStatus],
      woStatus: effectiveWoStatus,
      woNumber: job?.woNumber ?? generateWONumber(),
      scheduledDate,
      scheduledTime,
      notes,
      urgency: urgency as Job['urgency'],
      technicianId: technicianId || undefined,
      serviceCode: serviceCode || undefined,
      laborHours: lineItems.filter(i => i.type === 'labor').reduce((a, i) => a + i.quantity, 0) || laborHours,
      laborRate: contractorPayRate,
      partsCost: parts || partsCostDirect,
      totalAmount: effectiveQuote,
      quoteAmount: effectiveQuote,
      isRecurringClient: applyRecurringDiscount,
      discountType: discountType || undefined,
      solarEdgeSiteId: siteId,
      solarEdgeClientId: clientId,
      siteAddress,
      clientName: siteName,
      contractorId: assignedContractorId || undefined,
      contractorPayRate,
      contractorPayUnit,
      contractorSentAt: effectiveWoStatus === 'scheduled' ? (job?.contractorSentAt ?? new Date().toISOString()) : job?.contractorSentAt,
      lineItems,
      woPhotos,
      serviceReport,
      serviceStatus,
      requiresFollowUp,
      nextSteps,
      jobCompletion: requiresFollowUp ? jobCompletion : undefined,
      isPowercare,
      // SE Compensation
      seCompensationEligible: seCompEligible,
      seCompensationAmount: seCompTotal || undefined,
      seCompensationClaimed: seCompClaimed,
      // Service account
      isServiceAccountExpense,
      requiresAdminApproval: isServiceAccountExpense && !['quote_approved','scheduled','in_progress','completed','invoiced','paid'].includes(effectiveWoStatus),
      rmaEntries,
      travelMiles: travelMiles || undefined,
      // Serial numbers (inverter / optimizer swaps)
      oldSerialNumber: sowOldSN || undefined,
      newSerialNumber: sowNewSN || undefined,
      // Schedule SolarEdge SN sync within 2hrs when WO closes
      snSyncScheduledAt: (isSerialJob && sowNewSN && effectiveWoStatus === 'completed')
        ? (job?.snSyncCompletedAt ? job.snSyncScheduledAt : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString())
        : job?.snSyncScheduledAt,
      auditLog: [
        ...auditLog,
        {
          id: `audit-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userName: currentUserName,
          action: isNew ? 'created' : 'updated',
          details: isNew
            ? `Work order created by ${currentUserName}`
            : `Stage → ${effectiveWoStatus}`,
        },
      ],
    };
    onSave(partialJob);
    // Panel always stays open after save — user closes manually
  };

  // Computed
  const stageIdx = STAGE_INDEX[woStatus];
  const action = isServiceAccountExpense ? SERVICE_ACCOUNT_ACTIONS[woStatus] : ACTION_CONFIG[woStatus];
  const actionAdminOnly = isServiceAccountExpense && SERVICE_ACCOUNT_ACTIONS[woStatus]?.adminOnly;
  const { labor, parts, total } = sumLineItems(lineItems);
  const photosByCategory = PHOTO_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = woPhotos.filter(p => p.category === cat);
    return acc;
  }, {} as Record<WOPhoto['category'], WOPhoto[]>);

  const tabs = [
    { key: 'overview', label: 'Overview',        icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'parts',    label: 'Parts & Labor',   icon: <Wrench className="w-4 h-4" /> },
    { key: 'photos',   label: `Photos${woPhotos.length ? ` (${woPhotos.length})` : ''}`, icon: <Camera className="w-4 h-4" /> },
    { key: 'report',   label: 'Service Report',  icon: <FileText className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-3xl max-h-[92vh] bg-white flex flex-col shadow-2xl rounded-2xl overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="bg-slate-900 px-6 pt-4 pb-3 shrink-0 flex gap-4">
          {/* Left: WO info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                {job?.woNumber ?? 'New Work Order'}
              </span>
              {clientId && (
                <span className="px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs font-mono rounded">
                  {clientId}
                </span>
              )}
              <WOStatusBadge status={woStatus} />
            </div>
            <p className="text-white font-semibold text-lg leading-snug truncate">{siteName}</p>
            {siteAddress && (
              <p className="text-slate-400 text-sm mt-0.5 truncate">{siteAddress}</p>
            )}
          </div>

          {/* Right: logo + close */}
          <div className="flex flex-col items-end justify-between shrink-0 pl-4">
            <div className="overflow-hidden mb-2" style={{ height: 54, width: 172 }}>
              <img
                src="/conexsol-logo.png"
                alt="Conexsol"
                className="brightness-0 invert"
                style={{ width: 172, height: 'auto', marginTop: -24 }}
              />
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Status Pipeline ────────────────────────────────────────── */}
        <div className="bg-slate-800 px-6 py-3 shrink-0">
          <div className="flex items-center gap-0">
            {WO_STAGES.map((stage, idx) => {
              const done    = idx < stageIdx;
              const current = idx === stageIdx;
              const future  = idx > stageIdx;
              return (
                <React.Fragment key={stage.key}>
                  <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      done    ? 'bg-emerald-500' :
                      current ? 'bg-orange-500 ring-2 ring-orange-300' :
                                'bg-slate-600'
                    }`}>
                      {done ? (
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <span className={`text-xs font-bold ${current ? 'text-white' : 'text-slate-400'}`}>
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <span className={`text-[9px] text-center leading-tight truncate w-full text-center ${
                      done    ? 'text-emerald-400' :
                      current ? 'text-orange-300 font-semibold' :
                                'text-slate-500'
                    }`}>
                      {stage.short}
                    </span>
                  </div>
                  {idx < WO_STAGES.length - 1 && (
                    <div className={`h-px flex-1 mb-4 ${idx < stageIdx ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Workflow Action Bar ─────────────────────────────────────── */}
        {action && (
          <div className={`border-b px-6 py-2.5 flex items-center justify-between gap-4 shrink-0 ${
            isServiceAccountExpense ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Clock className="w-4 h-4" />
              {woStatus === 'quote_approved' && !assignedContractorId && !isServiceAccountExpense ? (
                <span className="text-amber-600 font-medium">Assign a contractor first (Overview tab)</span>
              ) : actionAdminOnly && !isAdmin ? (
                <span className="text-violet-600 font-medium">Awaiting admin approval</span>
              ) : woStatus === 'draft' && !serviceCode ? (
                <span className="text-amber-600 font-medium">Select a service to send quote</span>
              ) : (
                <span>Next: <strong className="text-slate-700">{action.label}</strong></span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {/* Xero quote feedback */}
              {quoteResult && (
                <span className={`text-xs font-medium ${quoteResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {quoteResult.msg}
                </span>
              )}
              {woStatus === 'draft' && xeroReady && !quoteResult && (
                <span className="text-xs text-slate-400">Will send via Xero</span>
              )}
              {woStatus === 'draft' && !xeroReady && (
                <span className="text-xs text-amber-500">Xero not connected — quote won't be sent</span>
              )}
              <button
                onClick={handleWorkflowAction}
                disabled={
                  quoteSending ||
                  (woStatus === 'draft' && !serviceCode) ||
                  (woStatus === 'quote_approved' && !assignedContractorId && !isServiceAccountExpense) ||
                  (actionAdminOnly === true && !isAdmin)
                }
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${action.color}`}
              >
                {quoteSending ? 'Sending…' : <>{action.label} <ChevronRight className="inline w-3.5 h-3.5 ml-0.5 -mt-0.5" /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div className="border-b border-slate-200 px-4 md:px-6 shrink-0 bg-white overflow-x-auto">
          <div className="flex gap-1 min-w-max md:min-w-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Job Title</label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder={`WO – ${siteName}`}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                {/* Service — full width, fed from Excel rate table */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Service</label>
                  <select
                    value={serviceCode}
                    onChange={e => {
                      const code = e.target.value;
                      setServiceCode(code);
                      const rate = serviceRates.find(r => r.serviceCode === code);
                      if (rate) {
                        setServiceType(rate.serviceName);
                        setLaborHours(rate.estimatedHours || 1);
                        setContractorPayRate(rate.laborCost || contractorPayRate);
                        if (rate.partsCost) setPartsCostDirect(rate.partsCost);
                        // Auto-fill client quote amount from Client $ rate
                        const clientRate = isPowercare && rate.powercareClientRate
                          ? rate.powercareClientRate
                          : rate.clientRateStandard;
                        if (clientRate) setQuoteAmount(clientRate);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                  >
                    <option value="">Select a service...</option>
                    {serviceRates.filter(r => r.active).map(r => (
                      <option key={r.id} value={r.serviceCode}>{r.serviceName}</option>
                    ))}
                  </select>
                  {serviceCode && (() => {
                    const rate = serviceRates.find(r => r.serviceCode === serviceCode);
                    if (!rate) return null;
                    return (
                      <p className="text-xs text-slate-400 mt-1">
                        {rate.estimatedHours ? `~${rate.estimatedHours}h` : 'Variable'} · Labor ${rate.laborCost ? `$${rate.laborCost}` : '—'}
                        {rate.partsCost ? ` · Parts ~$${rate.partsCost}` : ''}
                        {rate.clientRateStandard ? ` · Client $${rate.clientRateStandard}` : ''}
                        {rate.isPowercareEligible ? ' · PowerCare eligible' : ''}
                        {rate.seCompensation ? ` · SE comp $${rate.seCompensation}` : ''}
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Scheduled Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>

              {/* Contractor */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Contractor</label>
                {approvedContractors.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No approved contractors</p>
                ) : (
                  <select
                    value={assignedContractorId}
                    onChange={e => setAssignedContractorId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                  >
                    <option value="">— Unassigned —</option>
                    {approvedContractors.map(c => (
                      <option key={c.id} value={c.id}>{c.contactName} · {c.businessName}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Labor Hours + Parts Cost + PowerCare */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Labor Hours</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={laborHours}
                    onChange={e => setLaborHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Parts Cost ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={partsCostDirect}
                    onChange={e => setPartsCostDirect(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPowercare}
                      onChange={e => setIsPowercare(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 accent-orange-500"
                    />
                    <span className="font-medium text-xs">PowerCare Client</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high', 'critical'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => setUrgency(u)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                        urgency === u
                          ? u === 'critical' ? 'bg-red-600 text-white'
                          : u === 'high'     ? 'bg-orange-500 text-white'
                          : u === 'medium'   ? 'bg-amber-500 text-white'
                                             : 'bg-slate-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contractor Pay */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1" />
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Pay Rate ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={contractorPayRate}
                    onChange={e => setContractorPayRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Pay Unit</label>
                  <select
                    value={contractorPayUnit}
                    onChange={e => setContractorPayUnit(e.target.value as 'hour' | 'flat')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                  >
                    <option value="hour">Per Hour</option>
                    <option value="flat">Flat Rate</option>
                  </select>
                </div>
              </div>

              {assignedContractor && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    Assigned to <strong>{assignedContractor.contactName}</strong> ({assignedContractor.businessName}) · {contractorPayUnit === 'flat' ? `$${contractorPayRate} flat` : `$${contractorPayRate}/hr`}
                  </span>
                </div>
              )}

              {woStatus === 'quote_approved' && !assignedContractorId && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Assign a contractor before scheduling — required to dispatch the job.</span>
                </div>
              )}

              {/* Discount selector */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Discount</label>
                {isRecurringClient && discountType === '' && (
                  <p className="text-xs text-emerald-600 mb-1.5 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {clientPaidJobCount} completed jobs — eligible for repeating client discount
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'repeating_client', label: 'Repeating Client', icon: '🔁' },
                    { value: 'military',          label: 'Military',         icon: '🎖️' },
                    { value: 'friends_family',    label: 'Friends & Family', icon: '🤝' },
                  ] as const).map(({ value, label, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDiscountType(discountType === value ? '' : value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                        discountType === value
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span>{icon}</span>
                      <span className="flex-1 text-left">{label}</span>
                      {discountType === value && <span className="font-bold text-emerald-600">−10%</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiscountType('')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                      discountType === ''
                        ? 'bg-slate-100 border-slate-400 text-slate-700'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span>🚫</span>
                    <span className="flex-1 text-left">No discount</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Quote Amount ($){discountType && quoteAmount > 0 && (
                    <span className="ml-2 text-emerald-600 font-semibold">
                      → ${(quoteAmount * 0.9).toFixed(2)} after 10% discount
                    </span>
                  )}
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={quoteAmount || ''}
                    onChange={e => setQuoteAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {discountType ? 'Discount applied to this quote' : 'Leave 0 to auto-calculate from line items'}
                </p>
              </div>

              {/* Service account banner */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isServiceAccountExpense}
                    onChange={e => setIsServiceAccountExpense(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-blue-600"
                  />
                  <span className="font-medium">Service Account Expense (internal — not billed to client)</span>
                </label>
              </div>
              {isServiceAccountExpense && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <Banknote className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
                  <div>
                    <p className="font-semibold">Internal Service Account</p>
                    <p className="mt-0.5 text-blue-700">This job is funded from the operations budget, not invoiced to a client. Admin approval is required before scheduling.</p>
                    {!isAdmin && woStatus === 'quote_sent' && (
                      <p className="mt-1 font-semibold text-violet-700">⏳ Awaiting admin approval</p>
                    )}
                    {isAdmin && woStatus === 'quote_sent' && (
                      <p className="mt-1 font-semibold">You can approve this expense in the action bar above.</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Scope of Work / Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Describe the work to be done…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
              </div>

              {/* SE Compensation banner — shown when warranty SolarEdge parts added + site < 5 yrs */}
              {seCompEligible && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-yellow-50 border border-yellow-300 rounded-lg text-xs text-yellow-900">
                  <Zap className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-600" />
                  <div className="flex-1">
                    <p className="font-semibold">
                      SE Compensation Eligible — site is {siteAgeYears!.toFixed(1)} years old
                    </p>
                    <p className="mt-0.5 text-yellow-800">
                      SolarEdge compensates for warranty parts on systems &lt; 5 years old.
                      Total compensation on this WO: <strong>${seCompTotal.toFixed(2)}</strong>
                    </p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={seCompClaimed}
                        onChange={e => setSeCompClaimed(e.target.checked)}
                        className="w-4 h-4 rounded border-yellow-400 accent-yellow-600"
                      />
                      <span className="font-medium">Mark as claimed / billed to SolarEdge</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Site info (readonly) */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Site Info</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-500">Client ID</span>
                  <span className="font-mono text-slate-800">{clientId ?? '—'}</span>
                  <span className="text-slate-500">Site ID</span>
                  <span className="font-mono text-slate-800">{siteId}</span>
                  <span className="text-slate-500">Address</span>
                  <span className="text-slate-800">{siteAddress ?? '—'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Parts & Labor */}
          {activeTab === 'parts' && (
            <div className="p-6 space-y-4">
              {/* Table */}
              {lineItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Description</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Unit $</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Total</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.map(item => (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <select
                                value={item.type}
                                onChange={e => updateLineItem(item.id, 'type', e.target.value)}
                                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none cursor-pointer"
                              >
                                {LINE_ITEM_TYPES.map(t => (
                                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <PartDescriptionInput
                                value={item.description}
                                partNumber={item.partNumber ?? ''}
                                type={item.type}
                                onSelect={(part) => {
                                  updateLineItem(item.id, 'description', part.name);
                                  updateLineItem(item.id, 'partNumber', part.partNumber || part.sku);
                                  if (part.unitCost > 0) updateLineItem(item.id, 'unitCost', part.unitCost);
                                }}
                                onChange={(desc) => updateLineItem(item.id, 'description', desc)}
                                onPartNumberChange={(pn) => updateLineItem(item.id, 'partNumber', pn)}
                              />
                              <div className="flex items-center gap-2 mt-0.5">
                                <input
                                  value={item.partNumber ?? ''}
                                  onChange={e => updateLineItem(item.id, 'partNumber', e.target.value)}
                                  placeholder={item.type === 'part' ? 'Part #' : ''}
                                  className="w-24 text-xs text-slate-400 border-0 focus:outline-none bg-transparent"
                                />
                                {item.type === 'part' && (
                                  <label className="flex items-center gap-1 text-xs cursor-pointer select-none whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={item.isWarrantyPart ?? false}
                                      onChange={e => updateLineItem(item.id, 'isWarrantyPart', e.target.checked)}
                                      className="accent-orange-500"
                                    />
                                    <ShieldCheck className="w-3 h-3 text-orange-400" />
                                    <span className="text-orange-600 font-medium">Warranty</span>
                                  </label>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={item.type === 'labor' ? 0.5 : 1}
                                value={item.quantity}
                                onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-16 text-right text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={item.unitCost}
                                onChange={e => updateLineItem(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                                className="w-20 text-right text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-800">
                              ${item.totalCost.toFixed(2)}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => removeLineItem(item.id)}
                                className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>

                          {/* Warranty sub-row — expands when "Warranty" is checked */}
                          {item.type === 'part' && item.isWarrantyPart && (
                            <tr className="bg-orange-50/60">
                              <td colSpan={6} className="px-4 py-2.5">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-orange-700 uppercase tracking-wide mb-0.5">Manufacturer</label>
                                    <input
                                      value={item.manufacturer ?? ''}
                                      onChange={e => updateLineItem(item.id, 'manufacturer', e.target.value)}
                                      placeholder="SolarEdge, Enphase…"
                                      className="w-full px-2 py-1 text-xs border border-orange-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-semibold text-orange-700 uppercase tracking-wide mb-0.5">RMA / Case #</label>
                                    <input
                                      value={item.rmaNumber ?? item.caseNumber ?? ''}
                                      onChange={e => updateLineItem(item.id, 'rmaNumber', e.target.value)}
                                      placeholder="RMA-XXXXXX or CASE-XXXXXX"
                                      className="w-full px-2 py-1 text-xs border border-orange-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-semibold text-yellow-700 uppercase tracking-wide mb-0.5">SE Comp ($)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={25}
                                      value={item.seCompAmount ?? ''}
                                      onChange={e => updateLineItem(item.id, 'seCompAmount', parseFloat(e.target.value) || 0)}
                                      placeholder="0"
                                      className="w-full px-2 py-1 text-xs border border-yellow-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    />
                                  </div>
                                </div>
                                {item.manufacturer?.toLowerCase().includes('solaredge') && (item.seCompAmount ?? 0) > 0 && siteAgeYears !== null && siteAgeYears < 5 && (
                                  <p className="text-[10px] text-yellow-700 mt-1.5 font-medium">
                                    ⚡ SE Compensation of ${item.seCompAmount} is claimable — site is {siteAgeYears.toFixed(1)} yrs old.
                                  </p>
                                )}
                                {item.manufacturer?.toLowerCase().includes('solaredge') && siteAgeYears !== null && siteAgeYears >= 5 && (
                                  <p className="text-[10px] text-slate-500 mt-1.5">Site is {siteAgeYears.toFixed(1)} yrs old — outside the 5-year SE compensation window.</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                onClick={addLineItem}
                className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-orange-400 hover:text-orange-500 transition-colors cursor-pointer w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Add Line Item
              </button>

              {/* RMA Tracking */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    RMA Tracking
                  </p>
                  <button
                    onClick={() => setShowRmaForm(v => !v)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add RMA
                  </button>
                </div>

                {showRmaForm && (
                  <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Manufacturer *</label>
                        <input
                          value={rmaForm.manufacturer}
                          onChange={e => setRmaForm(f => ({ ...f, manufacturer: e.target.value }))}
                          placeholder="SolarEdge, Enphase…"
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Part Description *</label>
                        <input
                          value={rmaForm.partDescription}
                          onChange={e => setRmaForm(f => ({ ...f, partDescription: e.target.value }))}
                          placeholder="Inverter, optimizer…"
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">RMA / Case #</label>
                        <input
                          value={rmaForm.rmaNumber}
                          onChange={e => setRmaForm(f => ({ ...f, rmaNumber: e.target.value }))}
                          placeholder="RMA-XXXXXX or CASE-XXXXXX"
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Status</label>
                        <select
                          value={rmaForm.status}
                          onChange={e => setRmaForm(f => ({ ...f, status: e.target.value as RMAEntry['status'] }))}
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none cursor-pointer"
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="received">Received</option>
                        </select>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <button
                          onClick={handleAddRma}
                          className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setShowRmaForm(false)}
                          className="px-3 py-1.5 text-slate-600 border border-slate-200 text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {rmaEntries.length === 0 && !showRmaForm && (
                  <p className="text-xs text-slate-400 italic">No RMA entries yet.</p>
                )}

                {rmaEntries.length > 0 && (
                  <div className="space-y-2">
                    {rmaEntries.map(entry => (
                      <div key={entry.id} className="flex items-start justify-between bg-white rounded-lg border border-slate-200 px-3 py-2 text-xs">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800">{entry.manufacturer} — {entry.partDescription}</p>
                          <p className="text-slate-500">
                            {entry.rmaNumber && <span className="font-mono">{entry.rmaNumber}</span>}
                            {!entry.rmaNumber && entry.caseNumber && <span className="font-mono">{entry.caseNumber}</span>}
                          </p>
                          <p className="text-slate-400">By {entry.createdBy} · {new Date(entry.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            entry.status === 'received' ? 'bg-emerald-100 text-emerald-700' :
                            entry.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                          </span>
                          <button
                            onClick={() => setRmaEntries(prev => prev.filter(r => r.id !== entry.id))}
                            className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Travel Miles */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-orange-500" />
                    Travel Miles
                  </p>
                  {travelCalcStatus === 'loading' && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />Calculating…
                    </span>
                  )}
                  {travelCalcStatus === 'done' && (
                    <span className="text-xs text-green-600 font-medium">Auto-calculated</span>
                  )}
                  {travelCalcStatus === 'error' && (
                    <span className="text-xs text-slate-400">Enter manually or
                      <button onClick={() => setTravelCalcStatus('idle')} className="text-orange-500 hover:underline cursor-pointer ml-1">retry</button>
                    </span>
                  )}
                </div>

                {/* Primary: large manual input — always accessible */}
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={travelMiles || ''}
                    placeholder="0"
                    onChange={e => { setTravelMiles(Math.max(0, Number(e.target.value))); setTravelCalcStatus('done'); }}
                    className="w-28 px-3 py-2 text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 text-center bg-slate-50"
                  />
                  <span className="text-sm text-slate-500 font-medium">miles</span>
                  {siteAddress && travelCalcStatus !== 'loading' && (
                    <button
                      onClick={() => { setTravelCalcStatus('idle'); setTravelMiles(0); }}
                      title="Auto-calculate from address"
                      className="ml-auto flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-700 cursor-pointer font-medium"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Auto-calc
                    </button>
                  )}
                </div>

                {/* Secondary: From / To for auto-calc */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-600 shrink-0 w-7">From</span>
                    <AddressAutocomplete
                      value={travelFromAddress}
                      onChange={setTravelFromAddress}
                      onAddressSelect={r => setTravelFromAddress([r.address, r.city, r.state, r.zip].filter(Boolean).join(', '))}
                      placeholder="HQ — 814 Ponce de Leon Blvd"
                      className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                    />
                  </div>
                  {siteAddress && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-600 shrink-0 w-7">To</span>
                      <AddressLink compact fullAddress={siteAddress} className="flex-1 min-w-0" />
                    </div>
                  )}
                </div>
              </div>

              {/* Profit Breakdown Summary */}
              {lineItems.length > 0 && (() => {
                const baseRevenue = quoteAmount > 0 ? quoteAmount : total;
                const revenue    = applyRecurringDiscount ? baseRevenue * 0.9 : baseRevenue;
                const totalCost  = labor + parts;
                const profit     = revenue - totalCost;
                const margin     = revenue > 0 ? (profit / revenue) * 100 : 0;
                const netProfit  = profit + seCompTotal;
                return (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cost Breakdown</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Labor cost</span>
                      <span className="font-medium text-slate-700">${labor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Parts / consumables</span>
                      <span className="font-medium text-slate-700">${parts.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-slate-800 border-t border-slate-200 pt-1.5">
                      <span>Total cost</span>
                      <span>${totalCost.toFixed(2)}</span>
                    </div>

                    <div className="border-t border-slate-200 pt-1.5 mt-0.5 space-y-1">
                      <div className="flex justify-between text-sm font-semibold text-violet-700">
                        <span>
                          {quoteAmount > 0 ? 'Quote / Revenue' : 'Auto-total (cost)'}
                          {discountType && <span className="ml-1.5 text-xs text-emerald-600 font-normal">(−10% discount)</span>}
                        </span>
                        <span>${revenue.toFixed(2)}</span>
                      </div>
                      <div className={`flex justify-between text-sm font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        <span className="flex items-center gap-1">
                          {profit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          Profit (margin {margin.toFixed(0)}%)
                        </span>
                        <span>${profit.toFixed(2)}</span>
                      </div>
                      {seCompTotal > 0 && (
                        <>
                          <div className="flex justify-between text-xs text-yellow-700 font-medium">
                            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> + SE Compensation</span>
                            <span>+${seCompTotal.toFixed(2)}</span>
                          </div>
                          <div className={`flex justify-between text-sm font-bold border-t border-slate-200 pt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            <span>Net incl. SE Comp</span>
                            <span>${netProfit.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Photos */}
          {activeTab === 'photos' && (
            <div className="p-4 space-y-4">

              {/* ── Category chips ─────────────────────────────────────────── */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {PHOTO_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setUploadCategory(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      uploadCategory === cat
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {PHOTO_CATEGORY_LABELS[cat]}
                    {photosByCategory[cat].length > 0 && (
                      <span className={`text-[10px] px-1 py-0.5 rounded-full font-bold ${
                        uploadCategory === cat ? 'bg-white/30 text-white' : 'bg-slate-300 text-slate-600'
                      }`}>
                        {photosByCategory[cat].length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Camera-first action buttons ──────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                {/* Take Photo — opens device camera directly on mobile */}
                <button
                  onClick={() => {
                    const el = document.createElement('input');
                    el.type = 'file';
                    el.accept = 'image/*';
                    el.capture = 'environment';
                    el.onchange = () => handlePhotoFiles(el.files);
                    el.click();
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-5 bg-orange-500 text-white rounded-2xl hover:bg-orange-600 active:scale-95 transition-all cursor-pointer shadow-sm"
                >
                  <Camera className="w-7 h-7" />
                  <span className="text-sm font-semibold">Take Photo</span>
                  <span className="text-[10px] opacity-75 capitalize">{PHOTO_CATEGORY_LABELS[uploadCategory]}</span>
                </button>

                {/* Choose from library */}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-5 bg-slate-800 text-white rounded-2xl hover:bg-slate-900 active:scale-95 transition-all cursor-pointer shadow-sm"
                >
                  <Upload className="w-7 h-7" />
                  <span className="text-sm font-semibold">Choose Files</span>
                  <span className="text-[10px] opacity-75">Multiple OK</span>
                </button>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handlePhotoFiles(e.target.files)}
                />
              </div>

              {/* ── Drop zone (visible when no photos) ─────────────────── */}
              {woPhotos.length === 0 && (
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handlePhotoFiles(e.dataTransfer.files); }}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center"
                >
                  <p className="text-sm text-slate-400">or drag & drop photos here</p>
                </div>
              )}

              {/* ── Photo grid — grouped by category ───────────────────── */}
              {PHOTO_CATEGORIES.map(cat => {
                const photos = photosByCategory[cat];
                if (photos.length === 0) return null;
                return (
                  <div key={cat}>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      {PHOTO_CATEGORY_LABELS[cat]}
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">{photos.length}</span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {photos.map(photo => (
                        <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                          <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                          <button
                            onClick={() => removePhoto(photo.id)}
                            className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-2">
                            <p className="text-white text-[10px] truncate">{photo.name}</p>
                          </div>
                        </div>
                      ))}
                      {/* Inline add button per category */}
                      <button
                        onClick={() => { setUploadCategory(cat); photoInputRef.current?.click(); }}
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-1 hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer text-slate-400 hover:text-orange-500"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-[10px] font-medium">Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Service Report */}
          {activeTab === 'report' && (
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  System Status After Service
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setServiceStatus(opt.key)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-colors cursor-pointer ${
                        serviceStatus === opt.key
                          ? 'border-orange-400 bg-orange-50 text-orange-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Service Report Notes</label>
                <textarea
                  value={serviceReport}
                  onChange={e => setServiceReport(e.target.value)}
                  rows={6}
                  placeholder="Describe what was done, findings, and any observations…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresFollowUp}
                    onChange={e => setRequiresFollowUp(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-orange-500"
                  />
                  <span className="font-medium">Requires Follow-Up Visit</span>
                </label>
              </div>

              {requiresFollowUp && (
                <div className="space-y-3">
                  {/* Job Completion slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-500">Job Completion</label>
                      <span className={`text-sm font-bold tabular-nums ${
                        jobCompletion === 100 ? 'text-emerald-600' :
                        jobCompletion >= 50  ? 'text-orange-500' : 'text-slate-600'
                      }`}>{jobCompletion}%</span>
                    </div>
                    <div className="relative h-2 bg-slate-200 rounded-full">
                      <div
                        className={`absolute left-0 top-0 h-2 rounded-full transition-all ${
                          jobCompletion === 100 ? 'bg-emerald-500' :
                          jobCompletion >= 50  ? 'bg-orange-500' : 'bg-orange-400'
                        }`}
                        style={{ width: `${jobCompletion}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={jobCompletion}
                      onChange={e => setJobCompletion(Number(e.target.value))}
                      className="w-full mt-1 accent-orange-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 -mt-1">
                      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Next Steps</label>
                    <textarea
                      value={nextSteps}
                      onChange={e => setNextSteps(e.target.value)}
                      rows={3}
                      placeholder="What needs to happen next…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Audit Log */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Audit Trail
                </p>
                {auditLog.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No changes recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {[...auditLog].reverse().map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-700">{entry.details}</p>
                          <p className="text-slate-400 mt-0.5">{entry.userName} · {new Date(entry.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {job?.status === 'in_progress' && (
              <button
                onClick={() => setShowQuotePreview(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                Preview Report
              </button>
            )}
            {!isNew && onDeleteJob && (
              deleteStep === 0 ? (
                <button
                  onClick={() => setDeleteStep(1)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-300 rounded-lg">
                  <span className="text-xs font-semibold text-red-700">Delete this WO?</span>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 cursor-pointer"
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setDeleteStep(0)}
                    className="px-3 py-1 text-slate-600 border border-slate-200 text-xs rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-3">
            {isNew ? (
              <span className="text-xs text-slate-400">Creating new work order for <strong>{siteName}</strong></span>
            ) : (
              <span className="text-xs text-slate-400">WO {job?.woNumber}</span>
            )}
            <button
              onClick={() => handleSave()}
              className="px-6 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors cursor-pointer"
            >
              {isNew ? 'Create Work Order' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* ── SOW Report Modal ────────────────────────────────────────────── */}
      {showQuotePreview && (() => {
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const partOnlyItems = lineItems.filter(i => i.type === 'part');
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">SOW Report</h2>
                  <p className="text-xs text-slate-400">Scope of Work · {today}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Print / Save PDF
                  </button>
                  <button onClick={() => setShowQuotePreview(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Scrollable report body */}
              <div className="overflow-y-auto p-6 md:p-8 space-y-6 print:p-0" id="report-print-area">

                {/* ── Client & Site Header ─────────────────────────────── */}
                <div className="bg-slate-900 text-white rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Client</p>
                      <p className="text-lg font-bold truncate">{siteName || customer?.name || 'Unknown Client'}</p>
                      {siteAddress && <p className="text-sm text-slate-300 mt-1">{siteAddress}</p>}
                      {customer?.phone && <p className="text-xs text-slate-400 mt-1">{customer.phone}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Work Order</p>
                      <p className="text-xl font-bold text-orange-400">{job?.woNumber || 'N/A'}</p>
                      <p className="text-xs text-slate-300 mt-0.5">{today}</p>
                    </div>
                  </div>
                </div>

                {/* ── Status & Scope ───────────────────────────────────── */}
                <div className="border-l-4 border-orange-500 pl-4 space-y-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Scope of Work</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <WOStatusBadge status={job?.woStatus || 'draft'} />
                    {serviceType && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{serviceType}</span>
                    )}
                  </div>
                  {(title || notes) && (
                    <div>
                      {title && <p className="text-sm font-semibold text-slate-900">{title}</p>}
                      {notes && <p className="text-sm text-slate-600 whitespace-pre-wrap mt-1">{notes}</p>}
                    </div>
                  )}
                </div>

                {/* ── Serial Numbers (inverter / optimizer only) ────────── */}
                {isSerialJob && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
                      {isInverterJob ? 'Inverter' : 'Optimizer'} Serial Numbers
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Old S/N */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Old Serial Number</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={sowOldSN}
                            onChange={e => setSowOldSN(e.target.value)}
                            placeholder="e.g. 7E1234ABCD"
                            className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono"
                          />
                          <button
                            onClick={() => snOldCamRef.current?.click()}
                            title="Scan QR / barcode"
                            className="px-3 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <input
                            ref={snOldCamRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              await scanBarcodeFromFile(file, setSowOldSN);
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Scan the label QR or enter manually</p>
                      </div>
                      {/* New S/N */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Serial Number</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={sowNewSN}
                            onChange={e => setSowNewSN(e.target.value)}
                            placeholder="e.g. 7E5678WXYZ"
                            className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono"
                          />
                          <button
                            onClick={() => snNewCamRef.current?.click()}
                            title="Scan QR / barcode"
                            className="px-3 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shrink-0"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <input
                            ref={snNewCamRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              await scanBarcodeFromFile(file, setSowNewSN);
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">SolarEdge API update scheduled within 2 hrs of close</p>
                      </div>
                    </div>
                    {/* SN sync status */}
                    {job?.snSyncScheduledAt && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        {job.snSyncCompletedAt ? (
                          <span className="flex items-center gap-1 text-green-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> SolarEdge SN updated {new Date(job.snSyncCompletedAt).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 font-medium">
                            <Clock className="w-3.5 h-3.5" /> SolarEdge update due by {new Date(job.snSyncScheduledAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Parts & Equipment ────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Parts & Equipment</p>
                    {isSerialJob && (
                      <button
                        onClick={injectPresetParts}
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add suggested parts
                      </button>
                    )}
                  </div>
                  {lineItems.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Part / Description</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {partOnlyItems.length > 0
                            ? partOnlyItems.map(item => (
                              <tr key={item.id}>
                                <td className="px-3 py-2 text-slate-800">{item.description}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{item.quantity}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">${item.totalCost.toFixed(2)}</td>
                              </tr>
                            ))
                            : lineItems.map(item => (
                              <tr key={item.id}>
                                <td className="px-3 py-2 text-slate-800">{item.description}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{item.quantity}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-800">${item.totalCost.toFixed(2)}</td>
                              </tr>
                            ))
                          }
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">
                      No parts added yet.{isSerialJob ? ' Use "Add suggested parts" above.' : ''}
                    </p>
                  )}
                </div>

                {/* ── Photos ───────────────────────────────────────────── */}
                {woPhotos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Site Photos</p>
                    {PHOTO_CATEGORIES.map(cat => {
                      const catPhotos = woPhotos.filter(p => p.category === cat);
                      if (catPhotos.length === 0) return null;
                      return (
                        <div key={cat} className="mb-4">
                          <p className="text-xs font-medium text-slate-500 mb-2">{PHOTO_CATEGORY_LABELS[cat]}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {catPhotos.map(photo => (
                              <div key={photo.id} className="bg-slate-100 rounded-lg overflow-hidden aspect-square">
                                <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              </div>{/* end scrollable body */}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── WO Status Badge ──────────────────────────────────────────────────────────

export const WOStatusBadge: React.FC<{ status: WOStatus }> = ({ status }) => {
  const cfg: Record<WOStatus, { label: string; cls: string }> = {
    draft:          { label: 'Draft',           cls: 'bg-slate-500/20 text-slate-300' },
    quote_sent:     { label: 'Quote Sent',       cls: 'bg-blue-500/20 text-blue-300' },
    contact_client: { label: 'Contact Client',   cls: 'bg-cyan-500/20 text-cyan-300' },
    quote_approved: { label: 'Quote Approved',   cls: 'bg-violet-500/20 text-violet-300' },
    scheduled:      { label: 'Scheduled',        cls: 'bg-amber-500/20 text-amber-300' },
    in_progress:    { label: 'In Progress',      cls: 'bg-orange-500/20 text-orange-300' },
    completed:      { label: 'Completed',        cls: 'bg-emerald-500/20 text-emerald-300' },
    invoiced:       { label: 'Invoiced',         cls: 'bg-cyan-500/20 text-cyan-300' },
    paid:           { label: 'Paid',             cls: 'bg-green-500/20 text-green-300' },
  };
  const entry = cfg[status] ?? { label: status, cls: 'bg-slate-500/20 text-slate-300' };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${entry.cls}`}>
      {entry.label}
    </span>
  );
};
