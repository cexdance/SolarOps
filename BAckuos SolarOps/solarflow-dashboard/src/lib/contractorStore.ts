// SolarFlow - Contractor Data Store
import { Contractor, ServiceRate, ContractorJob } from '../types/contractor';

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
    serviceName: 'Optimizer/Microinverter Change up to (4)',
    description: 'Optimizer or microinverter replacement (up to 4 units)',
    estimatedHours: 3,
    laborCost: 180,
    partsCost: 0,
    clientRateStandard: 380,
    clientRateRecurring: 342,
    isPowercareEligible: true,
    powercareLaborCost: 180,
    powercareClientRate: 320,
    seCompensation: 125,
    active: true
  },
  {
    id: 'sr-9',
    serviceCode: 'OPT-CHANGE-ADD',
    serviceName: 'Optimizer/Microinverter change Additional',
    description: 'Additional optimizer/microinverter change',
    estimatedHours: 0.5,
    laborCost: 60,
    partsCost: 0,
    clientRateStandard: 150,
    clientRateRecurring: 135,
    isPowercareEligible: true,
    powercareLaborCost: 60,
    powercareClientRate: 150,
    seCompensation: 25,
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
    description: 'Delivery service within 100 miles',
    estimatedHours: 2,
    laborCost: 60,
    partsCost: 0,
    clientRateStandard: 0,
    clientRateRecurring: 0,
    isPowercareEligible: false,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 0,
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
    serviceCode: 'BATTERY-CHG',
    serviceName: 'Battery Change - Includes disposal and return',
    description: 'Complete battery replacement including disposal',
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
    serviceCode: 'BATTERY-CHG-ALT',
    serviceName: 'Battery Change - Includes disposal and return',
    description: 'Alternative battery replacement service',
    estimatedHours: 4,
    laborCost: 500,
    partsCost: 0,
    clientRateStandard: 1000,
    clientRateRecurring: 900,
    isPowercareEligible: true,
    powercareLaborCost: 0,
    powercareClientRate: 770,
    seCompensation: 0,
    active: true
  },
  {
    id: 'sr-19',
    serviceCode: 'MILES',
    serviceName: 'Miles',
    description: 'Mileage charge',
    estimatedHours: 0,
    laborCost: 0,
    partsCost: 0,
    clientRateStandard: 40,
    clientRateRecurring: 36,
    isPowercareEligible: true,
    powercareLaborCost: 0,
    powercareClientRate: 0,
    seCompensation: 200,
    active: true
  },
];

