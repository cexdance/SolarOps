import { lazy } from 'react';
import type { AppState, Job, Customer, User } from '../types';
import type { Contractor, ContractorJob } from '../types/contractor';
import type { DiffItem } from './SolarEdgeImportModal';

const Layout             = lazy(() => import('./Layout').then(m => ({ default: m.Layout })));
const Dashboard          = lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
const Jobs               = lazy(() => import('./Jobs').then(m => ({ default: m.Jobs })));
const WorkOrderPanel     = lazy(() => import('./WorkOrderPanel').then(m => ({ default: m.WorkOrderPanel })));
const Customers          = lazy(() => import('./Customers').then(m => ({ default: m.Customers })));
const Billing            = lazy(() => import('./Billing').then(m => ({ default: m.Billing })));
const TechnicianView     = lazy(() => import('./TechnicianView').then(m => ({ default: m.TechnicianView })));
const Settings           = lazy(() => import('./Settings').then(m => ({ default: m.Settings })));
const ContractorDashboard = lazy(() => import('./contractor').then(m => ({ default: m.ContractorDashboard })));
const RateManagement     = lazy(() => import('./contractor').then(m => ({ default: m.RateManagement })));
const ContractorApprovals = lazy(() => import('./contractor').then(m => ({ default: m.ContractorApprovals })));
const BillingModule      = lazy(() => import('./admin/BillingModule').then(m => ({ default: m.BillingModule })));
const InventoryModule    = lazy(() => import('./InventoryModule').then(m => ({ default: m.InventoryModule })));
const SolarProjects      = lazy(() => import('./SolarProjects').then(m => ({ default: m.SolarProjects })));
const CRMDashboard       = lazy(() => import('./CRMDashboard').then(m => ({ default: m.CRMDashboard })));
const CustomerManagement = lazy(() => import('./CustomerManagement').then(m => ({ default: m.CustomerManagement })));
const Operations         = lazy(() => import('./Operations'));
const SolarEdgeMonitoring = lazy(() => import('./SolarEdgeMonitoring').then(m => ({ default: m.SolarEdgeMonitoring })));
const DispatchDashboard  = lazy(() => import('./DispatchDashboard').then(m => ({ default: m.DispatchDashboard })));
const LeadLobby          = lazy(() => import('./LeadLobby').then(m => ({ default: m.LeadLobby })));

import { addInteraction, loadCustomers, loadInteractions, saveInteractions } from '../lib/customerStore';

export interface AppRouterProps {
  data: AppState;
  currentView: string;
  isMobile: boolean;
  currentUser: User | undefined;
  contractors: Contractor[];
  contractorJobs: ContractorJob[];
  serviceRates: ReturnType<typeof import('../lib/contractorStore').loadServiceRates>;
  linkedContractor: Contractor | null;
  selectedJobId: string | null;
  selectedCustomerId: string | null;
  // Navigation
  onViewChange: (view: string, jobId?: string) => void;
  onSelectCustomer: (id: string) => void;
  // Job handlers
  onCreateJob: (job: Partial<Job>) => Job;
  onUpdateJob: (job: Job) => void;
  onDeleteJob: (id: string) => void;
  // Customer handlers
  onCreateCustomer: (customer: Partial<Customer>) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  onMergeCustomers: (primaryId: string, secondaryId: string, resolved?: Partial<Customer>) => void;
  // Contractor handlers
  onContractorJobUpdate: (job: ContractorJob) => void;
  onContractorStatusUpdate: (id: string, status: import('../types/contractor').ContractorStatus, reason?: string) => void;
  onContractorUpdate: (c: Contractor) => void;
  onContractorDelete: (id: string) => void;
  onDispatch: (cj: ContractorJob) => void;
  onSetLinkedContractor: (c: Contractor) => void;
  onSetContractors: React.Dispatch<React.SetStateAction<Contractor[]>>;
  onSetServiceRates: React.Dispatch<React.SetStateAction<any>>;
  // SolarEdge
  onSaveSolarEdgeApiKey: (key: string) => void;
  onSyncSolarEdge: () => Promise<void>;
  onUpdateFloridaSites?: () => Promise<{ newCount: number; total: number }>;
  onImportApply: (items: DiffItem[]) => void;
  // Auth
  onLogout: () => void;
}

