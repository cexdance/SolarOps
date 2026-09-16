// SolarFlow, Ops Center Dashboard (single-column revamp)
import React, { useState, useRef, useEffect } from 'react';
import {
  Wrench, Users, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
  FileText, Receipt, CreditCard, Pencil, Plus, Trash2,
  X, ChevronRight, ExternalLink, Wifi, WifiOff, RotateCcw,
} from 'lucide-react';
import { Job, Customer, User, AppNotification } from '../types';
import { canSeeFinancials } from '../lib/access';
import { formatMoney, formatMoneyCompact } from '../lib/money';
// Shared, cloud-synced todo store, same source of truth as the Ops Center widget.
import { loadTodos, saveTodos, TodoItem } from '../lib/todoStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter';
type MetricKey =
  | 'quotes_sent' | 'invoices_sent'
  | 'quotes_to_send' | 'quotes_pending_approval' | 'quotes_to_invoice' | 'invoices_pending_payment';

interface DashConfig {
  period: Period;
  metrics: [MetricKey, MetricKey, MetricKey, MetricKey];
}

// TodoItem now comes from ../lib/todoStore (shared with the Ops Center widget).

// ── Persistence ───────────────────────────────────────────────────────────────

// v2: quote-pipeline metrics replaced the financial trio (payments/profitability/
// cost of service); bumping the key resets everyone to the new default once.
const CONFIG_KEY = (uid: string) => `solarops_dash_v2_${uid}`;

// Quote pipeline backlog: the four stages Daniel works through until quoting/
// invoicing moves to a Xero-connected agent.
const DEFAULT_CONFIG: DashConfig = {
  period: 'month',
  metrics: ['quotes_to_send', 'quotes_pending_approval', 'quotes_to_invoice', 'invoices_pending_payment'],
};

const loadConfig = (uid: string): DashConfig => {
  try {
    const r = localStorage.getItem(CONFIG_KEY(uid));
    if (r) {
      const cfg = { ...DEFAULT_CONFIG, ...JSON.parse(r) } as DashConfig;
      // Sanitize: stored configs may reference retired metrics (payments_received,
      // profitability, cost_of_service). Swap those slots back to the default.
      cfg.metrics = cfg.metrics.map((m, i) =>
        (m in METRIC_META ? m : DEFAULT_CONFIG.metrics[i]) as MetricKey
      ) as DashConfig['metrics'];
      return cfg;
    }
  } catch (e) { console.error('[Dashboard] loadConfig failed', e); }
  return DEFAULT_CONFIG;
};
const saveConfig = (uid: string, cfg: DashConfig) => {
  try { localStorage.setItem(CONFIG_KEY(uid), JSON.stringify(cfg)); } catch (e) { console.error('[Dashboard] saveConfig failed', e); }
};


// ── Metric metadata ───────────────────────────────────────────────────────────

