---
date: 2026-09-07
status: initial-audit-complete-with-findings
scope: desktop-and-mobile-login
---

# Desktop and mobile login audit

A reusable browser testing agent is configured at [.codex/agents/login_tester.toml](/Users/cex/SolarOps÷/.codex/agents/login_tester.toml), with [run instructions](/Users/cex/SolarOps÷/context/login-testing-agent.md) and an executable [Playwright audit](/Users/cex/SolarOps÷/solarflow-dashboard/scripts/audit-login.mjs). The existing Karen/Buggr profiles are legacy references; this workflow uses available local Playwright browser capabilities. The new TOML passed syntax validation. Named-profile loading in a fresh Codex task has not been verified. A delegated agent completed the independent [[08 Login source review]].

## Browser results

Executed September 7 at 20:33 UTC against a dedicated local Vite server. Both staff and contractor login were exercised with synthetic rejected credentials and a simulated HTTP 503 password-recovery response. No live credentials, reset emails, accounts, or records were used. All API traffic was intercepted, other external traffic blocked, and browser contexts isolated.

| Browser profile | Viewport | Pass | Fail | Blocked |
| --- | --- | ---: | ---: | ---: |
| Desktop Chromium | 1440x900 | 16 | 9 | 0 |
| Mobile Chromium (Pixel 7 emulation) | 393x851 | 16 | 11 | 0 |
| Mobile WebKit (iPhone 13 emulation) | 390x844 | 16 | 11 | 0 |
| Total | | 48 | 31 | 0 |

The 31 failures are repeated assertions across portals and browser profiles, not 31 independent bugs. [Machine-readable results](login-evidence/results.json) include expectations and measured controls. Mobile profiles are emulated browsers, not physical phones or certification of native Safari/Chrome behavior.

## Browser-confirmed findings

| Priority | Finding and reproduction | Expected result |
| --- | --- | --- |
| P2 | In either portal, open Forgot password and submit the synthetic email. The mocked recovery endpoint returns 503, but the UI says Check your inbox. Reproduces on all three profiles. | A service failure must leave a usable recovery/retry path and avoid claiming successful delivery; preserve account-enumeration protection. |
| P2 | Login email/password fields and both reset-email fields have visible labels without programmatic association, on all profiles. | Associate labels and inputs so assistive technology can identify every field. |
| P2 | Submit rejected credentials in either portal. The visible Invalid email or password error has no alert role or live region on all profiles. | Announce the error accessibly without requiring users to find it visually. |
| P2 | Contractor show/hide password toggles correctly but has no accessible name on all profiles. | Give the toggle an action name and appropriate state semantics. |
| P2 | Both mobile profiles contain buttons below the project's 44x44 target: Contractor Portal 124x20, eye toggle 24x24, Apply to join 85x20, Staff/Admin login 113x32. | Increase interactive hit areas to the project target while preserving layout. |

Passing checks: both login screens render without horizontal overflow, credential autocomplete and masking are present, empty and malformed email submissions do not reach auth, Enter submits rejected credentials with a visible error and restored button, reset screens are reachable, portal switching works, and no uncaught page errors occurred in these covered flows. Screenshots were visually inspected for the mobile WebKit login screens.

## Higher-priority source findings

The independent source review found four P1 risks requiring isolated browser reproduction before declaring the session behavior verified:

1. Contractor logout skips Supabase sign-out and reload can restore the same authenticated session.
2. Contractor restore can trust browser flags and a cached contractor without checking the authenticated identity or approval status.
3. Reload can bypass the forced-password-change prompt because restore does not reapply the requirement.
4. Contractor password update ignores an auth update error and uses an obsolete contractor persistence path before clearing the prompt.

See [[08 Login source review]] for exact source lines, qualifications, and synthetic fixture instructions. These client findings do not establish backend data access, database deletion, or production exploitation. The existing isolated auth-routing unit suite passed 8/8 tests; that helper suite does not cover these App-level branches.

## Evidence

- [Desktop staff login](login-evidence/desktop-chromium-staff.png)
- [Mobile staff login](login-evidence/mobile-webkit-staff.png)
- [Mobile contractor login](login-evidence/mobile-webkit-contractor.png)
- [Staff recovery false success after 503](login-evidence/mobile-webkit-staff-reset-outage.png)
- [Contractor recovery false success after 503](login-evidence/mobile-webkit-contractor-reset-outage.png)

Only sanitized synthetic screenshots and the result summary are stored here. Raw run logs and additional temporary screenshots remain outside the vault.

## Next audit work

First extend the agent's synthetic fixtures to verify the P1 logout, session isolation, and forced-password-change cases. Then cover successful role-based sign-in, pending/rejected/suspended contractors, mixed-case email aliases, retry/timeout behavior, and reset-token completion. Use an authorized staging pass for actual provider authentication and trusted role/RLS enforcement. Use physical iOS/Android devices for keyboard, password-manager, biometrics, and installed-PWA behavior.

The testing infrastructure and audit notes are implemented. Application behavior and deployment were not changed. Accepted decisions remain: internal costs office-only in customer copies, recoverable service-order archive, and current sales access unchanged. General Astra adaptation remains a separate proposal.

## Fix follow-up

The user authorized implementation after this initial review. See [[09 Login fix plan and implementation]] for the root-cause changes and passing local regression results. The findings above preserve the pre-fix observations.
