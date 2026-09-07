# SolarOps Fork and White-Label Plan

Target: stand up an independent, separately-branded instance of SolarOps for a second solar company, with its own Supabase database, its own Vercel project, and its own development schedule from the fork point forward.

Status: plan only. Nothing in this document has been executed.
Written: 2026-08-26. Against `main` @ `bded98f`.

---

## The honest summary first

Three things in this plan are not what they look like from the outside, and they drive the whole sequence:

1. **A `git clone` fork ships Conexsol customer PII into another company's repo.** Roughly 7,200 lines of real Conexsol data are baked into source files, not the database: 191 real sites with addresses in `solarEdgeSites.ts`, 76 real customers with name, email, phone and address in `powerCareCustomers.ts`, and ~3,500 lines in `mergedCustomers.ts`. Plus staff emails in `api/notify.ts` and 20 files carrying the hardcoded Conexsol Supabase project ref. This has to be scrubbed before the new repo has a second commit, not cleaned up later, because git history keeps it forever.

2. **The SolarEdge API will not give you the site owner's phone and email.** This is the single biggest correction to the brief. Verified against the deployed integration: this codebase only ever calls `/sites/list`, `/site/{id}/details`, `/energy`, `/overview`, `/alerts` and `/equipment`, and none of those carry homeowner contact fields. SolarEdge returns the site (name, address, peak power, install date, PTO date, system type, module, production, alerts). It does not return a person. Contact data has to come from Jobber. The CRM import is therefore a **two-source join**, not one SolarEdge pull. See Phase 4 and Phase 5.

3. **`api/` is at exactly 12 functions, which is the Vercel Hobby cap.** A Jobber import endpoint is function 13. Either the new project goes on Vercel Pro, or the Jobber importer runs as a local script rather than a deployed endpoint. Decide this in Phase 0, not at deploy time.

---

## Phase 0: decisions to make before any code

These block later phases. Answer them first.

| Decision | Why it blocks | Recommendation |
| --- | --- | --- |
| New company legal name, product name, domain | Every branding surface and all email `from` addresses | Needed before Phase 3 |
| Vercel plan: Hobby or Pro | 12-function cap; Jobber importer is #13 | Pro if you want the importer deployed; Hobby if it stays a local script |
| Does the new company keep Jobber running in parallel, or cut over? | Determines whether the Jobber importer is one-shot or recurring | One-shot import is far less work; recurring sync is a real integration project |
| Does the fork keep the contractor portal? | It is a large surface (`components/contractor/`, `api/contractor-jobs.ts`) with its own Conexsol-specific terms document | Keep only if they actually subcontract |
| Does the fork keep Trello lead intake, RingCentral, Xero, UPS? | Each is a live integration with its own credentials | Default: strip all four at fork, add back on demand |
| Who owns the new Supabase project and the SolarEdge API key | Credential custody | Answer before Phase 2 |
| Photo storage: reuse Supabase Storage, or point at OfficeCam? | Phase 6 scope | See Phase 6 |

---

## Phase 1: fork mechanics and the de-Conexsol scrub

**Do not `git clone` and push.** History carries the PII. Take a snapshot fork instead.

### 1.1 Create the new repo from a clean tree

1. Copy the working tree to a new directory. Do not copy `.git`.
2. `git init` fresh. The new repo starts at commit one with no Conexsol history.
3. Copy in `.gitignore` first, before the first `git add`, so `.env.local` and `ui-catalog/` never enter history.

Cost of losing history: you lose `git blame` and the dated notes. That is an acceptable trade against shipping another company's customer list. Keep the Conexsol repo as the reference you read when you need archaeology.

### 1.2 The PII scrub (blocking, do before commit one)

| File | What is in it | Action |
| --- | --- | --- |
| `src/lib/solarEdgeSites.ts` | 191 real Conexsol sites, addresses | Replace with empty `FL_SITES: SolarEdgeSite[] = []`. Keep the interface. Regenerate from the new company's SolarEdge key in Phase 4. |
| `src/lib/powerCareCustomers.ts` | 76 customers, name/email/phone/address | Delete the data array, keep the type if the PowerCare concept carries over. If it does not, delete the file and its imports. |
| `src/lib/mergedCustomers.ts` | ~3,500 lines of merged Conexsol customer records | Delete. This is a one-time migration artifact, not runtime code. Verify nothing imports it before deleting. |
| `src/lib/addressCleanupSeed.ts` | Seeded Conexsol addresses | Delete or empty. |
| `api/notify.ts` | 9 hardcoded `@conexsol.us` staff emails | Replace with the new company's recipients, or better, read recipients from the database. |
| `src/__tests__/*` | Real emails used as fixtures | Replace with `example.com` addresses. Tests should never carry live PII. |
| `src/lib/siteTransferEmail.ts`, `printServiceReport.ts`, `dataStore.ts`, `contractorStore.ts` | Scattered `@conexsol` literals | Route through a single brand config (see 3.1). |

