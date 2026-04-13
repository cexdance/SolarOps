# SolarOps - Project Specification for Claude Code

## Project Overview

**Project Name**: SolarOps (formerly SolarFlow)
**Type**: Solar Operations Management Web Application
**Description**: A unified platform for solar companies to manage sales CRM, customer interactions, work orders, SolarEdge monitoring alerts, and client profitability tracking.
**Tech Stack**: React 18, TypeScript, Vite, TailwindCSS, Lucide React Icons, Recharts

---

## 1. Environment Configuration

### Environment Variables (.env)
```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_SOLAREDGE_API_KEY=your_solaredge_api_key
VITE_XERO_CLIENT_ID=your_xero_client_id
```

### Theme Configuration
- **Primary**: Orange (`#f59e0b` / Amber-500) - Solar energy theme
- **Secondary**: Slate (`#0f172a` / Slate-900) - Professional dark
- **Background**: Slate-50 (`#f8fafc`)
- **Success**: Green (`#22c55e`)
- **Danger**: Red (`#ef4444`)
- **Warning**: Yellow (`#eab308`)

---

## 2. Core Data Types

### CRMCustomer (Customer Management)
```typescript
interface CRMCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  monthlyBill?: number;
  roofType?: 'flat' | 'sloped' | 'metal';
  roofShade?: 'full_sun' | 'partial_shade' | 'heavy_shade';
  homeowner?: boolean;
  systemSize?: number; // kW
  installationDate?: string;
  status: CustomerStatus;
  source: LeadSource;
  assignedTo?: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  nextFollowUp?: string;
  totalInteractions?: number;
  dealValue?: number;
}

type CustomerStatus = 'lead' | 'prospect' | 'customer' | 'inactive';
type LeadSource = 'google_forms' | 'website' | 'referral' | 'cold_call' | 'social_media' | 'advertising' | 'partner' | 'other';
```

### Customer Interaction
```typescript
interface CustomerInteraction {
  id: string;
  customerId: string;
  type: InteractionType;
  direction?: 'inbound' | 'outbound';
  subject?: string;
  content: string;
  outcome?: InteractionOutcome;
  duration?: number; // seconds
  userId: string;
  userName: string;
  timestamp: string;
  createdAt: string;
}

type InteractionType = 'call' | 'email' | 'sms' | 'note' | 'meeting';
type InteractionOutcome = 'connected' | 'voicemail' | 'no_answer' | 'not_interested' | 'callback_requested' | 'appointment_scheduled' | 'information_sent' | 'follow_up_needed';
```

### Work Order
```typescript
interface WorkOrder {
  id: string;
  woNumber: string;
  customerId: string;
  customerName: string;
  siteAddress: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scheduledDate?: string;
  scheduledTime?: string;
  startedAt?: string;
  completedAt?: string;
  assignedTo?: string;
  assignedTechnician?: string;
  laborHours: number;
  laborRate: number;
  laborCost: number;
  parts: WorkOrderLineItem[];
  partsCost: number;
  totalCost: number;
  revenue: number;
  profit: number;
  profitMargin: number;
  description: string;
  resolutionNotes?: string;
  notes: string;
  solarEdgeSiteId?: string;
  inverterSerial?: string;
  source: 'manual' | 'alert' | 'customer_call' | 'scheduled' | 'inspection';
  createdFromAlertId?: string;
  createdAt: string;
  updatedAt: string;
}

type WorkOrderStatus = 'draft' | 'triage' | 'scheduled' | 'in_progress' | 'on_site' | 'pending_parts' | 'review' | 'completed' | 'billed' | 'cancelled';
type WorkOrderType = 'maintenance' | 'repair' | 'installation' | 'inspection' | 'emergency' | 'rma' | 'warranty';
```

### SolarEdge Alert
```typescript
interface SolarEdgeAlert {
  id: string;
  alertId: string;
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  inverterSerial?: string;
  panelId?: string;
  optimizerId?: string;
  value?: number;
  threshold?: number;
  unit?: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  relatedWorkOrderId?: string;
  workOrderCreated: boolean;
  occurredAt: string;
  createdAt: string;
}

type AlertSeverity = 'info' | 'warning' | 'critical';
type AlertType = 'inverter_offline' | 'inverter_error' | 'production_drop' | 'panel_malfunction' | 'optimizer_issue' | 'communication_loss' | 'maintenance_due' | 'warranty_expiring';
```

