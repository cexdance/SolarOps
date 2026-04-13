# SolarOps Performance Analysis Report
**Date:** 2026-03-16
**Scope:** `/Users/cex/SolarOps÷/solarflow-dashboard/src`
**Total source lines:** ~40,700

---

## TOP 5 BOTTLENECKS (Ranked)

| Rank | Risk | Severity |
|------|------|----------|
| 1 | Zero code-splitting — entire app in one bundle | CRITICAL |
| 2 | `saveData(data)` fires on every state change — serialises entire AppState to localStorage + Neon on every keystroke | CRITICAL |
| 3 | Two massive static data files shipped in JS bundle (~10,000 lines of inline data) | HIGH |
| 4 | `playwright` in production `dependencies` — browser automation binary added to prod bundle/install | HIGH |
| 5 | 213 `.map()` calls with no virtualisation, no `React.memo` on list row components | HIGH |

---

## 1. BUNDLE SIZE

### No Code-Splitting
**Severity: CRITICAL**
**File:** `src/App.tsx:3–19`

All 20+ route-level components are statically imported at the top of `App.tsx`. There is no `React.lazy()`, no `Suspense`, and no `manualChunks` in `vite.config.ts`. Every route — CRM, Operations, Inventory, Contractor Portal, Billing, SolarEdge Monitoring — is parsed and executed on initial load regardless of which view the user navigates to.

**Recommendation:** Convert each route component to a lazy import:
```ts
const CRMDashboard = React.lazy(() => import('./components/CRMDashboard'));
```
Wrap the router switch in `<Suspense fallback={<Spinner />}>`. Add `build.rollupOptions.output.manualChunks` to split vendor libraries (recharts, leaflet, radix-ui) into separate chunks.

---

### Large Inline Static Data
**Severity: HIGH**
**Files:**
- `src/lib/mergedCustomers.ts` — 6,474 lines, 359 customer objects as a hardcoded JS array
- `src/lib/solarEdgeSites.ts` — 3,538 lines, ~200 site objects as a hardcoded JS array

Both files are imported at module load time (via `dataStore.ts → generateDemoData()`), adding ~10,000 lines of data to the JS bundle. This inflates parse time and initial memory allocation.

**Recommendation:** Convert both to JSON files in `public/` and fetch them lazily via `fetch()` on first access, or move them to the Neon database and paginate. At minimum, use dynamic `import()` so they split into their own chunk.

---

### Playwright in Production Dependencies
**Severity: HIGH**
**File:** `package.json` — `"playwright": "1.57.0"` listed under `dependencies`, not `devDependencies`

Playwright is a ~300MB browser automation framework. It has no place in production. On Netlify this inflates the install time and could affect cold start. It should be in `devDependencies`.

**Recommendation:** Move to `devDependencies`:
```json
"devDependencies": {
  "playwright": "1.57.0"
}
```

---

### Heavy Vendor Dependencies
**Severity: MEDIUM**
- `recharts ^2.12.4` — ~500KB minified, includes d3-* sub-packages
- `leaflet ^1.9.4` + `@types/leaflet` — map library, ~150KB
- 29 individual `@radix-ui/*` packages — tree-shakeable but large surface area
- `embla-carousel-react` — likely only used in 1–2 components

**Recommendation:** With code-splitting in place, recharts and leaflet will naturally land in their own chunks. Audit embla-carousel usage; if it's only in one component, it can be lazy-loaded with that component.

---

## 2. COMPONENT RENDERING

### No React.memo on List Row Components
**Severity: HIGH**
**File:** `src/components/Customers.tsx`

`Customers.tsx` (2,511 lines) renders `pagedCustomers.map(customer => ...)` at line ~609 with per-row sub-components (`StatusBadge`, `getCategoryColor`, etc.) defined inline in the file. None of the row components are wrapped in `React.memo`. Each time any parent state changes (search query, filter, modal open/close), all visible rows re-render.

The file also has no `useMemo` on the filtered/sorted customer list — only `useCallback` on a few handlers. The expensive filter+sort happens on every render pass.

