/** Abort auth transport (including its response body) before returning control to the UI. */
export function createAuthFetch(
  fetcher: typeof fetch,
  supabaseUrl: string,
  timeoutMs = 12_000,
): typeof fetch {
  const authRoot = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/`);
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== authRoot.origin || !url.pathname.startsWith(authRoot.pathname)) {
      return fetcher(input, init);
    }

    const controller = new AbortController();
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const forwardAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException(
      'Authentication timed out. Check your connection and try again.', 'TimeoutError',
    )), timeoutMs);
    try {
      controller.signal.throwIfAborted();
      const response = await fetcher(input, { ...init, signal: controller.signal });
      // Auth responses are small JSON payloads. Keep the deadline active through
      // body consumption so a stalled body cannot later produce a saved session.
      const body = await response.arrayBuffer();
      controller.signal.throwIfAborted();
      return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  };
}
