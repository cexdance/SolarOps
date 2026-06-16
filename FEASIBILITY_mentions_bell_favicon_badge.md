# Feasibility Plan: Mention autocomplete + bell delivery + unread favicon/app badge

Status: REVIEW + PLAN ONLY. No production code changed. Written for a later, simple
implementation by a lower-tier model. Date: 2026-06-09.

---

## 0. TL;DR verdicts

| Item | Verdict | Confidence |
|------|---------|------------|
| `@` autocomplete in service-order comments | WORKS (implemented + wired) | High (code-verified, live smoke test still recommended) |
| Mentions reaching the user's bell | WORKS via Supabase notifications (Realtime + poll), with caveats below | High (code-verified end to end) |
| Local `mentionsStore` / `MentionsWidget` path | EFFECTIVELY DEAD for cross-user delivery (per-device localStorage) | High |
| Unread favicon / mobile app badge | DOES NOT EXIST yet. Feasible. Two practical tiers below | High |

Bottom line: nothing in the mention->bell path needs new code to "work"; it needs a
**live 2-account verification** plus a couple of small robustness fixes. The badge is
genuinely new work, and the simplest, reliable version is a ~1-file change.

---

## 1. How mentions flow today (verified in code)

Author types a comment in the Service Order "Comments" tab and clicks Post:

1. `ServiceOrderPanel.addComment()` builds an `Activity` with
   `mentions: parseMentions(text, users)` and calls
   `fireMentionNotifications({ mentionedUserIds, mentionedUserEmails, ... })`.
   - `mentionedUserEmails` comes from `parseMentionEmails(text, users)`.
   - Source: `src/components/ServiceOrderPanel.tsx` (`addComment`), and the
     quote-flow `@danielmatos` comment.

2. `fireMentionNotifications` (`src/components/ui/MentionTextarea.tsx`) does TWO things:
   - **(A) Local inbox**: `mentionsStore.addMentions(...)` -> writes `MentionRecord`s
     to `localStorage['solarops_mentions_v1']` **on the author's device**.
   - **(B) Server**: `POST /api/notify` with a Supabase bearer token.

3. `api/notify.ts` (Vercel function):
   - Auth-checks the caller.
   - Resolves mentioned users via `supabaseAdmin.auth.admin.listUsers()` and matches
     **by email** (comment in file: "internal IDs don't match Supabase UUIDs").
   - **Inserts one row per matched user into the Supabase `notifications` table**
     with `user_id = <Supabase auth UUID>`, `type: 'mention'`, `read: false`,
     `title: "<name> mentioned you"`.
   - Optionally emails each user via Resend (only if `RESEND_API_KEY` is set).

4. Client delivery to the bell (`src/App.tsx` `setupNotifications`,
   `src/lib/notifications.ts`):
   - Initial fetch of the `notifications` table, **5-minute poll**, and a
     **Realtime INSERT subscription** -> `mergeRemoteNotifications` merges new rows into
     `data.notifications`.

5. The bell (`src/components/Layout.tsx`):
   - `myNotifications = notifications.filter(n => n.userId === currentUser?.id)`
   - `unreadCount = myNotifications.filter(n => !n.read).length`
   - Renders a red count badge (`9+` cap) and a dropdown list.

### Why the bell actually works
- `currentUser.id = session.user.id` = the **Supabase auth UUID** (`src/App.tsx:~813`).
- `api/notify` inserts `user_id = <Supabase auth UUID>` for the matched user.
- => `n.userId === currentUser.id` matches. Realtime/poll brings the row in.
  The mention shows on the recipient's bell within seconds (Realtime) or <=5 min (poll).

---

## 2. Review findings (precise)

### 2.1 Autocomplete: WORKS
- `MentionTextarea` renders a portal dropdown when the caret is right after `@(\w*)`
  and inserts `@<handle>` on click / Enter / Tab.
  (`src/components/ui/MentionTextarea.tsx` `handleChange`, `select`, `dropdown`.)
- The service-order comment box passes a populated list:
  `users={data.users.map(u => ({ id, name, username, email }))}`
  (`src/App.tsx:~2319`) -> `ServiceOrderPanel` -> the comment `MentionTextarea`.
- `parseMentions` matches a typed `@handle` against `username`, `name` without
  spaces (lowercased), or full lowercased name. So a user without a `username`
  still resolves by name-no-spaces.
- RISK / smoke-test items:
  - Dropdown needs `users` non-empty. If a screen mounts the panel before users
    load, autocomplete is briefly empty (low risk).
  - `@` only triggers on `@\w*` immediately before the caret; pasting `@name`
    mid-edit may not open the dropdown (acceptable).

