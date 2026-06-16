# SolarOps Codebase Risk Map
_Generated: 2026-05-29_

---

## 1. Structure Inventory

**Repo layout:**
- Root: `/Users/cex/SolarOps÷/`
- App source: `solarflow-dashboard/` (React + TypeScript + Vite + Tailwind + shadcn/ui)
- Serverless API: `api/` (Vercel Functions, TypeScript + one Python file)
- No `supabase/` directory: schema migrations are not tracked in-repo

**Languages and frameworks:**
- Frontend: React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix primitives)
- Backend: Vercel serverless functions (Node.js TypeScript), Supabase (Postgres + Realtime + Storage)
- Integrations: SolarEdge Monitoring API, Xero (billing), Trello (CRM import), open-meteo (weather)
- Build: `pnpm@9.15.4`, output to `solarflow-dashboard/dist`
- Deploy: Vercel with SPA rewrite rules and explicit cache-control headers

**Entry points:**
- `solarflow-dashboard/src/App.tsx` (root component, router, auth gate)
- `solarflow-dashboard/src/components/AppRouter.tsx` (route definitions)
- `api/*.ts` (12 serverless functions)

**State architecture:** Zustand stores split across `src/lib/` (dataStore, syncEngine, crmStore, contractorStore, operationsStore, photoStore, customerStore, outbox). No server-state layer (no React Query or SWR).

---

## 2. Churn Hotspot Table

| Rank | File | Commits | Lines | Critical Path |
|------|------|---------|-------|---------------|
| 1 | `src/App.tsx` | 43 | 2,561 | Auth, routing, all features |
| 2 | `src/components/Customers.tsx` | 42 | 5,785 | CRM, customer management |
| 3 | `src/components/WorkOrderPanel.tsx` | 26 | 3,453 | Work orders, operations |
| 4 | `src/lib/dataStore.ts` | 18 | 470 | All data, sync |
| 5 | `src/lib/syncEngine.ts` | 16 | 702 | Sync, data integrity |
| 6 | `src/components/Layout.tsx` | 14 | 663 | Navigation, all pages |
| 7 | `src/types/index.ts` | 13 | 877 | Entire type contract |
| 8 | `src/components/DispatchDashboard.tsx` | 12 | 1,744 | Operations dashboard |
| 9 | `src/components/Dashboard.tsx` | 11 | 969 | Main dashboard |
| 10 | `src/lib/trelloImport.ts` | 4 | 31,580 | CRM import |
| 11 | `src/lib/solarEdgeSites.ts` | 4 | 3,653 | Telemetry, alerts |
| 12 | `src/lib/mergedCustomers.ts` | 4 | 3,479 | Customer data merge |
| 13 | `src/components/LeadLobby.tsx` | 9 | 1,991 | CRM, lead pipeline |
| 14 | `src/components/Jobs.tsx` | 9 | 596 | Work orders, scheduling |
| 15 | `src/components/Settings.tsx` | 9 | 678 | Auth, configuration |
| 16 | `src/lib/db.ts` | 7 | (short) | All persistence |
| 17 | `src/hooks/useSyncEngine.ts` | 6 | (short) | Sync hook |
| 18 | `src/components/contractor/JobDetail.tsx` | 6 | 1,564 | Contractor portal |
| 19 | `src/components/SolarEdgeImportModal.tsx` | 6 | (medium) | Telemetry ingestion |
| 20 | `api/solaredge.ts` | 4 | (short) | Telemetry proxy |

---

## 3. Ranked Hotspot Risk Report

### 1. `solarflow-dashboard/src/App.tsx`
- **Churn:** 43 commits
- **Lines:** 2,561
- **Critical paths:** Auth, routing, ALL features
- **Risk:** Monolithic root component. Auth gate, routing, and shared state wiring all live here. Any regression breaks every page. 43 commits means it absorbs scope creep from every feature. Likely contains stale conditional logic and orphaned route branches.
- **Next agent check:** Audit route guards and auth condition branches for dead/duplicate logic. Confirm every route in AppRouter is still reachable.

---

