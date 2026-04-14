// SolarOps Operations Data Store
// Work Orders, SolarEdge Alerts, and Client Profitability

import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderType,
  SolarEdgeAlert,
  AlertSeverity,
  AlertType,
  ClientProfitability,
  OperationsStats,
  CRMCustomer,
} from '../types';

// Storage Keys
const WORK_ORDERS_KEY = 'solarops_work_orders';
const ALERTS_KEY = 'solarops_alerts';

// Mock Data Generators
const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const streets = ['Oak', 'Maple', 'Cedar', 'Palm', 'Pine', 'Sunset', 'Ocean', 'Main', 'First', 'Second'];
const types: WorkOrderType[] = ['maintenance', 'repair', 'inspection', 'emergency', 'warranty'];
const statuses: WorkOrderStatus[] = ['draft', 'triage', 'scheduled', 'in_progress', 'on_site', 'pending_parts', 'review', 'completed', 'billed'];
const priorities: ('low' | 'medium' | 'high' | 'critical')[] = ['low', 'medium', 'high', 'critical'];
const techs = ['Mike Johnson', 'Tom Wilson', 'Steve Davis', 'John Martinez', 'Dave Brown'];
const alertTypes: AlertType[] = ['inverter_offline', 'inverter_error', 'production_drop', 'optimizer_issue', 'communication_loss', 'maintenance_due'];
const alertSeverities: AlertSeverity[] = ['info', 'warning', 'critical'];

const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomNumber = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - randomNumber(0, daysAgo));
  return date.toISOString();
};

export const generateMockWorkOrders = (customers: CRMCustomer[], count: number = 40): WorkOrder[] => {
  const workOrders: WorkOrder[] = [];
  let woNumber = 24001;

  for (let i = 0; i < count; i++) {
    const customer = randomElement(customers);
    const type = randomElement(types);
    const status = randomElement(statuses);
    const priority = randomElement(priorities);
    const laborHours = randomNumber(1, 8);
    const laborRate = randomNumber(75, 125);
    const laborCost = laborHours * laborRate;

    const parts: { id: string; description: string; quantity: number; unitCost: number; totalCost: number }[] = [];
    const partsCount = randomNumber(0, 4);
    let partsCost = 0;

    const partOptions = [
      { desc: 'Inverter Breaker 20A', cost: 45 },
      { desc: 'DC Disconnect', cost: 120 },
      { desc: 'Optimizer Replacement', cost: 250 },
      { desc: 'Fuse Pack', cost: 35 },
      { desc: 'Wire Connectors', cost: 25 },
      { desc: 'Mounting Hardware', cost: 80 },
    ];

    for (let j = 0; j < partsCount; j++) {
      const part = randomElement(partOptions);
      const qty = randomNumber(1, 3);
      const totalCost = part.cost * qty;
      partsCost += totalCost;
      parts.push({
        id: `part-${i}-${j}`,
        description: part.desc,
        quantity: qty,
        unitCost: part.cost,
        totalCost,
      });
    }

    const totalCost = laborCost + partsCost;
    const revenue = status === 'completed' || status === 'billed'
      ? totalCost * randomNumber(12, 25) / 10
      : 0;
    const profit = revenue - totalCost;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    workOrders.push({
      id: `wo-${i + 1}`,
      woNumber: `WO-${woNumber++}`,
      customerId: customer.id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      siteAddress: `${randomNumber(100, 9999)} ${randomElement(streets)} St`,
      type,
      status,
      priority,
      scheduledDate: randomDate(30),
      scheduledTime: `${randomNumber(8, 16)}:00`,
      startedAt: status === 'in_progress' || status === 'on_site' || status === 'review' || status === 'completed' ? randomDate(14) : undefined,
      completedAt: status === 'completed' || status === 'billed' ? randomDate(7) : undefined,
      assignedTechnician: randomElement(techs),
      laborHours,
      laborRate,
      laborCost,
      parts,
      partsCost,
      totalCost,
      revenue,
      profit,
      profitMargin,
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} - ${customer.firstName}'s solar system`,
      resolutionNotes: status === 'completed' || status === 'billed' ? 'Completed successfully. All systems operational.' : undefined,
      notes: priority === 'critical' ? 'Urgent - customer reported no power' : '',
      solarEdgeSiteId: customer.id,
      source: randomElement(['manual', 'alert', 'customer_call', 'scheduled', 'inspection'] as const),
      createdAt: randomDate(60),
      updatedAt: randomDate(30),
    });
  }

  return workOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const generateMockAlerts = (customers: CRMCustomer[], count: number = 25): SolarEdgeAlert[] => {
  const alerts: SolarEdgeAlert[] = [];

  const alertDescriptions: Record<AlertType, { title: string; desc: string }> = {
    inverter_offline: { title: 'Inverter Offline', desc: 'Inverter has stopped communicating' },
    inverter_error: { title: 'Inverter Error', desc: 'Inverter reported an error code' },
    production_drop: { title: 'Production Drop', desc: 'Energy production significantly below expected' },
    panel_malfunction: { title: 'Panel Malfunction', desc: 'Panel performance below threshold' },
    optimizer_issue: { title: 'Optimizer Issue', desc: 'Optimizer communication problems detected' },
    communication_loss: { title: 'Communication Loss', desc: 'Lost communication with monitoring system' },
    maintenance_due: { title: 'Maintenance Due', desc: 'Scheduled maintenance is due' },
    warranty_expiring: { title: 'Warranty Expiring', desc: 'Equipment warranty expiring soon' },
  };

  for (let i = 0; i < count; i++) {
    const customer = randomElement(customers);
    const type = randomElement(alertTypes);
    const severity = randomElement(alertSeverities);
    const isAcknowledged = Math.random() > 0.4;
    const isResolved = Math.random() > 0.5;
    const alertInfo = alertDescriptions[type];

    alerts.push({
      id: `alert-${i + 1}`,
      alertId: `SE-${randomNumber(100000, 999999)}`,
      siteId: `site-${customer.id}`,
      siteName: `${customer.firstName} ${customer.lastName} Residence`,
      customerId: customer.id,
      customerName: `${customer.firstName} ${customer.lastName}`,
      type,
      severity,
      title: alertInfo.title,
      description: alertInfo.desc,
      inverterSerial: type === 'inverter_offline' || type === 'inverter_error' ? `SE${randomNumber(10000000, 99999999)}` : undefined,
      value: type === 'production_drop' ? randomNumber(20, 80) : undefined,
      threshold: type === 'production_drop' ? 90 : undefined,
      unit: type === 'production_drop' ? '%' : undefined,
      acknowledged: isAcknowledged,
      acknowledgedBy: isAcknowledged ? randomElement(techs) : undefined,
      acknowledgedAt: isAcknowledged ? randomDate(14) : undefined,
      resolved: isResolved,
      resolvedAt: isResolved ? randomDate(7) : undefined,
      resolvedBy: isResolved ? randomElement(techs) : undefined,
      workOrderCreated: Math.random() > 0.7,
      occurredAt: randomDate(30),
      createdAt: randomDate(30),
    });
  }

  return alerts.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
};

