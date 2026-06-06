# SolarOps - UI/UX Screen Map

Global view of every screen in the SolarOps app. Built for agents that need a complete mental model of the UI.

Architecture note: this is a **single-page app with view-state routing**, not URL routing. The active screen is held in `currentView` (App.tsx, persisted to `localStorage['solarflow_current_view']`). A big `switch(currentView)` in App.tsx renders the matching component. Navigation comes from the left sidebar (`Layout.tsx` `allNavItems`). Auth screens render before the app shell. Contractors get a completely separate shell.

Entry: `solarflow-dashboard/src/App.tsx` -> `Layout.tsx` (shell) -> view components in `solarflow-dashboard/src/components/`.

---

## 1. Pre-app / Auth screens (rendered before the shell)

| Screen | Component | File | Trigger |
|---|---|---|---|
| Staff Login | `LoginScreen` | App.tsx (inline) / `components/auth/LoginScreen.tsx` | Not authenticated, staff mode |
| Forgot Password | `LoginScreen` (showForgot state) | App.tsx | "Forgot password?" |
| Reset Password | `ResetPasswordScreen` | App.tsx | URL `/reset-password` or recovery token |
| Force Change Password | `ForceChangePasswordScreen` | App.tsx | `mustChangePassword` flag after first login |
| Contractor Login | `ContractorLoginScreen` | `components/contractor/ContractorLoginScreen.tsx` | `?mode=contractor` / Contractor Portal link |
| Contractor Register | `ContractorRegister` | `components/contractor/ContractorRegister.tsx` | "Register" from contractor login |
| Contractor Invite Accept | `ContractorInvite` | `components/contractor/ContractorInvite.tsx` | URL `?invite=<token>` |
| Pending Approval | `PendingApprovalScreen` | App.tsx | Contractor logged in, status = pending |
| ConexSol Terms | `ConexSolTerms` | `components/contractor/ConexSolTerms.tsx` | Onboarding terms step |

---

## 2. Staff app screens (sidebar nav -> `currentView`)

Sidebar source: `Layout.tsx` `allNavItems`. `roles` controls visibility. Indented items have a `parent`.

| Nav label | view id | Component | File | Roles |
|---|---|---|---|---|
| Ops Center | `dispatch` | `DispatchDashboard` | DispatchDashboard.tsx | admin, coo, technician, support |
| Dashboard | `dashboard` | `Dashboard` | Dashboard.tsx | admin, coo, technician, support |
| Customers | `customers` | `Customers` | Customers.tsx | admin, coo, technician, support |
| -- Lead Lobby | `lobby` | `LeadLobby` | LeadLobby.tsx | admin, coo, support, sales |
| -- SolarEdge Sites | `solaredge` | `SolarEdgeMonitoring` | SolarEdgeMonitoring.tsx | admin, coo, support |
| Work Orders | `jobs` | `Jobs` | Jobs.tsx | admin, coo, technician, support |
| RMA Tracker | `rma` | `RMADashboard` | RMADashboard.tsx | admin, coo, support |
| Billing | `billing` | `Billing` | Billing.tsx | admin |
| -- Contractor Pay | `contractor-billing` | `BillingModule` | admin/BillingModule.tsx | admin |
| -- Service Rates | `rates` | `RateManagement` | contractor/RateManagement.tsx | admin |
| Contractors | `contractors` | `ContractorApprovals` | contractor/ContractorApprovals.tsx | admin, coo, support |
| New Install | `projects` | `SolarProjects` | SolarProjects.tsx | admin, coo, support |
| Inventory | `inventory` | `InventoryModule` | InventoryModule.tsx | admin, coo, support |
| Settings | `settings` | `Settings` | Settings.tsx | admin, coo, support |
| Sales CRM | `crm` | `CRMDashboard` | CRMDashboard.tsx | sales |
| Clients | `customers2` | `CustomerManagement` | CustomerManagement.tsx | sales |

### Views reachable by drill-down (not in sidebar)