### 2. `solarflow-dashboard/src/components/Customers.tsx`
- **Churn:** 42 commits
- **Lines:** 5,785
- **Critical paths:** CRM, customer management, customer 360 view
- **Risk:** Largest component by line count among churned files. 42 commits on 5,785 lines means incremental feature layering with no refactor. High chance of stale event handlers, duplicated form logic, and inconsistent field naming (the `solarEdgeSiteId` vs `clientId` confusion fixed in recent commits likely originated here).
- **Next agent check:** Count the number of distinct `useState` hooks and `useEffect` blocks. Any file with more than 15 effects is a closure-bug factory.

---

### 3. `solarflow-dashboard/src/components/WorkOrderPanel.tsx`
- **Churn:** 26 commits
- **Lines:** 3,453
- **Critical paths:** Work orders, operations, contractor portal, photo upload, SOW report
- **Risk:** The forensic memory files already documented critical bugs here (stale-closure auto-save, photo schema mismatch, multi-photo stomp). 26 commits post-incident means patches on patches. The panel is the operational core: data loss in this file directly affects field technicians.
- **Next agent check:** Verify the stale-closure auto-save fix is consistent across ALL save paths, not just the one path that was patched.

---

### 4. `solarflow-dashboard/src/lib/dataStore.ts`
- **Churn:** 18 commits
- **Lines:** 470
- **Critical paths:** ALL data, sync boundary
- **Risk:** Central Zustand store. 18 commits at 470 lines means the schema has changed frequently relative to its size. Every component reads from this store. A wrong default value or missing field here silently corrupts every view.
- **Next agent check:** Check that every store slice has a corresponding migration or version guard when fields are added or renamed.

---

### 5. `solarflow-dashboard/src/lib/syncEngine.ts`
- **Churn:** 16 commits
- **Lines:** 702
- **Critical paths:** Sync, data integrity, Supabase writes, outbox
- **Risk:** Three separate multi-commit fix cycles (phase1/phase2/phase3 sync reliability commits) show this engine is still not stable. It handles newest-wins conflict resolution, bucket names, and Realtime. A bug here loses data silently. No test coverage visible.
- **Next agent check:** Trace what happens when a sync write fails mid-batch. Is the outbox re-queued or silently dropped?

---

### 6. `solarflow-dashboard/src/lib/trelloImport.ts`
- **Churn:** 4 commits (low, but line count is extreme)
- **Lines:** 31,580
- **Critical paths:** CRM import, lead pipeline
- **Risk:** 31,580 lines is an extraordinary outlier. This is almost certainly a large generated or embedded data file (lookup table, static site data, or bundled JSON) masquerading as a TypeScript module. If it is imported at module load time, it inflates the initial bundle and slows every page load. If it contains customer data, it is a privacy risk.
- **Next agent check:** Determine if this file is a generated artifact, static data blob, or actual logic. Check if it is tree-shaken out of the production bundle or included wholesale.

---

### 7. `solarflow-dashboard/src/lib/mergedCustomers.ts`
- **Churn:** 4 commits
- **Lines:** 3,479
- **Critical paths:** Customer data merge, CRM, customer 360 view
- **Risk:** 3,479 lines for a "merge" utility is very large. Likely contains inline data transforms, field mapping tables, or duplicated logic that belongs in the database. Changes here affect how customer records appear across the entire app.
- **Next agent check:** Check if this file contains hardcoded field mappings that diverge from the current Supabase schema.

---

### 8. `solarflow-dashboard/src/lib/solarEdgeSites.ts`
- **Churn:** 4 commits
- **Lines:** 3,653
- **Critical paths:** Telemetry ingestion, SolarEdge alerts, monitoring dashboard
- **Risk:** 3,653 lines for site data suggests a large static mapping of site IDs to metadata. If this data is stale, alert routing and monitoring will silently show wrong sites. The `solarEdgeSiteId` vs `clientId` (US-15XXX) naming confusion seen in recent commits likely has roots here.
- **Next agent check:** Verify site ID field names in this file match the corrected schema after the recent field-name fix commits.

---

