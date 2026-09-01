import { describe, it, expect } from 'vitest';
import { mapRowToContact, mapVisionToContact, normalizePhone } from '../lib/leadImport';

describe('normalizePhone', () => {
  it('strips punctuation and a leading US country code', () => {
    expect(normalizePhone('(305) 878-6934')).toBe('3058786934');
    expect(normalizePhone('1-863-495-5963')).toBe('8634955963');
    expect(normalizePhone("'+18632081750")).toBe('8632081750');
  });
  it('leaves a plain 10-digit number alone', () => {
    expect(normalizePhone('9549319995')).toBe('9549319995');
  });
});

describe('mapRowToContact (SolarEdge export)', () => {
  it('maps the Site Main Contact / RMA columns and splits the name', () => {
    const c = mapRowToContact({
      'Site Main Contact Name': 'Robert Rivas',
      'Site Main Contact Phone': '(407) 595-2086',
      'Site Main Contact Email': 'rob@example.com',
      'RMA Street': '123 Oak St',
      'RMA City': 'Tampa',
      'RMA State': 'GA',                 // warehouse state, must be ignored
      'RMA Zip/Postal Code': '33601',
    });
    expect(c).toEqual({
      firstName: 'Robert', lastName: 'Rivas',
      phone: '4075952086', email: 'rob@example.com',
      address: '123 Oak St', city: 'Tampa', state: 'FL', zip: '33601',
      // Every column with no form field of its own now lands in the notes
      // rather than being dropped. RMA State is ignored for the State FIELD
      // (see above) but is still worth keeping on the record.
      notes: 'RMA State: GA',
    });
  });

  it('falls back to generic headers and defaults state to FL', () => {
    const c = mapRowToContact({ Name: 'Jane Q Public', Phone: '9546042295', 'Zip Code': '33measurements' });
    expect(c.firstName).toBe('Jane');
    expect(c.lastName).toBe('Q Public');
    expect(c.phone).toBe('9546042295');
    expect(c.state).toBe('FL');
  });

  it('honors an explicit State column over the FL default', () => {
    expect(mapRowToContact({ Name: 'A B', State: 'TX' }).state).toBe('TX');
  });

  it('omits empty fields so a merge never blanks the form', () => {
    const c = mapRowToContact({ Name: 'Solo' });
    expect(c).not.toHaveProperty('email');
    expect(c).not.toHaveProperty('phone');
    expect(c.firstName).toBe('Solo');
    expect(c.state).toBe('FL'); // state always present via default
  });
});

describe('mapVisionToContact', () => {
  it('folds hsId + contractName into notes and normalizes the phone', () => {
    const c = mapVisionToContact({
      firstName: 'Sam', lastName: 'Vine', phone: '18005551212',
      hsId: '99', contractName: 'Acme', notes: 'called twice',
    });
    expect(c.phone).toBe('8005551212');
    expect(c.notes).toBe('called twice\nHS_ID: 99\nContract: Acme');
  });
});
