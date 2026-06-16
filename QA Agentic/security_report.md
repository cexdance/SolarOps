# SolarOps Security Audit Report

**Date:** 2026-05-29
**Auditor:** Claude Code (automated static analysis)
**Scope:** solarflow-dashboard/src/, api/, .env files, package.json
**Stack:** React 18 + TypeScript + Vite + Supabase + Vercel serverless

---

## 1. Dependency Audit

### Direct Dependencies (selected)

| Package | Version |
|---|---|
| react | ^18.3.1 |
| @supabase/supabase-js | ^2.99.2 |
| vite | ^6.0.1 |
| @vercel/node | ^5.6.15 |
| xlsx | ^0.18.5 |
| recharts | ^2.12.4 |
| resend | ^6.11.0 |
| zod | ^3.24.1 |
| react-router-dom | ^6 |
| leaflet | ^1.9.4 |
| playwright | 1.57.0 |

### npm audit summary

**Total vulnerabilities: 21 (0 critical, 11 high, 10 moderate)**

High-severity packages:
- `@vercel/node` chain: path-to-regexp (ReDoS), undici (HTTP smuggling, CRLF injection, DoS), minimatch (ReDoS), flatted (prototype pollution). Fix: upgrade to `@vercel/node@^4.0.0` (semver-major).
- `lodash`: code injection via `_.template`, prototype pollution via `_.unset`/`_.omit`.
- `picomatch`: method injection, ReDoS via extglob quantifiers.
- `vite`: path traversal in optimized deps `.map` handling, arbitrary file read via dev server WebSocket.
- `xlsx` (SheetJS): prototype pollution, ReDoS. No fix available upstream.

---

## 2. Committed Secrets Scan

**No secrets are committed to git history.** `git ls-files | grep .env` returns only `.env.example`. The live env files are correctly gitignored.

However, several local env files on disk contain real credentials. These are not in git but warrant awareness:

| File | Secret types present |
|---|---|
| `solarflow-dashboard/.env` | Supabase URL, Supabase anon key, Supabase service-role key, SolarEdge API key, Xero client ID, Xero client secret, Google Maps API key |
| `solarflow-dashboard/.env.production` | Same set plus VERCEL_OIDC_TOKEN, Trello API key, Trello token |
| `solarflow-dashboard/.env.local` | VERCEL_OIDC_TOKEN, Trello API key, Trello token |
| `.env.vercel.prod` (repo root) | Resend API key, SolarEdge API key, Supabase service-role key, VERCEL_OIDC_TOKEN, all VITE_ keys |
| `.env.vercel.local` (repo root) | Resend API key, SolarEdge API key, VERCEL_OIDC_TOKEN |

**Key observation:** `SUPABASE_SERVICE_ROLE_KEY` appears in `.env` (development env). If a developer ever runs `git add .` carelessly and the gitignore is misconfigured or deleted, this key would be committed and would grant full database bypass of all RLS policies.

Additionally, `api/notify.ts` line 15 hardcodes the Supabase project URL (`https://cjmhfagkkayelcsprbai.supabase.co`) directly in source, as do `api/users.ts` line 3, `api/send-quote.ts` line 15, and `api/approve-quote.ts` line 12. This is low severity (it is a public URL, not a secret) but exposes the project reference in the public bundle/source map.

---

## 3. Input Validation and Authentication Review

---

### FINDING 1 - CRITICAL: `api/parse-lead-image.ts` has no authentication

**File:** `api/parse-lead-image.ts`, lines 1-100
**Description:** The endpoint accepts a POST with a base64-encoded image and calls the Anthropic Claude Vision API. There is no JWT validation, no IP restriction, and no rate limit. Any unauthenticated caller on the internet can reach this endpoint.
**Impact:** An attacker can call this endpoint repeatedly with arbitrary images (or large payloads) and exhaust the `ANTHROPIC_API_KEY` quota, resulting in denial of service for the legitimate parse-lead workflow and unexpected API cost. The Anthropic key is also indirectly amplified by this exposure.
**Remediation:** Add the same JWT verification pattern used in `notify.ts` lines 38-46: extract `Authorization: Bearer <token>` from the request header, verify it against `${SUPABASE_URL}/auth/v1/user`, and return 401 if the check fails. Add this before the `imageBase64` check.

---

