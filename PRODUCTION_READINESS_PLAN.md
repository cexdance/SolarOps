# SolarOps production-readiness plan

Date: 2026-08-23. Version at time of writing: v1.7.6.2 (`fecf33f`).

Origin: an outside developer called SolarOps "a nice proof of concept, not a production app."
This plan separates the part of that claim that is wrong from the part that is right,
and sequences the work.

Companion report: `DB_RLS_AUDIT.md` (live database posture, written by the DB audit pass).
The API-auth and code-fragility passes returned inline; their findings are folded in below.

## What the developer got wrong

The stack is not the problem. React 18 + TypeScript 5.6 + Vite 6 + Supabase + Vercel is a
normal production SaaS stack. Supporting evidence already in the repo:

- A hardened CSP and full security-header set in `vercel.json`.
- SQL migrations under `supabase/migrations/`.
- GitHub Actions CI running the REAL build (`tsc -b && vite build`) plus the test suite.
- 62 test files, 581 passing tests.
- Thoughtful error boundaries with stale-chunk handling.
- 10 of 12 serverless endpoints correctly enforce authentication.

## What the developer got right

The gaps are not in the framework choice. They are in authorization at the data layer,
in one unauthenticated endpoint, and in process.

---

## P0 - live exposure

### 1. `app_data` has no authorization, only authentication  [FIXED 2026-08-23]

**STATUS: SHIPPED.** Client half `8da0d9e`, migration `app_data_contractor_row_isolation`.
Contractors now read and write 0 customer/job rows (165 KV rows retained); staff, no-role
users and dual-role staff all keep full access, verified against the live policies plus a
negative write test and a real staff login against production.

The scope was bigger than this section assumed: a contractor session was ALREADY pushing
admin `job:`/`customer:` rows back (Phase 3 scoped reads but never writes, and
`pullContractorScope` never marks its results clean, so `isDirty` treated them all as
dirty). Both halves had to move together, client first. See the 2026-08-23 note.

STILL OPEN from this item: `change_log` has the identical bare policies, and contractors
legitimately write it via `logJobChange`, so it needs its own analysis.

<details><summary>Original finding</summary>


VERIFIED live. RLS is enabled on `app_data`, which looks correct on a dashboard, but all
three policies are:

    auth.role() = 'authenticated'

There is no per-user and no per-role predicate. Any authenticated session, including a
contractor's, can SELECT and UPDATE every one of the 697 rows: 330 customers, 202 jobs,
149 contractor jobs, plus the CRM lead blob, the contractor roster, and service-rate pricing.

This matters because the app's contractor isolation lives in client-side `lib/authRouting.ts`.
A contractor who talks to PostgREST directly with their own valid JWT bypasses that entirely.
The client-side gating is a UI convenience, not a security control. `change_log` has the
identical gap.

The pattern is already understood in this codebase: `notifications` correctly uses
`auth.uid() = user_id`. It simply was never applied to the main table.

</details>

CAUTION: this is the highest-risk fix to perform, not just the highest-risk finding.
Tightening these policies carelessly breaks all app access instantly, because the sync
engine reads and writes `app_data` with the end user's JWT. Sequence it as: determine where
role actually lives (`user_metadata`, per `api/users.ts`), write a policy that grants staff
roles full access and restricts contractor JWTs to their own rows, test against a real
contractor session in a scratch environment, then apply. Do not apply directly to prod first.

Note: there is no DELETE policy, so deletes are already blocked. Preserve that.

### 2. `customer-files` storage bucket is public

VERIFIED live: `storage.buckets.public = true`, holding 2,371 objects across 27 prefixes.
A public bucket serves every object to anyone with the URL, with no login, and that flag
overrides the otherwise-correct RLS policies added on 2026-08-04 for reads. Those policies
are doing nothing for read access today.

Fix is a real migration, not a flag flip: set the bucket private, then move the app from
raw public URLs to signed URLs. Job photos are referenced by a stored `storageUrl`, so
that field's lifetime and the signing TTL have to be reconciled. Scope before starting.

### 3. `GET /api/trello-card` is unauthenticated

VERIFIED live against production: an anonymous request with a bogus card id returned
`{"error":"Trello API 400: Bad Request"}`. The 400 came from Trello, not from our auth
layer, which proves an anonymous caller reaches Trello using the org's server-side
`TRELLO_API_KEY` / `TRELLO_API_TOKEN`. A real card id returns lead names, phones, emails
and addresses, and each call burns org API quota.

`api/trello-card.ts` imports `requireUser` nowhere. This is the same bug already fixed in
`api/solaredge.ts` on 2026-08-03, whose own comment records that it "returned 361 customers'
names and addresses to an unauthenticated GET." The fix was never applied to its neighbour.

Effort: ~3 lines, mirroring `solaredge.ts`. This is the cheapest real win on the list.

### 4. Trello webhook fails open

