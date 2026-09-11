/**
 * Tests for src/lib/outbox.ts
 *
 * Strategy: outbox only touches localStorage and navigator.onLine, no Supabase
 * calls in the pure API functions. drainOutbox() imports syncEngine lazily, so
 * we mock those modules to keep tests isolated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasPendingPush,
  getPendingAttempts,
  markPushPending,
  clearPendingPush,
  resetOutboxAttempts,
  isRowPoisoned,
  incRowFailure,
  clearRowPoison,
  getPoisonedKeys,
  resetAllPoison,
  drainOutbox,
} from '../lib/outbox';

const OUTBOX_KEY = 'solarops_outbox_v1';
const POISON_KEY = 'solarops_poisoned_rows_v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

// ---------------------------------------------------------------------------
// hasPendingPush / markPushPending / clearPendingPush
// ---------------------------------------------------------------------------

describe('hasPendingPush', () => {
  it('returns false when outbox is empty', () => {
    expect(hasPendingPush()).toBe(false);
  });

  it('returns true after markPushPending', () => {
    markPushPending('network error');
    expect(hasPendingPush()).toBe(true);
  });

  it('returns false after clearPendingPush', () => {
    markPushPending();
    clearPendingPush();
    expect(hasPendingPush()).toBe(false);
  });
});

describe('markPushPending', () => {
  it('increments attempt counter on successive calls', () => {
    markPushPending('err1');
    expect(getPendingAttempts()).toBe(1);
    markPushPending('err2');
    expect(getPendingAttempts()).toBe(2);
    markPushPending('err3');
    expect(getPendingAttempts()).toBe(3);
  });

  it('preserves original queuedAt across multiple marks', () => {
    markPushPending('first');
    const raw1 = JSON.parse(localStorage.getItem(OUTBOX_KEY)!);
    const firstQueuedAt = raw1.queuedAt;

    markPushPending('second');
    const raw2 = JSON.parse(localStorage.getItem(OUTBOX_KEY)!);

    expect(raw2.queuedAt).toBe(firstQueuedAt);
  });

  it('records lastError string', () => {
    markPushPending('timeout after 30s');
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY)!);
    expect(raw.lastError).toBe('timeout after 30s');
  });

  it('works with no error argument', () => {
    markPushPending();
    expect(hasPendingPush()).toBe(true);
  });
});

describe('getPendingAttempts', () => {
  it('returns 0 when nothing is pending', () => {
    expect(getPendingAttempts()).toBe(0);
  });

  it('returns correct count', () => {
    markPushPending();
    markPushPending();
    expect(getPendingAttempts()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resetOutboxAttempts
// ---------------------------------------------------------------------------

describe('resetOutboxAttempts', () => {
  it('resets attempts to 0 while keeping pending flag', () => {
    markPushPending('err');
    markPushPending('err');
    markPushPending('err');
    expect(getPendingAttempts()).toBe(3);

    resetOutboxAttempts();

    expect(hasPendingPush()).toBe(true);
    expect(getPendingAttempts()).toBe(0);
  });

  it('is a no-op when nothing is pending', () => {
    // Should not throw
    resetOutboxAttempts();
    expect(hasPendingPush()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-row poison tracking
// ---------------------------------------------------------------------------

describe('isRowPoisoned', () => {
  it('returns false for unknown key', () => {
    expect(isRowPoisoned('customer:unknown')).toBe(false);
  });

  it('returns false below threshold (< 3 failures)', () => {
    incRowFailure('customer:abc', 'err');
    incRowFailure('customer:abc', 'err');
    expect(isRowPoisoned('customer:abc')).toBe(false);
  });

  it('returns true at threshold (3 failures)', () => {
    incRowFailure('customer:abc', 'err');
    incRowFailure('customer:abc', 'err');
    incRowFailure('customer:abc', 'err');
    expect(isRowPoisoned('customer:abc')).toBe(true);
  });

  it('returns true above threshold', () => {
    for (let i = 0; i < 5; i++) incRowFailure('customer:abc', 'err');
    expect(isRowPoisoned('customer:abc')).toBe(true);
  });
});

describe('incRowFailure', () => {
  it('preserves the original since timestamp', () => {
    incRowFailure('job:1', 'first error');
    const raw1 = JSON.parse(localStorage.getItem(POISON_KEY)!);
    const since1 = raw1['job:1'].since;

    incRowFailure('job:1', 'second error');
    const raw2 = JSON.parse(localStorage.getItem(POISON_KEY)!);

    expect(raw2['job:1'].since).toBe(since1);
  });

  it('tracks multiple rows independently', () => {
    incRowFailure('customer:1', 'err');
    incRowFailure('customer:2', 'err');
    incRowFailure('customer:2', 'err');
    incRowFailure('customer:2', 'err');

    expect(isRowPoisoned('customer:1')).toBe(false);
    expect(isRowPoisoned('customer:2')).toBe(true);
  });
});

describe('clearRowPoison', () => {
  it('removes a poisoned row', () => {
    incRowFailure('customer:x', 'err');
    incRowFailure('customer:x', 'err');
    incRowFailure('customer:x', 'err');
    expect(isRowPoisoned('customer:x')).toBe(true);

    clearRowPoison('customer:x');
    expect(isRowPoisoned('customer:x')).toBe(false);
  });

  it('is a no-op for a non-poisoned row', () => {
    // Should not throw
    clearRowPoison('does-not-exist');
    expect(isRowPoisoned('does-not-exist')).toBe(false);
  });
});

describe('getPoisonedKeys', () => {
  it('returns empty array when nothing poisoned', () => {
    expect(getPoisonedKeys()).toEqual([]);
  });

  it('returns only keys at or above threshold', () => {
    incRowFailure('row:a', 'e');
    incRowFailure('row:b', 'e');
    incRowFailure('row:b', 'e');
    incRowFailure('row:b', 'e'); // poisoned
    incRowFailure('row:c', 'e');
    incRowFailure('row:c', 'e');
    incRowFailure('row:c', 'e'); // poisoned

    const keys = getPoisonedKeys();
    expect(keys).not.toContain('row:a');
    expect(keys).toContain('row:b');
    expect(keys).toContain('row:c');
  });
});

describe('resetAllPoison', () => {
  it('clears all poison entries', () => {
    for (let i = 0; i < 3; i++) incRowFailure('customer:z', 'err');
    expect(isRowPoisoned('customer:z')).toBe(true);

    resetAllPoison();
    expect(isRowPoisoned('customer:z')).toBe(false);
    expect(getPoisonedKeys()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// drainOutbox
// ---------------------------------------------------------------------------

describe('drainOutbox', () => {
  it('returns true immediately when nothing is pending', async () => {
    const result = await drainOutbox();
    expect(result).toBe(true);
  });

  it('returns false when offline', async () => {
    markPushPending('offline');
    setOnline(false);
    const result = await drainOutbox();
    expect(result).toBe(false);
    setOnline(true);
  });

  it('returns false when attempt count exceeds 8', async () => {
    for (let i = 0; i < 9; i++) markPushPending('err');
    expect(getPendingAttempts()).toBe(9);

    const result = await drainOutbox();
    expect(result).toBe(false);
  });

  it('acknowledges only a push that clears its pending work', async () => {
    const mockPush = vi.fn(async () => clearPendingPush());
    vi.doMock('../lib/syncEngine', () => ({ pushToSupabase: mockPush }));
    vi.doMock('../lib/dataStore', () => ({ loadData: () => ({ customers: [], jobs: [] }) }));
    markPushPending('offline');
    resetOutboxAttempts();

    expect(await drainOutbox()).toBe(true);
    expect(mockPush).toHaveBeenCalledOnce();
    expect(hasPendingPush()).toBe(false);
  });

  it.each(['session-expired', 'initial-pull-pending'])(
    'retains pending changes when push defers for %s', async reason => {
      const mockPush = vi.fn(async () => markPushPending(reason));
      vi.doMock('../lib/syncEngine', () => ({ pushToSupabase: mockPush }));
      vi.doMock('../lib/dataStore', () => ({ loadData: () => ({ customers: [], jobs: [] }) }));
      markPushPending('offline');
      resetOutboxAttempts();

      expect(await drainOutbox()).toBe(false);
      expect(mockPush).toHaveBeenCalledOnce();
      expect(hasPendingPush()).toBe(true);
      expect(JSON.parse(localStorage.getItem(OUTBOX_KEY)!).lastError).toBe(reason);
    },
  );

  it('preserves pending work after a rejected push', async () => {
    const mockPush = vi.fn().mockRejectedValue(new Error('network unavailable'));
    vi.doMock('../lib/syncEngine', () => ({ pushToSupabase: mockPush }));
    vi.doMock('../lib/dataStore', () => ({ loadData: () => ({ customers: [], jobs: [] }) }));
    markPushPending('offline');
    resetOutboxAttempts();

    expect(await drainOutbox()).toBe(false);
    expect(mockPush).toHaveBeenCalledOnce();
    expect(hasPendingPush()).toBe(true);
    expect(getPendingAttempts()).toBe(1);
  });
});
