import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedSaver } from '../lib/debouncedSaver';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDebouncedSaver', () => {
  it('collapses a burst of changes into ONE save', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 700);
    // "Inverter" typed one character at a time, 50ms apart.
    for (let i = 0; i < 8; i++) { s.schedule(); vi.advanceTimersByTime(50); }
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saves again after a real pause between bursts', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 700);
    s.schedule(); vi.advanceTimersByTime(700);
    s.schedule(); vi.advanceTimersByTime(700);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush runs the pending save immediately, and only once', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 700);
    s.schedule();
    s.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);       // the armed timer must not fire again
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush is a no-op with nothing pending, so unmount/hide hooks can call it freely', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 700);
    s.flush(); s.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('never loses the tail: a change then an immediate flush still saves', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 700);
    s.schedule();
    vi.advanceTimersByTime(10);          // user taps away 10ms after the last key
    s.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a throw inside save does not leave the write armed to repeat', () => {
    const save = vi.fn(() => { throw new Error('sync down'); });
    const s = createDebouncedSaver(save, 700);
    s.schedule();
    expect(() => s.flush()).toThrow('sync down');
    expect(s.pending).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel drops the pending save', () => {
    const save = vi.fn();
    const s = createDebouncedSaver(save, 700);
    s.schedule(); s.cancel();
    vi.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
