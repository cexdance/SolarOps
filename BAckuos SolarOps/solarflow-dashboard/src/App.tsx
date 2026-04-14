// SolarFlow MVP - Main Application with Contractor Module
import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Jobs } from './components/Jobs';
import { JobDetail } from './components/JobDetail';
import { Customers } from './components/Customers';
import { Billing } from './components/Billing';
import { TechnicianView } from './components/TechnicianView';
import { Settings } from './components/Settings';
import { ContractorRegister, ContractorDashboard, RateManagement, ContractorApprovals } from './components/contractor';
import { BillingModule } from './components/admin/BillingModule';
import { InventoryModule } from './components/InventoryModule';
import { CRMDashboard } from './components/CRMDashboard';
import { CustomerManagement } from './components/CustomerManagement';
import { Operations } from './components/Operations';
import { loadData, saveData } from './lib/dataStore';
import { loadContractors, saveContractors, loadServiceRates, saveServiceRates, loadContractorJobs, saveContractorJobs, initializeContractorData } from './lib/contractorStore';
import { AppState, Job, Customer, User } from './types';
import { Menu } from 'lucide-react';
import { Contractor, ContractorStatus, ContractorJob } from './types/contractor';

// Login screen component
const LoginScreen: React.FC<{
  onLogin: (user: User) => void;
  onContractorLogin: (contractor: Contractor) => void;
  onRegister: () => void;
  contractors: Contractor[];
}> = ({ onLogin, onContractorLogin, onRegister, contractors }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isContractorLogin, setIsContractorLogin] = useState(false);

  const users: User[] = [
    { id: 'user-1', name: 'Cesar Jurado (Admin)', email: 'cesar.jurado@conexsol.us', phone: '555-0100', role: 'admin', active: true },
    { id: 'user-2', name: 'Carlos Valbuena (COO)', email: 'carlos.valbuena@conexsol.us', phone: '555-0101', role: 'coo', active: true },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isContractorLogin) {
      // Contractor login
      const contractor = contractors.find(c => c.email === email && c.password === password);
      if (contractor) {
        if (contractor.status === 'approved') {
          onContractorLogin(contractor);
        } else if (contractor.status === 'pending') {
          setError('Your application is still pending approval');
        } else {
          setError('Your account has been suspended or rejected');
        }
      } else {
        setError('Invalid email or password');
      }
    } else {
      // Staff login
      const user = users.find(u => u.email === email);
      if (user && password === '1357') {
        onLogin(user);
      } else {
        setError('Invalid email or password. Try: cesar.jurado@conexsol.us / 1357');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-orange-500">SolarOps</h1>
          <p className="text-slate-400 mt-2">Operations Management Platform</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setIsContractorLogin(false)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                !isContractorLogin ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              Staff Login
            </button>
            <button
              type="button"
              onClick={() => setIsContractorLogin(true)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                isContractorLogin ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              Contractor
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isContractorLogin ? "contractor@email.com" : "you@conexsol.com"}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
            >
              Sign In
            </button>
          </form>

          {isContractorLogin && (
            <div className="mt-4 pt-4 border-t border-slate-200 text-center">
              <p className="text-sm text-slate-500">
                Want to work with us?{' '}
                <button onClick={onRegister} className="text-orange-500 font-medium hover:underline">
                  Apply now
                </button>
              </p>
            </div>
          )}

          {/* Contractor Demo credentials */}
          {isContractorLogin && (
            <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <p className="text-xs text-slate-400 mb-2">Demo Contractor:</p>
              <p className="text-xs text-slate-300">Email: mike@contractor.com</p>
              <p className="text-xs text-slate-300">Password: password123</p>
            </div>
          )}
        </div>

        {/* Demo credentials */}
        {!isContractorLogin && (
          <div className="mt-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <p className="text-xs text-slate-400 mb-2">Demo Credentials:</p>
            <p className="text-xs text-slate-300">Email: cesar.jurado@conexsol.us</p>
            <p className="text-xs text-slate-300">Password: 1357</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Pending approval screen for contractors
const PendingApprovalScreen: React.FC<{ contractor: Contractor; onLogout: () => void }> = ({ contractor, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">⏳</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Application Under Review</h1>
        <p className="text-slate-600 mb-6">
          Your contractor application for <strong>{contractor.businessName}</strong> is being reviewed by our team.
        </p>
        <div className="bg-white rounded-xl p-4 border border-slate-200 mb-6">
          <div className="flex items-center justify-center gap-2 text-amber-600">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">Pending Approval</span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Sign out and return later
        </button>
      </div>
    </div>
  );
};

function App() {
  const [data, setData] = useState<AppState>(() => loadData());
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);

  // Authentication state - load from localStorage
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const stored = localStorage.getItem('solarflow_auth');
    return stored === 'true';
  });
  const [isContractorMode, setIsContractorMode] = useState(() => {
    const stored = localStorage.getItem('solarflow_contractor_mode');
    return stored === 'true';
  });
  const [currentContractor, setCurrentContractor] = useState<Contractor | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  // Contractor data
  const [contractors, setContractors] = useState<Contractor[]>(() => {
    initializeContractorData();
    return loadContractors();
  });
  const [serviceRates, setServiceRates] = useState(() => loadServiceRates());
  const [contractorJobs, setContractorJobs] = useState(() => loadContractorJobs());

  // Save data whenever it changes
  useEffect(() => {
    saveData(data);
  }, [data]);

  // Save contractor data
  useEffect(() => {
    saveContractors(contractors);
  }, [contractors]);

  useEffect(() => {
    saveServiceRates(serviceRates);
  }, [serviceRates]);

  useEffect(() => {
    saveContractorJobs(contractorJobs);
  }, [contractorJobs]);

  // Save auth state to localStorage
  useEffect(() => {
    localStorage.setItem('solarflow_auth', isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem('solarflow_contractor_mode', isContractorMode ? 'true' : 'false');
  }, [isContractorMode]);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Computed values
  const currentUser = data.currentUser;
  const unbilledCount = data.jobs.filter((j) => j.status === 'completed').length;

  // Get selected job details
  const selectedJob = selectedJobId
    ? data.jobs.find((j) => j.id === selectedJobId)
    : null;
  const selectedCustomer = selectedJob
    ? data.customers.find((c) => c.id === selectedJob.customerId)
    : null;
  const selectedTechnician = selectedJob
    ? data.users.find((u) => u.id === selectedJob.technicianId)
    : null;

  // Auth handlers
  const handleLogin = (user: User) => {
    setData({ ...data, currentUser: user });
    setIsAuthenticated(true);
    setIsContractorMode(false);
  };

  const handleContractorLogin = (contractor: Contractor) => {
    setCurrentContractor(contractor);
    setIsAuthenticated(true);
    setIsContractorMode(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsContractorMode(false);
    setCurrentContractor(null);
    setData({ ...data, currentUser: data.users[0] });
    setCurrentView('dashboard');
  };

  const handleContractorRegister = (contractor: Contractor) => {
    setContractors([...contractors, contractor]);
    setShowRegister(false);
    setCurrentContractor(contractor);
    setIsContractorMode(true);
  };

  const handleContractorStatusUpdate = (contractorId: string, status: ContractorStatus, reason?: string) => {
    setContractors(contractors.map(c =>
      c.id === contractorId ? { ...c, status } : c
    ));
  };

  const handleContractorJobUpdate = (updatedJob: ContractorJob) => {
    setContractorJobs(contractorJobs.map(j =>
      j.id === updatedJob.id ? updatedJob : j
    ));
  };

  // Handlers
  const handleCreateJob = (job: Partial<Job>) => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      customerId: job.customerId || '',
      technicianId: job.technicianId || '',
      title: job.title || '',
      serviceType: job.serviceType || 'maintenance',
      status: 'new',
      scheduledDate: job.scheduledDate || job.date || new Date().toISOString().split('T')[0],
      scheduledTime: job.scheduledTime || '09:00',
      notes: job.notes || job.description || '',
      laborHours: job.laborHours || 1,
      laborRate: job.laborRate || 125,
      partsCost: job.partsCost || 0,
      totalAmount: job.totalAmount || 125,
      photos: [],
      createdAt: new Date().toISOString(),
      urgency: job.urgency || job.priority || 'medium',
      isPowercare: job.isPowercare || false,
    };
    setData({ ...data, jobs: [...data.jobs, newJob] });
    setCurrentView('jobs');
  };

  const handleUpdateJob = (updatedJob: Job) => {
    setData({
      ...data,
      jobs: data.jobs.map((j) => (j.id === updatedJob.id ? updatedJob : j)),
    });
  };

  const handleDeleteJob = (jobId: string) => {
    setData({
      ...data,
      jobs: data.jobs.filter((j) => j.id !== jobId),
    });
  };

  const handleCreateCustomer = (customer: Partial<Customer>) => {
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || 'FL',
      zip: customer.zip || '',
      type: customer.type || 'residential',
      notes: customer.notes || '',
      createdAt: customer.createdAt || new Date().toISOString(),
    };
    setData({ ...data, customers: [...data.customers, newCustomer] });
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    setData({
      ...data,
      customers: data.customers.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c)),
    });
  };

  const handleViewChange = (view: string, jobId?: string) => {
    setCurrentView(view);
    if (jobId) {
      setSelectedJobId(jobId);
    } else {
      setSelectedJobId(null);
    }
  };

  const handleCreateInvoice = (job: Job, xeroInvoiceId: string) => {
    console.log('Invoice created:', job.id, xeroInvoiceId);
  };

  const handleConnectXero = () => {
    setData({
      ...data,
      xeroConfig: {
        connected: true,
        organizationName: 'Conexsol LLC',
      },
    });
  };

  // SolarEdge API handlers
  const handleSaveSolarEdgeApiKey = (apiKey: string) => {
    setData({
      ...data,
      solarEdgeConfig: {
        ...data.solarEdgeConfig,
        apiKey,
      },
    });
  };

  const handleSyncSolarEdge = async () => {
    const apiKey = data.solarEdgeConfig.apiKey;
    console.log('SolarEdge sync starting with API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'EMPTY');

    if (!apiKey) {
      alert('Please enter a SolarEdge API key first');
      return;
    }

    try {
      // Fetch sites from SolarEdge API
      const url = `https://monitoringapi.solaredge.com/sites/list?api_key=${apiKey}&size=100`;
      console.log('Fetching SolarEdge sites from:', url.replace(apiKey, '***'));
      const response = await fetch(url);

      // Check for HTTP errors
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert('Invalid API key. Please check your SolarEdge API key in Settings.');
          return;
        }
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();

      // Check for SolarEdge API errors
      if (result.errors) {
        const errorMsg = result.errors?.error?.[0]?.message || 'Unknown API error';
        alert(`SolarEdge API error: ${errorMsg}`);
        return;
      }

      const sites = result.sites?.site || [];

      // Match sites with customers and update
      let matchedCount = 0;
      const updatedCustomers = data.customers.map((customer) => {
        const site = sites.find((s: any) => {
          // Match by clientId (US-XXXXX format)
          const siteName = s.name?.toLowerCase() || '';
          const customerName = customer.name?.toLowerCase() || '';
          const clientId = customer.clientId?.replace('US-', '') || '';

          return (
            s.accountId === clientId ||
            siteName.includes(customerName) ||
            customerName.includes(siteName) ||
            // Match by address
            s.location?.address?.toLowerCase()?.includes(customer.address?.toLowerCase() || '')
          );
        });

        if (site) {
          matchedCount++;
          return {
            ...customer,
            solarEdgeSiteId: String(site.id),
          };
        }
        return customer;
      });

      // Update customers and solarEdgeConfig
      setData({
        ...data,
        customers: updatedCustomers,
        solarEdgeConfig: {
          ...data.solarEdgeConfig,
          lastSync: new Date().toISOString(),
          siteCount: sites.length,
        },
      });

      alert(`Sync complete! Found ${sites.length} sites and matched ${matchedCount} customers.`);
    } catch (error) {
      console.error('SolarEdge sync error:', error);
      alert('Failed to sync with SolarEdge. Please check your API key and try again.');
    }
  };

  // Login screen
  if (!isAuthenticated) {
    if (showRegister) {
      return (
        <ContractorRegister
          onComplete={handleContractorRegister}
          onCancel={() => setShowRegister(false)}
        />
      );
    }
    return (
      <LoginScreen
        onLogin={handleLogin}
        onContractorLogin={handleContractorLogin}
        onRegister={() => setShowRegister(true)}
        contractors={contractors}
      />
    );
  }

  // Contractor mode
  if (isContractorMode && currentContractor) {
    if (currentContractor.status === 'pending') {
      return (
        <PendingApprovalScreen
          contractor={currentContractor}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <ContractorDashboard
        contractorName={currentContractor.contactName}
        jobs={contractorJobs}
        onLogout={handleLogout}
        onUpdateJob={handleContractorJobUpdate}
      />
    );
  }

  // Render appropriate view
  const renderView = () => {
    switch (currentView) {
      case 'crm':
        return (
          <CRMDashboard currentUserId={data.currentUser?.id || 'user-1'} />
        );

      case 'customers2':
        return (
          <CustomerManagement currentUserId={data.currentUser?.id || 'user-1'} />
        );

      case 'operations':
        return (
          <Operations currentUserId={data.currentUser?.id || 'user-1'} />
        );

      case 'rates':
        return (
          <RateManagement
            rates={serviceRates}
            onSaveRates={setServiceRates}
          />
        );

      case 'contractors':
        return (
          <ContractorApprovals
            contractors={contractors}
            contractorJobs={contractorJobs}
            onUpdateStatus={handleContractorStatusUpdate}
          />
        );

      case 'contractor-billing':
        return (
          <BillingModule
            jobs={contractorJobs}
            onUpdateJob={handleContractorJobUpdate}
          />
        );

      case 'dashboard':
        return (
          <Dashboard
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onViewChange={handleViewChange}
            isMobile={isMobile}
          />
        );

      case 'jobs':
        if (selectedJob && selectedCustomer && selectedTechnician) {
          return (
            <JobDetail
              job={selectedJob}
              customer={selectedCustomer}
              technician={selectedTechnician}
              onBack={() => setSelectedJobId(null)}
              onUpdateJob={handleUpdateJob}
              onCreateInvoice={handleCreateInvoice}
              isMobile={isMobile}
            />
          );
        }
        return (
          <Jobs
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onViewChange={handleViewChange}
            isMobile={isMobile}
            currentUser={currentUser}
          />
        );

      case 'jobDetail':
        if (selectedJob && selectedCustomer && selectedTechnician) {
          return (
            <JobDetail
              job={selectedJob}
              customer={selectedCustomer}
              technician={selectedTechnician}
              onBack={() => setSelectedJobId(null)}
              onUpdateJob={handleUpdateJob}
              onCreateInvoice={handleCreateInvoice}
              isMobile={isMobile}
            />
          );
        }
        return (
          <Jobs
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onViewChange={handleViewChange}
            isMobile={isMobile}
            currentUser={currentUser}
          />
        );

      case 'customers':
        return (
          <Customers
            customers={data.customers}
            jobs={data.jobs}
            onCreateCustomer={handleCreateCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onCreateJob={handleCreateJob}
            onViewCustomer={(customerId) => {
              console.log('View customer:', customerId);
            }}
            isMobile={isMobile}
          />
        );

      case 'billing':
        return (
          <Billing
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onUpdateJob={handleUpdateJob}
            xeroConnected={data.xeroConfig.connected}
            onConnectXero={handleConnectXero}
            isMobile={isMobile}
          />
        );

      case 'technician':
        return currentUser?.role === 'technician' || currentUser?.role === 'coo' ? (
          <TechnicianView
            jobs={data.jobs}
            customers={data.customers}
            currentUser={currentUser}
            onUpdateJob={handleUpdateJob}
            onViewChange={handleViewChange}
            isMobile={isMobile}
          />
        ) : (
          <Dashboard
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onViewChange={handleViewChange}
            isMobile={isMobile}
          />
        );

      case 'inventory':
        return <InventoryModule isMobile={isMobile} />;

      case 'settings':
        return (
          <Settings
            currentUser={currentUser}
            xeroConfig={data.xeroConfig}
            solarEdgeConfig={data.solarEdgeConfig}
            onConnectXero={handleConnectXero}
            onSaveSolarEdgeApiKey={handleSaveSolarEdgeApiKey}
            onSyncSolarEdge={handleSyncSolarEdge}
            onLogout={handleLogout}
            isMobile={isMobile}
          />
        );

      default:
        return (
          <Dashboard
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onViewChange={handleViewChange}
            isMobile={isMobile}
          />
        );
    }
  };

  // Add navigation items for admin
  const navItems = [
    { id: 'crm', label: 'Sales CRM' },
    { id: 'customers2', label: 'Customers' },
    { id: 'operations', label: 'Operations' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'jobs', label: 'Work Orders' },
    { id: 'customers', label: 'Legacy' },
    { id: 'billing', label: 'Billing' },
    { id: 'technician', label: 'Manage WORK ORDERS' },
    { id: 'contractors', label: 'Contractors' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'rates', label: 'Rates' },
    { id: 'settings', label: 'Settings' },
  ];

  // Navigation items for admin sidebar
  const adminNavItems = [
    { id: 'crm', label: 'Sales CRM' },
    { id: 'customers2', label: 'Customers' },
    { id: 'operations', label: 'Operations' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'jobs', label: 'Work Orders' },
    { id: 'customers', label: 'Legacy' },
    { id: 'billing', label: 'Billing' },
    { id: 'technician', label: 'Manage WORK ORDERS' },
    { id: 'contractors', label: 'Contractors' },
    { id: 'contractor-billing', label: 'Contractor Pay' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'rates', label: 'Service Rates' },
    { id: 'settings', label: 'Settings' },
  ];

  const handleAdminNavClick = (viewId: string) => {
    handleViewChange(viewId);
    setAdminSidebarOpen(false);
  };

  return (
    <>
      {/* Override Layout navigation for admin views */}
      {currentView === 'rates' || currentView === 'contractors' || currentView === 'billing' || currentView === 'contractor-billing' || currentView === 'inventory' ? (
        <div className="min-h-screen bg-slate-50">
          {/* Simple header for admin pages with hamburger menu */}
          <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setAdminSidebarOpen(!adminSidebarOpen)}
                className="p-2 hover:bg-slate-800 rounded-lg"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold text-orange-500">SolarFlow</h1>
              <span className="text-xs bg-slate-700 px-2 py-1 rounded">Admin</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleViewChange('dashboard')}
                className="text-sm hover:text-orange-400"
              >
                Back to Dashboard
              </button>
              <button
                onClick={handleLogout}
                className="text-sm text-slate-400 hover:text-white"
              >
                Sign Out
              </button>
            </div>
          </header>

          {/* Admin Sidebar Overlay */}
          {adminSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setAdminSidebarOpen(false)}
            />
          )}

          {/* Admin Sidebar */}
          <aside
            className={`
              fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out
              ${adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
          >
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <h1 className="text-xl font-bold text-orange-500">SolarFlow</h1>
                  <button
                    onClick={() => setAdminSidebarOpen(false)}
                    className="p-2 hover:bg-slate-800 rounded-lg"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <nav className="flex-1 p-4 space-y-1">
                {adminNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAdminNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      currentView === item.id
                        ? 'bg-orange-500 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="p-4 border-t border-slate-800">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </aside>

          {renderView()}
        </div>
      ) : (
        <Layout
          currentView={currentView}
          onViewChange={handleViewChange}
          currentUser={currentUser}
          onLogout={handleLogout}
          isMobile={isMobile}
          unbilledCount={unbilledCount}
        >
          {renderView()}
        </Layout>
      )}
    </>
  );
}

export default App;
