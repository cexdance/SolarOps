// Client numbers (US-1XXXX): the ONE way a number reaches a customer.
//
// Allocation lives in Postgres (public.client_numbers, primary key on the
// number), not in the Google Sheet and not in any count this app keeps. Until
// 2026-09-11 two allocators handed out the same numbers without talking to each
// other: the sheet's "first blank row" and the Create Customer modal's own
// highest-number + 1. Cherrington took US-15703 through the modal while the
// sheet still showed it blank, and every lead conversion after that was offered
// US-15703 and refused. Before that the same gap gave Daniel Torres and Taylor
// Williams two numbers each. See supabase/migrations/20260911_client_numbers.sql.
//
// Every path that puts a number on a customer calls assignClientNumber():
// converting a lead, creating a customer, the edit form's claim button, and a
// number typed by hand. After the save lands, bindClientNumber() ties the number
// to the customer; if the save does not land, releaseAssignedNumber() gives it
// back so the numbering stays consecutive.
//
// The sheet is a mirror. Each number is written into it for the office. A name
// somebody typed into the sheet by hand is recorded as that number's owner and
// the next number is taken, so a person is never overwritten.

import { supabase } from './supabase';
import { stampSheetRow, clearSheetRow, sheetRegistryConfigured } from './clientRegistry';

/** A reason a number cannot be assigned, worded for the operator. Blocks the save. */
export class ClientNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientNumberError';
  }
}

// ── Same-person test ───────────────────────────────────────────────────────
// KEEP IN STEP with public.client_name_key / public.same_client_name in the
// migration. Both sides are tested against the same case list.

