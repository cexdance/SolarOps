# SolarOps Security Audit Report
**Date:** 2026-03-16
**Auditor:** Claude Security Agent
**Scope:** `/Users/cex/SolarOps÷/solarflow-dashboard/src` + `/netlify/functions`

---

## Executive Summary

The application has **4 Critical** and **5 High** severity findings. The most severe issue is a client-side-only authentication system with a hardcoded password displayed in the UI source. There is no backend authentication, no session tokens, no input validation library, and a Netlify database endpoint fully open to the public internet.

---

## Findings

---

### [CRITICAL-1] Hardcoded Password in Client Source Code
**File:** `src/App.tsx:78, 179, 189`
**Evidence:**
```
if (user && password === '1357')
<p className="text-xs text-slate-300">Password: 1357</p>  // line 179
<p className="text-xs text-slate-300">Password: 1357</p>  // line 189
```
The admin password `1357` is hardcoded in the JavaScript bundle and rendered in the DOM as a visible hint. Anyone who opens DevTools or views source has full credentials.
**Recommendation:** Replace with a real auth provider (Supabase Auth, Auth0, Clerk). Never embed passwords in client code.

---

### [CRITICAL-2] All Authentication is Client-Side Only — Trivially Bypassed
**File:** `src/App.tsx:236-242, 355`
**Evidence:**
```
const stored = localStorage.getItem('solarflow_auth');  // line 238
localStorage.setItem('solarflow_auth', isAuthenticated ? 'true' : 'false');  // line 355
```
Authentication state is a plain `'true'/'false'` string in `localStorage`. Any user can open the browser console and run `localStorage.setItem('solarflow_auth', 'true')` to bypass the login screen entirely. There is no server-issued session token, no JWT, no cookie with `HttpOnly`.
**Recommendation:** Implement server-side authentication with signed session tokens. Authentication state must be validated by the server on each request.

---

### [CRITICAL-3] Netlify `/api/store` Endpoint Has No Authentication
**File:** `netlify/functions/store.mts` (full file)
**Evidence:**
```js
const headers = { 'Access-Control-Allow-Origin': '*', ... };
// No auth check whatsoever before reading/writing to Postgres
if (req.method === 'GET') { const rows = await sql`SELECT data FROM stores WHERE key = ${key}`; }
if (req.method === 'POST') { ... await sql`INSERT INTO stores ...` }
```
The database API endpoint accepts GET (read any record) and POST (write any record) from any origin, with zero authentication. This is the application's entire persistence layer — all operational data (customers, work orders, invoices, contractor data) is readable and writable by any anonymous HTTP request.
**Recommendation:** Add authentication middleware. Require a verified session token or API secret on every request. Restrict `Access-Control-Allow-Origin` to the app's domain.

---

### [CRITICAL-4] Xero `client_secret` Accepted From Request Body
**File:** `netlify/functions/xero-token.mts`
**Evidence:**
```js
const clientSecret = params.get('client_secret') || process.env.XERO_CLIENT_SECRET;
```
The function accepts `client_secret` from the incoming request body as a first-class option. Any caller can inject an arbitrary `client_secret`, effectively using this function as an open Xero token-exchange proxy for any app, not just SolarOps. The comment says "server-side, keeps client_secret safe" — but the implementation does the opposite.
**Recommendation:** Remove the `params.get('client_secret')` branch entirely. Always use `process.env.XERO_CLIENT_SECRET` only.

---

### [HIGH-1] Real Employee PII and Email Addresses Hardcoded in Source
**File:** `src/App.tsx:46-54`
**Evidence:**
```js
{ id: 'user-1', name: 'Cesar Jurado (Admin)', email: 'cesar.jurado@conexsol.us', role: 'admin' },
{ id: 'user-2', name: 'Carlos Valbuena (COO)', email: 'carlos.valbuena@conexsol.us', role: 'coo' },
// ... 7 more employees with real names, emails, roles
```
Real employee names, corporate email addresses, phone numbers, and organizational roles are hardcoded in the compiled JavaScript bundle. This is exposed to every user and any web crawler.
**Recommendation:** Move user records to a database. Never ship PII in client-side source.

---

