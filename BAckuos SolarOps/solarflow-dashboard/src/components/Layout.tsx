// SolarFlow MVP - Layout Component
import React, { useState } from 'react';
import {
  LayoutDashboard,
  Wrench,
  Users,
  Receipt,
  Phone,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  UserCog,
  DollarSign,
  Package,
} from 'lucide-react';
import { User as UserType } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  currentUser: UserType | null;
  onLogout: () => void;
  isMobile: boolean;
  unbilledCount: number;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Work Orders', icon: Wrench },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'billing', label: 'Billing', icon: Receipt, badge: 'unbilled' },
  { id: 'contractor-billing', label: 'Contractor Pay', icon: DollarSign },
  { id: 'technician', label: 'Manage WORK ORDERS', icon: Phone },
  { id: 'contractors', label: 'Contractors', icon: UserCog },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'rates', label: 'Service Rates', icon: DollarSign },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onViewChange,
  currentUser,
  onLogout,
  isMobile,
  unbilledCount,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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
          <h1 className="text-lg font-semibold">SolarFlow</h1>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <span className="text-sm text-slate-300">{currentUser.name}</span>
          )}
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
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-orange-500">SolarFlow</h1>
              {isMobile && (
                <button onClick={() => setSidebarOpen(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">Service Management</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const badge = getBadgeCount(item.badge);

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onViewChange(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-orange-500 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }
                  `}
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
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`
          min-h-screen transition-all duration-200
          ${isMobile ? 'pt-0' : 'ml-64'}
        `}
      >
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1 safe-area-pb">
          <div className="flex justify-around">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
              { id: 'jobs', icon: Wrench, label: 'Work Orders' },
              { id: 'technician', icon: Phone, label: 'My Work Orders' },
              { id: 'billing', icon: Receipt, label: 'Billing' },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              const badge = item.id === 'billing' ? unbilledCount : 0;

              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className={`
                    flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg min-w-[64px]
                    ${isActive ? 'text-orange-500' : 'text-slate-500'}
                  `}
                >
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
