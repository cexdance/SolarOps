# Activity report - daily

Window: **2026-09-03** (America/New_York, partial day, generated 09:15). Source: `change_log`, 27 events, 2 people active.

## Workload by person

| Person | Est. active time | Events | Sessions | Records touched | First | Last |
|---|---:|---:|---:|---:|---:|---:|
| cesar.jurado@conexsol.us | 0h 38m | 22 | 4 | 3 | 02:56 | 09:01 |
| daniel.matos@conexsol.us | 0h 20m | 5 | 4 | 1 | 03:04 | 08:46 |
| **Total** | **0h 58m** | **27** | 8 | 4 | | |

## What they worked on

- **cesar.jurado@conexsol.us**: `customer.update`, `job.field_update`. Only 3 distinct records touched across 22 events, so this is repeated editing of the same few items, not breadth.
- **daniel.matos@conexsol.us**: `job.field_update` on a single job.

## Notes

- Nobody else logged activity today. Contractors have no events at all in the last 7 days (see the weekly report).
- Both users show a first event around 03:00. That is worth a sanity check: either people genuinely work pre-dawn, or some writes are replayed by a background sync rather than typed by a human at that hour.

---

_Active time is estimated: events are grouped into sessions with a 30-minute idle gap and each session counts its first-to-last span (a lone event counts 5 min). It measures time spent **writing** to SolarOps, so it undercounts calls, reading, and field travel. Treat it as a floor, not a timesheet._