### 2.2 Bell delivery: WORKS, with these caveats to verify live
1. **The mentioned user must be a Supabase auth user whose email matches** the
   email passed in `mentionedUserEmails`. If the app `users` entry has no email,
   or the email differs from their Supabase login, `api/notify` won't match ->
   no row inserted -> nothing on the bell. (Email is the join key.)
2. **A valid session is required** at send time (the call attaches the bearer
   token). If `RESEND_API_KEY` is unset, the email is skipped but the **in-app
   notification row is still inserted** (good).
3. **Deep-link from the bell is weak**: `api/notify` only sets
   `related_customer_id = contextId` (the site id), not `relatedJobId`. Clicking a
   mention notification can open the customer/site but not jump straight to the
   exact service order. (Enhancement, not a blocker.)

### 2.3 The local `mentionsStore` / `MentionsWidget` path is misleading
- `addMentions` writes to **the author's** `localStorage`. `MentionsWidget`
  (a Dispatch Dashboard widget, `config.type === 'mentions'`) reads
  `getMentionsFor(currentUserId)` from **the current device's** localStorage.
- => A mention created by User A on A's device is NOT visible to User B's
  `MentionsWidget` (different device / localStorage). This path only "works" in a
  single shared browser. It is effectively dead for real cross-user delivery and
  can disagree with the bell.
- IMPLICATION for the badge: **use the Supabase `notifications` source (the bell),
  never `mentionsStore`.** Optionally retire/relabel the MentionsWidget later.

### 2.4 Manual verification checklist (run this; I could not run a 2-user live test)
- Two staff logins, each a real Supabase auth user WITH a matching email.
- As A, open a Service Order -> Comments -> type `@`, confirm the dropdown lists
  users; pick B; Post.
- As B (other browser/profile), confirm within ~5s-5min the bell count increments
  and the dropdown shows "A mentioned you". Mark read -> count clears.
- Negative: mention a user with no Supabase account/email -> expect NO bell entry
  (confirms email-join behavior). The author's own bell should NOT change.

---

## 3. Unread favicon / mobile app badge — feasibility

### 3.1 What exists
- Static icons only: `index.html` links `favicon.ico`, `favicon-16.png`,
  `favicon-32.png`, `apple-touch-icon.png`. `public/` also has
  `favicon-48/192/512.png`.
- **No** PWA: no `manifest.webmanifest`, no service worker, no Web Push.
- A single, correct unread number already exists in `Layout` (`unreadCount`) and is
  trivially re-derivable anywhere from `data.notifications`.

### 3.2 The count source (decide once, reuse everywhere)
- "Current unread mentions" = 
  `data.notifications.filter(n => n.userId === currentUser.id && !n.read && n.type === 'mention').length`.
- NOTE: the bell badge today counts ALL unread types, not just `'mention'`. Pick one:
  - RECOMMENDED: badge ALL unread (matches the bell exactly, simplest, least
    surprising). 
  - OR mention-only (matches the literal request "unread mentions"). Either is one
    filter difference. This doc assumes **mention-only** per the request, and notes
    where to switch.

### 3.3 Three implementation tiers

**Tier 0 - document.title badge (trivial, universal).**
- Set `document.title = count > 0 ? \`(${count}) SolarOps\` : 'SolarOps'`.
- Shows in the browser tab and in mobile "recent apps"/tab switcher. No permissions.

**Tier 1 - dynamic canvas favicon (simple, no permissions). RECOMMENDED FIRST.**
- A small util draws the base 32px favicon onto a `<canvas>`, overlays a red
  circle + the count, and swaps the `<link rel="icon">` href to the canvas
  `toDataURL()`. Reset to the static icon when count is 0.
- Works on desktop browser tabs and Android Chrome tabs. (iOS Safari has no visible
  tab favicon, so this is a no-op there - that's fine; Tier 2 covers iOS home
  screen.)

**Tier 2 - App Badging API (the real "mobile icon badge").**
- `if ('setAppBadge' in navigator) navigator.setAppBadge(count); else nothing`.
  Clear with `navigator.clearAppBadge()` (or `setAppBadge(0)`).
- Badges the INSTALLED app icon (Android PWA home-screen icon, desktop dock/taskbar)
  and is a silent no-op when unsupported / not installed.
- REQUIRES the app to be an installed PWA for the badge to be visible on the icon:
  iOS 16.4+ needs the site added to the Home Screen AND Notifications permission
  granted; Android Chrome needs the PWA installed. The API call itself is harmless
  to add now (progressive enhancement) and will "light up" once a PWA exists.

