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
 * ponytail: the POST branch has no HMAC signature verification. Trello signs
 * webhook deliveries with the app's OAuth secret, which is not currently in
 * Vercel env (only the API key + token are). Without it this endpoint trusts
 * any POST whose action names a known board+list id pair, both unguessable
 * 24-hex-char Trello ids, not the URL. Worst case an attacker who somehow
 * learns those ids could POST spam Lead rows, never destructive, never
 * touches existing data. Upgrade path: once TRELLO_API_SECRET is set, verify
 * X-Trello-Webhook = HMAC-SHA1(rawBody + callbackURL, secret) before
 * processing.
 *
 * Credentials required:
 *   - TRELLO_API_KEY (set via Vercel env)
 *   - TRELLO_API_TOKEN (set via Vercel env)
 *   - SUPABASE_SERVICE_ROLE_KEY (POST branch only, writes Lead Lobby directly)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractLeadFromImage, type ParsedLead } from './parse-lead-image';

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

const CRM_KEY = 'solarflow_crm_data';

// Boards/lists that feed Lead Lobby. "Conexsol Florida Services" is the
// template the company is standardizing on for other states; add a row per
// state's board+list once its board exists, rather than one hardcoded pair.
const TARGET_LISTS: { boardId: string; listId: string; label: string }[] = [
  { boardId: '6a5a58e06fbf97144b5d96c9', listId: '6a5a58e06fbf97144b5d96be', label: 'FL: Leads Services SolarEdge' },
];

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

export function extractContact(text: string): { phone: string; email: string } {
  const phoneMatch = text.match(PHONE_REGEX);
  const emailMatch = text.match(EMAIL_REGEX);
  let phone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '';
  if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1);
  if (phone.length !== 10) phone = '';
  return { phone, email: emailMatch ? emailMatch[0] : '' };
}

