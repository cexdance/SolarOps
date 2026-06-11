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
