// Guard against re-creating a client that already exists. Regression cover for
// the 2026-08-13 US-15644 (Jose Ravelo) duplicate: a Trello import wrote a
// second customer record for an existing client, the client's two service
// orders stayed on the original, and the new record read as an empty account.
import { describe, it, expect } from 'vitest';
import { findDuplicateCustomer, findPossibleDuplicateCustomer } from '../lib/dataStore';
import type { Customer } from '../types';

const cust = (p: Partial<Customer>): Customer => ({
  id: 'c1',
  name: 'Test Client',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: 'FL',
  zip: '',
  type: 'residential',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...p,
} as Customer);

describe('findDuplicateCustomer', () => {
  const ravelo = cust({ id: 'cust-1783972659982', name: 'Jose Ravelo', clientId: 'US-15644', solarEdgeSiteId: '871418' });

  it('matches an existing client by clientId', () => {
    expect(findDuplicateCustomer([ravelo], { clientId: 'US-15644' })?.id).toBe('cust-1783972659982');
  });

  it('matches by solarEdgeSiteId even when the incoming record has no clientId', () => {
    expect(findDuplicateCustomer([ravelo], { solarEdgeSiteId: '871418' })?.id).toBe('cust-1783972659982');
  });

  it('ignores surrounding whitespace on both sides', () => {
    const spaced = cust({ id: 'c-spaced', clientId: ' US-15644 ' });
    expect(findDuplicateCustomer([spaced], { clientId: 'US-15644' })?.id).toBe('c-spaced');
  });

  it('lets a genuinely new client through', () => {
    expect(findDuplicateCustomer([ravelo], { clientId: 'US-99999' })).toBeUndefined();
  });

  // The failure that would matter most: a blank key must not match, or every
  // record without a client number collapses into one "duplicate".
  it('never matches on a blank or missing key', () => {
    const blanks = [cust({ id: 'a' }), cust({ id: 'b', clientId: '' }), cust({ id: 'd', clientId: '   ' })];
    expect(findDuplicateCustomer(blanks, {})).toBeUndefined();
    expect(findDuplicateCustomer(blanks, { clientId: '' })).toBeUndefined();
    expect(findDuplicateCustomer(blanks, { clientId: '  ' })).toBeUndefined();
    expect(findDuplicateCustomer(blanks, { solarEdgeSiteId: '' })).toBeUndefined();
  });

  it('reproduces the incident: the second Ravelo import finds the first record', () => {
    const incoming = { clientId: 'US-15644', solarEdgeSiteId: undefined };
    expect(findDuplicateCustomer([ravelo], incoming)?.name).toBe('Jose Ravelo');
  });
});

describe('findPossibleDuplicateCustomer', () => {
  // The 2026-09-22 incident, as the two records actually looked.
  const blackstone = cust({ id: 'cust-1787952007748', name: 'Grif Blackstone', clientId: 'US-15693',
    email: 'grifblackstone@gmail.com', phone: '9542497114', zip: '33308' });

  it('reproduces the incident: the hand-made US-15708 finds US-15693', () => {
    const m = findPossibleDuplicateCustomer([blackstone], {
      name: 'Grif Blackstone', email: 'GrifBlackstone@gmail.com',
      phone: '\u202a+1 (954) 249-7114\u202c', address: '2261 NE 62nd Street', zip: '33308',
    });
    expect(m?.customer.id).toBe('cust-1787952007748');
    expect(m?.reason).toBe('same email');
  });

  it('matches phone across formatting, address across punctuation, then name', () => {
    expect(findPossibleDuplicateCustomer([blackstone], { phone: '(954) 249-7114' })?.reason).toBe('same phone');
    const house = cust({ id: 'h', name: 'A', address: '2261 NE 62nd St.', zip: '33308-1234' });
    expect(findPossibleDuplicateCustomer([house], { address: '2261 ne 62nd st', zip: '33308' })?.reason).toBe('same address');
    expect(findPossibleDuplicateCustomer([blackstone], { name: '  grif  blackstone ' })?.reason).toBe('same name');
  });

  it('never matches on blank keys or a phone fragment', () => {
    const blanks = [cust({ id: 'a', name: '' }), cust({ id: 'b', name: '', phone: '555' })];
    expect(findPossibleDuplicateCustomer(blanks, {})).toBeUndefined();
    expect(findPossibleDuplicateCustomer(blanks, { name: ' ', email: ' ', phone: '555', address: 'x' })).toBeUndefined();
  });

  it('lets a genuinely new client through', () => {
    expect(findPossibleDuplicateCustomer([blackstone], { name: 'Jane Roe', email: 'jane@x.com', phone: '3055550000' })).toBeUndefined();
  });
});