export const calculateClientProfitability = (
  customer: CRMCustomer,
  workOrders: WorkOrder[]
): ClientProfitability => {
  const customerWOs = workOrders.filter(wo => wo.customerId === customer.id);
  const completedWOs = customerWOs.filter(wo => wo.status === 'completed' || wo.status === 'billed');

  const installationRevenue = customer.status === 'customer' ? (customer.systemSize || 0) * 3500 : 0;
  const serviceRevenue = completedWOs.reduce((sum, wo) => sum + wo.revenue, 0);
  const maintenanceContracts = 0;

  const totalRevenue = installationRevenue + serviceRevenue + maintenanceContracts;

  const cac = customer.status === 'customer' ? randomNumber(500, 2000) : 0;
  const hardwareCosts = installationRevenue * 0.6;
  const laborCosts = completedWOs.reduce((sum, wo) => sum + wo.laborCost, 0);
  const partsCosts = completedWOs.reduce((sum, wo) => sum + wo.partsCost, 0);

  const totalCosts = cac + hardwareCosts + laborCosts + partsCosts;
  const grossProfit = totalRevenue - hardwareCosts;
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const completedWithTimes = completedWOs.filter(wo => wo.completedAt && wo.startedAt);
  const avgResolutionTime = completedWithTimes.length > 0
    ? completedWithTimes.reduce((sum, wo) => {
        const start = new Date(wo.startedAt!).getTime();
        const end = new Date(wo.completedAt!).getTime();
        return sum + (end - start) / (1000 * 60 * 60);
      }, 0) / completedWithTimes.length
    : 0;

  const lastService = customerWOs.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  return {
    customerId: customer.id,
    customerName: `${customer.firstName} ${customer.lastName}`,
    customerEmail: customer.email,
    installationRevenue,
    serviceRevenue,
    maintenanceContracts,
    totalRevenue,
    customerAcquisitionCost: cac,
    hardwareCosts,
    laborCosts,
    partsCosts,
    totalCosts,
    grossProfit,
    netProfit,
    profitMargin,
    totalWorkOrders: customerWOs.length,
    completedWorkOrders: completedWOs.length,
    openWorkOrders: customerWOs.filter(wo => !['completed', 'billed', 'cancelled'].includes(wo.status)).length,
    avgResolutionTime: Math.round(avgResolutionTime * 10) / 10,
    lifetimeValue: netProfit > 0 ? netProfit : 0,
    serviceFrequency: customerWOs.length > 0 ? customerWOs.length : 0,
    lastServiceDate: lastService?.createdAt,
    firstServiceDate: customerWOs.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0]?.createdAt,
    calculatedAt: new Date().toISOString(),
  };
};

