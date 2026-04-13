# SolarOps Security Audit Report — Version 2
**Date:** 2026-03-16
**Auditor:** Senior Application Security Engineer (automated audit)
**Scope:** `/Users/cex/SolarOps÷/solarflow-dashboard` — React/Vite SPA + Netlify serverless functions
**Compared Against:** `security-audit-report.md` (v1)

---

## Executive Summary

Since the v1 audit, **3 of 14 findings have been fixed** (CRITICAL-3 partial, CRITICAL-4, MEDIUM-2 partial). Two new HIGH findings were discovered. The application still carries **3 Critical** and **7 High** severity issues. The most severe remaining problem is a client-side authentication system with hardcoded passwords and PII that fully controls access to all application data.

---

## Delta Summary

| ID | v1 Severity | Title | Status |
|----|-------------|-------|--------|
| CRITICAL-1 | CRITICAL | Hardcoded password `1357` in client source and DOM | STILL OPEN |
| CRITICAL-2 | CRITICAL | Auth bypassed via client-side state only | STILL OPEN |
| CRITICAL-3 | CRITICAL | `/api/store` endpoint open to public internet | FIXED (partial — see note) |
| CRITICAL-4 | CRITICAL | Xero function accepts `client_secret` from request body | FIXED |
| HIGH-1 | HIGH | Real employee PII hardcoded in JS bundle | STILL OPEN |
| HIGH-2 | HIGH | SolarEdge API key sent as URL query parameter | STILL OPEN |
| HIGH-3 | HIGH | Third-party API keys stored in `localStorage` | STILL OPEN |
| HIGH-4 | HIGH | Role-based access control is client-side only | STILL OPEN |
| HIGH-5 | HIGH | Contractor passwords compared plaintext client-side | STILL OPEN |
| MEDIUM-1 | MEDIUM | No input validation or XSS sanitization library | STILL OPEN |
| MEDIUM-2 | MEDIUM | CORS wildcard on unauthenticated DB endpoint | FIXED (partial) |
| MEDIUM-3 | MEDIUM | No server-side credential management | STILL OPEN |
| LOW-1 | LOW | Source identifiers leak in non-prod builds | STILL OPEN |
| LOW-2 | LOW | No HTTP security headers in netlify.toml | STILL OPEN |
| NEW-HIGH-1 | HIGH | Xero OAuth access & refresh tokens stored in `localStorage` | NEW |
| NEW-HIGH-2 | HIGH | `VITE_STORE_API_SECRET` exposes shared secret to browser bundle | NEW |

---

## Fixed Findings

### [FIXED] CRITICAL-3 — `/api/store` Authentication Added
**File:** `netlify/functions/store.mts`
`store.mts` now implements `isAuthorized()` which checks `Authorization: Bearer <STORE_API_SECRET>` against the `STORE_API_SECRET` environment variable. Unauthenticated requests receive `401 Unauthorized`. CORS origin is locked to `process.env.ALLOWED_ORIGIN` (defaulting to `https://conexsol.com`), eliminating the wildcard.

**Residual risk (see NEW-HIGH-2 below):** The secret is sent from the browser as `VITE_STORE_API_SECRET` — a `VITE_` prefixed variable compiled into the public JS bundle. The server-side check now exists but the secret it checks is publicly visible.

### [FIXED] CRITICAL-4 — Xero `client_secret` No Longer Accepted From Request Body
**File:** `netlify/functions/xero-token.mts`
The function now explicitly calls `params.delete('client_secret')` before `params.set('client_secret', clientSecret)` where `clientSecret` is sourced exclusively from `process.env.XERO_CLIENT_SECRET`. The previous vulnerability allowing arbitrary secret injection is closed.

### [FIXED] MEDIUM-2 — CORS Wildcard Removed From `/api/store`
**File:** `netlify/functions/store.mts`
`Access-Control-Allow-Origin` is now set to `process.env.ALLOWED_ORIGIN ?? 'https://conexsol.com'` — no longer a wildcard `*`. Combined with the authentication fix, cross-origin unauthenticated data access is closed.

---

## Open Findings (Carried Forward from v1)