const METRIC_META: Record<MetricKey, { label: string; Icon: React.FC<{ className?: string }>; bg: string; fg: string }> = {
  quotes_to_send:           { label: 'Quotes to Send',           Icon: FileText,   bg: 'bg-blue-50',    fg: 'text-blue-600' },
  quotes_pending_approval:  { label: 'Quotes Pending Approval',  Icon: Clock,      bg: 'bg-amber-50',   fg: 'text-amber-600' },
  quotes_to_invoice:        { label: 'Quotes to Invoice',        Icon: Receipt,    bg: 'bg-purple-50',  fg: 'text-purple-600' },
  invoices_pending_payment: { label: 'Invoices Pending Payment', Icon: CreditCard, bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  quotes_sent:              { label: 'Quotes Sent',              Icon: TrendingUp, bg: 'bg-slate-50',   fg: 'text-slate-600' },
  invoices_sent:            { label: 'Invoices Sent',            Icon: TrendingDown, bg: 'bg-slate-50', fg: 'text-slate-600' },
};
const ALL_METRICS = Object.keys(METRIC_META) as MetricKey[];
const PERIOD_LABELS: Record<Period, string> = { week: 'This Week', month: 'This Month', quarter: 'This Quarter' };

// ── Date helpers ──────────────────────────────────────────────────────────────

const getRange = (period: Period): { start: Date; end: Date } => {
  const now = new Date();
  let start: Date;
  if (period === 'week') {
    const day = now.getDay();
    start = new Date(now);
    start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
  }
  return { start, end: now };
};
const inRange = (d: string | undefined, start: Date, end: Date) => {
  if (!d) return false;
  const parts = d.split('T')[0].split('-');
  const t = parts.length === 3
    ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime()
    : new Date(d).getTime();
  return t >= start.getTime() && t <= end.getTime();
};
// Money is hidden in-app while financials live in Xero. See src/lib/money.ts.
const fmtMoney = (n: number) => formatMoneyCompact(n);

// ── Metric computation ────────────────────────────────────────────────────────

interface MetricResult { primary: string; secondary: string; isNegative?: boolean }

// The pipeline stage a job sits at for quoting purposes. woStatus is the precise
// pipeline; the coarse status is the fallback for jobs that never opened the WO panel.
const quoteStage = (j: Job): string => j.woStatus ?? j.status;

const computeMetrics = (jobs: Job[], period: Period): Record<MetricKey, MetricResult> => {
  const { start, end } = getRange(period);
  const active = jobs.filter(j => j.status !== 'archived');
  const qJobs = jobs.filter(j => inRange(j.quoteSentAt ?? j.scheduledDate, start, end) && j.quoteAmount != null);
  const iJobs = jobs.filter(j => ['invoiced', 'paid'].includes(j.status) && inRange(j.completedAt ?? j.scheduledDate, start, end));
  const iAmt  = iJobs.reduce((s, j) => s + j.totalAmount, 0);
  // Backlog counts (point-in-time, not period-bound): the quote pipeline Daniel
  // works through. draft/new = quote not sent yet; quote_sent/contact_client =
  // with the client; completed = work done, needs a Xero invoice; invoiced =
  // waiting on payment.
  const toSend    = active.filter(j => ['draft', 'new'].includes(quoteStage(j)));
  const pendingOk = active.filter(j => ['quote_sent', 'contact_client'].includes(quoteStage(j)));
  const toInvoice = active.filter(j => quoteStage(j) === 'completed');
  const pendPay   = active.filter(j => quoteStage(j) === 'invoiced');
  return {
    quotes_to_send:           { primary: toSend.length.toString(),    secondary: 'draft service orders' },
    quotes_pending_approval:  { primary: pendingOk.length.toString(), secondary: 'awaiting client confirmation' },
    quotes_to_invoice:        { primary: toInvoice.length.toString(), secondary: 'completed, not invoiced' },
    invoices_pending_payment: { primary: pendPay.length.toString(),   secondary: 'invoiced, unpaid' },
    quotes_sent:              { primary: qJobs.length.toString(), secondary: PERIOD_LABELS[period] },
    invoices_sent:            { primary: fmtMoney(iAmt), secondary: `${iJobs.length} invoice${iJobs.length !== 1 ? 's' : ''}` },
  };
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface DashboardProps {
  jobs: Job[];
  customers: Customer[];
  users: User[];
  currentUser?: User | null;
  onViewChange: (view: string) => void;
  onViewCustomer?: (customerId: string) => void;
  onJobClick?: (jobId: string) => void;
  onUpdateJob?: (job: Job) => void;
  isMobile: boolean;
  notifications?: AppNotification[];
  onMarkNotificationRead?: (notificationId: string) => void;
  isConnected?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Dashboard: React.FC<DashboardProps> = ({
  jobs, customers, currentUser, onViewChange, onViewCustomer, onJobClick, isMobile,
  notifications = [], isConnected = true,
}) => {
  const uid = currentUser?.id ?? 'default';

  // Config
  const [config, setConfig]       = useState<DashConfig>(() => loadConfig(uid));
  const [editingCard, setEditingCard] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Todos
  const [todos, setTodos]         = useState<TodoItem[]>(() => loadTodos(uid));
  const [todoInput, setTodoInput] = useState('');
  const [todoCustomerSearch, setTodoCustomerSearch] = useState('');
  const [todoCustomerPick, setTodoCustomerPick]     = useState<{ id: string; name: string } | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [editingTodoId, setEditingTodoId]           = useState<string | null>(null);
  const [editingTodoText, setEditingTodoText]       = useState('');
  const todoInputRef = useRef<HTMLInputElement>(null);

  const setPeriod = (p: Period) => {
    const next = { ...config, period: p };
    setConfig(next);
    saveConfig(uid, next);
  };
  const setCardMetric = (idx: number, key: MetricKey) => {
    const metrics = [...config.metrics] as [MetricKey, MetricKey, MetricKey, MetricKey];
    metrics[idx] = key;
    const next = { ...config, metrics };
    setConfig(next);
    saveConfig(uid, next);
    setEditingCard(null);
  };

  // Close metric picker on outside click
  useEffect(() => {
    if (editingCard === null) return undefined;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setEditingCard(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingCard]);

  // Sync editing text when editing ID changes
  useEffect(() => {
    if (editingTodoId === null) {
      setEditingTodoText('');
    } else {
      const todo = todos.find(t => t.id === editingTodoId);
      if (todo) {
        setEditingTodoText(todo.task);
      }
    }
  }, [editingTodoId, todos]);

  // Todo helpers
  const addTodo = () => {
    const text = todoInput.trim();
    if (!text) return;
    const item: TodoItem = {
      id: `todo-${Date.now()}`,
      task: text,
      dueDate: '',
      done: false,
      customerId: todoCustomerPick?.id,
      customerName: todoCustomerPick?.name,
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...todos];
    setTodos(next);
    saveTodos(uid, next);
    setTodoInput('');
    setTodoCustomerPick(null);
    setTodoCustomerSearch('');
    setShowCustomerPicker(false);
  };

  const toggleTodo = (id: string) => {
    const next = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    setTodos(next);
    saveTodos(uid, next);
  };

  const deleteTodo = (id: string) => {
    const next = todos.filter(t => t.id !== id);
    setTodos(next);
    saveTodos(uid, next);
  };

  const saveEditTodo = (id: string) => {
    const text = editingTodoText.trim();
    if (!text) return;
    const next = todos.map(t => t.id === id ? { ...t, task: text } : t);
    setTodos(next);
    saveTodos(uid, next);
    setEditingTodoId(null);
    setEditingTodoText('');
  };

  // Static data
  const pendingPaymentJobs = jobs.filter(j => j.status === 'completed' || j.status === 'invoiced');
  const unbilledJobs = jobs.filter(j => j.status === 'completed');
  // SOs sitting with the client (quote sent / contact client), oldest first, so
  // Daniel can chase confirmations from the dashboard.
  const pendingConfirmJobs = jobs
    .filter(j => j.status !== 'archived' && ['quote_sent', 'contact_client'].includes(j.woStatus ?? j.status))
    .sort((a, b) => (a.quoteSentAt ?? a.scheduledDate ?? '').localeCompare(b.quoteSentAt ?? b.scheduledDate ?? ''));
  // Short date for list rows: "6/9" style, blank when missing.
  const fmtShortDate = (d?: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('T')[0]!.split('-');
    return y && m && day ? `${Number(m)}/${Number(day)}` : '';
  };

  const jobsByStatus = {
    new:         jobs.filter(j => j.status === 'new').length,
    assigned:    jobs.filter(j => j.status === 'assigned').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    completed:   jobs.filter(j => j.status === 'completed').length,
    invoiced:    jobs.filter(j => j.status === 'invoiced').length,
    paid:        jobs.filter(j => j.status === 'paid').length,
  };

  const getCustomer    = (id: string) => customers.find(c => c.id === id);

  const metrics = computeMetrics(jobs, config.period);

  const handleViewCustomer = (customerId: string) => {
    if (onViewCustomer) {
      onViewCustomer(customerId);
    } else {
      onViewChange('customers');
    }
  };

  const statusDotColors: Record<string, string> = {
    new: 'bg-blue-500', assigned: 'bg-slate-400', in_progress: 'bg-amber-500',
    completed: 'bg-green-500', invoiced: 'bg-purple-500', paid: 'bg-emerald-600',
  };

  const customerSuggestions = todoCustomerSearch.length > 1
    ? customers
        .filter(c => c.name.toLowerCase().includes(todoCustomerSearch.toLowerCase()))
        .slice(0, 6)
    : [];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 pb-24 md:pb-10 max-w-5xl mx-auto space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-400 mt-0.5 text-xs md:text-sm">
            {new Date().toLocaleDateString('en-US', isMobile
              ? { month: 'short', day: 'numeric', year: 'numeric' }
              : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Connection indicator */}
          {isConnected ? (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Wifi className="w-3 h-3" />
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-red-500">
              <WifiOff className="w-3 h-3" />
            </div>
          )}
          {/* Notification badge */}
          {notifications.filter(n => !n.read).length > 0 && (
            <span className="text-xs bg-orange-500 text-white font-semibold px-2 py-0.5 rounded-full">
              {notifications.filter(n => !n.read).length}
            </span>
          )}
          {/* Period picker */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
            {(['week', 'month', 'quarter'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors ${
                  config.period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p === 'week' ? 'Wk' : p === 'month' ? 'Mo' : 'Qtr'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Unbilled Alert ────────────────────────────────────────────────── */}
      {unbilledJobs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-900 flex-1 min-w-0">
              <span className="font-semibold">{unbilledJobs.length} unbilled</span>
              {' '}· {formatMoney(unbilledJobs.reduce((s, j) => s + j.totalAmount, 0), { decimals: 0 })} ready to invoice
            </p>
            <button
              onClick={() => onViewChange('billing')}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors shrink-0"
            >
              Billing
            </button>
          </div>
        </div>
      )}

      {/* ── 4-Widget Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Widget 1: Metrics (financial, admin only) ──────────────────── */}
        {canSeeFinancials(currentUser) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">Quote Pipeline</h2>
            <span className="text-xs text-slate-400">Live backlog</span>
          </div>
          <div className="p-3 grid grid-cols-2 gap-3 flex-1">
            {config.metrics.map((key, idx) => {
              const { label, Icon, bg, fg } = METRIC_META[key];
              const result = metrics[key];
              const isEditing = editingCard === idx;
              return (
                <div key={idx} className="relative group bg-slate-50 rounded-xl p-3">
                  <button
                    onClick={() => setEditingCard(isEditing ? null : idx)}
                    className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 text-slate-400"
                    title="Change metric"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                    <Icon className={`w-3.5 h-3.5 ${fg}`} />
                  </div>
                  <p className={`text-lg font-bold leading-none ${result.isNegative ? 'text-red-600' : 'text-slate-900'}`}>
                    {result.primary}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500 mt-1 leading-tight">{label}</p>
                  {isEditing && (
                    <div ref={pickerRef} className="absolute top-0 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-200 z-30 p-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Choose metric</p>
                      {ALL_METRICS.map(mk => (
                        <button
                          key={mk}
                          onClick={() => setCardMetric(idx, mk)}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors ${
                            key === mk ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {METRIC_META[mk].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* SOs awaiting client confirmation: quote sent / contact client */}
          <div className="border-t border-slate-100">
            <div className="px-4 py-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Pending Client Confirmation</p>
              <span className="text-xs font-semibold text-amber-600">{pendingConfirmJobs.length}</span>
            </div>
            {pendingConfirmJobs.length === 0 ? (
              <p className="px-4 pb-3 text-xs text-slate-400">Nothing waiting on clients</p>
            ) : (
              <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
                {pendingConfirmJobs.map(job => {
                  const customer = getCustomer(job.customerId);
                  return (
                    <div
                      key={job.id}
                      className="px-4 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => onJobClick ? onJobClick(job.id) : customer && handleViewCustomer(customer.id)}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {(customer?.clientId || job.solarEdgeClientId) && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {customer?.clientId || job.solarEdgeClientId}
                          </span>
                        )}
                        <span className="text-xs font-medium text-slate-800 truncate">{customer?.name ?? job.clientName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400">{fmtShortDate(job.quoteSentAt)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          (job.woStatus ?? job.status) === 'contact_client' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {(job.woStatus ?? job.status) === 'contact_client' ? 'contact client' : 'quote sent'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Widget 2: Service Orders Pending Payment (financial, admin only) ── */}
        {canSeeFinancials(currentUser) && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900 text-sm">Service Orders Pending Payment</h2>
            </div>
            <button
              onClick={() => onViewChange('jobs')}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-0.5"
            >
              {pendingPaymentJobs.length} WOs <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {pendingPaymentJobs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No service orders pending payment</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {pendingPaymentJobs.slice(0, 5).map(job => {
                  const customer = getCustomer(job.customerId);
                  const payBadge: Record<string, string> = {
                    completed: 'bg-green-100 text-green-700',
                    invoiced:  'bg-purple-100 text-purple-700',
                    paid:      'bg-emerald-100 text-emerald-700',
                  };
                  const clientNo = customer?.clientId || job.solarEdgeClientId;
                  return (
                    <div
                      key={job.id}
                      className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={() => onJobClick ? onJobClick(job.id) : customer && handleViewCustomer(customer.id)}
                    >
                      {/* Top line: client no + name left, status badge pinned top-right */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {clientNo && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{clientNo}</span>
                          )}
                          <span className="text-sm font-medium text-slate-900 truncate">{customer?.name ?? job.clientName}</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 w-[76px] text-center ${payBadge[job.status] || 'bg-slate-100 text-slate-600'}`}>
                          {job.status.replace('_', ' ')}
                        </span>
                      </div>
                      {/* Second line: service type + lifecycle dates */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {job.serviceType && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 whitespace-nowrap">
                            {String(job.serviceType)}
                          </span>
                        )}
                        {job.completedAt && (
                          <span className="text-[11px] text-slate-500">Completed <span className="font-semibold text-slate-700">{fmtShortDate(job.completedAt)}</span></span>
                        )}
                        {job.invoicedAt && (
                          <span className="text-[11px] text-slate-500">· Invoiced <span className="font-semibold text-slate-700">{fmtShortDate(job.invoicedAt)}</span></span>
                        )}
                        {job.clientPaymentDueAt && (
                          <span className="text-[11px] text-slate-500">· Due <span className="font-semibold text-red-600">{fmtShortDate(job.clientPaymentDueAt)}</span></span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Widget 3: To-Do ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-slate-400" />
              <h2 className="font-semibold text-slate-900 text-sm">My To-Do</h2>
              {todos.filter(t => !t.done).length > 0 && (
                <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded-full">
                  {todos.filter(t => !t.done).length}
                </span>
              )}
            </div>
            {todos.filter(t => t.done).length > 0 && (
              <button
                onClick={() => { const next = todos.filter(t => !t.done); setTodos(next); saveTodos(uid, next); }}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear done
              </button>
            )}
          </div>
          {/* Add task */}
          <div className="px-4 py-3 border-b border-slate-50">
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <input
                  ref={todoInputRef}
                  type="text"
                  value={todoInput}
                  onChange={e => setTodoInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  placeholder="Add a task…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
                <div className="mt-1.5 relative">
                  {todoCustomerPick ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-orange-600 font-medium">{todoCustomerPick.name}</span>
                      <button onClick={() => { setTodoCustomerPick(null); setTodoCustomerSearch(''); }} className="text-slate-400 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={todoCustomerSearch}
                      onChange={e => { setTodoCustomerSearch(e.target.value); setShowCustomerPicker(true); }}
                      onFocus={() => setShowCustomerPicker(true)}
                      placeholder="Link to client (optional)"
                      className="w-full px-3 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-300 text-slate-500"
                    />
                  )}
                  {showCustomerPicker && customerSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                      {customerSuggestions.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={() => { setTodoCustomerPick({ id: c.id, name: c.name }); setTodoCustomerSearch(''); setShowCustomerPicker(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 border-b border-slate-50 last:border-0"
                        >
                          {c.name}
                          {c.city && <span className="text-xs text-slate-400 ml-1.5">{c.city}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={addTodo}
                disabled={!todoInput.trim()}
                className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start mt-0.5"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Task list */}
          <div className="flex-1 overflow-auto max-h-64">
            {todos.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-400 text-sm">No tasks yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {todos.map(todo => (
                  <div key={todo.id} className={`px-4 py-3 flex items-start gap-3 group ${todo.done ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={todo.done}
                      onChange={() => toggleTodo(todo.id)}
                      className="mt-0.5 w-4 h-4 rounded accent-orange-500 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      {editingTodoId === todo.id ? (
                        <textarea
                          value={editingTodoText}
                          onChange={e => setEditingTodoText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEditTodo(todo.id); }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingTodoId(null); setEditingTodoText(''); }
                          }}
                          onBlur={() => saveEditTodo(todo.id)}
                          autoFocus
                          rows={2}
                          className="w-full text-sm border border-orange-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-y bg-white text-slate-900 leading-snug"
                        />
                      ) : (
                        <p
                          className={`text-sm cursor-text ${todo.done ? 'line-through text-slate-400' : 'text-slate-800'}`}
                          onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.task); }}
                        >
                          {todo.task}
                        </p>
                      )}
                      {todo.customerName && (
                        <button
                          onClick={() => todo.customerId && handleViewCustomer(todo.customerId)}
                          className="flex items-center gap-1 mt-0.5 text-xs text-orange-500 hover:text-orange-700 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {todo.customerName}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.task); }} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteTodo(todo.id)} className="p-1 text-slate-400 hover:text-red-500 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Widget 4: Pipeline + Quick Actions ────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">Service Orders</h2>
            <button
              onClick={() => onViewChange('jobs')}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-0.5"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {/* Pipeline status counts */}
          <div className="p-4 grid grid-cols-3 gap-3 border-b border-slate-50">
            {Object.entries(jobsByStatus).map(([status, count]) => (
              <button
                key={status}
                onClick={() => onViewChange('jobs')}
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <span className={`text-2xl font-bold ${count > 0 ? 'text-slate-800' : 'text-slate-200'}`}>{count}</span>
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotColors[status]}`} />
                  <span className="text-[10px] text-slate-400 capitalize">{status.replace('_', ' ')}</span>
                </div>
              </button>
            ))}
          </div>
          {/* Quick actions */}
          <div className="p-3 grid grid-cols-2 gap-2 mt-auto">
            <button
              onClick={() => onViewChange('jobs')}
              className="p-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
            >
              <Wrench className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">New Job</span>
            </button>
            <button
              onClick={() => onViewChange('customers')}
              className="p-3 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors flex items-center gap-2"
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Customers</span>
            </button>
            <button
              onClick={() => onViewChange('billing')}
              className="p-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Billing</span>
            </button>
            <button
              onClick={() => onViewChange('technician')}
              className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">My Jobs</span>
            </button>
          </div>
        </div>

      </div>{/* end 4-widget grid */}

      {/* RMA work lives on its own board now (parts lane + site transfer lane),
          so this page links out rather than keeping a second copy that drifts. */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-xl">
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">RMA Tracker</h2>
            <p className="text-xs text-slate-500">Parts and site transfers, with compensation status.</p>
          </div>
        </div>
        <button
          onClick={() => onViewChange('rma')}
          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          Open RMA Tracker
        </button>
      </div>

    </div>
  );
};
