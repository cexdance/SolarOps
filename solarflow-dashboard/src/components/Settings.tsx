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
  MapPin,
  Phone,
} from 'lucide-react';
import { GMAPS_KEY_STORAGE } from './AddressAutocomplete';
import { User as UserType, XeroConfig, SolarEdgeConfig } from '../types';
import { XERO_CLIENT_ID_KEY, XERO_CLIENT_SECRET_KEY, getXeroClientSecret, setXeroClientSecret } from '../lib/xeroService';

interface SettingsProps {
  currentUser: UserType | null;
  xeroConfig: XeroConfig;
  solarEdgeConfig: SolarEdgeConfig;
  onConnectXero: (clientId?: string) => Promise<void> | void;
  onXeroDisconnect: () => void;
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
  onXeroDisconnect,
  onSaveSolarEdgeApiKey,
  onSyncSolarEdge,
  onLogout,
  isMobile,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(solarEdgeConfig.apiKey || '');
  const [showApiKeyInput, setShowApiKeyInput] = useState(!solarEdgeConfig.apiKey);
  const [isSyncing, setIsSyncing] = useState(false);

  // ── SolarEdge rate-limit helpers ─────────────────────────────────────────
  const SE_DAILY_LIMIT = 295;

  const getSyncStatus = () => {
    const { nextSyncAllowed, dailyCallCount, dailyCallDate } = solarEdgeConfig;
    const now = new Date();
    const todayUTC = now.toISOString().slice(0, 10);
    const callsToday = dailyCallDate === todayUTC ? (dailyCallCount ?? 0) : 0;

    let cooldownLabel = '';
    if (nextSyncAllowed && new Date(nextSyncAllowed) > now) {
      const diff = Math.ceil((new Date(nextSyncAllowed).getTime() - now.getTime()) / 60000);
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      cooldownLabel = hrs > 0 ? `${hrs}h ${mins}m` : `${diff}m`;
    }

    const dailyLimitHit = callsToday >= SE_DAILY_LIMIT;
    const blocked = !!cooldownLabel || dailyLimitHit;

    return { callsToday, cooldownLabel, dailyLimitHit, blocked };
  };

  const envGmapsKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';
  const [gmapsKeyInput, setGmapsKeyInput] = useState(sessionStorage.getItem(GMAPS_KEY_STORAGE) || '');
  const [showGmapsKeyInput, setShowGmapsKeyInput] = useState(!sessionStorage.getItem(GMAPS_KEY_STORAGE) && !envGmapsKey);

  const handleSaveGmapsKey = () => {
    const trimmed = gmapsKeyInput.trim();
    if (trimmed) {
      sessionStorage.setItem(GMAPS_KEY_STORAGE, trimmed);
      setShowGmapsKeyInput(false);
    }
  };

  const storedGmapsKey = sessionStorage.getItem(GMAPS_KEY_STORAGE);

  // ── Xero state ────────────────────────────────────────────────────────────
  const [xeroClientIdInput, setXeroClientIdInput] = useState(
    sessionStorage.getItem(XERO_CLIENT_ID_KEY) || ''
  );
  const [xeroClientSecretInput, setXeroClientSecretInput] = useState(
    getXeroClientSecret()
  );
  const [showXeroInput, setShowXeroInput] = useState(
    !xeroConfig.connected && !sessionStorage.getItem(XERO_CLIENT_ID_KEY)
  );
  const [xeroError, setXeroError] = useState('');

  const handleConnectXeroClick = async () => {
    const id     = xeroClientIdInput.trim();
    const secret = xeroClientSecretInput.trim();
    if (!id) return;
    setXeroError('');
    if (!window.crypto?.subtle) {
      setXeroError('Secure context required. Open the app via http://localhost:5173 (not an IP address) or use HTTPS.');
      return;
    }
    if (secret) setXeroClientSecret(secret);
    try {
      await onConnectXero(id);
    } catch (err) {
      setXeroError(String(err));
    }
  };

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

