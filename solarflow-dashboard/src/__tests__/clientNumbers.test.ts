// Client numbers have ONE allocator (Postgres) and the sheet is a mirror.
//
// These tests drive assignClientNumber() through fake dependencies, so every
// branch runs without a network: the database calls and the sheet calls are
// recorded and asserted on. The SQL functions themselves were tested against the
// live database in a rolled-back transaction (see the 2026-09-11 note); the
// name-matching cases below are the same list that test ran, so the TypeScript
// and SQL matchers cannot drift apart unnoticed.
import { describe, it, expect } from 'vitest';
import {
  assignClientNumber, releaseAssignedNumber, sameClientName, clientNameKey,
  ClientNumberError, MAX_CLAIM_ATTEMPTS, type ClientNumberDeps,
} from '../lib/clientNumbers';
import { clientIdChangeConflict } from '../lib/leadConvert';

type Call = { fn: string; args: Record<string, unknown> };

interface FakeOpts {
  /** Numbers claim_client_number hands out, in order. */
  claims?: string[];
  reserve?: Record<string, unknown>;
  /** Sheet row contents by number; absent = blank row. */
  sheet?: Record<string, string>;
  sheetThrows?: boolean;
  sheetConfigured?: boolean;
  clearSheetResult?: boolean;
  rpcThrows?: boolean;
}

function fakeDeps(o: FakeOpts = {}) {
  const calls: Call[] = [];
  const stamps: Array<{ name: string; clientId: string }> = [];
  const clears: Array<{ clientId: string; name: string }> = [];
  const claims = [...(o.claims ?? [])];
  const sheet = { ...(o.sheet ?? {}) };
  const deps: ClientNumberDeps = {
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ fn, args });
      if (o.rpcThrows) throw new ClientNumberError(`Could not reach the client number registry (${fn}): boom`);
      if (fn === 'claim_client_number') {
        const next = claims.shift();
        if (!next) throw new Error('test ran out of claims');
        return next as unknown as T;
      }
      if (fn === 'reserve_client_number') return (o.reserve ?? { ok: true }) as T;
      if (fn === 'release_client_number') return true as unknown as T;
      return true as unknown as T;
    },
    async stampSheet(name, clientId) {
      stamps.push({ name, clientId });
      if (o.sheetThrows) throw new Error('Registry is busy, try again in a moment.');
      const held = sheet[clientId];
      if (held && held.trim().toUpperCase() !== name.trim().toUpperCase()) return { clientId, name: held, taken: true };
      sheet[clientId] = name;
      return { clientId, name };
    },
    async clearSheet(clientId, name) {
      clears.push({ clientId, name });
      return o.clearSheetResult ?? true;
    },
    sheetConfigured: () => o.sheetConfigured ?? true,
  };
  return { deps, calls, stamps, clears, sheet, fns: () => calls.map(c => c.fn) };
}

const cherrington = { id: 'cust-1789141284014-lbekty', name: 'Cherrington', clientId: 'US-15703' };

