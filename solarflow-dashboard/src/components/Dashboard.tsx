// SolarFlow, Ops Center Dashboard (single-column revamp)
import React, { useState, useRef, useEffect } from 'react';
import { serviceOrderNo } from '../lib/woHelpers';
import {
  Wrench, Users, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
  FileText, Receipt, CreditCard, Pencil, Plus, Trash2,
  X, ChevronRight, ExternalLink, Wifi, WifiOff, RotateCcw,
} from 'lucide-react';
import { Job, Customer, User, AppNotification, RMAEntry, RMAStatus } from '../types';
import { canSeeFinancials } from '../lib/access';
import { formatMoney, formatMoneyCompact } from '../lib/money';
// Shared, cloud-synced todo store, same source of truth as the Ops Center widget.
import { loadTodos, saveTodos, TodoItem } from '../lib/todoStore';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter';
type MetricKey = 'quotes_sent' | 'invoices_sent' | 'payments_received' | 'profitability' | 'cost_of_service';

interface DashConfig {
  period: Period;
  metrics: [MetricKey, MetricKey, MetricKey, MetricKey];
}

// TodoItem now comes from ../lib/todoStore (shared with the Ops Center widget).

// ── Persistence ───────────────────────────────────────────────────────────────

const CONFIG_KEY = (uid: string) => `solarops_dash_v1_${uid}`;

const DEFAULT_CONFIG: DashConfig = {
  period: 'month',
  metrics: ['quotes_sent', 'invoices_sent', 'payments_received', 'profitability'],
};

const loadConfig = (uid: string): DashConfig => {
  try {
    const r = localStorage.getItem(CONFIG_KEY(uid));
    if (r) return { ...DEFAULT_CONFIG, ...JSON.parse(r) };
  } catch (e) { console.error('[Dashboard] loadConfig failed', e); }
  return DEFAULT_CONFIG;
};
const saveConfig = (uid: string, cfg: DashConfig) => {
  try { localStorage.setItem(CONFIG_KEY(uid), JSON.stringify(cfg)); } catch (e) { console.error('[Dashboard] saveConfig failed', e); }
};


// ── Metric metadata ───────────────────────────────────────────────────────────

