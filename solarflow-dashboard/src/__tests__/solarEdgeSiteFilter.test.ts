/**
 * Tests for src/lib/solarEdgeSiteFilter.ts
 *
 * Covers the import allow/deny rules: V-/GT/GA prefixes, non-Florida state
 * exclusion, US-NNNNN allow-list, and clientId derivation from site name.
 */
import { describe, it, expect } from 'vitest';
import { isFloridaSite, isAllowedCustomer, deriveClientId } from '../lib/solarEdgeSiteFilter';

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
