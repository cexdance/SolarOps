// ServiceOrderPanel saved its `siteId` prop straight into job.solarEdgeSiteId,
// and most callers pass the CUSTOMER id there. On 2026-09-10 that had left 175
// service orders with `cust-...` as their SolarEdge site id (174 of them their
// own customer id) against 25 with a real one, and it wiped any site id a
// Trello lead brought in on the first save of its order.
import { describe, it, expect } from 'vitest';
import { realSiteId } from '../lib/woHelpers';

describe('realSiteId', () => {
  it('skips a customer id passed as the panel context and takes the real site', () => {
    // The exact save: prop = customer id, customer record has the real site.
    expect(realSiteId('cust-1788456509644-2x8s20', '2803501', undefined)).toBe('2803501');
  });

  it('keeps a real site the SolarEdge site panel passes in, ahead of anything else', () => {
    expect(realSiteId('451846', '2803501', '999999')).toBe('451846');
  });

  it("falls back to the job's own real site when the customer has none", () => {
    expect(realSiteId('cust-1', undefined, '3612595')).toBe('3612595');
  });

  it('writes NOTHING rather than a customer id when no real site exists', () => {
    expect(realSiteId('cust-1', '', 'cust-1')).toBeUndefined();
  });

  it('refuses the other ids that end up in this field', () => {
    expect(realSiteId('US-15658')).toBeUndefined();     // client number (30 customers hold one)
    expect(realSiteId('61257674162')).toBeUndefined();  // HS_ID
    expect(realSiteId('1234')).toBeUndefined();
    expect(realSiteId('12345')).toBe('12345');          // 5 digits is real: live range is 5-7
  });
});
