// RMA Tracker board: column mapping + site transfer lane.
// Fixtures mirror the status combinations that actually exist in production
// (counted 2026-09-15), so a mapping change that would move live cards fails here.
import { describe, it, expect } from 'vitest';
import {
  rmaColumn, isSiteTransferEntry, siteRenamed, siteTransferBadge,
  shouldAutoCompleteSiteTransfer, siteTransferDone,
} from '../lib/woHelpers';
import type { RMAEntry } from '../types';

const entry = (over: Partial<RMAEntry>): RMAEntry => ({
  id: 'rma-1', manufacturer: 'SolarEdge', partDescription: 'Inverter',
  rmaNumber: '', status: 'pending', createdAt: '2026-09-01T00:00:00.000Z', createdBy: 'test',
  ...over,
});

describe('rmaColumn', () => {
  it('puts new and legacy pending work in New', () => {
    expect(rmaColumn(entry({ rmaStatus: 'processes' }))).toBe('new');
    expect(rmaColumn(entry({ status: 'pending' }))).toBe('new');
  });

  it('folds submitted, eligible and shipped into Processed', () => {
    for (const s of ['submitted', 'eligible', 'shipped'] as const) {
      expect(rmaColumn(entry({ rmaStatus: s }))).toBe('processed');
    }
  });

  it('folds the legacy approved and received statuses into Processed', () => {
    expect(rmaColumn(entry({ status: 'approved' }))).toBe('processed');
    expect(rmaColumn(entry({ status: 'received' }))).toBe('processed');
  });

  it('keeps Not Eligible its own column', () => {
    expect(rmaColumn(entry({ rmaStatus: 'not_eligible', status: 'received' }))).toBe('not_eligible');
  });

  it('treats a collected compensation as Paid even without the paid status', () => {
    expect(rmaColumn(entry({ status: 'approved', compensationCollected: true }))).toBe('paid');
    expect(rmaColumn(entry({ rmaStatus: 'paid', status: 'pending' }))).toBe('paid');
  });

  it('lets rmaStatus win over the legacy status field', () => {
    expect(rmaColumn(entry({ rmaStatus: 'processes', status: 'received' }))).toBe('new');
  });

  it('reproduces the live board counts', () => {
    const live: RMAEntry[] = [
      ...Array(9).fill(0).map(() => entry({ status: 'approved' })),        // processed
      ...Array(9).fill(0).map(() => entry({ status: 'pending' })),         // new
      ...Array(10).fill(0).map(() => entry({ rmaStatus: 'processes' })),   // new (standalone)
      entry({ status: 'received' }),                                       // processed
      entry({ rmaStatus: 'not_eligible', status: 'received' }),            // not eligible
      ...Array(4).fill(0).map(() => entry({ rmaStatus: 'paid' })),         // paid
      entry({ rmaStatus: 'processes', status: 'pending' }),                // new
      ...Array(6).fill(0).map(() => entry({ rmaStatus: 'shipped' })),      // processed
    ];
    const counts = live.reduce<Record<string, number>>((acc, e) => {
      const c = rmaColumn(e); acc[c] = (acc[c] ?? 0) + 1; return acc;
    }, {});
    expect(counts).toEqual({ new: 20, not_eligible: 1, processed: 16, paid: 4 });
  });
});

describe('isSiteTransferEntry', () => {
  it('matches the slot the service order files', () => {
    expect(isSiteTransferEntry(entry({ id: 'rma-sitetransfer-job-123' }))).toBe(true);
  });

  it('matches the part text in either casing, as both exist live', () => {
    expect(isSiteTransferEntry(entry({ partDescription: 'Site Transfer' }))).toBe(true);
    expect(isSiteTransferEntry(entry({ partDescription: 'site transfer' }))).toBe(true);
  });

  it('leaves a real part on a transfer order in the parts lane', () => {
    expect(isSiteTransferEntry(entry({ partDescription: 'Inverter' }))).toBe(false);
  });
});

describe('siteRenamed', () => {
  it('accepts the live convention', () => {
    expect(siteRenamed('US-15631 Jakson Roche', 'US-15631')).toBe(true);
    expect(siteRenamed('  us-15691 Danielle Ferrari', 'US-15691')).toBe(true);
  });

  it('rejects an installer name and a different client', () => {
    expect(siteRenamed('Metellus, David TSP149924', 'US-15679')).toBe(false);
    expect(siteRenamed('US-15688 Someone Else', 'US-15687')).toBe(false);
  });

  it('never matches on a missing client number or site name', () => {
    expect(siteRenamed('US-15631 Jakson Roche', undefined)).toBe(false);
    expect(siteRenamed('', 'US-15631')).toBe(false);
    expect(siteRenamed(undefined, '')).toBe(false);
  });
});

describe('site transfer lane', () => {
  const done = { siteTransferCompletedAt: '2026-09-01T00:00:00.000Z' };
  const open = {};

  it('waits on SolarEdge while the site is not in our account', () => {
    expect(siteTransferBadge(open, undefined, 'US-15703')).toBe('waiting');
    expect(shouldAutoCompleteSiteTransfer(open, undefined, 'US-15703')).toBe(false);
  });

  it('flags a landed site that still carries the old name', () => {
    expect(siteTransferBadge(open, { siteName: 'Powell Bethany' }, 'US-15695')).toBe('needs_rename');
    expect(shouldAutoCompleteSiteTransfer(open, { siteName: 'Powell Bethany' }, 'US-15695')).toBe(false);
  });

  it('auto-completes once the site is renamed', () => {
    const site = { siteName: 'US-15691 Danielle Ferrari' };
    expect(shouldAutoCompleteSiteTransfer(open, site, 'US-15691')).toBe(true);
    expect(siteTransferBadge(open, site, 'US-15691')).toBeNull();
  });

  it('never moves a completed transfer backwards, whatever the site is called', () => {
    const odd = { siteName: 'Metellus, David TSP149924' };
    expect(siteTransferDone(done)).toBe(true);
    expect(siteTransferBadge(done, odd, 'US-15679')).toBeNull();
    expect(shouldAutoCompleteSiteTransfer(done, odd, 'US-15679')).toBe(false);
  });
});
