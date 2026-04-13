// SolarFlow - Contractor Module Types
export type ContractorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BusinessType = 'sole_proprietor' | 'llc' | 'c_corp' | 's_corp' | 'partnership';
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';
export type JobStatusContractor = 'assigned' | 'en_route' | 'in_progress' | 'documentation' | 'completed' | 'cancelled' | 'on_hold' | 'invoiced' | 'paid' | 'returned';

// Service completion status
export type ServiceStatus = 'fully_operational' | 'partially_operational' | 'pending_parts' | 'could_not_complete';

// Photo categories for job documentation
export type PhotoCategory = 'before' | 'serial' | 'parts' | 'process' | 'after' | 'progress' | 'ppe' | 'voltage'
  | 'old_serial' | 'string_voltage' | 'cabinet_old' | 'cabinet_new' | 'new_serial' | 'inv_overview';

// Invoice status
export type InvoiceStatus = 'pending' | 'sent' | 'paid' | 'overdue';

// Contractor payment status
export type PaymentStatus = 'pending' | 'approved' | 'processed' | 'rejected';

// Contractor notifications
export interface Notification {
  id: string;
  contractorId: string;
  type: 'new_work_order' | 'work_order_update' | 'payment' | 'message';
  title: string;
  message: string;
  workOrderId?: string;
  read: boolean;
  createdAt: string;
}

// Parts information
export interface JobPart {
  id: string;
  name: string;
  partNumber: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Expense reporting
export interface Expense {
  id: string;
  workOrderId: string;
  contractorId: string;
  amount: number;
  category: 'materials' | 'transportation' | 'equipment' | 'other';
  description: string;
  receiptUrl: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Contractor {
  id: string;
  email: string;
  password?: string; // Removed from client — auth handled by Supabase
  role: 'contractor';
  status: ContractorStatus;
  createdAt: string;

  // Invite tracking
  inviteToken?: string;
  inviteEmail?: string;
  invitedAt?: string;
  invitedBy?: string;

  // W-9 Information
  businessName: string;
  businessType: BusinessType;
  ein: string;
  ssn?: string; // Only for sole proprietors
  streetAddress: string;
  city: string;
  state: string;
  zip: string;

  // SunBiz verification (Florida Division of Corporations)
  sunbizVerified?: boolean;
  sunbizVerifiedAt?: string;
  sunbizEntityNumber?: string; // FDOC document number

  // Insurance
  insuranceProvider: string;
  policyNumber: string;
  coiDocument: string; // Base64 or URL
  coiExpiryDate: string;
  generalLiabilityLimit: number; // e.g., 1000000
  workersCompPolicy: string;

  // Safety Acknowledgment
  agreedToSafety: boolean;
  safetyAgreedDate?: string;
  safetySignature?: string; // Typed full name as e-signature

  // Profile
  contactName: string;
  contactPhone: string;
  username?: string;
  altEmails?: string[]; // additional login emails
  skills: string[];
  notes?: string;

  // Documents
  w9Document?: string;           // base64 or URL of uploaded W-9
  oshaDocument?: string;         // base64 or URL of uploaded OSHA cert
  oshaVerified?: 'link' | 'upload'; // how they completed OSHA requirement

  // Terms acceptance
  termsAcceptedAt?: string;      // ISO timestamp when T&C was accepted
  termsVersion?: string;         // e.g. 'v2026.1'

  // Force password change on next login
  mustChangePassword?: boolean;

  // Expenses
  expenses?: ContractorExpense[];
}

// Contractor invite record stored in localStorage
export interface ContractorInvite {
  token: string;
  email: string;
  invitedBy: string;      // name of admin who sent it
  invitedByEmail: string;
  invitedAt: string;
  note?: string;          // optional message to contractor
  usedAt?: string;
  contractorId?: string;
}

export interface ContractorExpense {
  id: string;
  contractorId: string;
  workOrderId: string;
  workOrderName: string;

  // Expense Details
  dateIncurred: string;
  category: ExpenseCategory;
  amount: number;
  vendor?: string;
  description?: string;

  // Documentation
  attachments: ExpenseAttachment[];

  // Status
  status: ExpenseStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export type ExpenseCategory =
  | 'materials'
  | 'travel'
  | 'permits'
  | 'subcontractor'
  | 'equipment'
  | 'other';

export type ExpenseStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paid';

export interface ExpenseAttachment {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  fileUrl: string;
  uploadedAt: string;
}

// Enhanced Service Rate from Excel import
export interface ServiceRate {
  id: string;
  serviceCode: string;
  serviceName: string;
  description: string;
  active: boolean;

  // Time estimation
  estimatedHours?: number; // Hours Est.

