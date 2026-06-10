// SolarFlow MVP - Layout Component
import React, { useState, useRef, useEffect } from 'react';
import { getVersionString } from '../lib/versionConfig';
import {
  LayoutDashboard,
  Wrench,
  Users,
  Receipt,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  ChevronRight,
  UserCog,
  DollarSign,
  Package,
  Sun,
  Crosshair,
  MapPinned,
  TrendingUp,
  UserCheck,
  Inbox,
  HardHat,
  Bell,
  CheckCheck,
  Briefcase,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { User as UserType, AppNotification, Customer, Job } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  currentUser: UserType | null;
  onLogout: () => void;
  isMobile: boolean;
  unbilledCount: number;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  linkedContractorName?: string | null;
  versionState?: 'idle' | 'checking' | 'up-to-date' | 'update-available';
  remoteVersion?: string | null;
  onCheckForUpdate?: () => Promise<void>;
  onUpdate?: () => void;
  customers?: Customer[];
  jobs?: Job[];
  onSelectCustomer?: (customerId: string) => void;
}

const allNavItems = [
  { id: 'dispatch',           label: 'Ops Center',        icon: Crosshair,       dispatch: true,  roles: ['admin', 'coo', 'technician', 'support'] },
  { id: 'dashboard',          label: 'Dashboard',          icon: LayoutDashboard,                  roles: ['admin', 'coo', 'technician', 'support'] },
  { id: 'customers',          label: 'Customers',          icon: Users,                            roles: ['admin', 'coo', 'technician', 'support'] },
  { id: 'lobby',              label: 'Lead Lobby',         icon: Inbox,           indent: true, parent: 'customers', roles: ['admin', 'coo', 'support', 'sales'] },
  { id: 'solaredge',          label: 'SolarEdge Sites',    icon: Sun,             indent: true, parent: 'customers', roles: ['admin', 'coo', 'support'] },
  { id: 'jobs',               label: 'Service Orders',        icon: Wrench,                           roles: ['admin', 'coo', 'technician', 'support'] },
  { id: 'routes',             label: 'Dispatch Map',       icon: MapPinned,       indent: true, parent: 'jobs', roles: ['admin', 'coo', 'technician', 'support'] },
  { id: 'rma',               label: 'RMA Tracker',        icon: RotateCcw,                           roles: ['admin', 'coo', 'support'] },
  { id: 'billing',            label: 'Billing',            icon: Receipt,         badge: 'unbilled', roles: ['admin'] },
  { id: 'contractor-billing', label: 'Contractor Pay',     icon: DollarSign,      indent: true, parent: 'billing', roles: ['admin'] },
  { id: 'rates',              label: 'Service Rates',      icon: DollarSign,      indent: true, parent: 'billing', roles: ['admin'] },
  { id: 'contractors',        label: 'Contractors',        icon: UserCog,                          roles: ['admin', 'coo', 'support'] },
  { id: 'projects',           label: 'New Install',        icon: HardHat,                          roles: ['admin', 'coo', 'support'] },
  { id: 'inventory',          label: 'Inventory',          icon: Package,                          roles: ['admin', 'coo', 'support'] },
  { id: 'settings',           label: 'Settings',           icon: Settings,                         roles: ['admin', 'coo', 'support'] },
  // Sales-only routes
  { id: 'crm',                label: 'Sales CRM',          icon: TrendingUp,                       roles: ['sales'] },
  { id: 'customers2',         label: 'Clients',            icon: UserCheck,                        roles: ['sales'] },
];

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onViewChange,
  currentUser,
  onLogout,
  isMobile,
  unbilledCount,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  linkedContractorName,
  versionState = 'idle',
  remoteVersion,
  onCheckForUpdate,
  onUpdate,
  customers = [],
  jobs = [],
  onSelectCustomer,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // RC widget is loaded on-demand from Settings, not auto-loaded here

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Build RMA/case index: customerId → all rma+case numbers from their jobs
  const rmaIndex = React.useMemo(() => {
    const idx: Record<string, string[]> = {};
    for (const job of jobs) {
      if (!job.customerId) continue;
      if (!idx[job.customerId]) idx[job.customerId] = [];
      for (const entry of job.rmaEntries ?? []) {
        if (entry.rmaNumber) idx[job.customerId].push(entry.rmaNumber.toLowerCase());
        if (entry.caseNumber) idx[job.customerId].push(entry.caseNumber.toLowerCase());
      }
    }
    return idx;
  }, [jobs]);

  const searchResults: { customer: Customer; matchLabel: string }[] = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    const results: { customer: Customer; matchLabel: string }[] = [];
    for (const c of customers) {
      let matchLabel = '';
      if (c.name.toLowerCase().includes(q)) {
        matchLabel = c.name;
      } else if (c.phone?.toLowerCase().includes(q)) {
        matchLabel = c.phone;
      } else if (c.email?.toLowerCase().includes(q)) {
        matchLabel = c.email;
      } else if (c.clientId?.toLowerCase().includes(q)) {
        matchLabel = `Client #${c.clientId}`;
      } else if (c.solarEdgeSiteId?.toLowerCase().includes(q)) {
        matchLabel = c.solarEdgeSiteId;
      } else if (c.address?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q)) {
        matchLabel = [c.address, c.city, c.state].filter(Boolean).join(', ');
      } else if ((rmaIndex[c.id] ?? []).some(r => r.includes(q))) {
        const match = (rmaIndex[c.id] ?? []).find(r => r.includes(q)) ?? '';
        matchLabel = `RMA/Case: ${match.toUpperCase()}`;
      }
      if (matchLabel) results.push({ customer: c, matchLabel });
      if (results.length >= 8) break;
    }
    return results;
  }, [searchQuery, customers, rmaIndex]);

  const handleSelectCustomer = (id: string) => {
    onSelectCustomer?.(id);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const myNotifications = notifications.filter(n => n.userId === currentUser?.id);
  const unreadCount = myNotifications.filter(n => !n.read).length;
  // SolarEdge Sites is hidden by default; auto-expands when that view is active
  const [customersExpanded, setCustomersExpanded] = useState(
    ['solaredge', 'lobby'].includes(currentView)
  );
  const [billingExpanded, setBillingExpanded] = useState(
    ['contractor-billing', 'rates'].includes(currentView)
  );

  const role = currentUser?.role ?? 'technician';
  const navItems = allNavItems.filter(item => item.roles.includes(role));

  const getBadgeCount = (badge?: string) => {
    if (badge === 'unbilled') return unbilledCount;
    return 0;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header with Hamburger Menu - Always Visible */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 -ml-2 hover:bg-slate-800 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          {/* Logo, cropped wrapper removes PNG whitespace */}
          <div className="overflow-hidden" style={{ height: 34, width: 150 }}>
            <img
              src="/conexsol-logo.png"
              alt="Conexsol"
              className="brightness-0 invert"
              style={{ width: 150, height: 'auto', marginTop: -41 }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentUser && (
            <span className="text-sm text-slate-300 hidden sm:block">{currentUser.name}</span>
          )}

          {/* Global Search */}
          <div ref={searchRef} className="relative">
            <div className={`flex items-center transition-all duration-200 ${searchOpen ? 'bg-slate-800 rounded-lg' : ''}`}>
              {searchOpen && (
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); } }}
                  placeholder="Search name, US-15XXX, or phone…"
                  className="w-48 sm:w-64 bg-transparent text-sm text-white placeholder-slate-400 pl-3 pr-1 py-2 outline-none"
                />
              )}
              <button
                onClick={() => setSearchOpen(v => !v)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Search clients"
              >
                <Search className="w-5 h-5 text-slate-300" />
              </button>
            </div>

            {searchOpen && searchQuery.trim().length >= 1 && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-5 text-center text-sm text-slate-400">No clients found</div>
                ) : (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {searchResults.map(({ customer: c, matchLabel }) => (
                        <li key={c.id}>
                          <button
                            onClick={() => handleSelectCustomer(c.id)}
                            className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors"
                          >
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {c.clientId && <span className="text-orange-500 font-semibold mr-1.5">{c.clientId}</span>}
                              {c.name}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {matchLabel !== c.name ? matchLabel : (c.email || c.phone || c.city || '')}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Notification Bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-orange-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-sm sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <span className="text-sm font-semibold text-slate-800">
                    Notifications {unreadCount > 0 && <span className="text-orange-500">({unreadCount} new)</span>}
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={onMarkAllNotificationsRead}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                  {myNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-400 text-sm">
                      No notifications yet
                    </div>
                  ) : (
                    myNotifications.map(notif => (
                      <button
                        key={notif.id}
                        onClick={() => {
                          onMarkNotificationRead(notif.id);
                          // Navigate to the related customer when available
                          if (notif.relatedCustomerId && onSelectCustomer) {
                            onSelectCustomer(notif.relatedCustomerId);
                            setNotifOpen(false);
                          }
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${!notif.read ? 'bg-orange-50' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {!notif.read && (
                            <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                          )}
                          <div className={!notif.read ? '' : 'pl-4'}>
                            <p className={`text-xs font-semibold ${!notif.read ? 'text-slate-800' : 'text-slate-600'}`}>
                              {notif.title}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {new Date(notif.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out
          ${isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-4 py-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              {/* Cropped wrapper removes top/bottom whitespace from PNG */}
              <div className="overflow-hidden" style={{ height: 52, width: 168 }}>
                <img
                  src="/conexsol-logo.png"
                  alt="Conexsol"
                  className="brightness-0 invert"
                  style={{ width: 168, height: 'auto', marginTop: -39 }}
                />
              </div>
              {isMobile && (
                <button onClick={() => setSidebarOpen(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              // Parent item is also highlighted when a child view is active
              const isParentActive = (item.id === 'customers' && ['solaredge', 'lobby'].includes(currentView))
                || (item.id === 'billing' && ['contractor-billing', 'rates'].includes(currentView));
              const badge = getBadgeCount(item.badge);

              if (item.dispatch) {
                // DISPATCH, special high-contrast styling
                return (
                  <button
                    key={item.id}
                    onClick={() => { onViewChange(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-colors mb-1 cursor-pointer ${
                      isActive
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-900'
                        : 'text-orange-400 hover:bg-slate-800 hover:text-orange-300 border border-orange-900/40'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              }

              if (item.indent) {
                // Collapsible sub-item, only render when parent is expanded
                const parentExpanded = item.parent === 'billing' ? billingExpanded : customersExpanded;
                if (!parentExpanded) return null;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onViewChange(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-orange-500/20 text-orange-300'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                );
              }

              // Billing, has collapsible Contractor Pay + Service Rates sub-items
              if (item.id === 'billing') {
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        onViewChange(item.id);
                        setBillingExpanded(e => !e);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isActive || isParentActive
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {badge > 0 && (
                        <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {badge}
                        </span>
                      )}
                      {billingExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                        : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      }
                    </button>
                  </div>
                );
              }

              // Customers, has collapsible SolarEdge sub-item
              if (item.id === 'customers') {
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        onViewChange(item.id);
                        setCustomersExpanded(e => !e);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isActive || isParentActive
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {customersExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                        : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      }
                    </button>
                  </div>
                );
              }

              // Standard nav item
              return (
                <button
                  key={item.id}
                  onClick={() => { onViewChange(item.id); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    isActive || isParentActive
                      ? 'bg-orange-500 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* My Jobs, shown for dual-role staff/contractor users */}
            {linkedContractorName && (
              <div className="mt-2 pt-2 border-t border-slate-800">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Contractor</p>
                <button
                  onClick={() => { onViewChange('my-jobs'); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    currentView === 'my-jobs'
                      ? 'bg-orange-500 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Briefcase className="w-5 h-5" />
                  <span className="flex-1 text-left">My Jobs</span>
                  <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded truncate max-w-[80px]">{linkedContractorName}</span>
                </button>
              </div>
            )}
          </nav>

          {/* User Section */}
          {currentUser && (
            <div className="p-3 border-t border-slate-800">
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <div className="w-9 h-9 bg-orange-500 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium">{currentUser.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{currentUser.role}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 rounded-lg overflow-hidden shadow-lg">
                    <button
                      onClick={() => {
                        onLogout();
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-slate-700"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Version badge, always clickable: check for updates or apply */}
          <div className="px-4 py-1.5 text-center select-none border-t border-slate-800/60">
            {versionState === 'update-available' ? (
              <button
                onClick={onUpdate}
                title={`Update to ${remoteVersion ?? 'latest'}, click to restart`}
                className="group w-full flex items-center justify-center gap-2 text-[10px] font-semibold text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/25 rounded-md px-2.5 py-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3 h-3 animate-bounce" />
                <span>Update available{remoteVersion ? `, ${remoteVersion}` : ''}</span>
              </button>
            ) : (
              <button
                onClick={onCheckForUpdate}
                disabled={versionState === 'checking'}
                title="Click to check for updates"
                className="group inline-flex items-center justify-center gap-1.5 text-[9px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-md px-2 py-1 transition-all cursor-pointer disabled:cursor-wait"
              >
                {versionState === 'checking' ? (
                  <RefreshCw className="w-2.5 h-2.5 animate-spin text-orange-400" />
                ) : versionState === 'up-to-date' ? (
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                ) : (
                  <RefreshCw className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
                <span>
                  {versionState === 'checking' ? 'Checking…' :
                   versionState === 'up-to-date' ? `${getVersionString()}, up to date` :
                   getVersionString()}
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`
          min-h-screen transition-all duration-200
          ${isMobile ? 'pt-0 pb-24' : 'ml-64'}
        `}
      >
        {children}
      </main>

      {/* Mobile bottom nav removed - sidebar handles all navigation */}
    </div>
  );
};
