/**
 * SolarOps - Central environment-variable contract.
 *
 * Single source of truth for which env vars each serverless integration needs.
 * Used by:
 *   - the health endpoint (api/health.ts) to report readiness
 *   - the build/deploy guard (scripts/check-env.mjs) to block broken deploys
 *   - individual handlers, so a missing var yields a clear, structured error
 *     instead of a hard crash (FUNCTION_INVOCATION_FAILED).
 *
 * SECURITY: this module never exposes secret VALUES. It only reports presence.
 */

export interface EnvCheck {
  ok: boolean;
  missing: string[];
}

/** Read a trimmed env var. Treats empty string and whitespace as ABSENT. */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** First defined value among several names (for legacy / fallback names). */
export function envAny(...names: string[]): string | undefined {
  for (const n of names) {
    const v = env(n);
    if (v) return v;
  }
  return undefined;
}

/** Assert a set of required vars are all present. */
export function requireEnv(names: string[]): EnvCheck {
  const missing = names.filter((n) => !env(n));
  return { ok: missing.length === 0, missing };
}

/**
 * Declared requirements per integration.
 *
 * `critical: true`  -> the deploy is broken without it (blocks build guard).
 *                      Today only the shared auth guard is critical, because a
 *                      missing service-role key takes down EVERY proxy at once.
 * `critical: false` -> only that one feature degrades; the rest of the app and
 *                      other proxies keep working.
 *
 * `names` lists alternatives; the integration is satisfied if ANY is present.
 */
export interface IntegrationSpec {
  label: string;
  critical: boolean;
  /** Each entry is a group of interchangeable names (any-of). All groups required. */
  vars: string[][];
}

export const ENV_CONTRACT: Record<string, IntegrationSpec> = {
  auth: {
    label: 'Supabase auth (shared by all proxies)',
    critical: true,
    vars: [['SUPABASE_SERVICE_ROLE_KEY']],
  },
  solaredge: {
    label: 'SolarEdge monitoring proxy',
    critical: false,
    vars: [['SOLAREDGE_API_KEY']],
  },
  trello: {
    label: 'Trello card proxy',
    critical: false,
    vars: [['TRELLO_API_KEY', 'VITE_TRELLO_API_KEY'], ['TRELLO_TOKEN', 'VITE_TRELLO_TOKEN']],
  },
  xero: {
    label: 'Xero billing integration',
    critical: false,
    vars: [['XERO_CLIENT_SECRET']],
  },
  ups: {
    label: 'UPS package tracking',
    critical: false,
    vars: [['UPS_ACCESS_TOKEN']],
  },
  email: {
    label: 'Resend transactional email',
    critical: false,
    vars: [['RESEND_API_KEY']],
  },
  ai: {
    label: 'Anthropic lead-image parsing',
    critical: false,
    vars: [['ANTHROPIC_API_KEY']],
  },
};

export interface IntegrationStatus {
  key: string;
  label: string;
  critical: boolean;
  configured: boolean;
  /** Names of the var groups that are unsatisfied. Never includes values. */
  missing: string[];
}

/** Evaluate every integration's configured state. Values are never returned. */
export function evaluateContract(): IntegrationStatus[] {
  return Object.entries(ENV_CONTRACT).map(([key, spec]) => {
    const missing = spec.vars
      .filter((group) => !envAny(...group))
      .map((group) => group.join(' | '));
    return {
      key,
      label: spec.label,
      critical: spec.critical,
      configured: missing.length === 0,
      missing,
    };
  });
}
