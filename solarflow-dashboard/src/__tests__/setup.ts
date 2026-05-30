/**
 * Vitest global test setup.
 *
 * Problem: pnpm virtual-store-dir in /tmp means module code runs in the
 * /private/tmp/... realm. localStorage on that global !== the jsdom window
 * localStorage. We inject a shared Map-backed store onto globalThis so all
 * modules see the same object regardless of realm.
 */

import { beforeEach, afterEach, vi } from 'vitest';

// ---------- Shared in-memory localStorage implementation ---------------------

class FakeStorage implements Storage {
  private store = new Map<string, string>();

  get length() { return this.store.size; }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const fakeStorage = new FakeStorage();

// Inject onto globalThis so all modules share the same instance
vi.stubGlobal('localStorage', fakeStorage);

// ---------- navigator.onLine -------------------------------------------------

Object.defineProperty(navigator, 'onLine', {
  configurable: true,
  get: () => true,
});

// ---------- Reset between tests ----------------------------------------------

beforeEach(() => {
  fakeStorage.clear();
});

afterEach(() => {
  fakeStorage.clear();
});
