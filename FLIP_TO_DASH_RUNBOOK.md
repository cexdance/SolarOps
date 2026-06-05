# Cutover: make solarflow-dashboard/api the LIVE tree

## Why
Production currently deploys the **repo-root `/api`** tree (Vercel Root Directory = repo root).
ALL recent hardening (security, fault tolerance, users pagination/CRUD, T4 auth order,
`/api/health`) lives in `solarflow-dashboard/api`, which is NOT deployed. Flipping the Vercel
Root Directory to `solarflow-dashboard` activates all of it in one move, and fixes the
"Failed to load users (500)" because dash `users.ts` uses the Supabase SDK
(`auth.admin.listUsers`), which is compatible with the new `sb_secret_` key (root's raw REST
calls are not).

## Pre-reqs prepared on branch `chore/flip-ready-dash` (merge to main FIRST)
- Ported `send-report.py` into `solarflow-dashboard/api/` (else `/api/send-report` 404s after flip).
- Reconciled `solarflow-dashboard/vercel.json` CSP to match the proven-working prod CSP:
  added `'unsafe-inline'` to `script-src` (the inline version-guard script in index.html needs it)
  and `https://api.trello.com` to `connect-src`.
- Verified: `pnpm test` 123/123, `pnpm build` clean.

## Cutover steps (in order)
1. **Merge `chore/flip-ready-dash` to main.** (Do NOT merge the root-deletion PR #2 yet.)
2. **Vercel env:** set `SUPABASE_SERVICE_ROLE_KEY` to a working admin key, Production scope,
   Sensitive ON. Use the `sb_secret_...` value (works with dash's SDK). Save.
3. **Vercel project settings > General > Root Directory:** change from blank/repo-root to
   `solarflow-dashboard`. Save.
4. **Redeploy** (Deployments > redeploy latest). The dash build runs the env guard (strict on
   prod) - it will block if the key is missing, which is intended.

## Verify after deploy (all must pass)
- `GET /api/health` -> 200 `{"status":"ok"}` (no auth). [Was 404 - dash-only file now live.]
- App loads at the root URL; the version-guard inline script runs (no CSP console error).
- User Permissions panel loads the staff list (no 500).
- `GET /api/users` unauthenticated -> 401 (not 500).
- SolarEdge monitoring loads; Trello import works; SMTP test (`/api/send-report`) works.
- `GET /version.json` -> 200 (version poll intact).

## Rollback (if anything breaks)
Set Vercel Root Directory back to blank (repo root) and redeploy. Production returns to the
root `/api` tree immediately. No code revert needed.

## After a clean cutover (cleanup)
- Re-point PR #2 (or a new PR) to delete the now-dead repo-root `/api`, root `vercel.json`,
  and root `package.json`/`package-lock.json`. These are ignored once Root Directory =
  solarflow-dashboard, so deletion is safe post-flip.
- Keep `src/__tests__/noStaleApiTree.test.ts` (drift guard).
