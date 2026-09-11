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
import { requireUser } from './_auth';
import { extractLeadFromImage, validSiteId, type ParsedLead } from './parse-lead-image';

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
  if (!secret) {
    // Deliberate fail-open: failing closed would kill the lead pipeline on any
    // deploy missing the var. But it must not be SILENT - unset was the steady
    // state for long enough that nobody noticed. The authoritative board check
    // in assertCardOnAllowedBoard() is what actually guards this path while the
    // secret is absent; this only makes the weakened state visible in the logs.
    console.warn('[trello-webhook] TRELLO_API_SECRET is unset, signature NOT verified (failing open)');
    return true;
  }
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
  // Added 2026-08-31. This list was created ~08-29 at position 0 of the board,
  // so Trello's "Add a card" default put every new card here instead of in
  // "Leads Services SolarEdge", and 5 leads never reached LL at all: the
  // webhook fired, matchTargetList found nothing, and backfillLeadJob no-oped
  // on a job that had never been created. Importing from it is the fix the
  // user chose over reordering the board.
  { boardId: '6a5a58e06fbf97144b5d96c9', listId: '6a921054f4c77bfac810188f', label: 'FL: LOST TO COMPETITION' },
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
  '6a921054f4c77bfac810188f': 'lost_to_competition',       // LOST TO COMPETITION
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

/**
 * Boards this webhook will import from, taken from TARGET_LISTS so the two can
 * never drift.
 *
 * This is the guard that does NOT depend on TRELLO_API_SECRET. `matchTargetList`
 * reads the board id out of `action.data.board.id`, which is just whatever the
 * caller POSTed; with the signature failing open, anyone can claim to be our
 * board. And because this repo is PUBLIC, the real board and list ids are
 * readable in this very file.
 *
 * So the attack was: create a card on your OWN board, POST a payload naming our
 * board and list but YOUR card id, and the server fetches your card (our token
 * can read any public card) and imports its contents as a lead, notifying ~13
 * office users. `idBoard` comes back from Trello, not from the payload, so it
 * cannot be forged.
 */
const ALLOWED_BOARD_IDS = new Set(TARGET_LISTS.map(t => t.boardId));

/** True when a card Trello itself reports actually lives on a board we import from. */
export function isAllowedBoard(idBoard: string | undefined): boolean {
  return !!idBoard && ALLOWED_BOARD_IDS.has(idBoard);
}

/**
 * What to do with a card, given the `idBoard` Trello returned.
 *
 * The three-way split matters. An ABSENT idBoard cannot be caused by an
 * attacker: the fetch is ours and explicitly asks for the field, and every
 * Trello card belongs to a board. So absence means our request or Trello's
 * response shape changed, i.e. a bug. Rejecting on a bug would 403 every
 * legitimate lead and take the pipeline down, which is the precise outcome the
 * fail-open signature branch exists to avoid. So absence is 'unverified':
 * allowed, but shouted about in the logs.
 *
 * A PRESENT idBoard that is not ours is the real attack, and is rejected.
 */
export function boardDecision(idBoard: string | undefined): 'allow' | 'reject' | 'unverified' {
  if (!idBoard) return 'unverified';
  return ALLOWED_BOARD_IDS.has(idBoard) ? 'allow' : 'reject';
}

/**
 * The LL stage for a Trello list. EVERY list on the board has one.
 *
 * Lists LL has always known keep their semantic key ('leads', 'done', ...),
 * which existing jobs and Move to Client ('needs_first_quote') depend on. Any
 * other list gets `list:<id>` (user decision 2026-09-10: "columns on Trello,
 * new or renamed, need to reflect the LL"). Keyed by id, never by name, so a
 * rename in Trello never orphans the cards in that column.
 *
 * This replaced "undefined for an untracked list". That silently dropped every
 * move into a list created after this file was last edited, and it happened
 * three times: LOST TO COMPETITION (08-29), Service Quote Accepted, and
 * Scheduled/In Process (all 2026). A list nobody told the code about is now an
 * ordinary column, not a hole.
 */
export function stageForList(listId: string | undefined): string | undefined {
  if (!listId) return undefined;
  return LIST_STAGES[listId] ?? (/^[0-9a-f]{24}$/i.test(listId) ? `list:${listId}` : undefined);
}

/**
 * The stage for a list id taken from a webhook PAYLOAD, which the caller
 * controls. A known list is safe by construction. An unknown one is accepted
 * only when Trello itself reports the card sitting in it right now, otherwise
 * a forged `listAfter` could file a real card under a list on someone else's
 * board. Returning undefined means "this event says nothing about the column",
 * and the next event (or the daily sweep) settles it.
 */
export function trustedStage(payloadListId: string | undefined, cardIdList: string | undefined): string | undefined {
  if (!payloadListId) return undefined;
  if (LIST_STAGES[payloadListId]) return LIST_STAGES[payloadListId];
  return payloadListId === cardIdList ? stageForList(payloadListId) : undefined;
}

/**
 * The inverse: which Trello list a LL column pushes a card into.
 *
 * Built by inverting LIST_STAGES rather than written out a second time, so the
 * two directions of the mirror cannot drift. A stage with no Trello list (were
 * one ever added app-side only) returns undefined and is simply not pushed,
 * which is why the caller must treat undefined as "leave the card alone"
 * rather than "move it to a default".
 */
const STAGE_LISTS: Record<string, string> = Object.fromEntries(
  Object.entries(LIST_STAGES).map(([listId, stage]) => [stage, listId]),
);

export function listForStage(stage: string | undefined): string | undefined {
  if (!stage) return undefined;
  const m = /^list:([0-9a-f]{24})$/i.exec(stage);
  return STAGE_LISTS[stage] ?? (m ? m[1] : undefined);
}

