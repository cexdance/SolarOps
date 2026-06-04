// SolarFlow MVP - Settings Component
import React, { useState, useRef } from 'react';
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
  Mail,
  Eye,
  EyeOff,
  Send,
  Camera,
} from 'lucide-react';
import { GMAPS_KEY_STORAGE } from './AddressAutocomplete';
import { User as UserType, SolarEdgeConfig } from '../types';
import { APP_VERSION, DB_VERSION } from '../lib/versionConfig';
import { PhotoCleanupCard } from './admin/PhotoCleanupCard';
import { Avatar } from './ui/Avatar';
import { compressImageToBlob } from '../lib/photoCompress';
import { uploadAvatarToStorage } from '../lib/photoStorage';
import { logUpload } from '../lib/changeLog';
import { LogViewer } from './admin/LogViewer';
import { UserPermissionsPanel } from './admin/UserPermissionsPanel';
import { canManageUsers } from '../lib/access';

interface SettingsProps {
  currentUser: UserType | null;
  solarEdgeConfig: SolarEdgeConfig;
  onSaveSolarEdgeApiKey: (apiKey: string) => void;
  onSyncSolarEdge: () => void;
  onLogout: () => void;
  onUpdateAvatar?: (dataUrl: string | null) => void;
  onNavigateToEntity?: (entityType: string, entityId: string) => void;
  isMobile: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  currentUser,
  solarEdgeConfig,
  onSaveSolarEdgeApiKey,
  onSyncSolarEdge,
  onLogout,
  onUpdateAvatar,
  onNavigateToEntity,
  isMobile,
}) => {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setAvatarError(null);
    setAvatarUploading(true);
    const uploadStart = Date.now();
    const userEmail = currentUser?.email ?? 'unknown';
    logUpload('avatar.upload_start', currentUser?.id ?? 'unknown', {
      name: file.name, size: file.size, type: file.type,
    }, userEmail);
    try {
      const blob = await compressImageToBlob(file, 400, 0.85);
      if (!currentUser?.id) { setAvatarError('Not logged in'); return; }
      const result = await uploadAvatarToStorage(blob, currentUser.id);
      if (result.url) {
        const durationMs = Date.now() - uploadStart;
        // Cache-bust so the browser always re-fetches the freshly uploaded avatar.
        const bustUrl = result.url.includes('?')
          ? `${result.url}&t=${Date.now()}`
          : `${result.url}?t=${Date.now()}`;
        logUpload('avatar.upload_success', currentUser.id, { storageUrl: bustUrl }, userEmail, durationMs);
        onUpdateAvatar?.(bustUrl);
      } else if (result.error === 'session_expired') {
        logUpload('avatar.upload_fail', currentUser?.id ?? 'unknown', { error: 'session_expired' }, userEmail, Date.now() - uploadStart);
        setAvatarError('Session expired — please re-login.');
      } else {
        logUpload('avatar.upload_fail', currentUser?.id ?? 'unknown', { error: result.error }, userEmail, Date.now() - uploadStart);
        setAvatarError('Avatar upload failed. Try again.');
        console.error('[Settings] avatar upload failed', result.error);
      }
    } catch (e) {
      logUpload('avatar.upload_fail', currentUser?.id ?? 'unknown', { error: String(e) }, userEmail, Date.now() - uploadStart);
      console.error('[Settings] avatar compress/upload failed', e);
      setAvatarError('Avatar upload failed.');
    } finally {
      setAvatarUploading(false);
    }
  };
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

  // ── SMTP / Email config ──────────────────────────────────────────────────
  const SMTP_HOST_KEY = 'solarops_smtp_host';
  const SMTP_PORT_KEY = 'solarops_smtp_port';
  const SMTP_USER_KEY = 'solarops_smtp_user';
  const SMTP_PASS_KEY = 'solarops_smtp_pass';
  const SMTP_FROM_KEY = 'solarops_smtp_from_name';

  const [smtpHost, setSmtpHost] = useState(localStorage.getItem(SMTP_HOST_KEY) || 'smtp.ionos.com');
  const [smtpPort, setSmtpPort] = useState(localStorage.getItem(SMTP_PORT_KEY) || '465');
  const [smtpUser, setSmtpUser] = useState(localStorage.getItem(SMTP_USER_KEY) || '');
  const [smtpPass, setSmtpPass] = useState(sessionStorage.getItem(SMTP_PASS_KEY) || '');
  const [smtpFromName, setSmtpFromName] = useState(localStorage.getItem(SMTP_FROM_KEY) || 'Conexsol Energy');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(!!localStorage.getItem(SMTP_USER_KEY));
  const [showSmtpSetup, setShowSmtpSetup] = useState(!localStorage.getItem(SMTP_USER_KEY));
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSaveSmtp = () => {
    localStorage.setItem(SMTP_HOST_KEY, smtpHost.trim());
    localStorage.setItem(SMTP_PORT_KEY, smtpPort);
    localStorage.setItem(SMTP_USER_KEY, smtpUser.trim());
    sessionStorage.setItem(SMTP_PASS_KEY, smtpPass);
    localStorage.setItem(SMTP_FROM_KEY, smtpFromName.trim());
    setSmtpSaved(true);
    setShowSmtpSetup(false);
  };

  const handleTestSmtp = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: smtpUser.trim(),
          subject: 'SolarOps SMTP Test',
          html: '<div style="font-family:sans-serif;padding:20px"><h2 style="color:#f97316">✓ SMTP is working!</h2><p>Your SolarOps email integration is configured correctly.</p></div>',
          smtpHost: smtpHost.trim(),
          smtpPort: parseInt(smtpPort),
          smtpUser: smtpUser.trim(),
          smtpPass,
          fromName: smtpFromName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSmtpTestResult({ ok: true, msg: `Test email sent to ${smtpUser.trim()}` });
      } else {
        setSmtpTestResult({ ok: false, msg: data.error || 'Send failed' });
      }
    } catch (err) {
      setSmtpTestResult({ ok: false, msg: String(err) });
    }
    setSmtpTesting(false);
  };

  const handleClearSmtp = () => {
    localStorage.removeItem(SMTP_HOST_KEY);
    localStorage.removeItem(SMTP_PORT_KEY);
    localStorage.removeItem(SMTP_USER_KEY);
    sessionStorage.removeItem(SMTP_PASS_KEY);
    localStorage.removeItem(SMTP_FROM_KEY);
    setSmtpUser('');
    setSmtpPass('');
    setSmtpFromName('Conexsol Energy');
    setSmtpHost('smtp.ionos.com');
    setSmtpPort('465');
    setSmtpSaved(false);
    setShowSmtpSetup(true);
    setSmtpTestResult(null);
  };

  const handleSaveGmapsKey = () => {
    const trimmed = gmapsKeyInput.trim();
    if (trimmed) {
      sessionStorage.setItem(GMAPS_KEY_STORAGE, trimmed);
      setShowGmapsKeyInput(false);
    }
  };

  const storedGmapsKey = sessionStorage.getItem(GMAPS_KEY_STORAGE);

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
            <div className="relative group">
              <Avatar user={currentUser} size="lg" className="w-16 h-16 text-xl" />
              <label
                htmlFor="avatar-upload"
                title="Change profile photo"
                className={`absolute -bottom-1 -right-1 w-7 h-7 text-white rounded-full flex items-center justify-center shadow-md border-2 border-white transition-colors cursor-pointer ${avatarUploading ? 'bg-orange-300' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {avatarUploading
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-3.5 h-3.5" />
                }
              </label>
              <input
                id="avatar-upload"
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarFile(file);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-slate-900 truncate">{currentUser.name}</h2>
              <p className="text-sm text-slate-500 capitalize">{currentUser.role}</p>
              <p className="text-sm text-slate-500 truncate">{currentUser.email}</p>
              {avatarError && (
                <p className="text-xs text-red-500 mt-1">{avatarError}</p>
              )}
              {currentUser.avatar && !avatarUploading && !avatarError && (
                <button
                  onClick={() => onUpdateAvatar?.(null)}
                  className="text-xs text-slate-400 hover:text-red-500 mt-1"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Integrations */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Integrations</h3>
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

        {/* IONOS Email / SMTP Integration */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-100">
                <Mail className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Email (SMTP)</p>
                {smtpSaved && !showSmtpSetup
                  ? <p className="text-sm text-green-600">Configured — {smtpUser}</p>
                  : <p className="text-sm text-slate-500">Send client reports directly from SolarOps</p>
                }
              </div>
            </div>
            {smtpSaved && !showSmtpSetup && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <Check className="w-4 h-4" /> Active
              </span>
            )}
          </div>

          {smtpSaved && !showSmtpSetup ? (
            <div className="space-y-2">
              <div className="text-sm space-y-0.5">
                <p className="text-slate-500">Server: {smtpHost}:{smtpPort}</p>
                <p className="text-slate-500">From: {smtpFromName} &lt;{smtpUser}&gt;</p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleTestSmtp}
                  disabled={smtpTesting}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  {smtpTesting ? 'Sending…' : 'Send Test'}
                </button>
                <button
                  onClick={() => setShowSmtpSetup(true)}
                  className="px-3 py-1.5 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={handleClearSmtp}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
              {smtpTestResult && (
                <div className={`mt-2 p-2 rounded-lg text-sm ${smtpTestResult.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {smtpTestResult.ok ? '✓ ' : '✕ '}{smtpTestResult.msg}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">IONOS SMTP Setup</p>
                <p className="text-xs">Enter your IONOS email credentials to send reports directly from the app. Your password is stored locally on this device only.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={smtpHost}
                  onChange={e => setSmtpHost(e.target.value)}
                  placeholder="SMTP Server"
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
                />
                <select
                  value={smtpPort}
                  onChange={e => setSmtpPort(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white"
                >
                  <option value="465">465 (SSL/TLS)</option>
                  <option value="587">587 (STARTTLS)</option>
                </select>
              </div>

              <input
                type="text"
                value={smtpFromName}
                onChange={e => setSmtpFromName(e.target.value)}
                placeholder="From Name (e.g. Conexsol Energy)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
              />

              <input
                type="email"
                value={smtpUser}
                onChange={e => setSmtpUser(e.target.value)}
                placeholder="Email address (e.g. reports@conexsol.us)"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
              />

              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  value={smtpPass}
                  onChange={e => setSmtpPass(e.target.value)}
                  placeholder="Email password"
                  className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(!showSmtpPass)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveSmtp}
                  disabled={!smtpUser.trim() || !smtpPass}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Save & Activate
                </button>
                {smtpSaved && (
                  <button
                    onClick={() => setShowSmtpSetup(false)}
                    className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
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

      {/* Maintenance — admin only */}
      {currentUser?.role === 'admin' && (
        <div className="mb-6">
          <PhotoCleanupCard />
        </div>
      )}

      {/* User Permissions — requires users.manage permit */}
      {canManageUsers(currentUser) && (
        <UserPermissionsPanel currentUser={currentUser} onNavigate={onNavigateToEntity} />
      )}

      {/* Activity Log — admin only */}
      {currentUser?.role === 'admin' && (
        <div className="bg-white rounded-xl border border-slate-200 mb-6">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Activity Log</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Last 100 events from this device — photo uploads, record changes, errors
            </p>
          </div>
          <div className="p-4">
            <LogViewer />
          </div>
        </div>
      )}

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
          value={`${APP_VERSION} • db ${DB_VERSION}`}
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
