// RMA Tracker board render. Server-rendered, so no effects fire and nothing
// touches live data: this pins the two lanes, the client number on every card,
// and the three site transfer states that exist in production.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { RMADashboard } from '../components/RMADashboard';
import type { Job, Customer, RMAEntry, User } from '../types';
import type { SolarEdgeSite } from '../lib/solarEdgeSites';

const AT = '2026-09-01T00:00:00.000Z';

const customers = [
  { id: 'c1', name: 'David Metellus', clientId: 'US-15679' },
  { id: 'c2', name: 'Danielle Ferrari', clientId: 'US-15691', solarEdgeSiteId: '451846' },
  { id: 'c3', name: 'Bethany Powell', clientId: 'US-15695' },
] as unknown as Customer[];

const sites = [
  { siteId: '451846', siteName: 'US-15691 Danielle Ferrari' },   // renamed, work done
  { siteId: '550167', siteName: 'Powell Bethany' },              // landed, still installer's name
] as unknown as SolarEdgeSite[];

const partEntry: RMAEntry = {
  id: 'r1', manufacturer: 'SolarEdge', partDescription: 'Inverter',
  rmaNumber: '7239219', status: 'pending', rmaStatus: 'submitted', createdAt: AT, createdBy: 'test',
};

const jobs = [
  { id: 'j1', customerId: 'c1', woNumber: 'SO-2609-00031', createdAt: AT, rmaEntries: [partEntry] },
  {
    id: 'j2', customerId: 'c2', serviceCode: 'SITE-TRX', woNumber: 'SO-2609-24594',
    siteTransferSiteId: '451846', createdAt: AT,
    rmaEntries: [{
      id: 'rma-sitetransfer-j2', manufacturer: 'SolarEdge', partDescription: 'Site Transfer',
      rmaNumber: '', caseNumber: '7021404', status: 'pending', createdAt: AT, createdBy: 'test',
    }],
  },
  {
    id: 'j3', customerId: 'c3', serviceType: 'Site Transfer', woNumber: 'SO-2609-92822',
    siteTransferSiteId: '550167', createdAt: AT,
  },
  {
    id: 'j4', customerId: 'c1', serviceCode: 'SITE-TRX', woNumber: 'SO-2608-66282',
    createdAt: AT, siteTransferCompletedAt: AT,
  },
  { id: 'j5', customerId: 'c3', serviceCode: 'SITE-TRX', woNumber: 'SO-2609-99475', createdAt: AT },
] as unknown as Job[];

const standaloneRmas: RMAEntry[] = [{
  id: 's1', manufacturer: 'SolarEdge', partDescription: 'Failed: SE6000H-US000BNU4',
  rmaNumber: '', caseNumber: '6539891', status: 'pending', rmaStatus: 'processes',
  createdAt: AT, createdBy: 'Lead conversion: test',
}];

const board = () => renderToStaticMarkup(
  React.createElement(RMADashboard, {
    jobs, customers, standaloneRmas, solarEdgeSites: sites,
    currentUser: { id: 'u1', name: 'Anthony' } as unknown as User,
    onUpdateJob: () => {},
    onUpdateStandaloneRma: () => {},
  }),
);

describe('RMA board render', () => {
  it('renders both lanes with the six columns, in order', () => {
    const html = board();
    const order = ['New RMA Parts', 'Not Eligible', 'Processed', 'Paid', 'New Site Transfer', 'Site Processed'];
    let cursor = -1;
    for (const label of order) {
      const at = html.indexOf(label, cursor + 1);
      expect(at, `${label} missing or out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('drops the old column names', () => {
    const html = board();
    expect(html).not.toContain('In Process');
    expect(html).not.toContain('Standalone RMA');
    expect(html).not.toContain('Shipped<');
  });

  it('shows the client number on a parts card and a transfer card', () => {
    const html = board();
    expect(html).toContain('US-15679');  // parts card, alongside the customer
    expect(html).toContain('US-15691');  // transfer card title
  });

  it('flags a landed site that still carries the installer name', () => {
    expect(board()).toContain('Needs rename');
  });

  it('says what an unlanded transfer is waiting on', () => {
    expect(board()).toContain('Waiting on SolarEdge');
  });

  it('keeps a standalone RMA in the parts lane with a No SO badge', () => {
    const html = board();
    expect(html).toContain('6539891');
    expect(html).toContain('No SO');
  });

  it('offers a case number or says there is none yet', () => {
    const html = board();
    expect(html).toContain('Case #7021404');
    expect(html).toContain('No case # yet');
  });

  it('links a transfer site out to SolarEdge', () => {
    expect(board()).toContain('monitoring.solaredge.com/solaredge-web/p/site/451846');
  });

  it('renders a Move to control on cards, so touch and keyboard work', () => {
    // Every parts card offers the other three columns; transfer cards offer the opposite one.
    const html = board();
    expect(html).toContain('title="Move to Not Eligible"');
    expect(html).toContain('title="Move to Site Processed"');
  });
});
