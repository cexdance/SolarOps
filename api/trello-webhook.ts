/**
 * SolarOps, Trello Lead Auto-Import Webhook
 *
 * Trello calls this on every board action. When a card is created directly in,
 * or moved into, a configured "leads" list, it is mirrored into Lead Lobby as
 * a Lead (source: Trello, leadType: service) so sales sees it without anyone
 * manually pasting the card URL.
 *
 * GET/HEAD -> 200 (Trello verifies the callback URL this way when the webhook
 * is registered; must succeed synchronously or registration is rejected).
 * POST     -> Trello board-action payload, see handler below.
 *
 * ponytail: no HMAC signature verification. Trello signs webhook deliveries
 * with the app's OAuth secret, which is not currently in Vercel env (only the
 * API key + token are). Without it this endpoint trusts any POST whose action
 * matches a known board+list id pair, both unguessable 24-hex-char Trello ids,
 * not the URL. Worst case an attacker who somehow learns those ids could POST
 * spam Lead rows, never destructive, never touches existing data. Upgrade path:
 * once TRELLO_API_SECRET is set, verify X-Trello-Webhook = HMAC-SHA1(rawBody +
 * callbackURL, secret) before processing.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const TRELLO_BASE = 'https://api.trello.com/1';
const API_KEY   = (process.env.TRELLO_API_KEY   || process.env.VITE_TRELLO_API_KEY || '').trim();
const API_TOKEN = (process.env.TRELLO_API_TOKEN || process.env.VITE_TRELLO_TOKEN   || '').trim();

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

async function fetchCard(cardId: string): Promise<{ name: string; desc: string; shortUrl: string }> {
  const url = `${TRELLO_BASE}/cards/${cardId}?key=${API_KEY}&token=${API_TOKEN}&fields=name,desc,shortUrl`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Trello card fetch ${res.status}`);
  return res.json();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Trello HEAD-verifies the callback URL synchronously when the webhook is
  // created. Must return 2xx or registration is rejected outright.
  if (req.method === 'HEAD' || req.method === 'GET') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const card = await fetchCard(cardId);
    const { firstName, lastName } = splitName(card.name);
    const { phone, email } = extractContact(`${card.name}\n${card.desc}`);

    // Deterministic id from the card, so a duplicate delivery (Trello does
    // occasionally redeliver) or a card that moves through this list twice
    // overwrites the same Lead instead of creating a second one.
    const leadId = `lead-trello-${cardId}`;
    const now = new Date().toISOString();
    const lead = {
      id: leadId,
      firstName, lastName, phone, email,
      address: '', city: '', state: '', zip: '',
      status: 'new',
      source: 'other',
      customSource: `Trello: ${target.label}`,
      priority: 'medium',
      score: 50,
      leadType: 'service',
      createdAt: now,
      updatedAt: now,
      notes: card.desc.trim() || `Auto-imported from Trello card "${card.name}"`,
      trelloBackupUrl: card.shortUrl,
    };

    // Read-modify-write against the live row. Remove any existing row with
    // this deterministic id first, then append, so repeat deliveries are a
    // no-op overwrite rather than a growing duplicate.
    const selectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?key=eq.${CRM_KEY}&select=value`,
      { headers: supabaseHeaders },
    );
    if (!selectRes.ok) throw new Error(`Supabase read ${selectRes.status}`);
    const rows = await selectRes.json() as { value?: { leads?: unknown[] } }[];
    const current = rows[0]?.value ?? { leads: [] };
    const leads = Array.isArray(current.leads) ? current.leads : [];
    const nextLeads = [lead, ...leads.filter((l: any) => l?.id !== leadId)];
    const nextValue = { ...current, leads: nextLeads };

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
      throw new Error(`Supabase upsert ${upsertRes.status}: ${detail}`);
    }

    console.info(`[trello-webhook] imported lead ${leadId} (${firstName} ${lastName}) from ${target.label}`);
    return res.status(200).json({ imported: leadId });
  } catch (err) {
    console.error('[trello-webhook] error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'trello-webhook crashed' });
  }
}
