---
date: 2026-09-07
status: accepted-by-user
tags: [solarops, audit-preparation, decisions]
---

# Accepted review decisions

Source: the user's explicit answers in this task on September 7. These supersede earlier “decision needed” entries. This documentation pass did not implement application changes.

| ID | Accepted requirement | Audit acceptance criteria |
| --- | --- | --- |
| DEC-01 | Internal costs are office-only; omit from customer copies. | Customer-facing SOW, print, downloadable and emailed report paths omit internal cost totals, breakdowns and internal mileage rates. Office views retain legitimate cost information. Homeowner savings and other unrelated fields are unchanged by this decision. |
| DEC-02 | Archive service orders and preserve recoverable history. | Normal service-order removal archives without destroying the recoverable order and warranty trail. Restoration preserves identity/links and unrelated edits; archive/delete/tombstone sync semantics are verified. Do not execute the old retention SQL or infer a new retention period. |
| DEC-03 | Keep current sales access until audit review. | Cleanup does not grant jobs/Lead Lobby access. Audit current role/permission enforcement and revisit access at review if needed. |

Open product question: precedence when LL and Trello receive conflicting concurrent updates. The recorded field matrix is documented in [[00 Current documentation guidance]]; no new precedence rule is invented here.

Astra-specific instruction adoption remains separate. See [[03 Astra adaptation proposal]].
