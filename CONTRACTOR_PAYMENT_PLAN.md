# Contractor Payment Run - streamlining plan

Decisions collected from the user 2026-08-28 / 08-29. Scope is final for v1.

## Already solved, do not build

- **Intake.** Contractors email invoices to the Xero bills inbox and CC the user. Draft
  ACCPAY bills land in Xero on their own. No portal upload, no OCR pipeline, no mail agent.
- **The payment screen.** Xero's built-in Bills list is the screen. No custom UI is being built.
- **Proven precedent.** `~/conexsol-invoicer/` is the existing outside-SolarOps tool. Same
  principle applies here: keep it separate.

## Daniel's loop today

1. Open each Xero draft one by one to work out which SO/client it belongs to.
2. Cross-reference whether the client paid us.
3. Track from memory who has already been paid.
4. BofA app, Zelle the contractor.
5. Mark paid in Xero AND in SolarOps. Double entry.

Steps 1-3 are pure lookup and are the automation target. Step 4 is out of scope permanently.
Step 5 gets halved.

## Architecture: standalone agent, its own Xero OAuth

SolarOps is never connected to Xero. The partner's objection does not apply to this design.
See "How the connection works" below.

**Host: Supabase Edge Function on pg_cron, hourly.**
Not Vercel (`api/` sits at 13 files against a Hobby cap of 12). Not a Mac. Hourly is not
about freshness: Xero refresh tokens rotate on every use and die after 60 days idle, so a
schedule is what keeps the connection alive. A sleeping laptop locks itself out.

## What the agent does each run

1. Refresh the Xero token. **Persist the new refresh token before doing anything else** -
   Xero invalidates the old one the instant it issues a new one, so a crash after use but
   before write-back kills the connection and forces a re-authorization.
2. Pull ACCPAY bills in DRAFT.
3. Pull each bill's attachment. The SO code exists **only inside the PDF**, so extract the
   text layer and regex for the client code (`US-\d{5}`) and WO number. No text layer means
   no OCR: mark it unmatched and move on. Do not build OCR until the flagged count earns it.
4. Look up expected amount in SolarOps, and client-paid status from the matching ACCREC
   invoice in Xero. (Verify the SO code appears on client invoices before relying on this.)
5. **Write the Reference field back on the draft**, encoding everything Daniel needs to see
   from the list view without opening anything:

   ```
   US-15667 Todd Farley | OK
   US-15667 Todd Farley | CLIENT UNPAID
   US-15667 Todd Farley | AMT 480 vs 420
   NO MATCH
   ```

   Fix the contact too if the bills inbox guessed it wrong.
6. Detect bills that flipped to PAID since last run, and stamp `costsCoveredAt` in SolarOps
   so the contractor sees Paid in their portal. This is the half of the double entry we kill.

## What the agent does NOT do

- **It never approves a bill.** Decided 2026-08-29: Daniel approves every bill by hand.
  Approving commits a liability to the ledger, and auto-approving a wrong amount is a
  financial mistake, not a UI bug. Revisit only once the Reference data is trusted.
- It never sends money. BofA has no API for Zelle and executing transfers is off-limits.
  Daniel sends every payment himself, exactly as today.

## Daniel's loop after this ships

1. Open Xero Bills. Every row already reads `US-15667 Todd Farley | OK`.
2. Approve the OK ones. Ignore or chase the flagged ones.
3. Zelle down the list from the BofA app.
4. Mark paid in Xero. SolarOps updates itself.

No SolarOps page. No shortcut. No script. His ChatGPT and Gemini plans are not part of this
and cannot be: neither can hold a Xero OAuth token or write to Supabase. Tell him so he is
not waiting for a chat version.

## Dropped from earlier drafts

The SolarOps Billing "Contractor Payments" page. Once Daniel works entirely in Xero it has
no reader. Fewer things to build, smaller surface for the partner to object to.

## How the connection works

Standard OAuth 2.0 authorization code flow, held entirely server-side by the edge function.

- One-time: Daniel authorizes at `login.xero.com/identity/connect/authorize`; Xero redirects
  to `https://<project>.supabase.co/functions/v1/xero-oauth-callback` with a code; the
  function exchanges it at `identity.xero.com/connect/token` using client id + secret as
  Basic auth; then calls `api.xero.com/connections` once for the tenant id.
