// SolarFlow CRM - Customer Data Store
// Source: Trello "SOLAREDGE LEADS (Servicios)" — Conexsol Funnel strategyn
// Regenerate with: npx tsx scripts/import_from_trello.mts

import { CRMCustomer, CustomerInteraction, CRMAttachment, CustomerStatus, LeadSource, InteractionType, InteractionOutcome } from '../types';
import { trelloCustomers, trelloInteractions } from './trelloImport';
import { dbSet } from './db';

const CUSTOMER_STORAGE_KEY = 'solarflow_customers';
const INTERACTIONS_STORAGE_KEY = 'solarflow_interactions';
const TRELLO_DATA_VERSION = '2026-03-29-trello-import';
const TRELLO_VERSION_KEY = 'solarflow_crm_version';

// ── Convert Trello data → CRMCustomer / CustomerInteraction ─────────────────

// Deduplicate by trelloCardId (some cards appear twice)
const seen = new Set<string>();
const uniqueTrelloCustomers = trelloCustomers.filter(c => {
  if (seen.has(c.trelloCardId)) return false;
  seen.add(c.trelloCardId);
  return true;
});

export const initialCustomers: CRMCustomer[] = uniqueTrelloCustomers.map((c, i) => ({
  id: `trello-${c.trelloCardId}`,
  firstName: c.firstName || '',
  lastName: c.lastName || '',
  email: c.email || '',
  phone: c.phone || '',
  address: c.address || '',
  city: c.city || '',
  state: c.state || 'FL',
  zip: c.zip || '',
  status: c.status as CustomerStatus,
  source: 'solaredge' as LeadSource,
  notes: c.notes || '',
  tags: c.tags || [],
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  attachments: c.attachments.map(a => ({
    id: a.id,
    name: a.name,
    // Store Trello URL in dataUrl — rendered as external link in the UI
    dataUrl: a.url,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt,
  } as CRMAttachment)),
}));

export const initialInteractions: CustomerInteraction[] = trelloInteractions.map(i => ({
  id: i.id,
  customerId: `trello-${i.trelloCardId}`,
  type: 'note' as InteractionType,
  direction: 'inbound' as const,
  content: i.content,
  userId: i.userId,
  userName: i.userName,
  timestamp: i.timestamp,
  createdAt: i.createdAt,
}));

// ── Load / Save with version-based cache busting ─────────────────────────────

export const loadCustomers = (): CRMCustomer[] => {
  try {
    const storedVersion = localStorage.getItem(TRELLO_VERSION_KEY);
    if (storedVersion !== TRELLO_DATA_VERSION) {
      localStorage.removeItem(CUSTOMER_STORAGE_KEY);
      localStorage.removeItem(INTERACTIONS_STORAGE_KEY);
      localStorage.setItem(TRELLO_VERSION_KEY, TRELLO_DATA_VERSION);
    }
    const stored = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load customers:', e);
  }
  return initialCustomers;
};

export const loadInteractions = (): CustomerInteraction[] => {
  try {
    const stored = localStorage.getItem(INTERACTIONS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load interactions:', e);
  }
  return initialInteractions;
};

export const saveCustomers = (customers: CRMCustomer[]): void => {
  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customers));
    dbSet(CUSTOMER_STORAGE_KEY, customers);
  } catch (e) {
    console.error('Failed to save customers:', e);
  }
};

export const saveInteractions = (interactions: CustomerInteraction[]): void => {
  try {
    localStorage.setItem(INTERACTIONS_STORAGE_KEY, JSON.stringify(interactions));
    dbSet(INTERACTIONS_STORAGE_KEY, interactions);
  } catch (e) {
    console.error('Failed to save interactions:', e);
  }
};

// Helper functions
export const getCustomerById = (customers: CRMCustomer[], id: string): CRMCustomer | undefined => {
  return customers.find(c => c.id === id);
};

export const getInteractionsByCustomer = (interactions: CustomerInteraction[], customerId: string): CustomerInteraction[] => {
  return interactions
    .filter(i => i.customerId === customerId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const addInteraction = (
  interactions: CustomerInteraction[],
  customerId: string,
  type: InteractionType,
  content: string,
  userId: string,
  userName: string,
  options?: {
    direction?: 'inbound' | 'outbound';
    subject?: string;
    outcome?: InteractionOutcome;
    duration?: number;
  }
): CustomerInteraction[] => {
  const interaction: CustomerInteraction = {
    id: `interaction-${Date.now()}`,
    customerId,
    type,
    direction: options?.direction || 'outbound',
    subject: options?.subject,
    content,
    outcome: options?.outcome,
    duration: options?.duration,
    userId,
    userName,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  return [interaction, ...interactions];
};

export const updateCustomer = (
  customers: CRMCustomer[],
  customerId: string,
  updates: Partial<CRMCustomer>
): CRMCustomer[] => {
  return customers.map(c =>
    c.id === customerId
      ? { ...c, ...updates, updatedAt: new Date().toISOString() }
      : c
  );
};

export const searchCustomers = (customers: CRMCustomer[], query: string): CRMCustomer[] => {
  const lowerQuery = query.toLowerCase();
  return customers.filter(c =>
    c.firstName.toLowerCase().includes(lowerQuery) ||
    c.lastName.toLowerCase().includes(lowerQuery) ||
    c.email.toLowerCase().includes(lowerQuery) ||
    c.phone.includes(query) ||
    c.city.toLowerCase().includes(lowerQuery) ||
    c.address.toLowerCase().includes(lowerQuery)
  );
};

export const filterCustomersByStatus = (customers: CRMCustomer[], status: CustomerStatus | 'all'): CRMCustomer[] => {
  if (status === 'all') return customers;
  return customers.filter(c => c.status === status);
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatTimeAgo = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// Status colors
export const statusColors: Record<CustomerStatus, { bg: string; text: string; label: string }> = {
  lead: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Lead' },
  prospect: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Prospect' },
  customer: { bg: 'bg-green-100', text: 'text-green-700', label: 'Customer' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Inactive' },
};

// Interaction type icons and colors
export const interactionConfig: Record<InteractionType, { icon: string; color: string; bg: string }> = {
  call: { icon: 'phone', color: 'text-blue-600', bg: 'bg-blue-100' },
  email: { icon: 'mail', color: 'text-green-600', bg: 'bg-green-100' },
  sms: { icon: 'message', color: 'text-purple-600', bg: 'bg-purple-100' },
  note: { icon: 'file-text', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  meeting: { icon: 'calendar', color: 'text-orange-600', bg: 'bg-orange-100' },
  quote: { icon: 'file-text', color: 'text-indigo-600', bg: 'bg-indigo-100' },
};

// Outcome labels
export const outcomeLabels: Record<InteractionOutcome, string> = {
  connected: 'Connected',
  voicemail: 'Left Voicemail',
  no_answer: 'No Answer',
  not_interested: 'Not Interested',
  callback_requested: 'Callback Requested',
  appointment_scheduled: 'Appointment Scheduled',
  information_sent: 'Information Sent',
  follow_up_needed: 'Follow-up Needed',
};
