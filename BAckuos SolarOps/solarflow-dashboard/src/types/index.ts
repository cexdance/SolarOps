// SolarFlow MVP - Types and Interfaces

export type UserRole = 'admin' | 'technician' | 'coo';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  active: boolean;
}

export type CustomerType = 'residential' | 'commercial';

export type SystemType = 'SolarEdge' | 'Enphase' | 'SMA' | 'Other';

export type ClientStatus =
  | 'Contacted'
  | 'In Progress'
  | 'Quote Sent'
  | 'Quote Approved'
  | 'WO Assigned'
  | 'Standby'
  | 'O&M'
  | 'Invoiced'
  | 'Pending Payment'
  | 'OVERDUE'
  | 'Pending Parts'
  | 'WO Completed'
  | 'Contact Client';

export type ActivityType = 'note_added' | 'status_changed' | 'job_created' | 'job_completed' | 'info_updated';

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  userId?: string;
  userName?: string;
}

export interface Customer {
  id: string;
  clientId?: string; // US-1XXXX format
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: CustomerType;
  systemType?: SystemType;
  clientStatus?: ClientStatus;
  createdAt: string;
  notes: string;
  referralSource?: string;
  howFound?: string;
  isPowerCare?: boolean;
  activityHistory?: Activity[];
  solarEdgeSiteId?: string; // SolarEdge site ID for cross-referencing
  trelloBackupUrl?: string; // Trello board backup link (from column B hyperlinks)
}

export type ServiceType = 'maintenance' | 'repair' | 'installation' | 'inspection' | 'emergency';

export type JobStatus = 'new' | 'assigned' | 'in_progress' | 'completed' | 'invoiced' | 'paid';
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Job {
  id: string;
  customerId: string;
  technicianId: string;
  title?: string;
  serviceType: ServiceType;
  status: JobStatus;
  scheduledDate: string;
  scheduledTime: string;
  startedAt?: string;
  completedAt?: string;
  notes: string;
  completionNotes?: string;
  photos: string[];
  signature?: string;
  xeroInvoiceId?: string;
  laborHours: number;
  laborRate: number;
  partsCost: number;
  totalAmount: number;
  createdAt: string;
  // New fields
  urgency: UrgencyLevel;
  isPowercare: boolean;
  contractorId?: string;
  // Additional optional fields for flexibility
  description?: string;
  priority?: UrgencyLevel;
  date?: string;
}

export interface XeroConfig {
  connected: boolean;
  organizationName?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface SolarEdgeConfig {
  apiKey: string;
  lastSync?: string;
  siteCount?: number;
}

export interface AppState {
  users: User[];
  customers: Customer[];
  jobs: Job[];
  xeroConfig: XeroConfig;
  solarEdgeConfig: SolarEdgeConfig;
  currentUser: User | null;
}

// Inventory Types
export type InventoryCategory = 'panel' | 'optimizer' | 'inverter' | 'cable' | 'racking' | 'label' | 'battery';
export type ToolCategory = 'drill' | 'ladder' | 'crimper' | 'ppe' | 'tester' | 'other';
export type UnitOfMeasure = 'unit' | 'feet' | 'meters' | 'box' | 'roll';
export type ToolStatus = 'available' | 'in_use' | 'broken' | 'lost';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  description: string;
  quantity: number;
  unitOfMeasure: UnitOfMeasure;
  location: string;
  minStockThreshold: number;
  unitCost: number;
  vendorId?: string;
  purchaseDate: string;
  createdAt: string;
}

export interface ToolItem {
  id: string;
  name: string;
  category: ToolCategory;
  serialNumber?: string;
  status: ToolStatus;
  assignedTo?: string;
  location: string;
  purchaseDate: string;
  purchasePrice: number;
  lastInspectionDate?: string;
  notes?: string;
  createdAt: string;
}

export interface Provider {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  website?: string;
  notes?: string;
  createdAt: string;
}

export interface PriceList {
  id: string;
  providerId: string;
  fileName: string;
  uploadDate: string;
  notes?: string;
}