### Client Profitability
```typescript
interface ClientProfitability {
  customerId: string;
  customerName: string;
  customerEmail: string;
  installationRevenue: number;
  serviceRevenue: number;
  maintenanceContracts: number;
  totalRevenue: number;
  customerAcquisitionCost: number;
  hardwareCosts: number;
  laborCosts: number;
  partsCosts: number;
  totalCosts: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  totalWorkOrders: number;
  completedWorkOrders: number;
  openWorkOrders: number;
  avgResolutionTime: number; // hours
  lifetimeValue: number;
  serviceFrequency: number;
  lastServiceDate?: string;
  firstServiceDate?: string;
  calculatedAt: string;
}
```

### Lead (Sales CRM)
```typescript
interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  monthlyBill?: number;
  roofType?: 'flat' | 'sloped' | 'metal';
  roofShade?: 'full_sun' | 'partial_shade' | 'heavy_shade';
  homeowner?: boolean;
  status: LeadStatus;
  source: LeadSource;
  priority: LeadPriority;
  score: number;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  lastContactAt?: string;
  nextFollowUp?: string;
  notes: string;
  description?: string;
  trelloBackupUrl?: string;
}

type LeadStatus = 'new' | 'attempting' | 'connected' | 'appointment' | 'qualified' | 'proposal' | 'closed_won' | 'closed_lost' | 'not_interested';
type LeadPriority = 'low' | 'medium' | 'high' | 'urgent';
```

### User Stats (Gamification)
```typescript
interface UserStats {
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

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

const LEVEL_THRESHOLDS = [
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

const XP_ACTIONS = {
  call_made: 10,
  email_sent: 5,
  note_added: 5,
  appointment_set: 150,
  proposal_sent: 100,
  deal_closed: 500,
  streak_bonus: 50,
};
```

---

## 3. Integrations

### SolarEdge Integration
- **API Key**: Stored in SolarEdgeConfig
- **Features**:
  - Fetch site data (production, status)
  - Receive alerts (inverter offline, errors, production drops)
  - Link sites to customers via solarEdgeSiteId
- **Config**: `{ apiKey: string, lastSync?: string, siteCount?: number }`

### Xero Integration (Billing)
- **OAuth2** flow for accounting
- **Features**:
  - Invoice creation
  - Payment tracking
  - Contact sync
- **Config**: `{ connected: boolean, organizationName?: string, accessToken?: string, refreshToken?: string, expiresAt?: string }`

---

## 4. Example Client Data (One Client)

### Example: John Smith Residence

