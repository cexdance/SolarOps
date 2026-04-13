// Dashboard Types for SolarFlow Financial Module

export interface KPIMetric {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  format: 'currency' | 'percentage' | 'number';
  trend?: 'up' | 'down' | 'neutral';
}

export interface InvoicingGoal {
  monthlyGoal: number;
  currentInvoiced: number;
  percentage: number;
}

export interface CashFlowStatus {
  totalInvoiced: number;
  totalCollected: number;
  pendingToCollect: number;
}

export interface CostAnalysis {
  currentCosts: number;
  projectedCosts: number;
  laborCosts: number;
  materialCosts: number;
  overheadCosts: number;
}

export interface WorkOrderSummary {
  id: string;
  customerName: string;
  address: string;
  amount: number;
  status: 'pending' | 'invoiced' | 'paid' | 'overdue';
  dueDate: string;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  link: string;
  color: string;
}

export interface DashboardData {
  invoicingGoal: InvoicingGoal;
  cashFlow: CashFlowStatus;
  costs: CostAnalysis;
  recentWorkOrders: WorkOrderSummary[];
  quickActions: QuickAction[];
}