| view id | Component | Reached from |
|---|---|---|
| `jobDetail` | `JobDetail` / `WorkOrderPanel` | Click a work order |
| `technician` | `TechnicianView` | Technician role / dispatch |
| `operations` | `Operations` | Internal nav |
| `my-jobs` | `ContractorDashboard` | Dual-role staff viewing contractor jobs |

---

## 3. Contractor portal (separate shell, `isContractorMode`)

When `isContractorMode && currentContractor`, App.tsx bypasses the staff Layout entirely.

| Screen | Component | Notes |
|---|---|---|
| Contractor Dashboard | `ContractorDashboard` | Single job-list view. Timeframe tabs: Day / Week / Month / YTD. Status chips: All / Queue / En Route / In Progress / Completed / On Hold |
| Contractor Job Detail | `components/contractor/JobDetail.tsx` | Opens when a job is tapped; photo capture, parts, signature, completion |

---

## 4. Settings sub-panels (admin)

Rendered inside `Settings.tsx`:

- `UserPermissionsPanel` (admin/UserPermissionsPanel.tsx) - user roles/permissions
- `UserActivityLog` (admin/UserActivityLog.tsx) - audit trail
- `LogViewer` (admin/LogViewer.tsx) - change log viewer
- `PhotoCleanupCard` (admin/PhotoCleanupCard.tsx) - storage cleanup

---

## 5. Major modals / panels (overlays, not standalone views)

| Component | File | Opened from |
|---|---|---|
| `WorkOrderPanel` | WorkOrderPanel.tsx (largest, 180KB) | Work order detail / 8-stage pipeline |
| `SiteProfilePanel` | SiteProfilePanel.tsx | SolarEdge site click |
| `WorkOrderCalendar` | WorkOrderCalendar.tsx | Scheduling view |
| `BillingReportModal` | BillingReportModal.tsx | Billing |
| `QuotePreviewModal` | QuotePreviewModal.tsx | Quotes |
| `SolarEdgeImportModal` | SolarEdgeImportModal.tsx | SolarEdge import |
| `SowDistributionModal` | SowDistributionModal.tsx | SOW report distribution |
| `RmaCreateModal` | RmaCreateModal.tsx | RMA Tracker |
| `MonitoringColumnPicker` | MonitoringColumnPicker.tsx | SolarEdge monitoring |
| `ProjectInstallationSection` | ProjectInstallationSection.tsx | New Install project |
| `ProjectPartsSection` | ProjectPartsSection.tsx | New Install project |
| `MentionsWidget` | MentionsWidget.tsx | @mentions notifications |
| `StorageWarningBanner` | StorageWarningBanner.tsx | Global (localStorage quota) |
| `SyncStatusIndicator` / `SyncStatusToast` | SyncStatusIndicator.tsx | Global sync feedback |

---

## 6. Role -> screen access summary

- **admin**: full access (all nav items + billing + settings + admin panels)
- **coo**: same as admin minus Billing/Contractor Pay/Service Rates
- **support**: ops + customers + work orders + RMA + contractors + inventory + settings
- **technician**: Ops Center, Dashboard, Customers, Work Orders (field-focused)
- **sales**: Sales CRM + Clients + Lead Lobby only
- **contractor**: separate portal (dashboard + job detail), no staff shell

---

## 7. Navigation flow (text diagram)

```
[Login / Contractor Login]
        |
   staff auth ------------------> [Layout shell + sidebar]
        |                              |
        |                    +---------+------------------------------+
        |                    |                                        |
        |              Ops Center  Dashboard  Customers  Work Orders  Billing  RMA  Contractors  New Install  Inventory  Settings  (Sales: CRM/Clients)
        |                    |          |         |          |
        |                    |          |   -> Lead Lobby    -> jobDetail (WorkOrderPanel)
        |                    |          |   -> SolarEdge Sites -> SiteProfilePanel
        |                    |          |
        |                    +-> drill: technician / operations
   contractor auth --------> [Contractor Dashboard] -> [Contractor Job Detail]
```
