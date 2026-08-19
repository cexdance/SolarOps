import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * sonner's `toast()` is a silent no-op unless a <Toaster /> is mounted somewhere
 * in the tree. No Toaster was ever mounted, so all 15 toast calls in
 * Customers.tsx rendered nothing from the day they were written: "Photo
 * attached", "Image pasted", and every upload error message. A failed note
 * attachment therefore looked exactly like the Save Note button being broken.
 *
 * A grep test rather than a render test on purpose: the bug was the ABSENCE of a
 * mount across the whole app, which no single component test can see.
 */
const SRC = join(__dirname, '..');

/**
 * Comments must not count as a mount. Both fixes for this bug explain it in
 * prose that names the tag, and a first draft of this test happily passed with
 * the real mount deleted because it was matching those comments.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return entry === '__tests__' ? [] : walk(p);
    return /\.tsx?$/.test(entry) ? [p] : [];
  });
}

describe('sonner Toaster', () => {
  const files = walk(SRC).map(p => ({ path: p, text: stripComments(readFileSync(p, 'utf8')) }));

  it('is mounted somewhere if anything imports toast from sonner', () => {
    const usesToast = files.filter(f => /from 'sonner'/.test(f.text) && /\btoast\./.test(f.text));
    if (usesToast.length === 0) return; // nobody toasts, nothing to mount

    const mounts = files.filter(f => /<Toaster\b/.test(f.text));
    expect(
      mounts.length,
      `${usesToast.length} file(s) call sonner's toast() but no <Toaster /> is ` +
      `mounted anywhere, so every one of those toasts renders nothing. ` +
      `Callers: ${usesToast.map(f => f.path.replace(SRC, 'src')).join(', ')}`,
    ).toBeGreaterThan(0);
  });

  it('imports Toaster from sonner wherever it is mounted', () => {
    for (const f of files.filter(x => /<Toaster\b/.test(x.text))) {
      expect(f.text, `${f.path} renders <Toaster /> without importing it from sonner`)
        .toMatch(/import\s*\{[^}]*\bToaster\b[^}]*\}\s*from\s*'sonner'/);
    }
  });
});
