# IONOS shared mailbox — connection foundation

Implemented October 4–5, 2026. The connection foundation is live and verified.
The next slice adds bounded manual synchronization, initially paused, with an
explicit new-emails-only activation control. The conversation/reply UI is not yet built.

## Verified locally

The existing private SMTP setup at `~/.executor/solarops-smtp.json` authenticated
successfully to both SMTP and IMAP. IMAP reported 19,958 Inbox messages and detected
`Sent Items`. No messages were sent, downloaded, marked read, or deleted.

Repeat this read-only check with Node 22+:

```sh
node --experimental-strip-types scripts/check-ionos-mailbox.mts
```

The script prints only protocol results and folder metadata. Never print, commit,
or copy the private credential file into the frontend.

## Activate on the application server

1. Apply `supabase/migrations/20261004_shared_mailbox.sql` to the application's
   Supabase project. The table is accessible only by the service role.
2. Generate a cryptographically random 32-byte key and store its 64-character hex
   encoding in the server's secret environment variable `MAILBOX_ENCRYPTION_KEY`.
   Keep a secure backup; changing the key requires re-encrypting the stored record.
   Never use a `VITE_` prefix or include the key in frontend code.
3. Deploy the root API and dashboard together. The API requires the existing
   `SUPABASE_SERVICE_ROLE_KEY` and the matching `SUPABASE_URL`.
4. An admin opens Settings → Shared IONOS mailbox and selects Verify & save
   connection. Both SMTP and IMAP must pass before the database record is replaced.
   Passwords are encrypted with AES-256-GCM and never returned by the API.
5. Check connection repeats authentication and lists folder metadata without sending
   email or reading message contents. An authenticated database `admin` role is
   required; editable auth metadata does not grant access.

Alternatively, the server can reuse `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and
`SMTP_PASSWORD`, plus optional `IMAP_HOST`, when no encrypted database record exists.
The scheduler's GitHub secrets and private local file are separate from Vercel's
environment; their presence does not automatically configure the deployed app.
The migration is required even with environment-based credentials. The connection migration, encrypted credential record, and server encryption key
were activated in production on October 5. SMTP and IMAP checks passed from the
deployed application.

Existing report SMTP settings are left intact. Their browser credentials have not
been migrated or erased. Route report sends through the shared mailbox in a later
step before removing that legacy setup.

## Incremental synchronization pilot

Apply `supabase/migrations/20261005_mailbox_sync.sql`. Its rollback checks are in
`scripts/checks/mailbox-sync.sql`; execute them in the same transaction as the
migration and roll back before applying the migration normally. These passed
against the live database using synthetic records that were rolled back.

The pilot remains paused with zero imported messages, as requested. An admin can
explicitly enable new-email capture in Settings. Activation records UIDNEXT minus
one for Inbox and the detected Sent folder without fetching existing messages.
Run sync processes at most ten messages per folder, with bounded UID windows,
a database lease, and atomic message/checkpoint commits. Pause invalidates the
lease. Resume continues from the saved checkpoint, including mail received while
paused. A changed mailbox address or UIDVALIDITY pauses processing for review.

Original MIME files (including attachments) are retained in the private
`mailbox-originals` bucket. A restrictive storage policy excludes this bucket from
older broad authenticated policies. Browser roles cannot read the email tables or
execute the worker RPCs. The API currently permits admins only. Messages over
15 MB are recorded as `too_large`; their bodies stay in IONOS and are explicitly
flagged in the pilot UI. Raw HTML is never rendered by the status screen.

No scheduled polling is enabled for this pilot. The sync handler supports a
separate hashed scheduler token limited to running batches for a future scheduler;
it cannot activate synchronization or read email summaries. The current Vercel
Hobby plan limits deployment to 12 functions, so both mailbox URLs are rewrites
through `api/users.ts`, with isolated admin authorization in each handler.

The existing reporting email workflow remains unchanged. This pilot does not send
messages or mark mail read, move it, or delete it in IONOS.

## Remaining communications work

- Schedule automatic polling after the manual pilot is accepted. No historical
  import is enabled; any later backfill needs an explicit scope.
- Conversation tables and mailbox membership for staff access; keep the pilot
  admin-only until permissions and customer/work-order links are reviewed.
- Header-based threading and deduplication, customer/work-order linking, and an
  unmatched queue. Email addresses alone must not choose a work order.
- Shared inbox, customer/work-order communications views, reply composer and send
  queue. Save outbound messages in Sent Items through IMAP where needed.
- End-to-end test email, reply, duplicate ingestion, recovery and access tests
  before enabling shared use.

Connection checks confirm authentication and mailbox access. They do not establish
outbound deliverability or a completed send/receive round trip.