const METRIC_META: Record<MetricKey, { label: string; Icon: React.FC<{ className?: string }>; bg: string; fg: string }> = {
  quotes_sent:       { label: 'Quotes Sent',       Icon: FileText,    bg: 'bg-blue-50',    fg: 'text-blue-600' },
  invoices_sent:     { label: 'Invoices Sent',      Icon: Receipt,     bg: 'bg-purple-50',  fg: 'text-purple-600' },
  payments_received: { label: 'Payments Received',  Icon: CreditCard,  bg: 'bg-green-50',   fg: 'text-green-600' },
  profitability:     { label: 'Profitability',      Icon: TrendingUp,  bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  cost_of_service:   { label: 'Cost of Service',    Icon: TrendingDown, bg: 'bg-red-50',    fg: 'text-red-600' },
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

const computeMetrics = (jobs: Job[], period: Period): Record<MetricKey, MetricResult> => {
  const { start, end } = getRange(period);
  const qJobs = jobs.filter(j => inRange(j.quoteSentAt ?? j.scheduledDate, start, end) && j.quoteAmount != null);
  const qAmt  = qJobs.reduce((s, j) => s + (j.quoteAmount ?? 0), 0);
  const iJobs = jobs.filter(j => ['invoiced', 'paid'].includes(j.status) && inRange(j.completedAt ?? j.scheduledDate, start, end));
  const iAmt  = iJobs.reduce((s, j) => s + j.totalAmount, 0);
  const pJobs = jobs.filter(j => j.status === 'paid' && inRange(j.completedAt ?? j.scheduledDate, start, end));
  const pAmt  = pJobs.reduce((s, j) => s + j.totalAmount, 0);
  const periodJobs = jobs.filter(j => inRange(j.scheduledDate, start, end));
  const cCost = periodJobs.reduce((s, j) => {
    if (!j.contractorPayRate) return s;
    return s + (j.contractorPayUnit === 'flat' ? j.contractorPayRate : j.contractorPayRate * (j.laborHours || 0));
  }, 0);
  const cos   = cCost + periodJobs.reduce((s, j) => s + (j.partsCost || 0), 0);
  const profit = pAmt - cos;
  const margin = pAmt > 0 ? (profit / pAmt) * 100 : 0;
  return {
    quotes_sent:       { primary: qJobs.length.toString(), secondary: fmtMoney(qAmt) },
    invoices_sent:     { primary: fmtMoney(iAmt), secondary: `${iJobs.length} invoice${iJobs.length !== 1 ? 's' : ''}` },
    payments_received: { primary: fmtMoney(pAmt), secondary: `${pJobs.length} payment${pJobs.length !== 1 ? 's' : ''}` },
    profitability:     { primary: fmtMoney(profit), secondary: `${margin.toFixed(0)}% margin`, isNegative: profit < 0 },
    cost_of_service:   { primary: fmtMoney(cos), secondary: `Contractor + parts · ${periodJobs.length} jobs` },
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
  jobs, customers, users, currentUser, onViewChange, onViewCustomer, onJobClick, onUpdateJob, isMobile,
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

  const jobsByStatus = {
    new:         jobs.filter(j => j.status === 'new').length,
    assigned:    jobs.filter(j => j.status === 'assigned').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    completed:   jobs.filter(j => j.status === 'completed').length,
    invoiced:    jobs.filter(j => j.status === 'invoiced').length,
    paid:        jobs.filter(j => j.status === 'paid').length,
  };

  const getCustomer    = (id: string) => customers.find(c => c.id === id);
  const getTechnician  = (id: string) => users.find(u => u.id === id);

  const metrics = computeMetrics(jobs, config.period);

  const handleViewCustomer = (customerId: string) => {
    if (onViewCustomer) {
      onViewCustomer(customerId);
    } else {
      onViewChange('customers');
    }
  };

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    assigned: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
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
            <h2 className="font-semibold text-slate-900 text-sm">Performance</h2>
            <span className="text-xs text-slate-400">{PERIOD_LABELS[config.period]}</span>
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
                  const tech = getTechnician(job.technicianId);
                  return (
                    <div
                      key={job.id}
                      className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer group"
                      onClick={() => onJobClick ? onJobClick(job.id) : customer && handleViewCustomer(customer.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 truncate">{customer?.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusColors[job.status] || 'bg-slate-100 text-slate-600'}`}>
                              {job.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400">
                              <Clock className="w-3 h-3 inline mr-0.5" />{job.scheduledTime}
                            </span>
                            {tech && <span className="text-xs text-slate-400 truncate">· {tech.name}</span>}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-slate-700 shrink-0">{formatMoney(job.totalAmount, { decimals: 0 })}</span>
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

      {/* ── Widget 5: RMA Compensation Kanban ──────────────────────────────── */}
      {(() => {
        // ── Gather all RMA rows ──────────────────────────────────────────────
        const rmaJobs = jobs.filter(j =>
          (j.rmaEntries && j.rmaEntries.length > 0) ||
          (j.lineItems?.some(li => li.rmaNumber))
        );

        if (rmaJobs.length === 0) return null;

        type RMARow = {
          job: Job;
          customer: Customer | undefined;
          entry: RMAEntry;
          source: 'rmaEntry' | 'lineItem';
          lineItemId?: string;
        };

        const rmaRows: RMARow[] = [];

        for (const job of rmaJobs) {
          const cust = getCustomer(job.customerId);
          for (const entry of (job.rmaEntries ?? [])) {
            rmaRows.push({ job, customer: cust, entry, source: 'rmaEntry' });
          }
          for (const li of (job.lineItems ?? [])) {
            if (li.rmaNumber) {
              // Check if already promoted to top-level
              const promoId = `li-${li.id}`;
              if (job.rmaEntries?.some(e => e.id === promoId)) continue;
              rmaRows.push({
                job,
                customer: cust,
                source: 'lineItem',
                lineItemId: li.id,
                entry: {
                  id: promoId,
                  manufacturer: li.manufacturer ?? '',
                  partDescription: li.description,
                  rmaNumber: li.rmaNumber,
                  caseNumber: li.caseNumber,
                  status: 'pending',
                  rmaStatus: 'processes',
                  compensationAmount: li.seCompAmount,
                  createdAt: job.createdAt,
                  createdBy: '',
                },
              });
            }
          }
        }

        // ── Resolve effective status ─────────────────────────────────────────
        const resolveStatus = (e: RMAEntry): RMAStatus => {
          if (e.rmaStatus) return e.rmaStatus;
          if (e.compensationCollected) return 'paid';
          if (e.status === 'received') return 'eligible';
          if (e.status === 'approved') return 'eligible';
          return 'processes';
        };

        // ── Column definitions ───────────────────────────────────────────────
        const COLUMNS: Array<{ id: RMAStatus; label: string; color: string; bgCard: string; dotColor: string }> = [
          { id: 'processes',     label: 'Processes',     color: 'text-amber-700',  bgCard: 'bg-amber-50',  dotColor: 'bg-amber-400' },
          { id: 'eligible',      label: 'Eligible',      color: 'text-blue-700',   bgCard: 'bg-blue-50',   dotColor: 'bg-blue-400' },
          { id: 'not_eligible',  label: 'Not Eligible',  color: 'text-slate-500',  bgCard: 'bg-slate-50',  dotColor: 'bg-slate-400' },
          { id: 'submitted',     label: 'Submitted',     color: 'text-purple-700', bgCard: 'bg-purple-50', dotColor: 'bg-purple-400' },
          { id: 'paid',          label: 'Paid',          color: 'text-green-700',  bgCard: 'bg-green-50',  dotColor: 'bg-green-400' },
        ];

        const columnMap = new Map<RMAStatus, RMARow[]>();
        for (const col of COLUMNS) columnMap.set(col.id, []);
        for (const row of rmaRows) {
          const s = resolveStatus(row.entry);
          columnMap.get(s)?.push(row);
        }
        // Sort each column by date newest first
        for (const rows of columnMap.values()) {
          rows.sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime());
        }

        // ── Move card to a new column ────────────────────────────────────────
        const moveCard = (row: RMARow, newStatus: RMAStatus) => {
          if (!onUpdateJob) return;
          const job = row.job;
          const now = new Date().toISOString();
          const isPaid = newStatus === 'paid';

          if (row.source === 'rmaEntry') {
            const updatedEntries = (job.rmaEntries ?? []).map(e =>
              e.id === row.entry.id
                ? { ...e, rmaStatus: newStatus, compensationCollected: isPaid, compensationCollectedAt: isPaid ? now : e.compensationCollectedAt }
                : e
            );
            onUpdateJob({ ...job, rmaEntries: updatedEntries });
          } else {
            // Promote line-item to top-level rmaEntries
            const existing = job.rmaEntries ?? [];
            const promoId = `li-${row.lineItemId}`;
            const alreadyPromoted = existing.find(e => e.id === promoId);
            if (alreadyPromoted) {
              const updatedEntries = existing.map(e =>
                e.id === promoId
                  ? { ...e, rmaStatus: newStatus, compensationCollected: isPaid, compensationCollectedAt: isPaid ? now : e.compensationCollectedAt }
                  : e
              );
              onUpdateJob({ ...job, rmaEntries: updatedEntries });
            } else {
              const newEntry: RMAEntry = {
                id: promoId,
                manufacturer: row.entry.manufacturer,
                partDescription: row.entry.partDescription,
                rmaNumber: row.entry.rmaNumber,
                caseNumber: row.entry.caseNumber,
                status: row.entry.status,
                rmaStatus: newStatus,
                compensationCollected: isPaid,
                compensationCollectedAt: isPaid ? now : undefined,
                compensationAmount: row.entry.compensationAmount,
                createdAt: row.entry.createdAt,
                createdBy: currentUser?.name ?? 'system',
              };
              onUpdateJob({ ...job, rmaEntries: [...existing, newEntry] });
            }
          }
        };

        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-50 rounded-lg">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900 text-sm">RMA Compensation Tracker</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {rmaRows.length} total &middot; {columnMap.get('paid')?.length ?? 0} paid
                  </p>
                </div>
              </div>
              {(columnMap.get('processes')?.length ?? 0) + (columnMap.get('eligible')?.length ?? 0) + (columnMap.get('submitted')?.length ?? 0) > 0 && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                  {(columnMap.get('processes')?.length ?? 0) + (columnMap.get('eligible')?.length ?? 0) + (columnMap.get('submitted')?.length ?? 0)} active
                </span>
              )}
            </div>

            {/* Kanban Board */}
            <div className="p-3 overflow-x-auto">
              <div className="flex gap-3 min-w-[900px]">
                {COLUMNS.map(col => {
                  const rows = columnMap.get(col.id) ?? [];
                  return (
                    <div
                      key={col.id}
                      className="flex-1 min-w-[170px] flex flex-col rounded-xl bg-slate-50/70 border border-slate-100"
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-orange-300'); }}
                      onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-orange-300'); }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('ring-2', 'ring-orange-300');
                        try {
                          const d = JSON.parse(e.dataTransfer.getData('text/plain'));
                          const row = rmaRows.find(r => r.entry.id === d.entryId && r.job.id === d.jobId);
                          if (row && resolveStatus(row.entry) !== col.id) moveCard(row, col.id);
                        } catch (e) { console.error('[Dashboard] drag-drop dataTransfer parse failed', e); }
                      }}
                    >
                      {/* Column header */}
                      <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                          <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                        </div>
                        <span className="text-[10px] bg-white text-slate-500 font-semibold px-1.5 py-0.5 rounded-full shadow-sm">
                          {rows.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="p-2 flex flex-col gap-2 max-h-[380px] overflow-y-auto flex-1">
                        {rows.map((row, idx) => {
                          const isPaid = col.id === 'paid';
                          return (
                            <div
                              key={`${row.job.id}-${row.entry.id}-${idx}`}
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.setData('text/plain', JSON.stringify({ entryId: row.entry.id, jobId: row.job.id }));
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              className={`bg-white rounded-lg border border-slate-100 p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${
                                isPaid ? 'opacity-60' : ''
                              }`}
                            >
                              {/* RMA # + amount */}
                              <div className="flex items-start justify-between gap-1">
                                <span className={`text-xs font-bold leading-tight ${isPaid ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                  #{row.entry.rmaNumber}
                                </span>
                                {(row.entry.compensationAmount ?? 0) > 0 && (
                                  <span className={`text-[10px] font-bold whitespace-nowrap ${isPaid ? 'text-green-500' : 'text-slate-700'}`}>
                                    {formatMoney(row.entry.compensationAmount ?? 0, { decimals: 0 })}
                                  </span>
                                )}
                              </div>

                              {/* Part */}
                              <p className="text-[10px] text-slate-500 mt-1 leading-tight line-clamp-2">
                                {row.entry.partDescription}
                                {row.entry.manufacturer && ` · ${row.entry.manufacturer}`}
                              </p>

                              {/* Client */}
                              {row.customer && (
                                <button
                                  onClick={() => handleViewCustomer(row.customer!.id)}
                                  className="mt-1.5 text-[10px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 truncate"
                                >
                                  <Users className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{row.customer.name}</span>
                                </button>
                              )}

                              {/* WO + date */}
                              <div className="flex items-center justify-between mt-1.5">
                                {row.job.woNumber ? (
                                  <button
                                    onClick={() => onJobClick?.(row.job.id)}
                                    className="text-[10px] text-slate-400 hover:text-slate-600 font-mono"
                                  >
                                    {serviceOrderNo(row.job.woNumber)}
                                  </button>
                                ) : <span />}
                                <span className="text-[9px] text-slate-300">
                                  {new Date(row.entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>

                              {/* Move buttons */}
                              {onUpdateJob && (
                                <div className="flex gap-1 mt-2 flex-wrap">
                                  {COLUMNS.filter(c => c.id !== col.id).map(target => (
                                    <button
                                      key={target.id}
                                      onClick={() => moveCard(row, target.id)}
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-medium border transition-colors hover:opacity-80 ${target.bgCard} ${target.color} border-current/20`}
                                    >
                                      {target.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Paid date */}
                              {isPaid && row.entry.compensationCollectedAt && (
                                <p className="text-[9px] text-green-600 mt-1.5 flex items-center gap-0.5">
                                  <CheckCircle className="w-2.5 h-2.5" />
                                  {new Date(row.entry.compensationCollectedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {rows.length === 0 && (
                          <div className="flex-1 flex items-center justify-center min-h-[60px]">
                            <p className="text-[10px] text-slate-300 italic">No items</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