### FINDING 2 - CRITICAL: `api/xero-token.ts` has no authentication (Xero OAuth token exchange is open)

**File:** `api/xero-token.ts`, lines 1-30
**Description:** This endpoint proxies the Xero OAuth 2.0 authorization code exchange (`POST https://identity.xero.com/connect/token`). It injects the `XERO_CLIENT_SECRET` server-side (good), but performs zero authentication of the caller. Any unauthenticated request can trigger the token exchange using an attacker-supplied authorization code.
**Impact:** An attacker who intercepts or reuses a valid Xero `code` parameter (e.g., through a CSRF or phishing attack against a Xero user) can exchange it for access tokens via this open endpoint. The endpoint also leaks the fact that the app is integrated with Xero.
**Remediation:** Add Supabase JWT verification before the token exchange. The Xero OAuth flow should also validate a `state` parameter (CSRF token) generated at the start of the authorization flow and stored in the user session, compared against what is returned by the Xero redirect. This is missing.

---

### FINDING 3 - CRITICAL: `api/solaredge.ts` has no authentication (public proxy to telemetry API)

**File:** `api/solaredge.ts`, lines 34-86
**Description:** The SolarEdge proxy accepts any GET request with a `path` query parameter and forwards it to `https://monitoringapi.solaredge.com`. There is no JWT check. Any unauthenticated caller can use this endpoint as a free proxy for the company's SolarEdge API key.
**Impact:**
1. Credential abuse: the SolarEdge API key (injected server-side) can be consumed to exhaustion by any external caller. SolarEdge free tier is ~300 calls/day.
2. SSRF partial risk: the `path` parameter is concatenated directly into `SOLAREDGE_BASE + path` with no allowlist validation. An attacker can enumerate any SolarEdge API path (e.g., `/sites/{id}/details`, `/equipment/{id}/list`) for all sites visible to this API key, even sites not belonging to the company.
**Remediation:**
1. Add Supabase JWT verification before processing the request.
2. Restrict the `path` parameter to an explicit allowlist of known paths: `/sites/list`, `/sites/:id/overview`, `/sites/:id/energy`, `/sites/:id/equipment`. Reject anything not on the list with a 400.

---

### FINDING 4 - HIGH: `api/xero-api.ts` forwards arbitrary paths to `api.xero.com` with no path validation

**File:** `api/xero-api.ts`, lines 9-10
**Description:** The proxy constructs `upstreamUrl = "https://api.xero.com" + req.url`. The `req.url` is the raw Vercel request path, which is caller-controlled. There is no path allowlist. An authenticated caller (JWT check is present via the `Authorization` header passthrough, but only Xero's auth, not the app's own user auth) can send any path to Xero.
**Impact:** An authenticated Xero user of the app can reach Xero admin endpoints that may not be intended to be exposed through the app's proxy (e.g., Xero Files API, Xero Payroll endpoints). The auth check (`if (!auth) return 401`) only validates that an authorization header is present, it does not verify that the header is a valid app user JWT.
**Remediation:** Add Supabase JWT verification. Also add a path prefix allowlist (e.g., only allow paths starting with `/api.xro/2.0/` or specific Xero REST resources used by the app).

---

### FINDING 5 - HIGH: `api/ups-tracking.ts` has no authentication

**File:** `api/ups-tracking.ts`, lines 28-80
**Description:** This endpoint is open to unauthenticated callers. Currently it returns a mocked response, but the code comment notes it will be upgraded to a real UPS API call using `UPS_ACCESS_TOKEN`. If that upgrade happens without adding auth, the real UPS credential will be open to abuse.
**Impact:** Currently low due to mocking, but the pattern is dangerous. When the real UPS API is wired in, it will be immediately exploitable for credential exhaustion.
**Remediation:** Add Supabase JWT verification now, before the endpoint is connected to a real API. Do not defer this to the "production upgrade."

---

### FINDING 6 - HIGH: `api/trello-card.ts` has no authentication

**File:** `api/trello-card.ts`, lines 24-70
**Description:** The Trello card proxy accepts any GET request with a `cardId` parameter. No JWT check is performed. The `cardId` extraction regex (`/trello\.com\/c\/([a-zA-Z0-9]+)/`) only applies when a full URL is passed; otherwise `cardId.trim()` is used directly with no further sanitization, allowing any string to be forwarded to the Trello API.
**Impact:** Any unauthenticated caller can use the company's Trello credentials (`TRELLO_API_KEY` + `TRELLO_API_TOKEN`) to read arbitrary Trello cards visible to those credentials, including cards from other Trello boards the account can access.
**Remediation:** Add Supabase JWT verification. Optionally add stricter `cardId` format validation (Trello short IDs are 8 alphanumeric characters).

