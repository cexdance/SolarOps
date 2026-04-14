// SolarFlow - Contractor Data Store
import { Contractor, ServiceRate, ContractorJob, ContractorInvite } from '../types/contractor';
import { dbSet } from './db';

const CONTRACTORS_KEY = 'solarflow_contractors';
const RATES_KEY = 'solarflow_service_rates';
const CONTRACTOR_JOBS_KEY = 'solarflow_contractor_jobs';

// Default service rates - imported from Excel
const defaultServiceRates: ServiceRate[] = [
  {
    id: 'sr-1',
    serviceCode: 'SITE-SIMPLE',
    serviceName: 'Site visit - Simple / inspection / quick review',
    description: 'Basic site visit, inspection, or quick review',
    estimatedHours: 2,
    laborCost: 50,
    partsCost: 0,
    clientRateStandard: 200,
    clientRateRecurring: 180,
    isPowercareEligible: true,
    powercareLaborCost: 50,
    powercareClientRate: 290,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-2',
    serviceCode: 'SITE-COMM',
    serviceName: 'Site Visit Communications',
    description: 'Site visit for communication-related issues',
    estimatedHours: 2,
    laborCost: 50,
    partsCost: 35,
    clientRateStandard: 280,
    clientRateRecurring: 252,
    isPowercareEligible: true,
    powercareLaborCost: 50,
    powercareClientRate: 290,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-3',
    serviceCode: 'SITE-ROOF',
    serviceName: 'Site visit - Roof/Home Run Inspection',
    description: 'Comprehensive roof and home run inspection',
    estimatedHours: 2.5,
    laborCost: 220,
    partsCost: 0,
    clientRateStandard: 380,
    clientRateRecurring: 342,
    isPowercareEligible: true,
    powercareLaborCost: 150,
    powercareClientRate: 320,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-4',
    serviceCode: 'INV-CHANGE',
    serviceName: 'Inverter Change',
    description: 'Complete inverter replacement service',
    estimatedHours: 3,
    laborCost: 300,
    partsCost: 0,
    clientRateStandard: 750,
    clientRateRecurring: 675,
    isPowercareEligible: true,
    powercareLaborCost: 200,
    powercareClientRate: 430,
    seCompensation: 175,
    active: true
  },
  {
    id: 'sr-5',
    serviceCode: 'INV-CHANGE-ADD',
    serviceName: 'Inverter Change additional in same site',
    description: 'Additional inverter change at same site',
    estimatedHours: 2,
    laborCost: 150,
    partsCost: 0,
    clientRateStandard: 500,
    clientRateRecurring: 450,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 300,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-6',
    serviceCode: 'INV-CHANGE-W-SITE',
    serviceName: 'Inverter Change with initial site visit',
    description: 'Inverter change including initial site visit',
    estimatedHours: 5,
    laborCost: 350,
    partsCost: 0,
    clientRateStandard: 750,
    clientRateRecurring: 675,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 430,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-7',
    serviceCode: 'INV-COMM',
    serviceName: 'Inverter Commissioning Only',
    description: 'Inverter commissioning service only',
    estimatedHours: 2,
    laborCost: 150,
    partsCost: 0,
    clientRateStandard: 550,
    clientRateRecurring: 495,
    isPowercareEligible: true,
    powercareLaborCost: 150,
    powercareClientRate: 290,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-8',
    serviceCode: 'OPT-CHANGE',
    serviceName: 'Optimizer / Microinverter Change',
    description: 'Optimizer or microinverter replacement — $180 base (up to 4 units), $60 each additional. Serial # + voltage test photo required per unit.',
    estimatedHours: 3,
    laborCost: 120,
    partsCost: 0,
    clientRateStandard: 180,
    clientRateRecurring: 162,
    isPowercareEligible: true,
    powercareLaborCost: 120,
    powercareClientRate: 180,
    seCompensation: 125,
    active: true
  },
  {
    id: 'sr-10',
    serviceCode: 'CRITTER-GUARD',
    serviceName: 'Installation of Critter Guard (less than 20 panels)',
    description: 'Critter guard installation for up to 20 panels',
    estimatedHours: 4,
    laborCost: 300,
    partsCost: 50,
    clientRateStandard: 750,
    clientRateRecurring: 675,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-11',
    serviceCode: 'CRITTER-ADD',
    serviceName: 'Critter Guard after additional panels (set if 4)',
    description: 'Additional critter guard panels',
    estimatedHours: 0.5,
    laborCost: 40,
    partsCost: 0,
    clientRateStandard: 100,
    clientRateRecurring: 90,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-12',
    serviceCode: 'DELIVERY',
    serviceName: 'Delivery Run up to 100 miles',
    description: 'Internal delivery service within 100 miles — billed to service account, not client. Requires admin approval.',
    estimatedHours: 2,
    laborCost: 60,
    partsCost: 0,
    clientRateStandard: 0,
    clientRateRecurring: 0,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    isServiceAccount: true,
    active: true
  },
  {
    id: 'sr-13',
    serviceCode: 'REROOF',
    serviceName: 'Reroofing (Per panel) Remove reinstall',
    description: 'Panel removal and reinstallation for reroofing',
    estimatedHours: 0,
    laborCost: 100,
    partsCost: 70,
    clientRateStandard: 280,
    clientRateRecurring: 252,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-14',
    serviceCode: 'BATTERY-CHG-STD',
    serviceName: 'Battery Change – Standard (w/ PowerCare)',
    description: 'Complete battery replacement including disposal and return. PowerCare eligible — client rate $1,200, PowerCare rate $770.',
    estimatedHours: 4,
    laborCost: 500,
    partsCost: 0,
    clientRateStandard: 1200,
    clientRateRecurring: 1080,
    isPowercareEligible: true,
    powercareLaborCost: 450,
    powercareClientRate: 770,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-15',
    serviceCode: 'PANEL-CLEAN',
    serviceName: 'Panel Cleaning (base up to 19 panels)',
    description: 'Panel cleaning service for up to 19 panels',
    estimatedHours: 5,
    laborCost: 350,
    partsCost: 50,
    clientRateStandard: 650,
    clientRateRecurring: 585,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-16',
    serviceCode: 'PANEL-CLEAN-ADD',
    serviceName: 'Panel Cleaning additional panel',
    description: 'Additional panel cleaning (per panel)',
    estimatedHours: 0.5,
    laborCost: 35,
    partsCost: 10,
    clientRateStandard: 35,
    clientRateRecurring: 31.5,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-17',
    serviceCode: 'EV-CHARGER',
    serviceName: 'EV charger installation',
    description: 'Electric vehicle charger installation',
    estimatedHours: 3,
    laborCost: 480,
    partsCost: 900,
    clientRateStandard: 2300,
    clientRateRecurring: 2070,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-18',
    serviceCode: 'BATTERY-CHG-DIRECT',
    serviceName: 'Battery Change – Direct Client (no PowerCare)',
    description: 'Battery replacement for clients not under PowerCare. Includes disposal and return. Client rate $1,000.',
    estimatedHours: 4,
    laborCost: 500,
    partsCost: 0,
    clientRateStandard: 1000,
    clientRateRecurring: 900,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-19',
    serviceCode: 'MILES',
    serviceName: 'Miles',
    description: 'Mileage charge ($0.54/mile IRS rate)',
    estimatedHours: 0,
    laborCost: 0.54,
    partsCost: 0,
    clientRateStandard: 40,
    clientRateRecurring: 36,
    isPowercareEligible: true,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 200,
    active: true
  },
  {
    id: 'sr-20',
    serviceCode: 'SITE-TRX',
    serviceName: 'Site Transfer',
    description: 'Site transfer fee',
    estimatedHours: 0,
    laborCost: 0,
    partsCost: 0,
    clientRateStandard: 100,
    clientRateRecurring: 100,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
    active: true
  },
];

