// SolarFlow — Ops Center Dashboard (single-column revamp)
import React, { useState, useRef, useEffect } from 'react';
import {
  Wrench, Users, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
  Calendar, AtSign, FileText, Receipt, CreditCard, Pencil, Plus, Trash2,
  X, ChevronRight, ExternalLink, Bell, Wifi, WifiOff,
} from 'lucide-react';
import { Job, Customer, User, AppNotification } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter';
type MetricKey = 'quotes_sent' | 'invoices_sent' | 'payments_received' | 'profitability' | 'cost_of_service';

interface DashConfig {
  period: Period;
  metrics: [MetricKey, MetricKey, MetricKey, MetricKey];
}

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  customerId?: string;
  customerName?: string;
  createdAt: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const CONFIG_KEY = (uid: string) => `solarops_dash_v1_${uid}`;
const TODO_KEY   = (uid: string) => `solarops_todos_v1_${uid}`;

const DEFAULT_CONFIG: DashConfig = {
  period: 'month',
  metrics: ['quotes_sent', 'invoices_sent', 'payments_received', 'profitability'],
};

const loadConfig = (uid: string): DashConfig => {
  try {
    const r = localStorage.getItem(CONFIG_KEY(uid));
    if (r) return { ...DEFAULT_CONFIG, ...JSON.parse(r) };
  } catch {}
  return DEFAULT_CONFIG;
};
const saveConfig = (uid: string, cfg: DashConfig) => {
  try { localStorage.setItem(CONFIG_KEY(uid), JSON.stringify(cfg)); } catch {}
};