### [CRITICAL-1] Hardcoded Password in Client Source Code
**Severity:** CRITICAL
**Status:** STILL OPEN
**File:** `src/App.tsx:56` (login screen component)
**Evidence:**
```ts
const contractor = contractors.find(
  c => (c.email === email || c.altEmails?.includes(email)) && c.password === password
);
```
The admin staff login uses `supabase.auth.signInWithPassword` (correct), but the contractor login path compares a password in plaintext against contractor records that are loaded from `src/lib/contractorStore.ts` and `src/lib/contractorData.ts` — which hardcode `password: 'password123'` for every seeded contractor (lines 7, 37, 67 of `contractorData.ts`; lines 565, 596, 627, 658 of `contractorStore.ts`). These passwords ship in the compiled JavaScript bundle.
**Recommended fix:** Move contractor authentication to Supabase Auth. Remove all password fields from client-side data structures. Delete seed data containing real passwords.

### [CRITICAL-2] Contractor Authentication Uses Forgeable `btoa` Token
**Severity:** CRITICAL
**Status:** STILL OPEN (partially mitigated — `localStorage` auth flag removed, but core issue persists)
**File:** `src/App.tsx:429-432, 226-243`
**Evidence:**
```ts
const sessionToken = btoa(`${contractor.id}:${Date.now()}:solarops`);
sessionStorage.setItem('solarflow_session', sessionToken);
```
The contractor session token is `base64(contractorId + ":" + timestamp + ":solarops")`. Base64 is not encryption or signing — it is trivially reversible and forgeable. Any attacker who knows a valid contractor ID (which are short strings like `contractor-1`, `contractor-2` visible in the bundle) can craft a valid token. `validateContractorSession()` only checks that the decoded parts match and are not older than 8 hours — it performs no HMAC or signature verification.

The `localStorage.setItem('solarflow_auth', 'true')` bypass from v1 has been removed; authentication state now initialises from Supabase session or `validateContractorSession()` — this is a genuine improvement. However, the contractor session token itself remains forgeable.
**Recommended fix:** Generate contractor sessions server-side using a cryptographically random token stored in a database table, or migrate to Supabase Auth for contractor users.

### [HIGH-1] Real Employee PII and Email Addresses Hardcoded in Source
**Severity:** HIGH
**Status:** STILL OPEN
**File:** `src/App.tsx` (LoginScreen component, lines ~46-54)
**Evidence (names visible in bundle):**
- `cesar.jurado@conexsol.us`, `carlos.valbuena@conexsol.us`, `daniel.matos@conexsol.us`, `anthony.lopez@conexsol.us`, `andrea.alvarez@conexsol.net`, `e.diaz@...`
- `src/lib/contractorStore.ts:534,564,595,626,657` — real contractor emails (`cesar.jurado@conexsol.us`, `cjurado@mpowermarketing.com`, `rperera@solarpowermax.com`, `jmendez@ingengroup.com`, `cvalbuena@valnuarcapital.com`) with business names, EIN fields, addresses
**Recommended fix:** Move all user and contractor records to a database. The login screen should query an API, not contain a hardcoded user array.

