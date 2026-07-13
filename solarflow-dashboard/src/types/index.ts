// SolarFlow MVP - Types and Interfaces

export type UserRole = 'admin' | 'technician' | 'coo' | 'support' | 'sales';

/**
 * Granular permits, layered on top of role. Stored in Supabase
 * user_metadata.permissions as an array of granted keys. When a user has no
 * permissions array yet, the defaults are derived from their role (see
 * lib/access.ts) so no backfill migration is required.
 */
export type Permission =
  | 'financials.view'   // billing, rates, payouts, margins
  | 'workorders.edit'   // create/edit work orders
  | 'customers.delete'  // delete customer records
  | 'inventory.manage'  // manage equipment, tools, providers
  | 'users.manage';     // open the User Permissions panel, manage staff

export const ALL_PERMISSIONS: Permission[] = [
  'financials.view',
  'workorders.edit',
  'customers.delete',
  'inventory.manage',
  'users.manage',
];

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  active: boolean;
  username?: string;
  /** Granted permits. Absent = derive from role (see lib/access.ts). */
  permissions?: Permission[];
}

export type CustomerType = 'residential' | 'commercial';

export type CustomerCategory = 'O&M' | 'New Install' | 'Prospect' | 'PowerCare';

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

export type ActivityType = 'note_added' | 'status_changed' | 'job_created' | 'job_completed' | 'info_updated' | 'job_updated';

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  mentions?: string[]; // user IDs of @mentioned users
  reactions?: Record<string, string[]>; // emoji → array of userIds
  // File attachments on this comment (image attachments render as thumbnails).
  attachments?: { id: string; name: string; url: string; mimeType: string }[];
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
  category?: CustomerCategory;
  systemType?: SystemType;
  clientStatus?: ClientStatus;
  createdAt: string;
  updatedAt?: string; // last local edit / push time, drives sync conflict resolution
  notes: string;
  referralSource?: string;
  howFound?: string;
  isPowerCare?: boolean;
  powerCareCaseNumber?: string;   // SolarEdge PowerCare case number
  powerCareTrackingNumber?: string; // UPS tracking number for parts shipment
  powerCareShipDate?: string;      // ISO date when parts shipped
  powerCareETA?: string;           // ISO date estimated arrival
  powercarePOD?: string;           // ISO date proof of delivery
  powerCareDeliveryStatus?: 'pending' | 'delivered' | 'error'; // UPS sync status
  powerCareLastStatusCheck?: number; // timestamp of last UPS API call
  activityHistory?: Activity[];
  files?: CustomerFile[];
  solarEdgeSiteId?: string; // SolarEdge site ID for cross-referencing
  trelloBackupUrl?: string; // Trello board backup link (from column B hyperlinks)
}

export interface CustomerFile {
  id: string;
  name: string;
  url: string;        // authenticated URL, ready to use in <img src> or <a href>
  mimeType: string;
  size?: number;
  source: 'trello' | 'upload';
  createdAt: string;
}

export type ServiceType = string;

export type JobStatus = 'new' | 'assigned' | 'in_progress' | 'completed' | 'invoiced' | 'paid' | 'archived';
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

// Extended Work Order status (superset of JobStatus, drives the WO Panel workflow)
export type WOStatus =
  | 'draft'
  | 'quote_sent'
  | 'contact_client'   // PowerCare: skip approval, go straight to scheduling
  | 'quote_approved'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'invoiced'
  | 'paid';

// Maps WOStatus → JobStatus so existing Kanban/billing views stay in sync
export const WO_TO_JOB_STATUS: Record<WOStatus, JobStatus> = {
  draft:          'new',
  quote_sent:     'new',
  contact_client: 'new',           // PowerCare: pre-execution, treated as new
  quote_approved: 'new',
  scheduled:      'assigned',
  in_progress:    'in_progress',
  completed:      'completed',
  invoiced:       'invoiced',
  paid:           'paid',
};

export interface WOLineItem {
  id: string;
  type: 'labor' | 'part' | 'other';
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  partNumber?: string;
  // Warranty / RMA tracking (parts only)
  isWarrantyPart?: boolean;
  manufacturer?: string;        // e.g. 'SolarEdge', 'Enphase'
  rmaNumber?: string;           // RMA # from manufacturer
  caseNumber?: string;          // Support case # from manufacturer
  seCompAmount?: number;        // SE Compensation amount for this part
}

