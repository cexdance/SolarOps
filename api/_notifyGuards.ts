/**
 * Input guards for the serverless handlers.
 *
 * Deliberately dependency-free. It is imported by handlers that also pull in
 * web-push and the Vercel runtime types, neither of which resolves inside the
 * Vite/vitest workspace, so keeping these here is what makes them testable at
 * all. The `_` prefix keeps Vercel from exposing this file as a route, matching
 * the `_auth.ts` / `_env.ts` convention.
 */

/**
 * Escape for interpolation into an HTML email body.
 *
 * Everything reaching those templates is user-controlled: the request body
 * (notifier and customer names) and the recipient's own auth metadata. Without
 * this, markup pasted into a display name lands intact in mail sent from our
 * own domain.
 *
 * `&` must be replaced first. Escaping it last would re-escape the ampersands
 * introduced by the other replacements and render `&lt;` literally.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip CR/LF so a caller-supplied name cannot inject headers via a subject line. */
export function singleLine(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supabase auth ids are UUIDs. This matters more than it looks: each id is
 * interpolated into an admin URL called with the SERVICE ROLE key, so an id
 * carrying path segments ("../../rest/v1/<table>?select=*") would normalize to
 * a different privileged endpoint on the same project. Validate, do not trust.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