### [HIGH-2] SolarEdge API Key Sent as URL Query Parameter from Browser
**Severity:** HIGH
**Status:** STILL OPEN
**File:** `src/App.tsx:750`
**Evidence:**
```ts
const url = `https://monitoringapi.solaredge.com/sites/list?api_key=${apiKey}&size=100`;
const response = await fetch(url);
```
The API key appears in browser history, network DevTools, server logs, and any proxy between the user and SolarEdge.
**Recommended fix:** Create a Netlify function `netlify/functions/solaredge.mts` that reads `SOLAREDGE_API_KEY` from env and makes the upstream call server-side using the `Authorization` header instead of a query param.

### [HIGH-3] Third-Party API Keys and OAuth Credentials Stored in `localStorage`
**Severity:** HIGH
**Status:** STILL OPEN
**File:** `src/components/Settings.tsx:79,85,93-94`; `src/lib/ringcentral.ts:13-20`
**Evidence:**
```ts
localStorage.getItem(GMAPS_KEY_STORAGE)    // Google Maps API key
localStorage.setItem(RC_CLIENT_ID_KEY, ...) // RingCentral client ID
localStorage.getItem(XERO_CLIENT_SECRET_KEY) // Xero OAuth client secret
```
`localStorage` is readable by any JavaScript on the page — XSS, malicious browser extensions, and shared machine users all gain access.
**Recommended fix:** Store integration credentials as Netlify environment variables. Provide a server-side proxy function for each integration. If user-supplied keys are unavoidable, use `sessionStorage` and display a clear warning about the security implication.

### [HIGH-4] Role-Based Access Control is Client-Side Only
**Severity:** HIGH
**Status:** STILL OPEN
**File:** `src/App.tsx` (multiple role checks throughout)
**Evidence:**
```ts
if (user.role === 'sales') { setCurrentView('crm'); }
```
All authorization is UI gating. Because data reads and writes flow through `/api/store` which only validates a shared secret (not a per-user identity or role), any authenticated user — or any holder of the leaked `VITE_STORE_API_SECRET` — can read and write every data key with no role enforcement.
**Recommended fix:** Enforce roles at the API layer. Use Supabase Row-Level Security (RLS) policies that check `auth.uid()` and role metadata before returning data.

### [HIGH-5] Contractor Passwords Compared in Plaintext Client-Side
**Severity:** HIGH
**Status:** STILL OPEN
**File:** `src/App.tsx:56`, `src/lib/contractorData.ts:7,37,67`, `src/lib/contractorStore.ts:565,596,627,658`
**Evidence:**
```ts
// contractorData.ts line 7
password: 'password123',
// contractorStore.ts line 565
password: 'password123',
```
Four seeded contractors all share `password123`. Password comparison happens in the browser. No hashing, no salting.
**Recommended fix:** Same as CRITICAL-1 — migrate to Supabase Auth. All password fields must be removed from client code.

### [MEDIUM-1] No Input Validation or XSS Sanitization Library
**Severity:** MEDIUM
**Status:** STILL OPEN
**Finding:** Zero occurrences of `DOMPurify`, `sanitize`, `zod`, `yup`, or `xss` across the entire codebase. No `dangerouslySetInnerHTML` was found (positive), but form data flows directly into Neon DB writes via `/api/store` with no server-side schema validation. Malformed data can corrupt application state.
**Recommended fix:** Add Zod for form input validation. Add server-side validation in `store.mts` to reject unexpected keys or malformed payloads.

### [MEDIUM-3] No Server-Side Credential Management for Third-Party Integrations
**Severity:** MEDIUM
**Status:** STILL OPEN
**Finding:** Google Maps, RingCentral, and SolarEdge API keys have no server-side home. They are entered by users in the Settings UI and stored in `localStorage`.
**Recommended fix:** Pre-configure all integration credentials as Netlify environment variables. Build server-side proxy functions for each service.

### [LOW-1] Source Identifiers Leak in Non-Production Builds
**Severity:** LOW
**Status:** STILL OPEN
**File:** `vite.config.ts` — `vite-plugin-source-identifier` present
**Finding:** Unchanged from v1.
**Recommended fix:** Gate the plugin behind `mode === 'development'` only.

### [LOW-2] No HTTP Security Headers in `netlify.toml`
**Severity:** LOW
**Status:** STILL OPEN
**File:** `netlify.toml`
**Finding:** No `[[headers]]` block. No `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, or `Referrer-Policy` headers.
**Recommended fix:**
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains"
    Content-Security-Policy = "default-src 'self'; script-src 'self' https://maps.googleapis.com https://ringcentral.github.io; connect-src 'self' https://*.supabase.co https://api.xero.com https://monitoringapi.solaredge.com; frame-ancestors 'none'"
