---
date: 2026-09-07
status: draft-for-review
tags: [solarops, audit-preparation, requirements]
---

# Source inventory

Companions: [[01 Requirements and rules]], [[02 Conflicts and audit priorities]], [[03 Astra adaptation proposal]].

## Coverage and limits

The inventory below includes 117 original-project Markdown files, totaling 1,261,630 bytes before this review was added. Six are empty. All were read programmatically for text scanning; detailed semantic review focused on extracted requirements and the substantive sections cited in the register. This does not assert that every line of every historical file was manually reviewed.

Excluded from this project-note count: `.git`, dependencies/build output, `.claude` worktree copies and agent/skill implementation files, `.minimax` vendor skills, and `.obsidian` plugin documentation. Their duplicates and generic instructions should not inflate the requirements inventory. The two psychology/communication skill documents at the vault root were classified as outside software-audit requirements. The old Aider log was scanned as historical material, not treated as present-day instruction authority.

The eight Markdown notes in the separate SOLAROPS WL vault were discovered. Its index, Branding, Build and deploy, Deployment, Fork hygiene, Jobber, and Security invariants were read in detail. Supabase setup was inventoried only. No fork-wide completeness claim is made.

Persistent-memory supplements reviewed: MEMORY.md, feedback_response_format.md, feedback_confirm_before_building.md, model_routing_guide.md, rules_synced_array_hygiene.md, security_contractor_access_control.md, and project_mentions_are_critical.md, under `/Users/cex/.claude/projects/-Users-cex-SolarOps-/memory/`. Referenced `rules_sync_lww.md` was not found at that path; its memory-index claim remains a candidate to verify, not independently corroborated by that file.

No entire Codex/Claude session archive was retrieved. No live DB, API, deployed app, credential rotation status, or test result was verified in this documentation pass. Existing test counts and deployment claims belong to their original source dates. New notes intentionally omit credential values and customer-specific repair payloads.

## Original-project Markdown inventory

Byte counts are a reproducible inventory snapshot, not a completeness score. Source links target the original note, with its existing heading/line context available for inspection.