// No demo contractor jobs — clean slate
const demoContractorJobs: ContractorJob[] = [];

// IDs of old demo jobs to purge from any existing localStorage/DB data
const LEGACY_DEMO_JOB_IDS = new Set(['cj-1', 'cj-2', 'cj-3', 'cj-4', 'cj-5']);

// Demo contractor
const demoContractors: Contractor[] = [
  {
    // Merged master record: IMPower Marketing LLC (was contractor-1 ConexSol + contractor-2 MPower)
    id: 'contractor-2',
    email: 'cjurado@mpowermarketing.com',
    role: 'contractor',
    status: 'approved',
    createdAt: new Date().toISOString(),

    businessName: 'IMPower Marketing LLC',
    businessType: 'llc',
    ein: '12-3456789',
    streetAddress: '456 Contractor Way',
    city: 'Miami',
    state: 'FL',
    zip: '33101',

    insuranceProvider: 'ABC Insurance Co',
    policyNumber: 'GL-2024-12345',
    coiDocument: '',
    coiExpiryDate: '2025-12-31',
    generalLiabilityLimit: 2000000,
    workersCompPolicy: 'WC-2024-67890',

    agreedToSafety: true,
    safetyAgreedDate: new Date().toISOString(),

    contactName: 'Cesar Jurado',
    contactPhone: '555-0101',
    username: 'cjurado',
    altEmails: ['cesar.jurado@conexsol.us'],
    skills: ['residential', 'commercial', 'battery'],
  },
  {
    id: 'contractor-3',
    email: 'rperera@solarpowermax.com',
    role: 'contractor',
    status: 'approved',
    createdAt: new Date().toISOString(),

    businessName: 'Solar PowerMax',
    businessType: 'llc',
    ein: '',
    streetAddress: '',
    city: 'Miami',
    state: 'FL',
    zip: '',

    insuranceProvider: '',
    policyNumber: '',
    coiDocument: '',
    coiExpiryDate: '',
    generalLiabilityLimit: 1000000,
    workersCompPolicy: '',

    agreedToSafety: true,
    safetyAgreedDate: new Date().toISOString(),

    contactName: 'Reynaldo Perera',
    contactPhone: '',
    username: 'rperera',
    skills: ['residential', 'commercial'],
  },
  {
    id: 'contractor-4',
    email: 'jmendez@ingengroup.com',
    role: 'contractor',
    status: 'approved',
    createdAt: new Date().toISOString(),

    businessName: 'Ingen Group',
    businessType: 'llc',
    ein: '',
    streetAddress: '',
    city: 'Miami',
    state: 'FL',
    zip: '',

    insuranceProvider: '',
    policyNumber: '',
    coiDocument: '',
    coiExpiryDate: '',
    generalLiabilityLimit: 1000000,
    workersCompPolicy: '',

    agreedToSafety: true,
    safetyAgreedDate: new Date().toISOString(),

    contactName: 'Jaime Mendez',
    contactPhone: '',
    username: 'jmendez',
    skills: ['residential', 'commercial'],
  },
  {
    id: 'contractor-5',
    email: 'cvalbuena@valnuarcapital.com',
    role: 'contractor',
    status: 'approved',
    createdAt: new Date().toISOString(),

    businessName: 'Valnuar Capital LLC',
    businessType: 'llc',
    ein: '',
    streetAddress: '',
    city: 'Miami',
    state: 'FL',
    zip: '',

    insuranceProvider: '',
    policyNumber: '',
    coiDocument: '',
    coiExpiryDate: '',
    generalLiabilityLimit: 1000000,
    workersCompPolicy: '',

    agreedToSafety: true,
    safetyAgreedDate: new Date().toISOString(),

    contactName: 'Carlos Valbuena',
    contactPhone: '',
    username: 'Cvalbuena',
    altEmails: ['carlos.valbuena@conexsol.us'],
    skills: ['residential', 'commercial'],
  },
];

