// SolarFlow - Contractor Module Types
export type ContractorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BusinessType = 'sole_proprietor' | 'llc' | 'c_corp' | 's_corp' | 'partnership';
export type JobPriority = 'critical' | 'high' | 'normal' | 'low';
export type JobStatusContractor = 'assigned' | 'en_route' | 'in_progress' | 'documentation' | 'completed' | 'cancelled' | 'on_hold';

// Service completion status
export type ServiceStatus = 'fully_operational' | 'partially_operational' | 'pending_parts' | 'could_not_complete';

// Photo categories for job documentation
export type PhotoCategory = 'before' | 'serial' | 'parts' | 'process' | 'after';

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
  password: string; // In production, this would be hashed
  role: 'contractor';
  status: ContractorStatus;
  createdAt: string;

  // W-9 Information
  businessName: string;
  businessType: BusinessType;
  ein: string;
  ssn?: string; // Only for sole proprietors
  streetAddress: string;
  city: string;
  state: string;
  zip: string;

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

  // Profile
  contactName: string;
  contactPhone: string;
  skills: string[];
  notes?: string;

  // Expenses
  expenses?: ContractorExpense[];
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

  // Legacy fields (for backward compatibility)
  unit?: 'hour' | 'flat' | 'panel' | 'kw';
  rate?: number;
}

export interface ContractorJob {
  id: string;
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

  // Photos organized by category
  photos: {
    before: string[];
    serial: string[];
    parts: string[];
    process: string[];
    after: string[];
  };

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

  // Legacy support
  payRate: number;
  payUnit: 'hour' | 'flat';
  totalPay: number;
}

// Registration wizard step types
export type RegistrationStep = 'account' | 'w9' | 'insurance' | 'safety' | 'complete';

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

  // Profile
  contactName: string;
  contactPhone: string;
}
