/**
 * Navigate destination for a work order.
 *
 * Every contractor job in production carries `latitude: 0, longitude: 0`
 * (134/134 when this was written) because nothing geocodes them on write. The
 * old Navigate button interpolated those straight into `?q=0,0`, which is Null
 * Island in the Atlantic. These tests pin the fallback so that regression
 * cannot come back silently: a wrong destination is worse than no destination.
 */
import { describe, it, expect } from 'vitest';
import { jobMapsUrl } from '../lib/woHelpers';

const addr = {
  address: '2206 Washington Street',
  city: 'Hollywood',
  state: 'FL',
  zip: '33020',
};

describe('jobMapsUrl', () => {
  it('never emits 0,0 for an ungeocoded job, and uses the address instead', () => {
    const url = jobMapsUrl({ latitude: 0, longitude: 0, ...addr });
    expect(url).not.toContain('q=0,0');
    expect(url).toBe(
      'https://maps.google.com/?q=2206%20Washington%20Street%2C%20Hollywood%2C%20FL%2C%2033020',
    );
  });

  it('prefers real coordinates when the job actually has them', () => {
    expect(jobMapsUrl({ latitude: 26.0112, longitude: -80.1495, ...addr }))
      .toBe('https://maps.google.com/?q=26.0112,-80.1495');
  });

  it('falls back when lat/long are missing, null, or NaN', () => {
    for (const coords of [
      {},
      { latitude: null, longitude: null },
      { latitude: NaN, longitude: NaN },
      { latitude: undefined, longitude: 5 },
    ]) {
      expect(jobMapsUrl({ ...coords, ...addr })).toContain('Washington');
    }
  });

  it('rejects out-of-range coordinates rather than trusting them', () => {
    expect(jobMapsUrl({ latitude: 91, longitude: 0, ...addr })).toContain('Washington');
    expect(jobMapsUrl({ latitude: 0, longitude: 181, ...addr })).toContain('Washington');
  });

  it('keeps a genuine zero on ONE axis, since only the exact 0,0 pair is the sentinel', () => {
    expect(jobMapsUrl({ latitude: 0, longitude: -80.1495, ...addr }))
      .toBe('https://maps.google.com/?q=0,-80.1495');
  });

  it('returns null when there is neither a coordinate nor an address, so the caller can disable the button', () => {
    expect(jobMapsUrl({ latitude: 0, longitude: 0 })).toBeNull();
    expect(jobMapsUrl({ address: '   ', city: '' })).toBeNull();
  });

  it('builds a partial address from whatever fields exist', () => {
    expect(jobMapsUrl({ city: 'Doral', state: 'FL' }))
      .toBe('https://maps.google.com/?q=Doral%2C%20FL');
  });
});