export const loadContractors = (): Contractor[] => {
  try {
    const stored = localStorage.getItem(CONTRACTORS_KEY);
    if (stored) {
      const loaded: Contractor[] = JSON.parse(stored);
      // Always apply altEmails from seed so login aliases stay up-to-date
      return loaded.map(c => {
        const seed = demoContractors.find(d => d.id === c.id);
        return seed?.altEmails ? { ...c, altEmails: seed.altEmails } : c;
      });
    }
  } catch (e) {
    console.error('Failed to load contractors:', e);
  }
  return demoContractors;
};

export const saveContractors = (contractors: Contractor[]): void => {
  try {
    localStorage.setItem(CONTRACTORS_KEY, JSON.stringify(contractors));
    dbSet(CONTRACTORS_KEY, contractors);
  } catch (e) {
    console.error('Failed to save contractors:', e);
  }
};

export const loadServiceRates = (): ServiceRate[] => {
  try {
    const stored = localStorage.getItem(RATES_KEY);
    if (stored) {
      const parsed: ServiceRate[] = JSON.parse(stored);
      // Merge: apply any updated defaults by id so price/description changes propagate
      const defaultMap = new Map(defaultServiceRates.map(r => [r.id, r]));
      return parsed.map(r => defaultMap.has(r.id) ? { ...defaultMap.get(r.id)!, active: r.active } : r);
    }
  } catch (e) {
    console.error('Failed to load service rates:', e);
  }
  return defaultServiceRates;
};

