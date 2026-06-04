/**
 * SolarOps - Build/deploy environment guard.
 *
 * Fails the build when a CRITICAL env var is missing, so the outage that took
 * down every API proxy (missing SUPABASE_SERVICE_ROLE_KEY) can never ship again.
 *
 * Behaviour:
 *   - Production deploy (VERCEL_ENV=production) OR STRICT_ENV=1  -> exit 1 on miss
 *   - Local / preview builds                                    -> warn, exit 0
 *     (so frontend-only devs without server secrets are not blocked)
 *
 * Keep CRITICAL in sync with `critical: true` entries in api/_env.ts.
 */

// any-of groups: integration satisfied if ANY name in a group is set.
const CRITICAL = [
  { label: 'Supabase auth (shared by all proxies)', anyOf: ['SUPABASE_SERVICE_ROLE_KEY'] },
];

const OPTIONAL = [
  { label: 'SolarEdge monitoring', anyOf: ['SOLAREDGE_API_KEY'] },
  { label: 'Trello proxy', anyOf: ['TRELLO_API_KEY', 'VITE_TRELLO_API_KEY'] },
  { label: 'Trello token', anyOf: ['TRELLO_TOKEN', 'VITE_TRELLO_TOKEN'] },
  { label: 'Xero billing', anyOf: ['XERO_CLIENT_SECRET'] },
  { label: 'UPS tracking', anyOf: ['UPS_ACCESS_TOKEN'] },
  { label: 'Resend email', anyOf: ['RESEND_API_KEY'] },
  { label: 'Anthropic lead parsing', anyOf: ['ANTHROPIC_API_KEY'] },
];

const present = (group) => group.anyOf.some((n) => (process.env[n] || '').trim() !== '');

const missingCritical = CRITICAL.filter((g) => !present(g));
const missingOptional = OPTIONAL.filter((g) => !present(g));

const strict = process.env.STRICT_ENV === '1' || process.env.VERCEL_ENV === 'production';

console.log(`\n[check-env] mode=${strict ? 'STRICT (deploy)' : 'lenient (local/preview)'}`);
console.log(`[check-env] critical OK: ${CRITICAL.length - missingCritical.length}/${CRITICAL.length}`);

if (missingOptional.length) {
  console.warn('[check-env] optional integrations not configured (those features will degrade):');
  for (const g of missingOptional) console.warn(`  - ${g.label} (${g.anyOf.join(' | ')})`);
}

if (missingCritical.length) {
  console.error('\n[check-env] MISSING CRITICAL ENV VARS:');
  for (const g of missingCritical) console.error(`  ✗ ${g.label} -> set one of: ${g.anyOf.join(' | ')}`);
  if (strict) {
    console.error('\n[check-env] Refusing to ship a broken deploy. Set the vars in Vercel and redeploy.\n');
    process.exit(1);
  }
  console.warn('\n[check-env] (lenient mode) continuing, but this deploy would be broken in production.\n');
} else {
  console.log('[check-env] all critical env vars present.\n');
}
