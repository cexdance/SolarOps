/**
 * SolarOps, Trello Card Proxy + Lead Auto-Import Webhook
 *
 * Two unrelated Trello integrations share this file to stay within the
 * Vercel Hobby plan's 12-Serverless-Function-per-deployment cap (confirmed
 * live 2026-07-21: a 13th function hard-fails the whole deployment, not just
 * that function). If the plan is ever upgraded, splitting the POST branch
 * back into its own file is a pure refactor with no behavior change.
 *
 * GET  (unchanged): Proxies Trello card lookups server-side to:
 *   1. Bypass CORS restrictions (browser cannot fetch Trello API directly)
 *   2. Keep API credentials (key + token) secure server-side
 *   3. Provide a consistent interface for card fetching
 *
 * POST (new): Trello board-action webhook. When a card is created directly
 * in, or moved into, a configured "leads" list, it is mirrored into Lead
 * Lobby as a Lead (source: Trello, leadType: service), no manual URL paste
 * needed. See matchTargetList/TARGET_LISTS below.
 *
 * HEAD (new): Trello verifies the callback URL this way when the webhook is
 * registered; must return 2xx synchronously or registration is rejected.
 *
 * POST deliveries are HMAC-verified when TRELLO_API_SECRET is set (see
 * verifyTrelloSignature). Until it is set the endpoint stays open, as before:
 * it trusts any POST whose action names a known board+list id pair, both
 * unguessable 24-hex-char Trello ids. Worst case there is spam Lead rows, never
 * destructive, never touches existing data. Failing closed on a missing secret
 * would instead take the live lead pipeline down, which is the worse outcome.
 *
 * Credentials required:
 *   - TRELLO_API_KEY (set via Vercel env)
 *   - TRELLO_API_TOKEN (set via Vercel env)
 *   - SUPABASE_SERVICE_ROLE_KEY (POST branch only, writes Lead Lobby directly)
 * Optional:
 *   - TRELLO_API_SECRET (the "Secret" on trello.com/power-ups/admin, NOT the
 *     API key or token) enables webhook signature verification.
 *   - TRELLO_WEBHOOK_CALLBACK_URL, the callback URL exactly as registered with
 *     Trello. Only needed if the auto-derived one does not match; a mismatch
 *     shows up as every delivery failing verification.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractLeadFromImage, type ParsedLead } from './parse-lead-image';

// Trello signs rawBody + callbackURL, so the bytes must be the ones on the wire.
// Vercel's body parser would re-serialize them and break every signature, hence
// the manual read in readRawBody below.
export const config = { api: { bodyParser: false } };

const TRELLO_BASE = 'https://api.trello.com/1';
// Support both server-side (TRELLO_*) and client-side legacy (VITE_TRELLO_*) names.
// .trim() strips trailing \n that Vercel env-pull can embed in quoted values.
const API_KEY = (process.env.TRELLO_API_KEY || process.env.VITE_TRELLO_API_KEY || '').trim();
const API_TOKEN = (process.env.TRELLO_API_TOKEN || process.env.VITE_TRELLO_TOKEN || '').trim();

// ── Lead auto-import (POST branch) ──────────────────────────────────────────

const SUPABASE_URL     = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const supabaseHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
};

const API_SECRET = (process.env.TRELLO_API_SECRET ?? '').trim();
const CALLBACK_URL_OVERRIDE = (process.env.TRELLO_WEBHOOK_CALLBACK_URL ?? '').trim();

/** Body bytes exactly as Trello sent them. Requires bodyParser:false above. */
async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** The callback URL Trello has on file, which is what it signed against. */
function callbackUrlFor(req: VercelRequest): string {
  if (CALLBACK_URL_OVERRIDE) return CALLBACK_URL_OVERRIDE;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'https';
  return `${proto}://${host}${(req.url ?? '').split('?')[0]}`;
}

/**
 * Trello sets X-Trello-Webhook to base64(HMAC-SHA1(rawBody + callbackURL, secret)).
 *
 * Returns true when the secret is unset: verification is opt-in so that adding
 * the env var is what turns it on, and a deploy without it keeps working rather
 * than silently dropping every lead.
 */