export type WOServiceStatus =
  | 'fully_operational'
  | 'partially_operational'
  | 'pending_parts'
  | 'could_not_complete';

export interface WOPhoto {
  id: string;
  category:
    | 'before' | 'after' | 'serial' | 'process' | 'parts'
    | 'progress' | 'ppe' | 'voltage'
    | 'old_serial' | 'string_voltage'
    | 'cabinet_old' | 'cabinet_new' | 'new_serial' | 'inv_overview';
  name: string;
  /**
   * Inline data URL. Optional after migration: when `photoStoreId` is set, the
   * binary lives in IndexedDB and dataUrl may be empty. Renderers should call
   * `hydrateWoPhotos()` from `lib/photoStore` to materialize a displayable URL.
   */
  dataUrl: string;
  /** ID of the row in the local photoStore (IndexedDB). Set after migration. */
  photoStoreId?: string;
  /** Public Supabase Storage URL. When set, use this instead of dataUrl for display. */
  storageUrl?: string;
  /** MIME type; set for non-image attachments (e.g. application/pdf). Absent = image. */
  mimeType?: string;
  createdAt: string;
}

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
  updatedAt?: string; // last local edit / push time, drives sync conflict resolution
  // Per-field last-edit times (ISO) for field-level sync merge. Records without
  // this fall back to record-level LWW via updatedAt, so old data is unaffected.
  // See spec_job_field_level_merge: enables a stale client's unrelated edit to
  // stop clobbering another client's change to a different field.
  fieldTimes?: Record<string, string>;
  urgency: UrgencyLevel;
  isPowercare: boolean;
  contractorId?: string;
  description?: string;
  priority?: UrgencyLevel;
  date?: string;
  clientId?: string; // US-1XXXX format
  // ── Work Order Panel extended fields ──────────────────────────────────
  woStatus?: WOStatus;
  // On Hold is an orthogonal flag, NOT a status value: it parks an order so it
  // drops out of the active queue on both the admin and contractor side without
  // losing its underlying woStatus/stage. Clearing it (resume) restores the
  // order to its prior place in the pipeline.
  onHold?: boolean;
  onHoldAt?: string;
  // Set when a contractor proposes their own service date/time from the portal.
  // The proposal now auto-confirms the appointment (see scheduleConfirmedAt).
  contractorScheduleProposedAt?: string;
  // Set when a proposed service date is auto-confirmed (the contractor's date
  // becomes the booked appointment, the client is notified, no manual office
  // confirmation step). Display/audit only.
  scheduleConfirmedAt?: string;
  woNumber?: string;                        // e.g. WO-2603-00042
  solarEdgeSiteId?: string;
  solarEdgeClientId?: string;               // US-15XXX
  siteAddress?: string;
  clientName?: string;
  // Quote
  quoteAmount?: number;
  quoteSentAt?: string;
  quoteApprovedAt?: string;
  // Contractor queue
  contractorPayRate?: number;
  contractorPayUnit?: 'hour' | 'flat';
  contractorSentAt?: string;
  /** Raw live status from the contractor portal (assigned | en_route | in_progress |
   *  documentation | completed | ...). Mirrored from ContractorJob so the staff board
   *  can distinguish "on route" from "in progress", which both collapse to in_progress
   *  in the coarse `status`. */
  contractorJobStatus?: string;
  // Parts & labor line items (richer than flat laborHours/partsCost)
  lineItems?: WOLineItem[];
  // Photos (structured, replaces flat string[] for WO-panel jobs)
  woPhotos?: WOPhoto[];
  /**
   * Photo-URL stems (photoUrlStem) the admin explicitly deleted from woPhotos.
   * The contractor->admin photo reconciles skip any stem listed here, so a
   * deleted contractor photo (or a cleaned-up duplicate) can never be
   * re-imported from cj.photos, which has no delete tombstones of its own.
   */
  deletedPhotoStems?: string[];
  // Service report
  serviceReport?: string;
  serviceStatus?: WOServiceStatus;
  requiresFollowUp?: boolean;
  nextSteps?: string;
  jobCompletion?: number; // 0-100 percent
  // SE Compensation tracking
  seCompensationEligible?: boolean;
  seCompensationAmount?: number;       // total SE comp claimable for this WO
  seCompensationClaimed?: boolean;
  seCompensationClaimedAt?: string;
  // Service account expense (internal, requires admin approval)
  isServiceAccountExpense?: boolean;
  requiresAdminApproval?: boolean;
  adminApprovedAt?: string;
  adminApprovedBy?: string;
  serviceCode?: string;
  isRecurringClient?: boolean;
  discountType?: 'repeating_client' | 'military' | 'friends_family';
  // RMA tracking (top-level, separate from line-item rmaNumber)
  rmaEntries?: RMAEntry[];
  // Serial number tracking (inverter / optimizer swaps)
  oldSerialNumber?: string;
  newSerialNumber?: string;
  snSyncScheduledAt?: string;   // ISO timestamp, SolarEdge API update due by +2h
  snSyncCompletedAt?: string;
  // Travel
  travelMiles?: number;
  // Audit trail
  auditLog?: AuditEntry[];
  // Team comments & activity (mirrors Customer.activityHistory)
  activityHistory?: Activity[];
  // Billing timeline
  invoicedAt?: string;
  clientPaymentDueAt?: string;         // invoicedAt + 14 days
  clientPaidAt?: string;
  /** Set when contractor pay + expenses for this SO are covered (last billing
   *  kanban column). Job stays status 'paid'; this only closes the money loop. */
  costsCoveredAt?: string;
  lateFee1AppliedAt?: string;          // 14 days after invoicedAt
  lateFee1Amount?: number;
  lateFee2AppliedAt?: string;          // 21 days after invoicedAt
  lateFee2Amount?: number;
  serviceDisconnectWarningAt?: string;
  contractorPayDelayBonusAt?: string;  // 14 days after completedAt
  contractorPayDelayBonusAmount?: number;
  contractorAutoPayAt?: string;        // 28 days after completedAt
  archivedAt?: string;                 // ISO timestamp when archived
  // Site Transfer fields
  siteTransferInverterSerial?: string; // Inverter serial # for ownership transfer
  siteTransferSiteId?: string;         // SolarEdge Site ID for ownership transfer

  // ── Contractor-entered fields mirrored onto the single source (Phase D) ──────
  // So data.jobs holds the COMPLETE work-order record (parts, signatures,
  // contractor invoice/billing, mileage). These are the durable, per-record-
  // synced, audit-logged home for what the contractor enters, letting the
  // contractor view become a pure projection with no separate store to diverge.
  contractorParts?: { id: string; name: string; partNumber: string; quantity: number; unitPrice: number; totalPrice: number }[];
  contractorPartsAmount?: number;
  contractorLaborAmount?: number;
  markupPercent?: number;
  clientSignature?: string;
  signatureDate?: string;
  contractorInvoiceId?: string;
  contractorInvoiceStatus?: string;
  contractorInvoiceSentAt?: string;
  contractorInvoiceNumber?: string;
  mileageCost?: number;
  mileageCharge?: number;
  contractorPaymentStatus?: string;
  contractorTotalPay?: number;
  assignedAt?: string;
}