```json
{
  "customer": {
    "id": "cust-001",
    "firstName": "John",
    "lastName": "Smith",
    "email": "john.smith@email.com",
    "phone": "(555) 123-4567",
    "address": "123 Sunshine Lane",
    "city": "Phoenix",
    "state": "AZ",
    "zip": "85001",
    "monthlyBill": 250,
    "roofType": "sloped",
    "roofShade": "full_sun",
    "homeowner": true,
    "systemSize": 8.5,
    "installationDate": "2024-03-15",
    "status": "customer",
    "source": "referral",
    "assignedTo": "user-1",
    "notes": "Excellent roof orientation. Referred by neighbor.",
    "tags": ["residential", "referral", "priority"],
    "createdAt": "2024-01-10T10:00:00Z",
    "updatedAt": "2024-06-20T14:30:00Z",
    "lastContactAt": "2024-06-15T09:00:00Z",
    "nextFollowUp": "2024-07-15",
    "totalInteractions": 12,
    "dealValue": 22000
  },
  "interactions": [
    {
      "id": "int-001",
      "customerId": "cust-001",
      "type": "call",
      "direction": "outbound",
      "subject": "Follow-up call",
      "content": "Discussed system performance and answered questions about monitoring app.",
      "outcome": "connected",
      "duration": 300,
      "userId": "user-1",
      "userName": "Cesar",
      "timestamp": "2024-06-15T09:00:00Z",
      "createdAt": "2024-06-15T09:05:00Z"
    },
    {
      "id": "int-002",
      "customerId": "cust-001",
      "type": "email",
      "direction": "outbound",
      "subject": "System Welcome",
      "content": "Welcome to SolarOps! Here's your system documentation.",
      "outcome": "information_sent",
      "userId": "user-1",
      "userName": "Cesar",
      "timestamp": "2024-03-20T10:00:00Z",
      "createdAt": "2024-03-20T10:00:00Z"
    },
    {
      "id": "int-003",
      "customerId": "cust-001",
      "type": "meeting",
      "direction": "outbound",
      "subject": "Installation Day",
      "content": "Scheduled installation for March 15th.",
      "outcome": "appointment_scheduled",
      "userId": "user-1",
      "userName": "Cesar",
      "timestamp": "2024-02-28T14:00:00Z",
      "createdAt": "2024-02-28T14:05:00Z"
    }
  ],
  "workOrders": [
    {
      "id": "wo-001",
      "woNumber": "WO-24001",
      "customerId": "cust-001",
      "customerName": "John Smith",
      "siteAddress": "123 Sunshine Lane, Phoenix, AZ 85001",
      "type": "installation",
      "status": "billed",
      "priority": "high",
      "scheduledDate": "2024-03-15",
      "scheduledTime": "08:00",
      "startedAt": "2024-03-15T07:30:00Z",
      "completedAt": "2024-03-15T16:00:00Z",
      "assignedTechnician": "Mike Johnson",
      "laborHours": 8,
      "laborRate": 85,
      "laborCost": 680,
      "parts": [
        { "id": "p1", "description": "8.5kW Panel Kit", "quantity": 1, "unitCost": 8500, "totalCost": 8500 },
        { "id": "p2", "description": "Inverter", "quantity": 1, "unitCost": 2500, "totalCost": 2500 }
      ],
      "partsCost": 11000,
      "totalCost": 11680,
      "revenue": 22000,
      "profit": 10320,
      "profitMargin": 46.9,
      "description": "8.5kW residential installation",
      "resolutionNotes": "Installation complete. System performing at 100% capacity.",
      "notes": "Customer very satisfied. Referrals expected.",
      "solarEdgeSiteId": "SE-123456",
      "source": "manual",
      "createdAt": "2024-02-01T10:00:00Z",
      "updatedAt": "2024-03-20T10:00:00Z"
    },
    {
      "id": "wo-002",
      "woNumber": "WO-24015",
      "customerId": "cust-001",
      "customerName": "John Smith",
      "siteAddress": "123 Sunshine Lane, Phoenix, AZ 85001",
      "type": "maintenance",
      "status": "scheduled",
      "priority": "low",
      "scheduledDate": "2024-09-15",
      "scheduledTime": "10:00",
      "assignedTechnician": "Tom Wilson",
      "laborHours": 1,
      "laborRate": 85,
      "laborCost": 85,
      "parts": [],
      "partsCost": 0,
      "totalCost": 85,
      "revenue": 0,
      "profit": -85,
      "profitMargin": 0,
      "description": "6-month maintenance check",
      "notes": "Routine maintenance",
      "solarEdgeSiteId": "SE-123456",
      "source": "scheduled",
      "createdAt": "2024-06-01T10:00:00Z",
      "updatedAt": "2024-06-01T10:00:00Z"
    }
  ],
  "alerts": [
    {
      "id": "alert-001",
      "alertId": "SE-789012",
      "siteId": "SE-123456",
      "siteName": "Smith Residence",
      "customerId": "cust-001",
      "customerName": "John Smith",
      "type": "maintenance_due",
      "severity": "info",
      "title": "Maintenance Due",
      "description": "6-month maintenance check is due",
      "acknowledged": true,
      "acknowledgedBy": "Cesar",
      "acknowledgedAt": "2024-06-01T11:00:00Z",
      "resolved": false,
      "workOrderCreated": true,
      "relatedWorkOrderId": "wo-002",
      "occurredAt": "2024-06-01T08:00:00Z",
      "createdAt": "2024-06-01T08:00:00Z"
    }
  ],
  "profitability": {
    "customerId": "cust-001",
    "customerName": "John Smith",
    "customerEmail": "john.smith@email.com",
    "installationRevenue": 22000,
    "serviceRevenue": 0,
    "maintenanceContracts": 0,
    "totalRevenue": 22000,
    "customerAcquisitionCost": 1500,
    "hardwareCosts": 11000,
    "laborCosts": 680,
    "partsCosts": 0,
    "totalCosts": 13180,
    "grossProfit": 11000,
    "netProfit": 8820,
    "profitMargin": 40.1,
    "totalWorkOrders": 2,
    "completedWorkOrders": 1,
    "openWorkOrders": 1,
    "avgResolutionTime": 8.5,
    "lifetimeValue": 8820,
    "serviceFrequency": 2,
    "lastServiceDate": "2024-03-15",
    "firstServiceDate": "2024-03-15",
    "calculatedAt": "2024-06-20T00:00:00Z"
  }
}
```

