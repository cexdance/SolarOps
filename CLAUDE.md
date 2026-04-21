# Claude Development Guidelines

## Design Principles

This section provides links to reference documents for maintaining visual consistency.

- **Comprehensive design checklist:** Located at [[design-principles]].
- **Brand style guide:** Located at [[style-guide]].
- **Instruction:** Always refer to these files when making visual (front-end, UI/UX) changes.

## Quick Visual Check

This section outlines a mandatory seven-step process to be performed immediately after any front-end change:

1. **Identify what changed:** Review modified components/pages.
2. **Navigate to affected pages:** Use a tool called `mcp__playwright__browser_navigate` to visit each changed view.
3. **Verify design compliance:** Compare changes against the previously mentioned design principles and style guide.
4. **Validate feature implementation:** Ensure the change fulfills the specific user request.
5. **Check acceptance criteria:** Review provided context files or requirements.
6. **Capture evidence:** Take full-page screenshots at a desktop viewport (1440px) for each changed view.
7. **Check for errors:** Run `mcp__playwright__browser_console_messages`.

This verification ensures changes meet design standards and user requirements.

## Comprehensive Design Review

This section instructs the developer to invoke a specific AI subagent, `@agent-design-review`, for deeper validation during:

- Completion of significant UI/UX features.
- Finalizing Pull Requests (PRs) with visual changes.
- Needs for comprehensive accessibility and responsiveness testing.

## shadcn/ui Components

This section describes the UI framework used in the project.

- **Description:** A modern component library built on Radix UI primitives.
- **Location:** Components are found in `/src/components/ui/`.
- **Tech Stack:** Uses **Tailwind CSS v4** with CSS variables for theming and **Lucide React** icons.

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

## Obsidian & Memory Integration

This section defines how Claude leverages persistent memory and knowledge organization across sessions.

- **Memory Storage:** `~/.claude/projects/-Users-cex-SolarOps-/memory/` persists across all sessions
- **Memory Files:** Reference [[project_ui_skill]], [[project_responsive_fixes]], [[project_kiniela]] for patterns and decisions
- **Context Convention:** This CLAUDE.md loads automatically at session start; update monthly with new patterns discovered
- **Wiki Links:** Use `[[ComponentName]]`, `[[FeatureName]]` to establish backlinks—helps Claude find related context
- **Never Pollute Vault:** Keep generated plans and logs in ~/.claude/, not in code

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
- **Tool:** Uses `mcp__playwright__browser_*` tools to interact with the live dev server at `http://localhost:5173`.
- **Scope:** Covers all primary navigation routes, key actions (buttons, forms, modals), and console error checks.
