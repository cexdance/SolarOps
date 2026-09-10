# Trello to Lead Lobby sync review, 2026-09-10

Board: Conexsol Florida Services (`trello.com/b/eBhmHKjv`, id `6a5a58e06fbf97144b5d96c9`).
Scope: read-only audit of live Trello and live `app_data`. Nothing was written.
Related: [[2026-09-03]], [[2026-09-10 Supabase sync review]].

## Bottom line

Intake works. Every card Anthony created in the last 14 days reached LL, median 0.5 seconds after he created it, and no placeholder names are left.

What does not work is everything after intake. **13 cards sit in a different column in LL than in Trello, and 22 have different labels.** The cause is one specific, proven bug: the webhook writes the new column into the database, and the next browser that syncs quietly writes the old column back. It is a small fix.

Two structural risks sit behind it. The live webhook belongs to a Trello token we no longer hold, so we cannot see or manage it. And nothing ever re-checks the two boards against each other, so any drift is permanent.

## How the board is actually used (last 14 days, 373 actions)

| Person | What they do in Trello |
| --- | --- |
| Anthony Lopez | 24 cards created, each with a screenshot attached, then renamed (23) and given a description (23). 5 moves. **Never touches labels.** Intake only, as agreed. |
| Mia Lopez | **9 moves, 18 label changes**, created 1 list, deleted 1 card. She works leads in Trello. |
| Cesar Jurado | 50 moves, 26 label changes, 41 reorders. This includes every push from LL, since the Trello token is Cesar's. |

The meeting framed this as "Anthony uses Trello". The data says **Mia also works leads in Trello.** That matters: Anthony only needs intake, but Mia needs moves and labels to mirror into LL reliably, which is exactly the part that is broken.

## What is working (verified live)

- **Intake:** 24 of 24 new cards imported. Latency p50 0.5s, p95 about 1s.
- **Coverage:** 91 of 91 board cards have an LL job.
- **Names:** 0 jobs still named `image.jpeg`. The rename backfill catches Anthony's rename.
- **LL to Trello:** column moves made in LL reach Trello (Basil Davis 09-10, Michael Wagner 09-08 both match).
- **Deleted cards:** a card deleted in Trello is reaped in LL.

## Findings, ranked

### P0-1. Trello moves and labels are reverted by the next browser sync (PROVEN)

The client merge picks each field by its own edit time (`mergeJobFields`, `syncEngine.ts:1526`, using `fieldTime(j, k) = j.fieldTimes?.[k] ?? recordTime(j)`). The webhook changes `pipelineStage` and `labels` and bumps `updatedAt`, **but never writes `fieldTimes`** (`api/trello-card.ts` has zero references to it). So the server row carries the new column with the old column's edit time. Any browser holding the previous version sees a tie, keeps its own old value, and pushes it back.

Live proof, every stage drift checked:

| Lead | Moved in Trello | LL `fieldTimes.pipelineStage` | LL column now |
| --- | --- | --- | --- |
| Zach Ross | to Done, 09-08 22:55 | 08-28 22:55 | needs_first_quote |
| Grif Blackstone | to Done, 09-08 | 08-28 21:20 | needs_first_quote |
| Pedro Cordon | to Done, 09-08 | 08-24 19:06 | needs_first_quote |
| Stephanie Deorta | to First Quote In Progress, 09-08 22:54 | 09-03 17:13 | needs_first_quote |

The control case confirms it: one Andres Jimenez job had **no** `fieldTimes.pipelineStage`, fell back to record time, and **kept** the Trello move. 26 of 91 Trello jobs carry a stage edit time and are exposed. That set grows every time someone drags a card in LL.

**Fix:** when the webhook changes a mirrored field, stamp `fieldTimes[field] = now` alongside it (in `backfillLeadJob` and the `exists` reconcile path). A few lines, plus one test that runs `mergeJobFields` against a webhook-written record. Then a one-time repair of the 13 stage and 22 label drifts.

The parallel Supabase work (`20260910_app_data_server_timestamp.sql`) fixes the pull cursor. It does not touch per-field merge, so it will not fix this. Do not wait on it.

### P0-2. The live webhook belongs to a token we no longer hold

`GET /1/tokens/<current>/webhooks` returns an empty list. The known webhook id returns `401 webhook does not belong to token`. Deliveries still arrive, so it lives on the **pre-09-03 read-only token**. We cannot list it, check its failure count, pause it, or change its URL. If that old token is revoked, for example by someone tidying Trello's authorized apps, **intake stops silently** and nothing on our side can see why.

Also, `TRELLO_API_SECRET` is still unset in production, so webhook signature verification is failing open. The board-id check still blocks forged imports, as designed.

**Fix:** register a webhook under the current token, confirm deliveries, then revoke the old token in Trello (Settings, Applications). Set `TRELLO_API_SECRET` at the same time. Revoking is a user action.

### P1-3. New Trello list "Scheduled/In Process" is invisible to LL