**Verification gate for this phase.** The new repo must return zero for all of these before commit one:

```bash
grep -rEi "conexsol|cjmhfagkkayelcsprbai" . --exclude-dir=node_modules --exclude-dir=.git
```

```bash
grep -rE "@(gmail|yahoo|hotmail|aol|icloud)\.com" src/ api/ --exclude-dir=node_modules
```

Treat a non-zero result as a hard stop, the same way a red build is.

### 1.3 The hardcoded database URL

`https://cjmhfagkkayelcsprbai.supabase.co` appears as a **string literal**, not an env var, in 20 files including `api/_auth.ts`, `api/notify.ts`, `api/users.ts`, `api/contractor-jobs.ts`, `api/send-quote.ts`, `api/approve-quote.ts` and `api/push-subscribe.ts`.

This is the highest-risk item in the entire fork. If one file is missed, the new company's app authenticates users against Conexsol's database, or worse, writes into it. It will not error. It will just work, against the wrong tenant.

Fix properly, do not find-and-replace:

1. Create `api/_config.ts` exporting `SUPABASE_URL` from `process.env.SUPABASE_URL` with **no fallback default**. A missing env var must throw at first use, loudly.
2. Change every one of those files to import it.
3. The scripts in `solarflow-dashboard/scripts/` are one-off Conexsol maintenance scripts (`add-mia-lopez.mts`, `reset-all-passwords.mts`, `find-cesar-daniel-comment.mjs`, and so on). Delete them at fork rather than porting them.

The reason the literal-with-fallback pattern is dangerous here: `process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai...'` fails **open** onto Conexsol's database when the env var is missing. Fail closed instead.

---

## Phase 2: the new database

1. New Supabase project, new region, new keys. Nothing shared with Conexsol.
2. Port the schema, not the data. Export the migration set from the Conexsol project and replay it.
3. **Port the RLS policies deliberately, and re-verify them.** The security work from 2026-08-23 through 08-25 is load-bearing and easy to lose in a schema port:
   - `public.user_roles` plus `is_staff()` as the only trusted role source. Never authorize off `user_metadata`, it is user-forgeable.
   - `app_data` contractor row isolation.
   - `change_log` read isolation, with contractor INSERT still permitted and SELECT denied.
   - `change_log_stamp_actor_trg`, which stamps `actor_uid` from `auth.uid()`.
   - `change_log_payload_size` CHECK at 64 KB.
4. **Fix the two known-open items during the port rather than inheriting them**, since a fresh database is the cheapest time to do it:
   - `app_data` has zero DELETE policies, so tombstone reaps are a silent no-op. Add the policy and check affected-row count, not just `error`.
   - The `customer-files` bucket is `public=true`. On a new project, start it private with signed URLs. Retrofitting this on Conexsol is blocked by stored `storageUrl` values; a new project has no such history.
5. Storage buckets: create fresh, private by default.
6. Seed the role table with the new company's staff before anyone logs in.

**Verification gate.** Log in as a contractor-role user and confirm they read zero admin rows. Log in as staff and confirm they read the full set. A denial returns zero rows with `error === null`, so verify by row count, never by absence of an error.

---

## Phase 3: branding

### 3.1 Introduce a brand config, do not find-and-replace

There are 169 `ConexSol` display-string occurrences across 20 files and 112 `solarflow_` storage-key references. These are two different problems and must be handled differently.

**Display strings** go into one file, `src/lib/brand.ts`:

```
company name, legal name, support email, from-address,
domain, phone, logo paths, theme color, product title
```

Every user-visible string reads from it. This is the one abstraction in this plan worth building, because the alternative is 169 scattered literals that drift.

**Storage keys (`solarflow_data`, `solarflow_auth`, `solarflow_contractor_jobs`, and so on) should NOT be renamed.** They are internal localStorage and IndexedDB keys. Renaming them touches the sync engine in 112 places for zero user-visible benefit and real risk of a key mismatch between the push path and the pull path, which is exactly the class of bug that has bitten this codebase repeatedly. Leave them. Nobody sees them.

### 3.2 Asset swap

- `public/`: replace `conexsol-globe.svg`, `conexsol-logo-color.png/svg`, `conexsol-logo.png`, all six favicons, `apple-touch-icon.png`.
- `index.html`: `<title>`, the favicon comment, `theme-color` (currently `#f97316`, Conexsol orange).
- `manifest.webmanifest`: name, short_name, icons, theme color.
- `solarflow-dashboard/package.json`: `name` is currently `react_repo`. Set it properly. Reset `version` to `1.0.0`, since the fork's version history starts now.
- Tailwind theme tokens in `index.css` if the new brand's palette differs.