---

## 5. File Structure

```
solarflow-dashboard/
├── src/
│   ├── components/
│   │   ├── CRMDashboard.tsx       # Sales CRM with gamification
│   │   ├── CustomerManagement.tsx # Customer interactions
│   │   ├── Operations.tsx          # Work orders, alerts, profitability
│   │   ├── Dashboard.tsx
│   │   ├── Jobs.tsx
│   │   ├── Customers.tsx           # Legacy customers
│   │   ├── Billing.tsx
│   │   ├── InventoryModule.tsx
│   │   ├── Settings.tsx
│   │   ├── TechnicianView.tsx
│   │   ├── ContractorRegistration.tsx
│   │   └── contractor/
│   │       ├── ContractorApprovals.tsx
│   │       ├── ContractorDashboard.tsx
│   │       ├── ContractorRegister.tsx
│   │       ├── JobDetail.tsx
│   │       └── RateManagement.tsx
│   ├── lib/
│   │   ├── crmStore.ts            # CRM data & leads
│   │   ├── customerStore.ts       # Customer & interactions
│   │   ├── operationsStore.ts    # Work orders, alerts, profitability
│   │   ├── contractorStore.ts    # Contractor management
│   │   ├── dataStore.ts          # Legacy data
│   │   └── dashboardData.ts
│   ├── types/
│   │   ├── index.ts              # All type definitions
│   │   ├── contractor.ts
│   │   └── dashboard.ts
│   ├── hooks/
│   │   └── use-mobile.tsx
│   ├── App.tsx                   # Main app with routing
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 6. Navigation Structure

| ID | Label | Component |
|----|-------|-----------|
| crm | Sales CRM | CRMDashboard.tsx |
| customers2 | Customers | CustomerManagement.tsx |
| operations | Operations | Operations.tsx |
| dashboard | Dashboard | Dashboard.tsx |
| jobs | Work Orders | Jobs.tsx |
| customers | Legacy | Customers.tsx |
| billing | Billing | Billing.tsx |
| technician | Manage WORK ORDERS | TechnicianView.tsx |
| contractors | Contractors | ContractorApprovals.tsx |
| contractor-billing | Contractor Pay | BillingModule.tsx |
| inventory | Inventory | InventoryModule.tsx |
| rates | Service Rates | RateManagement.tsx |
| settings | Settings | Settings.tsx |

---

## 7. Login Credentials

- **Admin**: `cesar.jurado@conexsol.us` / `1357`
- **Demo Users**: Various in User array

---

## 8. Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## 9. Features Summary

### Sales CRM (Gamified)
- Smart lead queue with priority scoring
- XP points system for sales reps
- Level progression (Rookie → Solar Legend)
- Streak tracking
- Leaderboard
- Kanban-style pipeline

### Customer Management
- 360° customer view
- Interaction tracking (calls, emails, SMS, notes, meetings)
- Activity timeline
- Status management (lead → prospect → customer)

### Operations
- Work order lifecycle management
- Financial tracking (labor, parts, revenue, profit)
- Priority-based scheduling
- Source tracking (manual, alert, scheduled)

### SolarEdge Alerts
- Alert dashboard with severity levels
- Acknowledge/resolve workflow
- Link alerts to work orders

### Client Profitability
- Revenue tracking (installation, service)
- Cost tracking (CAC, hardware, labor, parts)
- Profit margin calculation
- Problem client identification

---

## 10. Claude Code Instructions

When working with this project:

1. **Run locally**: `npm install && npm run dev`
2. **Add new features**: Create components in `src/components/`, add types in `src/types/index.ts`, add data logic in `src/lib/`
3. **Testing**: Ensure build passes with `npm run build`
4. **Styling**: Use TailwindCSS classes only (no custom CSS)
5. **Icons**: Use Lucide React icons

---

*Last Updated: 2024-06*