// ============================================
// SolarFlow CRM v2 - Gamified Sales CRM
// ============================================

export type UserRoleCRM = 'admin' | 'manager' | 'sales_rep';

export type LeadStatus =
  | 'new'
  | 'attempting'
  | 'connected'
  | 'appointment'
  | 'qualified'
  | 'proposal'
  | 'closed_won'
  | 'closed_lost'
  | 'not_interested';

export type LeadSource =
  | 'google_forms'
  | 'website'
  | 'referral'
  | 'cold_call'
  | 'social_media'
  | 'advertising'
  | 'partner'
  | 'other';

export type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;

  // Solar-specific
  monthlyBill?: number;
  roofType?: 'flat' | 'sloped' | 'metal';
  roofShade?: 'full_sun' | 'partial_shade' | 'heavy_shade';
  homeowner?: boolean;

  // Lead info
  status: LeadStatus;
  source: LeadSource;
  priority: LeadPriority;
  score: number;

  // Assignment
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  nextFollowUp?: string;

  // Notes
  notes: string;
  description?: string;

  // Trello link
  trelloBackupUrl?: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  userId: string;
  userName: string;
  type: 'call' | 'email' | 'note' | 'status_change' | 'appointment' | 'visit';
  description: string;
  outcome?: string;
  timestamp: string;
  xpEarned: number;
}

// Gamification Types
export interface UserStats {
  userId: string;
  xp: number;
  level: number;
  streak: number;
  totalCalls: number;
  totalEmails: number;
  appointmentsSet: number;
  dealsClosed: number;
  revenueGenerated: number;
  badges: Badge[];
  weeklyCalls: number;
  weeklyAppointments: number;
  weeklyXP: number;
  lastActiveDate?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  avatar?: string;
  xp: number;
  level: number;
  streak: number;
  dealsClosed: number;
  rank: number;
}

// XP Configuration
export const XP_ACTIONS = {
  call_made: 10,
  email_sent: 5,
  note_added: 5,
  appointment_set: 150,
  proposal_sent: 100,
  deal_closed: 500,
  streak_bonus: 50,
} as const;

// Level thresholds
export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: 'Rookie' },
  { level: 2, xp: 500, title: 'Trainee' },
  { level: 3, xp: 1500, title: 'Junior Rep' },
  { level: 4, xp: 3500, title: 'Sales Rep' },
  { level: 5, xp: 7000, title: 'Senior Rep' },
  { level: 6, xp: 12000, title: 'Account Executive' },
  { level: 7, xp: 20000, title: 'Top Performer' },
  { level: 8, xp: 35000, title: 'Sales Champion' },
  { level: 9, xp: 55000, title: 'Master Rep' },
  { level: 10, xp: 80000, title: 'Solar Legend' },
];

// CRM App State
export interface CRMState {
  leads: Lead[];
  activities: LeadActivity[];
  userStats: Record<string, UserStats>;
  currentUserId: string | null;
}

// ============================================
// Customer Management Types
// ============================================

export type CustomerStatus = 'lead' | 'prospect' | 'customer' | 'inactive';

export type InteractionType = 'call' | 'email' | 'sms' | 'note' | 'meeting';

export type InteractionOutcome =
  | 'connected'
  | 'voicemail'
  | 'no_answer'
  | 'not_interested'
  | 'callback_requested'
  | 'appointment_scheduled'
  | 'information_sent'
  | 'follow_up_needed';

export interface CustomerInteraction {
  id: string;
  customerId: string;
  type: InteractionType;
  direction?: 'inbound' | 'outbound';
  subject?: string;
  content: string;
  outcome?: InteractionOutcome;
  duration?: number; // in seconds, for calls
  userId: string;
  userName: string;
  timestamp: string;
  createdAt: string;
}

export interface CRMCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;

  // Solar-specific
  monthlyBill?: number;
  roofType?: 'flat' | 'sloped' | 'metal';
  roofShade?: 'full_sun' | 'partial_shade' | 'heavy_shade';
  homeowner?: boolean;
  systemSize?: number; // kW
  installationDate?: string;

  // CRM fields
  status: CustomerStatus;
  source: LeadSource;
  assignedTo?: string;
  notes: string;
  tags: string[];

  // Dates
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  nextFollowUp?: string;

  // Computed
  totalInteractions?: number;
  dealValue?: number;
}