| Source | Bytes | Lines | Inventory status |
| --- | ---: | ---: | --- |
| [[.aider.chat.history]] | 60332 | 1534 | Text scanned |
| [[2026-04-21]] | 0 | 0 | Empty |
| [[2026-05-15]] | 0 | 0 | Empty |
| [[2026-05-31]] | 12704 | 210 | Text scanned |
| [[2026-06-02]] | 1041 | 20 | Text scanned |
| [[2026-06-03]] | 1931 | 34 | Text scanned |
| [[2026-06-04]] | 7139 | 81 | Text scanned |
| [[2026-06-05]] | 16480 | 127 | Text scanned |
| [[2026-06-06]] | 11188 | 145 | Text scanned |
| [[2026-06-07]] | 10886 | 63 | Text scanned |
| [[2026-06-09]] | 14932 | 119 | Text scanned |
| [[2026-06-10]] | 24425 | 146 | Text scanned |
| [[2026-06-11]] | 16376 | 111 | Text scanned |
| [[2026-06-12]] | 11243 | 76 | Text scanned |
| [[2026-06-13]] | 24827 | 380 | Text scanned |
| [[2026-06-16]] | 14577 | 203 | Text scanned |
| [[2026-06-21]] | 3837 | 39 | Text scanned |
| [[2026-06-22]] | 3052 | 38 | Text scanned |
| [[2026-06-29]] | 4495 | 50 | Text scanned |
| [[2026-07-20]] | 5998 | 64 | Text scanned |
| [[2026-07-21]] | 22906 | 199 | Text scanned |
| [[2026-07-28]] | 20629 | 397 | Text scanned |
| [[2026-08-04]] | 12271 | 139 | Text scanned |
| [[2026-08-06]] | 28458 | 361 | Text scanned |
| [[2026-08-08]] | 9046 | 163 | Text scanned |
| [[2026-08-09]] | 6066 | 60 | Text scanned |
| [[2026-08-10]] | 10825 | 84 | Text scanned |
| [[2026-08-12]] | 4576 | 27 | Text scanned |
| [[2026-08-13]] | 5045 | 50 | Text scanned |
| [[2026-08-17]] | 8779 | 148 | Text scanned |
| [[2026-08-18]] | 17651 | 371 | Text scanned |
| [[2026-08-20-error-audit]] | 4083 | 78 | Text scanned |
| [[2026-08-20-local-request-rescan]] | 4426 | 93 | Text scanned |
| [[2026-08-20]] | 35759 | 504 | Text scanned |
| [[2026-08-21]] | 10793 | 214 | Text scanned |
| [[2026-08-23]] | 51016 | 601 | Text scanned |
| [[2026-08-24]] | 16016 | 138 | Text scanned |
| [[2026-08-25]] | 8622 | 149 | Text scanned |
| [[2026-08-26]] | 3030 | 21 | Text scanned |
| [[2026-08-27]] | 6761 | 71 | Text scanned |
| [[2026-08-28]] | 11148 | 191 | Text scanned |
| [[2026-08-29]] | 2549 | 41 | Text scanned |
| [[2026-08-31]] | 14191 | 261 | Text scanned |
| [[2026-09-01]] | 45225 | 732 | Text scanned |
| [[2026-09-02]] | 11531 | 170 | Text scanned |
| [[2026-09-03]] | 26564 | 489 | Text scanned |
| [[2026-09-04]] | 4001 | 35 | Text scanned |
| [[CLAUDE]] | 13820 | 206 | Text scanned |
| [[CONTRACTOR_PAYMENT_PLAN]] | 10259 | 202 | Text scanned |
| [[DANIEL_XERO_SETUP]] | 3527 | 83 | Text scanned |
| [[DATA-FLOW]] | 12013 | 166 | Text scanned |
| [[DB_RLS_AUDIT]] | 13246 | 81 | Text scanned |
| [[DEBUG_REPORT]] | 6663 | 245 | Text scanned |
| [[DEPLOY_CACHE_AUDIT]] | 5537 | 81 | Text scanned |
| [[ENGINEERING_ASSESSMENT]] | 7546 | 124 | Text scanned |
| [[FEASIBILITY_mentions_bell_favicon_badge]] | 13315 | 247 | Text scanned |
| [[FLIP_TO_DASH_RUNBOOK]] | 2634 | 44 | Text scanned |
| [[FORK_WHITELABEL_PLAN]] | 20113 | 275 | Text scanned |
| [[PLAN_change_log_retention]] | 14451 | 283 | Text scanned |
| [[PLAN_change_log_rls]] | 9345 | 194 | Text scanned |
| [[PRODUCTION_READINESS_PLAN]] | 10287 | 210 | Text scanned |
| [[QA Agentic/codemapper_report]] | 16185 | 262 | Text scanned |
| [[QA Agentic/files/ceo_kickoff_prompt]] | 1727 | 21 | Text scanned |
| [[QA Agentic/files/codemapper]] | 1776 | 21 | Text scanned |
| [[QA Agentic/files/security]] | 1677 | 19 | Text scanned |
| [[QA Agentic/files/stress]] | 1680 | 21 | Text scanned |
| [[QA Agentic/files/testwriter]] | 1651 | 19 | Text scanned |
| [[QA Agentic/security_report]] | 21414 | 274 | Text scanned |
| [[QA Agentic/stress_report]] | 8299 | 129 | Text scanned |
| [[QA Agentic/testwriter_report]] | 6809 | 97 | Text scanned |
| [[QA_REPORT]] | 11056 | 137 | Text scanned |
| [[SECURITY_FIXES_TRIAGE]] | 4662 | 74 | Text scanned |
| [[SECURITY_REPORT_2026-06-03]] | 7791 | 117 | Text scanned |
| [[SKILL_psye_v2]] | 25951 | 608 | Text scanned |
| [[SOLAROPS_PARTNER_PROPOSAL]] | 7081 | 140 | Text scanned |
| [[SolarOps_OnePager]] | 5555 | 89 | Text scanned |
| [[UI_SCREEN_CATALOG]] | 9574 | 325 | Text scanned |
| [[UI_UX_SCREEN_MAP]] | 7285 | 131 | Text scanned |
| [[UNDO_PLAN]] | 5255 | 124 | Text scanned |
| [[Untitled 1]] | 0 | 0 | Empty |
| [[Untitled 2]] | 0 | 0 | Empty |
| [[Untitled]] | 0 | 0 | Empty |
| [[address-audit/APPLIED]] | 891 | 31 | Text scanned |
| [[address-audit/REPORT_data]] | 5551 | 147 | Text scanned |
| [[address-audit/REPORT_solaredge]] | 5658 | 70 | Text scanned |
| [[address-audit/REPORT_trello]] | 6336 | 78 | Text scanned |
| [[address-audit/REVIEW_CONFLICTS]] | 7458 | 39 | Text scanned |
| [[claude.js]] | 0 | 0 | Empty |
| [[communication-intelligence-SKILL]] | 7529 | 145 | Text scanned |
| [[context/SPEC]] | 17686 | 633 | Text scanned |
| [[context/design-principles]] | 11528 | 218 | Text scanned |
| [[context/error]] | 2869 | 86 | Text scanned |
| [[context/laws-of-ux]] | 5288 | 40 | Text scanned |
| [[context/playwright-agent]] | 6156 | 197 | Text scanned |
| [[context/step2-lead-lobby]] | 15415 | 320 | Text scanned |
| [[context/step3-lead-detail]] | 17572 | 371 | Text scanned |
| [[context/step4-quick-add-form]] | 18706 | 398 | Text scanned |
| [[context/step5-dispatch-lead-pipeline]] | 10113 | 245 | Text scanned |
| [[context/step5b-quick-add-toggle]] | 10655 | 258 | Text scanned |
| [[context/style-guide]] | 19275 | 794 | Text scanned |
| [[context/ui-test-skill]] | 11581 | 297 | Text scanned |
| [[context/xero-api-research]] | 15180 | 367 | Text scanned |
| [[findings]] | 13383 | 108 | Text scanned |
| [[reports/activity-daily-2026-09-03]] | 1392 | 25 | Text scanned |
| [[reports/activity-weekly-2026-09-03]] | 3341 | 47 | Text scanned |
| [[reports/powercare-registry-sync-2026-09-01]] | 3174 | 55 | Text scanned |
| [[reports/quote-10kw-nexis-2026-09-01]] | 2426 | 53 | Text scanned |
| [[reports/trello-ll-reconcile-2026-09-03]] | 1298 | 39 | Text scanned |
| [[solarflow-dashboard/PERFORMANCE_REPORT]] | 11817 | 249 | Text scanned |
| [[solarflow-dashboard/README]] | 2501 | 95 | Text scanned |
| [[solarflow-dashboard/SPEC]] | 17686 | 633 | Text scanned |
| [[solarflow-dashboard/SWARM_REVIEW_REPORT]] | 8971 | 204 | Text scanned |
| [[solarflow-dashboard/activity-tab-after-info-update]] | 5380 | 121 | Text scanned |
| [[solarflow-dashboard/ops-center-check]] | 14075 | 327 | Text scanned |
| [[solarflow-dashboard/security-audit-report-v2]] | 17098 | 262 | Text scanned |
| [[solarflow-dashboard/security-audit-report]] | 11255 | 202 | Text scanned |
| [[storage-audit]] | 16772 | 246 | Text scanned |

## Supplemental external reference

[Official GPT-6 Astra model guidance](https://developers.openai.com/api/docs/guides/latest-model), opened 2026-09-07. Used only for the concise prompting summary in [[03 Astra adaptation proposal]]. Project policy recommendations are our synthesis, not official product requirements.

## Follow-through after review

Correct any requirement that does not match intended product behavior, resolve scope/authority questions, then create the approved audit baseline. During the app audit, attach fresh code and runtime evidence to the requirement IDs. Keep historical records intact and revise their index/status links so later agents do not reactivate superseded plans.

## September 7 cleanup follow-up

The 117-file count and byte totals above are the pre-cleanup inventory snapshot. See [[05 Cleanup log]] for documentation edits, additional local-source checks, credential-section redaction, and validation. Historical source bodies are retained except maintained SPEC login values, which were redacted.

Accepted decisions received during cleanup are recorded in [[06 Accepted review decisions]].