**Files also missing memoisation on list renders:**
- `src/components/LeadLobby.tsx` (1,445 lines) — no `useMemo` found on lead list derivations
- `src/components/WorkOrderPanel.tsx` (1,694 lines) — no `useMemo` on work order list

**Positive finding:** `DispatchDashboard.tsx` (1,565 lines) uses `useMemo` and `useCallback` extensively — this is the correct pattern.

**Recommendation:**
1. Extract list row components into named exports and wrap with `React.memo`.
2. Add `useMemo` for filtered/sorted customer arrays in `Customers.tsx`.
3. Apply the `DispatchDashboard` memoisation pattern to `Customers`, `LeadLobby`, and `WorkOrderPanel`.

---

### Global memo/useCallback Usage
**Severity: MEDIUM**
Grep across all `*.tsx` and `*.ts` files: **59 occurrences** of `React.memo | useMemo | useCallback` across the entire codebase. With 213 `.map()` render sites and many large components, this ratio is very low.

---

## 3. DATA STORE PATTERNS

### saveData on Every State Change — Double Write
**Severity: CRITICAL**
**File:** `src/App.tsx:275–277` and `src/App.tsx:358–360`

```ts
// Save data whenever it changes
useEffect(() => {
  saveData(data);
}, [data]);
```

This `useEffect` appears **twice** in App.tsx (lines 275 and 358 — the second is a duplicate). `saveData` both:
1. Calls `localStorage.setItem(STORAGE_KEY, JSON.stringify(state))` — synchronously serialises the full `AppState`
2. Calls `dbSet(STORAGE_KEY, state)` — fires a `fetch()` to the Neon backend

Every keystroke in any form, every modal open/close, every filter interaction triggers a full JSON serialisation + network write of the entire application state. `AppState` includes all customers (359 objects), all jobs, all notifications, all users.

**Recommendation:**
- Debounce the save effect (300–500ms).
- Write only the changed slice, not the entire state.
- Remove the duplicate `useEffect` at line 358.
- Consider Zustand or Jotai with selective persistence middleware instead of monolithic state.

---

### Full State Reload on DB Sync
**Severity: MEDIUM**
**File:** `src/App.tsx:267–273`

```ts
useEffect(() => {
  syncFromDB().then(() => {
    setData(loadData());  // Full reload from localStorage
    setDbReady(true);
  });
}, []);
```

`loadData()` re-runs `generateDemoData()` (which iterates over all 359 `mergedCustomerData` records) as a fallback on every mount. If `localStorage` is populated this is skipped, but the `mergedCustomerData` module is still fully evaluated at import time.

---

### CRMStore — Mock Data Generated at Module Load
**Severity: MEDIUM**
**File:** `src/lib/crmStore.ts`

`generateMockLeads(25)` and `generateMockStats()` run at module import time as module-level initialisers (`const initialLeads = generateMockLeads(25)`). These execute before the component tree mounts, blocking the JS thread during module evaluation.

---

## 4. LARGE COMPONENTS

All components below 500 lines are doing too much and should be split:

| File | Lines | Problem |
|------|-------|---------|
| `src/lib/mergedCustomers.ts` | 6,474 | Data file, not a component — should be JSON |
| `src/lib/solarEdgeSites.ts` | 3,538 | Data file, not a component — should be JSON |
| `src/components/Customers.tsx` | 2,511 | List + detail panel + edit modal + merge modal + work order creation — 5+ responsibilities |
| `src/components/WorkOrderPanel.tsx` | 1,694 | Full work order lifecycle in one component |
| `src/components/InventoryModule.tsx` | 1,629 | Equipment + tools + providers all in one file |
| `src/components/DispatchDashboard.tsx` | 1,565 | Dashboard + widget system + map — well-optimised but too large |
| `src/components/CustomerManagement.tsx` | 1,507 | Overlaps significantly with Customers.tsx |
| `src/components/LeadLobby.tsx` | 1,445 | Lead pipeline + conversion + XP system |
| `src/App.tsx` | 1,161 | God component — all state, all routing, auth |

**Recommendation:** `Customers.tsx` is the highest priority. Split into:
- `CustomerTable.tsx` (list + pagination + filters)
- `CustomerDetailPanel.tsx` (side panel)
- `CustomerEditModal.tsx`
- `CustomerMergeModal.tsx`

