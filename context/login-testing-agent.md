# SolarOps login testing agent

The project has legacy Karen UI and Buggr QA profiles under `.claude/agents`. Their model pins, browser tool names, and historical test instructions are not a current Codex browser setup. The reusable Codex profile is `.codex/agents/login_tester.toml`; its executable browser workflow is `solarflow-dashboard/scripts/audit-login.mjs`. Playwright is already installed. Chromium and WebKit are available on this machine.

Project agent files use the documented TOML fields `name`, `description`, and `developer_instructions`. The model is inherited from the task. See [official custom-agent guidance](https://learn.chatgpt.com/docs/agent-configuration/subagents). The profile has been written and syntax-validated; loading it by name in a fresh task remains to be verified. This audit used a working delegated source-review agent and the primary agent's browser runner. No browser MCP or separate plugin is required by this workflow.

## Run the isolated browser audit

Run from the actual `solarflow-dashboard` directory in the SolarOps vault. Start a dedicated server in one terminal:

```bash
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort
```

In another terminal in the same directory:

```bash
node scripts/audit-login.mjs
```

Optional environment variables: `LOGIN_AUDIT_URL` (loopback origins only) and `LOGIN_AUDIT_OUTPUT` (default `/private/tmp/solarops-login-audit`). If an engine is missing, use `node node_modules/playwright/cli.js install chromium webkit`. Do not replace the dedicated command with the default broad e2e suite, which contains legacy credentials and data mutations.

The runner uses desktop Chromium at 1440x900, Pixel 7 Chromium at 393x851, and iPhone 13 WebKit at 390x844. Each context starts without user storage. All auth/recovery requests are simulated; API calls are intercepted, other outbound traffic aborted, and service workers/sockets blocked. Only local GET assets are fetched. Biometrics are disabled in this deterministic pass.

Output contains `results.json` and synthetic logged-out screenshots. Exit 1 means at least one FAIL or BLOCKED result; read the summary before diagnosing a runner failure. PASS means only the stated assertion passed. Preserve real failures and distinguish unavailable browsers or interrupted flows as BLOCKED. Stop only the dedicated server started for this audit.

## Coverage and extension order

Current assertions cover both portals: rendering, horizontal overflow, labels, credential autocomplete, masking, empty/malformed submissions, rejected credentials via Enter, loading recovery, live error announcements, mobile 44x44 targets, contractor password visibility, reset navigation, recovery outage handling, portal switching, and uncaught errors.

Run the implemented `node scripts/audit-login-session.mjs` for synthetic session restoration, mismatched cached identity, suspended accounts, logout, and forced-password-change failure/success/reload cases. Output defaults to `/private/tmp/solarops-login-session` and can be set with `LOGIN_SESSION_OUTPUT`. Expand fixtures for expired sessions and rejected accounts as needed. Then cover successful staff/contractor login and role routing, rejected password updates, timeouts/retry, mixed-case aliases, and reset-token completion. Mock all network paths before entering authenticated screens. Avoid local fixtures that get reseeded on reload and conceal logout defects.

A subsequent authorized staging pass should verify real authentication, trusted roles/RLS and account isolation with designated test accounts. Physical iOS/Android checks should cover keyboards, autofill/password managers, biometrics, and installed PWA behavior. Never present viewport emulation or mocked authentication as completion of these checks.

## Reporting and invocation

Suggested request: “Use the login_tester agent to run the isolated desktop/mobile login audit and update the Obsidian report; include uncovered session and physical-device checks.” If the current harness cannot select the custom profile, supply its instructions to an available delegated agent and use the same runner. Do not silently claim named-profile activation.

Read the reconciled guidance and accepted decisions in `Audit Preparation 2026-09-07` first. Save sanitized findings there with source links, scenario/profile, expected and actual results, severity, and evidence. Keep raw logs outside the vault. Application fixes and deployment are separate from this audit request.
