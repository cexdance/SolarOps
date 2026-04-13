// SolarFlow - Admin Contractor Approvals Component
import React, { useState } from 'react';
import {
  User, Building, Shield, CheckCircle, XCircle, Clock, FileText,
  Mail, Phone, MapPin, AlertCircle, ChevronRight, DollarSign, X,
  Plus, Trash2, Pencil, Save, Wrench, ReceiptText,
} from 'lucide-react';
import { Contractor, ContractorStatus, ContractorJob, ContractorExpense } from '../../types/contractor';
import { ContractorInvite } from './ContractorInvite';
import { loadXpData, getLevelInfo } from '../../lib/contractorGamification';

interface ContractorApprovalsProps {
  contractors: Contractor[];
  contractorJobs?: ContractorJob[];
  onUpdateStatus: (contractorId: string, status: ContractorStatus, reason?: string) => void;
  onUpdateContractor?: (contractor: Contractor) => void;
  onDeleteContractor?: (contractorId: string) => void;
  adminName?: string;
  adminEmail?: string;
}

const STATUS_COLORS: Record<ContractorStatus, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
  suspended: 'bg-slate-100 text-slate-600',
};

const fmt = (d: string | undefined | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const ContractorApprovals: React.FC<ContractorApprovalsProps> = ({
  contractors,
  contractorJobs = [],
  onUpdateStatus,
  onUpdateContractor,
  onDeleteContractor,
  adminName = 'Admin',
  adminEmail = 'operations@conexsol.us',
}) => {
  const [selected, setSelected]             = useState<Contractor | null>(null);
  const [activeTab, setActiveTab]           = useState<'overview' | 'jobs' | 'expenses' | 'performance'>('overview');
  const [showInvite, setShowInvite]         = useState(false);
  const [showEditMode, setShowEditMode]     = useState(false);
  const [editForm, setEditForm]             = useState<Partial<Contractor>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal]     = useState(false);
  const [rejectReason, setRejectReason]     = useState('');
  const [earningsPeriod, setEarningsPeriod] = useState<'week' | 'curr_month' | 'prev_month' | 'ytd'>('curr_month');
  const [selectedWO, setSelectedWO]         = useState<ContractorJob | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const contractorWOs = contractorJobs.filter(j => j.contractorId === selected?.id);

  const totalEarnings = (() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    return contractorWOs
      .filter(j => {
        if (!j.completedAt) return false;
        const d = new Date(j.completedAt);
        if (earningsPeriod === 'week') {
          const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); ws.setHours(0,0,0,0);
          return d >= ws;
        }
        if (earningsPeriod === 'curr_month') return d >= new Date(y, m, 1);
        if (earningsPeriod === 'prev_month') return d >= new Date(y, m-1, 1) && d <= new Date(y, m, 0);
        return d >= new Date(y, 0, 1);
      })
      .reduce((s, j) => s + (j.contractorTotalPay || 0), 0);
  })();

  const pending  = contractors.filter(c => c.status === 'pending');
  const approved = contractors.filter(c => c.status === 'approved');
  const rejected = contractors.filter(c => c.status === 'rejected');

  const openEdit = (c: Contractor) => {
    setEditForm({
      businessName: c.businessName, contactName: c.contactName, contactPhone: c.contactPhone,
      email: c.email, streetAddress: c.streetAddress, city: c.city, state: c.state, zip: c.zip,
      insuranceProvider: c.insuranceProvider, policyNumber: c.policyNumber,
      coiExpiryDate: c.coiExpiryDate, notes: c.notes, status: c.status,
    });
    setShowEditMode(true);
  };

  const handleSaveEdit = () => {
    if (!selected || !onUpdateContractor) return;
    const updated = { ...selected, ...editForm };
    onUpdateContractor(updated);
    setSelected(updated);
    setShowEditMode(false);
  };

  const handleApprove = (c: Contractor) => {
    onUpdateStatus(c.id, 'approved');
    if (selected?.id === c.id) setSelected({ ...c, status: 'approved' });
  };

  const handleReject = () => {
    if (!selected) return;
    onUpdateStatus(selected.id, 'rejected', rejectReason);
    setShowRejectModal(false);
    setSelected(null);
    setRejectReason('');
  };

  const handleDelete = () => {
    if (!selected || !onDeleteContractor) return;
    onDeleteContractor(selected.id);
    setSelected(null);
    setShowDeleteConfirm(false);
  };

  // ── COI expiry warning ──────────────────────────────────────────────────────
  const coiDaysLeft = selected?.coiExpiryDate
    ? Math.ceil((new Date(selected.coiExpiryDate).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden bg-slate-50">

      {/* ── Invite Modal ─────────────────────────────────────────────────────── */}
      {showInvite && (
        <ContractorInvite adminName={adminName} adminEmail={adminEmail} onClose={() => setShowInvite(false)} />
      )}

      {/* ══════════════════════════ LEFT PANEL ══════════════════════════════ */}
      <div className={`flex flex-col shrink-0 border-r border-slate-200 bg-white ${selected ? 'hidden md:flex w-72' : 'flex w-full md:w-72'}`}>

        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-slate-900">Contractors</h1>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Invite
            </button>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pending',  count: pending.length,  color: 'text-amber-600',   bg: 'bg-amber-50'   },
              { label: 'Active',   count: approved.length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Rejected', count: rejected.length, color: 'text-red-500',     bg: 'bg-red-50'     },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-lg px-2 py-2 text-center`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-[10px] text-slate-500 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contractor list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {contractors.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">
              No contractors yet. Invite one to get started.
            </div>
          ) : contractors.map(c => (
            <button
              key={c.id}
              onClick={() => { setSelected(c); setActiveTab('overview'); setShowEditMode(false); }}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer ${selected?.id === c.id ? 'bg-orange-50 border-l-2 border-orange-500' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.businessName}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 capitalize ${STATUS_COLORS[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-500 truncate">{c.contactName} · {c.contactPhone}</p>
                    {(() => {
                      const xp = loadXpData(c.id);
                      const lvl = getLevelInfo(xp.totalXp);
                      return (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${lvl.bg} ${lvl.color}`}>
                          {lvl.emoji} {lvl.name}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              {c.status === 'pending' && (
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={e => { e.stopPropagation(); handleApprove(c); }}
                    className="flex-1 py-1 bg-emerald-600 text-white text-xs font-medium rounded-md hover:bg-emerald-700 cursor-pointer"
                  >
                    Approve
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setSelected(c); setShowRejectModal(true); }}
                    className="flex-1 py-1 border border-red-200 text-red-600 text-xs font-medium rounded-md hover:bg-red-50 cursor-pointer"
                  >
                    Reject
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════ RIGHT PANEL ═════════════════════════════ */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Dark header */}
          <div className="bg-slate-900 text-white px-6 py-4 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                    selected.status === 'approved'  ? 'bg-emerald-500/20 text-emerald-300' :
                    selected.status === 'pending'   ? 'bg-amber-500/20 text-amber-300' :
                    selected.status === 'rejected'  ? 'bg-red-500/20 text-red-300' :
                                                     'bg-slate-500/20 text-slate-300'
                  }`}>{selected.status}</span>
                  {coiDaysLeft !== null && coiDaysLeft <= 30 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-medium">
                      COI expires {coiDaysLeft <= 0 ? 'EXPIRED' : `in ${coiDaysLeft}d`}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white leading-snug">{selected.businessName}</h2>
                <p className="text-slate-400 text-sm">{selected.contactName} · {selected.city}, {selected.state}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!showEditMode && (
                  <>
                    <button
                      onClick={() => openEdit(selected)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    {onDeleteContractor && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => { setSelected(null); setShowEditMode(false); }}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Approve / Reject action bar for pending */}
            {selected.status === 'pending' && !showEditMode && (
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => handleApprove(selected)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve Contractor
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 border border-red-500/50 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-900/20 transition-colors cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          {!showEditMode && (
            <div className="border-b border-slate-200 bg-white px-6 shrink-0">
              <div className="flex gap-1">
                {([
                  { key: 'overview',     label: 'Overview',     icon: <Building className="w-4 h-4" /> },
                  { key: 'jobs',        label: `Work Orders (${contractorWOs.length})`, icon: <Wrench className="w-4 h-4" /> },
                  { key: 'expenses',    label: `Expenses (${selected.expenses?.length || 0})`, icon: <ReceiptText className="w-4 h-4" /> },
                  { key: 'performance', label: 'Performance',   icon: <span className="text-sm">⭐</span> },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      activeTab === t.key
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Edit Form ──────────────────────────────────────────────── */}
            {showEditMode && (
              <div className="p-6 max-w-2xl space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Business Name',   key: 'businessName',      colSpan: false },
                    { label: 'Status',          key: 'status',            colSpan: false, type: 'select' },
                    { label: 'Contact Name',    key: 'contactName',       colSpan: false },
                    { label: 'Phone',           key: 'contactPhone',      colSpan: false },
                    { label: 'Email',           key: 'email',             colSpan: true  },
                    { label: 'Street Address',  key: 'streetAddress',     colSpan: true  },
                    { label: 'City',            key: 'city',              colSpan: false },
                    { label: 'Insurance Provider', key: 'insuranceProvider', colSpan: false },
                    { label: 'Policy #',        key: 'policyNumber',      colSpan: false },
                    { label: 'COI Expiry',      key: 'coiExpiryDate',     colSpan: false, type: 'date' },
                  ].map(f => (
                    <div key={f.key} className={f.colSpan ? 'col-span-2' : ''}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                      {f.type === 'select' ? (
                        <select
                          value={(editForm as any)[f.key] ?? ''}
                          onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
                        >
                          {['pending','approved','rejected','suspended'].map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={f.type ?? 'text'}
                          value={(editForm as any)[f.key] ?? ''}
                          onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      )}
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Internal Notes</label>
                    <textarea
                      rows={3}
                      value={editForm.notes ?? ''}
                      onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowEditMode(false)}
                    className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                    Cancel
                  </button>
                  <button onClick={handleSaveEdit}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* ── Overview tab ──────────────────────────────────────────── */}
            {!showEditMode && activeTab === 'overview' && (
              <div className="p-6 space-y-5 max-w-2xl">

                {/* Earnings summary */}
                <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide">Contractor Earnings</p>
                    <p className="text-3xl font-bold mt-0.5">${totalEarnings.toLocaleString()}</p>
                  </div>
                  <select
                    value={earningsPeriod}
                    onChange={e => setEarningsPeriod(e.target.value as any)}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg text-sm cursor-pointer focus:outline-none"
                  >
                    <option value="week">This Week</option>
                    <option value="curr_month">Running Month</option>
                    <option value="prev_month">Past Month</option>
                    <option value="ytd">YTD</option>
                  </select>
                </div>

                {/* Business info */}
                <InfoCard title="Business Information" icon={<Building className="w-4 h-4" />}>
                  <Grid2>
                    <InfoRow label="Business Name" value={selected.businessName} />
                    <InfoRow label="Business Type" value={selected.businessType.replace('_', ' ')} capitalize />
                    <InfoRow label="EIN" value={selected.ein} mono />
                    <InfoRow label="Location" value={`${selected.city}, ${selected.state}`} />
                  </Grid2>
                </InfoCard>

                {/* Contact */}
                <InfoCard title="Contact" icon={<User className="w-4 h-4" />}>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400" />{selected.email}</p>
                    <p className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400" />{selected.contactPhone}</p>
                    <p className="flex items-center gap-2 text-slate-700"><MapPin className="w-4 h-4 text-slate-400" />{selected.streetAddress}, {selected.city}, {selected.state} {selected.zip}</p>
                  </div>
                </InfoCard>

                {/* Insurance */}
                <InfoCard title="Insurance" icon={<Shield className="w-4 h-4" />}>
                  <Grid2>
                    <InfoRow label="Provider" value={selected.insuranceProvider} />
                    <InfoRow label="Policy #" value={selected.policyNumber} mono />
                    <InfoRow
                      label="COI Expiry"
                      value={fmt(selected.coiExpiryDate)}
                      valueClass={coiDaysLeft !== null && coiDaysLeft <= 30 ? 'text-red-600 font-semibold' : undefined}
                    />
                    <InfoRow label="GL Limit" value={`$${selected.generalLiabilityLimit.toLocaleString()}`} />
                  </Grid2>
                </InfoCard>

                {/* Safety */}
                <InfoCard title="Safety Compliance" icon={<FileText className="w-4 h-4" />}>
                  <div className="flex items-center gap-2">
                    {selected.agreedToSafety ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm text-emerald-700">Agreed to safety protocols on {fmt(selected.safetyAgreedDate || '')}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <span className="text-sm text-amber-700">Safety protocols not yet acknowledged</span>
                      </>
                    )}
                  </div>
                </InfoCard>

                {selected.notes && (
                  <InfoCard title="Internal Notes" icon={<FileText className="w-4 h-4" />}>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{selected.notes}</p>
                  </InfoCard>
                )}
              </div>
            )}

            {/* ── Work Orders tab ───────────────────────────────────────── */}
            {!showEditMode && activeTab === 'jobs' && (
              <div className="p-6 max-w-2xl">
                {contractorWOs.length === 0 ? (
                  <div className="text-center py-12 text-sm text-slate-400">No work orders assigned yet.</div>
                ) : (
                  <div className="space-y-3">
                    {contractorWOs.map(job => (
                      <button
                        key={job.id}
                        onClick={() => setSelectedWO(job)}
                        className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm hover:border-orange-200 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm text-slate-900 capitalize">{job.serviceType}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              job.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              job.status === 'on_hold'   ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {job.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs text-slate-500">
                          <div>
                            <p className="font-medium text-slate-400 uppercase tracking-wide mb-0.5">Scheduled</p>
                            <p>{new Date(job.scheduledDate).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-400 uppercase tracking-wide mb-0.5">Customer</p>
                            <p className="truncate">{job.customerName}</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-400 uppercase tracking-wide mb-0.5">Pay</p>
                            <p className="text-emerald-600 font-semibold">${(job.contractorTotalPay || 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Expenses tab ──────────────────────────────────────────── */}
            {!showEditMode && activeTab === 'expenses' && (
              <div className="p-6 max-w-2xl">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-slate-700">Submitted Expenses</p>
                  <button
                    onClick={() => setShowExpenseModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Expense
                  </button>
                </div>
                {(!selected.expenses || selected.expenses.length === 0) ? (
                  <div className="text-center py-12 text-sm text-slate-400">No expenses submitted yet.</div>
                ) : (
                  <div className="space-y-3">
                    {selected.expenses.map(exp => (
                      <div key={exp.id} className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-slate-900">{exp.workOrderName}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              exp.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                              exp.status === 'pending'  ? 'bg-amber-100 text-amber-700' :
                              exp.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              exp.status === 'paid'     ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {exp.status.toUpperCase()}
                            </span>
                            <span className="text-sm font-bold text-slate-900">${exp.amount.toFixed(2)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 capitalize">
                          {exp.category} · {new Date(exp.dateIncurred).toLocaleDateString()}
                          {exp.attachments?.length ? ` · ${exp.attachments.length} attachment${exp.attachments.length > 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Performance tab ───────────────────────────────────────── */}
            {!showEditMode && activeTab === 'performance' && (() => {
              const xpData = loadXpData(selected.id);
              const level  = getLevelInfo(xpData.totalXp);
              const xpInLevel = xpData.totalXp - level.minXp;
              const xpNeeded  = level.maxXp === 999999 ? xpData.totalXp + 1 : level.maxXp - level.minXp;
              const progress  = xpNeeded > 0 ? Math.min(xpInLevel / xpNeeded, 1) : 1;
              const levelColors: Record<number, string> = {
                1: '#64748b', 2: '#3b82f6', 3: '#10b981', 4: '#f59e0b', 5: '#f97316', 6: '#7c3aed',
              };
              return (
                <div className="p-6 max-w-2xl space-y-5">
                  {/* Level card */}
                  <div className="rounded-2xl p-5 text-white" style={{ background: levelColors[level.level] ?? '#64748b' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-4xl">{level.emoji}</span>
                      <div>
                        <p className="text-white/70 text-xs uppercase tracking-widest">Level {level.level}</p>
                        <p className="text-xl font-black">{level.name}</p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-white/70 text-xs">Total XP</p>
                        <p className="text-2xl font-black">{xpData.totalXp.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="h-2.5 bg-white/30 rounded-full overflow-hidden">
                      <div className="h-full bg-white rounded-full" style={{ width: `${progress * 100}%` }} />
                    </div>
                    <p className="text-white/70 text-xs mt-1.5">
                      {xpInLevel.toLocaleString()} / {xpNeeded.toLocaleString()} XP in this level
                    </p>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Jobs Done',    value: xpData.counters.completedJobs,     emoji: '✅' },
                      { label: 'On Time',      value: xpData.counters.onTimeJobs,        emoji: '🎯' },
                      { label: 'Powercare',    value: xpData.counters.powercareJobs,     emoji: '🌞' },
                      { label: 'Client Sigs',  value: xpData.counters.clientSignatureJobs, emoji: '✍️' },
                      { label: 'Perfect Rpts', value: xpData.counters.perfectReports,    emoji: '📋' },
                      { label: 'Badges',       value: xpData.earnedBadges.length,        emoji: '🏅' },
                    ].map(({ label, value, emoji }) => (
                      <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                        <p className="text-xl">{emoji}</p>
                        <p className="text-xl font-black text-slate-900">{value}</p>
                        <p className="text-[10px] text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="hidden md:flex flex-1 items-center justify-center text-slate-400">
          <div className="text-center">
            <Building className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Select a contractor to view details</p>
          </div>
        </div>
      )}

      {/* ── Work Order detail modal ────────────────────────────────────────── */}
      {selectedWO && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 capitalize">{selectedWO.serviceType}</p>
                <p className="text-xs text-slate-500">{selectedWO.customerName}</p>
              </div>
              <button onClick={() => setSelectedWO(null)} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoCard title="Scheduled" icon={<Clock className="w-4 h-4" />}>
                  <p className="text-sm font-medium">{new Date(selectedWO.scheduledDate).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' })}</p>
                  <p className="text-xs text-slate-500">{selectedWO.scheduledTime}</p>
                </InfoCard>
                <InfoCard title="Status" icon={<CheckCircle className="w-4 h-4" />}>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    selectedWO.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    selectedWO.status === 'on_hold'   ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {selectedWO.status.replace('_', ' ').toUpperCase()}
                  </span>
                </InfoCard>
              </div>
              <InfoCard title="Location" icon={<MapPin className="w-4 h-4" />}>
                <p className="text-sm text-slate-700">{selectedWO.address}</p>
              </InfoCard>
              <InfoCard title="Financials" icon={<DollarSign className="w-4 h-4" />}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoRow label="Total Amount"    value={`$${(selectedWO.totalAmount || 0).toLocaleString()}`} />
                  <InfoRow label="Contractor Pay"  value={`$${(selectedWO.contractorTotalPay || 0).toLocaleString()}`} valueClass="text-emerald-600 font-bold" />
                  <InfoRow label="Labor"           value={`$${(selectedWO.laborAmount || 0).toLocaleString()}`} />
                  <InfoRow label="Parts"           value={`$${(selectedWO.partsAmount || 0).toLocaleString()}`} />
                </div>
              </InfoCard>
              {selectedWO.notes && (
                <InfoCard title="Notes" icon={<FileText className="w-4 h-4" />}>
                  <p className="text-sm text-slate-600">{selectedWO.notes}</p>
                </InfoCard>
              )}
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setSelectedWO(null)} className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────────────── */}
      {showDeleteConfirm && selected && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Delete Contractor</h2>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-4">
              Permanently delete <strong>{selected.businessName}</strong> and all associated data?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ───────────────────────────────────────────────────── */}
      {showRejectModal && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Reject Application</h2>
              <p className="text-sm text-slate-500 mt-0.5">Reject <strong>{selected.businessName}</strong>?</p>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">Reason (optional)</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Enter reason…"
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleReject}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold cursor-pointer">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Shared UI helpers ──────────────────────────────────────────────────────────

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
      {icon}{title}
    </p>
    {children}
  </div>
);

const Grid2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>
);

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean; capitalize?: boolean; valueClass?: string }> = ({
  label, value, mono, capitalize, valueClass,
}) => (
  <div>
    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
    <p className={`text-sm font-medium text-slate-800 ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''} ${valueClass ?? ''}`}>{value}</p>
  </div>
);

