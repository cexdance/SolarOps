# Activity report - weekly

Window: **2026-08-27 to 2026-09-03** (America/New_York). Source: `change_log`, 677 events, 3 people active.

## Workload by person

| Person | Est. active time | Events | Sessions | Records touched | Days worked | First seen | Last seen |
|---|---:|---:|---:|---:|---:|---:|---:|
| cesar.jurado@conexsol.us | 20h 28m | 559 | 40 | 99 | 7/8 | 08-27 09:28 | 09-03 09:01 |
| daniel.matos@conexsol.us | 8h 01m | 117 | 24 | 50 | 6/8 | 08-27 09:03 | 09-03 08:46 |
| anthony.lopez@conexsol.us | 0h 05m | 1 | 1 | 1 | 1/8 | 09-01 13:57 | 09-01 13:57 |
| **Total** | **28h 34m** | **677** | **65** | | | | |

## Active time per day

| Person | 08-27 | 08-28 | 08-29 | 08-30 | 08-31 | 09-01 | 09-02 | 09-03* | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| cesar.jurado@conexsol.us | 0h 43m | 4h 15m | 0h 15m | - | 5h 53m | 4h 16m | 4h 28m | 0h 38m | 20h 28m |
| daniel.matos@conexsol.us | 0h 15m | 1h 05m | - | - | 3h 19m | 1h 12m | 1h 50m | 0h 20m | 8h 01m |
| anthony.lopez@conexsol.us | - | - | - | - | - | 0h 05m | - | - | 0h 05m |

\* 09-03 is a partial day (report generated 09:15).

## What they worked on

- **cesar.jurado@conexsol.us**: `job.update` (307), `job.field_update` (193), `customer.update` (22). Work-order editing dominates.
- **daniel.matos@conexsol.us**: `job.update` (60), `job.field_update` (41), `contractor.paid_notified` (10). The paid-notified events are the contractor-payment run.
- **anthony.lopez@conexsol.us**: `job.field_update` (1).

## What this says about load

- **The work is concentrated in one person.** Cesar accounts for 72% of estimated active time and 83% of events. Daniel is the only other meaningful contributor. That is a single point of failure for operations, not just an uneven workload.
- **Weekends are clean.** No activity on 08-30 (Sunday), and 08-29 was nearly idle.
- **08-31 was the peak day** for both active users (5h 53m and 3h 19m).
- **No contractor logged anything this week.** Carlos Valbuena (last event 08-25), Cruz Fernandez (08-14) and Jaime Mendez / `contractor-4` (08-21) are all silent. Either field work paused, or contractor activity is not reaching `change_log`. Worth confirming before reading this as "they did no work".

## Reading these numbers fairly

Three caveats that matter if this feeds any staffing or pay decision:

1. **This measures writes to SolarOps, not work.** Phone calls, site visits, email, and reading all produce zero events. Someone on the road all week looks idle here.
2. **Identity is resolved by `actor_uid`, not by the email string.** The raw `user_email` column is unreliable: `contractor-4` and `Jaime Mendez` are one person, and `contractor-2` is actually Cesar's own account. Any report that groups by `user_email` will silently attribute Cesar's work to a contractor.
3. **Bot rows are excluded** (`system`, `unknown`, `recovery-script`, `claude-repair-script`), which is 669 events historically.

---

_Active time is estimated: events are grouped into sessions with a 30-minute idle gap and each session counts its first-to-last span (a lone event counts 5 min). The 30-minute threshold is not arbitrary: 91.9% of gaps between consecutive events are under 5 minutes and the curve is flat from 15 to 60 minutes, so the totals barely move if you change it. Treat these as a floor, not a timesheet._
