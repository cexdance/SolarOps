import { DashboardData } from '../types/dashboard';

export const mockDashboardData: DashboardData = {
  invoicingGoal: {
    monthlyGoal: 85000,
    currentInvoiced: 62450,
    percentage: 73.5,
  },
  cashFlow: {
    totalInvoiced: 62450,
    totalCollected: 41200,
    pendingToCollect: 21250,
  },
  costs: {
    currentCosts: 32100,
    projectedCosts: 38500,
    laborCosts: 18500,
    materialCosts: 9800,
    overheadCosts: 3800,
  },
  recentWorkOrders: [
    {
      id: 'WO-1042',
      customerName: 'Johnson Residence',
      address: '123 Palm Beach Blvd, FL',
      amount: 450,
      status: 'pending',
      dueDate: '2026-03-01',
    },
    {
      id: 'WO-1041',
      customerName: 'Sunrise Medical Center',
      address: '456 Healthcare Dr, FL',
      amount: 2800,
      status: 'overdue',
      dueDate: '2026-02-28',
    },
    {
      id: 'WO-1040',
      customerName: 'Martinez Home',
      address: '789 Ocean View, FL',
      amount: 675,
      status: 'invoiced',
      dueDate: '2026-02-25',
    },
    {
      id: 'WO-1039',
      customerName: 'Coastal Apartments',
      address: '321 Sea Breeze Ln, FL',
      amount: 4200,
      status: 'paid',
      dueDate: '2026-02-20',
    },
    {
      id: 'WO-1038',
      customerName: 'Thompson Estate',
      address: '555 Sunset Blvd, FL',
      amount: 1250,
      status: 'invoiced',
      dueDate: '2026-02-18',
    },
  ],
  quickActions: [
    {
      id: 'audit',
      label: 'Audit Work Orders',
      description: 'Review all work orders needing attention',
      icon: 'ClipboardCheck',
      link: '/work-orders?status=review_needed',
      color: 'amber',
    },
    {
      id: 'report',
      label: 'Monthly Report',
      description: 'View detailed monthly financials',
      icon: 'FileText',
      link: '/reports/current-month',
      color: 'blue',
    },
    {
      id: 'invoice',
      label: 'Create Invoice',
      description: 'Generate new invoice',
      icon: 'Receipt',
      link: '/invoices/new',
      color: 'green',
    },
    {
      id: 'team',
      label: 'Team Status',
      description: 'View active contractor locations',
      icon: 'Users',
      link: '/team/map',
      color: 'purple',
    },
  ],
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};
