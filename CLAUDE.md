> [!important] Documentation reconciliation, 2026-09-07
> Read the current guidance first. Superseded tool assumptions and incorrect framework claims have been corrected; deployment instructions apply only to an authorized release task. See [[Audit Preparation 2026-09-07/00 Current documentation guidance]].

# SolarOps Development Guidelines

## Writing Style Rules

**MANDATORY — applies to all text output, documents, UI copy, comments, and generated content:**

- **No em dashes.** Never use `—` (em dash) in any output. Replace with a comma, colon, period, or rewrite the sentence. This rule has no exceptions — not in documents, not in code comments, not in UI labels, not in reports.
- **No en dashes** (`–`) as separators. Use a hyphen (`-`) for ranges or rewrite.
- Prefer short, direct sentences over complex punctuation constructions.
- **No emojis.** Never use emojis in any output. No exceptions: not in documents, reports, UI labels, code comments, chat responses, or generated files.

## Design Principles

This section provides links to reference documents for maintaining visual consistency.

- **Comprehensive design checklist:** Located at [[design-principles]].
- **Brand style guide:** Located at [[style-guide]].
- **Instruction:** Always refer to these files when making visual (front-end, UI/UX) changes.

## Quick Visual Check

This section outlines a mandatory seven-step process to be performed immediately after any front-end change:

1. **Identify what changed:** Review modified components/pages.
2. **Navigate to affected pages:** Use an available browser automation tool to visit each changed view.
3. **Verify design compliance:** Compare changes against the previously mentioned design principles and style guide.
4. **Validate feature implementation:** Ensure the change fulfills the specific user request.
5. **Check acceptance criteria:** Review provided context files or requirements.
6. **Capture evidence:** Take full-page screenshots at a desktop viewport (1440px) for each changed view.
7. **Check for errors:** Inspect browser console messages with the available browser tooling.

This verification ensures changes meet design standards and user requirements.

## Comprehensive Design Review

Perform a deeper design review for the following cases. The old `@agent-design-review` name is a Claude-specific workflow reference; use available tooling, and delegate only when requested by applicable current instructions:

- Completion of significant UI/UX features.
- Finalizing Pull Requests (PRs) with visual changes.
- Needs for comprehensive accessibility and responsiveness testing.

## UI Components

- Current manifest: Tailwind CSS 3.4.16 and Lucide React; no declared Radix dependency.
- Inspect existing components in `solarflow-dashboard/src/components/ui/` before reuse. Legacy shadcn naming does not prove a Radix implementation.
- Read [[Audit Preparation 2026-09-07/00 Current documentation guidance]] for verified theme tokens and scoped CSS conventions.

## Key Features

This section lists the primary functionalities of the SolarOps platform:

- **Sales CRM** — Gamified lead pipeline with XP, levels, and leaderboard.
- **Customer Management** — 360° customer view with interaction tracking (calls, emails, SMS, notes, meetings).
- **Operations** — Work order lifecycle management with financial tracking (labor, parts, revenue, profit).
- **SolarEdge Alerts** — Alert dashboard with severity levels, acknowledge/resolve workflow, and work order linking.
- **Client Profitability** — Revenue, cost, and profit margin tracking per customer.
- **Contractor Portal** — Onboarding, work order reporting, invoice submission, and admin review.
- **Inventory** — Equipment, tools, and provider management.
- **Billing** — Invoice creation, payment tracking, and Xero integration.

## Project Structure

- This is the SolarOps/SolarFlow dashboard (TypeScript/React + Supabase + Vercel). Vercel's Root Directory is unset (repo root), so the **repo-root `/api/`** directory is what actually deploys, confirmed via `.vercel/project.json` and root `vercel.json`'s `buildCommand`/`outputDirectory`. A "flip to `solarflow-dashboard/` as root" migration was attempted and abandoned (see 2026-06-05 note); do not repeat it.
- `solarflow-dashboard/vercel.json` was a leftover of that abandoned migration (prepared for a Root Directory cutover that never happened; its `solarflow-dashboard/api/` counterpart was already gone). It was deleted 2026-08-12 after being confirmed as the cause of a real production outage: `vercel --prod` run from inside `solarflow-dashboard/` picks up whatever `vercel.json` is in the CWD, and that one had no `api/` folder as a sibling, so it deployed a build with zero serverless functions, 404ing every `/api/*` route (broke Trello import, and everything else API-backed, for ~21h before caught). **Always run `vercel --prod` from the repo root, never after `cd solarflow-dashboard`.**

## Deployment

- After every deploy, poll the live production URL's `version.json` until its `sha` matches the commit just pushed, and confirm the changed feature is actually visible, before reporting success. Vercel deploys and HMR frequently serve stale builds.
- If it hasn't propagated after ~3 minutes, trigger a manual deploy from the **repo root** (`cd /Users/cex/SolarOps÷ && vercel --prod --yes`, never `cd solarflow-dashboard` first) and re-poll. Do not report success on a timeout.
- After a manual `vercel --prod`, also spot-check a real `/api/*` route (e.g. `/api/users`) returns something other than a Vercel `NOT_FOUND` page — `version.json` matching is not proof the serverless functions actually built.
- Use the `/deploy` skill (`.claude/skills/deploy/SKILL.md`) for this loop end-to-end.