// Customer data store
export interface CustomerState {
  customers: CRMCustomer[];
  interactions: CustomerInteraction[];
  selectedCustomerId: string | null;
}

// ============================================
// SolarOps Operations - Work Orders & Alerts
// ============================================

// Work Order Types
export type WorkOrderStatus =
  | 'draft'
  | 'triage'
  | 'scheduled'
  | 'in_progress'
  | 'on_site'
  | 'pending_parts'
  | 'review'
  | 'completed'
  | 'billed'
  | 'cancelled';

export type WorkOrderType =
  | 'maintenance'
  | 'repair'
  | 'installation'
  | 'inspection'
  | 'emergency'
  | 'rma'
  | 'warranty';

export interface WorkOrderLineItem {
  id: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  partNumber?: string;
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  customerId: string;
  customerName: string;
  siteAddress: string;

  // Work Order Details
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';

  // Scheduling
  scheduledDate?: string;
  scheduledTime?: string;
  startedAt?: string;
  completedAt?: string;

  // Assignment
  assignedTo?: string;
  assignedTechnician?: string;

  // Financials
  laborHours: number;
  laborRate: number;
  laborCost: number;
  parts: WorkOrderLineItem[];
  partsCost: number;
  totalCost: number;
  revenue: number;
  profit: number;
  profitMargin: number;

  // Details
  description: string;
  resolutionNotes?: string;
  notes: string;

  // SolarEdge
  solarEdgeSiteId?: string;
  inverterSerial?: string;

  // Source
  source: 'manual' | 'alert' | 'customer_call' | 'scheduled' | 'inspection';
  createdFromAlertId?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// SolarEdge Alert Types
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'inverter_offline'
  | 'inverter_error'
  | 'production_drop'
  | 'panel_malfunction'
  | 'optimizer_issue'
  | 'communication_loss'
  | 'maintenance_due'
  | 'warranty_expiring';

export interface SolarEdgeAlert {
  id: string;
  alertId: string;
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;

  // Alert Details
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;

  // Equipment
  inverterSerial?: string;
  panelId?: string;
  optimizerId?: string;

  // Data
  value?: number;
  threshold?: number;
  unit?: string;

  // Status
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;

  // Work Order
  relatedWorkOrderId?: string;
  workOrderCreated: boolean;

  // Timestamps
  occurredAt: string;
  createdAt: string;
}

// Client Profitability Types
export interface ClientProfitability {
  customerId: string;
  customerName: string;
  customerEmail: string;

  // Revenue
  installationRevenue: number;
  serviceRevenue: number;
  maintenanceContracts: number;
  totalRevenue: number;

  // Costs
  customerAcquisitionCost: number;
  hardwareCosts: number;
  laborCosts: number;
  partsCosts: number;
  totalCosts: number;

  // Profitability
  grossProfit: number;
  netProfit: number;
  profitMargin: number;

  // Work Order Stats
  totalWorkOrders: number;
  completedWorkOrders: number;
  openWorkOrders: number;
  avgResolutionTime: number; // hours

  // Client Value
  lifetimeValue: number;
  serviceFrequency: number; // WOs per year

  // Timestamps
  lastServiceDate?: string;
  firstServiceDate?: string;
  calculatedAt: string;
}

// Operations Dashboard Stats
export interface OperationsStats {
  totalWorkOrders: number;
  openWorkOrders: number;
  completedThisMonth: number;
  avgCompletionTime: number;
  totalRevenue: number;
  totalCosts: number;
  totalProfit: number;

  // Alerts
  totalAlerts: number;
  criticalAlerts: number;
  unacknowledgedAlerts: number;

  // By Priority
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;

  // By Type
  maintenanceCount: number;
  repairCount: number;
  inspectionCount: number;
  emergencyCount: number;
}
