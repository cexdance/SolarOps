// SolarFlow MVP - Settings Component
import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Link,
  Palette,
  HelpCircle,
  LogOut,
  ChevronRight,
  Check,
  Sun,
  Save,
  RefreshCw,
} from 'lucide-react';
import { User as UserType, XeroConfig, SolarEdgeConfig } from '../types';

interface SettingsProps {
  currentUser: UserType | null;
  xeroConfig: XeroConfig;
  solarEdgeConfig: SolarEdgeConfig;
  onConnectXero: () => void;
  onSaveSolarEdgeApiKey: (apiKey: string) => void;
  onSyncSolarEdge: () => void;
  onLogout: () => void;
  isMobile: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  currentUser,
  xeroConfig,
  solarEdgeConfig,
  onConnectXero,
  onSaveSolarEdgeApiKey,
  onSyncSolarEdge,
  onLogout,
  isMobile,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(solarEdgeConfig.apiKey || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(!solarEdgeConfig.apiKey);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      onSaveSolarEdgeApiKey(apiKeyInput.trim());
      setShowApiKeyInput(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSyncSolarEdge();
    } finally {
      setIsSyncing(false);
    }
  };
  const SettingItem: React.FC<{
    icon: React.ReactNode;
    label: string;
    value?: string;
    onClick?: () => void;
    badge?: React.ReactNode;
    danger?: boolean;
  }> = ({ icon, label, value, onClick, badge, danger }) => (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors
        ${danger ? '' : 'border-b border-slate-100'}
      `}
    >
      <div className={`p-2 rounded-lg ${danger ? 'bg-red-100' : 'bg-slate-100'}`}>
        <div className={danger ? 'text-red-600' : 'text-slate-600'}>{icon}</div>
      </div>
      <div className="flex-1 text-left">
        <p className={`font-medium ${danger ? 'text-red-600' : 'text-slate-900'}`}>{label}</p>
        {value && <p className="text-sm text-slate-500">{value}</p>}
      </div>
      {badge}
      {onClick && !badge && (
        <ChevronRight className="w-5 h-5 text-slate-400" />
      )}</button>
  );

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account and preferences</p>
      </div>

      {/* User Profile */}
      {currentUser && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-orange-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">{currentUser.name}</h2>
              <p className="text-sm text-slate-500 capitalize">{currentUser.role}</p>
              <p className="text-sm text-slate-500">{currentUser.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Integrations */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Integrations</h3>
        </div>

        <SettingItem
          icon={<Link className="w-5 h-5" />}
          label="Xero Accounting"
          value={xeroConfig.connected ? `Connected to ${xeroConfig.organizationName}` : 'Not connected'}
          onClick={onConnectXero}
          badge={
            xeroConfig.connected ? (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="w-4 h-4" /> Connected
              </span>
            ) : (
              <span className="text-sm text-amber-600">Connect</span>
            )
          }
        />

        {/* SolarEdge Integration */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <Sun className="w-5 h-5 text-amber-500" />
            <span className="font-medium text-slate-900">SolarEdge Monitoring</span>
          </div>

          {showApiKeyInput || !solarEdgeConfig.apiKey ? (
            <div className="space-y-3">
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter SolarEdge API Key"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Save API Key
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <p className="text-slate-500">API Key: ****{solarEdgeConfig.apiKey.slice(-4)}</p>
                  {solarEdgeConfig.lastSync && (
                    <p className="text-slate-400 text-xs">
                      Last synced: {new Date(solarEdgeConfig.lastSync).toLocaleDateString()}
                    </p>
                  )}
                  {solarEdgeConfig.siteCount !== undefined && (
                    <p className="text-green-600 text-xs">
                      {solarEdgeConfig.siteCount} sites found
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowApiKeyInput(true)}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <SettingItem
          icon={<Link className="w-5 h-5" />}
          label="RingCentral"
          value="Not connected"
          badge={<span className="text-sm text-slate-400">Coming soon</span>}
        />

        <SettingItem
          icon={<Link className="w-5 h-5" />}
          label="Google Maps"
          value="Connected"
          badge={
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="w-4 h-4" /> Active
            </span>
          }
        />
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Preferences</h3>
        </div>

        <SettingItem
          icon={<Bell className="w-5 h-5" />}
          label="Notifications"
          value="Push notifications enabled"
        />

        <SettingItem
          icon={<Palette className="w-5 h-5" />}
          label="Appearance"
          value="System default"
        />
      </div>

      {/* Support */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Support</h3>
        </div>

        <SettingItem
          icon={<HelpCircle className="w-5 h-5" />}
          label="Help Center"
        />

        <SettingItem
          icon={<HelpCircle className="w-5 h-5" />}
          label="Contact Support"
        />

        <SettingItem
          icon={<SettingsIcon className="w-5 h-5" />}
          label="App Version"
          value="1.0.0 (MVP)"
        />
      </div>

      {/* Account */}
      <div className="bg-white rounded-xl border border-slate-200">
        <SettingItem
          icon={<LogOut className="w-5 h-5" />}
          label="Sign Out"
          onClick={onLogout}
          danger
        />
      </div>
    </div>
  );
};