export type RMAStatus = 'processes' | 'eligible' | 'not_eligible' | 'submitted' | 'shipped' | 'paid';

export interface RMAEntry {
  id: string;
  manufacturer: string;
  partDescription: string;
  rmaNumber: string;
  caseNumber?: string;
  /** @deprecated Use rmaStatus instead */
  status: 'pending' | 'approved' | 'received' | RMAStatus;
  rmaStatus?: RMAStatus;
  compensationCollected?: boolean;
  compensationCollectedAt?: string;
  compensationAmount?: number;
  createdAt: string;
  createdBy: string;
  /** Work order this RMA links to. Absent on standalone RMAs (shown with a red "No work order" flag). */
  linkedJobId?: string;
  /** Last edit time, used to resolve sync merges of standalone RMAs. */
  updatedAt?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  userName: string;
  userId?: string;
  action: string;   // e.g. 'updated', 'created', 'deleted', 'status_changed'
  details: string;  // human-readable summary of what changed
}

export interface XeroConfig {
  connected: boolean;
  organizationName?: string;
  tenantId?: string;
}

export interface SolarEdgeConfig {
  apiKey: string;
  lastSync?: string;
  siteCount?: number;
  // Rate-limit tracking (SolarEdge allows 300 calls/day)
  nextSyncAllowed?: string; // ISO datetime, earliest allowed next manual sync
  dailyCallCount?: number;  // API calls made on dailyCallDate
  dailyCallDate?: string;   // YYYY-MM-DD UTC date for daily counter reset
}