---

### FINDING 7 - HIGH: `api/approve-quote.ts` renders unsanitized `wo_number` from database into HTML response

**File:** `api/approve-quote.ts`, lines 83 and 114
**Description:** The `wo_number` value fetched from Supabase is interpolated directly into an HTML string with `<strong>${quote.wo_number}</strong>` and sent as a `text/html` response. This value comes from the database but was originally set by the `send-quote.ts` handler from the caller-supplied `woNumber` body parameter, which has no HTML escaping.
**Impact:** If an attacker or rogue staff member creates a quote with a crafted `woNumber` containing HTML/JavaScript, any customer who clicks the approval link will execute that script in their browser. This is a stored XSS on a public-facing, unauthenticated HTML page (the approval link requires no login).
**Remediation:** HTML-escape `wo_number` and `grand_total` before interpolation. A minimal helper:
```ts
function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```
Apply to `quote.wo_number` at lines 83 and 114. Also validate `woNumber` in `send-quote.ts` to reject values that are not alphanumeric plus hyphens/spaces.

---

### FINDING 8 - HIGH: `api/send-report.py` uses wildcard CORS and accepts SMTP credentials per-request

**File:** `api/send-report.py`, lines 84, 92
**Description:** The Python email relay sets `Access-Control-Allow-Origin: *` on all responses. The request body includes `smtpUser` and `smtpPass` in plaintext. Any page on any origin can call this endpoint.
**Impact:** Cross-site requests can trigger email sends using the caller's SMTP credentials. Combined with a XSS vulnerability elsewhere on the app, an attacker could exfiltrate the SMTP password from a victim's browser session and use it to send arbitrary email or gain SMTP account access.
**Remediation:** Restrict CORS to the app's own origin (`https://solarflow-dashboard-sooty.vercel.app` or the production domain). Consider using a server-side stored SMTP credential (not passed per-request) to avoid transmitting passwords over the wire.

---

### FINDING 9 - MEDIUM: `VITE_TRELLO_API_KEY` and `VITE_TRELLO_TOKEN` are browser-bundle-exposed credentials

**Files:** `solarflow-dashboard/.env.production` lines 29-30, `solarflow-dashboard/.env.local` lines 5-6
**Description:** Vite inlines all `VITE_`-prefixed variables into the client-side JavaScript bundle at build time. `VITE_TRELLO_API_KEY` and `VITE_TRELLO_TOKEN` are defined with the `VITE_` prefix in multiple env files, which means they are embedded in the production JS bundle and visible to anyone who inspects the page source or network traffic.
**Impact:** Any visitor to the app can extract the Trello API key and token and use them to read, create, update, or delete Trello cards (and potentially board data) on the connected account.
**Remediation:** Remove `VITE_TRELLO_API_KEY` and `VITE_TRELLO_TOKEN` from all env files. The `api/trello-card.ts` serverless function already reads `process.env.TRELLO_API_KEY` and `process.env.TRELLO_API_TOKEN` (non-VITE). Ensure all client-side Trello calls go through that proxy and remove any direct Trello API calls from `src/lib/trelloImport.ts` or other browser-side code.

---

### FINDING 10 - MEDIUM: `VITE_GOOGLE_MAPS_API_KEY` is browser-exposed with no API key restriction

**Files:** `solarflow-dashboard/.env` line 21, `solarflow-dashboard/src/components/Settings.tsx` line 120, `src/components/WorkOrderPanel.tsx` line 187, `src/components/AddressAutocomplete.tsx` lines 150, 171
**Description:** The Google Maps API key is embedded in the browser bundle via the `VITE_` prefix and is used directly in client-side calls to Google Maps. It is also stored in `sessionStorage`.
**Impact:** The key can be extracted from the bundle and used by anyone to make Maps API calls billed to the account.
**Remediation:** In the Google Cloud Console, restrict this API key to specific HTTP referrers (the production domain only) and to specific APIs (Maps JavaScript API, Places API only). A referrer-restricted key is safe to expose in a browser bundle.