export const saveServiceRates = (rates: ServiceRate[]): void => {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify(rates));
    dbSet(RATES_KEY, rates);
  } catch (e) {
    console.error('Failed to save service rates:', e);
  }
};

export const loadContractorJobs = (): ContractorJob[] => {
  try {
    const stored = localStorage.getItem(CONTRACTOR_JOBS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load contractor jobs:', e);
  }
  return demoContractorJobs;
};

export const saveContractorJobs = (jobs: ContractorJob[]): void => {
  try {
    localStorage.setItem(CONTRACTOR_JOBS_KEY, JSON.stringify(jobs));
    dbSet(CONTRACTOR_JOBS_KEY, jobs);
  } catch (e) {
    console.error('Failed to save contractor jobs:', e);
  }
};

// Initialize with demo data if empty, and merge in any new demo contractors
export const initializeContractorData = (): void => {
  if (!localStorage.getItem(CONTRACTORS_KEY)) {
    saveContractors(demoContractors);
  } else {
    // Merge: add missing demo contractors and always sync email for existing ones
    const existing = loadContractors();
    const existingIds = new Set(existing.map(c => c.id));
    const missing = demoContractors.filter(c => !existingIds.has(c.id));
    // Remove legacy contractor-1 (duplicate of contractor-2 / IMPower Marketing LLC)
    const deduped = existing.filter(c => c.id !== 'contractor-1');
    const updated = deduped.map(c => {
      const demo = demoContractors.find(d => d.id === c.id);
      if (demo) {
        // Migrate stale name/business data to current seed values
        const needsMigration =
          c.businessName === "Mike's Solar Services" || c.contactName === 'Mike Johnson' ||
          c.businessName === 'ConexSol' || c.businessName === 'MPower Marketing, LLC';
        return {
          ...c,
          email: demo.email,
          altEmails: demo.altEmails ?? c.altEmails,
          ...(needsMigration ? { businessName: demo.businessName, contactName: demo.contactName } : {}),
        };
      }
      return c;
    });
    if (missing.length > 0 || updated.some((c, i) => c !== deduped[i]) || deduped.length !== existing.length) {
      saveContractors([...updated, ...missing]);
    }
    // Reassign any contractor jobs from legacy contractor-1 → contractor-2
    const cJobs = loadContractorJobs();
    const reassigned = cJobs.map(j => j.contractorId === 'contractor-1' ? { ...j, contractorId: 'contractor-2' } : j);
    if (reassigned.some((j, i) => j !== cJobs[i])) saveContractorJobs(reassigned);
  }
  if (!localStorage.getItem(RATES_KEY)) {
    saveServiceRates(defaultServiceRates);
  } else {
    // Merge: add any default rates not yet in stored list
    const existingRates = loadServiceRates();
    const existingRateIds = new Set(existingRates.map(r => r.id));
    const missingRates = defaultServiceRates.filter(r => !existingRateIds.has(r.id));
    if (missingRates.length > 0) {
      saveServiceRates([...existingRates, ...missingRates]);
    }
  }
  if (!localStorage.getItem(CONTRACTOR_JOBS_KEY)) {
    saveContractorJobs([]);
  } else {
    // Purge any legacy demo jobs that were seeded in prior sessions
    const existingJobs = loadContractorJobs();
    const filtered = existingJobs.filter(j => !LEGACY_DEMO_JOB_IDS.has(j.id));
    if (filtered.length !== existingJobs.length) {
      saveContractorJobs(filtered);
    }
  }
};

// ─── Invite Management ────────────────────────────────────────────────────────

const INVITES_KEY = 'solarflow_contractor_invites';

export const loadInvites = (): ContractorInvite[] => {
  try {
    const stored = localStorage.getItem(INVITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveInvites = (invites: ContractorInvite[]): void => {
  try {
    localStorage.setItem(INVITES_KEY, JSON.stringify(invites));
    dbSet(INVITES_KEY, invites);
  } catch (e) {
    console.error('Failed to save invites:', e);
  }
};

export const createInvite = (
  email: string,
  invitedBy: string,
  invitedByEmail: string,
  note?: string
): ContractorInvite => {
  const invite: ContractorInvite = {
    token: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    email,
    invitedBy,
    invitedByEmail,
    invitedAt: new Date().toISOString(),
    note,
  };
  const invites = loadInvites();
  // Revoke any prior unused invite for this email
  const updated = invites.filter(i => i.email !== email || i.usedAt);
  saveInvites([...updated, invite]);
  return invite;
};

export const findInviteByToken = (token: string): ContractorInvite | null => {
  const invites = loadInvites();
  return invites.find(i => i.token === token) ?? null;
};

export const markInviteUsed = (token: string, contractorId: string): void => {
  const invites = loadInvites();
  saveInvites(invites.map(i =>
    i.token === token ? { ...i, usedAt: new Date().toISOString(), contractorId } : i
  ));
};

// ─── Notification Management ────────────────────────────────────────────────────

const NOTIFICATIONS_KEY = 'solarflow_contractor_notifications';

export interface ContractorNotification {
  id: string;
  contractorId: string;
  type: 'new_work_order' | 'work_order_update' | 'payment' | 'message' | 'wo_assigned';
  title: string;
  message: string;
  workOrderId?: string;
  jobId?: string;
  read: boolean;
  createdAt: string;
}

export const loadNotifications = (): ContractorNotification[] => {
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveNotifications = (notifications: ContractorNotification[]): void => {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
    dbSet(NOTIFICATIONS_KEY, notifications);
  } catch (e) {
    console.error('Failed to save notifications:', e);
  }
};

export const addNotification = (notification: Omit<ContractorNotification, 'id' | 'createdAt' | 'read'>): ContractorNotification => {
  const newNotification: ContractorNotification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  const notifications = loadNotifications();
  // Keep only last 100 notifications per contractor
  const contractorNotifications = notifications.filter(n => n.contractorId !== notification.contractorId);
  const updated = [newNotification, ...contractorNotifications].slice(0, 100);
  saveNotifications(updated);
  return newNotification;
};

export const markNotificationRead = (notificationId: string): void => {
  const notifications = loadNotifications();
  const updated = notifications.map(n =>
    n.id === notificationId ? { ...n, read: true } : n
  );
  saveNotifications(updated);
};

export const markAllNotificationsRead = (contractorId: string): void => {
  const notifications = loadNotifications();
  const updated = notifications.map(n =>
    n.contractorId === contractorId ? { ...n, read: true } : n
  );
  saveNotifications(updated);
};

export const getUnreadCount = (contractorId: string): number => {
  const notifications = loadNotifications();
  return notifications.filter(n => n.contractorId === contractorId && !n.read).length;
};

export const createWorkOrderNotification = (
  contractorId: string,
  job: ContractorJob,
  assignedBy: string = 'Admin'
): ContractorNotification => {
  return addNotification({
    contractorId,
    type: 'wo_assigned',
    title: 'New Work Order Assigned',
    message: `You have been assigned to: ${job.description || job.serviceType}. Location: ${job.address || 'See details'}. Scheduled: ${job.scheduledDate || 'TBD'}`,
    workOrderId: job.sourceJobId,
    jobId: job.id,
  });
};