export function verifyTrelloSignature(rawBody: string, callbackUrl: string, header: string | undefined, secret: string): boolean {
  if (!secret) return true;
  if (!header) return false;
  const expected = createHmac('sha1', secret).update(rawBody + callbackUrl).digest();
  const got = Buffer.from(header, 'base64');
  // timingSafeEqual throws on a length mismatch, so check that first.
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Boards/lists that feed Lead Lobby. "Conexsol Florida Services" is the
// template the company is standardizing on for other states; add a row per
// state's board+list once its board exists, rather than one hardcoded pair.
const TARGET_LISTS: { boardId: string; listId: string; label: string }[] = [
  { boardId: '6a5a58e06fbf97144b5d96c9', listId: '6a5a58e06fbf97144b5d96be', label: 'FL: Leads Services SolarEdge' },
];

/**
 * Trello list id -> LL `pipelineStage`, for the whole "Conexsol Florida
 * Services" board. This is what keeps the LL column and the Trello list the
 * same thing.
 *
 * MAPPED BY ID, NEVER BY INDEX. The 2026-08-10 bulk import mapped the board's
 * lists onto PIPELINE_STAGES positionally, and the two orders do NOT agree:
 * Trello has "Work Done - Collect Payment" at index 7 and "Needs follow-Up
 * Service" at 8, while PIPELINE_STAGES has them the other way round. A
 * positional map silently swaps those two columns, and a Trello reorder would
 * scramble the rest at any time.
 */
const LIST_STAGES: Record<string, string> = {
  '6a5a58e06fbf97144b5d96be': 'leads',                     // Leads Services SolarEdge
  '6a5a58e06fbf97144b5d96c2': 'needs_first_quote',         // Needs First Time Quoting/Invoicing
  '6a5a58e06fbf97144b5d96bf': 'first_quote_in_progress',   // First Time Quote/Invoice In Progress
  '6a5a58e06fbf97144b5d96c3': 'site_transfer_processing',  // Site Transfer is Processing
  '6a5a58e06fbf97144b5d96c4': 'site_transfer_completed',   // Site Transfer is Completed/To Be Checked
  '6a5a58e06fbf97144b5d96c5': 'service_quote_in_progress', // Quote/Invoicing in Progress for Service
  '6a5a58e06fbf97144b5d96c0': 'needs_scheduling',          // Quote Accepted - Needs Scheduling
  '6a6b74b3042230eaca73f224': 'work_done_collect',         // Work Done - Collect Payment
  '6a79fe57cd90d79ec1c71526': 'needs_follow_up',           // Needs follow-Up Service
  '6a5a58e06fbf97144b5d96c1': 'done',                      // Done
  '6a5a58e06fbf97144b5d96c6': 'email_follow_up',           // Email Marketing Follow-Up
  '6a5a58e06fbf97144b5d96c7': 'closed_won',                // Closed - Won
  '6a5a58e06fbf97144b5d96c8': 'closed_archived',           // Closed - Archived
};

/** The stage a card currently belongs in, or undefined for an untracked list. */
export function stageForList(listId: string | undefined): string | undefined {
  return listId ? LIST_STAGES[listId] : undefined;
}

interface TrelloWebhookAction {
  type: string;
  data?: {
    card?: { id: string; name: string; shortLink?: string };
    list?: { id: string };       // present on createCard
    listAfter?: { id: string };  // present on updateCard ONLY when it's a list move
    board?: { id: string };
  };
}

// Same convention as the manual "paste a Trello URL" import in LeadLobby.tsx:
// first word = firstName, remainder = lastName.
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

// Trello auto-names a card after its attachment when someone just drops a photo
// in (e.g. "image.jpeg"), so card.name is often a filename, not a person. Don't
// let that become the lead's name (that's the "image.jpeg" / "i"-avatar bug).
export function isFilename(name: string): boolean {
  return /^\S+\.(?:jpe?g|png|gif|heic|webp|pdf|tiff?)$/i.test(name.trim());
}

// ponytail: enough to read a US number on a lead card, not a locale-aware lib.
function formatPhone(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

const PHONE_REGEX = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

// The SolarEdge lead email lands in the card desc as labeled lines
// ("First Name: Gil"), so read it directly, no vision call needed. Trello writes
// the desc a beat AFTER createCard fires, which is why the backfill path below
// re-runs this on updateCard.
const LABEL_TO_FIELD: Record<string, keyof ParsedLead> = {
  'first name': 'firstName', 'last name': 'lastName', email: 'email', phone: 'phone',
  address: 'address', city: 'city', state: 'state', zip: 'zip', 'zip code': 'zip',
  notes: 'notes', hs_id: 'hsId', 'contract name': 'contractName',
};

export function parseLeadDesc(desc: string): Partial<ParsedLead> {
  const out: Partial<ParsedLead> = {};
  for (const line of (desc || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_ ]+?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const field = LABEL_TO_FIELD[m[1].toLowerCase()];
    if (field && !out[field]) out[field] = m[2].trim();
  }
  if (out.phone) {
    const digits = out.phone.replace(/\D/g, '');
    out.phone = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (out.phone.length !== 10) delete out.phone;
  }
  return out;
}

export function extractContact(text: string): { phone: string; email: string } {
  const phoneMatch = text.match(PHONE_REGEX);
  const emailMatch = text.match(EMAIL_REGEX);
  let phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '';
  if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1);
  if (phone.length !== 10) phone = '';
  return { phone, email: emailMatch ? emailMatch[0] : '' };
}

interface TrelloLabel { name?: string; color?: string }

async function fetchCardForLeadImport(cardId: string): Promise<{ name: string; desc: string; shortUrl: string; labels?: TrelloLabel[]; idList?: string }> {
  // idList is read on EVERY event, not just list-move events: reconciling
  // against the card's actual current list is self-healing, so a webhook
  // delivery we missed (or a move made while a deploy was in flight) is
  // corrected by the next event of any kind on that card.
  const url = `${TRELLO_BASE}/cards/${cardId}?key=${API_KEY}&token=${API_TOKEN}&fields=name,desc,shortUrl,labels,idList`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Trello card fetch ${res.status}`);
  return res.json();
}

/**
 * Trello label -> the board's own `JobLabel` shape ({name, color}), the same one
 * LabelPicker writes, so an imported chip is indistinguishable from a hand-added
 * one. Colour is Trello's raw key ('purple_dark', 'sky', ...) exactly as the
 * 2026-08-10 bulk import stored it, so both sources render identically.
 * Nameless labels (colour-only chips) are dropped: the board renders the name,
 * so they would show up as blank chips.
 */
export function toJobLabels(labels: TrelloLabel[] | undefined): { name: string; color: string }[] {
  return (labels ?? [])
    .filter(l => (l.name ?? '').trim())
    .map(l => ({ name: (l.name as string).trim(), color: l.color ?? '' }));
}

const IMG_EXT_RE = /\.(jpe?g|png|gif|webp)$/i;

/**
 * Download the card's first image attachment as base64 so Claude Vision can read
 * the lead's details straight off the dropped screenshot. Best-effort: returns
 * undefined on any hiccup so the caller falls back to card text.
 * Note: Trello serves uploaded attachment bytes only with the OAuth header, the
 * key/token query params that work on the REST API return 401 here.
 */
async function fetchFirstImageAttachment(cardId: string): Promise<{ base64: string; mimeType: string } | undefined> {
  const listUrl = `${TRELLO_BASE}/cards/${cardId}/attachments?key=${API_KEY}&token=${API_TOKEN}&fields=url,mimeType,name,bytes`;
  const listRes = await fetch(listUrl, { headers: { Accept: 'application/json' } });
  if (!listRes.ok) return undefined;

  const atts = await listRes.json() as { url?: string; mimeType?: string; name?: string }[];
  const img = atts.find(a => (a.mimeType || '').startsWith('image/') || IMG_EXT_RE.test(a.name || a.url || ''));
  if (!img?.url) return undefined;

  const bin = await fetch(img.url, {
    headers: { Authorization: `OAuth oauth_consumer_key="${API_KEY}", oauth_token="${API_TOKEN}"` },
  });
  if (!bin.ok) return undefined;

  const buf = Buffer.from(await bin.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > 5_000_000) return undefined; // ponytail: skip empties/huge; vision only needs the text

  const mimeType = img.mimeType?.startsWith('image/')
    ? img.mimeType
    : IMG_EXT_RE.test(img.name || img.url) && /\.png$/i.test(img.name || img.url) ? 'image/png' : 'image/jpeg';
  return { base64: buf.toString('base64'), mimeType };
}

type LeadFields = Pick<ParsedLead, 'firstName' | 'lastName' | 'phone' | 'email' | 'address' | 'city' | 'state' | 'zip'>;

/**
 * Everything the card can tell us about the lead, cheapest source first:
 * card title -> labeled desc lines -> Claude Vision on the dropped screenshot.
 * Vision only runs when the cheap sources left a hole, and never overrides them.
 */
async function extractCardFields(
  cardId: string,
  card: { name: string; desc: string },
): Promise<{ fields: LeadFields; vision: Partial<ParsedLead>; nameIsFile: boolean }> {
  const nameIsFile = isFilename(card.name);
  const fromTitle = nameIsFile ? { firstName: '', lastName: '' } : splitName(card.name);
  const fromDesc = parseLeadDesc(card.desc);
  const fromText = extractContact(`${card.name}\n${card.desc}`);

  const haveName = (fromDesc.firstName || fromTitle.firstName || '').trim() !== '';
  const haveContact = (fromDesc.phone || fromText.phone) && (fromDesc.email || fromText.email);

  let vision: Partial<ParsedLead> = {};
  if (!haveName || !haveContact) {
    try {
      const img = await fetchFirstImageAttachment(cardId);
      if (img) vision = await extractLeadFromImage(img.base64, img.mimeType);
    } catch (err) {
      console.warn('[trello-webhook] vision parse failed, using card text:', err);
    }
  }

  const pick = (...vals: (string | undefined)[]) => vals.map(v => (v ?? '').trim()).find(Boolean) ?? '';
  return {
    nameIsFile,
    vision,
    fields: {
      firstName: pick(fromDesc.firstName, fromTitle.firstName, vision.firstName),
      lastName:  pick(fromDesc.lastName,  fromTitle.lastName,  vision.lastName),
      phone:     pick(fromDesc.phone, fromText.phone, vision.phone),
      email:     pick(fromDesc.email, fromText.email, vision.email),
      address:   pick(fromDesc.address, vision.address),
      city:      pick(fromDesc.city, vision.city),
      state:     pick(fromDesc.state, vision.state),
      zip:       pick(fromDesc.zip, vision.zip),
    },
  };
}

export function displayNameFor(f: Pick<LeadFields, 'firstName' | 'lastName' | 'phone'>): string {
  return `${f.firstName} ${f.lastName}`.trim() || (f.phone ? formatPhone(f.phone) : 'New Lead (Trello)');
}

/**
 * Fill in fields the original import missed, never overwrite what is already there.
 *
 * Trello fires createCard BEFORE it finishes uploading the card's image
 * attachment and writing its description (measured: +1s typically, +82min when a
 * human drops the screenshot later). The create-time import therefore sees a
 * bare "image.jpeg" card and writes a nameless lead. Rather than sleep-and-retry
 * inside the create handler, the later addAttachmentToCard/updateCard events on
 * an ALREADY-IMPORTED card are treated as a backfill. Empty-only, so a lead the
 * team has since edited by hand is never clobbered.
 */
const BACKFILL_ACTIONS = new Set([
  'updateCard', 'addAttachmentToCard', 'commentCard',
  // Label events carry no contact data, but they are the ONLY unambiguous signal
  // that the team re-labelled the card in Trello, so they mirror the label set
  // across. See LABEL_ACTIONS below for why only these two overwrite labels.
  'addLabelToCard', 'removeLabelFromCard',
]);

/**
 * Labels mirror Trello, but ONLY on an explicit label event.
 *
 * The team can also set labels in-app (LabelPicker on LeadPanel/ServiceOrderPanel,
 * 00fafca). If every updateCard/commentCard re-pushed Trello's label set, an
 * in-app label would be silently reverted by the next unrelated card edit. Gating
 * on addLabelToCard/removeLabelFromCard means Trello wins only when someone
 * actually changed a label there, which is unambiguous intent.
 */
const LABEL_ACTIONS = new Set(['addLabelToCard', 'removeLabelFromCard']);

/**
 * Backfill for the LL-board job row: replace the placeholder display name AND
 * fill any leadInfo fields still missing. Runs on every updateCard/
 * addAttachmentToCard/commentCard after the create-time import, which is where
 * MOST real contact data actually arrives (Trello writes the desc a beat after
 * createCard fires, see BACKFILL_ACTIONS above) - so this is not a rare edge
 * case, it is the common path for a card whose desc wasn't ready yet at create.
 * Field-by-field empty-only, so a lead the team has since edited by hand keeps
 * their edits (e.g. a corrected phone number is never overwritten back).
 */
async function backfillLeadJob(
  jobId: string,
  displayName: string,
  leadFields: Record<string, string>,
  card: {
    labels?: { name: string; color: string }[];
    stage?: string;
    notes: string;
    description: string;
  },
  now: string,
): Promise<void> {
  const syncLabels = card.labels;
  const key = `job:${jobId}`;
  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: supabaseHeaders },
  );
  if (!selectRes.ok) return;
  const job = (await selectRes.json() as { value?: any }[])[0]?.value;
  if (!job) return;

  const isPlaceholder = (s: unknown) =>
    !String(s ?? '').trim() || String(s) === 'New Lead (Trello)' || isFilename(String(s));
  const nameChanged = isPlaceholder(job.clientName) || isPlaceholder(job.title);

  const info = { ...(job.leadInfo ?? {}) };
  let infoChanged = false;
  for (const [k, v] of Object.entries(leadFields)) {
    if (!info[k]) { info[k] = v; infoChanged = true; }
  }

  // Whole-set replace (not a union): removing a label in Trello has to remove it
  // here too, which a union could never express. Only ever reached on a real
  // label event, see LABEL_ACTIONS.
  const before = JSON.stringify(job.labels ?? []);
  const labelsChanged = syncLabels !== undefined && JSON.stringify(syncLabels) !== before;

  // The LL column IS the Trello list. Nothing used to maintain this after
  // create, so every card the office moved in Trello stayed pinned to the stage
  // it was imported at: 32 of 56 cards had drifted, 24 of them still sitting in
  // "Leads" after being worked all the way to Done or Email Marketing.
  // Reconciled from the card's CURRENT list, so one event of any kind repairs it.
  const stageChanged = !!card.stage && job.pipelineStage !== card.stage;

  // Repair the create-time placeholder note. Trello writes the desc a beat after
  // createCard, so a card imported during that window kept
  // 'Auto-imported from Trello card "image.jpeg"' forever and lost the real lead
  // text, the contact block and the HS_ID. Only ever replaces that exact
  // placeholder shape, so a note the team has written is never touched.
  const notePlaceholder = /^Auto-imported from Trello card "[^"]*"/.test(String(job.notes ?? '').trim());
  const notesChanged = notePlaceholder && card.notes.trim() !== String(job.notes ?? '').trim()
    && !/^Auto-imported from Trello card "[^"]*"/.test(card.notes.trim());

  if (!nameChanged && !infoChanged && !labelsChanged && !stageChanged && !notesChanged) return;

  if (isPlaceholder(job.clientName)) job.clientName = displayName;
  if (isPlaceholder(job.title)) job.title = displayName;
  if (infoChanged) job.leadInfo = info;
  if (labelsChanged) job.labels = syncLabels;
  if (stageChanged) job.pipelineStage = card.stage;
  if (notesChanged) { job.notes = card.notes; job.description = card.description; }
  job.updatedAt = now;

  await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=key`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value: job, updated_at: now }),
  });
}