describe('assignClientNumber: a fresh number', () => {
  it('REPLAY 2026-09-11: never hands out a number a customer already carries', async () => {
    // Cherrington took US-15703 by a route the registry never heard about.
    // Converting Arlyn Pabon must land on US-15704, and the sheet must end up
    // saying Cherrington on 15703 and Arlyn on 15704.
    const f = fakeDeps({ claims: ['US-15703', 'US-15704'] });
    const a = await assignClientNumber({ name: 'Arlyn Pabon', customers: [cherrington], source: 'convert' }, f.deps);

    expect(a.clientId).toBe('US-15704');
    expect(a.mirrored).toBe(true);
    expect(f.calls.find(c => c.fn === 'relabel_client_number')?.args).toMatchObject({
      p_client_id: 'US-15703', p_expect_name: 'Arlyn Pabon', p_name: 'Cherrington', p_customer_id: cherrington.id,
    });
    expect(f.sheet['US-15703']).toBe('Cherrington');
    expect(f.sheet['US-15704']).toBe('Arlyn Pabon');
    // The one thing that must never happen: Arlyn written onto Cherrington's row.
    expect(f.stamps).not.toContainEqual({ name: 'Arlyn Pabon', clientId: 'US-15703' });
  });

  it('takes the next number when the sheet shows a name typed there by hand', async () => {
    const f = fakeDeps({ claims: ['US-15704', 'US-15705'], sheet: { 'US-15704': 'Joe Manual' } });
    const a = await assignClientNumber({ name: 'Arlyn Pabon', customers: [], source: 'convert' }, f.deps);

    expect(a.clientId).toBe('US-15705');
    expect(f.calls.find(c => c.fn === 'relabel_client_number')?.args).toMatchObject({
      p_client_id: 'US-15704', p_name: 'Joe Manual', p_customer_id: null, p_source: 'sheet-manual',
    });
    expect(f.sheet['US-15704']).toBe('Joe Manual'); // never overwritten
  });

  it('treats the same person spelled the sheet way as the same person', async () => {
    const f = fakeDeps({ claims: ['US-15704'], sheet: { 'US-15704': 'US-15704 Arlyn Pabon POWERCARE: 7162665' } });
    const a = await assignClientNumber({ name: 'Arlyn Pabon', customers: [], source: 'convert' }, f.deps);
    expect(a.clientId).toBe('US-15704');
    expect(f.fns()).not.toContain('relabel_client_number');
  });

  it(`gives up after ${MAX_CLAIM_ATTEMPTS} collisions instead of looping`, async () => {
    const many = Array.from({ length: 20 }, (_, i) => `US-${15704 + i}`);
    const sheet = Object.fromEntries(many.map(n => [n, `Someone ${n}`]));
    const f = fakeDeps({ claims: many, sheet });
    await expect(assignClientNumber({ name: 'Arlyn Pabon', customers: [], source: 'convert' }, f.deps))
      .rejects.toBeInstanceOf(ClientNumberError);
    expect(f.fns().filter(fn => fn === 'claim_client_number')).toHaveLength(MAX_CLAIM_ATTEMPTS);
  });

  it('still assigns when the sheet is down, and says so', async () => {
    const f = fakeDeps({ claims: ['US-15704'], sheetThrows: true });
    const a = await assignClientNumber({ name: 'Arlyn Pabon', customers: [], source: 'convert' }, f.deps);
    expect(a.clientId).toBe('US-15704');
    expect(a.mirrored).toBe(false);
    expect(a.warning).toMatch(/could not be updated/);
  });

  it('fails closed when the registry itself cannot be reached', async () => {
    const f = fakeDeps({ rpcThrows: true });
    await expect(assignClientNumber({ name: 'Arlyn Pabon', customers: [], source: 'convert' }, f.deps))
      .rejects.toThrow(/Could not reach the client number registry/);
    expect(f.stamps).toHaveLength(0);
  });

  it('refuses an empty name before touching anything', async () => {
    const f = fakeDeps({ claims: ['US-15704'] });
    await expect(assignClientNumber({ name: '   ', customers: [], source: 'create' }, f.deps))
      .rejects.toBeInstanceOf(ClientNumberError);
    expect(f.calls).toHaveLength(0);
  });

  it('does not count the customer being edited as someone else', async () => {
    const self = { id: 'cust-self', name: 'Arlyn Pabon', clientId: 'US-15704' };
    const f = fakeDeps({ claims: ['US-15704'] });
    const a = await assignClientNumber({ name: 'Arlyn Pabon', customers: [self], selfCustomerId: 'cust-self', source: 'edit' }, f.deps);
    expect(a.clientId).toBe('US-15704');
  });
});

describe('assignClientNumber: a number the record already carries', () => {
  it('refuses a number another client holds, without writing to the sheet', async () => {
    const f = fakeDeps({ reserve: { ok: false, reason: 'customer', holder_name: 'Cherrington' } });
    await expect(assignClientNumber({ name: 'Arlyn Pabon', requested: 'us-15703 ', customers: [], source: 'convert' }, f.deps))
      .rejects.toThrow(/US-15703 already belongs to "Cherrington"/);
    expect(f.stamps).toHaveLength(0);
    expect(f.calls[0].args).toMatchObject({ p_client_id: 'US-15703' }); // normalised
  });

  it('BLOCKS when the sheet lists a different person on it (no "convert anyway")', async () => {
    const f = fakeDeps({ sheet: { 'US-15710': 'Joe Manual' } });
    await expect(assignClientNumber({ name: 'Arlyn Pabon', requested: 'US-15710', customers: [], source: 'convert' }, f.deps))
      .rejects.toThrow(/sheet lists US-15710 as "Joe Manual"/);
    // ...and records Joe as the owner rather than leaving the database disagreeing.
    expect(f.calls.find(c => c.fn === 'relabel_client_number')?.args).toMatchObject({ p_name: 'Joe Manual', p_source: 'sheet-manual' });
    expect(f.sheet['US-15710']).toBe('Joe Manual');
  });

  it('refuses a number a customer only this browser holds, and gives it back', async () => {
    const local = { id: 'cust-unsynced', name: 'Local Only', clientId: 'US-15710' };
    const f = fakeDeps();
    await expect(assignClientNumber({ name: 'Arlyn Pabon', requested: 'US-15710', customers: [local], source: 'create' }, f.deps))
      .rejects.toThrow(/Local Only/);
    expect(f.fns()).toContain('release_client_number');
    expect(f.stamps).toHaveLength(0);
  });

  it('explains a malformed number', async () => {
    const f = fakeDeps({ reserve: { ok: false, reason: 'format' } });
    await expect(assignClientNumber({ name: 'Arlyn Pabon', requested: '15710', customers: [], source: 'edit' }, f.deps))
      .rejects.toThrow(/not a client number/);
  });

  it('accepts a free number and mirrors it', async () => {
    const f = fakeDeps();
    const a = await assignClientNumber({ name: 'Arlyn Pabon', requested: 'US-15710', customers: [], source: 'edit' }, f.deps);
    expect(a).toMatchObject({ clientId: 'US-15710', mirrored: true });
    expect(f.sheet['US-15710']).toBe('Arlyn Pabon');
  });
});