---

### FINDING 11 - MEDIUM: `api/xero-token.ts` lacks CSRF state parameter validation

**File:** `api/xero-token.ts`, lines 1-30
**Description:** Xero OAuth 2.0 requires a `state` parameter to prevent CSRF attacks on the authorization code flow. The token exchange endpoint does not check or enforce a `state` value. (See also Finding 2.)
**Impact:** An attacker who can craft a Xero redirect to the app's callback can exchange a legitimate authorization code for tokens.
**Remediation:** Generate a cryptographically random `state` value at the start of the OAuth flow, store it in the user session, and verify it matches the `state` parameter in the callback before calling `xero-token.ts`.

---

### FINDING 12 - MEDIUM: `src/lib/trelloImport.ts` embeds 292 customer email addresses in the source bundle

**File:** `solarflow-dashboard/src/lib/trelloImport.ts` (31,580 lines, ~1.1 MB)
**Description:** This file is auto-generated and contains 326 imported Trello cards representing real leads and customers, including 292 unique email addresses, names, addresses, and phone numbers. The file is committed to the git repository and is included in the client-side JavaScript bundle served to every authenticated user.
**Impact:** Any authenticated user (including low-privilege staff) who can access the app can extract all 292 customer email addresses and associated PII from the browser's memory or network response. The file also inflates the bundle size significantly, slowing the app for all users.
**Remediation:** Remove `trelloImport.ts` from the source tree and the git repository. Store customer data exclusively in Supabase. Use the existing Trello card proxy (`api/trello-card.ts`) to fetch cards on demand, or run the import script server-side and store records directly in the database. Purge the file from git history using `git filter-repo` or BFG to prevent historical exposure.

---

### FINDING 13 - MEDIUM: `api/xero-api.ts` does not verify app user identity, only Xero token presence

**File:** `api/xero-api.ts`, lines 4-6
**Description:** The auth check is `if (!auth) return 401`. This checks that an `Authorization` header exists, but does not validate that it is a valid Supabase JWT for an authenticated app user. An attacker with a valid Xero token (obtained by any means) can make arbitrary Xero API calls through this proxy without being an authenticated app user.
**Impact:** Privilege escalation: a user who has a Xero token but no SolarOps account can use the proxy to interact with the company's Xero account.
**Remediation:** Add Supabase JWT verification in addition to checking for the Xero auth header.

---

### FINDING 14 - LOW: Hardcoded Supabase project URL in serverless functions

**Files:** `api/notify.ts:15`, `api/users.ts:3`, `api/send-quote.ts:15`, `api/approve-quote.ts:12`
**Description:** The Supabase project URL (`https://cjmhfagkkayelcsprbai.supabase.co`) is hardcoded as a string literal in four serverless functions instead of reading from `process.env.SUPABASE_URL`.
**Impact:** Low severity, but it makes the project reference visible in source code and makes environment migration (e.g., moving to a staging project) require code changes rather than env var changes.
**Remediation:** Replace the hardcoded URL with `process.env.SUPABASE_URL` and set the env var in Vercel alongside the other Supabase vars.

---

### FINDING 15 - LOW: Content Security Policy uses `unsafe-inline` for scripts

**File:** `vercel.json`, line 58
**Description:** The global CSP includes `script-src 'self' 'unsafe-inline'`, which permits inline JavaScript execution. This significantly weakens XSS protection because any injected script tag or inline event handler will execute.
**Impact:** If an XSS is introduced (e.g., via Finding 7 or future template injection), the `unsafe-inline` directive ensures the injected script will run. A strict CSP with nonces or hashes would block it.
**Remediation:** Replace `'unsafe-inline'` in `script-src` with a nonce-based or hash-based approach. For a Vite SPA, this requires generating a nonce at the CDN edge or switching to a strict dynamic policy. At minimum, remove `unsafe-inline` from `script-src` and use `'strict-dynamic'` if nonce injection is not feasible.

---

### FINDING 16 - LOW: `xlsx` (SheetJS) has no available fix

