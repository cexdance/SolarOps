import { describe, it, expect } from 'vitest';
import { seedLeadInfo, leadDisplayName, leadToCustomer, formatImportedAt, jobMatchesSearch } from '../lib/leadConvert';
import type { Job } from '../types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'job-trello-x', customerId: '', technicianId: '', serviceType: 'Lead', status: 'new',
  scheduledDate: '', scheduledTime: '', notes: '', photos: [], laborHours: 0, laborRate: 0,
  partsCost: 0, totalAmount: 0, createdAt: '2026-08-01T00:00:00Z', urgency: 'medium',
  isPowercare: false, ...over,
});

describe('seedLeadInfo', () => {
  it('prefers an existing edited leadInfo', () => {
    const li = { firstName: 'Ed', phone: '9990001111' };
    expect(seedLeadInfo(job({ leadInfo: li, clientName: 'Someone Else' }))).toEqual(li);
  });
  it('derives name from clientName and mines phone/email from Trello notes', () => {
    const info = seedLeadInfo(job({
      clientName: 'Katherine Souza',
      notes: 'Imported from Trello\nPhone: (407) 522-6082\nEmail: kat@example.com',
    }));
    expect(info).toEqual({ firstName: 'Katherine', lastName: 'Souza', phone: '4075226082', email: 'kat@example.com' });
  });
  it('handles a bare name with no contact info', () => {
    expect(seedLeadInfo(job({ clientName: 'Solo' }))).toEqual({ firstName: 'Solo', lastName: '' });
  });
});

describe('leadDisplayName', () => {
  it('uses leadInfo name, then clientName, then a fallback', () => {
    expect(leadDisplayName(job({ leadInfo: { firstName: 'A', lastName: 'B' } }))).toBe('A B');
    expect(leadDisplayName(job({ clientName: 'Card Name' }))).toBe('Card Name');
    expect(leadDisplayName(job({}))).toBe('Unnamed lead');
  });
});

describe('leadToCustomer', () => {
  it('maps leadInfo to a customer payload, defaults state to FL, carries activity', () => {
    const acts = [{ id: 'a1', type: 'note_added' as const, description: 'Call: no answer', timestamp: 'x' }];
    const c = leadToCustomer(job({
      clientId: 'US-15668',
      leadInfo: { firstName: 'Ed', lastName: 'Chase', phone: '8135551234', email: 'e@c.com', city: 'Tampa' },
      activityHistory: acts,
    }));
    expect(c.name).toBe('Ed Chase');
    expect(c.phone).toBe('8135551234');
    expect(c.state).toBe('FL');
    expect(c.clientId).toBe('US-15668');
    expect(c.clientStatus).toBe('Contacted');
    expect(c.activityHistory).toBe(acts);
  });
  it('falls back to clientName when leadInfo has no name', () => {
    expect(leadToCustomer(job({ clientName: 'Hannah Gunnoe' })).name).toBe('Hannah Gunnoe');
  });
});

describe('formatImportedAt', () => {
  // Fixed "now" so these can never rot as real time passes.
  const NOW = new Date('2026-08-23T20:00:00Z');

  it('shows the date plus how long the lead has been sitting', () => {
    expect(formatImportedAt('2026-08-21T13:00:00Z', NOW)).toBe('Aug 21 (2d)');
    // 24d 23h 59m: floors to 24, it does not round up to 25.
    expect(formatImportedAt('2026-07-29T20:01:00Z', NOW)).toBe('Jul 29 (24d)');
  });

  it('says "today" rather than "(0d)"', () => {
    expect(formatImportedAt('2026-08-23T06:00:00Z', NOW)).toBe('Aug 23 (today)');
  });

  it('adds the year only when it is not the current one', () => {
    // The oldest live LL card is a 2024 Trello import.
    expect(formatImportedAt('2024-07-30T12:00:00Z', NOW)).toContain('Jul 30, 2024');
    expect(formatImportedAt('2026-08-21T13:00:00Z', NOW)).not.toContain('2026');
  });

  it('never renders a negative age from a skewed or hand-edited createdAt', () => {
    expect(formatImportedAt('2026-08-25T12:00:00Z', NOW)).toBe('Aug 25');
  });

  it('renders nothing rather than "Invalid Date" when createdAt is missing or junk', () => {
    expect(formatImportedAt(undefined, NOW)).toBe('');
    expect(formatImportedAt('', NOW)).toBe('');
    expect(formatImportedAt('not-a-date', NOW)).toBe('');
  });
});

describe('jobMatchesSearch', () => {
  // The real shape of a Trello lead: no customer, name split across two lines.
  const adesh = {
    clientName: 'Adesh Nangia', title: 'Adesh Nangia', woNumber: undefined,
    notes: "Hello team! You've received a new solar lead!\n\nFirst Name: Adesh\nLast Name: Nangia\nEmail: adeshnangia@gmail.com\nPhone: 7039452850\n",
    leadInfo: { firstName: 'Adesh', lastName: 'Nangia', phone: '7039452850', email: 'adeshnangia@gmail.com' },
  };

  it('finds a lead by its full name as it reads on the Trello card', () => {
    // Reported 2026-10-01: this matched nothing, for all 88 leads without a customer.
    expect(jobMatchesSearch(adesh, undefined, 'Adesh Nangia')).toBe(true);
    expect(jobMatchesSearch(adesh, undefined, 'nangia adesh')).toBe(true);   // any order
  });

  it('still finds everything the old substring search found', () => {
    for (const q of ['Adesh', 'Nangia', 'adeshnangia@gmail.com', '7039452850', 'solar lead']) {
      expect(jobMatchesSearch(adesh, undefined, q)).toBe(true);
    }
  });

  it('matches a phone typed the way people write it, and not a stranger', () => {
    expect(jobMatchesSearch(adesh, undefined, '(703) 945-2850')).toBe(true);
    expect(jobMatchesSearch(adesh, undefined, '703-945-2850')).toBe(true);
    expect(jobMatchesSearch(adesh, undefined, '(954) 605-0226')).toBe(false);
  });

  it('requires EVERY word, so a wrong second word does not match', () => {
    expect(jobMatchesSearch(adesh, undefined, 'Adesh Smith')).toBe(false);
    expect(jobMatchesSearch(adesh, undefined, 'Nangia zzz')).toBe(false);
  });

  it('an empty or blank query matches everything', () => {
    expect(jobMatchesSearch(adesh, undefined, '')).toBe(true);
    expect(jobMatchesSearch(adesh, undefined, '   ')).toBe(true);
  });

  it('still searches a linked customer and the service order number', () => {
    const so = { clientName: '', title: 'WO', woNumber: 'WO-2609-77087', notes: '', leadInfo: undefined };
    expect(jobMatchesSearch(so, { name: 'Donnie Hall', address: '12 Oak St' }, 'donnie hall')).toBe(true);
    expect(jobMatchesSearch(so, { name: 'Donnie Hall', address: '12 Oak St' }, 'oak')).toBe(true);
    expect(jobMatchesSearch(so, undefined, '2609-77087')).toBe(true);
  });

  it('a short digit string does not match every phone number by accident', () => {
    // under 4 digits the digits-only comparison is off, so "12" cannot match a phone containing 1...2
    expect(jobMatchesSearch(adesh, undefined, '99')).toBe(false);
  });
});
