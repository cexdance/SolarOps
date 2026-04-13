# SolarOps — Known Build Errors Log

> **Purpose:** Track pre-existing and recurring TypeScript/build errors so they are not re-introduced or confused with new errors during development.
>
> **Rule:** Before flagging a build error as new, check this file first. Only errors introduced by a specific change need investigation.

---

## Pre-Existing Errors (as of 2026-03-13)

These 14 TypeScript errors existed **before** any recent changes. They do not block the dev server (`npm run dev`) — only `npm run build` strict mode surfaces them.

### 1. `src/App.tsx` — Missing `JobDetail` name
```
src/App.tsx(872,14): error TS2304: Cannot find name 'JobDetail'.
```
**Cause:** `JobDetail` component referenced but not imported/defined in scope.

---

### 2. `src/components/contractor/JobDetail.tsx` — Wrong setter name
```
src/components/contractor/JobDetail.tsx(193,5): error TS2552:
Cannot find name 'setShowBeforeModal'. Did you mean 'setShowAfterModal'?
```
**Cause:** Typo — `setShowBeforeModal` used but only `setShowAfterModal` is defined.

---

### 3. `src/components/CRMDashboard.tsx` — Incomplete `sourceLabels` map
```
error TS2739: Type '{ google_forms: string; website: string; ... }'
is missing the following properties from type 'Record<LeadSource, string>':
solaredge, customer_referral, contractor_referral, marketing, google
```
**Cause:** `sourceLabels` object doesn't include all `LeadSource` values added later.

---

### 4. `src/components/CustomerManagement.tsx` — Same incomplete `sourceLabels` map
```
error TS2739: (same as above)
```
**Cause:** Same `sourceLabels` issue as CRMDashboard.

---

### 5. `src/components/DispatchDashboard.tsx` — Recharts JSX component type errors (×4)
```
error TS2607 / TS2786: 'XAxis' / 'YAxis' / 'Tooltip' / 'Area'
cannot be used as a JSX component.
```
**Cause:** Recharts version mismatch with TypeScript JSX typing. Library-level issue.

---

### 6. `src/components/Jobs.tsx` — Missing `ServiceType`
```
src/components/Jobs.tsx(11,30): error TS2304: Cannot find name 'ServiceType'.
```
**Cause:** `ServiceType` imported but not exported from types.

---

### 7. `vite.config.ts` — `historyApiFallback` not in `ServerOptions`
```
vite.config.ts(22,5): error TS2769: No overload matches this call.
'historyApiFallback' does not exist in type 'ServerOptions'
```
**Cause:** Vite version mismatch — `historyApiFallback` is a webpack-dev-server option, not valid in this Vite version.

---

## Error Resolution Log

| Date | Error | File | Fix Applied |
|------|-------|------|-------------|
| — | — | — | — |

---

## Notes

- `npm run dev` works fine despite these errors — Vite dev server is permissive.
- `npm run build` runs `tsc` in strict mode and surfaces all of the above.
- When verifying a change, compare error count before/after. 14 errors = baseline (no regression).
