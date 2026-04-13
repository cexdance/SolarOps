// Solar Project workflow types

export type StepStatus = 'pending' | 'in_progress' | 'complete' | 'failed' | 'na';

// ── Parts types ───────────────────────────────────────────────────────────────

export type PartGroup = 'panels' | 'roof_attachments' | 'railing' | 'dc_wiring' | 'optimizers' | 'inverter' | 'bos';
export type PartStatus = 'pending' | 'ordered' | 'partial' | 'received';

export interface ProjectPart {
  id: string;
  catalogId?: string;
  group: PartGroup;
  partNumber: string;
  sku: string;
  name: string;
  description: string;
  manufacturer?: string;
  watts?: number;
  quantityNeeded: number;
  quantityReceived: number;
  unitCost: number;
  link?: string;
  serialNumbers: string[];
  notes?: string;
  status: PartStatus;
}
export type StepOutcome = 'pass' | 'fail' | 'comments';

export interface ProjectStep {
  id: string;
  label: string;
  status: StepStatus;
  outcome?: StepOutcome;    // for steps that have a pass/fail/comments result
  hasOutcome: boolean;
  date?: string;
  notes?: string;
  completedAt?: string;
}

export interface ProjectSection {
  id: string;
  title: string;
  steps: ProjectStep[];
}

export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';

export type ScheduleEntryType = 'work_order' | 'inspection' | 'delivery' | 'meeting' | 'other';

export interface ScheduleEntry {
  id: string;
  date: string;                   // YYYY-MM-DD
  title: string;
  type: ScheduleEntryType;
  contractorJobId?: string;       // linked contractor job id
  contractorName?: string;
  notes?: string;
  completed: boolean;
}

export interface SolarProject {
  id: string;
  customerId: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
  solarEdgeSiteId?: string;
  systemType?: string;
  status: ProjectStatus;
  sections: ProjectSection[];
  parts: ProjectPart[];
  scheduleEntries: ScheduleEntry[];
  linkedContractorJobIds: string[];
  installationProgress: number;   // 0-100, manually set or auto
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Default permit section template ──────────────────────────────────────────

export function makePermitSection(): ProjectSection {
  const steps: Omit<ProjectStep, 'id'>[] = [
    { label: 'Site Visit',                                         status: 'pending', hasOutcome: false },
    { label: 'Engineering Plans & SIF',                           status: 'pending', hasOutcome: false },
    { label: 'Engineering Review (Internal)',                     status: 'pending', hasOutcome: false },
    { label: 'AHJ Forms, Requests & Submittals',                  status: 'pending', hasOutcome: false },
    { label: 'Contractor License Signature — City Forms (Electrical & CGC)', status: 'pending', hasOutcome: false },
    { label: 'Submit Plans & Documents to City',                  status: 'pending', hasOutcome: false },
    { label: 'Electrical Review',                                 status: 'pending', hasOutcome: true  },
    { label: 'Building Review',                                   status: 'pending', hasOutcome: true  },
    { label: 'Fire Review',                                       status: 'pending', hasOutcome: true  },
    { label: 'Special Inspection Affidavit',                      status: 'pending', hasOutcome: false },
    { label: 'NOC',                                               status: 'pending', hasOutcome: false },
    { label: 'Plan Pack & Permit Card Printed — APPROVED',        status: 'pending', hasOutcome: false },
    { label: 'Electrical Rough Inspection',                       status: 'pending', hasOutcome: true  },
    { label: 'Electrical Final Inspection',                       status: 'pending', hasOutcome: true  },
    { label: 'Building Final',                                    status: 'pending', hasOutcome: true  },
    { label: 'Fire Inspection',                                   status: 'pending', hasOutcome: true  },
    { label: 'Permit Approved ✓',                                 status: 'pending', hasOutcome: false },
  ];

  return {
    id: 'permit',
    title: 'Permit',
    steps: steps.map((s, i) => ({ ...s, id: `permit-step-${i + 1}` })),
  };
}

export function makeNewProject(partial: Pick<SolarProject, 'customerId' | 'customerName' | 'address' | 'city' | 'state' | 'zip'> & Partial<SolarProject>): SolarProject {
  const now = new Date().toISOString();
  return {
    id: `proj-${Date.now()}`,
    status: 'active',
    sections: [makePermitSection()],
    parts: [],
    scheduleEntries: [],
    linkedContractorJobIds: [],
    installationProgress: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
    phone: '',
    ...partial,
  };
}
