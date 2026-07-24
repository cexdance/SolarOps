// SolarOps, Lead Lobby
// Triage view: all incoming leads land here; admins route, sales reps contact/note
import React, { useState, useMemo, useRef } from 'react';
import { serviceOrderNo } from '../lib/woHelpers';
import { formatMoney } from '../lib/money';
import { authedFetch } from '../lib/supabase';
import * as XLSX from 'xlsx';
import {
  Inbox, Phone, Mail, Plus, Search, ArrowRight, Tag, X,
  Zap, CheckCircle, LayoutGrid, List, ChevronDown, ChevronUp, Upload, Trash2, Link2,
  Camera, Image as ImageIcon, Sparkles, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { loadCRMData, saveCRMData, addLead, CRMData } from '../lib/crmStore';
import { fetchTrelloCard, extractContactInfo } from '../lib/trelloImporter';
import { loadData, saveData } from '../lib/dataStore';
import { Lead, LeadStatus, LeadSource, Job, Customer, CRMAttachment, RMAEntry } from '../types';

interface LeadLobbyProps {
  currentUserId: string;
  currentUserRole?: string;
  customers?: Customer[];
  onAddCustomer?: (customer: Partial<Customer>) => void;
  /** Create a standalone RMA (no work order) from a converted PowerCare lead. */
  onCreateStandaloneRma?: (entry: RMAEntry) => void;
  /** Navigate to a customer card (used when clicking a converted lead). */
  onViewCustomer?: (customerId: string) => void;
}

const salesReps = [
  { id: 'user-7', name: 'Edgar Diaz' },
  { id: 'user-8', name: 'Andreina Lecue' },
];

// ── Source system ─────────────────────────────────────────────────────────────

// Predefined sources in desired display order
export const PREDEFINED_SOURCES: { value: LeadSource; label: string; color: string; bg: string }[] = [
  { value: 'solaredge',           label: 'SolarEdge',           color: 'text-blue-700',   bg: 'bg-blue-100'   },
  { value: 'customer_referral',   label: 'Customer Referral',   color: 'text-green-700',  bg: 'bg-green-100'  },
  { value: 'contractor_referral', label: 'Contractor Referral', color: 'text-teal-700',   bg: 'bg-teal-100'   },
  { value: 'marketing',           label: 'Marketing',           color: 'text-purple-700', bg: 'bg-purple-100' },
  { value: 'google',              label: 'Google',              color: 'text-red-700',    bg: 'bg-red-100'    },
  { value: 'google_forms',        label: 'Google Forms',        color: 'text-red-600',    bg: 'bg-red-50'     },
  { value: 'referral',            label: 'Referral',            color: 'text-emerald-700',bg: 'bg-emerald-100'},
  { value: 'website',             label: 'Website',             color: 'text-indigo-700', bg: 'bg-indigo-100' },
  { value: 'social_media',        label: 'Social Media',        color: 'text-pink-700',   bg: 'bg-pink-100'   },
  { value: 'advertising',         label: 'Advertising',         color: 'text-orange-700', bg: 'bg-orange-100' },
  { value: 'cold_call',           label: 'Cold Call',           color: 'text-amber-700',  bg: 'bg-amber-100'  },
  { value: 'partner',             label: 'Partner',             color: 'text-cyan-700',   bg: 'bg-cyan-100'   },
  { value: 'other',               label: 'Other',               color: 'text-slate-600',  bg: 'bg-slate-100'  },
];

const getSourceBadge = (lead: Lead, _customSources: string[]) => {
  if (lead.source === 'other' && lead.customSource) {
    return { label: lead.customSource, color: 'text-slate-600', bg: 'bg-slate-100' };
  }
  const found = PREDEFINED_SOURCES.find(s => s.value === lead.source);
  return found ?? { label: lead.source, color: 'text-slate-600', bg: 'bg-slate-100' };
};

// ── Kanban column definitions ─────────────────────────────────────────────────

type KanbanCol = 'lead_in' | 'service' | 'sales' | 'lost' | 'converted';

const KANBAN_COLS: {
  id: KanbanCol;
  label: string;
  headerBg: string;
  headerText: string;
  colBg: string;
  colBorder: string;
  emptyText: string;
}[] = [
  { id: 'lead_in',   label: 'Lead In',   headerBg: 'bg-slate-800',   headerText: 'text-white', colBg: 'bg-slate-50',       colBorder: 'border-slate-200',   emptyText: 'No unrouted leads'   },
  { id: 'service',   label: 'Service',   headerBg: 'bg-blue-600',    headerText: 'text-white', colBg: 'bg-blue-50/40',     colBorder: 'border-blue-200',    emptyText: 'No service leads'    },
  { id: 'sales',     label: 'Sales',     headerBg: 'bg-orange-500',  headerText: 'text-white', colBg: 'bg-orange-50/40',   colBorder: 'border-orange-200',  emptyText: 'No sales leads'      },
  { id: 'lost',      label: 'Lost',      headerBg: 'bg-red-500',     headerText: 'text-white', colBg: 'bg-red-50/30',      colBorder: 'border-red-200',     emptyText: 'No lost leads'       },
  { id: 'converted', label: 'Converted', headerBg: 'bg-emerald-600', headerText: 'text-white', colBg: 'bg-emerald-50/40',  colBorder: 'border-emerald-200', emptyText: 'No converted leads'  },
];

// Derive which Kanban column a lead belongs to
const getLeadCol = (lead: Lead): KanbanCol => {
  // Converted → archived in the Converted column (kept for growth tracking)
  if (lead.status === 'closed_won') return 'converted';
  // Lost
  if (lead.status === 'closed_lost' || lead.status === 'not_interested') return 'lost';
  // Routed
  if (lead.leadType === 'service') return 'service';
  if (lead.leadType === 'sales')   return 'sales';
  // Unrouted
  return 'lead_in';
};

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// ── Misc helpers ──────────────────────────────────────────────────────────────

const priorityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-500',
  medium: 'bg-amber-400',
  low:    'bg-slate-400',
};

const statusLabels: Record<LeadStatus, string> = {
  new:            'New',
  attempting:     'Attempting',
  connected:      'Connected',
  appointment:    'Appointment',
  qualified:      'Qualified',
  proposal:       'Proposal',
  closed_won:     'Won',
  closed_lost:    'Lost',
  not_interested: 'Not Interested',
};

interface AddFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  leadType: 'service' | 'sales';
  source: LeadSource | 'custom';
  customSourceLabel: string;
  note: string;
}

interface ParsedRow {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  caseNumber: string;
  rmaNumber: string;
  tracking: string;
  tracking2: string;
  shipDate: string;
  eta: string;
  pod: string;
  oldPart: string;
  oldSerial: string;
  shippedPart: string;
  shippedSerial: string;
}