async function fetchCardForLeadImport(cardId: string): Promise<{ name: string; desc: string; shortUrl: string }> {
  const url = `${TRELLO_BASE}/cards/${cardId}?key=${API_KEY}&token=${API_TOKEN}&fields=name,desc,shortUrl`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Trello card fetch ${res.status}`);
  return res.json();
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
 * Add the Lead to Lead Lobby, unless this card was already imported.
 *
 * CREATE-IF-ABSENT, deliberately not an overwrite. Trello redelivers, and a
 * card dragged out of the list and back fires again. By then the team may have
 * edited the Lead (added a phone, changed status, routed it). Re-importing the
 * card's original values on top of that would silently undo their work, so an
 * already-imported card is left completely alone.
 */
async function upsertLead(leadId: string, lead: unknown, now: string): Promise<'created' | 'exists'> {
  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=eq.${CRM_KEY}&select=value`,
    { headers: supabaseHeaders },
  );
  if (!selectRes.ok) throw new Error(`Supabase read ${selectRes.status}`);
  const rows = await selectRes.json() as { value?: { leads?: unknown[] } }[];
  const current = rows[0]?.value ?? { leads: [] };
  const leads = Array.isArray(current.leads) ? current.leads : [];

  if (leads.some((l: any) => l?.id === leadId)) return 'exists';

  const nextValue = { ...current, leads: [lead, ...leads] };
  const upsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?on_conflict=key`,
    {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: CRM_KEY, value: nextValue, updated_at: now }),
    },
  );
  if (!upsertRes.ok) {
    const detail = await upsertRes.text().catch(() => '');
    throw new Error(`Supabase lead upsert ${upsertRes.status}: ${detail}`);
  }
  return 'created';
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
    const action = (req.body as { action?: TrelloWebhookAction })?.action;
    if (!action?.data?.card) return res.status(200).json({ skipped: 'no card in payload' });

    const target = matchTargetList(action);
    if (!target) return res.status(200).json({ skipped: 'not a create/move into a tracked leads list' });

    if (!API_KEY || !API_TOKEN || !SERVICE_ROLE_KEY) {
      console.error('[trello-webhook] missing credentials', { hasKey: !!API_KEY, hasToken: !!API_TOKEN, hasServiceRole: !!SERVICE_ROLE_KEY });
      return res.status(500).json({ error: 'Server not configured' });
    }

    const cardId = action.data.card.id;
    const card = await fetchCardForLeadImport(cardId);
    const nameIsFile = isFilename(card.name);

    // A filename-titled card ("image.jpeg") carries the lead's details inside the
    // dropped screenshot, so read them off the image with Claude Vision.
    // ponytail: only for filename cards, a real named card is trusted as-is.
    // Ceiling: re-runs if Trello redelivers the same card (one cheap Haiku call);
    // pre-check lead existence before this call if that ever matters.
    let vision: Partial<ParsedLead> = {};
    if (nameIsFile) {
      try {
        const img = await fetchFirstImageAttachment(cardId);
        if (img) vision = await extractLeadFromImage(img.base64, img.mimeType);
      } catch (err) {
        console.warn('[trello-webhook] vision parse failed, using card text:', err);
      }
    }

    const textName = nameIsFile ? { firstName: '', lastName: '' } : splitName(card.name);
    const textContact = extractContact(`${card.name}\n${card.desc}`);
    const firstName = (vision.firstName || '').trim() || textName.firstName;
    const lastName  = (vision.lastName  || '').trim() || textName.lastName;
    const phone     = (vision.phone     || '').trim() || textContact.phone;
    const email     = (vision.email     || '').trim() || textContact.email;
    const address   = (vision.address   || '').trim();
    const city      = (vision.city      || '').trim();
    const state     = (vision.state     || '').trim();
    const zip       = (vision.zip       || '').trim();

    // Deterministic ids from the card id, so a redelivery resolves to the same
    // records and the create-if-absent checks above can recognise them.
    const leadId = `lead-trello-${cardId}`;
    const jobId  = `job-trello-${cardId}`;
    const now = new Date().toISOString();
    // Still no name (vision failed, plain image)? Fall back to the phone so the
    // team can see who to call, never "image.jpeg".
    const displayName =
      `${firstName} ${lastName}`.trim() ||
      (phone ? formatPhone(phone) : 'New Lead (Trello)');
    const extraNote = [
      vision.contractName?.trim() && `Contract: ${vision.contractName.trim()}`,
      vision.hsId?.trim() && `HS_ID: ${vision.hsId.trim()}`,
      vision.notes?.trim(),
    ].filter(Boolean).join('\n');
    const cardNote = [card.desc.trim(), extraNote].filter(Boolean).join('\n').trim()
      || `Auto-imported from Trello card "${card.name}"`;

    const lead = {
      id: leadId,
      firstName, lastName, phone, email,
      address, city, state, zip,
      status: 'new',
      source: 'other',
      customSource: `Trello: ${target.label}`,
      priority: 'medium',
      score: 50,
      leadType: 'service',
      createdAt: now,
      updatedAt: now,
      notes: cardNote,
      trelloBackupUrl: card.shortUrl,
    };

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
      pipelineStage: 'leads',
      // Empty, not today's date: the calendar buckets these via parseDateSafe
      // into "unscheduled" rather than dropping an unqualified lead onto today.
      scheduledDate: '',
      scheduledTime: '',
      notes: `${cardNote}\n\nTrello card: ${card.shortUrl}`,
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

    const [leadResult, jobResult] = await Promise.all([
      upsertLead(leadId, lead, now),
      upsertLeadJob(jobId, job, now),
    ]);

    console.info(`[trello-webhook] ${target.label}: lead ${leadId} ${leadResult}, job ${jobId} ${jobResult} (${displayName})`);
    return res.status(200).json({ lead: { id: leadId, result: leadResult }, job: { id: jobId, result: jobResult } });
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
