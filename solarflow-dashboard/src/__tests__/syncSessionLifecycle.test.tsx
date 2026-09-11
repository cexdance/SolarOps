import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  session: null as { user: { id: string } } | null,
  authUnsubscribe: vi.fn(),
  realtimeUnsubscribe: vi.fn(),
  subscribe: vi.fn(),
  pull: vi.fn(async () => null),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {
  getSession: vi.fn(async () => ({ data: { session: mocks.session } })),
  onAuthStateChange: vi.fn((listener: typeof mocks.listener) => {
    mocks.listener = listener;
    return { data: { subscription: { unsubscribe: mocks.authUnsubscribe } } };
  }),
} } }));
vi.mock('../lib/outbox', () => ({ drainOutbox: vi.fn(async () => true), resetOutboxAttempts: vi.fn() }));
vi.mock('../lib/syncEngine', () => ({
  pullAndMerge: mocks.pull,
  subscribeToChanges: mocks.subscribe,
  mergeCustomerPair: vi.fn(), mergeJobFields: vi.fn(), mergeWoPhotos: vi.fn(), resetSyncCursor: vi.fn(),
}));
vi.mock('../lib/contractorStore', () => ({ loadContractors: vi.fn(), loadServiceRates: vi.fn(), loadContractorJobs: vi.fn() }));
import { useSyncEngine } from '../hooks/useSyncEngine';
import { resetSyncCursor } from '../lib/syncEngine';

const options = {
  setData: vi.fn(), setContractors: vi.fn(), setServiceRates: vi.fn(), setContractorJobs: vi.fn(),
  skipContractorPersist: { current: false },
};
let controls: ReturnType<typeof useSyncEngine>;
function Harness() { controls = useSyncEngine(options); return null; }
let root: Root;
let container: HTMLDivElement;
async function mount() {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => { root.render(createElement(Harness)); });
  await vi.dynamicImportSettled();
}
async function event(name: string, id: string | null) {
  mocks.session = id ? { user: { id } } : null;
  await act(async () => {
    mocks.listener?.(name, mocks.session);
    await vi.advanceTimersByTimeAsync(0);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.pull.mockReset().mockResolvedValue(null);
  mocks.session = null;
  mocks.listener = null;
  mocks.subscribe.mockReturnValue(mocks.realtimeUnsubscribe);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.useRealTimers();
});
describe('sync session lifecycle', () => {
  it('hydrates and subscribes on a fresh login, outside the auth callback lock', async () => {
    await mount();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    const initialPulls = mocks.pull.mock.calls.length;
    mocks.session = { user: { id: 'staff-1' } };
    mocks.listener?.('SIGNED_IN', mocks.session);
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(mocks.pull).toHaveBeenCalledTimes(initialPulls);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.pull).toHaveBeenCalledTimes(initialPulls + 1);
  });
  it('queues an authenticated pull when login races an unfinished mount pull', async () => {
    let finish!: (value: null) => void;
    mocks.pull.mockImplementationOnce(() => new Promise<null>(resolve => { finish = resolve; }));
    await mount();
    await event('SIGNED_IN', 'staff-1');
    expect(mocks.pull).toHaveBeenCalledTimes(1);
    await act(async () => { finish(null); });
    expect(mocks.pull).toHaveBeenCalledTimes(2);
  });
  it('deduplicates repeated sign-in notifications and cleans up on logout', async () => {
    await mount();
    await event('SIGNED_IN', 'staff-1');
    const pulls = mocks.pull.mock.calls.length;
    await event('SIGNED_IN', 'staff-1');
    await event('TOKEN_REFRESHED', 'staff-1');
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.pull).toHaveBeenCalledTimes(pulls);
    await event('SIGNED_OUT', null);
    expect(mocks.realtimeUnsubscribe).toHaveBeenCalledTimes(1);
    await event('SIGNED_IN', 'staff-2');
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
    expect(mocks.pull).toHaveBeenCalledTimes(pulls + 1);
  });
  it('coalesces overlapping focus and online pulls and allows a later refresh', async () => {
    let finish!: (value: null) => void;
    mocks.pull.mockImplementationOnce(() => new Promise<null>(resolve => { finish = resolve; }));
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    expect(mocks.pull).toHaveBeenCalledTimes(1);
    await act(async () => { finish(null); });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(mocks.pull).toHaveBeenCalledTimes(2);
  });
  it('waits for the incremental pull before resetting the cursor for deep sync', async () => {
    let finish!: (value: null) => void;
    mocks.pull.mockImplementationOnce(() => new Promise<null>(resolve => { finish = resolve; }));
    await mount();
    const deep = controls.deepSync();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    await act(async () => { finish(null); await deep; });
    expect(resetSyncCursor).toHaveBeenCalledTimes(1);
    expect(mocks.pull).toHaveBeenCalledTimes(2);
  });
  it('subscribes restored sessions once and cancels deferred login on unmount', async () => {
    mocks.session = { user: { id: 'staff-1' } };
    await mount();
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    await event('INITIAL_SESSION', 'staff-1');
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    mocks.listener?.('SIGNED_IN', { user: { id: 'staff-2' } });
    await act(async () => { root.unmount(); });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
    expect(mocks.realtimeUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.authUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
