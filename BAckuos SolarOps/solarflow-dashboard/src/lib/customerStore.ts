// SolarFlow CRM - Customer Data Store
// Customer management with interaction tracking

import { CRMCustomer, CustomerInteraction, CustomerStatus, LeadSource, InteractionType, InteractionOutcome } from '../types';

const CUSTOMER_STORAGE_KEY = 'solarflow_customers';
const INTERACTIONS_STORAGE_KEY = 'solarflow_interactions';

// Mock data generators
const firstNames = ['James', 'Maria', 'Carlos', 'Linda', 'Robert', 'Jennifer', 'Michael', 'Patricia', 'David', 'Susan', 'John', 'Karen', 'Antonio', 'Michelle', 'Daniel', 'Sarah', 'Francisco', 'Nancy', 'Miguel', 'Betty'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const cities = [
  { city: 'Miami', state: 'FL' },
  { city: 'Fort Lauderdale', state: 'FL' },
  { city: 'West Palm Beach', state: 'FL' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Hollywood', state: 'FL' },
  { city: 'Pembroke Pines', state: 'FL' },
  { city: 'Coral Gables', state: 'FL' },
  { city: 'Boca Raton', state: 'FL' },
];
const streetNames = ['Oak Street', 'Palm Avenue', 'Maple Drive', 'Cedar Lane', 'Pine Road', 'Sunset Blvd', 'Ocean Drive', 'Main Street', 'First Avenue', 'Second Street'];
const sources: LeadSource[] = ['google_forms', 'website', 'referral', 'cold_call', 'social_media', 'advertising', 'partner'];
const statuses: CustomerStatus[] = ['lead', 'prospect', 'customer', 'inactive'];

const generateRandomCustomer = (index: number): CRMCustomer => {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const location = cities[Math.floor(Math.random() * cities.length)];
  const streetNum = Math.floor(Math.random() * 9999) + 1;
  const street = streetNames[Math.floor(Math.random() * streetNames.length)];
  const source = sources[Math.floor(Math.random() * sources.length)];
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  const createdDaysAgo = Math.floor(Math.random() * 60);
  const createdAt = new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `cust-${index}`,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
    phone: `(${Math.floor(Math.random() * 900) + 100}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
    address: `${streetNum} ${street}`,
    city: location.city,
    state: location.state,
    zip: String(Math.floor(Math.random() * 90000) + 10000),
    monthlyBill: Math.floor(Math.random() * 400) + 80,
    roofType: Math.random() > 0.5 ? 'sloped' : 'flat',
    roofShade: Math.random() > 0.6 ? 'full_sun' : 'partial_shade',
    homeowner: Math.random() > 0.2,
    systemSize: status === 'customer' ? Math.floor(Math.random() * 15) + 5 : undefined,
    status,
    source,
    notes: '',
    tags: [],
    createdAt,
    updatedAt: createdAt,
    lastContactAt: Math.random() > 0.5 ? new Date(Date.now() - Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000).toISOString() : undefined,
    totalInteractions: Math.floor(Math.random() * 10),
  };
};

const interactionTypes: InteractionType[] = ['call', 'email', 'sms', 'note', 'meeting'];
const outcomes: InteractionOutcome[] = ['connected', 'voicemail', 'no_answer', 'not_interested', 'callback_requested', 'appointment_scheduled', 'information_sent', 'follow_up_needed'];

const generateInteraction = (customerId: string, index: number): CustomerInteraction => {
  const type = interactionTypes[Math.floor(Math.random() * interactionTypes.length)];
  const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
  const daysAgo = Math.floor(Math.random() * 30);
  const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  const contentOptions: Record<InteractionType, string[]> = {
    call: ['Discussed solar panel options', 'Called about quote', 'Follow-up call - interested in 10kW system', 'Initial consultation call', 'Called to discuss financing options'],
    email: ['Sent proposal for 8kW system', 'Follow-up email with brochure', 'Sent financing information', 'Email with system specs', 'Sent contract for review'],
    sms: ['Sent quick follow-up', 'Texted about appointment', 'SMS with quote link', 'Quick check-in message', 'Sent contact info'],
    note: ['Homeowner confirmed interest', 'Property has good sun exposure', 'Needs to consult with spouse', 'Interested in battery backup', 'Budget around $20k'],
    meeting: ['Site survey scheduled', 'Proposal meeting completed', 'Contract signing meeting', 'Follow-up meeting', 'Installation walkthrough'],
  };

  return {
    id: `interaction-${index}`,
    customerId,
    type,
    direction: Math.random() > 0.3 ? 'outbound' : 'inbound',
    subject: type === 'call' || type === 'meeting' ? undefined : `Re: Solar Consultation`,
    content: contentOptions[type][Math.floor(Math.random() * contentOptions[type].length)],
    outcome: type === 'call' ? outcome : undefined,
    duration: type === 'call' ? Math.floor(Math.random() * 1800) + 60 : undefined,
    userId: `user-${Math.floor(Math.random() * 4) + 1}`,
    userName: ['Sarah', 'Mike', 'Joe', 'Carlos'][Math.floor(Math.random() * 4)],
    timestamp,
    createdAt: timestamp,
  };
};

// Generate initial data
const generateMockCustomers = (count: number): CRMCustomer[] => {
  const customers: CRMCustomer[] = [];
  for (let i = 1; i <= count; i++) {
    customers.push(generateRandomCustomer(i));
  }
  return customers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

const generateMockInteractions = (customers: CRMCustomer[]): CustomerInteraction[] => {
  const interactions: CustomerInteraction[] = [];
  let interactionIndex = 1;

  customers.forEach(customer => {
    const numInteractions = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < numInteractions; i++) {
      interactions.push(generateInteraction(customer.id, interactionIndex++));
    }
  });

  return interactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Initial data
export const initialCustomers = generateMockCustomers(30);
export const initialInteractions = generateMockInteractions(initialCustomers);

// Load from localStorage or use initial data
export const loadCustomers = (): CRMCustomer[] => {
  try {
    const stored = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load customers:', e);
  }
  return initialCustomers;
};

export const loadInteractions = (): CustomerInteraction[] => {
  try {
    const stored = localStorage.getItem(INTERACTIONS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load interactions:', e);
  }
  return initialInteractions;
};

export const saveCustomers = (customers: CRMCustomer[]): void => {
  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customers));
  } catch (e) {
    console.error('Failed to save customers:', e);
  }
};

export const saveInteractions = (interactions: CustomerInteraction[]): void => {
  try {
    localStorage.setItem(INTERACTIONS_STORAGE_KEY, JSON.stringify(interactions));
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
