// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createAuthFetch } from '../lib/authFetch';

const origin = 'https://auth-fixture.invalid';
const tokenUrl = `${origin}/auth/v1/token?grant_type=password`;

function stalledFetch() {
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn<typeof fetch>((_input, init) => {
    signal = init?.signal ?? undefined;
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) reject(signal.reason);
      else signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
    });
  });
  return { fetcher, signal: () => signal };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('auth transport deadline', () => {
  it('aborts the actual request and clears the timer', async () => {
    vi.useFakeTimers();
    const transport = stalledFetch();
    const pending = createAuthFetch(transport.fetcher, origin, 50)(tokenUrl);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(transport.signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards caller cancellation from Request and removes its listener', async () => {
    const caller = new AbortController();
    const request = new Request(tokenUrl, { signal: caller.signal });
    const remove = vi.spyOn(request.signal, 'removeEventListener');
    const transport = stalledFetch();
    const pending = createAuthFetch(transport.fetcher, origin)(request);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();
    await rejection;
    expect(transport.signal()?.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('does not start a request with an already aborted init signal', async () => {
    const caller = new AbortController();
    caller.abort();
    const transport = stalledFetch();
    await expect(createAuthFetch(transport.fetcher, origin)(tokenUrl, { signal: caller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.fetcher).not.toHaveBeenCalled();
  });

  it('keeps the deadline active while reading the response body', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
      },
    })));
    const pending = createAuthFetch(fetcher, origin, 50)(tokenUrl);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
  });

  it('discards a late success even if an injected fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    let finish: (response: Response) => void = () => {};
    const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve; }));
    const pending = createAuthFetch(fetcher, origin, 50)(tokenUrl);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(50);
    finish(Response.json({ access_token: 'synthetic-late-token' }));
    await rejection;
  });

  it('passes other API traffic through without changing its signal or body', async () => {
    const response = new Response('storage-data');
    const fetcher = vi.fn<typeof fetch>(async () => response);
    const init = { signal: new AbortController().signal };
    expect(await createAuthFetch(fetcher, origin)(`${origin}/storage/v1/object`, init)).toBe(response);
    expect(fetcher).toHaveBeenCalledWith(`${origin}/storage/v1/object`, init);
  });

  it('preserves successful auth JSON and releases its timer', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ user: { id: 'fixture' } }));
    const response = await createAuthFetch(fetcher, origin)(tokenUrl);
    expect(await response.json()).toEqual({ user: { id: 'fixture' } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('SDK password timeout makes one request and never persists a session', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = stalledFetch();
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
    const client = createClient(origin, 'synthetic-anon-key', {
      global: { fetch: createAuthFetch(transport.fetcher, origin, 50) },
      auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await client.auth.getSession();
    const pending = client.auth.signInWithPassword({ email: 'fixture@example.invalid', password: 'synthetic-only' });
    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;
    expect(result.error).toBeTruthy();
    expect(result.data.session).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.fetcher).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
