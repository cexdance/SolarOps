import { describe, it, expect } from 'vitest';
import { seedLeadInfo, leadDisplayName, leadToCustomer, formatImportedAt } from '../lib/leadConvert';
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
