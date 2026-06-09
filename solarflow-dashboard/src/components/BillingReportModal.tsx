/**
 * BillingReportModal, A4 print-ready billing summary report
 *
 * Triggered from the Billing dashboard via "Print Report" button.
 * Shows summary stats + line-item table for the currently filtered jobs.
 * Logo header matches the SOW report style.
 *
 * Sections:
 *   1. Header, Conexsol logo + report title + generated date
 *   2. Summary, Total / Unbilled / Invoiced / Paid stat boxes
 *   3. Line Items, one row per job (WO#, Client, Service, Date, Status, Amount)
 *   4. Totals footer
 */

import React from 'react';
import { serviceOrderNo } from '../lib/woHelpers';
import { X, FileText, CheckCircle, Clock, AlertTriangle, DollarSign } from 'lucide-react';
import { Job, Customer } from '../types';
import { formatMoney } from '../lib/money';

// ── Print styles ──────────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  @page { size: A4 landscape; margin: 14mm 16mm; }
  .billing-overlay  { position: static !important; background: white !important; display: block !important; }
  .billing-modal    { box-shadow: none !important; border-radius: 0 !important; max-height: none !important; max-width: none !important; width: 100% !important; }
  .billing-toolbar  { display: none !important; }
  .billing-body     { overflow: visible !important; max-height: none !important; }
  .billing-row      { break-inside: avoid; }
  .billing-stat-grid { break-inside: avoid; }
}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Money hidden in-app while financials live in Xero. Returns a full money string
// (with its own `$` when shown) or a neutral placeholder. See src/lib/money.ts.
function fmt(n: number) {
  return formatMoney(n);
}