describe('releaseAssignedNumber', () => {
  const a = { clientId: 'US-15704', name: 'Arlyn Pabon', mirrored: true };

  it('clears the sheet first, then the database', async () => {
    const f = fakeDeps();
    expect(await releaseAssignedNumber(a, f.deps)).toBe(true);
    expect(f.clears).toEqual([{ clientId: 'US-15704', name: 'Arlyn Pabon' }]);
    expect(f.fns()).toEqual(['release_client_number']);
  });

  it('keeps the number taken everywhere if the sheet cannot be cleared', async () => {
    // A number free in one place and taken in the other is the bug; a gap is not.
    const f = fakeDeps({ clearSheetResult: false });
    expect(await releaseAssignedNumber(a, f.deps)).toBe(false);
    expect(f.fns()).not.toContain('release_client_number');
  });

  it('skips the sheet when it never held our name', async () => {
    const f = fakeDeps();
    await releaseAssignedNumber({ ...a, mirrored: false }, f.deps);
    expect(f.clears).toHaveLength(0);
    expect(f.fns()).toEqual(['release_client_number']);
  });
});

describe('sameClientName (same case list as the SQL test)', () => {
  const same: Array<[string, string]> = [
    ['US-15655 Shellie Blum', 'Shellie Blum'],
    ['Ruben Montoya  POWERCARE: 6539891', 'Ruben Montoya'],
    ['José Calderon', 'Jose Calderon'],
    ['Knoles', 'David Knoles'],
    ['Client: Linda Mclaughlin  POWERCARE: 6777161', 'Linda Mclaughlin'],
    ['US-15015', 'US-15015'],
    ['Leticia Torres Ayala  Powercare Case Number: 6055813', 'Leticia Torres Ayala'],
  ];
  const different: Array<[string, string]> = [
    ['Yvan Cardenas POWERCARE: 6599011', 'Gregorio Cardenas'],
    ['Carlos Bernal', 'Travis Fullenkamp'],
    ['', ''],
    ['Ann', 'Ann Smith'],
  ];
  it.each(same)('%s == %s', (x, y) => expect(sameClientName(x, y)).toBe(true));
  it.each(different)('%s != %s', (x, y) => expect(sameClientName(x, y)).toBe(false));
  it('keys strip the sheet noise', () => {
    expect(clientNameKey('US-15417 Richard Hackmann Case number 6014522')).toBe('RICHARD HACKMANN');
  });
});

describe('clientIdChangeConflict (the save choke point)', () => {
  const customers = [
    { id: 'a', name: 'Cherrington', clientId: 'US-15703' },
    { id: 'b', name: 'Shellie Blum', clientId: 'US-15655' },
    { id: 'c', name: 'US-15655 Shellie Blum', clientId: 'US-15655' }, // legacy shared pair
  ];
  it('refuses moving a customer onto a number another holds', () => {
    expect(clientIdChangeConflict(customers, { clientId: '' }, { id: 'z', clientId: ' us-15703' })?.name).toBe('Cherrington');
  });
  it('lets a legacy shared pair keep saving (only a CHANGE counts)', () => {
    expect(clientIdChangeConflict(customers, { clientId: 'US-15655' }, { id: 'c', clientId: 'US-15655' })).toBeUndefined();
  });
  it('lets a free number through, and a blank one', () => {
    expect(clientIdChangeConflict(customers, { clientId: '' }, { id: 'z', clientId: 'US-15999' })).toBeUndefined();
    expect(clientIdChangeConflict(customers, { clientId: 'US-15703' }, { id: 'a', clientId: '' })).toBeUndefined();
  });
});