const loadTodos = (uid: string): TodoItem[] => {
  try {
    const r = localStorage.getItem(TODO_KEY(uid));
    if (r) return JSON.parse(r);
  } catch {}
  return [];
};
const saveTodos = (uid: string, todos: TodoItem[]) => {
  try { localStorage.setItem(TODO_KEY(uid), JSON.stringify(todos)); } catch {}
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
  const t = new Date(d).getTime();
  return t >= start.getTime() && t <= end.getTime();
};
const fmtMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
};

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
  isMobile: boolean;
  notifications?: AppNotification[];
  onMarkNotificationRead?: (notificationId: string) => void;
  isConnected?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const Dashboard: React.FC<DashboardProps> = ({
  jobs, customers, users, currentUser, onViewChange, onViewCustomer, onJobClick, isMobile,
  notifications = [], onMarkNotificationRead, isConnected = true,
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
    if (editingCard === null) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setEditingCard(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingCard]);

  // Todo helpers
  const addTodo = () => {
    const text = todoInput.trim();
    if (!text) return;
    const item: TodoItem = {
      id: `todo-${Date.now()}`,
      text,
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
    const next = todos.map(t => t.id === id ? { ...t, text } : t);
    setTodos(next);
    saveTodos(uid, next);
    setEditingTodoId(null);
  };

  // Static data
  const today      = new Date().toISOString().split('T')[0];
  const todayJobs  = jobs.filter(j => j.scheduledDate === today);
  const unbilledJobs = jobs.filter(j => j.status === 'completed');
  const technicians  = users.filter(u => u.role === 'technician');

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

  const myMentions = currentUser
    ? customers.flatMap(c =>
        (c.activityHistory || [])
          .filter(a =>
            a.type === 'note_added' &&
            (a.mentions?.includes(currentUser.id) ||
             a.description.toLowerCase().includes(`@${currentUser.name.toLowerCase()}`))
          )
          .map(a => ({ activity: a, customer: c }))
      ).sort((a, b) => new Date(b.activity.timestamp).getTime() - new Date(a.activity.timestamp).getTime())
    : [];

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
    <div className="p-4 md:p-6 pb-24 md:pb-10 max-w-3xl mx-auto space-y-4 md:space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Ops Center</h1>
          <p className="text-slate-400 mt-0.5 text-xs md:text-sm">
            {new Date().toLocaleDateString('en-US', isMobile
              ? { month: 'short', day: 'numeric', year: 'numeric' }
              : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
            )}
          </p>
        </div>
        <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5 shrink-0">
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

      {/* ── Stat Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {config.metrics.map((key, idx) => {
          const { label, Icon, bg, fg } = METRIC_META[key];
          const result = metrics[key];
          const isEditing = editingCard === idx;
          return (
            <div key={idx} className="relative group bg-white rounded-xl p-3 md:p-4 shadow-sm border border-slate-100">
              <button
                onClick={() => setEditingCard(isEditing ? null : idx)}
                className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100 hover:bg-slate-200 text-slate-500"
                title="Change metric"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <div className={`inline-flex p-1.5 rounded-lg ${bg} mb-2`}>
                <Icon className={`w-4 h-4 ${fg}`} />
              </div>
              <p className={`text-xl md:text-2xl font-bold ${result.isNegative ? 'text-red-600' : 'text-slate-900'}`}>
                {result.primary}
              </p>
              <p className="text-xs font-medium text-slate-600 mt-0.5 leading-tight">{label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">{result.secondary}</p>

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

      {/* ── Unbilled Alert ────────────────────────────────────────────────── */}
      {unbilledJobs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 md:p-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-red-100 rounded-lg shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-900 text-sm">
                {unbilledJobs.length} Unbilled Job{unbilledJobs.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-red-700">
                ${unbilledJobs.reduce((s, j) => s + j.totalAmount, 0).toLocaleString()} ready to invoice
              </p>
            </div>
            <button
              onClick={() => onViewChange('billing')}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors shrink-0"
            >
              Go to Billing
            </button>
          </div>
        </div>
      )}

      {/* ── Today's Schedule ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Today's Schedule</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{todayJobs.length} WOs</span>
            <button
              onClick={() => onViewChange('jobs')}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-0.5"
            >
              All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
        {todayJobs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No work orders scheduled today</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {todayJobs.slice(0, isMobile ? 4 : 8).map(job => {
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-slate-900 truncate">{customer?.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusColors[job.status] || 'bg-slate-100 text-slate-600'}`}>
                          {job.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">
                          <Clock className="w-3 h-3 inline mr-0.5" />{job.scheduledTime}
                        </span>
                        {customer?.city && <span className="text-xs text-slate-400">{customer.city}</span>}
                        {tech && <span className="text-xs text-slate-400 hidden sm:inline">· {tech.name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-slate-800">${job.totalAmount.toFixed(0)}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-orange-400 transition-colors" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── My To-Do ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900 text-sm">My To-Do</h2>
          </div>
          {todos.filter(t => t.done).length > 0 && (
            <button
              onClick={() => {
                const next = todos.filter(t => !t.done);
                setTodos(next);
                saveTodos(uid, next);
              }}
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
              {/* Customer link picker */}
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
                    className="w-full px-3 py-1.5 text-xs border border-slate-100 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-300 text-slate-500 placeholder:text-slate-400"
                  />
                )}
                {showCustomerPicker && customerSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                    {customerSuggestions.map(c => (
                      <button
                        key={c.id}
                        onMouseDown={() => {
                          setTodoCustomerPick({ id: c.id, name: c.name });
                          setTodoCustomerSearch('');
                          setShowCustomerPicker(false);
                        }}
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
                    <input
                      type="text"
                      value={editingTodoText}
                      onChange={e => setEditingTodoText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditTodo(todo.id); if (e.key === 'Escape') setEditingTodoId(null); }}
                      onBlur={() => saveEditTodo(todo.id)}
                      autoFocus
                      className="w-full text-sm border-b border-orange-400 focus:outline-none bg-transparent text-slate-900"
                    />
                  ) : (
                    <p
                      className={`text-sm cursor-text ${todo.done ? 'line-through text-slate-400' : 'text-slate-800'}`}
                      onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); }}
                    >
                      {todo.text}
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
                  <button
                    onClick={() => { setEditingTodoId(todo.id); setEditingTodoText(todo.text); }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── WO Status ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-900 mb-3 text-sm">Work Order Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-y-2 gap-x-3">
          {Object.entries(jobsByStatus).map(([status, count]) => (
            <button
              key={status}
              onClick={() => onViewChange('jobs')}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <span className={`text-xl font-bold ${count > 0 ? 'text-slate-800' : 'text-slate-300'}`}>{count}</span>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${statusDotColors[status]}`} />
                <span className="text-[10px] text-slate-500 capitalize">{status.replace('_', ' ')}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900 text-sm">Notifications</h2>
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="ml-auto text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                {notifications.filter(n => !n.read).length} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {isConnected ? (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <Wifi className="w-3 h-3" />
                <span>Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </div>
            )}
          </div>
        </div>
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No notifications</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.slice(0, 5).map(notification => (
              <div
                key={notification.id}
                onClick={() => {
                  onMarkNotificationRead?.(notification.id);
                  if (notification.relatedJobId && onJobClick) onJobClick(notification.relatedJobId);
                }}
                className={`px-4 py-3 cursor-pointer transition-colors group ${
                  notification.read ? 'hover:bg-slate-50' : 'bg-orange-50 hover:bg-orange-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  {!notification.read && (
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${notification.read ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>
                      {notification.title}
                    </p>
                    <p className={`text-xs mt-0.5 ${notification.read ? 'text-slate-400' : 'text-slate-600'}`}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(notification.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-orange-400 transition-colors shrink-0 mt-0.5" />
                </div>
              </div>
            ))}
            {notifications.length > 5 && (
              <div className="px-4 py-2 text-center">
                <button
                  onClick={() => onViewChange('notifications')}
                  className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  View all {notifications.length} notifications
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => onViewChange('jobs')}
          className="p-3 md:p-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2.5"
        >
          <Wrench className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">New Job</span>
        </button>
        <button
          onClick={() => onViewChange('customers')}
          className="p-3 md:p-4 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors flex items-center gap-2.5"
        >
          <Users className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">Customers</span>
        </button>
        <button
          onClick={() => onViewChange('billing')}
          className="p-3 md:p-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2.5"
        >
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">Billing</span>
        </button>
        <button
          onClick={() => onViewChange('technician')}
          className="p-3 md:p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2.5"
        >
          <TrendingUp className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">My Jobs</span>
        </button>
      </div>

      {/* ── Team ──────────────────────────────────────────────────────────── */}
      {technicians.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <h3 className="font-semibold text-slate-900 mb-3 text-sm">Team</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {technicians.map(t => {
              const assigned = jobs.filter(j => j.technicianId === t.id && ['assigned', 'in_progress'].includes(j.status)).length;
              return (
                <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                  <span className="text-sm text-slate-700 truncate">{t.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${assigned > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                    {assigned} active
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mentions ──────────────────────────────────────────────────────── */}
      {currentUser && myMentions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-orange-100 rounded-lg">
              <AtSign className="w-4 h-4 text-orange-600" />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">Your Mentions</h3>
            <span className="ml-auto text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
              {myMentions.length}
            </span>
          </div>
          <div className="space-y-2">
            {myMentions.slice(0, 5).map(({ activity, customer }) => (
              <div
                key={activity.id}
                onClick={() => handleViewCustomer(customer.id)}
                className="flex gap-3 p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors group"
              >
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-900 truncate">{customer.name}</span>
                    {activity.userName && (
                      <span className="text-xs text-slate-400 shrink-0">from {activity.userName}</span>
                    )}
                    <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-orange-400 ml-auto shrink-0" />
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {activity.description.split(/(@\S+)/g).map((part, i) =>
                      part.startsWith('@')
                        ? <span key={i} className="text-orange-600 font-semibold">{part}</span>
                        : part
                    )}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(activity.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
            {myMentions.length > 5 && (
              <p className="text-xs text-center text-slate-400 pt-1">+{myMentions.length - 5} more</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
