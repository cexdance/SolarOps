/**
 * Guards on the LIVE notify handler (repo-root `api/notify.ts`).
 *
 * Note the import path: `../../../api/` is the repo-root tree, which is what
 * Vercel deploys. `../../api/` would be `solarflow-dashboard/api/`, which is
 * dead code. See the closing comments on PRs #2 and #4.
 *
 * Both functions here are security boundaries, not formatting helpers:
 *
 *   isUuid     - every mentioned id is interpolated into an admin URL called
 *                with the SERVICE ROLE key. An id carrying path segments would
 *                normalize to a different privileged endpoint on the same
 *                Supabase project, turning a mention into an arbitrary
 *                service-role read.
 *   escapeHtml - notifier and customer names, and the recipient's own auth
 *                metadata, are interpolated into an HTML email sent from our
 *                domain.
 */
import { describe, it, expect } from 'vitest';

// Imported from the dependency-free guards module rather than from notify.ts
// itself: notify.ts pulls in web-push, which is a serverless-runtime dependency
// and does not resolve inside this Vite workspace.
import { isUuid, escapeHtml } from '../../../api/_notifyGuards';

describe('isUuid gates what reaches the service-role admin URL', () => {
  it('accepts a real Supabase auth id', () => {
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(true);
  });

  it('rejects path traversal aimed at another privileged endpoint', () => {
    // The whole point of the guard: this would otherwise be concatenated into
    // `${SUPABASE_URL}/auth/v1/admin/users/${id}` and normalize elsewhere.
    expect(isUuid('../../../rest/v1/notifications?select=*')).toBe(false);
    expect(isUuid('..%2F..%2Frest%2Fv1%2Fapp_data')).toBe(false);
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301/../../rest/v1/app_data')).toBe(false);
  });

  it('rejects query-string and fragment smuggling', () => {
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301?apikey=x')).toBe(false);
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301#x')).toBe(false);
  });

  it('rejects malformed and non-string input', () => {
    for (const bad of ['', 'not-a-uuid', '3f2504e0', null, undefined, 42, {}, []]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe('escapeHtml neutralises markup in email interpolation', () => {
  it('escapes a script tag pasted into a display name', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes quotes, so a name cannot break out of an attribute', () => {
    expect(escapeHtml('" onmouseover="steal()'))
      .toBe('&quot; onmouseover=&quot;steal()');
  });

  it('escapes ampersands first, so entities are not double-decoded', () => {
    // If & were escaped last, "&lt;" would render as a literal "<" in the mail.
    expect(escapeHtml('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('renders null and undefined as empty, not as the words', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('leaves ordinary names untouched', () => {
    expect(escapeHtml("Cesar O'Brien-Jurado")).toBe("Cesar O'Brien-Jurado");
  });
});
