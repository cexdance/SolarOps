import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isStaleChunkError, reloadForStaleChunk } from '../lib/staleChunk';

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
    configurable: true,
  });
});

describe('isStaleChunkError', () => {
  it('matches the three Vite/browser wordings for a dead chunk', () => {
    expect(isStaleChunkError(new Error('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('does not swallow real application errors', () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  it('reloads once, then refuses inside the 60s window', () => {
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(reloadForStaleChunk()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the window has passed', () => {
    reloadForStaleChunk();
    sessionStorage.setItem('solarops_chunk_reload', String(Date.now() - 61_000));
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('still reloads when sessionStorage throws (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(reloadForStaleChunk()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
