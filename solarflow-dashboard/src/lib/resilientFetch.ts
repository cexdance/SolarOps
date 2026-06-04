/**
 * SolarOps - Resilient client fetch for /api/* proxies.
 *
 * Wraps authedFetch with bounded exponential-backoff retry on TRANSIENT
 * failures (network errors and 5xx, including Vercel FUNCTION_INVOCATION_FAILED)
 * and returns a structured result so callers can fall back to cached data and
 * show a non-fatal banner instead of a broken screen.
 *
 * It deliberately does NOT retry on 4xx (auth / bad request) or 429 (quota):
 * those are not transient and retrying wastes the daily SolarEdge budget.
 */
import { authedFetch } from './supabase';

export type FailureKind =
  | 'none'
  | 'transient' // network/5xx - retried, may recover
  | 'config' // server misconfigured (500 "not configured") - needs an env var
  | 'auth' // 401/403 - not signed in or key rejected
  | 'quota' // 429 - daily budget exhausted
  | 'client'; // other 4xx

export interface ResilientResult<T> {
  ok: boolean;
  data: T | null;
  status: number;
  kind: FailureKind;
  /** Human-readable, safe to show in a banner. */
  message: string;
  attempts: number;
}

interface Options {
  retries?: number; // max retry attempts on transient failure (default 2)
  baseDelayMs?: number; // backoff base (default 400ms -> 400, 800, 1600)
  timeoutMs?: number; // per-attempt timeout (default 12s)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classify(status: number, bodyText: string): { kind: FailureKind; message: string } {
  if (status === 0) return { kind: 'transient', message: 'Network unreachable. Will retry.' };
  if (status === 429) return { kind: 'quota', message: 'Daily API quota exceeded. Try again later.' };
  if (status === 401) return { kind: 'auth', message: 'Session expired. Please sign in again.' };
  if (status === 403) return { kind: 'auth', message: 'Access denied or invalid API key.' };
  if (status >= 500) {
    // The proxy returns a clean "...not configured" 500 when an env var is missing.
    if (/not configured|configured on server/i.test(bodyText)) {
      return { kind: 'config', message: 'Service not configured on the server. Showing cached data.' };
    }
    return { kind: 'transient', message: 'Server error. Retrying, then falling back to cached data.' };
  }
  if (status >= 400) return { kind: 'client', message: `Request failed (${status}).` };
  return { kind: 'none', message: '' };
}

const isTransient = (status: number) => status === 0 || status >= 500;

/**
 * Fetch a JSON endpoint with retry + structured failure reporting.
 * Never throws: callers always get a ResilientResult.
 */
export async function resilientJson<T = unknown>(
  url: string,
  opts: Options = {},
): Promise<ResilientResult<T>> {
  const retries = opts.retries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? 12_000;

  let lastStatus = 0;
  let lastBody = '';

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await authedFetch(url, { signal: controller.signal });
      clearTimeout(timer);
      lastStatus = res.status;

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as T | null;
        return { ok: true, data, status: res.status, kind: 'none', message: '', attempts: attempt };
      }

      lastBody = await res.text().catch(() => '');
      if (isTransient(res.status) && attempt <= retries) {
        await sleep(baseDelay * 2 ** (attempt - 1));
        continue; // retry
      }
      const { kind, message } = classify(res.status, lastBody);
      return { ok: false, data: null, status: res.status, kind, message, attempts: attempt };
    } catch (err) {
      clearTimeout(timer);
      lastStatus = 0;
      lastBody = String(err);
      if (attempt <= retries) {
        await sleep(baseDelay * 2 ** (attempt - 1));
        continue; // network error - retry
      }
    }
  }

  const { kind, message } = classify(lastStatus, lastBody);
  return { ok: false, data: null, status: lastStatus, kind, message, attempts: retries + 1 };
}