/** A SolarEdge site record fetched live from the API and stored in AppState */
export interface SolarEdgeExtraSite {
  siteId: string;
  clientId: string;
  siteName: string;
  address: string;
  status: string;
  peakPower: number;
  installDate: string;
  ptoDate: string;
  alerts: number;
  highestImpact: string;
  systemType: string;
  module: string;
  todayKwh: number;
  monthKwh: number;
  yearKwh: number;
  lifetimeKwh: number;
  lastUpdate: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'contractor_completed' | 'late_fee_1' | 'late_fee_2' | 'contractor_autopay' | 'service_disconnect' | 'mention';
  title: string;
  message: string;
  relatedJobId?: string;
  relatedContractorId?: string;
  relatedCustomerId?: string;
  read: boolean;
  createdAt: string;
}

export interface AppState {
  users: User[];
  customers: Customer[];
  jobs: Job[];
  xeroConfig: XeroConfig;
  solarEdgeConfig: SolarEdgeConfig;
  currentUser: User | null;
  notifications: AppNotification[];
  /** Sites pulled from the API that are not in the static FL_SITES list */
  solarEdgeExtraSites?: SolarEdgeExtraSite[];
  /** RMAs created outside a work order (red-flagged as unlinked). Synced as a KV blob. */
  standaloneRmas?: RMAEntry[];
}

// Inventory Types
export type InventoryCategory = 'panel' | 'optimizer' | 'inverter' | 'cable' | 'racking' | 'label' | 'battery' | 'bos';
export type ToolCategory = 'drill' | 'ladder' | 'crimper' | 'ppe' | 'tester' | 'other';
export type UnitOfMeasure = 'unit' | 'feet' | 'meters' | 'box' | 'roll';
export type ToolStatus = 'available' | 'in_use' | 'broken' | 'lost';

export interface InventoryItem {
  id: string;
  sku: string;
  partNumber?: string;   // manufacturer / supplier part number
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
  imageUrl?: string;
  /** Receiving / provenance history, each delivery into stock with its proof image and optional RMA match. */
  receipts?: StockReceipt[];
}

/** A single receiving event into stock: provenance image (invoice / RMA label) + optional RMA match. */
export interface StockReceipt {
  id: string;
  receivedAt: string;            // ISO timestamp
  quantity: number;              // units received in this delivery
  location?: string;             // warehouse location the delivery went to (composed label)
  contractorId?: string;         // when location = a contractor
  alarmBadge?: string;           // when location = pickup: alarm badge / access code
  provenanceImage?: string;      // data URL or URL of the invoice / RMA label photo
  provenanceType?: 'invoice' | 'rma_label' | 'other';
  rmaEntryId?: string;           // linked open RMA entry, if this delivery fulfills one
  rmaNumber?: string;
  jobId?: string;                // the work order the linked RMA belongs to
  note?: string;
  receivedBy?: string;
  /** Set when an admin edits this receipt after the fact. */
  editedAt?: string;
  editedBy?: string;
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
  imageUrl?: string;
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
  | 'solaredge'
  | 'customer_referral'
  | 'contractor_referral'
  | 'marketing'
  | 'google'
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
  leadType?: 'service' | 'sales';
  customSource?: string; // for user-defined sources beyond the predefined list

  // File attachments
  attachments?: CRMAttachment[];

  // Trello link
  trelloBackupUrl?: string;

  // Powercare flag
  isPowercare?: boolean;
  powercareCaseNumber?: string;
  powercareTracking?: string;
  powercareTracking2?: string;
  powercareShipDate?: string;   // ISO date string
  powercareEta?: string;         // ISO date string
  powercarePod?: string;         // ISO date string (proof of delivery)
  powercareRmaNumber?: string;       // manufacturer RMA # (if issued)
  powercareOldPart?: string;         // failed part number
  powercareOldSerial?: string;       // failed part serial (inverter/optimizer)
  powercareShippedPart?: string;     // replacement part number shipped
  powercareShippedSerial?: string;   // replacement part serial shipped

  // Conversion tracking
  convertedCustomerId?: string; // Customer.id this lead was converted to
  clientId?: string;            // US-1XXXX client number for display
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

export type InteractionType = 'call' | 'email' | 'sms' | 'note' | 'meeting' | 'quote';

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
  isPowercare?: boolean;
  solarEdgeSiteId?: string; // e.g. us_1xxxxxx

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

  // File attachments
  attachments?: CRMAttachment[];
}

export interface CRMAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
  createdAt: string;
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