        {/* Xero Accounting Integration */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-100">
                <Link className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Xero Accounting</p>
                {xeroConfig.connected
                  ? <p className="text-sm text-green-600">Connected to {xeroConfig.organizationName}</p>
                  : <p className="text-sm text-slate-500">Sync invoices and contacts</p>
                }
              </div>
            </div>
            {xeroConfig.connected ? (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <Check className="w-4 h-4" /> Connected
              </span>
            ) : null}
          </div>

          {xeroConfig.connected ? (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={onXeroDisconnect}
                className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              >
                Disconnect
              </button>
              <button
                onClick={() => { setShowXeroInput(true); }}
                className="px-3 py-1.5 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Change Credentials
              </button>
            </div>
          ) : (
            <>
              {/* Setup instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-sm text-blue-800">
                <p className="font-medium mb-1">Setup required:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Create a Web App at <span className="font-mono">developer.xero.com</span></li>
                  <li>Add redirect URI: <code className="bg-orange-100 text-orange-700 px-1 rounded font-mono">{window.location.origin}/xero-callback</code></li>
                  <li>Copy the Client ID below</li>
                </ol>
              </div>

              {xeroError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2 text-sm text-red-700">
                  {xeroError}
                </div>
              )}

              {(showXeroInput || !sessionStorage.getItem(XERO_CLIENT_ID_KEY)) ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={xeroClientIdInput}
                    onChange={e => setXeroClientIdInput(e.target.value)}
                    placeholder="Xero Client ID"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
                  />
                  <input
                    type="password"
                    value={xeroClientSecretInput}
                    onChange={e => setXeroClientSecretInput(e.target.value)}
                    placeholder="Xero Client Secret"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
                  />
                  <button
                    onClick={handleConnectXeroClick}
                    disabled={!xeroClientIdInput.trim()}
                    className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Connect to Xero
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConnectXeroClick}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Connect to Xero
                  </button>
                  <button
                    onClick={() => setShowXeroInput(true)}
                    className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
              )}
            </>
          )}
        </div>

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
                <div className="text-sm space-y-0.5">
                  <p className="text-slate-500">API Key: ****{solarEdgeConfig.apiKey.slice(-4)}</p>
                  {solarEdgeConfig.lastSync && (
                    <p className="text-slate-400 text-xs">
                      Last synced: {new Date(solarEdgeConfig.lastSync).toLocaleString()}
                    </p>
                  )}
                  {solarEdgeConfig.siteCount !== undefined && (
                    <p className="text-green-600 text-xs">
                      {solarEdgeConfig.siteCount} sites found
                    </p>
                  )}
                  {/* Rate-limit status */}
                  {(() => {
                    const { callsToday, cooldownLabel, dailyLimitHit } = getSyncStatus();
                    return (
                      <>
                        <p className={`text-xs ${callsToday >= 250 ? 'text-amber-500' : 'text-slate-400'}`}>
                          API calls today: {callsToday}/{SE_DAILY_LIMIT}
                        </p>
                        {cooldownLabel && !dailyLimitHit && (
                          <p className="text-xs text-blue-500">
                            Next sync in {cooldownLabel}
                          </p>
                        )}
                        {dailyLimitHit && (
                          <p className="text-xs text-red-500">
                            Daily limit reached — resets at midnight UTC
                          </p>
                        )}
                      </>
                    );
                  })()}
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
                    disabled={isSyncing || getSyncStatus().blocked}
                    title={getSyncStatus().cooldownLabel ? `Cooldown: ${getSyncStatus().cooldownLabel} remaining` : getSyncStatus().dailyLimitHit ? 'Daily limit reached' : ''}
                    className="flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : getSyncStatus().cooldownLabel ? `Wait ${getSyncStatus().cooldownLabel}` : 'Sync'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RingCentral */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="w-5 h-5 text-orange-500" />
            <span className="font-medium text-slate-900">RingCentral</span>
            <span className="ml-auto flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              Active
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Click-to-call and SMS are enabled app-wide. Tap any phone number to call or text via the RingCentral app installed on this device.
          </p>
        </div>

        {/* Google Maps Integration */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-blue-500" />
            <span className="font-medium text-slate-900">Google Maps</span>
          </div>

          {envGmapsKey && !showGmapsKeyInput && !storedGmapsKey && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
              <span className="text-green-600 text-sm font-medium">✓ Google Maps configured via environment</span>
              <button onClick={() => setShowGmapsKeyInput(true)} className="ml-auto text-xs text-slate-500 hover:text-slate-700">Override</button>
            </div>
          )}
          {showGmapsKeyInput || !storedGmapsKey ? (
            <div className="space-y-3">
              <input
                type="text"
                value={gmapsKeyInput}
                onChange={(e) => setGmapsKeyInput(e.target.value)}
                placeholder="Enter Google Maps API Key"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleSaveGmapsKey}
                disabled={!gmapsKeyInput.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Save API Key
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <p className="text-slate-500">API Key: ****{storedGmapsKey.slice(-4)}</p>
                <p className="text-green-600 text-xs">Address autocomplete active</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowGmapsKeyInput(true)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => { sessionStorage.removeItem(GMAPS_KEY_STORAGE); setGmapsKeyInput(''); setShowGmapsKeyInput(true); }}
                  className="text-sm text-red-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
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