### 9. `solarflow-dashboard/src/components/DispatchDashboard.tsx`
- **Churn:** 12 commits
- **Lines:** 1,744
- **Critical paths:** Operations dashboard, scheduling, dispatch
- **Risk:** High churn on a large operational component. Dispatch is time-sensitive: a stale state read here means a technician gets wrong job data. Recent commits to sync and mention notifications suggest this component pulls from multiple stores that are still being stabilized.
- **Next agent check:** Check whether this component subscribes to syncEngine state and whether it re-renders correctly after a manual sync.

---

### 10. `solarflow-dashboard/src/types/index.ts`
- **Churn:** 13 commits
- **Lines:** 877
- **Critical paths:** Entire app type contract
- **Risk:** A shared types file that changes 13 times means the data model is still in flux. TypeScript will catch type errors at build time, but optional fields added over time accumulate and hide runtime nullability bugs. Every component depends on this file.
- **Next agent check:** Grep for fields typed as `string | undefined` or `any` that are used in render paths without null guards.

---

### 11. `solarflow-dashboard/src/components/LeadLobby.tsx`
- **Churn:** 9 commits
- **Lines:** 1,991
- **Critical paths:** CRM, lead pipeline, Trello sync, screenshot import
- **Risk:** The most recent commits (Sync Now button, CRM lead sync, screenshot lead import via Claude Vision) all touch this component. It now owns a manual sync trigger, cloud push logic, and AI-driven import. Mixing UI and data-push logic in one 2,000-line component is fragile.
- **Next agent check:** Confirm the manual Sync Now button correctly handles failure states and does not leave the outbox in a poisoned state.

---

### 12. `solarflow-dashboard/src/components/Layout.tsx`
- **Churn:** 14 commits
- **Lines:** 663
- **Critical paths:** Navigation shell, all pages, mention notifications bell
- **Risk:** Navigation changes affect every user on every page. The mention bell and notification delivery were recently broken and fixed here. 14 commits suggests it doubles as a global state listener, which makes it hard to isolate changes.
- **Next agent check:** Confirm the mention notification bell correctly reflects unread count after the realtime delivery fix.

---

### 13. `solarflow-dashboard/src/components/contractor/JobDetail.tsx`
- **Churn:** 6 commits
- **Lines:** 1,564
- **Critical paths:** Contractor portal, photo upload, job reporting, invoice submission
- **Risk:** Photo upload reliability was a P0 incident (three-phase fix). This component is the contractor's primary touchpoint. Six commits post-incident. If photo upload still fails silently for any contractor, field evidence is lost permanently.
- **Next agent check:** Test the full photo upload path in JobDetail end-to-end in a staging environment, especially for the camera-first mobile flow.

---

### 14. `solarflow-dashboard/src/components/Dashboard.tsx`
- **Churn:** 11 commits
- **Lines:** 969
- **Critical paths:** Main dashboard, Ops Center widgets, KPIs
- **Risk:** 11 commits on the primary landing view. The Ops Center 4-widget layout was redesigned in a prior session. If widget data sources have shifted since that redesign, KPIs shown to managers may be stale or wrong.
- **Next agent check:** Verify each widget's data source against the current store schema to confirm no widget is reading a field that was renamed.

---

### 15. `solarflow-dashboard/src/components/Settings.tsx`
- **Churn:** 9 commits
- **Lines:** 678
- **Critical paths:** Auth configuration, API key management, integration toggles
- **Risk:** Settings is where SolarEdge API keys, Xero tokens, and user preferences live. 9 commits here suggest the integration surface keeps expanding. Sensitive credentials passed through component state (rather than env vars) are at risk of being logged or leaked to error reporting.
- **Next agent check:** Audit whether any credentials flow through component state or are exposed in console logs.

---

### 16. `solarflow-dashboard/src/lib/outbox.ts`
- **Churn:** 4 commits
- **Lines:** 236
- **Critical paths:** Sync reliability, data durability, offline writes
- **Risk:** The outbox is the last line of defense against data loss when Supabase writes fail. It is small but has been patched multiple times. The sync poisoning bug (fixed in phase3) originated in this area. Any regression here silently drops writes.
- **Next agent check:** Confirm the outbox dequeue logic handles partial failures and does not re-process already-committed entries.