### [HIGH-2] SolarEdge API Key Sent as URL Query Parameter from Browser
**File:** `src/App.tsx:708-710`
**Evidence:**
```js
const url = `https://monitoringapi.solaredge.com/sites/list?api_key=${apiKey}&size=100`;
const response = await fetch(url);
```
The SolarEdge API key is appended directly to a URL in the query string. This key will appear in: browser history, server access logs, Netlify request logs, and any network proxy logs. The call is made directly from the browser, bypassing any server-side proxy, and exposes the key in network traffic visible via DevTools.
**Recommendation:** Proxy this call through a Netlify function. Pass the API key as a server-side header, never in a client-side URL.

---

### [HIGH-3] Third-Party API Keys Stored in `localStorage` (Google Maps, RingCentral, Xero)
**File:** `src/components/Settings.tsx:79, 93, 122`
**Evidence:**
```js
localStorage.getItem(GMAPS_KEY_STORAGE)   // Google Maps API key
localStorage.getItem(RC_CLIENT_ID_KEY)    // RingCentral client ID
localStorage.getItem(XERO_CLIENT_ID_KEY)  // Xero OAuth client ID + client secret
```
Sensitive integration credentials are persisted in `localStorage`, which is accessible to any JavaScript running on the page (XSS, browser extensions, shared computers). The Xero `client_secret` is explicitly stored here.
**Recommendation:** API keys should never be stored client-side. Store them server-side (Netlify env vars). Keys that must be user-supplied should use `sessionStorage` at minimum, and a warning should be shown.

---

### [HIGH-4] Role-Based Authorization is Client-Side Only
**File:** `src/App.tsx:391, 850`
**Evidence:**
```js
if (user.role === 'sales') { ... }
if (currentUser?.role === 'sales' && !['crm', 'customers2', 'lobby'].includes(currentView)) { ... }
```
All role checks are UI-level gating only. Because auth state is in `localStorage` and users are hardcoded in the bundle, an attacker who bypasses `localStorage` auth (see CRITICAL-2) gets full admin access with no server-side enforcement.
**Recommendation:** Enforce roles server-side. The `/api/store` endpoint must verify the caller's identity and role before serving or accepting data.

---

### [HIGH-5] Contractor Passwords Compared in Plaintext Client-Side
**File:** `src/App.tsx:63`
**Evidence:**
```js
const contractor = contractors.find(c =>
  (c.email === email || c.altEmails?.includes(email)) && c.password === password
);
```
Contractor passwords are stored somewhere (likely in the Neon DB via `/api/store`) and loaded into client memory, then compared in plaintext in the browser. Passwords are never hashed, and the full contractor object (including `password` field) is loaded into React state.
**Recommendation:** Password comparison must occur server-side. Passwords must be hashed with bcrypt/argon2 at rest. Never load a `password` field into client state.

---

### [MEDIUM-1] No Input Validation or Sanitization Library
**Grep result for:** `sanitize`, `DOMPurify`, `xss`, `zod`, `yup`, `schema` — **zero matches across entire codebase**

No form validation library (Zod, Yup) or XSS sanitization (DOMPurify) is used anywhere. All form inputs flow directly into application state and then into database writes via `/api/store`. While `dangerouslySetInnerHTML` was not found, the absence of any sanitization is a latent injection risk.
**Recommendation:** Add Zod for schema validation on all form inputs. Add DOMPurify if any user content is ever rendered as HTML.

---

### [MEDIUM-2] CORS Wildcard on Database Endpoint
**File:** `netlify/functions/store.mts`
**Evidence:**
```js
'Access-Control-Allow-Origin': '*'
```
Combined with CRITICAL-3 (no auth), this allows any website in any browser to read and write all application data cross-origin.
**Recommendation:** Lock `Access-Control-Allow-Origin` to the specific production domain.

---

### [MEDIUM-3] No `.env` File Found — API Keys Entered via UI and Stored in localStorage
**Finding:** No `.env` or `.env.local` file exists in the project root. All third-party API keys (Google Maps, SolarEdge, RingCentral, Xero) are entered by users through the Settings UI and stored in `localStorage`.
This architecture means the app ships with no credentials but relies entirely on end-users to supply and self-store them insecurely.
**Recommendation:** Pre-configure integration credentials as Netlify environment variables. Expose them only through server-side functions.

---

### [LOW-1] `vite-plugin-source-identifier` Adds `data-matrix` Attributes in Dev/Staging
**File:** `vite.config.ts`
**Evidence:**
```js
sourceIdentifierPlugin({ enabled: !isProd, attributePrefix: 'data-matrix', includeProps: true })
```
The plugin is disabled in production (`BUILD_MODE=prod`), but if a staging build is ever deployed without this flag, React component names, prop names, and source file paths leak into the DOM via HTML attributes.
**Recommendation:** Confirm `BUILD_MODE=prod` is set in all Netlify production build configs. Consider inverting the default to `enabled: false`.

---

### [LOW-2] No `netlify.toml` Security Headers (CSP, X-Frame-Options, HSTS)
**File:** `netlify.toml`
No `[[headers]]` block defining `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, or `X-Content-Type-Options`.
**Recommendation:** Add a `[[headers]]` section with a strict CSP. At minimum add `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

---

## Summary Table

| ID | Severity | Title |
|----|----------|-------|
| CRITICAL-1 | CRITICAL | Hardcoded password `1357` in client source and DOM |
| CRITICAL-2 | CRITICAL | Auth bypassed via `localStorage.setItem` |
| CRITICAL-3 | CRITICAL | `/api/store` DB endpoint open to public internet |
| CRITICAL-4 | CRITICAL | Xero function accepts `client_secret` from request body |
| HIGH-1 | HIGH | Real employee PII hardcoded in JS bundle |
| HIGH-2 | HIGH | SolarEdge API key in client-side URL query string |
| HIGH-3 | HIGH | Third-party API secrets in `localStorage` |
| HIGH-4 | HIGH | Role-based access control is client-side only |
| HIGH-5 | HIGH | Contractor passwords compared plaintext in browser |
| MEDIUM-1 | MEDIUM | No input validation or XSS sanitization library |
| MEDIUM-2 | MEDIUM | CORS wildcard on unauthenticated DB endpoint |
| MEDIUM-3 | MEDIUM | No server-side credential management |
| LOW-1 | LOW | Source identifiers leak in non-prod builds |
| LOW-2 | LOW | No HTTP security headers in netlify.toml |

---

## Priority Remediation Path

1. **Immediate (before any production use):** Replace the fake auth system with a real auth provider (Supabase Auth or Clerk). All user/password data must leave client code entirely.
2. **Immediate:** Add authentication to `/api/store`. No unauthenticated reads or writes to the database.
3. **Immediate:** Remove the `client_secret` passthrough in `xero-token.mts`.
4. **Short-term:** Move all API key storage server-side. Proxy SolarEdge calls through a Netlify function.
5. **Short-term:** Add Zod validation to all form inputs. Add security headers to `netlify.toml`.
