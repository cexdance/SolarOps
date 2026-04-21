/**
 * SolarOps — Supabase Error Handling & Status Management
 * Centralized error handling with user-visible feedback
 */

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  message: string;
  lastSynced: Date | null;
  error?: string;
}

let currentStatus: SyncState = {
  status: 'idle',
  message: 'Ready',
  lastSynced: null,
};

const listeners = new Set<(state: SyncState) => void>();

export function subscribeToSyncStatus(callback: (state: SyncState) => void): () => void {
  listeners.add(callback);
  callback(currentStatus);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  listeners.forEach(cb => cb({ ...currentStatus }));
}

export function setSyncStatus(status: SyncStatus, message: string, error?: string) {
  currentStatus = {
    status,
    message,
    error,
    lastSynced: status === 'success' ? new Date() : currentStatus.lastSynced,
  };
  notifyListeners();
}

export function getSyncStatus(): SyncState {
  return { ...currentStatus };
}

// Map Supabase errors to user-friendly messages
export function getUserFriendlyError(error: unknown): string {
  if (!error) return 'An unexpected error occurred.';
  
  const errorStr = String(error);
  
  // Connection errors
  if (errorStr.includes('Failed to fetch') || errorStr.includes('NetworkError')) {
    return 'No internet connection. Your changes are saved locally and will sync when you reconnect.';
  }
  
  // Auth errors
  if (errorStr.includes('Invalid login')) {
    return 'Invalid email or password. Please try again.';
  }
  if (errorStr.includes('Email not confirmed')) {
    return 'Please confirm your email address before logging in.';
  }
  
  // Database errors
  if (errorStr.includes('23505')) { // duplicate key violation
    return 'This record already exists.';
  }
  if (errorStr.includes('23503')) { // foreign key violation
    return 'This action cannot be completed because related data exists.';
  }
  
  // API errors
  if (errorStr.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (errorStr.includes('500') || errorStr.includes('503')) {
    return 'Server error. Our team has been notified and is working on it.';
  }
  
  return errorStr;
}

// Wrapper for async Supabase operations with error handling
export async function withSupabaseError<T>(
  operation: () => Promise<T>,
  context: string
): Promise<{ data: T | null; error: string | null }> {
  setSyncStatus('syncing', 'Syncing your changes...');
  
  try {
    const result = await operation();
    setSyncStatus('success', 'Changes saved', undefined);
    return { data: result, error: null };
  } catch (err) {
    const message = getUserFriendlyError(err);
    const isNetworkError = message.includes('internet connection') || message.includes('Failed');
    setSyncStatus(isNetworkError ? 'offline' : 'error', message, String(err));
    console.error(`[Supabase Error - ${context}]:`, err);
    return { data: null, error: message };
  }
}

// Initialize listeners for sync events
export function initSyncStatusListeners() {
  if (typeof window === 'undefined') return;
  
  window.addEventListener('supabase-sync-success', () => {
    setSyncStatus('success', 'All changes saved');
  });
  
  window.addEventListener('supabase-sync-error', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    setSyncStatus('error', detail?.message || 'Sync failed', detail?.error);
  });
  
  // Listen for online/offline events
  window.addEventListener('online', () => {
    setSyncStatus('idle', 'Back online');
  });
  
  window.addEventListener('offline', () => {
    setSyncStatus('offline', 'Working offline. Changes will sync when you reconnect.');
  });
}
