// SolarOps Operations Dashboard
// Work Orders, SolarEdge Alerts, and Client Profitability

import React, { useState, useEffect, useMemo } from 'react';
import {
  Wrench,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Plus,
  Eye,
  Edit,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  User,
  MapPin,
  ChevronRight,
  Activity,
  Zap,
  Thermometer,
  Gauge,
  Battery,
  PanelLeft,
  RefreshCw,
  MoreVertical,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  WorkOrder,
  WorkOrderStatus,
  SolarEdgeAlert,
  AlertSeverity,
  ClientProfitability,
  OperationsStats,
  CRMCustomer,
} from '../types';
import {
  loadWorkOrders,
  saveWorkOrders,
  loadAlerts,
  saveAlerts,
  generateMockWorkOrders,
  generateMockAlerts,
  calculateClientProfitability,
  calculateOperationsStats,
  getStatusColor,
  getPriorityColor,
  getSeverityColor,
  formatCurrency,
  formatPercent,
  formatHours,
} from '../lib/operationsStore';
import { loadCustomers } from '../lib/customerStore';

type TabType = 'workorders' | 'alerts' | 'profitability';

interface OperationsProps {
  currentUserId?: string;
}

export const Operations: React.FC<OperationsProps> = ({ currentUserId = 'user-1' }) => {
  const [activeTab, setActiveTab] = useState<TabType>('workorders');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [alerts, setAlerts] = useState<SolarEdgeAlert[]>([]);
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<SolarEdgeAlert | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');

  // Load data on mount
  useEffect(() => {
    const loadedCustomers = loadCustomers();
    setCustomers(loadedCustomers);

    let loadedWOs = loadWorkOrders();
    if (loadedWOs.length === 0) {
      loadedWOs = generateMockWorkOrders(loadedCustomers, 40);
      saveWorkOrders(loadedWOs);
    }
    setWorkOrders(loadedWOs);

    let loadedAlerts = loadAlerts();
    if (loadedAlerts.length === 0) {
      loadedAlerts = generateMockAlerts(loadedCustomers, 25);
      saveAlerts(loadedAlerts);
    }
    setAlerts(loadedAlerts);
  }, []);

  // Calculate stats
  const stats: OperationsStats = useMemo(() => {
    return calculateOperationsStats(workOrders, alerts);
  }, [workOrders, alerts]);

  // Calculate profitability for all customers
  const profitabilityData: ClientProfitability[] = useMemo(() => {
    return customers.map(customer => calculateClientProfitability(customer, workOrders));
  }, [customers, workOrders]);

  // Filter work orders
  const filteredWOs = useMemo(() => {
    return workOrders.filter(wo => {
      const matchesSearch = searchQuery === '' ||
        wo.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wo.woNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wo.siteAddress.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || wo.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workOrders, searchQuery, statusFilter]);

  // Filter alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const matchesSearch = searchQuery === '' ||
        alert.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [alerts, searchQuery, severityFilter]);

  const tabs = [
    { id: 'workorders' as TabType, label: 'Work Orders', icon: Wrench, count: stats.openWorkOrders },
    { id: 'alerts' as TabType, label: 'SolarEdge Alerts', icon: AlertTriangle, count: stats.unacknowledgedAlerts },
    { id: 'profitability' as TabType, label: 'Client Profitability', icon: DollarSign, count: null },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
            <p className="text-sm text-gray-500">Manage work orders, alerts, and client profitability</p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={18} />
              New Work Order
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-4">
        <StatCard
          title="Open Work Orders"
          value={stats.openWorkOrders}
          subtitle={`${stats.completedThisMonth} completed this month`}
          icon={Wrench}
          color="blue"
          trend={null}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          subtitle={`Profit: ${formatCurrency(stats.totalProfit)}`}
          icon={DollarSign}
          color="green"
          trend={stats.totalProfit > 0 ? 'up' : 'down'}
        />
        <StatCard
          title="Critical Alerts"
          value={stats.criticalAlerts}
          subtitle={`${stats.unacknowledgedAlerts} unacknowledged`}
          icon={AlertTriangle}
          color="red"
          trend={stats.criticalAlerts > 5 ? 'up' : null}
        />
        <StatCard
          title="Avg. Resolution"
          value={formatHours(stats.avgCompletionTime)}
          subtitle="Per work order"
          icon={Clock}
          color="purple"
          trend={stats.avgCompletionTime < 48 ? 'down' : 'up'}
        />
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
              {tab.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  tab.count > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {activeTab === 'workorders' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WorkOrderStatus | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="triage">Triage</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="on_site">On Site</option>
              <option value="pending_parts">Pending Parts</option>
              <option value="review">Review</option>
              <option value="completed">Completed</option>
              <option value="billed">Billed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
          {activeTab === 'alerts' && (
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'workorders' && (
          <WorkOrdersList
            workOrders={filteredWOs}
            selectedWO={selectedWO}
            onSelect={setSelectedWO}
          />
        )}
        {activeTab === 'alerts' && (
          <AlertsList
            alerts={filteredAlerts}
            selectedAlert={selectedAlert}
            onSelect={setSelectedAlert}
          />
        )}
        {activeTab === 'profitability' && (
          <ProfitabilityList
            data={profitabilityData}
          />
        )}
      </div>
    </div>
  );
};

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  trend: 'up' | 'down' | null;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon: Icon, color, trend }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon size={20} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      </div>
    </div>
  );
};

// Work Orders List Component
interface WorkOrdersListProps {
  workOrders: WorkOrder[];
  selectedWO: WorkOrder | null;
  onSelect: (wo: WorkOrder | null) => void;
}

const WorkOrdersList: React.FC<WorkOrdersListProps> = ({ workOrders, selectedWO, onSelect }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* List */}
      <div className="lg:col-span-2 space-y-3">
        {workOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Wrench className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500">No work orders found</p>
          </div>
        ) : (
          workOrders.map(wo => (
            <div
              key={wo.id}
              onClick={() => onSelect(selectedWO?.id === wo.id ? null : wo)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                selectedWO?.id === wo.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    wo.priority === 'critical' ? 'bg-red-100 text-red-600' :
                    wo.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                    wo.priority === 'medium' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    <Wrench size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{wo.woNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(wo.status)}`}>
                        {wo.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{wo.customerName}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {wo.siteAddress}
                    </p>
                  </div>
                </div>
                <ChevronRight className={`text-gray-300 transition-transform ${selectedWO?.id === wo.id ? 'rotate-90' : ''}`} size={20} />
              </div>

              {/* Expanded Details */}
              {selectedWO?.id === wo.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Type</p>
                      <p className="text-sm font-medium capitalize">{wo.type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Scheduled</p>
                      <p className="text-sm font-medium">{wo.scheduledDate || 'Not scheduled'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Technician</p>
                      <p className="text-sm font-medium">{wo.assignedTechnician || 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Revenue</p>
                      <p className="text-sm font-medium text-green-600">{formatCurrency(wo.revenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Cost</p>
                      <p className="text-sm font-medium text-red-600">{formatCurrency(wo.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Profit</p>
                      <p className={`text-sm font-medium ${wo.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(wo.profit)}
                      </p>
                    </div>
                  </div>
                  {wo.description && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-500">Description</p>
                      <p className="text-sm text-gray-700">{wo.description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary by Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4">By Status</h3>
        <div className="space-y-2">
          {['draft', 'triage', 'scheduled', 'in_progress', 'on_site', 'pending_parts', 'review', 'completed', 'billed'].map(status => {
            const count = workOrders.filter(wo => wo.status === status).length;
            if (count === 0) return null;
            return (
              <div key={status} className="flex items-center justify-between py-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status as WorkOrderStatus)}`}>
                  {status.replace('_', ' ')}
                </span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Alerts List Component
interface AlertsListProps {
  alerts: SolarEdgeAlert[];
  selectedAlert: SolarEdgeAlert | null;
  onSelect: (alert: SolarEdgeAlert | null) => void;
}

const AlertsList: React.FC<AlertsListProps> = ({ alerts, selectedAlert, onSelect }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-3">
        {alerts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <AlertTriangle className="mx-auto text-gray-300 mb-3" size={40} />
            <p className="text-gray-500">No alerts found</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div
              key={alert.id}
              onClick={() => onSelect(selectedAlert?.id === alert.id ? null : alert)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                selectedAlert?.id === alert.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              } ${alert.severity === 'critical' && !alert.acknowledged ? 'border-l-4 border-l-red-500' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                    {alert.severity === 'critical' ? <AlertCircle size={18} /> :
                     alert.severity === 'warning' ? <AlertTriangle size={18} /> :
                     <Activity size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{alert.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      {alert.workOrderCreated && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          WO Created
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{alert.customerName}</p>
                    <p className="text-xs text-gray-400 mt-1">{alert.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  {alert.acknowledged ? (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle size={12} /> Acknowledged
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle size={12} /> Pending
                    </span>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(alert.occurredAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {selectedAlert?.id === alert.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Site ID</p>
                      <p className="text-sm font-medium">{alert.siteId}</p>
                    </div>
                    {alert.inverterSerial && (
                      <div>
                        <p className="text-xs text-gray-500">Inverter Serial</p>
                        <p className="text-sm font-medium font-mono">{alert.inverterSerial}</p>
                      </div>
                    )}
                    {alert.value && (
                      <div>
                        <p className="text-xs text-gray-500">Value</p>
                        <p className="text-sm font-medium">{alert.value}{alert.unit}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Alert ID</p>
                      <p className="text-sm font-medium font-mono">{alert.alertId}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {!alert.acknowledged && (
                      <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                        <CheckCircle size={16} /> Acknowledge
                      </button>
                    )}
                    {!alert.workOrderCreated && (
                      <button className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                        <Wrench size={16} /> Create Work Order
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4">By Severity</h3>
        <div className="space-y-3">
          {['critical', 'warning', 'info'].map(severity => {
            const count = alerts.filter(a => a.severity === severity).length;
            const unack = alerts.filter(a => a.severity === severity && !a.acknowledged).length;
            return (
              <div key={severity} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(severity as AlertSeverity)}`}>
                    {severity}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                  {unack > 0 && (
                    <span className="text-xs text-red-600 ml-2">({unack} pending)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Profitability List Component
interface ProfitabilityListProps {
  data: ClientProfitability[];
}

const ProfitabilityList: React.FC<ProfitabilityListProps> = ({ data }) => {
  const sortedByProfit = [...data].sort((a, b) => b.netProfit - a.netProfit);
  const sortedByMargin = [...data].sort((a, b) => b.profitMargin - a.profitMargin);

  return (
    <div className="space-y-6">
      {/* Top Clients by Profit */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Top Clients by Profit</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Profit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">WOs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedByProfit.slice(0, 10).map((client, idx) => (
                <tr key={client.customerId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium ${
                        idx < 3 ? 'bg-yellow-500' : 'bg-gray-400'
                      }`}>
                        {client.customerName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{client.customerName}</p>
                        <p className="text-xs text-gray-500">{client.customerEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-green-600">{formatCurrency(client.totalRevenue)}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">{formatCurrency(client.totalCosts)}</td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${client.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(client.netProfit)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      client.profitMargin >= 30 ? 'bg-green-100 text-green-700' :
                      client.profitMargin >= 15 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {formatPercent(client.profitMargin)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {client.totalWorkOrders}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Margin Clients (Problem Clients) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-red-50">
          <h3 className="font-semibold text-red-900">Clients Needing Attention (Low Margin)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Profit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Open WOs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedByMargin.filter(c => c.profitMargin < 10 && c.totalWorkOrders > 0).slice(0, 10).map(client => (
                <tr key={client.customerId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-medium">
                        {client.customerName.charAt(0)}
                      </div>
                      <p className="font-medium text-gray-900">{client.customerName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-green-600">{formatCurrency(client.totalRevenue)}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">{formatCurrency(client.totalCosts)}</td>
                  <td className={`px-4 py-3 text-right text-sm font-medium ${client.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(client.netProfit)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                      {formatPercent(client.profitMargin)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{client.openWorkOrders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Clients</p>
          <p className="text-2xl font-bold text-gray-900">{data.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(data.reduce((s, c) => s + c.totalRevenue, 0))}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Profit</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.reduce((s, c) => s + c.netProfit, 0))}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Avg. Margin</p>
          <p className="text-2xl font-bold text-gray-900">{formatPercent(data.reduce((s, c) => s + c.profitMargin, 0) / data.length)}</p>
        </div>
      </div>
    </div>
  );
};

export default Operations;