---

## 5. LIST RENDERING & VIRTUALISATION

**Severity: HIGH**
**No virtualisation library found anywhere in the codebase.** (`react-window`, `react-virtual`, `@tanstack/virtual` — all absent.)

With 359 customers in `mergedCustomers.ts`, the `Customers.tsx` table renders paginated rows — pagination provides some protection but the full customer array is still iterated for filter/sort on every render.

`LeadLobby.tsx` renders leads without windowing. `Operations.tsx` renders work order and alert lists inline. `DispatchDashboard.tsx` slices lists to 8–10 items which is a reasonable manual mitigation.

**Recommendation:** Add `@tanstack/react-virtual` to customer table rows and any list rendering more than ~50 items. For the customer table, virtual rows + pagination together is the correct combination.

---

## 6. useEffect PATTERNS

**Severity: MEDIUM**
**59 `useEffect` calls** across the codebase. Key issues:

| Issue | Location | Detail |
|-------|----------|--------|
| Duplicate save effect | `App.tsx:275` and `App.tsx:358` | `saveData(data)` wired to `[data]` twice |
| eslint-disable-next-line react-hooks/exhaustive-deps | `App.tsx:318`, `App.tsx:347` | Suppressed dependency warnings — potential stale closures |
| Inline `useEffect` in `Customers.tsx:118–121` | `Customers.tsx` | Effect syncs input with value prop — should be derived state or controlled component |
| Multiple localStorage writes per interaction | `App.tsx:354–370` | 4 separate effects each writing to localStorage on their own state slice |

---

## 7. IMAGES & ASSETS

**Severity: LOW**
- `public/conexsol-logo.png` — 141KB for a logo. Should be converted to SVG or compressed WebP (target: <20KB).
- No other unoptimised images found in `src/` assets directory (no image assets found there).

**Recommendation:** Convert the logo to SVG. If raster is required, use a WebP at 2x resolution compressed to <20KB.

---

## 8. ROUTE / CODE SPLITTING

**Severity: CRITICAL**
**File:** `vite.config.ts` — no `build.rollupOptions` configuration whatsoever.

The Vite config only configures `plugins`, `resolve.alias`, and `server.proxy`. There is no:
- `build.rollupOptions.output.manualChunks`
- `build.chunkSizeWarningLimit`
- Any chunking strategy

Combined with static imports of all 20+ route components in `App.tsx`, the entire application ships as a single JavaScript bundle. Based on the dependency surface (recharts, leaflet, 29 Radix packages, date-fns, embla, react-hook-form, Playwright), the uncompressed bundle is likely **3–5MB+**.

---

## RECOMMENDATIONS SUMMARY

### Immediate (CRITICAL)
1. **Add `React.lazy()` + `Suspense`** for all route-level components in `App.tsx` lines 3–19.
2. **Add `build.rollupOptions`** to `vite.config.ts` with `manualChunks` splitting recharts, leaflet, and radix-ui.
3. **Debounce `saveData`** — wrap in a 400ms debounce; remove the duplicate effect at App.tsx:358.
4. **Move `playwright` to `devDependencies`** in `package.json`.

### Short-term (HIGH)
5. **Convert `mergedCustomers.ts` and `solarEdgeSites.ts` to JSON** in `public/` and fetch lazily.
6. **Add `React.memo`** to `CustomerRow`, `LeadCard`, `WorkOrderRow` components.
7. **Add `useMemo`** for filtered/sorted lists in `Customers.tsx` and `LeadLobby.tsx`.
8. **Add `@tanstack/react-virtual`** to the customer table.
9. **Compress `conexsol-logo.png`** (141KB → target <20KB SVG/WebP).

### Medium-term (MEDIUM)
10. **Split `App.tsx`** — extract routing, auth state, and contractor state into separate contexts/providers.
11. **Split `Customers.tsx`** into 4 focused components.
12. **Replace monolithic `AppState` with Zustand** slices with selective persistence.
13. **Remove `eslint-disable` suppression** on `useEffect` dependency arrays and fix stale closures.
