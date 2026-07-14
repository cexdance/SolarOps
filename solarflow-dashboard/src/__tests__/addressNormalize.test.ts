// Tests for SolarEdge address-order normalization and embedded city/state/zip
// stripping (src/lib/addressValidator.ts). These guard the 2026-06-10 address
// remediation: future imports must not reintroduce European street order.
import { describe, it, expect } from 'vitest';
import { normalizeStreetOrder, stripEmbeddedCityStateZip } from '../lib/addressValidator';

describe('normalizeStreetOrder', () => {
  it('moves a trailing house number to the front', () => {
    expect(normalizeStreetOrder('Northwest 72nd Street 7499, Tamarac, FL, 33321'))
      .toBe('7499 Northwest 72nd Street, Tamarac, FL, 33321');
    expect(normalizeStreetOrder('Surrey Drive 2579')).toBe('2579 Surrey Drive');
  });

  it('leaves correct US-order addresses untouched', () => {
    expect(normalizeStreetOrder('330 Beulah Rd, Winter Garden, FL 34787'))
      .toBe('330 Beulah Rd, Winter Garden, FL 34787');
    expect(normalizeStreetOrder('7499 Northwest 72nd Street')).toBe('7499 Northwest 72nd Street');
  });

  it('does not reorder unit designators or single-word streets', () => {
    expect(normalizeStreetOrder('Maple Grove LOT 10')).toBe('Maple Grove LOT 10');
    expect(normalizeStreetOrder('Calle 2, San Juan, PR')).toBe('Calle 2, San Juan, PR');
    expect(normalizeStreetOrder('Ocean View Apt 4')).toBe('Ocean View Apt 4');
  });

  it('handles empty and falsy input', () => {
    expect(normalizeStreetOrder('')).toBe('');
  });
});

describe('stripEmbeddedCityStateZip', () => {
  it('strips a duplicated city/state/zip suffix', () => {
    expect(stripEmbeddedCityStateZip('330 Beulah Rd, Winter Garden, FL 34787', {
      city: 'Winter Garden', state: 'FL', zip: '34787',
    })).toBe('330 Beulah Rd');
  });

  it('returns the street unchanged when nothing is embedded', () => {
    expect(stripEmbeddedCityStateZip('330 Beulah Rd', {
      city: 'Winter Garden', state: 'FL', zip: '34787',
    })).toBe('330 Beulah Rd');
  });

  it('does not strip when the city is part of the street name itself', () => {
    expect(stripEmbeddedCityStateZip('12 Winter Garden Way', { city: 'Winter Garden' }))
      .toBe('12 Winter Garden Way');
  });
});

import { parseUsAddress } from '../lib/addressValidator';

describe('parseUsAddress (auto-populate city/state/zip from a full address line)', () => {
  it('splits a standard comma-separated address', () => {
    expect(parseUsAddress('123 Main St, Miami, FL 33101'))
      .toEqual({ address: '123 Main St', city: 'Miami', state: 'FL', zip: '33101' });
  });
  it('keeps a multi-word city and strips a leading label', () => {
    expect(parseUsAddress('Address: 330 Beulah Rd, Winter Garden, FL 34787'))
      .toEqual({ address: '330 Beulah Rd', city: 'Winter Garden', state: 'FL', zip: '34787' });
  });
  it('handles ZIP+4 and a comma before the state', () => {
    expect(parseUsAddress('7499 NW 72nd St, Tamarac, FL, 33321-1234'))
      .toEqual({ address: '7499 NW 72nd St', city: 'Tamarac', state: 'FL', zip: '33321' });
  });
  it('falls back to a space-separated single-word city', () => {
    expect(parseUsAddress('123 Main St Miami FL 33101'))
      .toEqual({ address: '123 Main St', city: 'Miami', state: 'FL', zip: '33101' });
  });
  it('returns null without a state+zip tail (bare street)', () => {
    expect(parseUsAddress('123 Main St')).toBeNull();
    expect(parseUsAddress('Miami, FL')).toBeNull();
    expect(parseUsAddress('')).toBeNull();
  });
});

import { sameStreetAddress, canonicalStreet } from '../lib/addressValidator';

describe('sameStreetAddress (validated CRM address prevails at SolarEdge ingress)', () => {
  it('matches reversed SolarEdge order against corrected CRM address', () => {
    expect(sameStreetAddress('1330 Beulah Rd', 'Beulah Road 1330')).toBe(true);
    expect(sameStreetAddress('124 Creekside Way', 'Creekside Way 124')).toBe(true);
  });
  it('matches suffix and directional abbreviations', () => {
    expect(sameStreetAddress('7910 Southwest 8th Court', '7910 SW 8th Ct')).toBe(true);
    expect(sameStreetAddress('2653 Riverport Drive North', '2653 Riverport Dr N')).toBe(true);
  });
  it('ignores trailing city/state on either side', () => {
    expect(sameStreetAddress('1330 Beulah Rd, Winter Garden, FL', 'Beulah Road 1330')).toBe(true);
  });
  it('rejects genuinely different addresses', () => {
    expect(sameStreetAddress('330 Beulah Rd', '1330 Beulah Rd')).toBe(false);
    expect(sameStreetAddress('18312 County Rd 33', 'Riverport Drive North 2653')).toBe(false);
    expect(sameStreetAddress('', '1330 Beulah Rd')).toBe(false);
  });
  it('canonicalStreet normalizes consistently', () => {
    expect(canonicalStreet('Beulah Road 1330')).toBe(canonicalStreet('1330 Beulah Rd'));
  });
});