```

---

## New Findings

### [NEW-HIGH-1] Xero OAuth Access Token and Refresh Token Stored in `localStorage`
**Severity:** HIGH
**File:** `src/lib/xeroService.ts:14-15, 88-92, 168-169, 185`
**Evidence:**
```ts
const XERO_ACCESS_TOKEN_KEY  = 'solarops_xero_access_token';
const XERO_REFRESH_TOKEN_KEY = 'solarops_xero_refresh_token';
// ...
localStorage.setItem(XERO_ACCESS_TOKEN_KEY, data.access_token);
localStorage.setItem(XERO_REFRESH_TOKEN_KEY, data.refresh_token);
```
After the OAuth flow completes, both the short-lived access token and the long-lived refresh token are persisted to `localStorage`. An XSS attack, malicious browser extension, or physical access to a shared browser session provides permanent (refresh-token-backed) access to the company's Xero accounting data — invoices, contacts, payment records.

Additionally, `XERO_CLIENT_SECRET_KEY` is also stored in `localStorage` at line 60:
```ts
localStorage.setItem(XERO_CLIENT_SECRET_KEY, secret.trim());
```
This means even if the server-side `xero-token.mts` function is correctly configured with `XERO_CLIENT_SECRET` in env, users who manually enter the secret in Settings persist it client-side.
**Recommended fix:** Store tokens in `sessionStorage` at minimum (cleared on tab close). Ideally, persist the refresh token server-side (in Neon, keyed to the authenticated user session), never in the browser. Implement a server-side token refresh flow.

### [NEW-HIGH-2] `VITE_STORE_API_SECRET` Exposes Shared DB Secret in the Browser Bundle
**Severity:** HIGH
**File:** `src/lib/db.ts:7`; `.env.example` (env var `VITE_STORE_API_SECRET=solar-store-secret-2026`)
**Evidence:**
```ts
const secret = import.meta.env.VITE_STORE_API_SECRET ?? '';
```
Vite's `import.meta.env` inlines all `VITE_`-prefixed variables directly into the compiled JavaScript bundle at build time. The value of `VITE_STORE_API_SECRET` — the same secret checked by `store.mts`'s `isAuthorized()` — is therefore embedded in plaintext in the public `dist/assets/*.js` file. Any user who opens DevTools → Sources can read it, defeating the authentication entirely.

The `.env.example` confirms the default value: `VITE_STORE_API_SECRET=solar-store-secret-2026`. If this default was used in any deployment, the secret is already effectively public.
**Recommended fix:** The `Authorization: Bearer` header to `/api/store` must be generated server-side, not in client code. Options:
1. Authenticate requests using the user's Supabase JWT (`supabase.auth.getSession()` → `session.access_token`) and verify it server-side in `store.mts` using the Supabase Admin SDK.
2. Use Netlify Identity or an equivalent mechanism where the token is never embedded in the JS bundle.
Remove `VITE_STORE_API_SECRET` entirely. Rename to `STORE_API_SECRET` (no `VITE_` prefix) so Vite does not inline it.

---

## Updated Summary Table

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| CRITICAL-1 | CRITICAL | Hardcoded contractor passwords in client bundle | STILL OPEN |
| CRITICAL-2 | CRITICAL | Contractor session token is forgeable `btoa` string | STILL OPEN |
| CRITICAL-3 | — | `/api/store` open to public internet | FIXED |
| CRITICAL-4 | — | Xero function accepts `client_secret` from request | FIXED |
| HIGH-1 | HIGH | Real employee PII hardcoded in JS bundle | STILL OPEN |
| HIGH-2 | HIGH | SolarEdge API key in client-side URL query string | STILL OPEN |
| HIGH-3 | HIGH | Third-party API keys in `localStorage` | STILL OPEN |
| HIGH-4 | HIGH | Role-based access control is client-side only | STILL OPEN |
| HIGH-5 | HIGH | Contractor passwords compared plaintext in browser | STILL OPEN |
| NEW-HIGH-1 | HIGH | Xero OAuth tokens (including refresh token) in `localStorage` | NEW |
| NEW-HIGH-2 | HIGH | `VITE_STORE_API_SECRET` inlined in public JS bundle | NEW |
| MEDIUM-1 | MEDIUM | No input validation or XSS sanitization | STILL OPEN |
| MEDIUM-2 | — | CORS wildcard on DB endpoint | FIXED |
| MEDIUM-3 | MEDIUM | No server-side credential management | STILL OPEN |
| LOW-1 | LOW | Source identifiers in non-prod builds | STILL OPEN |
| LOW-2 | LOW | No HTTP security headers in netlify.toml | STILL OPEN |

**Totals:** 2 Fixed | 2 New HIGH | 3 Critical Open | 7 High Open | 2 Medium Open | 2 Low Open

---

## Priority Remediation Path (Updated)

1. **Immediate — NEW-HIGH-2:** Rename `VITE_STORE_API_SECRET` to `STORE_API_SECRET`. Replace client-side secret injection in `db.ts` with Supabase JWT-based authentication so the bearer token is never in the bundle.

2. **Immediate — CRITICAL-1 / HIGH-5:** Remove all `password` fields from `contractorData.ts` and `contractorStore.ts`. Migrate contractor login to Supabase Auth.

3. **Immediate — CRITICAL-2:** Replace `btoa` contractor tokens with server-generated, server-verified tokens. Sign with `HMAC-SHA256` at minimum, or use Supabase Auth sessions.

4. **Short-term — NEW-HIGH-1:** Move Xero refresh token storage server-side. Remove `XERO_CLIENT_SECRET` from `localStorage`. Use `sessionStorage` for access tokens.

5. **Short-term — HIGH-2:** Proxy SolarEdge calls through a Netlify function; pass `api_key` as a server-side header.

6. **Short-term — HIGH-1:** Move user and contractor records to the database; query via an authenticated API call at login.

7. **Medium-term — HIGH-4:** Implement Supabase RLS policies per table/key. Enforce roles server-side, not in React state.

8. **Medium-term — LOW-2:** Add security headers block to `netlify.toml` as shown above.
