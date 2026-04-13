# Claude Development Guidelines

## Design Principles

This section provides links to reference documents for maintaining visual consistency.

- **Comprehensive design checklist:** Located at `/context/design-principles.md`.
- **Brand style guide:** Located at `/context/style-guide.md`.
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

## Automated UI Testing

A Playwright-based test agent is defined at `/context/playwright-agent.md`.

- **Trigger:** Run after any front-end change to verify buttons, links, and navigation work correctly.
- **Tool:** Uses `mcp__playwright__browser_*` tools to interact with the live dev server at `http://localhost:5173`.
- **Scope:** Covers all primary navigation routes, key actions (buttons, forms, modals), and console error checks.
