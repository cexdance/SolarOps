# IONOS shared mailbox — connection foundation

Implemented October 4, 2026. This release verifies and securely stores one shared
IONOS mailbox. It does not enable background synchronization or the conversation UI.

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
The migration is required even with environment-based credentials. No production
database, secret configuration, or deployment was changed by this implementation.

Existing report SMTP settings are left intact. Their browser credentials have not
been migrated or erased. Route report sends through the shared mailbox in a later
step before removing that legacy setup.

## Next implementation slice

- A durable worker with bounded incremental IMAP batches and per-folder
  UIDVALIDITY/UID checkpoints; never import all 20,000 messages in one request.
- Explicit history window and folder selection before initial import.
- Dedicated messages/conversations tables and private attachment storage, with
  mailbox membership enforced by backend checks and row-level policies.
- Header-based threading and deduplication, customer/work-order linking, and an
  unmatched queue. Email addresses alone must not choose a work order.
- Shared inbox, customer/work-order communications views, reply composer and send
  queue. Save outbound messages in Sent Items through IMAP where needed.
- End-to-end test email, reply, duplicate ingestion, recovery and access tests
  before enabling shared use.

Connection checks confirm authentication and mailbox access. They do not establish
outbound deliverability or a completed send/receive round trip.
