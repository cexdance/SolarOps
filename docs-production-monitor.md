# Florida production monitor

The GitHub Actions workflow `Florida production monitor` runs daily at 11:00 UTC (7 AM Eastern daylight time, 6 AM standard time). It operates independently of the Mac and browser. Manual runs support a dry-run option.

All SolarEdge v2 sites and alerts are paginated. Explicit Florida/FL locations are included. If location state is absent, Conexsol's US-number naming is used as the Florida fallback. Explicit other states are excluded.

## Review rules

- Communication: an open SITE_COMMUNICATION_FAULT or RAPID_SITE_COMMUNICATION_FAULT with SolarEdge `firstTrigger` at least 48 hours old, or a timezone-qualified lastUpdateTime at least 48 hours old. Inverter-only communication faults do not establish a whole-site outage. Poll timestamps and null energy values do not establish communication loss. Sites without evidence are counted as unknown communication coverage.
- Production: latest seven completed days in each site's timezone versus the arithmetic average of the ten preceding, nonoverlapping seven-day periods. Production at or below 60% of that average triggers review. All 77 daily values must be finite and nonnegative; missing/null readings are insufficient data, while actual zero is valid. A zero baseline cannot establish a percentage decline.
- The scan runs daily. A communication threshold crossing is detected at the next successful scan, rather than exactly at hour 48.
- Weather and seasonality are not automatically corrected. These flags request human online review, not a diagnosis.

Daily energy requests are split into windows below SolarEdge's one-month limit. Requests are paced below 25 per minute and retry 429/5xx responses. History is cached, with recent ten-day refreshes and a complete refresh every seven days. Initial scans require roughly three energy calls per site. Progress is persisted every 25 sites. A failed site read cannot clear an existing incident or turn missing production into zero.

## Queue and email

Open SolarOps, SolarEdge Monitoring. The human review queue shows open and in-review incidents, scan coverage, failures, and stale scan warnings. Operations staff can start reviews and complete them with findings/next steps. History retains the reviewer and notes. Recovery does not silently complete the human review. A recovered condition that reappears creates a new incident.

New incidents prepare notifications to cesar.jurado@conexsol.us and hold them for explicit approval. Subjects state the number of Florida sites and the trigger, such as `SolarOps: 3 Florida sites need human review | 48h communication outage / 40% production drop`. Links open individual SolarEdge sites and the SolarOps queue. Successfully notified unresolved incidents are not resent. Failed delivery remains pending for another approved attempt. Resend's idempotency key reduces duplicate delivery during retries; delivery and database acknowledgement are not one atomic transaction.

## Deployment and storage

GitHub repository secrets: SOLAREDGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. Never put their values in the repository or logs. Workflow permissions are contents-read, with serialized fleet scans and no pull-request trigger.

The existing `/api/solaredge?action=production-reviews` route hosts authenticated GET and POST queue operations without adding another Vercel function. Trusted public.user_roles controls access; admin/coo/support can review. Staff can read. Responses are no-store.

State and cached energy live under app_data key solarops_production_reviews, with timestamp compare-and-set updates to preserve concurrent human decisions. Because this app's shared KV permits authenticated access to other namespaces, this payload uses AES-256-GCM encryption and integrity checks. The server and runner derive its key from the Supabase service-role secret. Coordinated service-role rotation requires decrypting and re-encrypting existing state with the new key before removing the old key. Encryption does not prevent deletion or replay by callers who can mutate shared KV; database RLS tightening remains a platform-level improvement.

A failed or absent GitHub run appears as stale coverage after 36 hours. GitHub emails workflow failures according to the repository owner's notification settings. Queue data is never presented as a completed healthy scan while history is unavailable.

## SMTP email setup

SMTP is supported as an alternative to Resend. POP credentials are not used.

Run `node scripts/setup-production-smtp.mts` and open http://127.0.0.1:4790/. The loopback-only form requires a matching origin and CSRF token. It verifies authenticated encrypted SMTP, then stores SMTP_HOST, SMTP_PORT, SMTP_SECURITY, SMTP_USER, SMTP_PASSWORD, SMTP_FROM and SMTP_ENABLED in GitHub repository secrets. A private mode-0600 setup copy is stored outside the repository at ~/.executor/solarops-smtp.json. Passwords are never logged or written into committed files. The account owner enters and submits these credentials directly.

SMTP uses implicit TLS or required STARTTLS with certificate validation and TLS 1.2 or newer. The worker prefers SMTP when SMTP_ENABLED is true; otherwise it can use Resend with PRODUCTION_MONITOR_FROM as an optional sender override. Nodemailer 10.0.14 is pinned in the root lockfile, with source and official documentation checked before installation. The workflow installs locked dependencies without package lifecycle scripts and exposes credentials only to the SMTP verification and scan steps.

A manual notifications_only workflow run checks pending email without rescanning sites; sending additionally requires the exact approved_email_digest. Combining it with dry_run lists pending incidents without sending. SMTP acceptance stores a notification receipt and timestamp. Message IDs are deterministic per digest, but SMTP acceptance and database acknowledgement are not atomic, so duplicate delivery remains possible after a storage failure. Failed sends do not mark incidents notified. The queue explicitly shows counts awaiting approval.

Public UI catalog screenshots use sample sites through scripts/check-production-review-ui.mjs. Live full-page QA screenshots stay local. Desktop/mobile checks cover starting review, required notes, completion, history, layout and page errors.

## Email approval requirement

Cesar requires explicit approval before every email. Daily scans save review items but never send email. Before a manual send, show Cesar the recipient, subject, and complete message; only after approval pass the exact current emailApprovalDigest as approved_email_digest with notifications_only enabled. A missing or mismatched digest holds the email. SMTP connection checks do not send messages.