Ask for the new company's design document and logo before starting this phase, since the palette decision cascades into `index.css`.

### 3.3 Do not skip

`src/components/contractor/ConexSolTerms.tsx` is a legal terms document with the Conexsol entity named in it. Either replace it with the new company's terms or delete the contractor portal entirely per the Phase 0 decision. Shipping another company's legal terms under a new brand is not a cosmetic problem.

---

## Phase 4: SolarEdge site ingestion

The new company uses SolarEdge, so this integration ports over almost unchanged. `api/solaredge.ts` is a clean server-side proxy: it injects `SOLAREDGE_API_KEY` server-side, requires an authenticated caller, sets per-endpoint CDN cache headers, and passes 429 and 403 through as clean JSON. Nothing about it is Conexsol-specific except the key.

### 4.1 What you actually get from SolarEdge

Per site, from `/sites/list` and `/site/{id}/details`:

- site id, site name, account id
- full address (street, city, state, zip, country)
- status (Active, Pending, Disabled)
- peak power (kW DC)
- installation date, PTO date
- system type, primary module manufacturer and model
- notes field
- production: today, month, year, lifetime kWh
- alerts count and highest impact
- inverter and equipment list, per site

That is a genuinely useful CRM seed. It gives you the site, the system, and the service history hooks.

### 4.2 What you do not get, and the workaround

**No owner name in a usable form. No phone. No email.** The `siteName` field is whatever the installer typed. In the Conexsol data it is inconsistent: some are customer names, some are `US-15586` account codes, some are `City of Tamarac Firestation 36`, one is literally `DELETE FL`. The existing `siteToName()` helper and the `/^US[\s-]\d+/i` regex in `SolarEdgeImportModal.tsx` exist precisely because that field is unreliable.

There is one narrow exception worth checking with the new company: SolarEdge's `/accounts/list` endpoint does return `contactPerson`, `email` and `phone`, but at the **account** level. If the new company created a separate SolarEdge sub-account per customer, that is a real contact source. If all their sites sit under one installer account, which is the common setup, `/accounts/list` returns one row: the installer's own contact details. This codebase has never called that endpoint. **Check their account structure before promising contact ingestion from SolarEdge.**

### 4.3 The import

1. Set `SOLAREDGE_API_KEY` for the new Vercel project.
2. Run the existing `scripts/import_from_solaredge.mts` against the new key to regenerate `solarEdgeSites.ts`.
3. Reuse `SolarEdgeImportModal.tsx`, which already does the diff-and-review flow: it shows what changed per site, searches by name, US-ID, address or site number, and lets a human approve. Do not auto-import 200 sites unreviewed.
4. Mind the quota. SolarEdge free tier is roughly 300 calls per day. A full site list plus per-site details for 200 sites is 201 calls. Budget the import across two days if their fleet is larger, or confirm their tier.
5. Address parsing: `SolarEdgeImportModal.tsx` already handles SolarEdge returning `location.address` in European order (street name then house number). Keep that normalization, it is not obvious and it is easy to lose.

---

## Phase 5: Jobber migration, which is where the contacts actually come from

This is the phase the brief under-scoped. The customer name, phone and email the new company wants in the CRM live in Jobber, not SolarEdge.

### 5.1 Get the data out of Jobber

Two options, in order of laziness:

**Option A, CSV export.** Jobber exports Clients (name, emails, phones, addresses), Properties, Jobs, Quotes and Invoices as CSV from its own UI. For a one-shot cutover this is almost certainly enough, needs no API credentials, no OAuth app, and no rate limits. Start here.

**Option B, Jobber GraphQL API.** Jobber has a GraphQL API with `clients`, `properties`, `jobs`, `invoices`. It requires registering a developer app and an OAuth flow. Only worth it if the new company runs Jobber and SolarOps in parallel and needs recurring sync.

Recommendation: Option A unless Phase 0 says they are running both systems in parallel. A one-shot CSV import is a script, not an integration.

### 5.2 The join

This is the real work of the phase. You have two datasets keyed differently:

- SolarEdge: keyed by `siteId`, has address, has no person.
- Jobber: keyed by client id, has person, has service address.

**Join on normalized address.** The repo already has `addressValidator.ts` (449 lines) and a documented history of address remediation across 337 customers on 2026-06-10, so the normalization problem is known and partly solved here. Reuse it.

Expect a three-bucket outcome, and design the importer to produce all three rather than forcing a match:

| Bucket | Meaning | Handling |
| --- | --- | --- |
| Matched | Jobber client address matches a SolarEdge site | Create customer with contact data, link `siteId` |
| Jobber only | Client with no SolarEdge site | Create customer, no site link. Could be a non-solar customer or a different-brand install |
| SolarEdge only | Site with no Jobber client | Create site record flagged for manual owner lookup |

Do not silently drop the unmatched buckets. Surface them in the import review UI. The existing `trelloImporter.ts` and the PowerCare Trello import are the working precedent for this pattern in the codebase.

**Guard the match predicate.** There is a repeated bug class in this codebase where `a?.x.includes(q)` silently deletes rows because the optional-chained miss is falsy. Write the matcher so an unmatched record lands in a bucket, never in `undefined`.

### 5.3 Where the importer runs

Given `api/` is at the 12-function cap, run this as a local `.mts` script against the new Supabase project using the service role key, not as a deployed endpoint. It is a one-shot migration. It does not need to be a serverless function. This also sidesteps the Hobby cap decision entirely.

---

## Phase 6: OfficeCam and photo input

The new company uses OfficeCam for image capture. Investigate before committing to an approach, since this was not verifiable from here.

The relevant fact about this codebase: job photos already migrated to Supabase Storage, and there is prior art in `parse-lead-image.ts` for ingesting an image and extracting structured data from it. The contractor portal has a working photo upload path with `deletedPhotoStems` tombstones.

Three plausible integrations, cheapest first:

1. **Manual upload.** OfficeCam exports, staff attach to the work order using the existing upload path. Zero integration work. Ship this first.
2. **Shared folder watch.** If OfficeCam writes to a synced folder, a script uploads to Supabase Storage and links by work order number in the filename.
3. **API integration.** Only if OfficeCam has an API and volume justifies it.

Start at 1. Do not build 3 before the new company is actually using the system daily.

---

## Phase 7: independent development from the fork point

Once the fork is live, the two repos diverge permanently. Set this up deliberately.

- **No shared package, no monorepo, no submodule.** Two separate repos. The temptation to extract a shared core library will be strong and should be resisted until at least one real cross-repo fix has been done twice by hand. Premature extraction couples two release schedules that the whole point of this exercise is to decouple.
- **Cherry-pick, do not merge.** When a genuine bug fix lands in Conexsol that also affects the fork, cherry-pick the specific commit. Keep a short `PORTED.md` in the fork listing which Conexsol commits were pulled across and which were deliberately skipped.
- **The security migrations are the exception worth watching.** If a new RLS or auth flaw is found in one repo, apply it to both the same day. Everything else can drift.
- Separate Vercel project, separate deploy pipeline, separate `version.json`. Reuse the `/deploy` verification loop: poll `version.json` for the sha, then spot-check a real `/api/*` route, since a matching sha alone is not proof the serverless functions built.
- **Run `vercel --prod` from the repo root, never from inside the dashboard directory.** This caused a 21-hour production outage on 2026-08-12 where every `/api/*` route returned 404. Carry this rule into the new repo's CLAUDE.md at fork time.

---

## Suggested sequence

| Step | Phase | Blocking on |
| --- | --- | --- |
| 1 | Phase 0 decisions | The new company |
| 2 | Phase 2, new Supabase project and schema | Decision on credential custody |
| 3 | Phase 1, clean-tree fork and PII scrub | Step 2, so env vars point somewhere real |
| 4 | Phase 1.3, database URL de-hardcoding, with the grep gate green | Step 3 |
| 5 | First deploy of an unbranded but functional fork, verified against the new database | Step 4 |
| 6 | Phase 3, branding | Design document and logo |
| 7 | Phase 4, SolarEdge import | Their API key, and the account-structure answer from 4.2 |
| 8 | Phase 5, Jobber import and join | Their Jobber export |
| 9 | Phase 6, OfficeCam, manual path only | Nothing |
| 10 | Phase 7, divergence rules written into the new CLAUDE.md | Nothing |

Steps 1 through 5 are the fork. Steps 6 through 9 are the onboarding. They can be scheduled independently, and step 5 is a genuine milestone worth stopping at: a working, empty, correctly-isolated system.

---

## Open questions for the new company

1. What is the SolarEdge account structure: one installer account with many sites, or a sub-account per customer? This determines whether 4.2's contact workaround exists.
2. Are they cutting over from Jobber, or running both?
3. Roughly how many sites and how many Jobber clients? This sizes the quota budget and the join effort.
4. Does OfficeCam have an export folder or an API?
5. Do they subcontract, meaning does the fork keep the contractor portal?
6. Which integrations do they need on day one: Xero, RingCentral, Trello, UPS, or none?