function fmtDate(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type BillingStatus = 'unbilled' | 'invoiced' | 'paid';

function getBillingStatus(job: Job): BillingStatus {
  if (job.status === 'paid')     return 'paid';
  if (job.status === 'invoiced') return 'invoiced';
  return 'unbilled';
}

const STATUS_STYLE: Record<BillingStatus, { bg: string; text: string; label: string }> = {
  unbilled: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Unbilled'  },
  invoiced: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Invoiced'  },
  paid:     { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Paid'      },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobs: Job[];
  customers: Customer[];
  reportTitle?: string;  // e.g. "May 2026 Billing Report"
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const BillingReportModal: React.FC<Props> = ({
  jobs,
  customers,
  reportTitle,
  onClose,
}) => {
  const getCustomer = (id: string) => customers.find(c => c.id === id);

  // Compute totals
  const total      = jobs.reduce((s, j) => s + j.totalAmount, 0);
  const unbilled   = jobs.filter(j => getBillingStatus(j) === 'unbilled').reduce((s, j) => s + j.totalAmount, 0);
  const invoiced   = jobs.filter(j => getBillingStatus(j) === 'invoiced').reduce((s, j) => s + j.totalAmount, 0);
  const paid       = jobs.filter(j => getBillingStatus(j) === 'paid').reduce((s, j) => s + j.totalAmount, 0);

  const unbilledCount = jobs.filter(j => getBillingStatus(j) === 'unbilled').length;
  const invoicedCount = jobs.filter(j => getBillingStatus(j) === 'invoiced').length;
  const paidCount     = jobs.filter(j => getBillingStatus(j) === 'paid').length;

  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const title = reportTitle || 'Billing Report';

  // Sort: paid last, unbilled first
  const sortedJobs = [...jobs].sort((a, b) => {
    const order: Record<BillingStatus, number> = { unbilled: 0, invoiced: 1, paid: 2 };
    const diff = order[getBillingStatus(a)] - order[getBillingStatus(b)];
    if (diff !== 0) return diff;
    const dateA = new Date(a.completedAt || a.scheduledDate || a.createdAt).getTime();
    const dateB = new Date(b.completedAt || b.scheduledDate || b.createdAt).getTime();
    return dateB - dateA;
  });

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div className="billing-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
        <div className="billing-modal bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

          {/* ── Toolbar ── */}
          <div className="billing-toolbar flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Billing Report</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">A4 landscape · {jobs.length} jobs</p>
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

          {/* ── Printable body ── */}
          <div className="billing-body overflow-y-auto" id="billing-print-area">
            <div className="p-7 space-y-6">

              {/* ── Letterhead ──────────────────────────────────────── */}
              <div className="flex items-start justify-between gap-4 pb-5 border-b-2 border-slate-900">
                <div className="flex flex-col gap-1">
                  <img
                    src="/conexsol-logo-color.svg"
                    alt="Conexsol Energy"
                    className="h-10 w-auto object-contain"
                    style={{ maxWidth: '200px' }}
                  />
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{title}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900">{title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Generated {generatedDate}</p>
                  <p className="text-[11px] text-slate-400">{jobs.length} service order{jobs.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* ── Summary stat boxes ───────────────────────────────── */}
              <div className="billing-stat-grid grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <DollarSign className="w-4 h-4 text-slate-500" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total</p>
                  </div>
                  <p className="text-xl font-black text-slate-900">{fmt(total)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{jobs.length} jobs</p>
                </div>
                {/* Unbilled */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Unbilled</p>
                  </div>
                  <p className="text-xl font-black text-red-900">{fmt(unbilled)}</p>
                  <p className="text-[10px] text-red-400 mt-0.5">{unbilledCount} jobs</p>
                </div>
                {/* Invoiced */}
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Clock className="w-4 h-4 text-purple-500" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-600">Invoiced</p>
                  </div>
                  <p className="text-xl font-black text-purple-900">{fmt(invoiced)}</p>
                  <p className="text-[10px] text-purple-400 mt-0.5">{invoicedCount} jobs</p>
                </div>
                {/* Paid */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-green-600">Paid</p>
                  </div>
                  <p className="text-xl font-black text-green-900">{fmt(paid)}</p>
                  <p className="text-[10px] text-green-400 mt-0.5">{paidCount} jobs</p>
                </div>
              </div>

              {/* ── Line items table ─────────────────────────────────── */}
              <div>
                {/* Table header */}
                <div className="grid gap-2 px-3 py-2 bg-slate-900 rounded-t-xl text-white"
                  style={{ gridTemplateColumns: '7rem 1fr 1fr 6rem 5.5rem 5rem 5.5rem 5.5rem' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest">SO #</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest">Client</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest">Service</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest">Date</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest">Status</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-right">Hours</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-right">Parts</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-right">Total</p>
                </div>

                {/* Rows */}
                <div className="border border-slate-200 border-t-0 rounded-b-xl overflow-hidden">
                  {sortedJobs.map((job, i) => {
                    const customer = getCustomer(job.customerId);
                    const status   = getBillingStatus(job);
                    const st       = STATUS_STYLE[status];
                    const date     = fmtDate(job.completedAt || job.scheduledDate);
                    const isLast   = i === sortedJobs.length - 1;

                    return (
                      <div
                        key={job.id}
                        className={`billing-row grid gap-2 px-3 py-2.5 items-center text-xs
                          ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                          ${!isLast ? 'border-b border-slate-100' : ''}
                        `}
                        style={{ gridTemplateColumns: '7rem 1fr 1fr 6rem 5.5rem 5rem 5.5rem 5.5rem' }}
                      >
                        <p className="font-mono text-[10px] text-slate-500 truncate">{job.woNumber ? serviceOrderNo(job.woNumber) : '-'}</p>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{customer?.name ?? '-'}</p>
                          {customer?.city && <p className="text-[10px] text-slate-400 truncate">{customer.city}</p>}
                        </div>
                        <p className="text-slate-600 truncate">{job.serviceType}</p>
                        <p className="text-slate-500 text-[10px]">{date}</p>
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                        <p className="text-right text-slate-700">{job.laborHours ? `${job.laborHours}h` : '-'}</p>
                        <p className="text-right text-slate-700">{job.partsCost > 0 ? fmt(job.partsCost) : '-'}</p>
                        <p className="text-right font-bold text-slate-900">{fmt(job.totalAmount)}</p>
                      </div>
                    );
                  })}

                  {/* Totals row */}
                  <div
                    className="grid gap-2 px-3 py-3 bg-slate-900 text-white items-center"
                    style={{ gridTemplateColumns: '7rem 1fr 1fr 6rem 5.5rem 5rem 5.5rem 5.5rem' }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest col-span-5">Grand Total</p>
                    <p className="text-right text-[10px] font-semibold">
                      {jobs.reduce((s, j) => s + (j.laborHours || 0), 0)}h
                    </p>
                    <p className="text-right text-[10px] font-semibold">
                      {fmt(jobs.reduce((s, j) => s + (j.partsCost || 0), 0))}
                    </p>
                    <p className="text-right font-black">{fmt(total)}</p>
                  </div>
                </div>
              </div>

              {/* ── Footer ──────────────────────────────────────────── */}
              <div className="pt-4 border-t-2 border-slate-900 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <p className="text-xs font-medium">
                    <span className="text-green-600 font-bold">{fmt(paid)}</span> collected ·{' '}
                    <span className="text-red-600 font-bold">{fmt(unbilled)}</span> outstanding
                  </p>
                </div>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                  Conexsol Energy · Generated {generatedDate}
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
};
