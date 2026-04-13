import { Contractor, ServiceRate, ContractorJob } from '../types/contractor';

export const mockContractors: Contractor[] = [
  {
    id: 'C002',
    email: 'joe.electrical@sunpower.com',
    role: 'contractor',
    status: 'pending',
    createdAt: '2026-02-20',

    businessName: 'Joe Rodriguez Electrical',
    businessType: 'sole_proprietor',
    ein: '98-7654321',
    streetAddress: '789 Palm Ave',
    city: 'Fort Lauderdale',
    state: 'FL',
    zip: '33301',

    insuranceProvider: 'XYZ Insurance',
    policyNumber: 'GL-2024-54321',
    coiDocument: '',
    coiExpiryDate: '2026-08-15',
    generalLiabilityLimit: 1000000,
    workersCompPolicy: 'WC-2024-11111',

    agreedToSafety: true,
    safetyAgreedDate: '2026-02-20',

    contactName: 'Joe Rodriguez',
    contactPhone: '555-0102',
    skills: ['electrical', 'commercial'],
  },
  {
    id: 'C003',
    email: 'carlos.solar@elite-solar.com',
    role: 'contractor',
    status: 'approved',
    createdAt: '2024-11-15',

    businessName: 'Elite Solar Solutions LLC',
    businessType: 'llc',
    ein: '45-6789012',
    streetAddress: '321 Ocean Drive',
    city: 'West Palm Beach',
    state: 'FL',
    zip: '33401',

    insuranceProvider: 'National Insurance Co',
    policyNumber: 'GL-2024-99999',
    coiDocument: 'coi_elite_solar.pdf',
    coiExpiryDate: '2026-06-30',
    generalLiabilityLimit: 2000000,
    workersCompPolicy: 'WC-2024-22222',

    agreedToSafety: true,
    safetyAgreedDate: '2024-11-20',

    contactName: 'Carlos Martinez',
    contactPhone: '555-0103',
    skills: ['residential', 'commercial', 'battery', 'inspection'],
  },
];

export const mockServiceRates: ServiceRate[] = [
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
];

export const mockContractorJobs: ContractorJob[] = [];

export const businessTypes = [
  { value: 'sole_proprietor', label: 'Sole Proprietorship' },
  { value: 'llc', label: 'Limited Liability Company (LLC)' },
  { value: 'c_corp', label: 'C Corporation' },
  { value: 's_corp', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
];

export const insuranceRequirements = [
  { name: 'General Liability', amount: '$1,000,000', required: true },
  { name: 'Workers Compensation', amount: 'State Minimum', required: true },
  { name: 'Commercial Auto', amount: '$500,000', required: true },
];

export const safetyProtocolText = `
CONEXSOL SAFETY PROTOCOLS & SUBCONTRACTOR AGREEMENT

1. PURPOSE AND SCOPE
This agreement establishes the safety standards and operational requirements for all subcontractors performing work on Conexsol solar installation and service projects.

2. SAFETY REQUIREMENTS
2.1 All subcontractors must complete OSHA-10 certification before beginning work.
2.2 Personal Protective Equipment (PPE) is required at all times on job sites, including:
   - Hard hat
   - Safety glasses
   - Work gloves
   - Safety boots
   - High-visibility vest

3. ELECTRICAL SAFETY
3.1 All electrical work must comply with NEC (National Electrical Code) standards.
3.2 Solar panels produce voltage even when disconnected - treat all conductors as live.
3.3 Lockout/Tagout procedures must be followed for all maintenance work.

4. FALL PROTECTION
4.1 Fall protection is required for any work at heights above 6 feet.
4.2 Harnesses must be inspected before each use.
4.3 Guardrails or safety nets must be in place when available.

5. VEHICLE AND SITE SAFETY
5.1 All vehicles must be properly secured at job sites.
5.2 Equipment must be staged away from pedestrian traffic areas.
5.3 Job sites must be secured when left unattended.

6. REPORTING REQUIREMENTS
6.1 All incidents must be reported within 24 hours.
6.2 Near-misses must be documented and reported.
6.3 Weekly safety toolbox talks are required for all crews.

7. COMPLIANCE
Failure to comply with these safety protocols may result in immediate removal from job sites and termination of subcontractor agreement.

By signing below, you acknowledge that you have read, understood, and agree to comply with all safety protocols and requirements outlined in this agreement.
`;