/** The part of a registry name that identifies the person. */
export function clientNameKey(s: string | null | undefined): string {
  let k = (s ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // José -> JOSE
  k = k.replace(/^\s*US[\s-]*[0-9]+\s*/, '');                         // "US-15655 Shellie Blum"
  k = k.replace(/^\s*CLIENT\s*:\s*/, '');                              // "Client: Linda Mclaughlin"
  k = k.replace(/\s*(POWER\s*CARE|PWC|CASE\s*(#|NUMBER|NO)).*$/, '');  // "... POWERCARE: 6539891"
  k = k.replace(/[^A-Z]+/g, ' ');
  return k.trim();
}

/** Do two registry names refer to the same client, as the sheet writes them? */
export function sameClientName(a: string | null | undefined, b: string | null | undefined): boolean {
  const ra = (a ?? '').trim().toUpperCase();
  const rb = (b ?? '').trim().toUpperCase();
  // Identical text is the same person even when the key strips to nothing: a
  // customer literally named "US-15015" keys to '' and must still match itself.
  if (ra && ra === rb) return true;
  const x = clientNameKey(a);
  const y = clientNameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "Knoles" is "David Knoles"; a whole-word match of at least 5 letters, so a
  // bare "Ann" does not swallow "Ann Smith".
  const within = (short: string, long: string) => short.length >= 5 && ` ${long} `.includes(` ${short} `);
  return within(x, y) || within(y, x);
}

// ── Dependencies (injectable, so the flow is testable without a network) ───

interface ReserveResult {
  ok: boolean;
  reason?: 'format' | 'customer' | 'registry';
  client_id?: string;
  holder_name?: string;
  holder_customer_id?: string | null;
}

export interface ClientNumberDeps {
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
  stampSheet(name: string, clientId: string): Promise<{ clientId: string; name: string; taken?: boolean } | null>;
  clearSheet(clientId: string, name: string): Promise<boolean>;
  sheetConfigured(): boolean;
}

const liveDeps: ClientNumberDeps = {
  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new ClientNumberError(`Could not reach the client number registry (${fn}): ${error.message}`);
    return data as T;
  },
  stampSheet: stampSheetRow,
  clearSheet: clearSheetRow,
  sheetConfigured: sheetRegistryConfigured,
};

// ── Assign ─────────────────────────────────────────────────────────────────

/** How many fresh numbers to try before giving up. Never a loop. */
export const MAX_CLAIM_ATTEMPTS = 5;

export interface AssignRequest {
  name: string;
  /** A number the record already carries: typed by hand, or on a SolarEdge lead. */
  requested?: string;
  /** Customers this browser holds, to catch one it has not pushed yet. */
  customers: ReadonlyArray<{ id: string; name: string; clientId?: string }>;
  /** The customer being edited, so its own number is not "someone else's". */
  selfCustomerId?: string;
  source: 'convert' | 'create' | 'edit';
}

export interface Assigned {
  clientId: string;
  /** The name the number was taken under; releasing needs it. */
  name: string;
  /** The sheet row now holds our name, so a release must clear it too. */
  mirrored: boolean;
  /** Set when the number is valid but the sheet could not be written. */
  warning?: string;
}

const normId = (s: string | undefined) => (s ?? '').trim().toUpperCase();

/** Write the number into the sheet. Only a hand-typed OTHER name comes back as `takenBy`. */
async function mirror(deps: ClientNumberDeps, clientId: string, name: string): Promise<{ mirrored: boolean; takenBy?: string; warning?: string }> {
  try {
    const res = await deps.stampSheet(name, clientId);
    if (!res) return { mirrored: false };
    if (res.taken && !sameClientName(res.name, name)) return { mirrored: false, takenBy: res.name };
    return { mirrored: !res.taken };
  } catch (err) {
    return {
      mirrored: false,
      warning: `${clientId} is assigned, but the registry sheet could not be updated (${(err as Error).message}). The nightly check will fill it in.`,
    };
  }
}

/**
 * Put a client number on a customer: the one entry point. Throws
 * ClientNumberError, worded for the operator, whenever the save must not go
 * ahead. Nothing is created when it throws.
 */
export async function assignClientNumber(req: AssignRequest, deps: ClientNumberDeps = liveDeps): Promise<Assigned> {
  const name = req.name.trim();
  if (!name) throw new ClientNumberError('Enter the customer name first: a client number is always assigned to a name.');
  const requested = normId(req.requested);
  return requested ? reserveRequested(req, name, requested, deps) : claimNext(req, name, deps);
}

async function reserveRequested(req: AssignRequest, name: string, clientId: string, deps: ClientNumberDeps): Promise<Assigned> {
  const res = await deps.rpc<ReserveResult>('reserve_client_number', {
    p_client_id: clientId,
    p_name: name,
    p_customer_id: req.selfCustomerId ?? null,
    p_source: req.source,
  });
  if (!res.ok) {
    if (res.reason === 'format') {
      throw new ClientNumberError(`"${clientId}" is not a client number. Use the US-15XXX form, or leave it empty to get the next one.`);
    }
    const where = res.reason === 'customer' ? 'in SolarOps' : 'in the client registry';
    throw new ClientNumberError(`${clientId} already belongs to "${res.holder_name || 'another client'}" ${where}. Use a different number, or leave it empty to get the next one.`);
  }
  // This browser may hold a customer on it that the database has not seen yet.
  const local = req.customers.find(c => normId(c.clientId) === clientId && c.id !== req.selfCustomerId);
  if (local) {
    await deps.rpc('release_client_number', { p_client_id: clientId, p_expect_name: name }).catch(() => undefined);
    throw new ClientNumberError(`${clientId} already belongs to "${local.name}" in SolarOps. Use a different number, or leave it empty to get the next one.`);
  }
  const m = await mirror(deps, clientId, name);
  if (m.takenBy) {
    // Someone typed a different person onto that row by hand. That is a claim
    // on the number: record it, and refuse this one rather than overwrite them.
    await deps.rpc('relabel_client_number', {
      p_client_id: clientId, p_expect_name: name, p_name: m.takenBy, p_customer_id: null, p_source: 'sheet-manual',
    }).catch(() => undefined);
    throw new ClientNumberError(`The registry sheet lists ${clientId} as "${m.takenBy}". Correct the sheet, or leave the number empty to get the next one.`);
  }
  return { clientId, name, mirrored: m.mirrored, warning: m.warning };
}

async function claimNext(req: AssignRequest, name: string, deps: ClientNumberDeps): Promise<Assigned> {
  for (let attempt = 1; attempt <= MAX_CLAIM_ATTEMPTS; attempt++) {
    const clientId = normId(await deps.rpc<string>('claim_client_number', { p_name: name, p_source: req.source }));

    // The database already skips every number a synced customer carries. A
    // customer only this browser holds (not pushed yet) is the one gap left:
    // record the real owner, show it in the sheet, and take the next number.
    const owner = req.customers.find(c => normId(c.clientId) === clientId && c.id !== req.selfCustomerId);
    if (owner) {
      await deps.rpc('relabel_client_number', {
        p_client_id: clientId, p_expect_name: name, p_name: owner.name, p_customer_id: owner.id, p_source: 'audit-app',
      });
      await mirror(deps, clientId, owner.name);
      continue;
    }

    const m = await mirror(deps, clientId, name);
    if (m.takenBy) {
      // A name typed into the sheet by hand owns this number. Record it and move on.
      await deps.rpc('relabel_client_number', {
        p_client_id: clientId, p_expect_name: name, p_name: m.takenBy, p_customer_id: null, p_source: 'sheet-manual',
      });
      continue;
    }
    return { clientId, name, mirrored: m.mirrored, warning: m.warning };
  }
  throw new ClientNumberError(
    `Could not find a free client number after ${MAX_CLAIM_ATTEMPTS} tries: the registry and the sheet disagree more than expected. Nothing was assigned. An admin needs to check the client registry.`,
  );
}

// ── After the save ─────────────────────────────────────────────────────────

/** Tie the number to the customer that was saved with it. Best effort: the nightly check binds any it misses. */
export async function bindClientNumber(clientId: string, customerId: string, deps: ClientNumberDeps = liveDeps): Promise<void> {
  try {
    await deps.rpc('bind_client_number', { p_client_id: clientId, p_customer_id: customerId });
  } catch (err) {
    console.warn('[clientNumbers] bind failed; the nightly check will bind it', err);
  }
}

/**
 * Give a number back because the save it was for did not happen.
 *
 * The sheet goes first: if its row cannot be cleared, the number stays taken in
 * the database too, so the two never disagree about it (a leaked number is a gap;
 * a number that is free in one and taken in the other is the bug this module
 * exists to prevent). The database side only deletes an unbound claim still
 * under exactly this name, so it can never free a number a customer holds.
 */
export async function releaseAssignedNumber(a: Assigned, deps: ClientNumberDeps = liveDeps): Promise<boolean> {
  if (a.mirrored && deps.sheetConfigured()) {
    const cleared = await deps.clearSheet(a.clientId, a.name);
    if (!cleared) return false;
  }
  try {
    return await deps.rpc<boolean>('release_client_number', { p_client_id: a.clientId, p_expect_name: a.name });
  } catch {
    return false;
  }
}