interface TrelloWebhookAction {
  type: string;
  data?: {
    card?: { id: string; name: string; shortLink?: string };
    list?: { id: string; name?: string };       // present on createCard
    listAfter?: { id: string; name?: string };  // present on updateCard ONLY when it's a list move
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

/**
 * "Site ID: 1234567" from a card description, as Anthony's "New Lead" Trello
 * card template asks for it. SolarEdge site ids are 5-7 digits (246 live
 * customers: shortest 5, longest 7). The label is required: a bare number of
 * that length is as likely a zip, a phone fragment or a case id.
 * Kept out of parseLeadDesc because ParsedLead is the vision model's shape
 * (parse-lead-image.ts), and a site id is a job field, not a contact field.
 */
export function parseSiteId(desc: string): string | undefined {
  return /^\s*(?:solaredge\s+)?site\s*(?:id|#|number)\s*:\s*(\d{5,7})\s*$/im.exec(desc || '')?.[1];
}

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

async function fetchCardForLeadImport(cardId: string): Promise<{ name: string; desc: string; shortUrl: string; labels?: TrelloLabel[]; idList?: string; idBoard?: string; isTemplate?: boolean }> {
  // idList is read on EVERY event, not just list-move events: reconciling
  // against the card's actual current list is self-healing, so a webhook
  // delivery we missed (or a move made while a deploy was in flight) is
  // corrected by the next event of any kind on that card.
  // isTemplate: Anthony's "New Lead" card template lives on the board. It is a
  // card like any other to the webhook, and must never become a lead.
  const url = `${TRELLO_BASE}/cards/${cardId}?key=${API_KEY}&token=${API_TOKEN}&fields=name,desc,shortUrl,labels,idList,idBoard,isTemplate`;
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

/**
 * Match key for a label name. MUST stay identical to labelKey() in
 * solarflow-dashboard/src/lib/labelCatalog.ts.
 *
 * The dash class is not cosmetic. The live board spells one label
 * "First Contact – Call Completed" with an EN DASH while LABEL_CATALOG spells
 * it with a hyphen. Compared raw, the app and Trello would each see the other's
 * spelling as a label the other is missing, and every mirror in one direction
 * would trigger a mirror back in the other, forever. Normalizing makes the
 * second round a no-op, which is what actually stops the echo.
 */
export function labelKey(name: string): string {
  return name.toLowerCase().replace(/[‒-―]/g, '-').replace(/\s+/g, ' ').trim();
}

/**
 * Record that the server changed these fields NOW, in the job's own per-field
 * clock, so a browser merge treats the change as the newest edit.
 *
 * Without this the webhook's changes were silently reverted. The client merge
 * (mergeJobFields in solarflow-dashboard/src/lib/syncEngine.ts) picks every
 * field by `fieldTimes[field]`, falling back to the record time only when the
 * field has no entry. The webhook set the new column and bumped `updatedAt`
 * but left `fieldTimes.pipelineStage` at the OLD edit's time, so any browser
 * holding the previous version saw a tie, kept its own stale column, and pushed
 * it back. Proven live 2026-09-10: 13 cards moved in Trello sat in their old LL
 * column, each with a `fieldTimes.pipelineStage` older than the Trello move,
 * while the one job with no entry (so record time decided) kept its move.
 *
 * Mutates and returns `job` so the callers stay one line.
 */
export function stampMirroredFields<T extends { fieldTimes?: Record<string, string>; updatedAt?: string }>(
  job: T,
  fields: string[],
  now: string,
): T {
  if (fields.length > 0) {
    job.fieldTimes = { ...(job.fieldTimes ?? {}) };
    for (const f of fields) job.fieldTimes[f] = now;
  }
  job.updatedAt = now;
  return job;
}

/** Contact fields a Trello correction may overwrite. Names are excluded: the
 *  card title is also the display name, and a rename is handled separately. */
const CORRECTABLE = ['phone', 'email', 'address', 'city', 'state', 'zip'] as const;

/**
 * Which of Anthony's description values may OVERWRITE the lead's contact info.
 *
 * He edits the card description after creating it (23 description edits in 14
 * days as of 2026-09-10). The backfill used to fill only EMPTY fields, so if
 * the first parse misread a phone and he fixed it, LL kept the wrong number.
 * Now Trello may correct a field, but only when all of these hold:
 *   - the lead is not converted (`customerId` empty): after Move to Client the
 *     customer record owns the contact data, and leadInfo is history;
 *   - nobody edited the contact info in LL since the webhook last wrote it:
 *     `fieldTimes.leadInfo` is absent, or no later than `trelloLeadInfoAt`
 *     (the webhook's own stamp), so an office correction is never undone;
 *   - the value came from a LABELLED description line (the caller passes
 *     parseLeadDesc output only, never vision, which can answer differently on
 *     every run and would make LL flip between readings of the same image);
 *   - it is non-empty and actually different, so blanking a line in Trello
 *     never erases data in LL.
 */
export function acceptTrelloCorrections(
  job: { customerId?: string; leadInfo?: Record<string, string>; fieldTimes?: Record<string, string>; trelloLeadInfoAt?: string },
  fromDesc: Record<string, string>,
): Record<string, string> {
  if (String(job.customerId ?? '').trim()) return {};
  const officeAt = job.fieldTimes?.leadInfo;
  if (officeAt && (!job.trelloLeadInfoAt || officeAt > job.trelloLeadInfoAt)) return {};
  const out: Record<string, string> = {};
  for (const k of CORRECTABLE) {
    const v = String(fromDesc[k] ?? '').trim();
    if (v && v !== String(job.leadInfo?.[k] ?? '').trim()) out[k] = v;
  }
  return out;
}

// ── Cards SolarOps creates for existing service orders ─────────────────────
//
// "Send to Trello" on a service order (2026-09-11): the office logs a new
// customer in SolarOps, and Anthony, who works only in Trello, needs a card to
// follow up on the RMA and the order. That card is NOT a lead. Without the
// link below, the webhook would see an ordinary createCard on the board, import
// it as a brand-new lead (a duplicate of the customer who already exists), and
// ping every office phone about it; the daily sweep would do the same to any
// card it could not match.

/** The last line of every card SolarOps creates. It is written INTO the card at
 *  creation, so it is present on the very first webhook delivery, which often
 *  arrives before the app has saved the card id onto the order. */
export const SOLAROPS_REF_LINE = 'SolarOps ref:';

/** The service order a card was created from, read from its description. */
export function refJobId(desc: string | undefined): string | undefined {
  const id = /^SolarOps ref:\s*([A-Za-z0-9_-]{3,80})\s*$/m.exec(desc ?? '')?.[1];
  // A lead's own id never appears here; refuse it so nothing can use the ref
  // line to hide a real lead card from import.
  return id && !id.startsWith('job-trello-') ? id : undefined;
}

/**
 * The existing SolarOps job a card belongs to, if it is not a lead card: the
 * ref line first, then the card id saved on an order (`trelloCardId`), which
 * still links the card if someone deletes the ref line in Trello.
 */
async function linkedJobFor(cardId: string, desc: string | undefined): Promise<string | undefined> {
  const fromRef = refJobId(desc);
  if (fromRef) return fromRef;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=like.job:*&value->>trelloCardId=eq.${encodeURIComponent(cardId)}&select=key&limit=1`,
    { headers: supabaseHeaders },
  );
  if (!r.ok) return undefined;
  const rows = await r.json() as { key: string }[];
  return rows[0]?.key.slice('job:'.length);
}

/** Set equality by normalized name. Order and colour are not part of identity. */
export function sameLabelSet(
  a: { name: string }[],
  b: { name: string }[],
): boolean {
  const ka = new Set(a.map(l => labelKey(l.name)));
  const kb = new Set(b.map(l => labelKey(l.name)));
  return ka.size === kb.size && [...ka].every(k => kb.has(k));
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
  // A label added seconds after intake is part of the same intake, so these
  // events also finish the import. They do NOT hand Trello ongoing authority,
  // see INTAKE_STAGE below.
  'addLabelToCard', 'removeLabelFromCard',
]);

/**
 * TRELLO MIRRORS THE BOARD. (user decision, 2026-08-31, revising 2026-08-23)
 *
 * The 08-23 rule was "Trello is intake only, the app owns the record": nothing
 * arriving from Trello could ever change a value the app held. That rule
 * assumed two populations editing two boards. Today one person works both, so
 * the divergence it prevented is not the divergence they actually hit, which is
 * "I moved the card in Trello and LL still shows the old column".
 *
 * So `pipelineStage` and `labels` are now MIRRORED from Trello, and labels are
 * pushed back the other way (see the PATCH branch). What is mirrored, and what
 * is still intake-only:
 *
 *   - `pipelineStage`  mirrored, but ONLY on an actual list move (an updateCard
 *                      carrying `listAfter`). Deliberately not on every event:
 *                      a comment or an attachment must never drag a card back
 *                      to whatever column Trello happens to have it in.
 *   - `labels`         mirrored as a WHOLE SET, so a label removed in Trello is
 *                      removed here. This is the direction that replaced the
 *                      old union-add; the app->Trello direction is the PATCH
 *                      branch, and the two converge because the mirror is
 *                      idempotent (an echo produces no change, so no write).
 *   - name/leadInfo/notes  UNCHANGED, still filled ONLY where the job's value
 *                      is empty or is still the create-time placeholder.
 *                      Completing an incomplete import is not an override, and
 *                      a phone number corrected by hand must still survive.
 *
 * The empty-only rule matters because Trello fires createCard BEFORE it finishes
 * writing the description and uploading the attachment (measured: +1s typically,
 * +82min when a human drops the screenshot later), so the create-time import
 * often sees a bare "image.jpeg" card. The later events finish that job, and
 * only that job.
 *
 * ponytail: mirroring is last-writer-wins with no vector clock. That is correct
 * for one operator and wrong for a team; when the intern lands, the upgrade is
 * to compare the card's dateLastActivity against job.updatedAt before writing.
 */
const INTAKE_STAGE = 'leads';

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
    notes: string;
    description: string;
    /** Set ONLY when this event was a real list move, see mirrorStage below. */
    stage?: string;
    /** From a "Site ID:" line. Filled only into an EMPTY solarEdgeSiteId. */
    siteId?: string;
    /** Contact fields from the card's LABELLED description lines only. */
    corrections?: Record<string, string>;
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
  // Anthony's CORRECTIONS: a contact line he changed in the description after
  // the first parse. Empty-only would keep a misread phone forever. See
  // acceptTrelloCorrections for exactly when Trello may overwrite.
  for (const [k, v] of Object.entries(acceptTrelloCorrections(job, card.corrections ?? {}))) {
    info[k] = v; infoChanged = true;
  }

  // Labels: WHOLE-SET mirror of the card (2026-08-31, was union-add-at-intake).
  // Removing a label in Trello now removes it here, which is the whole point of
  // making the two boards one board. `syncLabels` undefined means the fetch did
  // not report labels at all, which is not the same claim as "this card has no
  // labels", so that case leaves the job alone rather than wiping it.
  const existing: { name: string; color: string }[] = Array.isArray(job.labels) ? job.labels : [];
  const mirrored = syncLabels ?? existing;
  const labelsChanged = !sameLabelSet(existing, mirrored);

  // pipelineStage: mirrored, but only when the caller proved this event was an
  // actual list move. An undefined stage is "this event says nothing about the
  // column", not "move it to the default", so it never writes.
  const stageChanged = !!card.stage && card.stage !== job.pipelineStage;

  // Empty-only, like leadInfo: Anthony types the site id into the template a
  // beat after creating the card, so this is where it usually arrives. A value
  // the office already set is never replaced from Trello.
  const siteChanged = !!card.siteId && !String(job.solarEdgeSiteId ?? '').trim();

  // Repair the create-time placeholder note, which loses the real lead text, the
  // contact block, the Contract Name and the HS_ID when the desc lands after
  // createCard. Only ever replaces that exact placeholder shape, so a note the
  // team has written is never touched.
  const notePlaceholder = /^Auto-imported from Trello card "[^"]*"/.test(String(job.notes ?? '').trim());
  const notesChanged = notePlaceholder && card.notes.trim() !== String(job.notes ?? '').trim()
    && !/^Auto-imported from Trello card "[^"]*"/.test(card.notes.trim());

  if (!nameChanged && !infoChanged && !labelsChanged && !notesChanged && !stageChanged && !siteChanged) return;

  const changed: string[] = [];
  if (isPlaceholder(job.clientName)) { job.clientName = displayName; changed.push('clientName'); }
  if (isPlaceholder(job.title)) { job.title = displayName; changed.push('title'); }
  if (infoChanged) {
    job.leadInfo = info;
    changed.push('leadInfo');
    // Provenance for acceptTrelloCorrections: the webhook's own leadInfo write
    // time. An office edit later stamps fieldTimes.leadInfo past it.
    job.trelloLeadInfoAt = now;
  }
  if (labelsChanged) { job.labels = mirrored; changed.push('labels'); }
  if (stageChanged) { job.pipelineStage = card.stage; changed.push('pipelineStage'); }
  if (siteChanged) { job.solarEdgeSiteId = card.siteId; changed.push('solarEdgeSiteId'); }
  if (notesChanged) { job.notes = card.notes; job.description = card.description; changed.push('notes', 'description'); }
  stampMirroredFields(job, changed, now);

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
          // Root, deliberately. The app has NO deep-link route: the only
          // query params it reads are `mode`, `invite` and `box` (App.tsx),
          // so a `?view=jobs&job=<id>` here would be ignored and land the
          // reader on the dashboard anyway, while looking like it worked.
          // The in-app bell DOES open the lead (Layout.tsx onOpenJob via
          // related_job_id, set below); only web push is generic. Fix by
          // adding the route, not by writing a URL nothing parses.
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

/**
 * A card deleted in Trello may reap its lead here, but ONLY while that lead is
 * still untouched intake. Trello is where a lead ARRIVES; once the office has
 * worked it (moved it off the leads column, linked a customer, given it an order
 * number, logged a call) the app owns it, and someone tidying up Trello must not
 * be able to delete real work.
 */
export function canReapLead(job: any): boolean {
  if (!job) return false;
  if (job.pipelineStage !== INTAKE_STAGE) return false;     // advanced by the office
  if (job.customerId) return false;                        // converted to a client
  if (job.woNumber) return false;                          // became a service order
  if (Array.isArray(job.activityHistory) && job.activityHistory.length > 0) return false;
  return true;
}

/**
 * Reap the lead for a card that was deleted in Trello.
 *
 * Writes the job id into the shared `deleted_job_ids` tombstone row (which every
 * client union-merges into localStorage on pull, syncEngine.ts) AND removes the
 * per-record row, so the lead disappears on every device instead of being
 * re-pulled forever.
 *
 * The caller MUST have confirmed with Trello that the card is really gone. The
 * card id in a webhook payload is attacker-supplied and this endpoint fails open
 * on signature, so "Trello returns 404 for this card" is the only claim here
 * that cannot be forged.
 */
async function reapDeletedLead(jobId: string, now: string): Promise<'reaped' | 'kept' | 'absent'> {
  const key = `job:${jobId}`;
  const jobRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: supabaseHeaders },
  );
  if (!jobRes.ok) return 'absent';
  const job = (await jobRes.json() as { value?: any }[])[0]?.value;
  if (!job) return 'absent';
  if (!canReapLead(job)) {
    console.warn(`[trello-webhook] card deleted in Trello but the lead has been worked, KEEPING ${jobId} (stage=${job.pipelineStage}, customer=${job.customerId || 'none'})`);
    return 'kept';
  }

  // Tombstone FIRST. If the row delete succeeded but the tombstone write failed,
  // a client still holding the job locally would push it straight back.
  const tombRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=eq.deleted_job_ids&select=value`, { headers: supabaseHeaders });
  const current = tombRes.ok ? ((await tombRes.json() as { value?: string[] }[])[0]?.value ?? []) : [];
  const ids = Array.isArray(current) ? current : [];
  if (!ids.includes(jobId)) {
    const put = await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=key`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'deleted_job_ids', value: [...ids, jobId], updated_at: now }),
    });
    if (!put.ok) {
      console.error('[trello-webhook] tombstone write failed, NOT deleting the row:', await put.text().catch(() => ''));
      return 'kept';
    }
  }

  // Then reap the row itself. Uses the service role, so this is not subject to
  // the app_data RLS that makes the client-side reap a silent no-op.
  const del = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { ...supabaseHeaders, Prefer: 'return=representation' },
  });
  const removed = del.ok ? ((await del.json().catch(() => [])) as unknown[]).length : 0;
  console.info(`[trello-webhook] reaped ${jobId} (rows removed: ${removed})`);
  return 'reaped';
}

/**
 * Pure decision: does this action land a card in a list on an import board?
 *
 * ANY list on the board, not only the intake list (2026-09-10). Every card on
 * this board is a lead or a job, all 91 of them had one, and a card created in
 * a list the code did not name used to vanish silently: 5 leads on 08-29 when
 * LOST TO COMPETITION was added in front of the intake list. Now wherever
 * Anthony creates a card, it arrives, in the column matching its list.
 * `label` is only the human wording for the new-lead notification.
 */
export function matchTargetList(action: TrelloWebhookAction): { boardId: string; listId: string; label: string } | undefined {
  const boardId = action.data?.board?.id;
  const landed =
    action.type === 'createCard' ? action.data?.list :
    action.type === 'updateCard' ? action.data?.listAfter :
    undefined;
  if (!landed?.id || !boardId || !ALLOWED_BOARD_IDS.has(boardId)) return undefined;
  const known = TARGET_LISTS.find(t => t.boardId === boardId && t.listId === landed.id);
  return known ?? { boardId, listId: landed.id, label: `FL: ${landed.name ?? 'Services board'}` };
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

    // A card deleted in Trello reaps its lead here, so the board does not keep
    // showing leads that no longer exist upstream. Handled before matchTargetList
    // because a deleteCard action carries no list, and before the card fetch
    // because the card is gone by definition.
    if (action.type === 'deleteCard') {
      if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });
      const deletedCardId = action.data.card.id;
      if (!/^[0-9a-fA-F]{24}$/.test(deletedCardId)) {
        return res.status(400).json({ error: 'Malformed card id' });
      }
      // boardDecision() cannot help here: it reads the idBoard Trello returns for
      // the card, and the card no longer exists. Confirming with Trello that the
      // card is REALLY gone is the substitute, and it is the claim an attacker
      // cannot forge: they cannot make a live card 404.
      const probe = await fetch(`${TRELLO_BASE}/cards/${deletedCardId}?key=${API_KEY}&token=${API_TOKEN}&fields=id`);
      if (probe.status !== 404) {
        console.warn(`[trello-webhook] deleteCard for ${deletedCardId} but Trello still returns ${probe.status}, refusing to reap`);
        return res.status(200).json({ skipped: 'card still exists in Trello' });
      }
      const result = await reapDeletedLead(`job-trello-${deletedCardId}`, new Date().toISOString());
      return res.status(200).json({ job: { id: `job-trello-${deletedCardId}`, result } });
    }

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

    // A card template is Anthony's form, not a lead. Checked on every event, not
    // only createCard: a card marked as a template after creation still fires
    // updateCard, and must not be backfilled or re-imported either.
    if (card.isTemplate) return res.status(200).json({ skipped: 'card is a template' });

    // A card SolarOps made for an existing service order ("Send to Trello") is
    // never a lead: no import, no backfill, no new-lead notification. This runs
    // on EVERY event, not just createCard, because a move into another list
    // would otherwise take the create path too (any list imports, b0e4d0d).
    const linkedJob = await linkedJobFor(cardId, card.desc);
    if (linkedJob) return res.status(200).json({ skipped: `card belongs to service order ${linkedJob}` });

    // Authoritative board check, BEFORE anything is written or anyone notified.
    // Trello reported this idBoard, the caller did not, so a forged payload
    // pointing at a card on someone else's board is rejected here even when the
    // signature check is failing open. A bogus card id never reaches this line:
    // the fetch above throws on a Trello 404.
    const decision = boardDecision(card.idBoard);
    if (decision === 'reject') {
      console.warn('[trello-webhook] rejected: card', cardId, 'is on board', card.idBoard, 'which is not an import source');
      return res.status(403).json({ error: 'Card is not on an allowed board' });
    }
    if (decision === 'unverified') {
      // Not an attack vector (see boardDecision), so let the lead through rather
      // than take the pipeline down, but make the blind spot impossible to miss.
      console.error('[trello-webhook] card', cardId, 'returned no idBoard; board NOT verified. Check the Trello fields= query.');
    }

    const cardLabels = toJobLabels(card.labels);
    const { fields, vision, nameIsFile } = await extractCardFields(cardId, card);
    // A typed "Site ID:" line wins; otherwise the screenshot's "SITE ID:".
    const siteId = parseSiteId(card.desc) ?? validSiteId(vision.siteId);
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
      // Only a real list move carries listAfter, and only a real list move is
      // allowed to set the column. Read the stage from the id Trello reported
      // moving the card INTO, never from card.idList: by the time we fetched
      // the card it may already have been dragged again, and mirroring that
      // would silently apply a move this event never described.
      const movedTo = action.type === 'updateCard' ? action.data?.listAfter?.id : undefined;
      await backfillLeadJob(jobId, displayName, leadInfoFields, {
        labels: cardLabels,
        notes: fullNotes,
        description: cardNote,
        stage: trustedStage(movedTo, card.idList),
        siteId,
        corrections: parseLeadDesc(card.desc) as Record<string, string>,
      }, now);
      console.info(`[trello-webhook] backfill ${action.type}: job ${jobId} (${displayName})${movedTo ? ` moved to ${trustedStage(movedTo, card.idList) ?? 'unverified list'}` : ''}`);
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
      ...(siteId ? { solarEdgeSiteId: siteId } : {}),
      createdAt: now,
      // Required: syncEngine's remoteWins treats an updatedAt-less record as
      // always losing, so an unstamped row would be dropped on first merge.
      updatedAt: now,
    };

    const jobResult = await upsertLeadJob(jobId, job, now);

    // A move INTO a tracked list is BOTH a target match and a list move, and
    // upsertLeadJob is create-if-absent, so on 'exists' it writes nothing at
    // all. Without this the most ordinary action there is, dragging a lead the
    // app already knows about into "LOST TO COMPETITION", would leave LL
    // sitting on the old column. Reconcile through the same backfill the
    // untracked-list moves use, so there is one mirror, not two.
    if (jobResult === 'exists') {
      await backfillLeadJob(jobId, displayName, leadInfoFields, {
        labels: cardLabels,
        notes: fullNotes,
        description: cardNote,
        // The list the EVENT landed the card in, not card.idList, for the same
        // reason as the untracked branch above; trustedStage refuses a list
        // id Trello does not confirm, now that any list can be a target.
        stage: trustedStage(target.listId, card.idList),
        siteId,
        corrections: parseLeadDesc(card.desc) as Record<string, string>,
      }, now);
    }

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

// ── App -> Trello card push (PATCH branch) ──────────────────────────────────

/**
 * Board label ids for `labels`, creating any the board lacks.
 *
 * Trello's card-label API is id-based and the app stores names, so this
 * resolves through the board's label list. Matching is by labelKey, not raw
 * name, or "First Contact - Call Completed" would be created a second time
 * next to the board's existing en-dash spelling.
 *
 * ponytail: the board's labels are re-fetched per call. One extra request on a
 * click a human made; cache it if the intern ever makes this hot.
 */
async function resolveLabelIds(
  boardId: string,
  labels: { name: string; color: string }[],
  created: string[],
): Promise<string[]> {
  const auth = `key=${API_KEY}&token=${API_TOKEN}`;
  const listRes = await fetch(`${TRELLO_BASE}/boards/${boardId}/labels?limit=1000&${auth}`);
  if (!listRes.ok) throw new Error(`Trello board labels ${listRes.status}`);
  const board = await listRes.json() as { id: string; name?: string; color?: string | null }[];

  const byKey = new Map(board.map(l => [labelKey(l.name ?? ''), l.id]));
  const ids: string[] = [];

  for (const l of labels) {
    const k = labelKey(l.name);
    if (!k) continue;
    let id = byKey.get(k);
    if (!id) {
      // The app's catalog can legitimately be ahead of the board (e.g.
      // "Powercare Report Sent", added to LABEL_CATALOG 2026-08-31 and still
      // absent from Trello). Dropping it would make the push silently lossy,
      // which is the exact failure mode this whole change exists to end.
      const mk = await fetch(
        `${TRELLO_BASE}/labels?idBoard=${boardId}&name=${encodeURIComponent(l.name)}` +
        `&color=${encodeURIComponent(l.color || 'null')}&${auth}`,
        { method: 'POST' },
      );
      if (!mk.ok) {
        console.warn(`[trello-labels] could not create "${l.name}" on board ${boardId}: ${mk.status}`);
        continue;
      }
      id = ((await mk.json()) as { id: string }).id;
      byKey.set(k, id);
      created.push(l.name);
    }
    if (!ids.includes(id)) ids.push(id);
  }

  return ids;
}

/**
 * Apply a set of card changes in ONE PUT.
 *
 * Trello's card PUT takes every field at once, so batching is both fewer
 * requests and fewer webhook deliveries bouncing back at us: a move plus a
 * relabel is one updateCard event instead of two.
 */
async function putCard(cardId: string, params: Record<string, string>): Promise<void> {
  const qs = new URLSearchParams({ ...params, key: API_KEY, token: API_TOKEN });
  const put = await fetch(`${TRELLO_BASE}/cards/${cardId}?${qs}`, { method: 'PUT' });
  if (!put.ok) {
    const detail = await put.text().catch(() => '');
    // Verified 2026-08-31: TRELLO_API_TOKEN is scoped read-only
    // (Board write:false), so every write returns this exact 401 and Trello's
    // own wording, "unauthorized card permission requested", names neither the
    // token nor the scope. Say what is actually wrong, or the next person
    // debugs the card id for an hour.
    if (put.status === 401) {
      throw new Error(
        'TRELLO_API_TOKEN is read-only, so nothing can be written back to Trello. ' +
        'Re-issue the token with write scope and update the Vercel env var. ' +
        `(Trello said: ${detail})`,
      );
    }
    throw new Error(`Trello card PUT ${put.status}: ${detail}`);
  }
}

/**
 * PATCH /api/trello-card, body { cardId, stage?, name?, labels? }.
 *
 * The app -> Trello half of the mirror. LL is the surface the office works;
 * Trello is the surface Anthony works, and he does not use SolarOps. So a card
 * he creates must arrive in LL untouched (the webhook), and everything done to
 * it in LL afterwards must show up on his board without him doing anything.
 *
 * Only the fields the caller actually sends are written, so a stage-only drag
 * does not rewrite the card's name or labels as a side effect. That is what
 * makes this safe to call on every job save.
 *
 * Lives on this function rather than its own file only because the Vercel
 * Hobby plan hard-caps api/ at 12 Serverless Functions and a 13th fails the
 * whole deployment (confirmed live 2026-07-21). Splitting it out is a pure
 * refactor the day the plan is upgraded.
 *
 * Signed-in callers only: this writes to the shared company board.
 */
async function handleCardPush(req: VercelRequest, res: VercelResponse) {
  if (!(await requireUser(req, res))) return;
  if (!API_KEY || !API_TOKEN) return res.status(500).json({ error: 'Trello credentials not configured' });

  const raw = await readRawBody(req);
  let body: { cardId?: string; stage?: string; name?: string; labels?: { name?: string; color?: string }[] };
  try { body = raw ? JSON.parse(raw) : (req.body ?? {}); }
  catch { return res.status(400).json({ error: 'Body is not valid JSON' }); }

  const cardId = String(body.cardId ?? '').trim();
  if (!/^[0-9a-fA-F]{24}$/.test(cardId)) return res.status(400).json({ error: 'Malformed card id' });

  // Same guard as the inbound webhook, in the outbound direction: a signed-in
  // user must not be able to rewrite an arbitrary card on someone else's board
  // using the org's token. idBoard comes from Trello, so it cannot be forged.
  // `name` is fetched in the same request because the rename below needs it.
  const card = await fetch(`${TRELLO_BASE}/cards/${cardId}?fields=idBoard,name,idList&key=${API_KEY}&token=${API_TOKEN}`);
  if (card.status === 404) return res.status(404).json({ error: 'No such Trello card' });
  if (!card.ok) return res.status(502).json({ error: `Trello card lookup ${card.status}` });
  const current = await card.json() as { idBoard?: string; name?: string; idList?: string };
  if (!isAllowedBoard(current.idBoard)) {
    console.warn('[trello-push] refused: card', cardId, 'is on board', current.idBoard);
    return res.status(403).json({ error: 'Card is not on an allowed board' });
  }

  const params: Record<string, string> = {};
  const applied: string[] = [];
  const created: string[] = [];

  // Column. An unmapped stage sends nothing rather than defaulting the card
  // somewhere, and a card already in the right list sends nothing either, which
  // is what keeps a routine save from generating a pointless webhook delivery.
  if (body.stage !== undefined) {
    const idList = listForStage(String(body.stage));
    // A `list:<id>` stage names a list the CLIENT chose. Trello's card PUT will
    // happily move a card onto a list on ANOTHER board the token can reach,
    // which would carry a customer's lead off this board entirely. So the list
    // must be confirmed as an open list on the card's own board first.
    let listOk = !!idList && !String(body.stage).startsWith('list:');
    if (idList && !listOk) {
      const l = await fetch(`${TRELLO_BASE}/lists/${idList}?fields=idBoard,closed&key=${API_KEY}&token=${API_TOKEN}`);
      const info = l.ok ? await l.json() as { idBoard?: string; closed?: boolean } : {};
      listOk = info.idBoard === current.idBoard && !info.closed;
      if (!listOk) console.warn(`[trello-push] refused list ${idList}: board ${info.idBoard}, closed ${info.closed}`);
    }
    if (!idList || !listOk) {
      console.warn(`[trello-push] stage "${body.stage}" maps to no usable Trello list, column not pushed`);
    } else if (idList !== current.idList) {
      params.idList = idList;
      applied.push(`list -> ${body.stage}`);
    }
  }

  // Name, but ONLY over a placeholder. Anthony's cards arrive named
  // "image.jpeg" because Trello fires createCard before the attachment lands,
  // and putting the real customer name on them is the single most useful thing
  // this push does for him. Overwriting a name he actually typed is the single
  // worst, so the guard is the whole feature: rename a filename, never a name.
  const wanted = String(body.name ?? '').trim();
  if (wanted && isFilename(current.name ?? '') && wanted !== current.name) {
    params.name = wanted;
    applied.push('name');
  }

  // Labels, whole-set.
  if (Array.isArray(body.labels)) {
    const labels = body.labels
      .map(l => ({ name: String(l?.name ?? '').trim(), color: String(l?.color ?? '').trim() }))
      .filter(l => l.name);
    const ids = await resolveLabelIds(current.idBoard as string, labels, created);
    // idLabels= (empty) is how Trello is told "no labels", which is why this is
    // sent even when the list is empty: dropping it would make "remove the last
    // label in LL" silently do nothing.
    params.idLabels = ids.join(',');
    applied.push(`${ids.length} label(s)`);
  }

  if (Object.keys(params).length === 0) {
    return res.status(200).json({ skipped: 'nothing to push' });
  }

  try {
    await putCard(cardId, params);
    console.info(`[trello-push] card ${cardId}: ${applied.join(', ')}${created.length ? `, created label(s) ${created.join(', ')}` : ''}`);
    return res.status(200).json({ applied, created });
  } catch (err) {
    console.error('[trello-push] failed:', err);
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Trello push failed' });
  }
}

// ── Daily convergence sweep (Vercel cron, GET ?sweep=1) ─────────────────────

/**
 * Which side's edit is newer. Within `tieMs` the two clocks cannot be trusted
 * to order the edits (Trello action dates vs browser-stamped fieldTimes), so
 * it is a 'tie' and the caller applies its tie rule.
 */
export function newerSide(trelloAt: string | undefined, llAt: string | undefined, tieMs = 120_000): 'trello' | 'll' | 'tie' {
  const t = Date.parse(trelloAt ?? '') || 0;
  const l = Date.parse(llAt ?? '') || 0;
  if (Math.abs(t - l) < tieMs) return 'tie';
  return t > l ? 'trello' : 'll';
}

const CRON_SECRET = (process.env.CRON_SECRET ?? '').trim();
/** More differences than this in one night means something systemic broke
 *  (a dead webhook, a bad deploy). Repair this many and report the rest,
 *  rather than let a sweep mass-rewrite the board on a bad day. */
const SWEEP_MAX_FIXES = 30;

/**
 * Converge the Trello board and LL once a day.
 *
 * The mirror is edge-triggered in both directions: a push that failed, a
 * webhook delivery that never arrived, a browser that was offline, or a
 * direct database repair all leave the two boards disagreeing until someone
 * happens to touch that card again. This closes that gap. Rules, identical
 * to the 2026-09-10 one-time repair:
 *   - card with no LL job  -> import it, through the webhook's own create path
 *   - column differs       -> newer edit wins; a tie goes to LL (09-03 rule)
 *   - labels differ        -> newer edit wins; a tie takes the UNION
 * Cheap by construction: one Trello call for every card, one query for every
 * job, and per-card history only for the cards that actually differ.
 */
async function handleSweep(req: VercelRequest, res: VercelResponse) {
  if (!CRON_SECRET) return res.status(503).json({ error: 'CRON_SECRET not configured' });
  const presented = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const expected = Buffer.from(CRON_SECRET);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!API_KEY || !API_TOKEN || !SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const boardId = TARGET_LISTS[0].boardId;
  const auth = `key=${API_KEY}&token=${API_TOKEN}`;
  const cardsRes = await fetch(`${TRELLO_BASE}/boards/${boardId}/cards?fields=name,idList,labels,isTemplate,desc&${auth}`);
  if (!cardsRes.ok) return res.status(502).json({ error: `Trello cards ${cardsRes.status}` });
  // Cards SolarOps made for existing service orders ("Send to Trello") are not
  // leads, so they are outside this sweep entirely: by their ref line, or by a
  // card id saved on an order. Without this the sweep would find each one with
  // no lead job and IMPORT it as a new lead, every night.
  const linkedRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=like.job:*&value->>trelloCardId=not.is.null&select=value->>trelloCardId`, { headers: supabaseHeaders });
  if (!linkedRes.ok) return res.status(502).json({ error: `Supabase linked cards ${linkedRes.status}` });
  const linkedCards = new Set((await linkedRes.json() as { trelloCardId: string }[]).map(r => r.trelloCardId));
  const cards = (await cardsRes.json() as { id: string; name: string; idList: string; labels: TrelloLabel[]; isTemplate?: boolean; desc?: string }[])
    .filter(c => !c.isTemplate && !refJobId(c.desc) && !linkedCards.has(c.id));
  const listNames = new Map((await (await fetch(`${TRELLO_BASE}/boards/${boardId}/lists?fields=name&${auth}`)).json() as { id: string; name: string }[]).map(l => [l.id, l.name]));

  const rowsRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=like.job:job-trello-*&select=value`, { headers: supabaseHeaders });
  if (!rowsRes.ok) return res.status(502).json({ error: `Supabase jobs ${rowsRes.status}` });
  const jobs = new Map((await rowsRes.json() as { value: any }[]).map(r => [String(r.value?.id ?? '').slice('job-trello-'.length), r.value]));

  const report = { cards: cards.length, imported: [] as string[], stageToLL: [] as string[], stageToTrello: [] as string[], labelsToLL: [] as string[], labelsToTrello: [] as string[], deferred: 0, errors: [] as string[] };
  let fixes = 0;
  const now = new Date().toISOString();
  const selfUrl = `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/trello-card`;

  for (const card of cards) {
    const job = jobs.get(card.id);
    const wantStage = stageForList(card.idList);
    const cardLabels = toJobLabels(card.labels);
    const stageDiff = !!job && !!wantStage && wantStage !== job.pipelineStage;
    const labelDiff = !!job && !sameLabelSet(Array.isArray(job.labels) ? job.labels : [], cardLabels);
    if (job && !stageDiff && !labelDiff) continue;
    if (fixes >= SWEEP_MAX_FIXES) { report.deferred++; continue; }
    fixes++;

    try {
      if (!job) {
        // Through the webhook itself, so there is one importer and one set of
        // parse rules. A lead found here is one nobody was told about, so the
        // new-lead notification firing is correct, not noise.
        const r = await fetch(selfUrl, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: { type: 'createCard', data: { card: { id: card.id, name: card.name }, list: { id: card.idList, name: listNames.get(card.idList) }, board: { id: boardId } } } }),
        });
        if (r.ok) report.imported.push(card.name); else report.errors.push(`import ${card.name}: ${r.status}`);
        continue;
      }

      const acts = await (await fetch(`${TRELLO_BASE}/cards/${card.id}/actions?filter=createCard,updateCard&limit=200&${auth}`)).json() as { type: string; date: string; data?: { listAfter?: unknown; old?: Record<string, unknown> } }[];
      const recTime = job.updatedAt as string | undefined;
      const next = { ...job };
      const llChanged: string[] = [];
      const trelloParams: Record<string, string> = {};

      if (stageDiff) {
        const trelloAt = acts.find(a => a.type === 'createCard' || a.data?.listAfter)?.date;
        const side = newerSide(trelloAt, job.fieldTimes?.pipelineStage ?? recTime);
        if (side === 'trello') { next.pipelineStage = wantStage; llChanged.push('pipelineStage'); report.stageToLL.push(card.name); }
        else {
          const idList = listForStage(job.pipelineStage);
          // A column whose Trello list is gone or archived has nowhere to go;
          // leave both sides alone rather than invent a destination.
          if (idList && idList !== card.idList) {
            const l = await (await fetch(`${TRELLO_BASE}/lists/${idList}?fields=idBoard,closed&${auth}`)).json() as { idBoard?: string; closed?: boolean };
            if (l.idBoard === boardId && !l.closed) { trelloParams.idList = idList; report.stageToTrello.push(card.name); }
          }
        }
      }

      if (labelDiff) {
        const trelloAt = acts.find(a => a.type === 'createCard' || (a.data?.old && 'idLabels' in a.data.old))?.date;
        const side = newerSide(trelloAt, job.fieldTimes?.labels ?? recTime);
        const llLabels: { name: string; color: string }[] = Array.isArray(job.labels) ? job.labels : [];
        const union = [...llLabels, ...cardLabels.filter(c => !llLabels.some(l => labelKey(l.name) === labelKey(c.name)))];
        const toLL = side === 'trello' ? cardLabels : side === 'tie' ? union : null;
        const toTrello = side === 'll' ? llLabels : side === 'tie' ? union : null;
        if (toLL && !sameLabelSet(llLabels, toLL)) { next.labels = toLL; llChanged.push('labels'); report.labelsToLL.push(card.name); }
        if (toTrello && !sameLabelSet(cardLabels, toTrello)) {
          trelloParams.idLabels = (await resolveLabelIds(boardId, toTrello, [])).join(',');
          report.labelsToTrello.push(card.name);
        }
      }

      if (llChanged.length) {
        stampMirroredFields(next, llChanged, now);
        const w = await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=key`, {
          method: 'POST',
          headers: { ...supabaseHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ key: `job:${job.id}`, value: next, updated_at: now }),
        });
        if (!w.ok) report.errors.push(`LL ${card.name}: ${w.status}`);
      }
      if (Object.keys(trelloParams).length) await putCard(card.id, trelloParams);
    } catch (err) {
      report.errors.push(`${card.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const summary = `imported ${report.imported.length}, stage->LL ${report.stageToLL.length}, stage->Trello ${report.stageToTrello.length}, labels->LL ${report.labelsToLL.length}, labels->Trello ${report.labelsToTrello.length}, deferred ${report.deferred}, errors ${report.errors.length}`;
  if (report.deferred > 0) console.error(`[trello-sweep] ${report.deferred} differences DEFERRED past the ${SWEEP_MAX_FIXES}-fix cap: something systemic is wrong`);
  console.info(`[trello-sweep] ${summary}`);
  return res.status(200).json({ summary, ...report });
}

/**
 * POST /api/trello-card?create=1, body { jobId, listId, name, desc }.
 *
 * Creates the Trello card for an existing service order so Anthony can follow
 * up on it. Returns { cardId, url }; the CLIENT then saves `trelloCardId` onto
 * the order through its normal save, so there is exactly one writer of the
 * job record and no server write racing a browser's per-field merge.
 */
async function handleCreateCard(req: VercelRequest, res: VercelResponse) {
  if (!(await requireUser(req, res))) return;
  if (!API_KEY || !API_TOKEN) return res.status(500).json({ error: 'Trello credentials not configured' });

  const raw = await readRawBody(req);
  let body: { jobId?: string; listId?: string; name?: string; desc?: string };
  try { body = raw ? JSON.parse(raw) : (req.body ?? {}); }
  catch { return res.status(400).json({ error: 'Body is not valid JSON' }); }

  const jobId = String(body.jobId ?? '').trim();
  const listId = String(body.listId ?? '').trim();
  const name = String(body.name ?? '').trim().slice(0, 200);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(jobId)) return res.status(400).json({ error: 'Malformed job id' });
  if (jobId.startsWith('job-trello-')) return res.status(409).json({ error: 'This lead already came from a Trello card' });
  if (!/^[0-9a-f]{24}$/i.test(listId)) return res.status(400).json({ error: 'Malformed list id' });
  if (!name) return res.status(400).json({ error: 'Card name is required' });

  // One card per order. The button disables itself while a request is in
  // flight (the Move to Client double-click family, four incidents), and this
  // catches a second send from another browser or after a reload.
  const existing = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(`job:${jobId}`)}&select=value->>trelloCardId,value->>trelloCardUrl`,
    { headers: supabaseHeaders },
  );
  const prior = existing.ok ? (await existing.json() as { trelloCardId?: string; trelloCardUrl?: string }[])[0] : undefined;
  if (prior?.trelloCardId) {
    return res.status(409).json({ error: 'This order already has a Trello card', cardId: prior.trelloCardId, url: prior.trelloCardUrl });
  }

  // The list must be an open list on the import board: the token can reach
  // other boards, and a card created there would be outside the mirror.
  const l = await fetch(`${TRELLO_BASE}/lists/${listId}?fields=idBoard,closed&key=${API_KEY}&token=${API_TOKEN}`);
  const info = l.ok ? await l.json() as { idBoard?: string; closed?: boolean } : {};
  if (!isAllowedBoard(info.idBoard) || info.closed) {
    return res.status(400).json({ error: 'That list is not an open list on the Florida board' });
  }

  // Any ref line the client sent is dropped; the server writes the only one.
  const clientDesc = String(body.desc ?? '').split('\n').filter(line => !line.startsWith(SOLAROPS_REF_LINE)).join('\n').trim();
  const desc = `${clientDesc}\n\n${SOLAROPS_REF_LINE} ${jobId}`.slice(-16000);

  const qs = new URLSearchParams({ idList: listId, name, desc, pos: 'top', key: API_KEY, token: API_TOKEN });
  const created = await fetch(`${TRELLO_BASE}/cards?${qs}`, { method: 'POST' });
  if (!created.ok) {
    const detail = await created.text().catch(() => '');
    console.error('[trello-create] failed:', created.status, detail);
    return res.status(502).json({ error: `Trello card create ${created.status}` });
  }
  const card = await created.json() as { id: string; shortUrl: string };
  console.info(`[trello-create] card ${card.id} for ${jobId} in list ${listId}`);
  return res.status(200).json({ cardId: card.id, url: card.shortUrl });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Trello HEAD-verifies the callback URL synchronously when the webhook is
  // created. Must return 2xx or registration is rejected outright.
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  // "Send to Trello" from a service order. Must run before the webhook branch:
  // both are POST, and this one is authenticated while the webhook is not.
  if (req.method === 'POST' && req.query?.create !== undefined) {
    try { return await handleCreateCard(req, res); }
    catch (err) {
      console.error('[trello-create] crashed:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'create crashed' });
    }
  }
  if (req.method === 'POST') {
    return handleLeadImportWebhook(req, res);
  }
  if (req.method === 'PATCH') {
    return handleCardPush(req, res);
  }
  // Vercel cron: GET with `Authorization: Bearer $CRON_SECRET`, which is not a
  // Supabase JWT, so this must run before the signed-in-user check below.
  if (req.method === 'GET' && req.query?.sweep !== undefined) {
    try { return await handleSweep(req, res); }
    catch (err) {
      console.error('[trello-sweep] crashed:', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'sweep crashed' });
    }
  }
  // Top-level safety net: if ANYTHING below throws, return a clean 500 instead
  // of Vercel's FUNCTION_INVOCATION_FAILED page (the previous behavior, an
  // un-stringifiable cardId array crashed before the inner try/catch ran).
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Require a signed-in caller BEFORE touching Trello. This GET proxies a card
    // back using the org's own TRELLO_API_KEY/TRELLO_API_TOKEN, so until now any
    // anonymous caller with a card id got that card's lead PII (names, phones,
    // emails, addresses mined from the description, checklists, custom fields and
    // comments) and spent org API quota doing it. Same bug, same fix, as
    // /api/solaredge on 2026-08-03. The only client call site
    // (lib/trelloImporter.ts fetchTrelloCard) already sends the token via
    // authedFetch, so this is server-side only and needs no frontend change.
    //
    // Deliberately placed AFTER the HEAD and POST branches above: Trello
    // HEAD-verifies the callback URL and POSTs the webhook unauthenticated, and
    // both must stay public. Only the GET proxy is gated here.
    if (!(await requireUser(req, res))) return;

    // ── Attachment mirror ────────────────────────────────────────────────────
    // GET ?attachment=<trello url>&customerId=<id> copies one Trello attachment
    // into our own customer-files bucket and returns its public URL.
    //
    // Why this exists: the importer used to store the raw trello.com URL on the
    // Customer record. Those URLs are NOT public, they need a Trello session with
    // access to the board. The importing user could see the file and nobody else
    // could, which read as a sync bug for months. 189 files across 54 customers
    // were stored this way (audited 2026-09-07).
    //
    // The copy happens here rather than in the browser because the download needs
    // the org's Trello OAuth credentials, which are server-side only, and because
    // returning bytes through the function would hit Vercel's ~4.5MB response cap.
    // Server to Supabase has no such limit.
    if (req.query.attachment) {
      const rawAtt = req.query.attachment;
      const rawCust = req.query.customerId;
      const attUrl = Array.isArray(rawAtt) ? rawAtt[0] : rawAtt;
      const customerId = Array.isArray(rawCust) ? rawCust[0] : rawCust;

      if (!attUrl || !customerId) {
        return res.status(400).json({ error: 'attachment and customerId are both required.' });
      }
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(customerId)) {
        return res.status(400).json({ error: 'Invalid customerId.' });
      }

      // SSRF guard. This endpoint fetches an arbitrary caller-supplied URL with
      // org credentials attached, so the host allowlist is load-bearing, not a
      // formality. Only Trello's own attachment hosts, https only.
      let parsed: URL;
      try {
        parsed = new URL(attUrl);
      } catch {
        return res.status(400).json({ error: 'attachment is not a valid URL.' });
      }
      const ALLOWED_HOSTS = ['trello.com', 'api.trello.com', 'trello-attachments.s3.amazonaws.com'];
      const hostOk = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
      if (parsed.protocol !== 'https:' || !hostOk) {
        return res.status(400).json({ error: 'attachment must be an https trello.com URL.' });
      }

      if (!API_KEY || !API_TOKEN) {
        return res.status(500).json({ error: 'Trello credentials not configured.' });
      }
      if (!SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' });
      }

      // Attachment downloads authenticate via the OAuth header. The ?key=&token=
      // query form that works for the REST API does NOT work here, it returns the
      // Trello login page as a 200 HTML body.
      let att: Response;
      try {
        att = await fetch(parsed.toString(), {
          headers: { Authorization: `OAuth oauth_consumer_key="${API_KEY}", oauth_token="${API_TOKEN}"` },
        });
      } catch (err) {
        console.error('[Trello attachment] fetch failed:', err);
        return res.status(502).json({ error: 'Could not reach Trello to download the attachment.' });
      }
      if (!att.ok) {
        return res.status(att.status).json({ error: `Trello attachment download failed (${att.status}).` });
      }

      const contentType = att.headers.get('content-type') ?? 'application/octet-stream';
      // A login/interstitial page comes back as 200 text/html. Storing that would
      // silently replace the file with a web page, which is worse than failing.
      if (/^text\/html/i.test(contentType)) {
        return res.status(502).json({ error: 'Trello returned an HTML page, not the file. Check TRELLO_API_TOKEN board access.' });
      }

      const bytes = Buffer.from(await att.arrayBuffer());
      const MAX_SIZE = 10 * 1024 * 1024; // matches the customer-files bucket limit
      if (bytes.byteLength > MAX_SIZE) {
        return res.status(413).json({ error: `Attachment too large (${Math.round(bytes.byteLength / 1024 / 1024)}MB). Max 10MB.` });
      }
      if (bytes.byteLength === 0) {
        return res.status(502).json({ error: 'Trello returned an empty file.' });
      }

      const rawName = decodeURIComponent(parsed.pathname.split('/').pop() || 'trello-file');
      const safeName = rawName.replace(/[^a-zA-Z0-9.-]/g, '_').slice(-120);
      const month = new Date().toISOString().slice(0, 7);
      const path = `${customerId}/${month}/${Date.now()}-${safeName}`;

      const up = await fetch(
        `${SUPABASE_URL}/storage/v1/object/customer-files/${encodeURI(path)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
            'Content-Type': contentType,
            'x-upsert': 'true',
          },
          body: bytes,
        },
      );
      if (!up.ok) {
        const detail = await up.text().catch(() => '');
        console.error('[Trello attachment] storage upload failed:', up.status, detail.slice(0, 300));
        return res.status(502).json({ error: `Storage upload failed (${up.status}).` });
      }

      return res.status(200).json({
        url: `${SUPABASE_URL}/storage/v1/object/public/customer-files/${encodeURI(path)}`,
        name: rawName,
        mimeType: contentType,
        size: bytes.byteLength,
      });
    }

    // GET ?image=<cardId> : the lead's screenshot (the card's first image),
    // streamed from Trello on demand for the LeadPanel. Deliberately NOT
    // copied into our storage: the customer-files bucket is public (open item
    // since 2026-08-23) and these screenshots are lead emails, i.e. names,
    // phones and addresses. Streaming keeps them behind the signed-in check
    // above and stores nothing. Trello attachment URLs do not open without a
    // Trello login, which is why LL could not show the source at all before.
    if (req.query.image !== undefined) {
      const imgCard = String(Array.isArray(req.query.image) ? req.query.image[0] : req.query.image);
      if (!/^[0-9a-f]{24}$/i.test(imgCard)) return res.status(400).json({ error: 'Malformed card id' });
      if (!API_KEY || !API_TOKEN) return res.status(500).json({ error: 'Trello credentials not configured' });
      // Same board guard as every other path: our token can read cards on
      // boards that are not ours, and this must not become a way to use it so.
      const c = await fetch(`${TRELLO_BASE}/cards/${imgCard}?fields=idBoard&key=${API_KEY}&token=${API_TOKEN}`);
      if (c.status === 404) return res.status(404).json({ error: 'No such card' });
      const { idBoard } = c.ok ? await c.json() as { idBoard?: string } : {};
      if (!isAllowedBoard(idBoard)) return res.status(403).json({ error: 'Card is not on an allowed board' });
      const img = await fetchFirstImageAttachment(imgCard);
      if (!img) return res.status(404).json({ error: 'No image on this card' });
      const bytes = Buffer.from(img.base64, 'base64');
      // Vercel caps a function response at 4.5 MB.
      if (bytes.byteLength > 4_000_000) return res.status(413).json({ error: 'Image too large to preview' });
      res.setHeader('Content-Type', img.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.status(200).send(bytes);
    }

    // GET ?lists=1 : the board's lists, in Trello's order, each with the LL
    // stage it maps to. The LL kanban draws its columns from this, so a list
    // added or renamed in Trello shows up in LL on the next load with no code
    // change (user decision 2026-09-10). Closed lists are included, flagged, so
    // LL can keep showing a column that still holds cards rather than hide them.
    if (req.query.lists !== undefined) {
      if (!API_KEY || !API_TOKEN) return res.status(500).json({ error: 'Trello credentials not configured' });
      const boardId = TARGET_LISTS[0].boardId;
      const r = await fetch(`${TRELLO_BASE}/boards/${boardId}/lists?filter=all&fields=name,closed,pos&key=${API_KEY}&token=${API_TOKEN}`);
      if (!r.ok) return res.status(502).json({ error: `Trello lists ${r.status}` });
      const lists = await r.json() as { id: string; name: string; closed: boolean; pos: number }[];
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.status(200).json({
        boardId,
        lists: lists
          .sort((a, b) => a.pos - b.pos)
          .map(l => ({ id: l.id, name: l.name, closed: l.closed, stage: stageForList(l.id) })),
      });
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