**Tier 3 - true background/home-screen badge while the app is closed (LARGE, out of scope here).**
- Requires a real PWA (manifest + service worker) AND Web Push (VAPID keys, a push
  endpoint, permission UX) so the icon can be badged even with no tab open. This is
  a separate project; flagged, not planned here.

### 3.4 Recommendation
Ship **Tier 0 + Tier 1 together now** (no permissions, no backend, immediate value),
and **add the Tier 2 one-liner** in the same hook (harmless until a PWA exists).
Defer Tier 3 unless "badge while app fully closed on iOS" is a hard requirement.

---

## 4. Simple implementation plan (for a lower-tier model)

Scope: Tier 0 + Tier 1 + the guarded Tier 2 call. ~1 new file + 1 small hook + 1
call site. No backend, no schema, no permissions.

### 4.1 New file: `src/lib/faviconBadge.ts`
Pure DOM util, no React. Export:
- `setBadge(count: number): void`
  - Keep a module-level `<link rel="icon">` reference (create one if missing).
  - If `count <= 0`: restore the original favicon href (cache the original on first
    call) AND `document.title = 'SolarOps'` AND `navigator.clearAppBadge?.()`.
  - Else: 
    - `document.title = \`(${count > 99 ? '99+' : count}) SolarOps\``.
    - Draw badge: load `/favicon-32.png` into an `Image` (cache it after first load),
      draw onto a 32x32 canvas, then draw a filled red circle (e.g. radius ~9 at
      bottom-right) and white bold count text (cap "99+"); set the icon link href to
      `canvas.toDataURL('image/png')`.
    - `if ('setAppBadge' in navigator) navigator.setAppBadge(Math.min(count, 99))`.
  - Guard everything in try/catch; never throw (favicon is cosmetic).
  - Handle the async image load: if the base image isn't loaded yet, draw a solid
    brand-colored rounded square fallback so the badge still renders.

### 4.2 New hook: `src/hooks/useUnreadBadge.ts`
```
export function useUnreadBadge(count: number) {
  useEffect(() => { setBadge(count); }, [count]);
}
```

### 4.3 Call site: `src/App.tsx`
- Compute the count next to where `data.notifications` / `currentUser` are available:
  `const unreadMentions = (data.notifications || []).filter(n =>
     n.userId === currentUser?.id && !n.read && n.type === 'mention').length;`
  (Switch to all-unread by dropping the `n.type === 'mention'` clause to mirror the
  bell exactly.)
- `useUnreadBadge(unreadMentions);`
- This re-runs automatically as Realtime/poll updates `data.notifications` and as the
  user marks notifications read (the bell already flips `read`).

### 4.4 Acceptance criteria
- Desktop tab favicon shows a red count bubble when there are unread mentions; the
  number matches the bell; it clears to the plain globe at 0.
- Tab title shows `(N) SolarOps`, `SolarOps` at 0.
- No console errors if `/favicon-32.png` is slow or `setAppBadge` is unsupported.
- Marking notifications read (or receiving the Realtime mark-read) drops the badge.

### 4.5 Risks / gotchas for the implementer
- Do NOT read from `mentionsStore` (per-device, stale) — use `data.notifications`.
- `canvas.toDataURL` on a cross-origin image taints the canvas; `/favicon-32.png`
  is same-origin so this is fine. Don't switch to a remote icon URL.
- Re-setting the favicon href on every keystroke is wasteful; only set when the
  numeric count actually changes (the `useEffect([count])` dependency handles this).
- iOS Safari: expect NO visible change from Tier 1 (no tab favicon). That's
  expected; communicate it so it's not logged as a bug.
- Keep the badge cap consistent with the bell (`9+` there vs `99+` here — pick one;
  recommend `9+` to match the bell).

---

## 5. Optional robustness follow-ups (separate, small)
1. Bell deep-link: include `related_job_id`/service-order id in `api/notify` so a
   mention notification can open the exact Service Order, not just the customer.
2. Retire or fix `mentionsStore`/`MentionsWidget`: it cannot deliver cross-user.
   Either remove the widget or re-point it at `data.notifications` filtered to
   `type === 'mention'` so it agrees with the bell.
3. Surface a clear failure path when a mentioned user has no Supabase account/email
   (today it silently no-ops server-side).

## 6. Explicitly out of scope (would be a real project)
- PWA install (manifest + service worker) and Web Push so the home-screen icon is
  badged while the app is fully closed (Tier 3). Needs VAPID keys, a push sender,
  service worker, and permission UX.