  // Labor costs (what we pay contractors)
  laborCost?: number; // LABOR Cost

  // Parts cost
  partsCost?: number; // Parts Cost

  // Client payment - Standard
  clientRateStandard?: number; // Client Payment - Price

  // Client payment - Recurring (client has >2 paid work orders)
  clientRateRecurring?: number; // Client Payment - Recurring

  // Powercare (manufacturer pays for service)
  isPowercareEligible?: boolean;
  powercareLaborCost?: number; // Power Care - Cost
  powercareClientRate?: number; // Power Care - Price

  // SolarEdge compensation (future feature)
  seCompensation?: number; // SE Compensation

  // Internal service account expense (billed internally, not to client)
  isServiceAccount?: boolean;

  // Legacy fields (for backward compatibility)
  unit?: 'hour' | 'flat' | 'panel' | 'kw';
  rate?: number;
}

export interface ContractorJob {
  id: string;
  sourceJobId?: string;  // links back to admin-side Job.id
  contractorId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;

  // Service rate reference
  serviceRateId?: string;
  serviceType: string;
  description: string;
  priority: JobPriority;
  status: JobStatusContractor;

  // Customer type
  isRecurringClient: boolean; // Client has >2 paid work orders

  // New fields
  urgency: 'low' | 'medium' | 'high' | 'critical';
  isPowercare: boolean;

  scheduledDate: string;
  scheduledTime: string;
  estimatedDuration: number; // in minutes

  assignedAt: string;
  startedAt?: string;
  completedAt?: string;

  // Job notes
  notes?: string;
  completionNotes?: string;

  // New Install flag
  isNewInstall?: boolean;
  solarProjectId?: string;

  // Photos organized by category
  photos: {
    before: string[];
    serial: string[];
    parts: string[];
    process: string[];
    after: string[];
    progress: string[];
    ppe: string[];
    voltage: string[];
    // Inverter change categories
    old_serial: string[];
    string_voltage: string[];
    cabinet_old: string[];
    cabinet_new: string[];
    new_serial: string[];
    inv_overview: string[];
  };

  // Optimizer / microinverter change count (used with OPT-CHANGE service)
  optimizerCount?: number;

  // Signature
  signature?: string;
  clientSignature?: string;
  signatureDate?: string;

  // Service status
  serviceStatus?: ServiceStatus;
  operationalNotes?: string;
  nextSteps?: string;
  requiresFollowUp?: boolean;

  // Parts used
  parts: JobPart[];

  // Invoice tracking
  invoiceId?: string;
  invoiceStatus?: InvoiceStatus;
  invoiceSentAt?: string;
  invoicePaidAt?: string;
  contractorInvoiceNumber?: string; // invoice # contractor submitted for payment
  laborAmount: number;
  partsAmount: number;
  markupPercent: number;
  totalAmount: number;

  // Contractor payment
  contractorPayRate: number;
  contractorPayUnit: 'hour' | 'flat';
  contractorTotalPay: number;
  paymentStatus?: PaymentStatus;
  paymentApprovedAt?: string;
  paymentProcessedAt?: string;

  // Parts reimbursement — set by contractor, visible to accounting
  partsReimbursementRequested?: boolean;

  // Upsell referral — contractor flags a sales opportunity on this job
  upsellFlagged?: boolean;
  upsellNotes?: string;
  upsellLeadCreated?: boolean;

  // Legacy support
  payRate: number;
  payUnit: 'hour' | 'flat';
  totalPay: number;
}

// Registration wizard step types
export type RegistrationStep = 'account' | 'w9' | 'insurance' | 'safety' | 'terms' | 'complete';

// Registration data interface for the registration wizard form
export interface RegistrationData {
  step: number;
  email: string;
  password: string;
  businessName: string;
  businessType: string;
  ein: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insuranceExpiry: string;
  insuranceDocument: string;
  safetyAcknowledged: boolean;
}

export interface RegistrationState {
  currentStep: RegistrationStep;
  email: string;
  password: string;

  // W-9
  businessName: string;
  businessType: BusinessType;
  ein: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;

  // Insurance
  insuranceProvider: string;
  policyNumber: string;
  coiDocument: string;
  coiExpiryDate: string;
  generalLiabilityLimit: number;
  workersCompPolicy: string;

  // Safety
  agreedToSafety: boolean;
  safetyAgreedDate?: string;

  // Documents
  w9Document: string;
  oshaDocument: string;
  oshaVerified?: 'link' | 'upload';

  // Terms
  termsAcceptedAt: string;
  termsVersion: string;

  // Profile
  contactName: string;
  contactPhone: string;
}