// Demo contractor jobs
const demoContractorJobs: ContractorJob[] = [
  {
    id: 'cj-1',
    contractorId: 'contractor-1',
    customerId: 'cust-1',
    customerName: 'Johnson Residence',
    customerPhone: '555-1001',
    customerEmail: 'johnson@email.com',
    address: '123 Palm Beach Blvd',
    city: 'West Palm Beach',
    state: 'FL',
    zip: '33401',
    latitude: 26.7052,
    longitude: -80.0534,
    serviceType: 'Panel Cleaning',
    description: 'Quarterly panel cleaning and inspection. Check all panels for damage, clean bird droppings and debris.',
    priority: 'high',
    status: 'assigned',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '09:00',
    estimatedDuration: 90,
    assignedAt: new Date().toISOString(),
    notes: 'Gate code: 1234. Customer prefers morning visits. Check panel serial numbers on south-facing roof.',
    photos: { before: [], serial: [], parts: [], process: [], after: [] },
    parts: [],
    laborAmount: 187.5,
    partsAmount: 0,
    markupPercent: 20,
    totalAmount: 225,
    contractorPayRate: 125,
    contractorPayUnit: 'hour',
    contractorTotalPay: 187.5,
    payRate: 125,
    payUnit: 'hour',
    totalPay: 187.5,
    urgency: 'medium',
    isPowercare: false,
    isRecurringClient: true,
  },
  {
    id: 'cj-2',
    contractorId: 'contractor-1',
    customerId: 'cust-3',
    customerName: 'Smith Home',
    customerPhone: '555-1003',
    customerEmail: 'smith@email.com',
    address: '789 Sunrise Ave',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33304',
    latitude: 26.1224,
    longitude: -80.1373,
    serviceType: 'Inverter Repair',
    description: 'Inverter fault diagnosis and repair. Error code displayed: GFDI fault.',
    priority: 'critical',
    status: 'assigned',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '11:00',
    estimatedDuration: 120,
    assignedAt: new Date().toISOString(),
    notes: 'Customer reported no power generation for 2 days. Inverter model: SolarEdge SE6000. Bring multimeter and laptop for monitoring.',
    photos: { before: [], serial: [], parts: [], process: [], after: [] },
    parts: [
      { id: 'part-1', name: 'SolarEdge DC Disconnect', partNumber: 'SEDC-2000', quantity: 1, unitPrice: 150, totalPrice: 150 }
    ],
    laborAmount: 300,
    partsAmount: 150,
    markupPercent: 20,
    totalAmount: 540,
    contractorPayRate: 150,
    contractorPayUnit: 'hour',
    contractorTotalPay: 300,
    payRate: 150,
    payUnit: 'hour',
    totalPay: 300,
    urgency: 'high',
    isPowercare: true,
    isRecurringClient: false,
  },
  {
    id: 'cj-3',
    contractorId: 'contractor-1',
    customerId: 'cust-5',
    customerName: 'Williams Residence',
    customerPhone: '555-1005',
    customerEmail: 'williams@email.com',
    address: '321 Coconut Lane',
    city: 'Tampa',
    state: 'FL',
    zip: '33602',
    latitude: 27.9506,
    longitude: -82.4572,
    serviceType: 'System Inspection',
    description: 'Annual system inspection. Verify all components meet code requirements.',
    priority: 'normal',
    status: 'assigned',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '14:00',
    estimatedDuration: 60,
    assignedAt: new Date().toISOString(),
    notes: 'Annual inspection required for warranty. Check all connections, torque test, infrared scan if available.',
    photos: { before: [], serial: [], parts: [], process: [], after: [] },
    parts: [],
    laborAmount: 175,
    partsAmount: 0,
    markupPercent: 20,
    totalAmount: 210,
    contractorPayRate: 175,
    contractorPayUnit: 'flat',
    contractorTotalPay: 175,
    payRate: 175,
    payUnit: 'flat',
    totalPay: 175,
    urgency: 'critical',
    isPowercare: true,
    isRecurringClient: true,
  },
  {
    id: 'cj-4',
    contractorId: 'contractor-1',
    customerId: 'cust-2',
    customerName: 'El Fuerte Supermarket',
    customerPhone: '555-1002',
    customerEmail: 'admin@elfuerte.com',
    address: '456 Ocean Drive',
    city: 'Miami',
    state: 'FL',
    zip: '33139',
    latitude: 25.7617,
    longitude: -80.1918,
    serviceType: 'Commercial Inspection',
    description: 'Annual commercial inspection. 50kW system on commercial roof.',
    priority: 'high',
    status: 'assigned',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '08:00',
    estimatedDuration: 240,
    assignedAt: new Date().toISOString(),
    notes: 'Commercial property - need to coordinate with store manager. Roof access via east entrance. Safety harness required.',
    photos: { before: [], serial: [], parts: [], process: [], after: [] },
    parts: [],
    laborAmount: 600,
    partsAmount: 0,
    markupPercent: 20,
    totalAmount: 720,
    contractorPayRate: 150,
    contractorPayUnit: 'hour',
    contractorTotalPay: 600,
    payRate: 150,
    payUnit: 'hour',
    totalPay: 600,
    urgency: 'low',
    isPowercare: false,
    isRecurringClient: false,
  },
  {
    id: 'cj-5',
    contractorId: 'contractor-1',
    customerId: 'cust-4',
    customerName: 'Megamall Plaza',
    customerPhone: '555-1004',
    customerEmail: 'facility@megamall.com',
    address: '1000 Mall Way',
    city: 'Orlando',
    state: 'FL',
    zip: '32801',
    latitude: 28.5383,
    longitude: -81.3792,
    serviceType: 'Maintenance',
    description: 'Quarterly maintenance for 25kW system',
    priority: 'low',
    status: 'assigned',
    scheduledDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    scheduledTime: '09:00',
    estimatedDuration: 180,
    assignedAt: new Date().toISOString(),
    notes: 'Schedule with facility management. They prefer weekday mornings.',
    photos: { before: [], serial: [], parts: [], process: [], after: [] },
    parts: [],
    laborAmount: 375,
    partsAmount: 0,
    markupPercent: 20,
    totalAmount: 450,
    contractorPayRate: 125,
    contractorPayUnit: 'hour',
    contractorTotalPay: 375,
    payRate: 125,
    payUnit: 'hour',
    totalPay: 375,
    urgency: 'medium',
    isPowercare: false,
    isRecurringClient: true,
  },
];

// Demo contractor
const demoContractors: Contractor[] = [
  {
    id: 'contractor-1',
    email: 'mike@contractor.com',
    password: 'password123',
    role: 'contractor',
    status: 'approved',
    createdAt: new Date().toISOString(),

    businessName: 'Mike\'s Solar Services',
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

    contactName: 'Mike Johnson',
    contactPhone: '555-0101',
    skills: ['residential', 'commercial', 'battery'],
  },
];

export const loadContractors = (): Contractor[] => {
  try {
    const stored = localStorage.getItem(CONTRACTORS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load contractors:', e);
  }
  return demoContractors;
};

export const saveContractors = (contractors: Contractor[]): void => {
  try {
    localStorage.setItem(CONTRACTORS_KEY, JSON.stringify(contractors));
  } catch (e) {
    console.error('Failed to save contractors:', e);
  }
};

export const loadServiceRates = (): ServiceRate[] => {
  try {
    const stored = localStorage.getItem(RATES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load service rates:', e);
  }
  return defaultServiceRates;
};

export const saveServiceRates = (rates: ServiceRate[]): void => {
  try {
    localStorage.setItem(RATES_KEY, JSON.stringify(rates));
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
  } catch (e) {
    console.error('Failed to save contractor jobs:', e);
  }
};

// Initialize with demo data if empty
export const initializeContractorData = (): void => {
  if (!localStorage.getItem(CONTRACTORS_KEY)) {
    saveContractors(demoContractors);
  }
  if (!localStorage.getItem(RATES_KEY)) {
    saveServiceRates(defaultServiceRates);
  }
  if (!localStorage.getItem(CONTRACTOR_JOBS_KEY)) {
    saveContractorJobs(demoContractorJobs);
  }
};
