---
date: 2026-09-07
status: reconciled-baseline-product-decisions-open
tags: [solarops, audit-preparation, requirements]
---

# SolarOps requirements and rules review

This is the review baseline for the upcoming app audit. It consolidates project instructions, dated session notes, specifications, past audit reports, and selected persistent memory. It does not certify the current app or activate a new agent policy.

Read [[00 Current documentation guidance]] for the reconciled baseline, then review [[02 Conflicts and audit priorities]], [[03 Astra adaptation proposal]], and [[04 Source inventory]].

## Scope and evidence

The registered original-project Obsidian vault is `/Users/cex/SolarOps÷`. The configured task workspace `/Users/cex/SolarOps` is absent. The separate `/Users/cex/obVAULT/SOLAROPS WL` vault describes the SolFlo fork at `/Users/cex/SolarOpsWL`; its rules are separated below.

117 project Markdown files were inventoried and text-scanned, including 6 empty files. Detailed reading focused on instructions, dated decisions, incident rules, specifications, and audit follow-ups. Selected referenced Claude memory files supplemented this evidence. This is a consolidated requirements baseline, not an exhaustive transcription of every feature implementation. Some long legacy documents received section and requirement extraction rather than line-by-line semantic review. Full historical chat transcripts were not retrieved; session coverage means the history recorded in these notes, plus the current request.

**Status vocabulary:** Standing = documented requirement or invariant; Recorded = behavior reported implemented, requiring fresh verification; Proposed = recommendation or unapproved plan; Open = unresolved in the latest reviewed evidence. No row means “verified live today.” Sources are Obsidian links; dates identify the session evidence.

## Current session requirements

| ID | Requirement | Status / source |
| --- | --- | --- |
| SES-01 | Read project Obsidian Markdown and consolidate accumulated requirements and rules in Obsidian. | Current user request |
| SES-02 | Identify empty files for review. Do not infer intended content or delete them. | Opening request, interpreted as Markdown scope |
| SES-03 | Review the baseline together before adapting active instructions to GPT-6 Astra. | Current user request |
| SES-04 | Prepare an app audit. This phase produces documentation and an audit checklist. | Current user request |

## Working rules and evidence standards