- Ongoing: refresh grant each run, then API calls with `Authorization: Bearer <token>` and
  `xero-tenant-id: <tenant>`.
- Credentials live in Supabase secrets. Never sent to a browser, never in the SolarOps
  bundle, no frontend code path reaches Xero. Delete SolarOps tomorrow and the Xero
  connection is unaffected. That separation is real, and it is what to show the partner.

Scopes: `offline_access` (no refresh token without it), `accounting.transactions`,
`accounting.attachments.read`, `accounting.contacts.read`.

## Blocked on Daniel

Both in `DANIEL_XERO_SETUP.md`:

1. Register the Xero app, return client id and secret (secret via password manager, not chat).
2. Name the Xero bank account the Zelle payments post against.

Nothing else in the build depends on him.

## Traps

- `SHOW_MONEY=false`: `formatMoney()` returns `-` for everything. Any money this touches in
  SolarOps must use `formatCost`. Has bitten three times.
- Contractor paid keys off `costsCoveredAt` ALONE. `woStatus:'paid'` means the CLIENT paid.
  Mirroring the wrong one tells a contractor they were paid while still owed.
- Verify the SO code actually appears on client ACCREC invoices before building step 4's
  client-paid gate on it. If it does not, that gate falls back to Daniel confirming a list.

---

# Phase 2: site-transfer client onboarding (added 2026-08-29)

Same agent, opposite direction: read SolarOps, write Xero. Still no code path from the
SolarOps frontend to Xero, so the partner's objection is untouched.

## Trigger, using only what already exists

A job where `serviceCode === 'SITE-TRX' || serviceType === 'Site Transfer'` (the existing
`isSiteTransfer` derivation, `ServiceOrderPanel.tsx:674`) whose billing column computes to
`to_invoice` (`Billing.tsx:35`, the column already subtitled "Create and send in Xero").

No new flag, no new state, no frontend change. Matches the 09-01 precedent where five
site-transfer behaviours all gated on the existing flag.

## What the agent does

1. Read the job's Customer. Everything a Xero contact needs is already on the record:
   name, email, phone, address, city, state, zip, `clientId` (`US-1XXXX`).
2. **Idempotency without new state:** write `clientId` into Xero's `ContactNumber` field,
   which is queryable. Before creating, ask Xero for a contact with that ContactNumber.
   Xero is the source of truth; SolarOps stores nothing new.
   - This deliberately avoids writing a `xeroContactId` back onto the Customer record.
     Customers sync whole-record LWW, so a stale client would clobber it.
     See gotcha_whole_record_lww_clobber.
   - Xero requires contact Name to be UNIQUE. Two customers with the same name will 400.
     On duplicate-name failure, retry as `Name (US-1XXXX)`. Do not let it fail silently.
3. Create a DRAFT ACCREC invoice for the site transfer, $120.

## Confirmation: Xero's Draft state IS the confirmation

User asked for "Daniel confirms first", but a contact that does not exist cannot be shown to
him, and he no longer opens SolarOps. Resolution: create the contact plus a DRAFT invoice.
Draft commits nothing to the ledger. He approves or deletes it.

This is the SAME rule as the contractor bills, so he learns one habit, not two:
**draft means it needs me, approved means I did it.**

The only thing created without his say-so is a contact record, which is not financial and is
archivable. Rejected alternative: an emailed click-to-create list. More literal, but it is a
second inbox to work and a new surface to build, for what Xero's draft state gives free.

## $120

Confirmed by the user as the CLIENT price, not just the internal cost. Note the code's
`SITE_TRANSFER_COST = 120` is documented as actual COST; these being equal is a coincidence
to re-check if either ever moves. Keep the price in agent config, not hardcoded in logic.

## BLOCKED on Daniel, needed before the invoice half can ship

1. **Which revenue account code** the $120 posts to.
2. **Tax treatment** of that $120: taxable, exempt, or inclusive. Getting this wrong
   misstates sales tax, which is worse than not automating. If he cannot answer confidently,
   ship contact-only first and add the invoice after.
3. (Carried from phase 1) the bank account the contractor Zelles post against.

## Traps

- The 09-01 note flags that the Parts & Labor `totalCost` breakdown and `SowDistributionModal`
  each derive their own actual cost, so they can already disagree with the flat $120. Do not
  source the invoice amount from either; use the config value.