// ── New-lead notification (in-app bell + web push) ──────────────────────────

/** Office staff who work the LL funnel. Contractors and sales are excluded:
 *  contractors never see leads, and sales cannot reach the LL board at all
 *  (the Service Orders role grant is still an open decision, 2026-08-09). */
const OFFICE_ROLES = new Set(['admin', 'coo', 'support']);

const VAPID_PUBLIC_KEY  = (process.env.VAPID_PUBLIC_KEY ?? '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY ?? '').trim();

/** Every office-staff user id, via the admin API (roles live in user_metadata,
 *  which PostgREST cannot reach). Best-effort: returns [] on any failure so a
 *  notification problem can never cost us the lead import itself. */
async function officeStaffIds(): Promise<string[]> {
  const ids: string[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`,
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } },
      );
      if (!res.ok) break;
      const body = await res.json() as { users?: { id: string; user_metadata?: Record<string, unknown> }[] };
      const users = body.users ?? [];
      for (const u of users) {
        if (OFFICE_ROLES.has(String(u.user_metadata?.role ?? ''))) ids.push(u.id);
      }
      if (users.length < 200) break;
    }
  } catch (err) {
    console.error('[trello-webhook] officeStaffIds failed:', err);
  }
  return [...new Set(ids)];
}

/**
 * Tell the office a lead just landed: a row in `notifications` (the bell, which
 * syncs to every signed-in browser) plus best-effort web push to their phones.
 *
 * Fire-and-forget by design. The whole function is wrapped so that a broken
 * notification path can NEVER fail the webhook: Trello retries non-200s, and a
 * retry would be a no-op anyway (upsertLeadJob is create-if-absent), but a 500
 * here would look like a failed import in the Trello webhook log.
 *
 * The notification id is derived from the card id, so a Trello redelivery
 * resolves to the same row and cannot double-notify.
 */
async function notifyNewLead(jobId: string, cardId: string, displayName: string, listLabel: string, now: string): Promise<number> {
  const ids = await officeStaffIds();
  if (ids.length === 0) return 0;

  const rows = ids.map(uid => ({
    id: `notif-lead-${cardId}-${uid}`,
    user_id: uid,
    type: 'new_lead',
    title: 'New lead from Trello',
    message: `${displayName} landed in ${listLabel}`,
    related_job_id: jobId,
    related_contractor_id: null,
    related_customer_id: null,
    related_activity_id: null,
    read: false,
    created_at: now,
  }));

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications?on_conflict=id`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!insertRes.ok) {
    console.error('[trello-webhook] notification insert failed:', await insertRes.text().catch(() => ''));
    return 0;
  }

  // Web push, strictly best-effort. The import and setVapidDetails both run
  // INSIDE the try: malformed VAPID env makes setVapidDetails throw synchronously,
  // and that exact call at module scope took all of /api/notify down for 2 days
  // (gotcha_notify_vapid_module_crash). Lazy + guarded, it can only cost a log line.
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
      const webPush = (await import('web-push')).default;
      webPush.setVapidDetails('mailto:admin@conexsol.us', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

      const subRes = await fetch(
        `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=in.(${ids.join(',')})&select=user_id,endpoint,subscription`,
        { headers: supabaseHeaders },
      );
      if (subRes.ok) {
        const subs = await subRes.json() as { user_id: string; endpoint: string; subscription: Record<string, unknown> }[];
        const payload = JSON.stringify({
          title: 'New lead from Trello',
          body: `${displayName} landed in ${listLabel}`,
          url: '/',
        });
        await Promise.all(subs.map(async row => {
          try {
            await webPush.sendNotification(
              row.subscription as unknown as Parameters<typeof webPush.sendNotification>[0],
              payload,
              { TTL: 86400 },
            );
          } catch (err: unknown) {
            // 410 Gone = the browser dropped the subscription; prune it.
            if ((err as { statusCode?: number }).statusCode === 410) {
              await fetch(
                `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`,
                { method: 'DELETE', headers: supabaseHeaders },
              ).catch(() => {});
            }
          }
        }));
      }
    } catch (err) {
      console.error('[trello-webhook] web push skipped:', (err as Error).message);
    }
  }
  return rows.length;
}

