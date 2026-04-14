// SolarFlow MVP - Dashboard Component
import React from 'react';
import {
  Wrench,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { Job, Customer, User } from '../types';

interface DashboardProps {
  jobs: Job[];
  customers: Customer[];
  users: User[];
  onViewChange: (view: string) => void;
  isMobile: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  jobs,
  customers,
  users,
  onViewChange,
  isMobile,
}) => {
  // Calculate metrics
  const today = new Date().toISOString().split('T')[0];
  const todayJobs = jobs.filter((j) => j.scheduledDate === today);

  const activeJobs = jobs.filter((j) => ['new', 'assigned', 'in_progress'].includes(j.status));
  const completedToday = jobs.filter(
    (j) => j.status === 'completed' && j.completedAt?.startsWith(today)
  );
  const unbilledJobs = jobs.filter((j) => j.status === 'completed');

  const totalRevenue = jobs
    .filter((j) => j.status === 'paid' || j.status === 'invoiced')
    .reduce((sum, j) => sum + j.totalAmount, 0);

  const technicians = users.filter((u) => u.role === 'technician');

  // Get jobs by status for kanban preview
  const jobsByStatus = {
    new: jobs.filter((j) => j.status === 'new').length,
    assigned: jobs.filter((j) => j.status === 'assigned').length,
    in_progress: jobs.filter((j) => j.status === 'in_progress').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    invoiced: jobs.filter((j) => j.status === 'invoiced').length,
    paid: jobs.filter((j) => j.status === 'paid').length,
  };

  const getCustomer = (customerId: string) =>
    customers.find((c) => c.id === customerId);

  const getTechnician = (techId: string) =>
    users.find((u) => u.id === techId);

  const StatCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string | number;
    subtext?: string;
    color: string;
    onClick?: () => void;
  }> = ({ icon, label, value, subtext, color, onClick }) => (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-xl p-4 shadow-sm border border-slate-100
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        {onClick && <ArrowRight className="w-4 h-4 text-slate-400" />}
      </div>
      <p className="text-2xl font-bold text-slate-900 mt-3">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Wrench className="w-5 h-5 text-blue-600" />}
          label="Today's Work Orders"
          value={todayJobs.length}
          subtext={`${activeJobs.length} active`}
          color="bg-blue-50"
          onClick={() => onViewChange('jobs')}
        />
        <StatCard
          icon={<Users className="w-5 h-5 text-green-600" />}
          label="Customers"
          value={customers.length}
          subtext={`${customers.filter((c) => c.type === 'residential').length} residential`}
          color="bg-green-50"
          onClick={() => onViewChange('customers')}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          label="Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          subtext="Invoiced + Paid"
          color="bg-emerald-50"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          label="Unbilled"
          value={unbilledJobs.length}
          subtext="Completed work orders"
          color="bg-red-50"
          onClick={() => onViewChange('billing')}
        />
      </div>

      {/* Unbilled Alert */}
      {unbilledJobs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-900">
                {unbilledJobs.length} Unbilled Job{unbilledJobs.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-red-700">
                ${unbilledJobs.reduce((sum, j) => sum + j.totalAmount, 0).toLocaleString()} in
                unbilled revenue
              </p>
            </div>
            <button
              onClick={() => onViewChange('billing')}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              View Billing
            </button>
          </div>
        </div>
      )}

      {/* Today's Schedule */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 mb-6">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-600" />
            <h2 className="font-semibold text-slate-900">Today's Schedule</h2>
          </div>
          <span className="text-sm text-slate-500">{todayJobs.length} work orders</span>
        </div>
        <div className="divide-y divide-slate-100">
          {todayJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No work orders scheduled for today
            </div>
          ) : (
            todayJobs.slice(0, isMobile ? 3 : 5).map((job) => {
              const customer = getCustomer(job.customerId);
              const technician = getTechnician(job.technicianId);
              const statusColors: Record<string, string> = {
                new: 'bg-blue-100 text-blue-700',
                assigned: 'bg-slate-100 text-slate-700',
                in_progress: 'bg-amber-100 text-amber-700',
                completed: 'bg-green-100 text-green-700',
              };

              return (
                <div
                  key={job.id}
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => onViewChange('jobs')}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {customer?.name}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            statusColors[job.status] || 'bg-slate-100'
                          }`}
                        >
                          {job.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {customer?.address}, {customer?.city}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-slate-400">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {job.scheduledTime}
                        </span>
                        <span className="text-xs text-slate-400 capitalize">
                          {job.serviceType}
                        </span>
                        {technician && (
                          <span className="text-xs text-slate-400">
                            • {technician.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">
                        ${job.totalAmount.toFixed(0)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => onViewChange('jobs')}
          className="p-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors flex flex-col items-center gap-2"
        >
          <Wrench className="w-6 h-6" />
          <span className="text-sm font-medium">New Job</span>
        </button>
        <button
          onClick={() => onViewChange('customers')}
          className="p-4 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-colors flex flex-col items-center gap-2"
        >
          <Users className="w-6 h-6" />
          <span className="text-sm font-medium">Add Customer</span>
        </button>
        <button
          onClick={() => onViewChange('billing')}
          className="p-4 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors flex flex-col items-center gap-2"
        >
          <CheckCircle className="w-6 h-6" />
          <span className="text-sm font-medium">Billing</span>
        </button>
        <button
          onClick={() => onViewChange('technician')}
          className="p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex flex-col items-center gap-2"
        >
          <TrendingUp className="w-6 h-6" />
          <span className="text-sm font-medium">My Work Orders</span>
        </button>
      </div>

      {/* Work Order Status Overview */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold text-slate-900 mb-4">Work Order Status Overview</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {Object.entries(jobsByStatus).map(([status, count]) => {
            const colors: Record<string, string> = {
              new: 'bg-blue-500',
              assigned: 'bg-slate-400',
              in_progress: 'bg-amber-500',
              completed: 'bg-green-500',
              invoiced: 'bg-purple-500',
              paid: 'bg-emerald-600',
            };
            return (
              <div key={status} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${colors[status]}`} />
                <span className="text-sm text-slate-600 capitalize">
                  {status.replace('_', ' ')}: {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
