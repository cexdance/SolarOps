# Plan: Trello and SolarOps activity sync (Alessandra)

Status: PLAN ONLY, scope decided, awaiting go-ahead. Written 2026-09-30.

## 0. Decisions (owner, 2026-09-30)

| Question | Decision |
|---|---|
| Direction | **A only**: Trello comments flow into SolarOps. Nothing is posted to Trello. Design B (section 4) is parked. |
| Whose comments | **Everyone's** on the Conexsol Florida Services board, not just Alessandra's. |
| Alessandra's login | **Not yet.** She keeps working in Trello. |
| Deleted comments (default, not asked) | Keep the entry and mark it `(deleted in Trello)`. Matches the 09-07 policy of preserving recoverable history over hard deletion. |


## 1. What the evidence says

| Fact | Evidence |
|---|---|
| Alessandra has **no SolarOps login** | No auth user matches "aless"/"alex". SolarOps edits to Trello leads in the last 3 days came only from cesar.jurado (33) and daniel.matos (4). |
| All her work is Trello comments | 34 comments on 33 leads, one session, 2026-09-29 18:39 to 20:58. 29 in Leads Services SolarEdge. See `reports/alessandra172-trello-comments.md`. |
| App to Trello mirror exists, but not for activity | `pushJobToTrello` (App.tsx handleUpdateJob) sends stage, name and labels through `PATCH /api/trello-card`, fire-and-forget. Logged calls, notes and comments are never sent. |
| Trello to app never imports comments live | The webhook treats `commentCard` only as a trigger to fill empty contact fields. Comments reached SolarOps only through one-off scripts: `trello-comment-<actionId>` x137 (newest 08-07) and `trello-cmt-<actionId>` x186 (newest 09-01, `scripts/trello-ll-reconcile.mts`). **Nothing since 09-01.** |
| Consequence | 28 of the 33 leads she worked show zero activity in SolarOps. The office working LL sees them as untouched and will call them again. |

Constraints that shape the design:
- The app owns the record, Trello is intake (user decision 2026-08-23).
- A server write into a job must stamp `fieldTimes.activityHistory`, `value.updatedAt` and the `updated_at` column, or a stale browser reverts it.
- `activityHistory` is an append feed merged by id. Deterministic ids make imports idempotent; removals need a tombstone.
- `api/` is at 11 of 12 functions. Everything rides `api/trello-card.ts`.
- Another session has uncommitted work in `LeadPanel.tsx`, `ringcentral.ts`, `leadOutreach.ts`. Must be merged or landed before touching those files.
- Sales has no LL access by standing decision (2026-09-07).

## 2. Two readings of the request

Her activity already lives in Trello, because that is the only place she works. So the request means one of:

- **A. Trello to SolarOps.** Her comments appear on the lead's activity log in SolarOps. Fixes the "untouched lead" problem now, with no onboarding and no access change.
- **B. SolarOps to Trello.** She gets a login, works leads in SolarOps, and every call, SMS, email or note she logs there posts as a comment on the Trello card.

Recommendation: **A first, B once she is onboarded**, with loop prevention designed in from day one so B cannot echo back through A.

## 3. Design A: inbound comments become activity

- Webhook `commentCard` on a card that maps to `job:job-trello-<cardId>` appends:
  `{ id: "trello-cmt-<actionId>", type: "note_added", description: text, timestamp: action.date, userName: memberCreator.fullName }`
- Idempotent by id. The legacy prefix `trello-comment-<actionId>` counts as the same entry, so nothing imported on 08-07 duplicates.
- `updateComment`: rewrite the matching entry's text. `deleteComment`: see decision 5.
- Stamps all three clocks (field, record, column).
- Skips any comment carrying the SolarOps marker from design B (echo guard).
- **Backfill**: replay the board's comment history since 09-01 through the same code path, dry run first, then apply. Her 34 are included.
- Side effect, intended: a lead with imported comments counts as worked, so deleting its Trello card no longer auto-removes it (`canReapLead`).

