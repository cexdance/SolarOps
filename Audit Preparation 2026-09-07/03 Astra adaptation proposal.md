---
date: 2026-09-07
status: draft-for-review
tags: [solarops, audit-preparation, requirements]
---

# Astra adaptation proposal

**Proposal only.** Review [[01 Requirements and rules]] and [[02 Conflicts and audit priorities]] before updating active instructions. These adaptations are for Astra conducting the audit in Codex; they are not a request to migrate the app's API or replace its AI providers.

## Official guidance used

OpenAI describes Astra as sensitive to instructions in skills and `AGENTS.md`, more inclined to clarify ambiguous work, thorough in testing, and responsive to explicit writing and delegation preferences. Its guidance recommends reviewing conflicting instructions, specifying follow-through, calibrating verification, and stating delegation expectations. These are prompting recommendations, not requirements to rewrite the application's business rules. [Official GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model), read 2026-09-07.

The policy below is our project-specific proposal informed by that guidance and SolarOps incidents. It is not quoted official policy.

## Proposed instruction structure

Keep one concise active project entry point, normally `AGENTS.md`, with links to:

- Reviewed domain invariants and acceptance criteria.
- Audit scope and evidence format.
- Environment-specific build, test, browser, database, and deployment instructions.
- An archive of dated incidents and superseded plans.

Preserve original history. Mark obsolete instructions as historical and point to their replacement. Avoid copying the entire vault into every prompt. Retrieve the relevant rules by topic and always keep source dates/status visible. A `CLAUDE.md` filename does not establish how Codex loads it; explicitly link any shared policy that should apply.

## Proposed audit instruction block

```text
Audit the original SolarOps project against the reviewed requirements register.
The objective is an evidence-backed list of defects, regressions, documentation
conflicts, and unresolved product decisions.

Use the actual repository and deployed target established at kickoff. Read
relevant project instructions and trace requirements to their dated sources.
Treat old audit results as leads, not current findings. Preserve later explicit
corrections. If two current requirements conflict, explain the conflict and ask
only for the decision that changes the result.

Complete authorized read-only investigation and local, isolated verification
without repeated confirmation. Reuse prior user decisions. Continue independent
work when one part needs input. Preparation or audit authorization does not by
itself authorize production mutations, deployment, customer notifications,
financial actions, or destructive tests.

For every finding provide: requirement ID, severity and confidence, affected
component or source location, concrete trigger, expected and observed behavior,
evidence, measured or unknown blast radius, smallest remediation, and a useful
verification step. Distinguish reproduced defects, static risks, historical
claims, product decisions, and blocked checks. Do not call an old finding open
or fixed without identifying the evidence date and current verification status.

Preserve trusted-role authorization, contractor isolation, sync hydration gates,
field clocks, merge semantics, tombstones, photo/input durability, billing state
meaning, registry identity, and mention delivery. Test both directions and all
call sites when a contract spans components or systems.

Use available tools. Translate obsolete tool names to equivalent available
capabilities only when their semantics match. If access is missing, state the
specific blocked check and continue other work. Never bypass sandbox or approval
controls through alternate tools. Do not copy credentials or private customer
records into findings, test fixtures, or public artifacts.

Select tests by risk. Use small deterministic regression cases for ordinary
fixes; broaden for authorization, sync, billing, identity, and durability. Verify
test discovery, correct typecheck/build targets, and relevant browser behavior.
After relevant checks pass, repeat or broaden only when new evidence warrants it.
No production load or fault injection. No simulated webhook that sends real
staff/customer notifications without explicit authorization.

Do not spawn subagents unless the user or applicable current instructions request
parallel agent work. If authorized, give each agent a bounded target and require
source evidence, then reconcile findings and conflicting conclusions.

Use concise, direct language. No emojis or em dashes; no en dashes as separators.
Write substantial findings to files, provide short progress updates, and finish
with the main result, validation limits, and decisions needed.
```

## Changes from the old agent instructions

| Existing material | Proposed treatment |
| --- | --- |
| Claude/Fable/Opus/Sonnet/Haiku task pins | Archive as prior-harness guidance. Keep Astra as the requested model. Do not infer automatic model switching from task labels. |
| Mandatory unavailable `ctx_*` tools | Replace with actual available capability guidance and bounded output. Keep token discipline without naming nonexistent tools. |
| “Use another tool to bypass sandbox denial” | Remove from active instructions. Use the permission mechanism for the blocked operation. |
| Ask-first rule for assets/state changes | Preserve meaningful ambiguity checks for assets and legacy behavior; no repeated questions after the user already decided. |
| Mandatory broad UI tests for every tiny change | Preserve relevant interaction, visual, accessibility, and console evidence. Scale scope to impact and keep hard project build gates. |
| Automatic push/deploy loops | Apply only in a release task with authorization. This audit produces findings first. |
| Psychological persuasion skills in the vault | Exclude from software-audit instruction loading. Their presence does not make them audit requirements. |
| Historical agent orchestration prompts | Treat as past workflow examples until parallel agent work is explicitly requested. |
| Blanket diagnostic maxims | Retain as investigation heuristics, with falsifiable checks rather than absolute causal claims. |

## Trial before adoption

Use a small local audit exercise after reviewing this proposal:

1. Give Astra the contradictory deployment notes. It should identify the abandoned cutover and cite the later correction without deploying.
2. Give it the role-metadata history. It should separate UI routing from trusted API/DB authorization and request negative role tests.
3. Give it the registry double-click incident. It should propose a deterministic retry/concurrency reproduction without touching the live sheet.
4. Give it an old “open” finding later recorded fixed. It should classify it as a regression check, not a confirmed defect.
5. Give it a small filter bug. It should test relevant semantics without repeatedly running unrelated expensive suites.

Accept the adaptation when those exercises produce accurate, bounded, source-linked findings and clearly stated verification limits. No active prompt/model/configuration was changed in this preparation.
