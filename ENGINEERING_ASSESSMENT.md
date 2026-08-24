# SolarOps: engineering assessment

Date: 2026-08-23. Version assessed: v1.7.6.2 (`17ad56a`).
Question put to me: *"a developer said it's a nice proof of concept but not a production app."*

Every number below was measured against this repo or the live database today, not estimated.

---

## Verdict

**"Proof of concept" is the wrong label, and so is "production ready."**

A proof of concept is a thing built to demonstrate feasibility, then thrown away. This is not
that. It runs a real solar operations business: 330 customers, 202 service orders, 2,371 work
order photos, 15 user accounts across six roles, an active Trello lead pipeline, Xero billing,
SolarEdge monitoring, and a contractor field portal on phones. 570 commits, 167 in the last 30
days. Software that a company runs its daily operations on is production software, whether or
not it was built to a production standard.

The accurate statement is narrower and more useful: **this is a real production application
carrying production debt, and until today its authorization model was below the bar.** That is
a fixable condition, not a category.

What the outside developer most likely saw was the surface: one author, very large files, and a
UI that looks generated. Those are real signals and I take two of the three seriously. But none
of them is the actual problem, and the actual problem is not visible from the outside.

---

## What is genuinely production grade

Not a generous reading. Each of these is a thing that immature codebases do not have.

- **Stack.** React 18, TypeScript 5.6, Vite 6, Tailwind, Supabase (Postgres + Auth + Realtime +
  Storage), Vercel serverless. Ordinary, current, boring in the way production should be.
- **Real CI.** Runs the actual production build (`tsc -b && vite build`) plus the full suite, not
  a lint pass. It explicitly refuses `tsc --noEmit`, because the root tsconfig has `files: []`
  and that check silently passes on everything. Someone learned that the hard way and wrote it
  down.
- **594 passing tests across 65 files.** Not smoke tests. They pin specific historical failures:
  photo dedupe, tombstone resurrection, sync cursor skew, pagination truncation at PostgREST's
  max-rows, contractor visibility rules.
- **A hardened CSP** with a real allow-list, plus HSTS, `frame-ancestors 'none'`, nosniff, and a
  referrer policy.
- **12 serverless endpoints, all now authenticated.** Ten already were before today.
- **Migrations** under version control.
- **An institutional memory that is genuinely unusual.** Dated incident notes, a memory index of
  rules earned from outages, and comments that explain *why* rather than *what*. Sample, from the
  CI config: a note that the pnpm store path resolves from the repo root where `.npmrc` does not
  apply, that this failed the job at post-cleanup, and that it stayed invisible because the test
  step always failed first. That is a senior habit. Most teams do not do this.

## What is genuinely not

- **Authorization was decorative until today.** `app_data` had RLS *enabled*, which looks correct
  on a dashboard, but all three policies were bare `auth.role() = 'authenticated'`. Any logged-in
  session, contractor included, could read and write all 698 rows. The contractor boundary lived
  only in client-side routing, which a contractor's own JWT walks straight around via PostgREST.
  Fixed today, verified per role.
- **`change_log` is the side door on that fix, and it is still open.** 17,838 rows, two policies,
  neither role-aware. **13,299 rows contain an email address; 957 are customer records.** A
  contractor who can no longer read `customer:` rows can still read the change history *of* those
  customers. Closing the front door while this stands is a partial fix, and I am flagging it
  against my own work from this morning.
- **`customer-files` is a public bucket.** 2,371 work order photos, readable by anyone with the
  URL, no login. This silently overrides the storage RLS policies added in August for reads.
- **Two files carry too much.** `Customers.tsx` is 5,923 lines with a 47% fix-commit ratio and no
  dedicated test file. `App.tsx` is 3,723 lines across 116 commits, 62 of them fixes. These are
  where regressions will keep coming from.
- **A one-person bus factor.** 570 commits, one author, no code review, 29 of the last 30 commits
  pushed straight to main. The institutional memory that impressed me above lives in markdown
  files and in one person's head.
- **CI was red on every commit for over a day and nobody knew**, because the deploy ran in
  parallel and shipped regardless. Fixed today. But the fact that it could go unnoticed is the
  process finding, not the bug itself.

## On "vibe coded"

The phrase usually means: generated fast, not understood, fragile under change. Testing that
claim against the evidence rather than the vibe.

Against it: the failure modes documented here are not ones a generator produces or a
non-understander diagnoses. Whole-record last-write-wins clobbering concurrent field edits.
PostgREST truncating at max-rows with `error === null`. A `Promise.race` timeout that is a UI
affordance and not a cancellation, so the request still lands. Supabase rotating refresh tokens so
the loser of a concurrent refresh is wrongly treated as signed out. Those were found, understood,
fixed, and written up.

For it: the size of the largest files, the near-total absence of code review, and a UI that reads
as generated. Also, several fixes were applied to one call site and not to its neighbour, which is
the characteristic signature of fixing what is in front of you rather than the class of bug. The
clearest example: an unauthenticated data-leak was fixed in `solaredge.ts` in August, and the
identical bug sat untouched in `trello-card.ts` next door until I fixed it today.

Fair summary: **the architecture was reasoned about; the change discipline was not.**

---

## What would actually close the gap

Ordered by risk closed per unit of effort. Nothing here is a rewrite.

| # | Item | Effort |
|---|---|---|
| 1 | Role-aware policies on `change_log`. Contractors legitimately write it, so read and write need separating. | hours |
| 2 | Private `customer-files` bucket + signed URLs. Real migration; photos are referenced by stored URL. | 1-2 days |
| 3 | Error monitoring. The boundaries already capture structured errors, they just never leave the browser. Reconcile the two duplicate `ErrorBoundary` implementations first or you will instrument the wrong one. | hours |
| 4 | Finish wiring the CI deploy gate (needs the Vercel token in GitHub secrets). | minutes |
| 5 | Set `TRELLO_API_SECRET`; rename `VITE_TRELLO_*` to non-`VITE_` names. | minutes |
| 6 | Characterization tests around `Customers.tsx`, then split it. | 1 week |
| 7 | A second pair of eyes. The single largest structural risk here is not in the code. | organizational |

Items 1 through 5 are roughly one focused week. After that the honest description is "a small
production app with normal debt," and the POC characterization becomes indefensible.

## Bottom line

The developer was directionally right that something was wrong and wrong about what it was. The
stack is fine. The tests are real. The security posture was the problem, and it was worse than
they could have known from the outside, because the most serious hole (`app_data` authorization)
is invisible unless you query the database with a contractor's token.

Two of the three P0s are closed as of today. `change_log` and the public bucket are not.
