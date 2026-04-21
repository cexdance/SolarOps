import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeToSyncStatus, type SyncState } from '../lib/supabaseErrors';
import { Cloud, CloudOff, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * SyncStatusIndicator - Shows database connection and sync state
 * Place this in your Layout or App header
 */
export const SyncStatusIndicator: React.FC = () => {
  const [state, setState] = useState<SyncState>(getSyncStatus);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    return subscribeToSyncStatus(setState);
  }, []);

  // Don't show anything when idle (clean UI)
  if (state.status === 'idle') return null;

  const getIcon = () => {
    switch (state.status) {
      case 'syncing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      case 'offline':
        return <CloudOff className="w-4 h-4" />;
      default:
        return <Cloud className="w-4 h-4" />;
    }
  };

  const getColors = () => {
    switch (state.status) {
      case 'syncing':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'success':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'offline':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getStatusText = () => {
    switch (state.status) {
      case 'syncing':
        return 'Syncing...';
      case 'success':
        return 'Saved';
      case 'error':
        return 'Sync error';
      case 'offline':
        return 'Offline';
      default:
        return '';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm
          transition-all duration-200 hover:opacity-80
          ${getColors()}
        `}
      >
        {getIcon()}
        <span className="hidden sm:inline">{getStatusText()}</span>
      </button>

      {showDetails && (
        <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-[#1C2E42] border border-[#1E3148] rounded-lg shadow-xl z-50">
          <div className="flex items-start gap-2 mb-2">
            {getIcon()}
            <span className="text-sm font-medium text-white">{state.message}</span>
          </div>
          {state.error && state.status !== 'success' && (
            <p className="text-xs text-[#5A7490] mt-1 pl-6">{state.error}</p>
          )}
          {state.lastSynced && (
            <p className="text-xs text-[#5A7490] mt-2 pl-6">
              Last synced: {state.lastSynced.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Toast version for page-level notifications
export const SyncStatusToast: React.FC = () => {
  const [state, setState] = useState<SyncState>({ status: 'idle', message: '', lastSynced: null });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeToSyncStatus((newState) => {
      if (newState.status !== 'idle') {
        setState(newState);
        setVisible(true);
        
        // Auto-hide success messages after 3 seconds
        if (newState.status === 'success') {
          setTimeout(() => setVisible(false), 3000);
        }
      }
    });
  }, []);

  if (!visible) return null;

  const getBgColor = () => {
    switch (state.status) {
      case 'syncing': return 'bg-amber-500';
      case 'success': return 'bg-emerald-500';
      case 'error': return 'bg-red-500';
      case 'offline': return 'bg-slate-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div 
      className={`
        fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-xl 
        text-white font-medium text-sm flex items-center gap-2
        transition-all duration-300 ${getBgColor()}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <button onClick={() => setVisible(false)} className="mr-2 hover:opacity-70">&times;</button>
      {state.message}
    </div>
  );
};