export function AppRouter({
  data,
  currentView,
  isMobile,
  currentUser,
  contractors,
  contractorJobs,
  linkedContractor,
  selectedJobId,
  selectedCustomerId,
  onViewChange,
  onSelectCustomer,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onMergeCustomers,
  onContractorJobUpdate,
  onContractorStatusUpdate,
  onContractorUpdate,
  onContractorDelete,
  onDispatch,
  onSetLinkedContractor,
  onSetContractors,
  serviceRates,
  onSetServiceRates,
  onSaveSolarEdgeApiKey,
  onSyncSolarEdge,
  onUpdateFloridaSites,
  onImportApply,
  onLogout,
}: AppRouterProps): JSX.Element | null {
  const selectedJob      = selectedJobId ? data.jobs.find(j => j.id === selectedJobId) ?? null : null;
  const selectedCustomer = selectedJob   ? data.customers.find(c => c.id === selectedJob.customerId) ?? null : null;

  if (currentUser?.role === 'sales' && !['crm', 'customers2', 'lobby'].includes(currentView)) {
    return <CRMDashboard currentUserId={currentUser.id} />;
  }

  switch (currentView) {
    case 'lobby':
      return (
        <LeadLobby
          currentUserId={currentUser?.id ?? 'user-1'}
          currentUserRole={currentUser?.role}
          onAddCustomer={onCreateCustomer}
        />
      );

    case 'crm':
      return <CRMDashboard currentUserId={currentUser?.id ?? 'user-1'} />;

    case 'customers2':
      return <CustomerManagement currentUserId={currentUser?.id ?? 'user-1'} currentUserRole={currentUser?.role} />;

    case 'projects':
      return <SolarProjects customers={data.customers} contractorJobs={contractorJobs} isMobile={isMobile} />;

    case 'operations':
      return <Operations currentUserId={currentUser?.id ?? 'user-1'} currentUserRole={currentUser?.role} />;

    case 'rates':
      return <RateManagement rates={serviceRates as any} onSaveRates={onSetServiceRates as any} />;

    case 'contractors':
      return (
        <ContractorApprovals
          contractors={contractors}
          contractorJobs={contractorJobs}
          onUpdateStatus={onContractorStatusUpdate}
          onUpdateContractor={onContractorUpdate}
          onDeleteContractor={onContractorDelete}
          adminName={currentUser?.name ?? 'Admin'}
          adminEmail={currentUser?.email ?? 'operations@conexsol.us'}
        />
      );

    case 'contractor-billing':
      return <BillingModule jobs={contractorJobs} onUpdateJob={onContractorJobUpdate} />;

    case 'dispatch':
      return (
        <DispatchDashboard
          customers={data.customers}
          jobs={data.jobs}
          contractors={contractors}
          users={data.users}
          isMobile={isMobile}
          currentUserId={currentUser?.id ?? 'user-1'}
          onViewCustomer={(id) => { onSelectCustomer(id); onViewChange('customers'); }}
          onViewChange={(view, id) => onViewChange(view, id)}
        />
      );

    case 'dashboard':
      return (
        <Dashboard
          jobs={data.jobs}
          customers={data.customers}
          users={data.users}
          currentUser={currentUser}
          onViewChange={onViewChange}
          onViewCustomer={(id) => { onSelectCustomer(id); onViewChange('customers'); }}
          onJobClick={(jobId) => onViewChange('jobDetail', jobId)}
          isMobile={isMobile}
          notifications={data.notifications}
          onMarkNotificationRead={() => {}}
          isConnected={true}
        />
      );

    case 'jobs':
      return (
        <Jobs
          jobs={data.jobs}
          customers={data.customers}
          users={data.users}
          contractors={contractors}
          onCreateJob={onCreateJob}
          onUpdateJob={onUpdateJob}
          onDeleteJob={onDeleteJob}
          onViewChange={onViewChange}
          isMobile={isMobile}
          currentUser={currentUser}
        />
      );

    case 'jobDetail':
      if (selectedJob && selectedCustomer) {
        const clientPaidCount = data.jobs.filter(
          j => j.customerId === selectedCustomer.id && (j.status === 'paid' || j.status === 'invoiced')
        ).length;
        return (
          <WorkOrderPanel
            job={selectedJob}
            siteId={selectedCustomer.id}
            siteName={selectedCustomer.name}
            clientId={selectedCustomer.clientId}
            siteAddress={`${selectedCustomer.address}, ${selectedCustomer.city}, ${selectedCustomer.state}`}
            clientPaidJobCount={clientPaidCount}
            contractors={contractors}
            technicians={data.users.filter(u => u.role === 'technician' || u.role === 'coo').map(u => ({ id: u.id, name: u.name }))}
            users={data.users.map(u => ({ id: u.id, name: u.name, username: u.username }))}
            currentUserName={currentUser?.name}
            currentUserRole={currentUser?.role}
            customer={selectedCustomer}
            onClose={() => onViewChange('jobs')}
            onSave={(partial) => onUpdateJob({ ...selectedJob, ...partial, id: selectedJob.id } as Job)}
            onDeleteJob={(jobId) => { onDeleteJob(jobId); onViewChange('jobs'); }}
            onDispatch={(cj) => onDispatch(cj)}
            onQuoteSent={(quoteId, quoteNumber) => {
              const crmCustomers = loadCustomers();
              const crmMatch = crmCustomers.find(c => c.email?.toLowerCase() === selectedCustomer?.email?.toLowerCase());
              if (crmMatch) {
                const interactions = loadInteractions();
                const label = quoteNumber ? `Quote #${quoteNumber}` : 'Quote';
                saveInteractions(addInteraction(interactions, crmMatch.id, 'quote', `${label} emailed to ${selectedCustomer?.email ?? 'customer'}`, currentUser?.id ?? '', currentUser?.name ?? 'Staff', { subject: `${label} sent via email`, direction: 'outbound' }));
              }
            }}
            onViewCustomer={(id) => { onSelectCustomer(id); onViewChange('customers'); }}
          />
        );
      }
      return (
        <Jobs
          jobs={data.jobs}
          customers={data.customers}
          users={data.users}
          contractors={contractors}
          onCreateJob={onCreateJob}
          onUpdateJob={onUpdateJob}
          onDeleteJob={onDeleteJob}
          onViewChange={onViewChange}
          isMobile={isMobile}
          currentUser={currentUser}
        />
      );

    case 'customers':
      return (
        <Customers
          customers={data.customers}
          jobs={data.jobs}
          users={data.users}
          contractors={contractors}
          currentUser={currentUser}
          onCreateCustomer={onCreateCustomer}
          onUpdateCustomer={onUpdateCustomer}
          onDeleteCustomer={onDeleteCustomer}
          onMergeCustomers={onMergeCustomers}
          onCreateJob={onCreateJob}
          onUpdateJob={onUpdateJob}
          onDeleteJob={onDeleteJob}
          onDispatch={(cj) => onDispatch(cj)}
          onViewCustomer={() => {}}
          onSolarEdgeSites={() => onViewChange('solaredge')}
          isMobile={isMobile}
          initialCustomerId={selectedCustomerId ?? undefined}
        />
      );

    case 'billing':
      return (
        <Billing
          jobs={data.jobs}
          customers={data.customers}
          users={data.users}
          onUpdateJob={onUpdateJob}
          isMobile={isMobile}
          currentUserName={currentUser?.name}
        />
      );

    case 'technician':
      return currentUser?.role === 'technician' || currentUser?.role === 'coo' ? (
        <TechnicianView
          jobs={data.jobs}
          customers={data.customers}
          currentUser={currentUser}
          onUpdateJob={onUpdateJob}
          onViewChange={onViewChange}
          isMobile={isMobile}
        />
      ) : (
        <Dashboard
          jobs={data.jobs}
          customers={data.customers}
          users={data.users}
          currentUser={currentUser}
          onViewChange={onViewChange}
          onViewCustomer={(id) => { onSelectCustomer(id); onViewChange('customers'); }}
          isMobile={isMobile}
        />
      );

    case 'inventory':
      return <InventoryModule isMobile={isMobile} />;

    case 'solaredge':
      return (
        <SolarEdgeMonitoring
          jobs={data.jobs}
          customers={data.customers}
          contractors={contractors}
          onViewChange={onViewChange}
          onViewCustomer={(id) => { onSelectCustomer(id); onViewChange('customers'); }}
          currentUserName={currentUser?.name ?? 'Staff'}
          currentUserRole={currentUser?.role ?? 'technician'}
          onCreateJob={onCreateJob}
          onUpdateJob={onUpdateJob}
          onDispatchContractorJob={(cj) => onDispatch(cj)}
          onUpdateSites={data.solarEdgeConfig.apiKey ? onUpdateFloridaSites : undefined}
          extraSites={data.solarEdgeExtraSites ?? []}
          solarEdgeApiKey={data.solarEdgeConfig.apiKey || undefined}
          onImportApply={onImportApply}
        />
      );

    case 'my-jobs':
      if (linkedContractor) {
        return (
          <ContractorDashboard
            contractorName={linkedContractor.contactName}
            contractorId={linkedContractor.id}
            contractor={linkedContractor}
            jobs={contractorJobs.filter(j => j.contractorId === linkedContractor.id)}
            onLogout={() => onViewChange('dashboard')}
            onUpdateJob={onContractorJobUpdate}
            onUpdateContractor={(updated) => {
              onSetContractors(prev => prev.map(c => c.id === updated.id ? updated : c));
              onSetLinkedContractor(updated);
            }}
          />
        );
      }
      return (
        <div className="p-6 max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">My Jobs unavailable</h2>
          <p className="text-sm text-slate-600 mb-4">
            No contractor record is linked to your account email{currentUser?.email ? ` (${currentUser.email})` : ''}.
            Ask an admin to add this email to a contractor's <em>altEmails</em>.
          </p>
          <button
            onClick={() => onViewChange('dashboard')}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      );

    case 'settings':
      return (
        <Settings
          currentUser={currentUser}
          solarEdgeConfig={data.solarEdgeConfig}
          onSaveSolarEdgeApiKey={onSaveSolarEdgeApiKey}
          onSyncSolarEdge={onSyncSolarEdge}
          onLogout={onLogout}
          isMobile={isMobile}
        />
      );

    default:
      return (
        <Dashboard
          jobs={data.jobs}
          customers={data.customers}
          users={data.users}
          currentUser={currentUser}
          onViewChange={onViewChange}
          onViewCustomer={(id) => { onSelectCustomer(id); onViewChange('customers'); }}
          isMobile={isMobile}
        />
      );
  }
}