## 4. Design B: outbound activity becomes Trello comments

- Trigger: new activity entries on a `job-trello-*` job, detected in the same handler that calls `pushJobToTrello` (diff previous vs next `activityHistory`, ignore ids starting `trello-`).
- Transport: extend the existing `PATCH /api/trello-card` with `comments: [{ activityId, author, text }]`. Server posts `POST /1/cards/{id}/actions/comments`. No new function.
- Attribution: the Trello token belongs to **cesarsolar**, so every comment shows as Cesar. Text is prefixed `Alessandra (SolarOps): ...`. True per-person authorship needs each user to connect their own Trello account; out of scope for v1.
- Idempotency and loop guard: comment ends with `[SolarOps #<activityId>]`. The server checks the card's recent comments for that marker before posting; the inbound importer ignores any comment carrying it.
- Reliability: fire-and-forget loses posts when a tab closes or Trello is down. Queue in a localStorage outbox (existing pattern: `trelloCustomerQueue.ts`) and reconcile in the daily sweep.
- Privacy: everything on the card is visible to everyone on the board. Internal service-order comments and staff @mentions must not leak there.

## 5. Implementation (A only)

1. **Prep, read-only.** Recount legacy imports (`trello-comment-`, `trello-cmt-`). Confirm the webhook's existing clock-stamping helper (09-10 fix) is reusable. No overlap with the other session's `LeadPanel.tsx` WIP: design A is server-side only.
2. **Pure helper** `commentActivityFor(action)` in `api/trello-card.ts`: builds the entry, id `trello-cmt-<actionId>`, author from `memberCreator.fullName`. `hasTrelloActivity(job, actionId)` recognises BOTH legacy prefixes.
3. **Webhook.** On `commentCard` for a card with a SolarOps record: append if absent. Add `updateComment` (rewrite text) and `deleteComment` (mark deleted) to the accepted actions. Stamp field, record and column clocks. Comments on cards with no SolarOps record are ignored.
4. **Backfill script**, same helper, all board comments deduped by action id. Dry run prints: to import, already present (per prefix), skipped (no SolarOps record). Apply only after you review the dry run.
5. **Tests.** Idempotent redelivery, legacy-prefix dedupe, edit, delete-marks-not-removes, clock stamping, card-without-record ignored. Self-check assertions.
6. **Deploy and verify live** with one real comment on a test-safe card, then the backfill, then a recount showing the 28 of her 33 leads now have activity.
7. Dated note, memory. No UI change expected (activity already renders in LeadPanel and the SO panel), so no `/snap-ui`.

## 5b. Original phases (for reference)

0. **Prep.** Coordinate with the other session's uncommitted LeadPanel work. Recount legacy imports under both prefixes.
1. **A: inbound.** Webhook + backfill (dry run, then apply). Tests: idempotency, legacy-prefix dedupe, echo-marker skip, clock stamping. Verify with one real Trello comment.
2. **Onboarding.** SolarOps account and role for Alessandra (owner decision).
3. **B: outbound.** Marker, outbox, sweep reconcile. Verify one real logged call appears on the card, and that it does NOT come back as a duplicate.
4. Dated note, memory, `/snap-ui` if UI changed.

## 6. Decisions needed

1. Direction: A, B, or both.
2. Inbound authors: everyone's Trello comments (Anthony, Cruz, Cesar, Daniel too) or Alessandra only.
3. Alessandra's SolarOps account and role. LL sits in Service Orders; a sales role cannot reach it today.
4. What posts to Trello: lead logs only (call, SMS, email, note), or also service-order comments.
5. A comment deleted in Trello: remove it in SolarOps, or keep it and mark it deleted.

## 7. Risks

- Echo loop between A and B if the marker is dropped or edited out in Trello.
- Two legacy id prefixes for the same thing; a third would triple-count.
- Trello rate limits during backfill (serial with delay, as the existing backfill scripts do).
- All outbound comments attributed to Cesar's Trello account.