**File:** `solarflow-dashboard/package.json`
**Description:** The `xlsx@^0.18.5` package has two known vulnerabilities (prototype pollution, ReDoS) with no upstream fix available.
**Impact:** Low in practice if xlsx is only used server-side or only with trusted file inputs, but if the app allows user-supplied XLSX uploads, prototype pollution could lead to application-level DoS or logic corruption.
**Remediation:** Audit all uses of `xlsx` in the codebase. If it processes user-supplied files, add input size limits and consider migrating to `exceljs` or `fast-xlsx` which do not have these open CVEs.

---

## 4. Bundle Exposure Analysis

| Variable | Prefix | Exposed in bundle | Severity |
|---|---|---|---|
| VITE_SUPABASE_URL | VITE_ | Yes | Acceptable (public URL) |
| VITE_SUPABASE_ANON_KEY | VITE_ | Yes | Acceptable (designed for browser use with RLS) |
| VITE_TRELLO_API_KEY | VITE_ | Yes | HIGH - full account access credential |
| VITE_TRELLO_TOKEN | VITE_ | Yes | HIGH - full account access credential |
| VITE_GOOGLE_MAPS_API_KEY | VITE_ | Yes | MEDIUM - must be referrer-restricted |
| VITE_XERO_CLIENT_ID | VITE_ | Yes | Low - client_id is public in OAuth flows |
| VITE_RC_CLIENT_ID | VITE_ | Yes | Low - depends on service |
| SUPABASE_SERVICE_ROLE_KEY | none | No | Correct - server only |
| XERO_CLIENT_SECRET | none | No | Correct - server only |
| SOLAREDGE_API_KEY | none | No | Correct - server only |
| RESEND_API_KEY | none | No | Correct - server only |

The service-role key is correctly kept server-side only. The anon key exposure is intentional and safe assuming Supabase RLS policies are correctly configured (not verifiable from source alone).

---

## 5. Sync Engine and Data Integrity

`src/lib/syncEngine.ts` uses a last-writer-wins strategy on `updated_at` for conflict resolution. Identified risks:

- **No server-side timestamp authority:** `updated_at` is set by the client before pushing to Supabase. A client with a manipulated system clock can win all conflict resolutions and overwrite other users' changes.
- **Deleted customer IDs stored in localStorage:** `getDeletedCustomerIds()` relies on localStorage. Cross-browser sync of deletions is not guaranteed, meaning a record deleted on one device may reappear when synced from another.
- **No write authorization at the row level:** Supabase upserts go through the anon key with the authenticated user session. Without verified RLS policies, any authenticated user may be able to upsert records belonging to other users. RLS policies cannot be confirmed from source alone.

**Remediation:** Use `now()` or a Supabase database trigger to set `updated_at` server-side. Move the deleted ID set to a Supabase table with RLS.

---

## Summary Table

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | CRITICAL | api/parse-lead-image.ts | No authentication, open Anthropic API proxy |
| 2 | CRITICAL | api/xero-token.ts | No authentication on OAuth token exchange |
| 3 | CRITICAL | api/solaredge.ts | No authentication, open SolarEdge proxy with no path allowlist |
| 4 | HIGH | api/xero-api.ts | No app user auth, arbitrary Xero path forwarding |
| 5 | HIGH | api/ups-tracking.ts | No authentication (pre-production risk) |
| 6 | HIGH | api/trello-card.ts | No authentication, credential abuse risk |
| 7 | HIGH | api/approve-quote.ts | Stored XSS via unsanitized wo_number in HTML |
| 8 | HIGH | api/send-report.py | Wildcard CORS, SMTP credentials transmitted per-request |
| 9 | MEDIUM | .env files | VITE_TRELLO_API_KEY + VITE_TRELLO_TOKEN exposed in bundle |
| 10 | MEDIUM | .env + src/ | VITE_GOOGLE_MAPS_API_KEY exposed, no key restriction |
| 11 | MEDIUM | api/xero-token.ts | No CSRF state parameter validation in OAuth flow |
| 12 | MEDIUM | src/lib/trelloImport.ts | 292 customer emails embedded in source/bundle |
| 13 | MEDIUM | api/xero-api.ts | App user identity not verified (only Xero token presence) |
| 14 | LOW | api/*.ts (4 files) | Hardcoded Supabase project URL |
| 15 | LOW | vercel.json | CSP uses unsafe-inline for script-src |
| 16 | LOW | package.json | xlsx with unfixable CVEs |

---

*Report generated by automated static analysis. No secrets were printed. No exploits were attempted.*
