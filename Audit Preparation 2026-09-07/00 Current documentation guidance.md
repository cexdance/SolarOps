---
date: 2026-09-07
status: reconciled-documentation
tags: [solarops, audit-preparation, current-guidance]
---

# Current documentation guidance

This note resolves conflicting documentation using dated decisions and inspected repository source. It does not certify production configuration or approve unresolved product changes. Start with this note before older runbooks, specifications, or memory. Current user instructions take precedence; historical implementation notes are evidence, not new authorization.

## Project and verification baseline

- Original project and Obsidian vault: `/Users/cex/SolarOps÷`. The task's `/Users/cex/SolarOps` path is absent. SolFlo is a separate project/vault; its branding, database, and Jobber integration do not apply here.
- Root `vercel.json` builds `solarflow-dashboard` and outputs its `dist`, while repo-root `api/` supplies serverless handlers. Run authorized deployments from the repository root. The dashboard-root migration is abandoned.
- Current package manifest declares React 18, TypeScript 5.6, Vite 6, Tailwind 3.4.16, and Lucide React. It declares no Radix dependency. Do not assume legacy shadcn/Radix implementation or Tailwind v4 from CLAUDE text.
- Existing theme tokens in `solarflow-dashboard/tailwind.config.js`: primary/accent Solar Gold `#F5A623`, secondary Teal Cyan `#00B4CC`. Contractor JobDetail contains a local `#FF7200` XP-card accent. This does not replace the global palette. Fork `#FE6501` is separate. No visual rebranding is approved by documentation cleanup.
- Prefer existing Tailwind utilities; scoped CSS is valid for existing safe-area, print, layout, and accessibility behavior. The old absolute custom-CSS prohibition is obsolete.
- Use `pnpm run build` in the dashboard for the configured environment check, `tsc -b`, and Vite build. Install root dependencies too when API tests import root packages. Verify actual test discovery. `tsc --noEmit` at the empty root project-reference config is not sufficient.
- Release verification requires intended build provenance, the deployed version, an executing API response, and the requested behavior. A push is not proof of deployment. CI has a dependency-gated deploy job, but missing secrets make it skip; hosted configuration remains unverified.
- New static audit observation: package.json requests Node 24.x while CI sets Node 20. Record this discrepancy for compatibility review; neither runtime was changed here.
- Provider limits, commercial-plan rules, deployment ownership, and current credential scopes require a fresh provider/account check. Old numbers are historical observations.

## Settled domain meanings

- Trusted access decisions use protected `public.user_roles` roles and permissions plus `is_staff()`, not user-editable metadata. Preserve contractor isolation on login, restore, rendering, API access, and DB access. Metadata UI routing is a separate consistency concern.
- The two August backup tables were recorded locked on August 23. They are regression checks, not confirmed open exposures. Check any later-created backups independently.
- Contractors see assigned-or-later field work according to the visibility contract; June 13 added auto-dispatch on assignment. Draft assignment alone is not a reason to expose draft work. Contractor paid status is based on `costsCoveredAt`, not client `woStatus: paid`.
- Job per-field merge is present in `syncEngine.ts`. Do not apply this conclusion to customer merges or contractor KV blobs. Preserve hydration gates, field/record/server clocks, tombstones, stable IDs, pending input/photo durability, and consistent merge paths.
- Keep financial data while respecting display gates. Homeowner savings and actual-cost surfaces have documented exceptions. User decision on September 7: internal costs are office-only and must be omitted from customer-facing copies. Implementation compliance remains to be audited.
- Xero OAuth secrets remain in the standalone server integration; SolarOps can trigger its actions. Financial scopes were recorded blocked on September 1. No automatic bill approval, money transfer, or unproven scheduled writer is authorized.
- September 1 case backfill was recorded completed. September 3 CRM merge/renumber was recorded completed; sheet-side correction and conversion re-entry remain separate follow-ups. Never allocate from a “next free number” written in an old note.
- Conversion re-entry remains visible as a static risk: `Jobs.tsx` calls the registry before an in-flight guard in `handleConvertLead`. No live duplicate was created or current data repaired in this cleanup.
- September 4's missing-customer incident was a hidden-filter bug. For new reports, investigate authorization, fetch/pagination, cache adoption, and filters before asserting a cause.

## Latest recorded Trello behavior

September 3 supersedes August 23 intake-only stage/label restrictions. Source inspected: `api/trello-card.ts`, plus the September 3 note. This documents behavior, not a new product decision about simultaneous edits.

| Field/action | Current recorded contract |
| --- | --- |
| Incoming stage | Mirror only an event carrying `listAfter`; a comment must not move the lead. |
| Outgoing stage | LL change sends only the changed stage; inverse maps derive from the same mapping. |
| Labels | Whole-set mirror, normalized as sets in both directions to avoid loops. |
| Outgoing name | Replace placeholder filenames only; preserve a human-entered Trello name. Use clientName, not internal WO title. |
| Contact/name enrichment | Fill missing/placeholder information; preserve reviewed records. |
| Delete versus archive | Follow the explicit delete path and protect real service orders; do not equate reversible archive with a tombstone. |
| Write credential | Recorded working September 3. This supersedes the old read-only blocker but does not prove today's token status or webhook signing. |
| Simultaneous conflicting edits | Not settled by the chronology. Preserve implementation and audit race/conflict handling before changing policy. |

## Documentation and tooling

- Keep new audit reports and review decisions in this Obsidian folder as requested. Keep temporary data, raw logs, and private payloads outside the vault. Dated session/deployment notes remain valid.
- Use actual available tools; old `ctx_*`, model pins, named agents, and slash commands are harness-specific references. Do not use alternate tools to bypass permission controls. Astra-specific policy remains a proposal in [[03 Astra adaptation proposal]].
- Reuse explicit user choices about assets and legacy behavior. Ask only for a material missing choice, then continue independent work. No repeated confirmation for already-authorized routine cleanup.
- Preserve original incident bodies and mark them historical at entry points. Current-state claims must identify whether they come from source inspection, dated notes, or live verification.

## User decisions recorded September 7

1. Internal costs are office-only. Omit them from customer-facing SOW/report copies. This does not hide homeowner savings or otherwise revise unrelated financial fields.
2. Archive service orders and preserve recoverable history. Hard deletion is not the intended service-order workflow. Audit retention stays unscheduled; this decision does not set a retention duration or require a historical data rewrite.
3. Keep current sales access until audit review. Do not grant Lead Lobby access during cleanup.

These are accepted requirements; implementation has not been changed or certified. See [[06 Accepted review decisions]]. Only simultaneous LL/Trello conflict precedence remains a product question from this pass. No active Astra prompt, app source, deployment, live data, or empty note changed.

Review: [[01 Requirements and rules]], [[02 Conflicts and audit priorities]], [[05 Cleanup log]].

## Login audit tooling

The September 7 user request authorized a reusable login-testing agent and the first desktop/mobile audit. See [[07 Desktop and mobile login audit]] and [[08 Login source review]]. The project profile is `.codex/agents/login_tester.toml`; its current browser workflow is documented in `context/login-testing-agent.md`. Use this isolated workflow for the login audit instead of the legacy broad Playwright instructions. General Astra adaptation remains a separate proposal.

## Root-cause verification preference

The user explicitly requires root-cause checks for fixes: identify the faulty assumption or shared implementation, reproduce the trigger, and validate adjacent paths before claiming resolution. See [[09 Login fix plan and implementation]].
