# Council review, render side (Karen), 2026-09-07

Scope: front-end / render path only. Database and storage side covered separately by Fatso.

## Verdict

| # | Question | Verdict |
|---|---|---|
| 1 | Document uploaded by user A invisible to user B, render-side cause | FAIL, root cause found |
| 2 | Another list with the d61f477 shape (saved UI state removes rows, control off screen) | PASS, not found elsewhere |

## Finding 1: Customer-card documents never leave the uploader's browser

`CustomerManagement.tsx` (the CRM customer card with drag-and-drop attachments, rendered at `App.tsx:3381`) runs its own separate, non-synced local store.

- `solarflow-dashboard/src/components/CustomerManagement.tsx:249-270`: `useState<CRMCustomer[]>([])` filled by a mount-only `useEffect(..., [])` calling `loadCustomers()` / `loadInteractions()`. No re-hydration.
- No `solarflow-remote-update` listener anywhere in that file. Codebase-wide, only `useSyncEngine.ts`, `DeepSyncMetricsWidget.tsx`, `AddressCleanupWidget.tsx` and `InventoryModule.tsx` subscribe to that event.
- Write path `CustomerManagement.tsx:391-414` (`handleFileDrop`) calls `setCustomers(...)` then `saveCustomers(updated)`.
- `solarflow-dashboard/src/lib/customerStore.ts:28-63` is pure `localStorage` under `CUSTOMER_STORAGE_KEY`. No Supabase import, no `KV_SYNC_KEYS` registration, no `solarflow-remote-update` dispatch.
- Render at `CustomerManagement.tsx:731-741` (`selectedCustomer.attachments`) is clean: no role gate, no uploader filter, no stale-render filter.

Net effect: the attachment is written only to the uploader's browser `localStorage`. It is never pushed, never pulled, and the other client would not re-hydrate even if it were pushed.

Note: this `CRMCustomer` / `customerStore.ts` universe is a second, parallel customer system, distinct from the synced `Customer[]` / `data.customers` that `Customers.tsx` (`App.tsx:3542`) and the sync engine operate on. `Customers.tsx` shows no attachment UI in the inspected code. Confirm with the user which screen was used, since the fix differs.

## Finding 2: no sibling of the hidden-column filter bug

Grep of `components/` for `colFilters|visibleCols|matchesCols|hiddenCol` hits only `Customers.tsx`, and the fix holds.

- `Customers.tsx:561` iterates `visibleCols.every(...)`, not saved `colFilters` keys. `visibleCols` derived at line 451 from `hiddenCols`. Both persisted per browser via `loadView`/`saveView` (354-372), controls on screen at 797-808 and 880-889.

Cleared candidates:

- `Jobs.tsx:576-583`, `Billing.tsx:259-334`: persist view mode only (list vs kanban), not a row-filtering predicate.
- Empty-query search trap: `?..includes(q)` shape appears only in `Billing.tsx:353-354` and `Layout.tsx:176-184`, both non-destructive match expressions, not row-eliminating filters.
- Pagination: `Customers.tsx:659-661` `PAGE_SIZE = 100` with visible page controls and an on-screen count at line 1071. No silent slice.
- Role gating: the only permanent customer-list filter is `isAllowedCustomer` (`solarflow-dashboard/src/lib/solarEdgeSiteFilter.ts:106-116`), applied at `App.tsx:2775` and `syncEngine.ts:1574` (the sync-engine copy grandfathers `localMap.has(c.id)`). Same rule for every client, so it cannot produce a per-user inconsistent gap. Flagged only for lacking an on-screen indicator.

## Files
- `solarflow-dashboard/src/components/CustomerManagement.tsx` (249-270, 391-414, 731-741)
- `solarflow-dashboard/src/lib/customerStore.ts` (28-63)
- `solarflow-dashboard/src/components/Customers.tsx` (354-372, 451, 561, 659-661, 1071)
- `solarflow-dashboard/src/components/Jobs.tsx:576-583`, `solarflow-dashboard/src/components/Billing.tsx:259-354`
- `solarflow-dashboard/src/lib/solarEdgeSiteFilter.ts:106-116`, `solarflow-dashboard/src/App.tsx:2775`, `solarflow-dashboard/src/lib/syncEngine.ts:1574`