---

### 17. `api/solaredge.ts`
- **Churn:** 4 commits
- **Lines:** short (proxy)
- **Critical paths:** Telemetry ingestion, SolarEdge API quota management
- **Risk:** This serverless function proxies all SolarEdge API calls. A recent commit reduced quota usage from 5x to 2x per day. The proxy is the only path for alert data to reach the app. If it fails silently, the alert dashboard goes stale without any user warning.
- **Next agent check:** Confirm the function returns a structured error response (not a silent 200) when the SolarEdge API rate limit is hit.

---

### 18. `solarflow-dashboard/src/components/SolarEdgeMonitoring.tsx`
- **Churn:** 5 commits
- **Lines:** 963
- **Critical paths:** Telemetry display, alert severity, acknowledge/resolve workflow
- **Risk:** This is the alert dashboard that field managers use to triage system faults. 5 commits and 963 lines, pulling from the large `solarEdgeSites.ts` mapping. If the site ID field name mismatch (recently fixed) left any residual inconsistency, alerts will map to the wrong customer site.
- **Next agent check:** Cross-reference site IDs rendered in this component against the corrected field names in `solarEdgeSites.ts`.

---

### 19. `solarflow-dashboard/src/components/admin/BillingModule.tsx`
- **Churn:** 5 commits
- **Lines:** 856
- **Critical paths:** Billing, invoice creation, Xero integration, payment tracking
- **Risk:** Financial data. 856 lines with 5 commits. The Xero integration (xeroService.ts, three xero api/* functions) is a multi-token OAuth flow. A regression in token refresh silently breaks all invoice syncing without a visible error to the user.
- **Next agent check:** Confirm the Xero token refresh path in `api/xero-token.ts` and `xeroService.ts` handles expiry gracefully and surfaces errors to the billing UI.

---

### 20. `solarflow-dashboard/src/lib/db.ts`
- **Churn:** 7 commits
- **Lines:** short
- **Critical paths:** All Supabase reads and writes, persistence layer
- **Risk:** This is the lowest-level database access module. 7 commits on a short file means the Supabase client setup, table names, or RLS bypass patterns have changed repeatedly. Any mistake here silently affects all data reads app-wide. No supabase migrations directory exists, so schema changes are not version-controlled.
- **Next agent check:** Confirm Supabase RLS is enabled on all tables and that this file does not use a service-role key in any code path that runs in the browser.

---

## 4. Summary: Risk by Critical Path

| Path | Top Risk Files |
|------|---------------|
| Auth | App.tsx, Settings.tsx, db.ts |
| Work Orders | WorkOrderPanel.tsx, Jobs.tsx, JobDetail.tsx |
| CRM / Leads | Customers.tsx, LeadLobby.tsx, crmStore.ts |
| Sync / Data | dataStore.ts, syncEngine.ts, outbox.ts, db.ts |
| Telemetry / Alerts | solarEdgeSites.ts, SolarEdgeMonitoring.tsx, api/solaredge.ts |
| Dashboard | Dashboard.tsx, DispatchDashboard.tsx, Layout.tsx |
| Billing | BillingModule.tsx, xeroService.ts, api/xero-*.ts |
| Contractor Portal | JobDetail.tsx, ContractorRegister.tsx, contractorStore.ts |
| Type Contract | types/index.ts |
| Bundle Size | trelloImport.ts (31,580 lines, investigate immediately) |

---

## 5. Fragility Signals Summary

- **Zero TODO/FIXME markers** found in the entire codebase. This is a warning sign, not a good sign. It means known debt is either suppressed or has been patched in-place without annotation.
- **No Supabase migrations directory.** Schema is managed out-of-band. Any column rename or addition is invisible to the repo history.
- **trelloImport.ts at 31,580 lines** is the single biggest structural anomaly. Investigate before any bundling or performance work.
- **Multiple "phase" fix cycles** (sync phase1/2/3, photo P0/phase2/phase3) indicate reactive patching rather than root-cause resolution. These areas need systematic review, not more point fixes.
- **No test files found** in the source tree during this scan. All quality assurance is manual or via the Playwright agent.