| ID | Requirement | Status / source |
| --- | --- | --- |
| WR-01 | Write short, direct responses. No em dashes, en dashes as separators, or emojis in new chat, reports, UI copy, or comments. Put substantial deliverables in files. | Standing: [[CLAUDE#Writing Style Rules]], memory `feedback_response_format.md` |
| WR-02 | Before UI work, consult design principles, style guidance, and the screen catalog. Preserve established components and navigation behavior. | Standing: [[CLAUDE#Design Principles]], [[UI_SCREEN_CATALOG]], [[context/design-principles]] |
| WR-03 | Before changing brand assets or behavior of existing records, establish the exact asset and legacy-record treatment. Carry prior user answers forward. Ordinary fixes do not automatically require reconfirmation. | Standing, applicability clarified: memory `feedback_confirm_before_building.md` |
| WR-04 | Measure the affected records before accepting a diagnosis. Separate server data, local cache, projection/filter logic, and deployed-version problems. | Standing: [[2026-08-06]], [[2026-08-18]], [[2026-09-04]] |
| WR-05 | Treat older audits and memory as historical evidence. Reverify assertions, affected counts, targets, and still-open status before acting. | Standing: [[2026-08-23#Corrections to earlier claims]], [[2026-08-21]] |
| WR-06 | Search all readers and writers of a changed field or helper. Review pull, push, Realtime, mirrors, duplicate component names, and local function shadows. | Standing: [[2026-07-21]], [[2026-08-23]], memory `project_mentions_are_critical.md` |
| WR-07 | Preserve concurrent work. Verify the intended branch and committed dependencies; do not blindly stash another session's active files. | Standing: [[2026-07-21]], [[2026-08-06]], [[2026-09-03]] |
| WR-08 | Use small, exact edits or scripts, detect replacement misses, and verify actual file contents and asset formats. | Standing: [[CLAUDE#Tooling Conventions]], [[2026-08-23]] |
| WR-09 | For the audit, keep load/fault tests on an isolated disposable target. Report secret locations and types without reproducing values. | Historical audit boundaries to preserve: [[QA Agentic/files/security]], [[QA Agentic/files/stress]], [[QA Agentic/files/ceo_kickoff_prompt]] |
| WR-10 | Keep dated deployment records with commits, reasons, changed files, reusable lessons, and follow-ups. Maintain the memory index and visual catalog where applicable. | Standing: [[CLAUDE#Post-Deployment Obsidian Update (MANDATORY)]] |

## Access control, security, and privacy

| ID | Requirement | Status / source |
| --- | --- | --- |
| SEC-01 | Pure contractors must never reach the staff workspace through login, session restore, or render fallthrough. Preserve explicit handling for dual-role staff. | Standing: [[2026-06-11]], memory `security_contractor_access_control.md` |
| SEC-02 | Authorize from protected `public.user_roles` roles and permissions, not user-editable `user_metadata`. Metadata may only be a display copy. | Standing, recorded implemented: [[2026-08-25#a0ec6a7 - authorization moved off user_metadata (Supabase lint 0015)]] |
| SEC-03 | Allowlist staff roles; missing or unknown roles deny sensitive access. Protect the role table from client DML and constrain security-definer function grants and search paths. | Standing: [[2026-08-25]] |
| SEC-04 | Verify database isolation with real-role reads and affected-row counts. A service key bypasses RLS; an empty successful result can be a denial. Test API role checks separately. | Standing: [[2026-08-25]], [[PLAN_change_log_retention]] |
| SEC-05 | Contractor scoped reads and writes must agree with RLS. Preserve audit INSERT while denying contractor reads of the staff audit history. | Standing: [[2026-08-23#Item 5: app_data contractor row isolation (the real P0)]], [[PLAN_change_log_rls]] |
| SEC-06 | Audit events are append-only; duplicate delivery uses insert-on-conflict-do-nothing semantics. Preserve server-controlled actor identity. | Standing: [[2026-08-23#change_log read/write separation (the side door on this morning's P0)]], [[PLAN_change_log_rls]] |
| SEC-07 | Authenticate API proxies and reject anonymous callers before exposing configuration failures. Keep external clients lazily initialized behind configuration guards. | Standing: [[2026-06-04]], [[2026-06-05]], [[2026-08-23]] |
| SEC-08 | Keep service credentials out of frontend bundles and new documents. Inspect all lazy chunks when checking bundle exposure. Vet third-party dependencies before adoption. | Standing: [[CLAUDE#Security & Dependencies]], [[2026-08-23]], [[SolarOps_OnePager]] |
| SEC-09 | Trello webhook verification must validate the signature and fetched card's board identity. Missing-secret fail-open behavior is a recorded unresolved risk, not proof of safe configuration. | Recorded / Open: [[2026-08-23#Trello webhook: the payload's board id was the only board check  (`9b53215`)]] |
| SEC-10 | Protect customer files. For the original vault, private storage plus signed-URL consumers remains a migration proposal; inventory all existing URL consumers before changing the bucket. | Proposed / Open: [[DB_RLS_AUDIT]], [[PRODUCTION_READINESS_PLAN]] |
| SEC-11 | Keep backup tables inaccessible to anon/client roles while retaining recovery data unless disposal is explicitly decided. Check later-created backups too. | Standing: [[2026-08-23#Backup tables: LOCKED, not dropped]], [[2026-09-03]] |
| SEC-12 | Do not expand sales access to the Lead Lobby by treating it as a UI repair; the user decided to keep current access until audit review. | Standing, updated September 7: [[2026-08-09]], [[2026-08-23]], [[06 Accepted review decisions]] |

## Data integrity, synchronization, and durability

| ID | Requirement | Status / source |
| --- | --- | --- |
| SYNC-01 | Block stale/unhydrated sessions from pushing until a successful pull. A preview or old open tab is a live writer. | Standing: [[2026-06-12]], [[2026-09-03]] |
| SYNC-02 | Derive incremental read cursors from returned server timestamps. A push must not advance the read cursor. Paginate with stable ordering. | Standing: [[2026-06-13]], memory `MEMORY.md` |
| SYNC-03 | Apply legitimate edit timestamps when changing records; never blanket-restamp stale state. Direct repairs must respect field clocks, record clocks, and database pull clocks. | Standing: [[2026-06-12]], [[2026-08-23]], [[2026-09-01]] |
| SYNC-04 | Merge job fields consistently in pull and Realtime. Classify arrays: append-only feeds union by stable ID, tombstones union, other fields follow their explicit merge contract. | Standing, job implementation recorded: [[2026-08-23#v1.7.6.2 - per-field job merge (Phase 2) + Service Order panel close wiring]] |
| SYNC-05 | Every multi-writer KV key needs one registered merge policy used by pull, push, and Realtime. Merge before whole-blob upsert. | Standing: [[2026-07-21]], memory `rules_synced_array_hygiene.md` |
| SYNC-06 | Sync tombstones in both directions, union them, and exclude deleted IDs from outgoing records. Do not remove tombstones just because the corresponding row is absent. | Standing: [[2026-06-21]], [[2026-08-06]] |
| SYNC-07 | Reaping must verify affected rows. Marking a deletion clean before successful cleanup can lose retries; ordinary client RLS may prohibit physical deletion. | Standing / unresolved implementation: [[2026-08-06]], [[PLAN_change_log_retention]] |
| SYNC-08 | Treat timeout fallback as presentation behavior, not request cancellation. Adopt late successful data, rehydrate mounted KV consumers, and recover partial caches. | Standing: [[2026-08-18]] |
| SYNC-09 | Local storage failures must not skip cloud writes or change bookkeeping. Recovery must run before the broken path, with useful storage diagnostics that exclude values. | Standing: [[2026-08-06]], [[2026-08-18]] |
| SYNC-10 | Handle token refresh on reads as well as writes. In multi-tab races, check for a valid replacement session before declaring expiration. | Standing: [[2026-08-18]], [[2026-08-20]] |
| SYNC-11 | Preserve typed input across rehydration/unmount, attachment failure, debounce, and close. Build the save payload from current state at flush time. | Standing: [[2026-08-18]], [[2026-08-23]], [[2026-09-01]] |
| SYNC-12 | Allocate stable IDs once per logical record/slot. Bulk creation, autosave, retry, and content edits must not create duplicate identities. | Standing: [[2026-08-24]], [[2026-09-01]], [[2026-09-02]] |
| SYNC-13 | Upload photos durably and persist URLs, not base64 in synced payloads. Retain pending local originals; retry with the same canonical storage identity, then reclaim confirmed uploads. | Standing: [[2026-05-31]], [[2026-06-09]], [[2026-06-13]], [[2026-08-04]] |
| SYNC-14 | Deduplicate photo references on save and merge; preserve explicit deletions across admin/contractor mirrors and local retry stores. Verify references before deleting storage objects. | Standing: [[2026-06-10]], [[2026-06-13]], memory `rules_synced_array_hygiene.md` |
| SYNC-15 | Undo touches only affected records, preserves unrelated remote edits, and respects tombstones. Do not claim to undo external effects or half of a mirrored mutation. | Standing, implemented scope recorded: [[UNDO_PLAN]], [[2026-09-03#8e2eb97 - One level of undo (+ the concurrent site-transfer landing)]] |

## Product and operational workflow

| ID | Requirement | Status / source |
| --- | --- | --- |
| PROD-01 | Core domains include customer activity, lead pipeline, work orders, SolarEdge monitoring, contractor execution, inventory/RMA, billing, and staff communication. Historical sales gamification/profitability specs are not proof of current scope or visibility. | Recorded baseline: [[CLAUDE#Key Features]], [[context/SPEC]], [[UI_SCREEN_CATALOG]] |
| PROD-02 | Keep leads distinct from customers until conversion. Use `woNumber` to distinguish real service orders from pipeline-only records, including converted leads. | Standing: [[2026-08-13]], [[2026-08-08]], memory `MEMORY.md` |
| PROD-03 | Contractor visibility begins at assigned field-work stages. Assignment later auto-dispatches. Use the admin-job projection consistently, exclude archived orders, and interpret billing-tail states separately. | Standing: [[2026-06-11]], [[2026-06-13]], [[2026-08-21]] |
| PROD-04 | Forward stage movement follows workflow actions and their side effects. Backward movement must save through the same coherent transition path. Stamp lifecycle dates when advancing. | Standing: [[2026-06-12]], [[2026-06-16]] |
| PROD-05 | Priority is manual after the age-based escalation was reverted. Age indicators and sort order must not silently rewrite urgency on legacy jobs. | Standing: [[2026-06-22]], memory `feedback_confirm_before_building.md` |
| PROD-06 | Billing categories must agree across list and board. Use workflow-aware resolution and fail closed before implying an invoice or payment exists. Counts must reconcile under identical exclusions. | Standing: [[2026-08-08]], [[2026-08-26]], [[2026-09-02]] |
| PROD-07 | `woStatus: paid` means client paid. Contractor paid status and paid date derive from `costsCoveredAt`, with the corresponding notification. | Standing: [[2026-08-21]] |
| PROD-08 | Site transfer is the documented flat $120, no-tax desk workflow. A fresh transfer enters Ready to Invoice, then advances only on actual invoicing/payment evidence. | Standing: [[2026-08-26]], [[2026-09-01]], [[CONTRACTOR_PAYMENT_PLAN]] |
| PROD-09 | Preserve underlying financial data while honoring visibility policy. Homeowner savings and explicit actual-cost displays have exceptions; internal costs must be omitted from customer-facing copies per the September 7 user decision. | Standing, updated September 7: [[2026-06-09]], [[2026-08-10]], [[2026-08-27]], [[06 Accepted review decisions]] |
| PROD-10 | Quote and completion handoffs keep the relevant SOW visible and supply the responsible office workflow. “Generate invoice” must not simply close the context. | Standing: [[2026-08-17]] |
| PROD-11 | Customer identity/address edits must propagate through work-order and contractor projections. Normalize incoming addresses and preserve reviewed CRM values against enrichment. | Standing: [[2026-06-10]], [[2026-06-11]], [[2026-09-01]] |
| PROD-12 | Location filters and maps must not invent missing customers or discard valid single-axis zero coordinates. Compare active, non-tombstoned data using the same UI predicates. | Standing: [[2026-06-21]], [[2026-08-06]] |
| PROD-13 | Inventory receipt/movement/expense history is durable under concurrent edits. Location stock and field-pull confirmations follow the documented inventory workflow. | Standing: [[2026-07-21]], memory `rules_synced_array_hygiene.md` |
| PROD-14 | Standalone RMA records share the canonical status resolver and board categories with linked RMAs. Standalone-only data must still render the board. | Standing: [[2026-09-03#595102d - Standalone RMAs move from a list into a kanban column]] |
| PROD-15 | Archive service orders and preserve recoverable warranty history. Do not hard-delete them or schedule audit-log deletion based on an unapproved retention plan. | Standing, updated September 7: [[PLAN_change_log_retention]], [[06 Accepted review decisions]] |

## Integrations, imports, and communication

| ID | Requirement | Status / source |
| --- | --- | --- |
| INT-01 | Trello intake must handle the configured lists and delayed card enrichment. Map by stable external identity, not list position. Verify actual imports, not just webhook health. | Standing: [[2026-07-28]], [[2026-08-23]], [[2026-09-03]] |
| INT-02 | September notes supersede intake-only stage policy with bidirectional LL/Trello updates. Normalize equivalently on both sides, compare sets, derive inverse maps, and hook the canonical mutation path. | Recorded latest behavior: [[2026-09-03]] |
| INT-03 | Preserve reviewed app fields when enriching imports. Distinguish reversible archive from deletion, and preserve real service orders when processing lead deletion. | Standing with field-specific authority review needed: [[2026-08-23]], [[2026-09-01]], [[2026-09-03]] |
| INT-04 | Client numbers are allocated by the registry sheet, not local counters. Write display/storage fields consistently. An allocator collision means drift and must stop linking to the wrong customer. | Standing: [[2026-08-28]], [[2026-08-29]], [[2026-09-01]] |
| INT-05 | Conversion must be idempotent under retries/double-clicks. Return created/matched/failure semantics clearly and stop dependent work on failure. The re-entry defect remains open in September 3 notes. | Standing / Open: [[2026-09-01]], [[2026-09-03]] |
| INT-06 | Spreadsheet imports preserve every meaningful row and unmapped details, reuse a customer within a batch, enrich on rerun, and interpret dates from column semantics. Do not invent registry IDs or RMA records. | Standing: [[2026-09-01]] |
| INT-07 | Before repairs, compare the actual source artifact, CRM, and physical sheet row. Run existing import logic rather than reimplementing it. Verify before-state immediately before mutation. | Standing: [[2026-08-21]], [[2026-09-01]], [[2026-09-03]] |
| INT-08 | Xero credentials stay in the standalone server/Edge-function integration. Daniel approves bills; automation does not send money. Financial scopes and accounting setup remain explicit prerequisites. | Standing / Open: [[CONTRACTOR_PAYMENT_PLAN]], [[DANIEL_XERO_SETUP]], [[2026-09-01]] |
| INT-09 | Persist rotated OAuth tokens before other work, authorize callers beyond JWT validity, and verify requested scopes before building dependent writers. Do not schedule an unproven financial writer. | Standing: [[2026-09-01]] |
| INT-10 | Mention delivery is a core workflow. Deliver to the recipient's auth identity via the shared server store and open the exact comment where supported. Every producer and consumer must carry the activity context. | Standing: memory `project_mentions_are_critical.md`, [[2026-08-31]] |
| INT-11 | Optional web push must not break durable notifications. Verify recipient-side delivery across accounts/devices and cover fresh login plus restored sessions. | Standing: [[findings]], memory `project_mentions_are_critical.md` |
| INT-12 | Communication controls launch the intended channel; contact logging is explicit. An HTML report must not silently degrade to a plain-text mailto fallback. | Standing: [[2026-08-23]], [[2026-09-01]] |
| INT-13 | SolarEdge transfer autofill is user-browser, fill-only, rerunnable, and stable by slot ID. Verify generated bookmarklet assets and the installed copy. | Standing: [[2026-09-02]], [[2026-09-03]] |

## UI, testing, and release verification

| ID | Requirement | Status / source |
| --- | --- | --- |
| QA-01 | Use established Tailwind/Lucide components, readable labels, visible focus, accessible icon actions, keyboard operation, and non-color status cues. | Standing: [[context/style-guide]], [[context/ui-test-skill]] |
| QA-02 | Documented targets: body contrast 4.5:1, large text/UI contrast 3:1, mobile touch targets at least 44 by 44 pixels. Verify responsive safe areas and panel/map stacking. | Standing project targets: [[context/style-guide#11. Accessibility]], [[2026-05-31]], [[2026-08-20]] |
| QA-03 | Filters that remove rows must remain visible and reversible. Hidden-column filters are inert; lead boards do not inherit execution-only filters. Empty search must preserve unmatched records. | Standing: [[2026-08-08]], [[2026-08-10]], [[2026-09-04]] |
| QA-04 | Copyable client number/name/case text must produce correct selected text, and selection must not navigate. Similar records across views should retain coherent badges/categories. | Standing: [[2026-08-24]], [[2026-08-28]], [[2026-08-31]] |
| QA-05 | Treat date-input values as local calendar dates. Sorting must define missing-age behavior; Costs Covered has no aging clock. | Standing: [[2026-07-28]], [[2026-08-21]] |
| QA-06 | After frontend changes, inspect affected views/actions and console output, and capture desktop evidence at 1440px. Add mobile/role states relevant to the change. | Standing: [[CLAUDE#Quick Visual Check]], [[context/ui-test-skill]] |
| QA-07 | Verify catalog completeness against its manifest. A capture that skips a screen is incomplete even if the script says Done. Transient interactions need separate evidence. | Standing: [[2026-08-31]], [[2026-09-03]], [[UI_SCREEN_CATALOG]] |
| QA-08 | Use the actual project build/typecheck, not a no-op root `tsc --noEmit`. Install both dependency trees when API code is involved. Confirm the test runner discovers intended tests. | Standing: [[2026-06-10]], [[2026-08-17]], [[2026-08-23]] |
| QA-09 | Tests should reproduce the observed failure using actual data shape with sanitized fixtures. Distinguish regression, compatibility, negative authorization, and browser verification. | Standing: [[2026-08-18]], [[2026-09-01]], [[QA Agentic/files/testwriter]] |
| QA-10 | Original-project deploys use repo-root `/api/` and repo-root Vercel configuration. The dashboard-root cutover was abandoned. Reverify today's provider limits/configuration before changing architecture. | Standing: [[CLAUDE#Project Structure]], [[2026-06-05]], [[2026-08-12]] |
| QA-11 | Deploy success requires intended commit/build provenance, live version evidence, the changed behavior, and an executing API route. Cache-bust verification requests and inspect actual deployed lazy chunks when necessary. | Standing: [[CLAUDE#Deployment]], [[2026-08-04]], [[2026-08-23]] |
| QA-12 | CI must gate release; verify the job actually runs and duplicate deploy paths are disabled. A configured-but-skipped job is not an operational gate. | Standing / configuration unverified: [[2026-08-23]] |
| QA-13 | Production-only behavior needs production-equivalent headers/configuration: CSP, lazy chunk recovery, serverless routes, and stripped development instrumentation. `vite dev` alone does not prove it. | Standing: [[2026-08-20]], [[2026-08-20-local-request-rescan]] |

## Separate fork scope: SolFlo / SOLAROPS WL

These do not automatically replace original SolarOps requirements. Sources are in the separate vault at `/Users/cex/obVAULT/SOLAROPS WL`.

| ID | Fork requirement | Source |
| --- | --- | --- |
| WL-01 | Independent repository, database, deployment, and identity; original project is reference only. Deliberate cherry-picks, not blanket upstream merges. | `SOLAROPS WL.md`, `Fork hygiene.md` |
| WL-02 | No origin PII, credentials, database fallback, or personal-name routing. Run the hygiene checker before commits. Preserve internal storage keys unless a migration is designed. | `Fork hygiene.md` |
| WL-03 | Trusted role table, fail-closed access, append-only logs, and private photo storage with signed URLs are stated fork invariants. Verify actual deployment separately. | `Security invariants.md` |
| WL-04 | Branding is centralized; SolFlo palette differs from original. Display-name/logo mismatch is unresolved. | `Branding.md` |
| WL-05 | Jobber uses server OAuth credentials and expiring one-shot state; Settings shows connection state without secrets. Live account integration was still unverified. | `Jobber.md` |
| WL-06 | Check actual serverless runtime responses, not just successful build output. The fork notes record ESM import/runtime failures and a `sha: local` deployment. | `Deployment.md` |

## Review outcome sought

Confirm original SolarOps as the audit target, resolve the decisions in [[02 Conflicts and audit priorities]], then approve or edit the proposed audit instruction block in [[03 Astra adaptation proposal]]. The follow-up cleanup corrected stale CLAUDE guidance and memory, and annotated historical notes. No Astra-specific policy was activated; application source, production data, and empty notes remain unchanged.