/** Pure decision: does this board action land a card in a tracked leads list? */
export function matchTargetList(action: TrelloWebhookAction): { boardId: string; listId: string; label: string } | undefined {
  const boardId = action.data?.board?.id;
  const landedListId =
    action.type === 'createCard' ? action.data?.list?.id :
    action.type === 'updateCard' ? action.data?.listAfter?.id :
    undefined;
  if (!landedListId) return undefined;
  return TARGET_LISTS.find(t => t.boardId === boardId && t.listId === landedListId);
}


/**
 * Add the matching service order so the card also shows on the S1 board's
 * "Leads Services SolarEdge" column, where the team works it up: assign a
 * client number, attach a customer, build the story, then drag it onward.
 *
 * Jobs sync as their OWN per-record `job:<id>` rows (PREFIX.job in
 * syncEngine.ts), not inside a blob, so this writes one row and the client's
 * incremental pull picks it up by `updated_at`.
 *
 * Same create-if-absent rule as the Lead, and it matters more here: this row is
 * the thing the team actively edits.
 */
async function upsertLeadJob(jobId: string, job: unknown, now: string): Promise<'created' | 'exists'> {
  const key = `job:${jobId}`;
  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=key`,
    { headers: supabaseHeaders },
  );
  if (!selectRes.ok) throw new Error(`Supabase job read ${selectRes.status}`);
  const existing = await selectRes.json() as unknown[];
  if (existing.length > 0) return 'exists';

  const upsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?on_conflict=key`,
    {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, value: job, updated_at: now }),
    },
  );
  if (!upsertRes.ok) {
    const detail = await upsertRes.text().catch(() => '');
    throw new Error(`Supabase job upsert ${upsertRes.status}: ${detail}`);
  }
  return 'created';
}