/** Convert an Excel serial date (e.g. 46001.45) or ISO string to YYYY-MM-DD */
function parseExcelDate(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel epoch: Jan 1, 1900 = serial 1; JS epoch is Unix.
    // 25569 = days between 1900-01-01 and 1970-01-01
    const ms = (val - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

/** Detect carrier from tracking number format and return a tracking URL */
function getTrackingUrl(tracking: string): string {
  const t = tracking.trim().replace(/\s/g, '');
  if (/^1Z/i.test(t)) {
    return `https://www.ups.com/track?tracknum=${t}`;
  }
  if (/^[0-9]{12}$|^[0-9]{15}$|^[0-9]{20,22}$/.test(t)) {
    return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${t}`;
  }
  if (/^9[0-9]{19,21}$/.test(t)) {
    return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${t}`;
  }
  // Default: UPS (SolarEdge ships via UPS)
  return `https://www.ups.com/track?tracknum=${t}`;
}

/** Derive delivery status from dates */
function getDeliveryStatus(shipDate: string, eta: string, pod: string): { label: string; color: string } {
  if (pod) return { label: 'Delivered', color: 'emerald' };
  if (!shipDate) return { label: 'Pending', color: 'slate' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (eta) {
    const etaDate = new Date(eta);
    if (etaDate < today) return { label: 'Check Status', color: 'red' };
    const diffDays = Math.ceil((etaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return { label: 'Arriving Today', color: 'orange' };
    if (diffDays <= 2) return { label: `Arrives in ${diffDays}d`, color: 'amber' };
  }
  return { label: 'In Transit', color: 'blue' };
}

// Parse SolarEdge email body text into form fields
function parseSolarEdgeEmail(text: string): Partial<AddFormData> & { addressNote?: string } {
  const get = (key: string) => text.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? '';
  const address = get('Address');
  const city = get('City');
  const state = get('State');
  const zip = get('Zip Code');
  const addressNote = [address, city, state, zip].filter(Boolean).join(', ');
  return {
    firstName: get('First Name'),
    lastName:  get('Last Name'),
    email:     get('Email'),
    phone:     get('Phone').replace(/^\+?1/, ''),
    source:    'solaredge' as LeadSource,
    leadType:  'service',
    customSourceLabel: '',
    addressNote: addressNote || undefined,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export const LeadLobby: React.FC<LeadLobbyProps> = ({ currentUserRole, customers = [], onAddCustomer, onCreateStandaloneRma, onViewCustomer }) => {
  const [crmData, setCrmData] = useState<CRMData>(() => loadCRMData());
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [dragOverCol, setDragOverCol] = useState<KanbanCol | null>(null);
  const draggedId = useRef<string>('');
  const [lostExpanded, setLostExpanded] = useState(false);
  const [convertedExpanded, setConvertedExpanded] = useState(false);
  // New-source modal
  const [showNewSourceModal, setShowNewSourceModal] = useState(false);
  const [newSourceInput, setNewSourceInput] = useState('');

  const [addFormData, setAddFormData] = useState<AddFormData>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    leadType: 'sales',
    source: 'other',
    customSourceLabel: '',
    note: '',
  });
  const [leadAttachments, setLeadAttachments] = useState<CRMAttachment[]>([]);
  const noteFileRef = useRef<HTMLInputElement>(null);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<'email' | 'excel' | 'trello' | 'screenshot'>('screenshot');

  // Screenshot import
  const [ssPreview,  setSsPreview]  = useState<string | null>(null);
  const [ssLoading,  setSsLoading]  = useState(false);
  const [ssError,    setSsError]    = useState('');
  const [ssOk,       setSsOk]       = useState('');
  const ssInputRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<(Partial<AddFormData> & { addressNote?: string }) | null>(null);
  const [excelRows, setExcelRows] = useState<ParsedRow[]>([]);
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trello import state (leads)
  const [trelloLeadUrl,     setTrelloLeadUrl]     = useState('');
  const [trelloLeadLoading, setTrelloLeadLoading] = useState(false);
  const [trelloLeadError,   setTrelloLeadError]   = useState('');
  const [trelloLeadPreview, setTrelloLeadPreview] = useState<{
    cardName: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    description: string;
  } | null>(null);

  const handleForceSync = async () => {
    setSyncState('syncing');
    try {
      // Re-read localStorage directly so we capture any leads added since mount
      const latest = loadCRMData();
      setCrmData(latest);
      saveCRMData(latest); // pushes to Supabase via the fixed KV_SYNC_KEYS path
      // Give the async push a moment to land, then report success
      setTimeout(() => setSyncState('ok'), 1800);
      setTimeout(() => setSyncState('idle'), 4000);
    } catch {
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 4000);
    }
  };

  const handleTrelloLeadFetch = async () => {
    if (!trelloLeadUrl.trim()) return;
    setTrelloLeadLoading(true);
    setTrelloLeadError('');
    setTrelloLeadPreview(null);
    try {
      const card = await fetchTrelloCard(trelloLeadUrl.trim());
      const contact = extractContactInfo(card);
      // Parse name from card title, strip leading "US-XXXXX " if present
      const namePart = card.name.replace(/^US-\d+\s*/i, '').trim();
      const parts = namePart.split(/\s+/);
      setTrelloLeadPreview({
        cardName:    card.name,
        firstName:   parts[0] ?? '',
        lastName:    parts.slice(1).join(' '),
        phone:       contact.phone,
        email:       contact.email,
        description: card.desc.trim(),
      });
    } catch (err) {
      setTrelloLeadError(err instanceof Error ? err.message : 'Failed to fetch card');
    } finally {
      setTrelloLeadLoading(false);
    }
  };

  const handleTrelloLeadConfirm = () => {
    if (!trelloLeadPreview) return;
    setAddFormData(p => ({
      ...p,
      firstName: trelloLeadPreview.firstName,
      lastName:  trelloLeadPreview.lastName,
      phone:     trelloLeadPreview.phone,
      email:     trelloLeadPreview.email,
      source:    'other' as LeadSource,
      leadType:  'service',
    }));
    if (trelloLeadPreview.description) {
      setPendingAddressNote(trelloLeadPreview.description.slice(0, 400));
    }
    setShowImport(false);
    setTrelloLeadUrl('');
    setTrelloLeadPreview(null);
  };

  const canRoute = ['admin', 'coo', 'support'].includes(currentUserRole ?? '');

  // Site Transfer WO form state
  const [showSiteTxForm, setShowSiteTxForm] = useState(false);
  const [siteTxSiteId, setSiteTxSiteId] = useState('');
  const [siteTxSerial, setSiteTxSerial] = useState('');
  const [siteTxSuccess, setSiteTxSuccess] = useState<{ leadId: string; woNumber: string } | null>(null);

  const customSources: string[] = crmData.customSources ?? [];

  // All leads minus closed_won (converted), drives stats, duplicate detection, list view
  const activeLeads = useMemo(() =>
    crmData.leads.filter(l => l.status !== 'closed_won'),
    [crmData.leads]
  );

  // Converted leads, archived in the Converted column for growth tracking
  const convertedLeads = useMemo(() =>
    crmData.leads.filter(l => l.status === 'closed_won'),
    [crmData.leads]
  );

  // ── Duplicate detection: flag leads that match existing customers ──────────
  const duplicateIndex = useMemo(() => {
    const idx: Record<string, Customer> = {};
    if (!customers.length) return idx;
    for (const lead of activeLeads) {
      const leadName = `${lead.firstName} ${lead.lastName}`.trim().toLowerCase();
      const leadPhone = lead.phone?.replace(/\D/g, '') ?? '';
      const leadEmail = lead.email?.toLowerCase().trim() ?? '';
      for (const c of customers) {
        const custName = (c.name ?? '').toLowerCase();
        const custPhone = (c.phone ?? '').replace(/\D/g, '');
        const custEmail = (c.email ?? '').toLowerCase();
        if (
          (leadPhone && custPhone && leadPhone === custPhone) ||
          (leadEmail && custEmail && leadEmail === custEmail) ||
          (leadName.length > 3 && custName && custName.includes(leadName))
        ) {
          idx[lead.id] = c;
          break;
        }
      }
    }
    return idx;
  }, [activeLeads, customers]);

  // Filtered by search
  const filteredLeads = useMemo(() => {
    if (!searchQuery) return activeLeads;
    const q = searchQuery.toLowerCase();
    return activeLeads.filter(l =>
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      l.email.toLowerCase().includes(q)
    );
  }, [activeLeads, searchQuery]);

  // Converted leads filtered by the same search query (drives the Converted column)
  const filteredConverted = useMemo(() => {
    if (!searchQuery) return convertedLeads;
    const q = searchQuery.toLowerCase();
    return convertedLeads.filter(l =>
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      l.email.toLowerCase().includes(q)
    );
  }, [convertedLeads, searchQuery]);

  const selectedLead = useMemo(
    () => crmData.leads.find(l => l.id === selectedLeadId) ?? null,
    [crmData.leads, selectedLeadId]
  );

  // Stats, active only (exclude converted/closed_won)
  const totalCount     = activeLeads.length;
  const newCount       = activeLeads.filter(l => getLeadCol(l) === 'lead_in').length;
  const serviceCount   = activeLeads.filter(l => l.leadType === 'service').length;
  const salesCount     = activeLeads.filter(l => l.leadType === 'sales').length;
  const convertedCount = convertedLeads.length;

  const save = (updated: CRMData) => {
    setCrmData(updated);
    saveCRMData(updated);
  };

  // ── Column routing via drag ──────────────────────────────────────────────

  const handleDrop = (leadId: string, col: KanbanCol) => {
    const lead = crmData.leads.find(l => l.id === leadId);
    if (!lead) return;
    // Dragging a converted lead back out of the Converted column reactivates it
    const wasConverted = lead.status === 'closed_won';
    let patch: Partial<Lead> = { updatedAt: new Date().toISOString() };
    if (col === 'lead_in') {
      patch = { ...patch, leadType: undefined, ...(wasConverted ? { status: 'new' } : {}) };
    } else if (col === 'service') {
      patch = { ...patch, leadType: 'service', status: (lead.status === 'new' || wasConverted) ? 'attempting' : lead.status };
    } else if (col === 'sales') {
      patch = { ...patch, leadType: 'sales', status: (lead.status === 'new' || wasConverted) ? 'attempting' : lead.status };
    } else if (col === 'lost') {
      patch = { ...patch, status: 'closed_lost' };
    } else if (col === 'converted') {
      patch = { ...patch, status: 'closed_won' };
    }
    save({
      ...crmData,
      leads: crmData.leads.map(l => l.id === leadId ? { ...l, ...patch } : l),
    });
  };

  const handleRouteToService = (leadId: string) => {
    save({
      ...crmData,
      leads: crmData.leads.map(l =>
        l.id === leadId
          ? { ...l, leadType: 'service' as const, status: 'attempting' as const, updatedAt: new Date().toISOString() }
          : l
      ),
    });
  };

  const handleRouteToSales = (leadId: string, repId: string) => {
    if (!repId) return;
    save({
      ...crmData,
      leads: crmData.leads.map(l =>
        l.id === leadId
          ? { ...l, leadType: 'sales' as const, assignedTo: repId, status: 'attempting' as const, updatedAt: new Date().toISOString() }
          : l
      ),
    });
  };

  const handleAddNote = (leadId: string, note: string) => {
    if (!note.trim()) return;
    save({
      ...crmData,
      leads: crmData.leads.map(l =>
        l.id === leadId
          ? { ...l, notes: l.notes ? `${l.notes}\n${note.trim()}` : note.trim(), updatedAt: new Date().toISOString() }
          : l
      ),
    });
    setNoteText('');
  };

  const handleParseEmail = () => {
    const parsed = parseSolarEdgeEmail(pasteText);
    if (!parsed.firstName && !parsed.phone) return;
    setParsedPreview(parsed);
  };

  const handleConfirmEmailImport = () => {
    if (!parsedPreview) return;
    const noteStr = parsedPreview.addressNote ? `Address: ${parsedPreview.addressNote}` : '';
    setAddFormData(p => ({
      ...p,
      firstName: parsedPreview.firstName ?? '',
      lastName:  parsedPreview.lastName ?? '',
      email:     parsedPreview.email ?? '',
      phone:     parsedPreview.phone ?? '',
      source:    (parsedPreview.source as LeadSource | 'custom') ?? 'solaredge',
      leadType:  parsedPreview.leadType ?? 'service',
      customSourceLabel: '',
    }));
    // Store address note to be used in handleQuickAdd via separate state
    setPendingAddressNote(noteStr);
    setShowImport(false);
    setPasteText('');
    setParsedPreview(null);
  };

  const [pendingAddressNote, setPendingAddressNote] = useState('');

  // Screenshot → AI → form fill
  const handleSsFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setSsError('Please select an image file.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setSsPreview(ev.target?.result as string); setSsError(''); setSsOk(''); };
    reader.readAsDataURL(file);
  };

  const handleSsPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) { const f = item.getAsFile(); if (f) { e.preventDefault(); handleSsFile(f); } }
  };

  const handleSsParse = async () => {
    if (!ssPreview) return;
    setSsLoading(true); setSsError(''); setSsOk('');
    try {
      const [header, imageBase64] = ssPreview.split(',');
      const mimeType = header.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg';
      const resp = await authedFetch('/api/parse-lead-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      // Guard: handle non-JSON responses (API not found, etc.)
      const text = await resp.text();
      let data: Record<string, string>;
      try { data = JSON.parse(text); }
      catch { setSsError(`API error: ${text.slice(0, 80)}`); return; }

      if (!resp.ok || data['error']) { setSsError(data['error'] ?? 'Failed to parse. Try again.'); return; }

      const noteLines = [
        data['notes'],
        data['hsId']        ? `HS_ID: ${data['hsId']}` : '',
        data['contractName'] ? `Contract: ${data['contractName']}` : '',
        data['address'] ? `${data['address']}, ${data['city']}, ${data['state']} ${data['zip']}`.trim().replace(/^,\s*/, '') : '',
      ].filter(Boolean).join('\n');

      setAddFormData(prev => ({
        ...prev,
        firstName: data['firstName'] || prev.firstName,
        lastName:  data['lastName']  || prev.lastName,
        email:     data['email']     || prev.email,
        phone:     data['phone']     || prev.phone,
        source:    'solaredge',
        leadType:  'service',
        note:      noteLines || prev.note,
      }));
      if (noteLines) setPendingAddressNote(noteLines);
      setSsOk('✓ Fields filled, review below and save.');
      setShowImport(false);
    } catch (err) {
      setSsError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSsLoading(false);
    }
  };

  const handleExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const wb = XLSX.read(new Uint8Array(data as ArrayBuffer), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const mapped = rows.map(r => {
        const fullName = String(r['Site Main Contact Name'] ?? '');
        const parts = fullName.trim().split(/\s+/);
        return {
          firstName: parts[0] ?? '',
          lastName:  parts.slice(1).join(' '),
          phone:     String(r['Site Main Contact Phone'] ?? '').replace(/^'+/, '').replace(/^\+?1/, ''),
          email:     String(r['Site Main Contact Email'] ?? ''),
          address:   String(r['RMA Street'] ?? ''),
          city:      String(r['RMA City'] ?? ''),
          state:     'FL',  // RMA State is a shipping/warehouse state, not the customer's home state
          zip:       String(r['RMA Zip/Postal Code'] ?? ''),
          notes:     [
            r['Work Description (Internal comments)'] ? String(r['Work Description (Internal comments)']) : '',
            r['Notes'] ? String(r['Notes']) : '',
            r['Subject'] ? String(r['Subject']) : '',
          ].filter(Boolean).join('\n'),
          caseNumber: String(r['Case Number'] ?? ''),
          rmaNumber:  String(r['RMA Number'] ?? '').replace(/^N\/A$/i, ''),
          tracking:   String(r['Shipping Tracking Number'] ?? ''),
          tracking2:  String(r['Shipping Tracking Number2'] ?? ''),
          shipDate:   parseExcelDate(r['Actual Ship Date']),
          eta:        parseExcelDate(r['Shipping ETA']),
          pod:        parseExcelDate(r['Shipping Proof of Delivery']),
          oldPart:      String(r['Part Number (old)'] ?? '').replace(/^N\/A$/i, ''),
          oldSerial:    String(r['Serial Number (old)'] ?? '').replace(/^N\/A$/i, ''),
          shippedPart:  String(r['Shipped PN'] ?? '').replace(/^N\/A$/i, ''),
          shippedSerial:String(r['Shipped SN'] ?? '').replace(/^N\/A$/i, ''),
        } as ParsedRow;
      }).filter(r => r.firstName || r.phone);

      // Consolidate rows with the same phone (same customer, multiple cases)
      const grouped = new Map<string, ParsedRow>();
      for (const row of mapped) {
        const key = row.phone || row.email || `${row.firstName}_${row.lastName}`;
        if (grouped.has(key)) {
          const existing = grouped.get(key)!;
          if (row.notes && !existing.notes.includes(row.notes)) {
            existing.notes = [existing.notes, row.notes].filter(Boolean).join('\n---\n');
          }
          // Merge case numbers and tracking numbers
          if (row.caseNumber && !existing.caseNumber.includes(row.caseNumber)) {
            existing.caseNumber = [existing.caseNumber, row.caseNumber].filter(Boolean).join(', ');
          }
          if (row.tracking && !existing.tracking.includes(row.tracking)) {
            existing.tracking = [existing.tracking, row.tracking].filter(Boolean).join(', ');
          }
          if (row.tracking2 && !existing.tracking2.includes(row.tracking2)) {
            existing.tracking2 = [existing.tracking2, row.tracking2].filter(Boolean).join(', ');
          }
          // Keep earliest shipDate and latest ETA/POD
          if (row.shipDate && (!existing.shipDate || row.shipDate < existing.shipDate)) existing.shipDate = row.shipDate;
          if (row.eta && row.eta > (existing.eta ?? '')) existing.eta = row.eta;
          if (row.pod && row.pod > (existing.pod ?? '')) existing.pod = row.pod;
          // Keep first non-empty RMA / part / serial info
          if (row.rmaNumber && !existing.rmaNumber.includes(row.rmaNumber)) existing.rmaNumber = [existing.rmaNumber, row.rmaNumber].filter(Boolean).join(', ');
          if (row.oldPart && !existing.oldPart) existing.oldPart = row.oldPart;
          if (row.oldSerial && !existing.oldSerial) existing.oldSerial = row.oldSerial;
          if (row.shippedPart && !existing.shippedPart) existing.shippedPart = row.shippedPart;
          if (row.shippedSerial && !existing.shippedSerial) existing.shippedSerial = row.shippedSerial;
        } else {
          grouped.set(key, { ...row });
        }
      }
      setExcelRows(Array.from(grouped.values()));
    };
  };

  const handleExcelImport = () => {
    let data = crmData;
    for (const row of excelRows) {
      data = addLead(data, {
        firstName:            row.firstName,
        lastName:             row.lastName,
        email:                row.email,
        phone:                row.phone,
        address:              row.address,
        city:                 row.city,
        state:                row.state || 'FL',
        zip:                  row.zip,
        status:               'new',
        source:               'solaredge',
        priority:             'medium',
        notes:                row.notes,
        leadType:             'service',
        homeowner:            false,
        isPowercare:          true,
        powercareCaseNumber:  row.caseNumber || undefined,
        powercareTracking:    row.tracking || undefined,
        powercareTracking2:   row.tracking2 || undefined,
        powercareShipDate:    row.shipDate || undefined,
        powercareEta:         row.eta || undefined,
        powercarePod:         row.pod || undefined,
        powercareRmaNumber:     row.rmaNumber || undefined,
        powercareOldPart:       row.oldPart || undefined,
        powercareOldSerial:     row.oldSerial || undefined,
        powercareShippedPart:   row.shippedPart || undefined,
        powercareShippedSerial: row.shippedSerial || undefined,
      });
    }
    save(data);
    const count = excelRows.length;
    setShowAddForm(false);
    setShowImport(false);
    setExcelRows([]);
    setImportStatus(`Imported ${count} service lead${count !== 1 ? 's' : ''}`);
    setTimeout(() => setImportStatus(''), 4000);
  };

  const handleQuickAdd = () => {
    const { firstName, phone, source, customSourceLabel, leadType } = addFormData;
    if (!firstName || !phone) return;
    const isCustomPick = source === 'custom' || source.startsWith('custom:');
    const customLabel = source.startsWith('custom:') ? source.slice(7) : customSourceLabel;
    const actualSource: LeadSource = isCustomPick ? 'other' : source as LeadSource;
    const combinedNote = [pendingAddressNote, addFormData.note].filter(Boolean).join('\n\n');
    const newData = addLead(crmData, {
      firstName,
      lastName: addFormData.lastName,
      email: addFormData.email,
      phone,
      address: '', city: '', state: 'FL', zip: '',
      status: 'new',
      source: actualSource,
      customSource: isCustomPick ? customLabel : undefined,
      priority: 'medium',
      notes: combinedNote,
      leadType,
      homeowner: false,
      attachments: leadAttachments.length > 0 ? leadAttachments : undefined,
    });
    save(newData);
    setShowAddForm(false);
    setPendingAddressNote('');
    setLeadAttachments([]);
    setAddFormData({ firstName: '', lastName: '', phone: '', email: '', leadType: 'sales', source: 'other', customSourceLabel: '', note: '' });
  };

  const handleAttachFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setLeadAttachments(prev => [...prev, {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: reader.result as string,
          size: file.size,
          createdAt: new Date().toISOString(),
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Build a human-readable PowerCare shipment / part block from a lead so the
  // inverter / part serial numbers survive the conversion into the customer's notes.
  const buildShipmentNote = (lead: Lead): string => {
    if (!lead.isPowercare) return '';
    const lines: string[] = [];
    if (lead.powercareCaseNumber)    lines.push(`PowerCare Case #: ${lead.powercareCaseNumber}`);
    if (lead.powercareRmaNumber)     lines.push(`RMA #: ${lead.powercareRmaNumber}`);
    if (lead.powercareOldPart || lead.powercareOldSerial)
      lines.push(`Failed part: ${[lead.powercareOldPart, lead.powercareOldSerial].filter(Boolean).join(' / SN ')}`);
    if (lead.powercareShippedPart || lead.powercareShippedSerial)
      lines.push(`Replacement shipped: ${[lead.powercareShippedPart, lead.powercareShippedSerial].filter(Boolean).join(' / SN ')}`);
    if (lead.powercareTracking)      lines.push(`Tracking: ${lead.powercareTracking}`);
    if (lead.powercareShipDate)      lines.push(`Shipped: ${lead.powercareShipDate}`);
    if (lead.powercareEta)           lines.push(`ETA: ${lead.powercareEta}`);
    if (lead.powercarePod)           lines.push(`Delivered: ${lead.powercarePod}`);
    return lines.length ? `── PowerCare Shipment ──\n${lines.join('\n')}` : '';
  };

  const handleConvertToCustomer = (lead: Lead, siteId: string) => {
    const now = new Date().toISOString();
    const trimmedId = siteId.trim() || undefined;
    const shipmentNote = buildShipmentNote(lead);
    const notes = [lead.notes || '', shipmentNote].filter(Boolean).join('\n\n');
    const newCustomerId = `cust-${Date.now()}`;
    const newCustomer: Partial<Customer> = {
      id:              newCustomerId,
      name:            `${lead.firstName} ${lead.lastName}`.trim(),
      firstName:       lead.firstName,
      lastName:        lead.lastName,
      email:           lead.email,
      phone:           lead.phone,
      address:         lead.address || '',
      city:            lead.city || '',
      state:           lead.state || 'FL',
      zip:             lead.zip || '',
      type:            'residential',
      notes,
      isPowerCare:     lead.isPowercare ?? false,
      powerCareCaseNumber:     lead.powercareCaseNumber,
      powerCareTrackingNumber: lead.powercareTracking,
      powerCareShipDate:       lead.powercareShipDate,
      powerCareETA:            lead.powercareEta,
      powercarePOD:            lead.powercarePod,
      clientId:        trimmedId,
      solarEdgeSiteId: trimmedId,
      createdAt:       now,
    };
    // Use App-level callback so React state updates immediately (reflects in Customers view)
    onAddCustomer?.(newCustomer);

    // PowerCare leads carry an RMA: create a standalone RMA so the part swap is
    // tracked from day one (red "No work order" flag until a WO links it).
    if (lead.isPowercare && (lead.powercareCaseNumber || lead.powercareRmaNumber) && onCreateStandaloneRma) {
      const partDesc = [
        lead.powercareOldPart || lead.powercareOldSerial
          ? `Failed: ${[lead.powercareOldPart, lead.powercareOldSerial].filter(Boolean).join(' / SN ')}`
          : '',
        lead.powercareShippedPart || lead.powercareShippedSerial
          ? `Replacement: ${[lead.powercareShippedPart, lead.powercareShippedSerial].filter(Boolean).join(' / SN ')}`
          : '',
      ].filter(Boolean).join(' | ') || 'PowerCare part replacement';
      onCreateStandaloneRma({
        id:              `rma-${Date.now()}`,
        manufacturer:    'SolarEdge',
        partDescription: partDesc,
        rmaNumber:       lead.powercareRmaNumber || '',
        caseNumber:      lead.powercareCaseNumber,
        status:          'pending',
        rmaStatus:       'processes',
        createdAt:       now,
        createdBy:       `Lead conversion: ${lead.firstName} ${lead.lastName}`.trim(),
        updatedAt:       now,
      });
    }

    // Mark lead closed_won (removes from board) AND store conversion link
    save({
      ...crmData,
      leads: crmData.leads.map(l =>
        l.id === lead.id
          ? {
              ...l,
              status: 'closed_won',
              updatedAt: now,
              convertedCustomerId: newCustomerId,
              clientId: trimmedId,
            }
          : l
      ),
    });
    setSelectedLeadId(null);
    const rmaMsg = lead.isPowercare && (lead.powercareCaseNumber || lead.powercareRmaNumber) ? ' + RMA created' : '';
    setImportStatus(`${lead.firstName} ${lead.lastName} converted to customer${rmaMsg} ✓`);
    setTimeout(() => setImportStatus(''), 4000);
  };

  const handleTogglePowercare = (leadId: string) => {
    save({
      ...crmData,
      leads: crmData.leads.map(l =>
        l.id === leadId ? { ...l, isPowercare: !l.isPowercare, updatedAt: new Date().toISOString() } : l
      ),
    });
  };

  // "Delete" archives to the Lost column rather than removing the record: it
  // keeps the history, and a plain filter() delete resurrects across browsers
  // (a shorter array is indistinguishable from "never had it" to the sync merge).
  // Converted leads reach the Converted column via handleConvertToCustomer.
  const handleDeleteLead = (leadId: string) => {
    save({
      ...crmData,
      leads: crmData.leads.map(l =>
        l.id === leadId ? { ...l, status: 'closed_lost', updatedAt: new Date().toISOString() } : l),
    });
    setSelectedLeadId(null);
  };

  const handleAddCustomSource = () => {
    const label = newSourceInput.trim();
    if (!label) return;
    if (customSources.includes(label)) { setShowNewSourceModal(false); setNewSourceInput(''); return; }
    save({ ...crmData, customSources: [...customSources, label] });
    setShowNewSourceModal(false);
    setNewSourceInput('');
  };

  const handleContact = (lead: Lead, method: 'phone' | 'email') => {
    if (method === 'phone') window.open(`tel:${lead.phone}`);
    else window.open(`mailto:${lead.email}`);
  };

  const handleCreateSiteTx = (lead: Lead) => {
    if (!siteTxSiteId.trim() || !siteTxSerial.trim()) return;
    const appData = loadData();
    const now = new Date().toISOString();
    const dateStamp = now.slice(2, 7).replace('-', '');
    const rand = String(Math.floor(Math.random() * 90000) + 10000);
    const woNumber = `WO-${dateStamp}-${rand}`;
    const newJob: Job = {
      id: `job-sitex-${Date.now()}`,
      customerId: '', technicianId: '',
      title: `Site Transfer, ${lead.firstName} ${lead.lastName}`,
      serviceType: 'SITE-TRX',
      status: 'new',
      scheduledDate: now.slice(0, 10),
      scheduledTime: '',
      notes: `Site ID: ${siteTxSiteId.trim()}\nInverter Serial: ${siteTxSerial.trim()}`,
      photos: [],
      laborHours: 0, laborRate: 100, partsCost: 0, totalAmount: 100,
      createdAt: now, urgency: 'medium', isPowercare: false,
      woStatus: 'draft', woNumber,
      // Land the converted lead on the Tryout pipeline board. A site transfer
      // started from the lobby IS the "Site Transfer is Processing" stage.
      pipelineStage: 'site_transfer_processing',
      solarEdgeSiteId: siteTxSiteId.trim(),
      clientName: `${lead.firstName} ${lead.lastName}`,
      description: `Site ID: ${siteTxSiteId.trim()} | Inverter Serial: ${siteTxSerial.trim()}`,
      lineItems: [{ id: `li-${Date.now()}`, type: 'other', description: 'Site Transfer', quantity: 1, unitCost: 100, totalCost: 100 }],
    };
    saveData({ ...appData, jobs: [...appData.jobs, newJob] });
    setSiteTxSuccess({ leadId: lead.id, woNumber });
    setShowSiteTxForm(false);
    setSiteTxSiteId('');
    setSiteTxSerial('');
  };

  // ── Kanban column data ───────────────────────────────────────────────────

  const colLeads = useMemo((): Record<KanbanCol, Lead[]> => {
    const result: Record<KanbanCol, Lead[]> = { lead_in: [], service: [], sales: [], lost: [], converted: [] };
    // Active leads bucket into the four pipeline columns
    for (const lead of filteredLeads) {
      const col = getLeadCol(lead);
      if (col !== 'converted') result[col].push(lead);
    }
    // Converted leads are tracked separately (closed_won)
    result.converted = [...filteredConverted];
    // Sort terminal columns by most-recently-updated first
    const byRecent = (a: Lead, b: Lead) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    result.lost.sort(byRecent);
    result.converted.sort(byRecent);
    return result;
  }, [filteredLeads, filteredConverted]);

  const now = Date.now();
  const lostRecent       = colLeads.lost.filter(l => now - new Date(l.updatedAt).getTime() < TWO_WEEKS_MS);
  const lostOlder        = colLeads.lost.filter(l => now - new Date(l.updatedAt).getTime() >= TWO_WEEKS_MS);
  const convertedRecent  = colLeads.converted.filter(l => now - new Date(l.updatedAt).getTime() < TWO_WEEKS_MS);
  const convertedOlder   = colLeads.converted.filter(l => now - new Date(l.updatedAt).getTime() >= TWO_WEEKS_MS);

  // ── Source badge component ───────────────────────────────────────────────

  const SourceBadge: React.FC<{ lead: Lead }> = ({ lead }) => {
    const badge = getSourceBadge(lead, customSources);
    return (
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-auto min-w-0 truncate ${badge.bg} ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  // ── Lead card (shared between list & kanban) ─────────────────────────────

  const colBarColor: Record<KanbanCol, string> = {
    lead_in:   'bg-slate-400',
    service:   'bg-blue-500',
    sales:     'bg-orange-400',
    lost:      'bg-red-400',
    converted: 'bg-emerald-500',
  };

  const LeadCard: React.FC<{ lead: Lead; kanban?: boolean }> = ({ lead, kanban }) => {
    const col = getLeadCol(lead);
    const barColor = colBarColor[col] ?? 'bg-slate-300';
    const isConverted = lead.status === 'closed_won';
    const handleClick = (e: React.MouseEvent) => {
      if (isConverted && lead.convertedCustomerId && onViewCustomer) {
        e.stopPropagation();
        onViewCustomer(lead.convertedCustomerId);
      } else {
        setSelectedLeadId(lead.id);
      }
    };
    return (
      <div
        draggable={kanban}
        onDragStart={kanban ? () => { draggedId.current = lead.id; } : undefined}
        onClick={handleClick}
        className={`relative overflow-hidden bg-white rounded-xl border ${
          kanban
            ? 'mb-2 cursor-grab active:cursor-grabbing hover:shadow-md p-3 pt-4'
            : 'border-b border-slate-100 rounded-none px-3 py-3 hover:bg-slate-50'
        } transition-all select-none ${
          selectedLeadId === lead.id
            ? kanban ? 'border-amber-400 ring-2 ring-amber-300 shadow-sm' : 'bg-orange-50 border-l-4 border-l-orange-500'
            : isConverted ? 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400 cursor-pointer' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {kanban && <div className={`absolute top-0 left-0 right-0 h-[3px] ${barColor}`} />}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[lead.priority] ?? 'bg-slate-400'}`} />
          <span className="text-sm font-semibold text-slate-900 truncate flex-1 min-w-0">
            {`${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || lead.phone || 'Unnamed lead'}
          </span>
          {lead.isPowercare && (
            <span title="Powercare" className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">⚡</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400 font-mono flex-shrink-0">{lead.phone}</p>
          <SourceBadge lead={lead} />
        </div>
        {lead.monthlyBill && (
          <p className="text-xs text-emerald-600 font-semibold mt-1">{formatMoney(lead.monthlyBill, { decimals: 0 })}/mo</p>
        )}
        {isConverted && lead.clientId && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-mono font-medium shrink-0">
              {lead.clientId}
            </span>
            {lead.convertedCustomerId && (
              <span className="text-[10px] text-emerald-600 hover:underline cursor-pointer flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); if (onViewCustomer) onViewCustomer(lead.convertedCustomerId!); }}
                title="Click to view customer card"
              >
                View customer →
              </span>
            )}
          </div>
        )}
        {duplicateIndex[lead.id] && (
          <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-amber-700 truncate flex-1">
              Existing: {duplicateIndex[lead.id].solarEdgeSiteId && <span className="text-amber-500">{duplicateIndex[lead.id].solarEdgeSiteId} </span>}{duplicateIndex[lead.id].name}
            </span>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteLead(lead.id); }}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0 transition-colors"
              title="Delete this duplicate lead"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Kanban board ─────────────────────────────────────────────────────────

  const KanbanBoard = () => (
    <div className="flex-1 flex gap-3 overflow-x-auto p-4 min-h-0">
      {KANBAN_COLS.map(col => {
        const leads = col.id === 'lost'
          ? (lostExpanded ? colLeads.lost : lostRecent)
          : col.id === 'converted'
          ? (convertedExpanded ? colLeads.converted : convertedRecent)
          : colLeads[col.id];
        const isOver = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            className="flex flex-col flex-shrink-0 w-64"
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={() => {
              if (draggedId.current) handleDrop(draggedId.current, col.id);
              setDragOverCol(null);
              draggedId.current = '';
            }}
          >
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${col.headerBg}`}>
              <span className={`text-sm font-semibold ${col.headerText}`}>{col.label}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/20 ${col.headerText}`}>
                {colLeads[col.id].length}
              </span>
            </div>

            {/* Drop zone */}
            <div className={`flex-1 rounded-b-xl border-2 border-t-0 p-2 overflow-y-auto transition-all min-h-[120px] ${
              isOver
                ? 'border-dashed border-amber-400 bg-amber-50/70 scale-[1.01]'
                : `${col.colBorder} ${col.colBg}`
            }`}>
              {leads.map(lead => <LeadCard key={lead.id} lead={lead} kanban />)}

              {/* Lost, older leads toggle */}
              {col.id === 'lost' && lostOlder.length > 0 && (
                <button
                  onClick={() => setLostExpanded(v => !v)}
                  className="w-full mt-1 flex items-center justify-center gap-1 text-[11px] text-red-500 hover:text-red-700 py-1.5"
                >
                  {lostExpanded
                    ? <><ChevronUp className="w-3 h-3" />Hide older ({lostOlder.length})</>
                    : <><ChevronDown className="w-3 h-3" />{lostOlder.length} older ({'>'} 2 weeks)</>}
                </button>
              )}

              {/* Converted, older leads toggle */}
              {col.id === 'converted' && convertedOlder.length > 0 && (
                <button
                  onClick={() => setConvertedExpanded(v => !v)}
                  className="w-full mt-1 flex items-center justify-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 py-1.5"
                >
                  {convertedExpanded
                    ? <><ChevronUp className="w-3 h-3" />Hide older ({convertedOlder.length})</>
                    : <><ChevronDown className="w-3 h-3" />{convertedOlder.length} older ({'>'} 2 weeks)</>}
                </button>
              )}

              {leads.length === 0 && (
                <div className={`h-16 flex items-center justify-center rounded-lg border-2 border-dashed text-xs ${
                  isOver ? 'border-amber-400 text-amber-500' : 'border-slate-200 text-slate-400'
                }`}>
                  {isOver ? 'Drop here' : col.emptyText}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header, double stack */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">

        {/* Row 1, Title + primary action */}
        <div className="px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
              <Inbox className="w-5 h-5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Lead Lobby</h1>
              <p className="text-xs text-slate-400 leading-tight">Triage and route incoming leads</p>
            </div>
          </div>

          {/* Primary CTA, always visible and prominent */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleForceSync}
              disabled={syncState === 'syncing'}
              title="Push all leads from this device to the cloud"
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                syncState === 'ok'    ? 'border-green-300 bg-green-50 text-green-700' :
                syncState === 'error' ? 'border-red-300 bg-red-50 text-red-700' :
                'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
              <span>
                {syncState === 'syncing' ? 'Syncing...' : syncState === 'ok' ? 'Synced' : syncState === 'error' ? 'Failed' : 'Sync'}
              </span>
            </button>
            <button
              onClick={() => { setShowAddForm(true); setShowImport(true); setImportTab('screenshot'); setParsedPreview(null); setExcelRows([]); setSsPreview(null); setSsError(''); setSsOk(''); }}
              title="Import leads from SolarEdge or Excel"
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 active:scale-[0.98] transition-all shadow-sm shadow-orange-200"
            >
              <Plus className="w-4 h-4" />
              New Lead
            </button>
          </div>
        </div>

        {/* Row 2, Stats chips + search + view toggle */}
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Stats */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">All</span>
              <span className="text-sm font-bold text-slate-800">{totalCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-lg">
              <span className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide">New</span>
              <span className="text-sm font-bold text-blue-700">{newCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 rounded-lg">
              <span className="text-[10px] text-sky-500 font-semibold uppercase tracking-wide hidden sm:inline">Service</span>
              <span className="text-[10px] text-sky-500 font-semibold uppercase tracking-wide sm:hidden">Svc</span>
              <span className="text-sm font-bold text-sky-700">{serviceCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 rounded-lg">
              <span className="text-[10px] text-orange-500 font-semibold uppercase tracking-wide">Sales</span>
              <span className="text-sm font-bold text-orange-600">{salesCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg">
              <span className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide hidden sm:inline">Converted</span>
              <span className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide sm:hidden">Conv</span>
              <span className="text-sm font-bold text-emerald-600">{convertedCount}</span>
            </div>
          </div>

          {/* Search, grows to fill space */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 focus:bg-white transition-colors"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode('kanban')}
              title="Board view"
              className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* ── Kanban mode ─────────────────────────────────────────────────── */}
        {viewMode === 'kanban' ? (
          <>
            <KanbanBoard />
            {/* Detail panel */}
            {selectedLead && (
              <div className="w-full md:w-[460px] border-l border-slate-200 bg-white flex flex-col overflow-y-auto flex-shrink-0">
                <DetailPanel
                  lead={selectedLead}
                  canRoute={canRoute}
                  noteText={noteText}
                  setNoteText={setNoteText}
                  onAddNote={handleAddNote}
                  onContact={handleContact}
                  onRouteToService={handleRouteToService}
                  onRouteToSales={handleRouteToSales}
                  onClose={() => setSelectedLeadId(null)}
                  onTogglePowercare={handleTogglePowercare}
                  onDeleteLead={handleDeleteLead}
                  onConvertToCustomer={handleConvertToCustomer}
                  showSiteTxForm={showSiteTxForm}
                  setShowSiteTxForm={setShowSiteTxForm}
                  siteTxSiteId={siteTxSiteId}
                  setSiteTxSiteId={setSiteTxSiteId}
                  siteTxSerial={siteTxSerial}
                  setSiteTxSerial={setSiteTxSerial}
                  siteTxSuccess={siteTxSuccess}
                  onCreateSiteTx={handleCreateSiteTx}
                  customSources={customSources}
                />
              </div>
            )}
          </>
        ) : (
          /* ── List mode ──────────────────────────────────────────────────── */
          <>
            {/* Left list */}
            <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {filteredLeads.length === 0 && (
                  <p className="text-xs text-slate-400 text-center pt-8">No leads match</p>
                )}
                {filteredLeads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
              </div>
            </div>

            {/* Right detail */}
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              {selectedLead ? (
                <DetailPanel
                  lead={selectedLead}
                  canRoute={canRoute}
                  noteText={noteText}
                  setNoteText={setNoteText}
                  onAddNote={handleAddNote}
                  onContact={handleContact}
                  onRouteToService={handleRouteToService}
                  onRouteToSales={handleRouteToSales}
                  onTogglePowercare={handleTogglePowercare}
                  onDeleteLead={handleDeleteLead}
                  onConvertToCustomer={handleConvertToCustomer}
                  showSiteTxForm={showSiteTxForm}
                  setShowSiteTxForm={setShowSiteTxForm}
                  siteTxSiteId={siteTxSiteId}
                  setSiteTxSiteId={setSiteTxSiteId}
                  siteTxSerial={siteTxSerial}
                  setSiteTxSerial={setSiteTxSerial}
                  siteTxSuccess={siteTxSuccess}
                  onCreateSiteTx={handleCreateSiteTx}
                  customSources={customSources}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <Inbox className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-slate-400 text-sm">Select a lead to view details</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Quick Add Form (modal overlay) */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">Quick Add Lead</span>
                <button
                  onClick={() => { setShowImport(v => !v); setParsedPreview(null); setExcelRows([]); }}
                  title="Import from SolarEdge"
                  className={`p-1.5 rounded-lg transition-colors ${showImport ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => { setShowAddForm(false); setShowImport(false); setParsedPreview(null); setExcelRows([]); setLeadAttachments([]); setAddFormData(p => ({ ...p, note: '' })); }}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Import panel */}
            {showImport && (
              <div className="mb-4 border border-blue-200 rounded-xl bg-blue-50/50 p-4">
                {/* Tabs */}
                <div className="flex gap-1 mb-3 flex-wrap">
                  <button
                    onClick={() => { setImportTab('screenshot'); setSsError(''); setSsOk(''); }}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${importTab === 'screenshot' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >
                    <Camera className="w-3 h-3" />
                    Screenshot
                    <span className="bg-orange-400 text-white text-[8px] font-bold px-1 py-0.5 rounded-full leading-none">AI</span>
                  </button>
                  <button
                    onClick={() => { setImportTab('email'); setParsedPreview(null); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${importTab === 'email' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >
                    Paste Email
                  </button>
                  <button
                    onClick={() => { setImportTab('excel'); setParsedPreview(null); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${importTab === 'excel' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >
                    Excel File
                  </button>
                  <button
                    onClick={() => { setImportTab('trello'); setParsedPreview(null); setTrelloLeadError(''); setTrelloLeadPreview(null); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${importTab === 'trello' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >
                    Trello Card
                  </button>
                </div>

                {importTab === 'screenshot' && (
                  <div className="space-y-2.5" onPaste={handleSsPaste}>
                    <p className="text-xs text-slate-500">
                      Take a screenshot of the SolarEdge lead email → upload or paste here → AI reads every field instantly.
                    </p>
                    {/* Drop zone */}
                    <div
                      onClick={() => ssInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-colors ${ssPreview ? 'border-orange-300' : 'border-slate-300 hover:border-orange-400 hover:bg-orange-50/20'}`}
                    >
                      {ssPreview ? (
                        <div className="relative">
                          <img src={ssPreview} alt="Preview" className="w-full max-h-44 object-contain bg-white" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                            <p className="text-white text-xs font-medium">Tap to change</p>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 flex flex-col items-center gap-1.5">
                          <ImageIcon className="w-7 h-7 text-slate-300" />
                          <p className="text-xs font-medium text-slate-500">Tap to select screenshot</p>
                          <p className="text-[10px] text-slate-400">or paste from clipboard (⌘V)</p>
                        </div>
                      )}
                      <input ref={ssInputRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleSsFile(f); e.target.value = ''; }} />
                    </div>
                    {ssPreview && (
                      <button
                        type="button"
                        onClick={handleSsParse}
                        disabled={ssLoading}
                        className="w-full py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {ssLoading
                          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing…</>
                          : <><Sparkles className="w-3.5 h-3.5" /> Extract Lead Info</>
                        }
                      </button>
                    )}
                    {ssError && <p className="text-[11px] text-red-600 font-medium">⚠ {ssError}</p>}
                    {ssOk    && <p className="text-[11px] text-green-700 font-medium">{ssOk}</p>}
                  </div>
                )}

                {importTab === 'email' && (
                  <>
                    <p className="text-xs text-slate-500 mb-2">Paste the SolarEdge email body:</p>
                    <textarea
                      rows={5}
                      value={pasteText}
                      onChange={e => { setPasteText(e.target.value); setParsedPreview(null); }}
                      placeholder={'First Name: ...\nLast Name: ...\nPhone: ...\nEmail: ...'}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white font-mono resize-none"
                    />
                    {parsedPreview && (
                      <div className="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 space-y-0.5">
                        <p className="font-semibold text-green-700 mb-1">Parsed:</p>
                        {parsedPreview.firstName && <p>Name: {parsedPreview.firstName} {parsedPreview.lastName}</p>}
                        {parsedPreview.phone && <p>Phone: {parsedPreview.phone}</p>}
                        {parsedPreview.email && <p>Email: {parsedPreview.email}</p>}
                        {parsedPreview.addressNote && <p>Address: {parsedPreview.addressNote}</p>}
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      {!parsedPreview ? (
                        <button
                          onClick={handleParseEmail}
                          disabled={!pasteText.trim()}
                          className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          Parse &amp; Fill Form
                        </button>
                      ) : (
                        <button
                          onClick={handleConfirmEmailImport}
                          className="flex-1 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Fill Form ↓
                        </button>
                      )}
                      <button
                        onClick={() => { setShowImport(false); setPasteText(''); setParsedPreview(null); }}
                        className="px-3 py-1.5 bg-white text-slate-600 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {importTab === 'excel' && (
                  <>
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); }}
                    />
                    {/* Drop zone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleExcelFile(f); }}
                      className="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center cursor-pointer hover:bg-blue-50 transition-colors"
                    >
                      <Upload className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-500">Drop .xlsx file here or <span className="text-blue-600 font-medium">click to browse</span></p>
                    </div>
                    {/* Preview table */}
                    {excelRows.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600 mb-1.5">{excelRows.length} row{excelRows.length !== 1 ? 's' : ''} found:</p>
                        <div className="overflow-auto max-h-32 rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-2 py-1.5 text-left font-medium text-slate-500">Name</th>
                                <th className="px-2 py-1.5 text-left font-medium text-slate-500">Phone</th>
                                <th className="px-2 py-1.5 text-left font-medium text-slate-500">Case #</th>
                                <th className="px-2 py-1.5 text-left font-medium text-slate-500">Tracking</th>
                              </tr>
                            </thead>
                            <tbody>
                              {excelRows.map((row, i) => (
                                <tr key={i} className="border-b border-slate-50 last:border-0">
                                  <td className="px-2 py-1.5 text-slate-700 max-w-[100px] truncate">{row.firstName} {row.lastName}</td>
                                  <td className="px-2 py-1.5 text-slate-600">{row.phone || '-'}</td>
                                  <td className="px-2 py-1.5 text-slate-600 font-mono text-[10px]">{row.caseNumber || '-'}</td>
                                  <td className="px-2 py-1.5 font-mono text-[10px] max-w-[80px] truncate">
                                    {row.tracking
                                      ? <a href={getTrackingUrl(row.tracking)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{row.tracking}</a>
                                      : <span className="text-slate-400">-</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={handleExcelImport}
                            className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Import {excelRows.length} lead{excelRows.length !== 1 ? 's' : ''} as Service leads
                          </button>
                          <button
                            onClick={() => { setExcelRows([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                            className="px-3 py-1.5 bg-white text-slate-600 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {importTab === 'trello' && (
                  <>
                    <p className="text-xs text-slate-500 mb-2">Paste a Trello card URL:</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={trelloLeadUrl}
                        onChange={e => { setTrelloLeadUrl(e.target.value); setTrelloLeadError(''); setTrelloLeadPreview(null); }}
                        placeholder="https://trello.com/c/..."
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                      />
                      <button
                        onClick={handleTrelloLeadFetch}
                        disabled={!trelloLeadUrl.trim() || trelloLeadLoading}
                        className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {trelloLeadLoading ? (
                          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Link2 className="w-3 h-3" />
                        )}
                        Fetch
                      </button>
                    </div>
                    {trelloLeadError && (
                      <p className="mt-2 text-xs text-red-600">{trelloLeadError}</p>
                    )}
                    {trelloLeadPreview && (
                      <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 space-y-0.5">
                        <p className="font-semibold text-green-700 mb-1 truncate">{trelloLeadPreview.cardName}</p>
                        {(trelloLeadPreview.firstName || trelloLeadPreview.lastName) && (
                          <p>Name: {trelloLeadPreview.firstName} {trelloLeadPreview.lastName}</p>
                        )}
                        {trelloLeadPreview.phone && <p>Phone: {trelloLeadPreview.phone}</p>}
                        {trelloLeadPreview.email && <p>Email: {trelloLeadPreview.email}</p>}
                        {trelloLeadPreview.description && (
                          <p className="line-clamp-2 text-green-700/70">{trelloLeadPreview.description.slice(0, 120)}{trelloLeadPreview.description.length > 120 ? '…' : ''}</p>
                        )}
                        <button
                          onClick={handleTrelloLeadConfirm}
                          className="mt-2 w-full py-1.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Fill Form ↓
                        </button>
                      </div>
                    )}
                    {!trelloLeadPreview && !trelloLeadLoading && !trelloLeadError && (
                      <p className="mt-2 text-[11px] text-slate-400">Imports name, phone, email, and card description as a note.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Normal form (hidden while showing import panel with excel rows pending) */}
            {!(showImport && importTab === 'excel' && excelRows.length > 0) && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    placeholder="First name*"
                    value={addFormData.firstName}
                    onChange={e => setAddFormData(p => ({ ...p, firstName: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <input
                    placeholder="Last name"
                    value={addFormData.lastName}
                    onChange={e => setAddFormData(p => ({ ...p, lastName: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </div>
                <input
                  placeholder="Phone*"
                  value={addFormData.phone}
                  onChange={e => setAddFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <input
                  placeholder="Email"
                  value={addFormData.email}
                  onChange={e => setAddFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                <div className="flex gap-2">
                  <select
                    value={addFormData.leadType}
                    onChange={e => setAddFormData(p => ({ ...p, leadType: e.target.value as 'service' | 'sales' }))}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    <option value="sales">Sales</option>
                    <option value="service">Service</option>
                  </select>
                  <select
                    value={addFormData.source}
                    onChange={e => setAddFormData(p => ({ ...p, source: e.target.value as LeadSource | 'custom' }))}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  >
                    {PREDEFINED_SOURCES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                    {customSources.map(cs => (
                      <option key={`custom:${cs}`} value={`custom:${cs}`}>{cs}</option>
                    ))}
                    <option value="custom">+ New source…</option>
                  </select>
                </div>
                {addFormData.source === 'custom' && (
                  <input
                    autoFocus
                    placeholder="Custom source name"
                    value={addFormData.customSourceLabel}
                    onChange={e => setAddFormData(p => ({ ...p, customSourceLabel: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                )}

                {/* Note */}
                <textarea
                  rows={3}
                  placeholder="Add a note… (optional)"
                  value={addFormData.note}
                  onChange={e => setAddFormData(p => ({ ...p, note: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none"
                />

                {/* Attachments */}
                <div>
                  <input
                    ref={noteFileRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    className="hidden"
                    onChange={e => handleAttachFiles(e.target.files)}
                  />
                  <div
                    onClick={() => noteFileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleAttachFiles(e.dataTransfer.files); }}
                    className="border-2 border-dashed border-slate-200 rounded-lg px-4 py-3 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/40 transition-colors"
                  >
                    <p className="text-xs text-slate-400">
                      📎 Attach photos or documents, <span className="text-orange-500 font-medium">click or drag & drop</span>
                    </p>
                  </div>
                  {leadAttachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {leadAttachments.map(a => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-3 py-1.5">
                          <span className="truncate text-slate-700">{a.name}</span>
                          <button
                            type="button"
                            onClick={() => setLeadAttachments(prev => prev.filter(x => x.id !== a.id))}
                            className="text-slate-400 hover:text-red-500 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleQuickAdd}
                    disabled={!addFormData.firstName || !addFormData.phone}
                    className="flex-1 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add Lead
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <button
                  onClick={() => setShowNewSourceModal(true)}
                  className="w-full text-xs text-slate-400 hover:text-slate-600 py-1"
                >
                  + Manage custom sources
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import status toast */}
      {importStatus && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-sm font-medium rounded-xl shadow-xl animate-fade-in">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          {importStatus}
        </div>
      )}

      {/* New source modal */}
      {showNewSourceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-slate-900">Add Custom Source</span>
              <button onClick={() => setShowNewSourceModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input
              autoFocus
              placeholder="Source name (e.g. Door Knock)"
              value={newSourceInput}
              onChange={e => setNewSourceInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustomSource()}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 mb-3"
            />
            {customSources.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {customSources.map(cs => (
                  <span key={cs} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1">
                    {cs}
                    <button
                      onClick={() => save({ ...crmData, customSources: customSources.filter(s => s !== cs) })}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddCustomSource}
                disabled={!newSourceInput.trim()}
                className="flex-1 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowNewSourceModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Detail Panel (shared between list & kanban modes) ─────────────────────────

interface DetailPanelProps {
  lead: Lead;
  canRoute: boolean;
  noteText: string;
  setNoteText: (v: string) => void;
  onAddNote: (id: string, note: string) => void;
  onContact: (lead: Lead, method: 'phone' | 'email') => void;
  onRouteToService: (id: string) => void;
  onRouteToSales: (id: string, repId: string) => void;
  onClose?: () => void;
  onTogglePowercare: (id: string) => void;
  onDeleteLead: (id: string) => void;
  onConvertToCustomer: (lead: Lead, siteId: string) => void;
  showSiteTxForm: boolean;
  setShowSiteTxForm: (v: boolean | ((p: boolean) => boolean)) => void;
  siteTxSiteId: string;
  setSiteTxSiteId: (v: string) => void;
  siteTxSerial: string;
  setSiteTxSerial: (v: string) => void;
  siteTxSuccess: { leadId: string; woNumber: string } | null;
  onCreateSiteTx: (lead: Lead) => void;
  customSources: string[];
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  lead, canRoute, noteText, setNoteText, onAddNote, onContact,
  onRouteToService, onRouteToSales, onClose, onTogglePowercare, onDeleteLead, onConvertToCustomer,
  showSiteTxForm, setShowSiteTxForm, siteTxSiteId, setSiteTxSiteId,
  siteTxSerial, setSiteTxSerial, siteTxSuccess, onCreateSiteTx, customSources,
}) => {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showConvertForm, setShowConvertForm] = React.useState(false);
  const [convertSiteId, setConvertSiteId] = React.useState('');
  const showConvert = lead.leadType === 'service' || (siteTxSuccess?.leadId === lead.id);
  const badge = getSourceBadge(lead, customSources);
  const col = getLeadCol(lead);
  const colMeta = KANBAN_COLS.find(c => c.id === col);

  return (
    <div className="p-6 max-w-2xl">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-900 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-sm font-bold text-white">
            {lead.firstName?.[0]?.toUpperCase()}{lead.lastName?.[0]?.toUpperCase()}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">{lead.firstName} {lead.lastName}</h2>
            {/* Column badge */}
            {colMeta && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${colMeta.headerBg}`}>
                {colMeta.label}
              </span>
            )}
            {/* Priority */}
            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium capitalize">
              {lead.priority}
            </span>
            {/* Source badge */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {statusLabels[lead.status]} · {new Date(lead.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Powercare toggle */}
          <button
            onClick={() => onTogglePowercare(lead.id)}
            title={lead.isPowercare ? 'Remove Powercare' : 'Mark as Powercare'}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              lead.isPowercare
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-600'
            }`}
          >
            ⚡ {lead.isPowercare ? 'Powercare' : 'Powercare'}
          </button>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => onContact(lead, 'phone')}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
        >
          <Phone className="w-4 h-4" /> Call
        </button>
        <button
          onClick={() => onContact(lead, 'email')}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
        >
          <Mail className="w-4 h-4" /> Email
        </button>
        {siteTxSuccess?.leadId === lead.id ? (
          <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium">
            <CheckCircle className="w-4 h-4" /> {serviceOrderNo(siteTxSuccess.woNumber)} created
          </span>
        ) : (
          <button
            onClick={() => { setShowSiteTxForm(v => !v); setSiteTxSiteId(''); setSiteTxSerial(''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-100 transition-colors"
          >
            <Zap className="w-4 h-4" /> Site Transfer WO
          </button>
        )}
        {showConvert && !showConvertForm && (
          <button
            onClick={() => { setShowConvertForm(true); setConvertSiteId(siteTxSiteId || ''); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <CheckCircle className="w-4 h-4" /> Convert to Customer
          </button>
        )}
      </div>

      {/* Convert to Customer confirmation form */}
      {showConvertForm && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Convert to Customer</p>
          <p className="text-xs text-slate-500 mb-3">
            This will create a customer record for <span className="font-medium text-slate-700">{lead.firstName} {lead.lastName}</span> and move the lead to the Converted column.
          </p>
          <label className="text-xs text-slate-500 mb-1 block">SolarEdge Site ID <span className="text-slate-400">(e.g. us_1xxxxxx)</span></label>
          <input
            autoFocus
            type="text"
            placeholder="us_1xxxxxx"
            value={convertSiteId}
            onChange={e => setConvertSiteId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConvertToCustomer(lead, convertSiteId)}
            className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white mb-3 font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onConvertToCustomer(lead, convertSiteId)}
              className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Confirm Convert
            </button>
            <button
              onClick={() => { setShowConvertForm(false); setConvertSiteId(''); }}
              className="px-4 py-2 bg-white text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Site Transfer form */}
      {showSiteTxForm && siteTxSuccess?.leadId !== lead.id && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-3">New Site Transfer Service Order</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Site ID</label>
              <input
                autoFocus type="text" placeholder="e.g. 1234567"
                value={siteTxSiteId} onChange={e => setSiteTxSiteId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Inverter Serial #</label>
              <input
                type="text" placeholder="e.g. SExxxxx"
                value={siteTxSerial} onChange={e => setSiteTxSerial(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onCreateSiteTx(lead)}
                className="w-full px-3 py-2 text-sm border border-violet-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onCreateSiteTx(lead)}
              disabled={!siteTxSiteId.trim() || !siteTxSerial.trim()}
              className="flex-1 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors"
            >
              Create WO
            </button>
            <button
              onClick={() => setShowSiteTxForm(false)}
              className="px-4 py-2 bg-white text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Phone</p>
          <p className="text-sm font-medium text-slate-900 font-mono">{lead.phone || '-'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Email</p>
          <p className="text-sm font-medium text-slate-900 truncate">{lead.email || '-'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Address</p>
          <p className="text-sm font-medium text-slate-900">
            {lead.address ? `${lead.address}, ${lead.city}` : `${lead.city}, ${lead.state}` || '-'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Monthly Bill</p>
          <p className="text-sm font-bold text-emerald-600">{lead.monthlyBill ? `${formatMoney(lead.monthlyBill, { decimals: 0 })}/mo` : '-'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Roof Type</p>
          <p className="text-sm font-medium text-slate-900 capitalize">{lead.roofType || '-'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-100 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Homeowner</p>
          <p className="text-sm font-medium text-slate-900">{lead.homeowner ? 'Yes' : 'No'}</p>
        </div>
      </div>

      {/* Powercare case info */}
      {(lead.powercareCaseNumber || lead.powercareTracking) && (() => {
        const status = getDeliveryStatus(
          lead.powercareShipDate ?? '',
          lead.powercareEta ?? '',
          lead.powercarePod ?? '',
        );
        const colorMap: Record<string, string> = {
          emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
          blue:    'bg-blue-100 text-blue-700 border-blue-200',
          amber:   'bg-amber-100 text-amber-700 border-amber-200',
          orange:  'bg-orange-100 text-orange-700 border-orange-200',
          red:     'bg-red-100 text-red-700 border-red-200',
          slate:   'bg-slate-100 text-slate-500 border-slate-200',
        };
        const trackingNumbers = [lead.powercareTracking, lead.powercareTracking2].filter(Boolean) as string[];
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">⚡</span>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Powercare Parts</p>
              </div>
              {(lead.powercareShipDate || lead.powercareTracking) && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorMap[status.color]}`}>
                  {status.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {lead.powercareCaseNumber && (
                <div>
                  <p className="text-xs text-amber-600 mb-0.5">Case Number</p>
                  <p className="text-sm font-mono font-medium text-slate-900">{lead.powercareCaseNumber}</p>
                </div>
              )}

              {lead.powercareShipDate && (
                <div>
                  <p className="text-xs text-amber-600 mb-0.5">Shipped</p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(lead.powercareShipDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}

              {lead.powercareEta && !lead.powercarePod && (
                <div>
                  <p className="text-xs text-amber-600 mb-0.5">Estimated Arrival</p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(lead.powercareEta + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}

              {lead.powercarePod && (
                <div>
                  <p className="text-xs text-amber-600 mb-0.5">Delivered</p>
                  <p className="text-sm font-medium text-emerald-700 font-semibold">
                    {new Date(lead.powercarePod + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>

            {trackingNumbers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <p className="text-xs text-amber-600 mb-1.5">Tracking</p>
                <div className="flex flex-col gap-1.5">
                  {trackingNumbers.map((tn, i) => (
                    <a
                      key={i}
                      href={getTrackingUrl(tn)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-mono font-medium text-blue-600 hover:text-blue-800 hover:underline break-all"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {tn}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 border-l-2 border-orange-400 pl-2">Notes</p>
        {lead.notes && (
          <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{lead.notes}</p>
        )}
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
        />
        <button
          onClick={() => onAddNote(lead.id, noteText)}
          disabled={!noteText.trim()}
          className="mt-2 px-4 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save Note
        </button>
      </div>

      {/* Routing (admin/coo/support only) */}
      {canRoute && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-slate-400" />
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest border-l-2 border-orange-400 pl-2">Route Lead</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onRouteToService(lead.id)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <ArrowRight className="w-4 h-4" /> Route to Service
            </button>
            <select
              defaultValue=""
              onChange={e => onRouteToSales(lead.id, e.target.value)}
              className="px-3 py-2 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium border border-orange-200 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer"
            >
              <option value="">Route to Sales Rep…</option>
              {salesReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Delete lead */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 flex-1">Move this lead to Lost?</span>
            <button
              onClick={() => onDeleteLead(lead.id)}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Move to Lost
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Move to Lost
          </button>
        )}
      </div>
    </div>
  );
};
