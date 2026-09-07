---
date: 2026-09-07
status: reviewed-documentation-cleanup
tags: [solarops, audit-preparation, requirements]
---

# Conflicts and audit priorities

All 23 conflicts were reviewed. Evidence-backed documentation corrections are applied to entry points and stale source notes; unresolved policy/configuration items remain explicit. Start at [[00 Current documentation guidance]]. This is not a fresh production audit.

## Conflict dispositions after cleanup

| ID | Topic | Disposition | Resolution / remaining boundary |
| --- | --- | --- | --- |
| C-01 | Workspace | Documentation corrected | Directory is absent. Obsidian registers `/Users/cex/SolarOps÷`. Use the real path; do not create an empty substitute repository. |
| C-02 | Deployment root | Documentation corrected | [[2026-06-05]] abandons it; [[2026-08-12]] records another outage from the wrong working directory. Treat the runbook as historical. |
| C-03 | Role authority | Documentation corrected | [[2026-08-25]] moves trusted roles AND permissions to `user_roles`. UI metadata routing still needs drift review. |
| C-04 | Backup-table exposure | Documentation corrected | [[2026-08-23]] records those two locked with RLS. Verify rather than repeat as open; inspect new backups independently. |
| C-05 | Broad security assurances | Documentation corrected | Later audits found authorization and public-storage gaps. Do not use reassuring prose as evidence of current security. |
| C-06 | Trello authority | History resolved; product decision open | Documented September 3 field matrix in [[00 Current documentation guidance]]. Stage events and whole-set labels supersede intake-only restrictions. Simultaneous edit precedence remains a decision. |
| C-07 | Trello write permission | Documentation corrected | [[2026-09-03#Write token landed; push verified live; one real problem found]] supersedes that blocker. This says nothing about whether webhook signing is configured. |
| C-08 | Registry repair | Documentation corrected | Later sections record backfill; September 3 records another CRM repair with sheet-side work outstanding. Do not rerun old repairs blindly. |
| C-09 | Duplicate conversion | Documentation corrected | Later section records the merge/renumber completed on CRM side. The conversion re-entry bug and sheet correction remain separate open items. |
| C-10 | Money visibility | Resolved by user September 7 | August 10 restores homeowner savings; August 27 exposes actual cost. User decided internal costs are office-only and must be omitted from customer copies. Audit compliance before claiming the app implements this. |
| C-11 | Xero connection | Documentation corrected | September 1 introduces app-triggered standalone Edge functions. Credentials remain outside the app, but the app can trigger writes. Financial scopes were refused. |
| C-12 | Contractor visibility | Documentation corrected | Same-day correction restricts visibility to assigned stages; June 13 adds auto-dispatch on assignment. Use the final sequence. |
| C-13 | Contractor paid | Documentation corrected | August 21 derives contractor paid status/date from `costsCoveredAt` only. |
| C-14 | Sync architecture | Documentation corrected | August 23 records per-field job merge; customers and contractor KV remain separate risks. Do not assume the job fix covers every entity. |
| C-15 | Storage diagnosis | Documentation corrected | [[2026-08-06]] measures it and rejects that diagnosis in favor of log/photo/storage paths. Reproduce before assigning cause. |
| C-16 | Model/tool routing | Obsolete assumptions removed; Astra proposal deferred | These are harness-specific historical instructions. Resolve actual tools and underlying scripts in Codex; do not invent tools or bypass permission controls. |
| C-17 | Output location | Documentation corrected | Current user explicitly requests this compilation in Obsidian. Save a dedicated review folder; do not treat this as permission to relocate all generated artifacts. |
| C-18 | Confirmation | Documentation corrected | Retain the substantive decision gate for unspecified assets/legacy behavior; reuse existing answers and proceed on ordinary authorized work. |
| C-19 | Design tokens | Documentation corrected | Verified global #F5A623/#00B4CC in tailwind.config.js; #FF7200 is a local contractor XP accent. Fork #FE6501 is separate. No rebrand. |
| C-20 | Styling | Documentation corrected | Corrected both SPEC copies: prefer Tailwind utilities; scoped CSS is permitted for supported behavior. |
| C-21 | Framework component claims | Documentation corrected | Verified manifest declares Tailwind 3.4.16 and no Radix dependency. Corrected CLAUDE and annotated legacy specifications. |
| C-22 | Absolute diagnostic claims | Documentation corrected | Good incident lesson, not universal proof. In a new incident also check authorization, network/pagination, cache adoption, and filters. |
| C-23 | Provider constraints | Historical claim; live/provider check deferred | They are dated observations. Verify current provider documentation/account configuration during the audit. |

## Prioritized audit queue

These are candidates to verify, not confirmed present-day defects.

| Priority | Candidate | Evidence / next verification |
| --- | --- | --- |
| P0 candidate | Original customer-files bucket remains public. | August 23 audit and later memory. Inspect current bucket configuration and all URL consumers without changing it. |
| P0 candidate | Webhook signing secret absent / fail-open path. | August 23 plus memory. Check configured presence without exposing value; verify missing/invalid signature behavior in an isolated test. |
| P0 regression | Trusted roles and permissions across API, DB, and contractor routes. | August 25 fix. Exercise a role matrix: anon, no role, pure contractor, staff, admin, dual-role, and forged metadata. |
| P1 candidate | Conversion re-entry and allocator side effects. | September 3 follow-up. Reproduce duplicate clicks/retries against stubbed registry; require one logical conversion. |
| P1 candidate | Registry sheet and CRM may still disagree. | September 3 CRM-side repair complete, sheet-side correction not recorded complete. Compare both current systems read-only. |
| P1 acceptance check | Internal costs must be omitted from customer-facing SOW copies. | Accepted September 7. Inspect all report/print/email variants and keep office cost views intact. |
| P1 candidate | Whole-record customer merge, contractor blob concurrency, stale bulk push. | Memory, August 23, September 3. Test all independent write/merge paths with deterministic multi-client fixtures. |
| P1 acceptance check | Service orders must archive with recoverable history. | Accepted September 7. Audit deletion, tombstones, restore, sync, and warranty-history preservation. No retention cron. |
| P1 candidate | CI deployment gate may self-skip or run alongside Git deployment. | August 23 requires configuration follow-through. Inspect actual workflow runs and project integration. |
| P1 regression | Mention delivery and exact-comment navigation across all surfaces. | Persistent critical-workflow rule and August 31 fixes. Use isolated recipients or existing read-only evidence; any live send needs explicit authorization. |
| P1 candidate | OAuth financial scope blocker and standalone-writer behavior. | September 1 and contractor payment plan. Verify connection/scopes, approval boundary, idempotency, and no automated money transfer. |
| P2 candidate | Hidden persisted filters, billing/RMA count parity, missing related records. | September 2-4. Test visible/hidden filters, empty search, archive, and unknown customers. |
| P2 candidate | Undo toast/keyboard path not exercised after login. | September 3 explicitly says not verified. Test local record mutation, remote concurrent edit, and text-input Cmd+Z. |
| P2 candidate | Supabase metadata UI routing and notification recipients still drift from trusted roles. | August 25 follow-ups. Review loading state and recipient selection separately from data authorization. |
| P2 candidate | UI catalog coverage, responsive input durability, stale-build recovery. | August 31 catalog incident; September 1 debounce changes. Verify manifest count and transient states. |
| P2 hygiene | Plaintext credential material in legacy documentation. | SPEC login sections and fork index contain credential material. Report locations only, verify rotation/removal separately, never copy values into new notes. |

## Decisions for our review

1. Audit the original SolarOps application first, keeping the SolFlo fork out of scope unless explicitly added.
2. Accepted: internal costs are office-only; omit from customer-facing copies.
3. Accepted: archive service orders and preserve recoverable history. Proposed retention durations remain unapproved.
4. The existing Trello field matrix is now documented. Decide precedence for simultaneous conflicting updates before changing that behavior.
5. Accepted: keep current sales access until audit review.
6. Review the Astra instruction proposal. Choose delegation only if wanted; no parallel agents were launched for this preparation.

## Empty Markdown files

All six are zero bytes and contain no recoverable requirement:

- [[2026-04-21]]
- [[2026-05-15]]
- [[Untitled]]
- [[Untitled 1]]
- [[Untitled 2]]
- [[claude.js]]

No files were filled, renamed, or deleted. Empty non-Markdown files were not audited.