async function handleLeadImportWebhook(req: VercelRequest, res: VercelResponse) {
  try {
    const rawBody = await readRawBody(req);

    // Belt and braces: if the runtime ignored bodyParser:false it already drained
    // the stream, leaving rawBody empty. Signatures are unverifiable then (the
    // exact bytes are gone), but dropping every lead is worse than the status quo
    // ante, so fall back to the parsed body and say so loudly in the logs.
    let payload: { action?: TrelloWebhookAction };
    if (rawBody) {
      if (!verifyTrelloSignature(rawBody, callbackUrlFor(req), req.headers['x-trello-webhook'] as string | undefined, API_SECRET)) {
        console.warn('[trello-webhook] rejected: bad signature for', callbackUrlFor(req));
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      try {
        payload = JSON.parse(rawBody) as { action?: TrelloWebhookAction };
      } catch {
        return res.status(400).json({ error: 'Body is not valid JSON' });
      }
    } else {
      if (API_SECRET) console.error('[trello-webhook] raw body unavailable, signature NOT verified; check that bodyParser:false is honored');
      payload = (req.body ?? {}) as { action?: TrelloWebhookAction };
    }

    const action = payload.action;
    if (!action?.data?.card) return res.status(200).json({ skipped: 'no card in payload' });

    const target = matchTargetList(action);
    if (!target && !BACKFILL_ACTIONS.has(action.type)) {
      return res.status(200).json({ skipped: 'not a create/move into a tracked leads list' });
    }

    if (!API_KEY || !API_TOKEN || !SERVICE_ROLE_KEY) {
      console.error('[trello-webhook] missing credentials', { hasKey: !!API_KEY, hasToken: !!API_TOKEN, hasServiceRole: !!SERVICE_ROLE_KEY });
      return res.status(500).json({ error: 'Server not configured' });
    }

    const cardId = action.data.card.id;
    // Deterministic id from the card id, so a redelivery resolves to the same
    // job and the create-if-absent check recognises it.
    const jobId  = `job-trello-${cardId}`;
    const now = new Date().toISOString();

    const card = await fetchCardForLeadImport(cardId);
    const cardLabels = toJobLabels(card.labels);
    const { fields, vision, nameIsFile } = await extractCardFields(cardId, card);
    const { firstName, lastName, phone, email, address, city, state, zip } = fields;
    // Still no name (vision failed, plain image)? Fall back to the phone so the
    // team can see who to call, never "image.jpeg".
    const displayName = displayNameFor(fields);

    // Only include fields that actually have a value: LeadInfo fields are all
    // optional, and seedLeadInfo() on the client treats ANY truthy leadInfo as
    // "already seeded", so an object of all-empty strings would block its own
    // notes-parsing fallback without contributing anything.
    const leadInfoFields: Record<string, string> = {};
    if (firstName) leadInfoFields.firstName = firstName;
    if (lastName)  leadInfoFields.lastName  = lastName;
    if (phone)     leadInfoFields.phone     = phone;
    if (email)     leadInfoFields.email     = email;
    if (address)   leadInfoFields.address   = address;
    if (city)      leadInfoFields.city      = city;
    if (state)     leadInfoFields.state     = state;
    if (zip)       leadInfoFields.zip       = zip;

    const extraNote = [
      vision.contractName?.trim() && `Contract: ${vision.contractName.trim()}`,
      vision.hsId?.trim() && `HS_ID: ${vision.hsId.trim()}`,
      vision.notes?.trim(),
    ].filter(Boolean).join('\n');
    const cardNote = [card.desc.trim(), extraNote].filter(Boolean).join('\n').trim()
      || `Auto-imported from Trello card "${card.name}"`;

    // Lead Lobby was removed (2026-08-08 teardown): the LL-board job row is now
    // the ONLY record. Contact info rides in job.leadInfo (LeadPanel's actual
    // editable fields, added after this file was first written, see below) AND
    // in the notes as human-readable redundancy for the activity feed.
    const contactLine = [
      phone && `Phone: ${formatPhone(phone)}`,
      email && `Email: ${email}`,
      [address, city, state, zip].filter(Boolean).join(', ') || null,
    ].filter(Boolean).join('\n');

    const fullNotes = [cardNote, contactLine, `Trello card: ${card.shortUrl}`].filter(Boolean).join('\n\n');

    // A later event on a card we already imported: reconcile it against the card
    // as it stands right now. Self-guards to a no-op if the job is absent, never
    // creates, and never overwrites a value the team already set by hand.
    if (!target) {
      await backfillLeadJob(jobId, displayName, leadInfoFields, {
        labels: LABEL_ACTIONS.has(action.type) ? cardLabels : undefined,
        stage: stageForList(card.idList),
        notes: fullNotes,
        description: cardNote,
      }, now);
      console.info(`[trello-webhook] backfill ${action.type}: job ${jobId} (${displayName}) stage=${stageForList(card.idList) ?? '?'}`);
      return res.status(200).json({ job: { id: jobId, result: 'backfilled' } });
    }

    const job = {
      id: jobId,
      // No customer yet, that is the point: the team assigns the client number
      // and links the customer as they work it. JobCard falls back to
      // `clientName` for display while customerId is still empty.
      customerId: '',
      technicianId: '',
      clientName: displayName,
      title: nameIsFile ? displayName : card.name,
      serviceType: 'Lead',
      status: 'new',
      // Effectively always 'leads' (only that list creates a lead), but read
      // from the card's real list so the column can never disagree with Trello.
      pipelineStage: stageForList(card.idList) ?? 'leads',
      // The LeadPanel's editable contact fields, LeadPanel.tsx / seedLeadInfo().
      // Omitted entirely (not an empty object) when nothing was extracted, so a
      // later backfill's own emptiness check (Object.values(...).some(Boolean))
      // still treats the job as unseeded.
      ...(Object.keys(leadInfoFields).length > 0 ? { leadInfo: leadInfoFields } : {}),
      // Trello's label chips, so the card reads the same on both boards.
      ...(cardLabels.length > 0 ? { labels: cardLabels } : {}),
      // Empty, not today's date: the calendar buckets these via parseDateSafe
      // into "unscheduled" rather than dropping an unqualified lead onto today.
      scheduledDate: '',
      scheduledTime: '',
      notes: fullNotes,
      description: cardNote,
      photos: [],
      laborHours: 0, laborRate: 0, partsCost: 0, totalAmount: 0,
      urgency: 'medium',
      isPowercare: false,
      createdAt: now,
      // Required: syncEngine's remoteWins treats an updatedAt-less record as
      // always losing, so an unstamped row would be dropped on first merge.
      updatedAt: now,
    };

    const jobResult = await upsertLeadJob(jobId, job, now);

    // Only on a genuinely new lead. 'exists' means a redelivery or a card dragged
    // out of the list and back, and re-pinging the office for those would train
    // everyone to ignore the bell. Never allowed to fail the import.
    let notified = 0;
    if (jobResult === 'created') {
      notified = await notifyNewLead(jobId, cardId, displayName, target.label, now)
        .catch(err => { console.error('[trello-webhook] notifyNewLead failed:', err); return 0; });
    }

    console.info(`[trello-webhook] ${target.label}: job ${jobId} ${jobResult} (${displayName}), ${cardLabels.length} label(s), notified ${notified}`);
    return res.status(200).json({ job: { id: jobId, result: jobResult }, notified });
  } catch (err) {
    console.error('[trello-webhook] error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'trello-webhook crashed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Trello HEAD-verifies the callback URL synchronously when the webhook is
  // created. Must return 2xx or registration is rejected outright.
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  if (req.method === 'POST') {
    return handleLeadImportWebhook(req, res);
  }
  // Top-level safety net: if ANYTHING below throws, return a clean 500 instead
  // of Vercel's FUNCTION_INVOCATION_FAILED page (the previous behavior, an
  // un-stringifiable cardId array crashed before the inner try/catch ran).
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // req.query values are string | string[] | undefined, normalize to string.
    // Previously typed as `string` and used directly with .match()/.trim(); if a
    // caller (or a duplicated query param) made it an array, the function
    // crashed with "cardId.match is not a function" → FUNCTION_INVOCATION_FAILED.
    const raw = req.query.cardId;
    const cardId = Array.isArray(raw) ? raw[0] : raw;
    if (!cardId || typeof cardId !== 'string') {
      return res.status(400).json({ error: 'Missing cardId parameter' });
    }

    // Extract card ID from full URL if needed
    const idMatch = cardId.match(/trello\.com\/c\/([a-zA-Z0-9]+)/);
    const finalCardId = (idMatch ? idMatch[1] : cardId).trim();
    if (!/^[a-zA-Z0-9]+$/.test(finalCardId)) {
      return res.status(400).json({ error: 'Invalid cardId, expected an alphanumeric Trello card id or URL.' });
    }

    if (!API_KEY || !API_TOKEN) {
      return res.status(500).json({
        error: 'Trello credentials not configured. Set TRELLO_API_KEY and TRELLO_API_TOKEN (or VITE_TRELLO_API_KEY/VITE_TRELLO_TOKEN) in Vercel env vars.',
        debug: { hasKey: !!API_KEY, hasToken: !!API_TOKEN },
      });
    }

    const url =
      `${TRELLO_BASE}/cards/${finalCardId}` +
      `?key=${API_KEY}&token=${API_TOKEN}` +
      `&fields=name,desc,due,shortUrl,labels` +
      `&attachments=true&attachment_fields=all` +
      // checklists + custom fields often hold the phone number and address;
      // actions unfiltered so desc edits (updateCard) are mined too, not just comments
      `&checklists=all` +
      `&customFieldItems=true` +
      `&actions=commentCard,updateCard&actions_limit=1000`;

    let upstream: Response;
    try {
      upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
      console.error('[Trello proxy] fetch failed:', err);
      return res.status(502).json({ error: 'Could not reach Trello API. Check network connectivity.' });
    }

    // Read body as text first so a non-JSON response (HTML error page, empty
    // body on 429/504) doesn't crash json() and turn into a 500.
    const bodyText = await upstream.text().catch(() => '');
    let data: any = null;
    if (bodyText) {
      try { data = JSON.parse(bodyText); } catch { /* leave as null */ }
    }

    if (!upstream.ok) {
      const msg = (data && (data.error || data.message)) || upstream.statusText || bodyText.slice(0, 200) || 'unknown error';
      return res.status(upstream.status).json({ error: `Trello API ${upstream.status}: ${msg}` });
    }
    if (data == null) {
      return res.status(502).json({ error: 'Trello API returned an unreadable response.' });
    }

    // Cache successful responses for 1 hour to reduce API load
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(data);
  } catch (err) {
    console.error('[Trello proxy] unhandled error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Trello proxy crashed unexpectedly.',
    });
  }
}
