---
date: 2026-09-07
status: source-reviewed
scope: desktop-and-mobile-login
---

# Login source review

Reviewed current source under the reconciled [[00 Current documentation guidance]]. These findings describe reachable client logic, not verified production access or backend authorization failures. No application code, accounts, live records, or credentials were changed or used. Browser verification is recorded separately by the login audit runner.

## Priority findings

1. **P1: Contractor logout retains the authenticated session.** [App.tsx:1377](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:1377) removes local mode flags but calls Supabase sign-out only outside contractor mode, then reloads. [Restore at line 1218](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:1218) automatically restores a contractor session when an approved cached record matches. A normal approved contractor can therefore return to their portal immediately after Logout. Test both desktop and mobile reloads; expected outcome is a login screen and no usable session.

2. **P1: Contractor session shortcut trusts browser flags and cached status.** [App.tsx:1189](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:1189) marks the app authenticated from sessionStorage and a local contractor lookup without first checking the Supabase session, identity match, or approval. [Rendering at line 3228](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:3228) only treats pending specially; suspended/rejected cached records otherwise enter the portal. Test expired/missing sessions, mismatched cached identity, missing record, suspended record, and tab reopening. This establishes a client isolation defect; backend protected access must be evaluated independently.

3. **P1: Forced password change is bypassed by reload.** The flag starts false [at line 784](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:784). Fresh staff and contractor login enforce it, but both restore branches [at line 1186](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:1186) authenticate without restoring the requirement. Test first-login password prompt followed by reload and new-tab restoration; the prompt must persist until a confirmed update succeeds.

4. **P1: Contractor password update can report completion after failure.** [App.tsx:3196](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:3196) ignores the returned updateUser error and subsequently clears the password-change UI. Its dbGet call is also obsolete: [db.ts:31](/Users/cex/SolarOps÷/solarflow-dashboard/src/lib/db.ts:31) always returns null, so the callback constructs an empty contractor array and attempts to sync it rather than updating the intended record. It additionally places the new plaintext password in currentContractor state. Do not infer database deletion or plaintext persistence from this alone: downstream merge/access controls were not fully traced. Mock rejected password updates and verify the prompt stays open, the error is visible, and no contractor KV write occurs.

5. **P2: Authentication and recovery have inconsistent failure handling.** Contractor password and passkey handlers [at line 57](/Users/cex/SolarOps÷/solarflow-dashboard/src/components/contractor/ContractorLoginScreen.tsx:57) have no try/finally or timeout; rejected promises can leave loading stuck. Both reset-email flows ignore returned errors and show sent confirmation even for provider/network failures: [staff line 342](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:342), [contractor line 140](/Users/cex/SolarOps÷/solarflow-dashboard/src/components/contractor/ContractorLoginScreen.tsx:140). Preserve account-enumeration protection while testing transport failure and retry recovery. Staff [timeout helper line 247](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:247) repeatedly races the same promise, so its logged retries do not issue fresh requests.

6. **P2: Fresh contractor login and durable restore match emails differently.** Fresh password/passkey login uses exact case-sensitive matching [at line 78](/Users/cex/SolarOps÷/solarflow-dashboard/src/components/contractor/ContractorLoginScreen.tsx:78); [resolveSessionRoute](/Users/cex/SolarOps÷/solarflow-dashboard/src/lib/authRouting.ts:35) lowercases the primary and alternate emails. Test mixed-case stored email/alias with the same identity through fresh login and restoration.

7. **P2: Login form controls lack programmatic labels.** Staff [email/password controls](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:435) and contractor [email/password controls](/Users/cex/SolarOps÷/solarflow-dashboard/src/components/contractor/ContractorLoginScreen.tsx:265) have separate labels without htmlFor/id association. Contractor password visibility [button at line 304](/Users/cex/SolarOps÷/solarflow-dashboard/src/components/contractor/ContractorLoginScreen.tsx:304) has no accessible name. Test accessible field names, keyboard order, error announcement, password visibility name/state, and narrow viewport usability.

## Further authentication checks

- The frontend uses user_metadata for routing and defaults a missing staff role to admin: [fresh login](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:227), [restore](/Users/cex/SolarOps÷/solarflow-dashboard/src/App.tsx:1233). Protected user_roles remain the accepted authorization source. Test missing/stale metadata and disagreement with protected roles; do not treat UI role selection as proof of backend privilege.
- [Passkey helpers](/Users/cex/SolarOps÷/solarflow-dashboard/src/lib/passkey.ts:15) generate local challenges and retain credential IDs; login then resumes an existing Supabase session. No server assertion verification or credential-to-session account binding appears in these helpers. Test canceled enrollment, canceled authentication, expired session, and two-account use on one device. Label this as current session-unlock behavior when reviewing product expectations; genuine iOS/Android biometric UX still needs physical-device verification.
- Keep current sales access unchanged. Include sales fresh login and restoration in subsequent isolated role fixtures.

## Existing verification

Executed only `pnpm exec vitest run src/__tests__/authRouting.test.ts` in the dashboard: **8 tests passed**, 1 file, on September 7. This covers pure routing helper behavior including case-insensitive aliases and contractor denial. It does not exercise the App restore shortcut, logout, password updates, browser accessibility, or networking.

The existing [Playwright configuration](/Users/cex/SolarOps÷/solarflow-dashboard/playwright.config.ts) targets Desktop Chrome only. The legacy [contractor-flow.spec.ts](/Users/cex/SolarOps÷/solarflow-dashboard/src/__tests__/e2e/contractor-flow.spec.ts) contains embedded credential constants and job/photo mutation steps, and assumes URL transitions absent from current state-based login routing. It was not run. Use a dedicated isolated login config with synthetic accounts, mocked APIs, and blocked external traffic.

## Isolated reproduction fixtures

For logout restoration, provide a synthetic approved contractor in localStorage key `solarflow_contractors`, with a unique ID and matching synthetic email. Start with sessionStorage keys `solarflow_contractor_mode=true` and `solarflow_contractor_id=<fixture-id>`, plus a mocked valid Supabase session for that identity. Use an isolated origin and mock all APIs before navigating. Click Logout, allow the reload, and assert both a sign-out request and return to login; the current implementation is expected to fail. Mock notification, sync, and push requests as well so startup cannot touch a real system.

For the unchecked restore shortcut, omit the Supabase session but keep the contractor flags and synthetic approved record. The login screen should remain visible; current source instead sets authenticated contractor mode. Repeat with suspended status. Populate required presentation fields or use a complete synthetic Contractor fixture to avoid unrelated rendering failures. Never use real cached vault/customer data as the fixture.

Desktop/mobile matrix: desktop Chromium, mobile Chromium viewport, mobile WebKit viewport; logged-out staff/contractor switching, required/invalid fields, wrong credentials, transport error/retry, password reset success/failure, approved/pending/rejected contractor, logout, reload/new-tab session restore, forced password change, accessibility labels, and horizontal overflow. Emulation does not certify native password-manager, keyboard, biometric, or installed-PWA behavior.

## Fix follow-up

The user authorized implementation after this initial review. See [[09 Login fix plan and implementation]] for the root-cause changes and passing local regression results. The findings above preserve the pre-fix observations.
