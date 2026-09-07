---
date: 2026-09-07
status: implemented-and-locally-verified
---

# Login fix plan and implementation

User instruction: plan and implement the fixes, and always check that the work reaches the root of the issue. For each finding, identify the faulty assumption or owning component, reproduce the failure, fix the shared cause, and verify the original trigger plus adjacent cases. Do not mark a finding resolved from a cosmetic change or a passing helper test alone.

## Plan and causal analysis

| Issue | Root cause | Implementation and regression |
| --- | --- | --- |
| Contractor restore bypass | Browser mode/id flags were treated as proof of authentication, bypassing normal identity and approval checks. | Remove the shortcut and old encoded browser-token validator. Resolve the authenticated session to an approved contractor by its email/alias. Test missing session, mismatched cached ID, suspended account and normal restoration on all three profiles. |
| Contractor logout restores access | Logout skipped the SDK sign-out operation in contractor mode. | Sign out the current SDK session in both portals and reload only after success. Test actual mocked logout request, cleared session, and reload. Surface sign-out failures. |
| Forced password prompt disappears on reload | Restore did not reapply the requirement. Completion lived in duplicate auth metadata and contractor-cache flags. | Restore auth requirement in either portal. Explicit auth completion overrides a stale legacy contractor flag; absent auth metadata falls back to the legacy requirement. Test reload, rejected update and durable successful completion. |
| Password update false completion / stale blob write | Staff and contractor had separate save paths, ignored errors, and an obsolete dbGet returned null before a whole-blob write containing a plaintext password. | One awaited auth update sends password and completion flag together. No password enters contractor state or the contractor sync path. Keep the prompt on failure. |
| Recovery false success | Both forms ignored the provider error result. | Only show confirmation after success; preserve generic account-enumeration-safe messaging, accessible failure and retry. Re-run the original synthetic503 case. |
| Inconsistent login UI | Missing semantic relationships and undersized interactive areas across separate forms. | Associate fields and labels, announce errors, name visibility controls and increase mobile hit areas. Run the original desktop/mobile assertions. |
| Login busy state / misleading retry | The old staff retry loop raced the same promise repeatedly; timeout wrappers alone could abandon an operation without canceling it. | Check the underlying SDK transport and implement real request cancellation before claiming timeout safety. Verify an aborted request cannot later persist a successful response. |
| Contractor identity mismatch | Fresh login compared email/aliases differently from restore. | Normalize case/whitespace consistently and reject empty identities. |

## Scope

This implements the reviewed login/client-session issues and their testing infrastructure. No deployment is included. Backend authorization remains protected roles/RLS, independent of user metadata and client UI gates. Server enforcement of mandatory password rotation, genuine passkey identity verification, provider delivery and physical-device behavior remain separate verification work; this patch does not certify them.

Accepted product decisions remain unchanged: office-only internal costs in customer copies, recoverable service-order archive, and current sales access.

## Validation

The original browser assertions now pass 79/79, up from 48 passes and 31 failures. The new session regression suite passes 33/33. Both suites ran against the final auth transport using isolated desktop Chromium, mobile Chromium and mobile WebKit contexts. No browser scenarios were blocked. The original audit remains preserved in [[07 Desktop and mobile login audit]] and [[08 Login source review]].


- Auth-routing/password-state unit checks: 15 passed.
- Transport unit/integration checks: 8 passed, including real request cancellation, stalled-body cancellation, caller abort forwarding, late-success rejection and SDK no-session-persistence after timeout.
- Required `pnpm run build` passed its environment check, TypeScript project build and Vite bundle. Existing font-import ordering and chunk-size warnings remain; they did not fail the build.
- New mobile contractor screenshot visually inspected; no clipping introduced by larger controls.
- Root causes covered by session scenarios: no-auth cached flags, identity mismatch, suspended-account denial, approved restoration, logout plus reload, both portals' forced-password reload gates, rejected updates, and successful auth-only updates with no password in application APIs/localStorage.
- No app deployment or live account/data change was performed.

[UI result summary](login-fix-evidence/ui-results.json), [session result summary](login-fix-evidence/session-results.json), [mobile contractor screen](login-fix-evidence/mobile-contractor.png), [recovery failure with retry](login-fix-evidence/mobile-recovery-error.png).

## Root-cause boundary and next verification

The transport fix cancels actual auth network requests at 12 seconds rather than only stopping UI waiting. The SDK retains its own bounded refresh retry policy. Aborting a request cannot undo a server operation that already completed; uncertain password-update delivery should be retried/reconciled with the provider rather than treated as rollback.

These results establish the covered local client behavior. A staging pass with designated test accounts is still needed for actual successful sign-in, provider reset-email delivery, protected role/RLS enforcement, and invalid/expired reset links. Physical iOS/Android passkey, keyboard and password-manager checks remain. Mandatory password-change state currently resides in user metadata with legacy contractor fallback; it is a client workflow requirement, not server-enforced password-rotation policy. No claim is made that this change closes that separate backend-policy question.