export const calculateOperationsStats = (
  workOrders: WorkOrder[],
  alerts: SolarEdgeAlert[]
): OperationsStats => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completedThisMonth = workOrders.filter(wo => {
    if (!wo.completedAt) return false;
    return new Date(wo.completedAt) >= monthStart;
  }).length;

  const completedWithTimes = workOrders.filter(wo => wo.completedAt && wo.startedAt);
  const avgCompletionTime = completedWithTimes.length > 0
    ? completedWithTimes.reduce((sum, wo) => {
        const start = new Date(wo.startedAt!).getTime();
        const end = new Date(wo.completedAt!).getTime();
        return sum + (end - start) / (1000 * 60 * 60);
      }, 0) / completedWithTimes.length
    : 0;

  return {
    totalWorkOrders: workOrders.length,
    openWorkOrders: workOrders.filter(wo => !['completed', 'billed', 'cancelled'].includes(wo.status)).length,
    completedThisMonth,
    avgCompletionTime: Math.round(avgCompletionTime * 10) / 10,
    totalRevenue: workOrders.reduce((sum, wo) => sum + wo.revenue, 0),
    totalCosts: workOrders.reduce((sum, wo) => sum + wo.totalCost, 0),
    totalProfit: workOrders.reduce((sum, wo) => sum + wo.profit, 0),
    totalAlerts: alerts.length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    unacknowledgedAlerts: alerts.filter(a => !a.acknowledged).length,
    criticalCount: workOrders.filter(wo => wo.priority === 'critical').length,
    highCount: workOrders.filter(wo => wo.priority === 'high').length,
    mediumCount: workOrders.filter(wo => wo.priority === 'medium').length,
    lowCount: workOrders.filter(wo => wo.priority === 'low').length,
    maintenanceCount: workOrders.filter(wo => wo.type === 'maintenance').length,
    repairCount: workOrders.filter(wo => wo.type === 'repair').length,
    inspectionCount: workOrders.filter(wo => wo.type === 'inspection').length,
    emergencyCount: workOrders.filter(wo => wo.type === 'emergency').length,
  };
};

// Load/Save Functions
export const loadWorkOrders = (): WorkOrder[] => {
  try {
    const stored = localStorage.getItem(WORK_ORDERS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load work orders:', e);
  }
  return [];
};

export const saveWorkOrders = (workOrders: WorkOrder[]): void => {
  try {
    localStorage.setItem(WORK_ORDERS_KEY, JSON.stringify(workOrders));
  } catch (e) {
    console.error('Failed to save work orders:', e);
  }
};

export const loadAlerts = (): SolarEdgeAlert[] => {
  try {
    const stored = localStorage.getItem(ALERTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load alerts:', e);
  }
  return [];
};

export const saveAlerts = (alerts: SolarEdgeAlert[]): void => {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch (e) {
    console.error('Failed to save alerts:', e);
  }
};

// Helper Functions
export const getStatusColor = (status: WorkOrderStatus): string => {
  const colors: Record<WorkOrderStatus, string> = {
    draft: 'bg-gray-100 text-gray-800',
    triage: 'bg-purple-100 text-purple-800',
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    on_site: 'bg-orange-100 text-orange-800',
    pending_parts: 'bg-red-100 text-red-800',
    review: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    billed: 'bg-teal-100 text-teal-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

export const getPriorityColor = (priority: string): string => {
  const colors: Record<string, string> = {
    critical: 'bg-red-500 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-500 text-gray-900',
    low: 'bg-green-500 text-white',
  };
  return colors[priority] || 'bg-gray-500 text-white';
};

export const getSeverityColor = (severity: AlertSeverity): string => {
  const colors: Record<AlertSeverity, string> = {
    critical: 'bg-red-500 text-white',
    warning: 'bg-yellow-500 text-gray-900',
    info: 'bg-blue-500 text-white',
  };
  return colors[severity] || 'bg-gray-500 text-white';
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export const formatHours = (hours: number): string => {
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};