Created on the board and not in `LIST_STAGES`. A card moved there stays in its previous LL column, and LL has no matching column. This is the **third** time a new Trello list opened a silent hole (LOST TO COMPETITION on 08-29, "Service Quote Accepted", now this).

**Decision needed:** add an LL stage `scheduled` between `needs_scheduling` and `work_done_collect`, mapped to this list (recommended, since the funnel has no "scheduled" step today), or fold it into `needs_scheduling`.

### P1-4. No convergence: drift is permanent

The mirror only fires on an event, in either direction. A missed push, a browser that was offline, or a direct database repair (noted 09-03 and 09-10) leaves the boards disagreeing until someone happens to touch that card again.

**Fix:** a daily sweep that compares every card with its job and repairs the difference, most recent change wins. That rule is only possible after P0-1, since both sides will then carry reliable timestamps (Trello action date against `fieldTimes`). The same sweep should **flag any open Trello list with no LL stage**, which would have caught all three holes in P1-3 on day one. It can run on the existing 03:00 UTC cron rather than a new function (Hobby cap is 12 functions).

### P1-5. Anthony's screenshot never reaches LL

Anthony's whole intake is a screenshot of the lead email. **1 of 91 Trello jobs has any image stored in LL.** The office sees the parsed fields but not the source, so a misread phone number cannot be checked without opening Trello, and Trello attachment links do not open without a Trello login (09-07 finding). The copy-to-bucket code from 469707f already exists for customers; reuse it at import. Note that bucket is still public (open item since 08-23).

### P2-6. Anthony's later corrections are ignored

He renames and edits the description after creating the card (23 each in 14 days). The backfill only fills fields that are empty or still a placeholder, so if the first parse got a phone wrong and he fixes it, LL keeps the wrong one. With P0-1 in place this becomes cheap: accept Trello's re-parse for any lead field the office has never edited in LL (no `fieldTimes` entry for it).

### P2-7. Smaller items

- Label **"NEEDS RMA"** exists on the board but not in `LABEL_CATALOG`, so it can arrive by mirror but cannot be picked in LL.
- New-lead web push opens `/`; the app has no deep-link route. The in-app bell does open the lead.
- The Keith Burgos job was reaped when Mia deleted the card, then resurrected by a stale browser 0.2s later. It is hidden by its tombstone, so it is harmless, but it is the same stale-tab family.
- Since the 09-03 reconciliation, valid serials went 14 to 13 and addresses 30 to 28. Some of that is conversions moving lead data onto the customer; recheck after P0-1.
- Still waiting on a decision from 09-03: 12 jobs hold a customer id in `solarEdgeSiteId`, and 4 hold a truncated serial.

## Making the process work for a Trello-only intake

1. **A Trello card template for Anthony.** Trello supports card templates natively. A "New Lead" template with a description of `Name: / Phone: / Email: / Address: / Site ID:` keeps him fully manual, costs him nothing, and turns guessing from a screenshot into reading labelled lines. `parseLeadDesc` already reads labelled lines. Highest value per minute of effort on the list.
2. **Decide where Mia works.** If Mia keeps working leads in Trello, P0-1 and P1-4 are mandatory. If she moves to LL, Trello becomes intake plus a read-only mirror for Anthony, and the failure surface shrinks a lot. Either is fine; the half-and-half state is what drifts.
3. **Keep Trello lists and LL columns 1:1.** Same order, same names, intake list at position 0 (the 08-29 outage was a list added in front of it). Agree that new lists go through Cesar, and let the P1-4 sweep catch the ones that do not.
4. **Narrow the new-lead bell.** It currently notifies all 7 office users. Limit it to whoever works leads, so it stays meaningful.

## Recommended order

| Step | What | Size | Needs |
| --- | --- | --- | --- |
| 1 | P0-1 `fieldTimes` stamp + test, then repair the 13 + 22 drifts | small | nothing |
| 2 | P0-2 new webhook under current token, set `TRELLO_API_SECRET` | small | you revoke the old token |
| 3 | P1-3 map "Scheduled/In Process" | small | your decision |
| 4 | Card template for Anthony | 10 minutes in Trello | Anthony agrees |
| 5 | P1-4 daily convergence sweep + unmapped-list alert | medium | nothing |
| 6 | P1-5 screenshot into LL | medium | nothing |
| 7 | P2-6 accept Anthony's corrections on unedited fields | small, after 1 | nothing |

**Before step 1:** `api/trello-card.ts` has uncommitted changes from another session (attachment content-type handling). Commit or stash those first, so the fix does not ship someone else's half-finished work.

## Decisions needed

1. Where does Mia work: Trello or LL?
2. "Scheduled/In Process": new LL `scheduled` stage, or fold into `needs_scheduling`?
3. For the one-time drift repair: most recent change wins (recommended; the evidence shows these are Trello moves that were lost), or LL prevails as in the 09-03 reconciliation?
4. Who should get the new-lead bell?
