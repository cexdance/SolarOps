// Sheet writes go through OUR server, never from the browser to Google.
//
// The browser used to POST the Apps Script /exec URL directly. That is a
// third-party request, so an extension, tracking protection or a corporate
// network can kill it: assigning US-15715 failed with a bare "NetworkError" on
// 2026-10-01 while the identical call from a server returned 200. These tests
// pin the request to our own origin so it cannot drift back.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authedFetch = vi.fn();
vi.mock('../lib/supabase', () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a) }));

// Pin the sheet URL. clientRegistry reads VITE_CLIENT_REGISTRY_URL at import, and
// it is set in a developer's .env.local but NOT in CI, so without this the same
// tests passed locally and failed in CI (stampSheetRow returned null). Pinned
// here, they exercise the configured path everywhere; the unconfigured path has
// its own test below that unsets it explicitly.
vi.stubEnv('VITE_CLIENT_REGISTRY_URL', 'https://script.google.com/macros/s/test/exec');
const { stampSheetRow, clearSheetRow, sheetRegistryConfigured } = await import('../lib/clientRegistry');

const reply = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

beforeEach(() => authedFetch.mockReset());

describe('stampSheetRow', () => {
  it('posts to our own origin, never to script.google.com', async () => {
    authedFetch.mockReturnValue(reply({ clientId: 'US-15715', name: 'Ron Devilliers' }));
    const out = await stampSheetRow('Ron Devilliers', 'US-15715');

    const [url, init] = authedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/notify');
    expect(url).not.toMatch(/google/);
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'registry-mirror', name: 'Ron Devilliers', clientId: 'US-15715',
    });
    expect(out).toEqual({ clientId: 'US-15715', name: 'Ron Devilliers' });
  });

  it('passes a row held by someone else straight through as taken', async () => {
    authedFetch.mockReturnValue(reply({ clientId: 'US-15703', name: 'Cherrington', taken: true }));
    expect(await stampSheetRow('Arlyn Pabon', 'US-15703')).toMatchObject({ taken: true, name: 'Cherrington' });
  });

  it('surfaces the server error text, not a bare status', async () => {
    authedFetch.mockReturnValue(reply({ error: 'Registry sheet unreachable: socket hang up' }, false, 502));
    await expect(stampSheetRow('Ron Devilliers', 'US-15715')).rejects.toThrow(/socket hang up/);
  });

  it('is skipped entirely when the sheet is not configured', async () => {
    // Preview builds have no VITE_CLIENT_REGISTRY_URL, so nothing is called.
    // A fresh module instance with the URL unset, so this ALWAYS runs rather
    // than only on a machine that happens to lack the variable.
    vi.stubEnv('VITE_CLIENT_REGISTRY_URL', '');
    vi.resetModules();
    try {
      const fresh = await import('../lib/clientRegistry');
      expect(fresh.sheetRegistryConfigured()).toBe(false);
      expect(await fresh.stampSheetRow('Ron Devilliers', 'US-15715')).toBeNull();
      expect(authedFetch).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv('VITE_CLIENT_REGISTRY_URL', 'https://script.google.com/macros/s/test/exec');
    }
  });
});

describe('clearSheetRow', () => {
  it('sends the release through the same proxy', async () => {
    authedFetch.mockReturnValue(reply({ clientId: 'US-15715', name: '', released: true }));
    expect(await clearSheetRow('US-15715', 'Ron Devilliers')).toBe(sheetRegistryConfigured());
    if (sheetRegistryConfigured()) {
      expect(JSON.parse(String((authedFetch.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
        action: 'registry-mirror', op: 'release', clientId: 'US-15715', name: 'Ron Devilliers',
      });
    }
  });

  it('never throws when the sheet is unreachable: the caller is already on an error path', async () => {
    // Driven through a real 502 rather than a mock that throws: a mock that
    // throws or rejects inside this file surfaces as an unhandled error and
    // fails the test for the wrong reason. The 502 reaches the same catch.
    authedFetch.mockReturnValue(reply({ error: 'Registry sheet unreachable: NetworkError' }, false, 502));
    expect(await clearSheetRow('US-15715', 'Ron Devilliers')).toBe(false);
  });
});
