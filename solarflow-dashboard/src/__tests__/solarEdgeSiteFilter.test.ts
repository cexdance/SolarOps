/**
 * Tests for src/lib/solarEdgeSiteFilter.ts
 *
 * Covers the import allow/deny rules: V-/GT/GA prefixes, non-Florida state
 * exclusion, US-NNNNN allow-list, and clientId derivation from site name.
 */
import { describe, it, expect } from 'vitest';
import {
  isFloridaSite,
  isAllowedCustomer,
  deriveClientId,
  findCustomerForSite,
} from '../lib/solarEdgeSiteFilter';

describe('findCustomerForSite', () => {
  const crmRushBear = { id: 'cust-1783960743175', name: 'Rush Bear', clientId: 'US-15646' };
  const site = { id: '3621435', name: 'US-15646 Rush Bear' };

  it('matches an already-linked customer by solarEdgeSiteId', () => {
    const linked = { id: 'c1', name: 'Whoever', solarEdgeSiteId: '3621435' };
    expect(findCustomerForSite([linked], site)?.id).toBe('c1');
  });

  // The US-15646 regression: a CRM customer has the client id but no site id, so a
  // siteId-only lookup missed it and the import forked a second, contact-less record.
  it('matches a CRM customer by the US-NNNNN client id in the site name', () => {
    expect(findCustomerForSite([crmRushBear], site)?.id).toBe('cust-1783960743175');
  });

  it('derives the client id from the customer name when the field is blank', () => {
    const named = { id: 'c2', name: 'US-15646 Rush Bear' };
    expect(findCustomerForSite([named], site)?.id).toBe('c2');
  });

  it('tolerates "US 15646" / casing variants on either side', () => {
    const loose = { id: 'c3', name: 'Rush Bear', clientId: 'us 15646' };
    expect(findCustomerForSite([loose], site)?.id).toBe('c3');
  });

  it('keeps multi-site clients distinct (US-15523 vs US-15523-2)', () => {
    const base = { id: 'c4', name: 'Charles Roach', clientId: 'US-15523' };
    expect(findCustomerForSite([base], { id: '99', name: 'US-15523-2 Charles Roach' })).toBeUndefined();
  });

  it('never steals a site from a customer already linked to another site', () => {
    const taken = { ...crmRushBear, solarEdgeSiteId: '999' };
    expect(findCustomerForSite([taken], site)).toBeUndefined();
  });

  it('does not match on accountId alone (not a reliable join key)', () => {
    const acct = { id: 'c5', name: 'Someone', clientId: 'ACC-1' };
    expect(findCustomerForSite([acct], { id: '77', name: 'Some Site', accountId: 'ACC-1' })).toBeUndefined();
  });

  it('returns undefined for a genuinely new site', () => {
    expect(findCustomerForSite([crmRushBear], { id: '55', name: 'US-19999 New Client' })).toBeUndefined();
  });
});

describe('isFloridaSite', () => {
  it('excludes V- and GT prefixed names', () => {
    expect(isFloridaSite({ id: 1, name: 'V-1234 Test' })).toBe(false);
    expect(isFloridaSite({ id: 2, name: 'V 1234 Test' })).toBe(false);
    expect(isFloridaSite({ id: 3, name: 'GT-9 Guatemala' })).toBe(false);
    expect(isFloridaSite({ id: 4, name: 'GA-5 Georgia' })).toBe(false);
  });

  it('allows US-NNNNN Florida naming when state is empty', () => {
    expect(isFloridaSite({ id: 5, name: 'US-15631 Jakson Roche' })).toBe(true);
  });

  it('allows explicit Florida state', () => {
    expect(isFloridaSite({ id: 6, name: 'Some Site', location: { state: 'FL' } })).toBe(true);
    expect(isFloridaSite({ id: 7, name: 'Some Site', location: { state: 'Florida' } })).toBe(true);
  });

  it('excludes a US-named site whose state is explicitly non-Florida', () => {
    expect(isFloridaSite({ id: 8, name: 'US-15019 One Eleven South', location: { state: 'GA' } })).toBe(false);
    expect(isFloridaSite({ id: 9, name: 'US-99 Texas Site', location: { state: 'Texas' } })).toBe(false);
  });
});

describe('isAllowedCustomer', () => {
  it('hides V-/GT/GA customers, keeps normal FL ones', () => {
    expect(isAllowedCustomer({ name: 'V-1234 Test' })).toBe(false);
    expect(isAllowedCustomer({ name: 'GT-9 Guatemala' })).toBe(false);
    expect(isAllowedCustomer({ name: 'US-15631 Jakson Roche' })).toBe(true);
  });
});

describe('deriveClientId', () => {
  it('pulls the leading US-NNNNN token, preserving suffixes', () => {
    expect(deriveClientId('US-15523-2 Charles Roach')).toBe('US-15523-2');
    expect(deriveClientId('US-15019 One Eleven South')).toBe('US-15019');
    expect(deriveClientId('US-15019')).toBe('US-15019');
  });

  it('falls back to accountId when the name is not US-prefixed', () => {
    expect(deriveClientId('Munoz, Mildred TSP99999', 'ACC-1')).toBe('ACC-1');
    expect(deriveClientId('Some Site', '')).toBe('');
  });
});