## Debugging

- Diagnose sync/data bugs against current evidence, using read-only live data when available. Distinguish authorization, fetch, cache, merge, and rendering failures. A request to investigate does not authorize a live data repair; use the approved repair scope and verify its projection afterward.

## Security & Dependencies

- Do not install third-party SDKs/plugins without vetting the source repo for security first. Refuse ad/tracking SDKs like RuntimeAds.

## Tooling Conventions

- Prefer per-file Edits and small Python/JS scripts over sed/grep glob one-liners for bulk changes. zsh glob expansion and the context-mode wrapper have repeatedly misfired here.

## Obsidian & Memory Integration

This section defines how Claude leverages persistent memory and knowledge organization across sessions.

- **Memory Storage:** `~/.claude/projects/-Users-cex-SolarOps-/memory/` persists across all sessions
- **Memory Files:** Reference [[project_ui_skill]], [[project_responsive_fixes]], [[project_kiniela]] for patterns and decisions
- **Context Convention:** This CLAUDE.md loads automatically at session start; update monthly with new patterns discovered
- **Wiki Links:** Use `[[ComponentName]]`, `[[FeatureName]]` to establish backlinks — helps Claude find related context
- **Output locations:** Keep requested durable audit/review notes in Obsidian. Keep scratch plans, raw logs, credentials, and customer payloads outside the vault. Dated deployment/session notes belong in the vault.

### Post-Deployment Obsidian Update (MANDATORY)

After every authorized `git push` to `main`, record the push and its actual deployment state. A push is not proof of deployment. For deployment work:

1. Write a dated note to `/Users/cex/SolarOps÷/YYYY-MM-DD.md` (use today's date). If a note for today already exists, append to it under a new `##` heading.
2. Update `~/.claude/projects/-Users-cex-SolarOps-/memory/MEMORY.md` index to reference the new note and bump the `_Last updated` date.
3. The note must include: commit hash(es), what changed and why, files modified, any patterns worth reusing, and any pending follow-ups.
4. If the deploy touched any UI/UX (components, pages, layout, styles, nav), refresh the visual UI catalog by running `/snap-ui` (captures screenshots and rebuilds `UI_SCREEN_CATALOG.md`). Commit the updated `ui-catalog/` PNGs and catalog. If a new screen or nav item shipped, first add it to `solarflow-dashboard/scripts/ui-screens.manifest.json`. Skip only when the deploy was purely backend/config with zero visual impact.
5. This step is non-optional. Do not skip it even for small hotfixes.

### UI Screen Catalog (visual, agent-readable)

- **Live visual map:** `UI_SCREEN_CATALOG.md` (repo root) embeds a full-page screenshot of every screen plus macro purpose and detail notes. Agents needing a global view of the app UI should read this first; the text-only routing reference is `UI_UX_SCREEN_MAP.md`.
- **Source of truth:** `solarflow-dashboard/scripts/ui-screens.manifest.json` (screen list) + `scripts/capture-screens.mjs` (capture engine). Screenshots land in `ui-catalog/screens/<role>/`.
- **Refresh:** `/snap-ui` (manual) and automatically as part of the post-deploy step above. Login uses `SNAP_UI_EMAIL` / `SNAP_UI_PASSWORD` in `.env.local` (gitignored).

## Common Development Workflows

### Daily Development Session
1. Check memory files for responsive patterns ([[project_responsive_fixes]]) and UI patterns ([[project_ui_skill]])
2. Review recent commits to understand branch state
3. Reference [[design-principles]] and [[style-guide]] before any UI changes
4. After changes: run Quick Visual Check (7-step process above)

### Feature Implementation
1. Create feature note in memory: `feature_[feature-name].md` with architecture sketch
2. Link to affected components using wiki-style `[[Dashboard]]`, `[[WorkOrderPanel]]`, etc.
3. Save implementation insights to memory for future refactoring
4. Tag memory entries with `#completed` when feature ships

### Bug Triage & Fixes
1. Document reproduction steps and context
2. Reference related memory files and responsive patterns
3. Update memory files if fix reveals new patterns (e.g., new responsive grid fix)

### Integration Work (Xero, SolarEdge, etc.)
1. Save technical research to memory with links to source APIs
2. Document gotchas and workarounds discovered
3. Create wiki links to related code files for future reference

## Automated UI Testing

A Playwright-based test agent is defined at [[playwright-agent]].

- **Trigger:** Run after any front-end change to verify buttons, links, and navigation work correctly.
- **Tool:** Use available browser automation against the verified project dev-server URL. Check that the process belongs to this project; port 5173 is only a convention.
- **Scope:** Covers all primary navigation routes, key actions (buttons, forms, modals), and console error checks.

## Tool availability and historical routing

The old context-mode routing block described another harness. Use only tools exposed in the current session; keep reads and output bounded. If context-mode exists, it may help with indexing, but it is not a universal requirement. Never bypass current permissions by switching tools.

Keep responses concise, normally under 500 words. Save substantial artifacts to files and summarize the result. `/deploy` and `/snap-ui` refer to local Claude workflows; inspect their underlying instructions/scripts when applicable rather than assuming those commands are callable. This cleanup does not activate the proposed Astra instructions.