`verifyTrelloSignature` contains `if (!secret) return true;` and `TRELLO_API_SECRET` is unset,
so signature verification is inert. Anyone who knows the URL can forge lead payloads onto the
live board and fan a notification to ~13 office users.

The fail-open was a deliberate choice (failing closed would kill the lead pipeline on a deploy
missing the var). That tradeoff is fine; the missing config is not. Effort: set one env var
in Vercel, no code change.

### 5. Two backup tables hold PII with RLS off

`_bak_crm_leads_20260808` (1 row) and `_bak_lljobs_20260809` (40 rows) have RLS disabled, so
the anon key can read and modify them. Both contain lead PII. Confirmed by grep to have zero
references anywhere in the codebase. Drop them, or enable RLS with no policies. Needs a
human decision on whether the backups are still wanted.

---

## P1 - process

### 6. CI is a notification, not a gate

`.github/workflows/ci.yml` runs the real build and tests on push and PR to main, and it is a
good workflow. But 1 of the last 30 commits arrived via a merge, and the Vercel GitHub
integration deploys on push independently of Actions. CI and the deploy start in parallel,
so a red CI run does not stop the deploy.

The gate is already built and paid for; it is just not wired to anything. Fix: require the
CI check on main via branch protection, or set a Vercel Ignored Build Step that consults the
check. This is the highest value-per-effort item in the whole plan.

### 7. No error monitoring

No Sentry or equivalent. Confirmed: zero references in `package.json`.

Smaller than it sounds. `shared/components/ErrorBoundary.tsx:33` already catches errors,
describes them, and persists them to `sessionStorage` so they survive the reload. The
structured capture exists; it just never leaves the browser. An error on a contractor's
phone in the field is invisible to the office.

TRAP: there are two separate ErrorBoundary implementations,
`shared/components/ErrorBoundary.tsx` (108 lines) and `components/ErrorBoundary.tsx`
(55 lines), with overlapping stale-chunk logic that has already drifted. Duplicate component
names are on this project's known silent-failure list. Instrumenting the wrong one produces
monitoring that looks live and reports nothing. Reconcile the two first, then instrument.

---

## P2 - code health

### 8. Job status resolution has drifted  [latent, not live]

`components/Customers.tsx:4081` resolves `job.woStatus ?? 'draft'`. Every other site
(`lib/woHelpers.ts:185`, `:302`, and four in `components/Dashboard.tsx`) resolves
`job.woStatus ?? job.status`. A job with a real `status` but no `woStatus` renders as
"draft" in the customer panel while the rest of the app sees its true stage.

Measured against live data: all 142 service orders currently carry `woStatus`, so the live
blast radius is ZERO. This is a latent trap, not a live bug. Fix it because it is a one-word
change, not because it is urgent. Slightly more relevant since `dbc6bb8` made those cards
clickable, so a mislabeled card would open a panel disagreeing with its own badge.

### 9. Churn hotspots

Commits / fix-commits / lines:

| File | Commits | Fix commits | Lines |
|---|---|---|---|
| `src/App.tsx` | 116 | 62 | 3722 |
| `src/components/Customers.tsx` | 79 | 37 | 5923 |
| `src/components/Jobs.tsx` | 53 | 16 | 1177 |
| `src/lib/syncEngine.ts` | 49 | 32 | 1784 |
| `src/components/contractor/JobDetail.tsx` | 35 | 18 | 2305 |

`Customers.tsx` is the largest file in the repo with a 47% fix ratio and no dedicated test
file. That combination is the strongest untreated code-health signal.

The code-fragility pass recommended hardening `syncEngine.ts` first on its 65% fix ratio.
Disagree: that ratio is historical, and the dominant generator of those 32 fix commits was
the whole-record LWW flaw removed in `e2cd8ad` today. More tests there are worth having but
do not outrank a live data exposure.

---

## Recommended sequence

Ordered by risk closed per unit of effort, not by severity alone.

1. **#3 trello-card auth** - ~3 lines, closes a live PII leak. Do first.
2. **#4 set `TRELLO_API_SECRET`** - config only, closes the fail-open.
3. **#5 drop or lock the backup tables** - needs one decision from you, then trivial.
4. **#6 make CI an actual gate** - highest value per effort in the plan.
5. **#1 `app_data` per-role RLS** - the real fix. Highest risk to perform; needs a test
   plan and a contractor-session dry run before it touches prod.
6. **#2 private bucket + signed URLs** - real migration, scope it before starting.
7. **#7 reconcile the two ErrorBoundaries, then add reporting.**
8. **#8 the one-word status fix**, plus characterization tests on `Customers.tsx`.

Items 1-4 are a single short session. Item 5 deserves its own session with its own rollback
plan. Item 6 deserves scoping first.

## Honest summary

The architecture is production-shaped. The authorization model is not: the database trusts
any logged-in session completely, and the file bucket trusts everyone. That is the real
substance behind "proof of concept," and it is a few days of focused work, not a rewrite.
