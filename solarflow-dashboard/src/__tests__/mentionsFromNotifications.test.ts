// The mentions inbox unpicks the two strings /api/notify composes. If that
// composition ever changes, these fail rather than silently blanking the inbox.
import { describe, it, expect } from 'vitest';
import { mentionFromNotification, getMentionsFor, unreadCountFor } from '../lib/mentionsStore';
import type { AppNotification } from '../types';

const base: AppNotification = {
  id: 'notif-1',
  userId: 'u1',
  type: 'mention',
  title: 'Daniel Matos mentioned you',
  message: 'In US-15583 Ella Mae Arnold: "can you check the inverter?"',
  read: false,
  createdAt: '2026-08-30T10:00:00.000Z',
};

describe('mentionFromNotification', () => {
  it('splits the notifier, label and comment body', () => {
    const m = mentionFromNotification({ ...base, relatedCustomerId: 'cust-1', relatedActivityId: 'act-9' });
    expect(m.notifierName).toBe('Daniel Matos');
    expect(m.sourceLabel).toBe('US-15583 Ella Mae Arnold');
    expect(m.snippet).toBe('can you check the inverter?');
    expect(m.sourceType).toBe('customer');
    expect(m.sourceId).toBe('cust-1');
    expect(m.activityId).toBe('act-9');
  });

  it('routes a job id to the workOrder source type', () => {
    const m = mentionFromNotification({ ...base, relatedJobId: 'job-7' });
    expect(m.sourceType).toBe('workOrder');
    expect(m.sourceId).toBe('job-7');
  });

  it('keeps a body that itself contains quotes and colons', () => {
    const m = mentionFromNotification({
      ...base,
      message: 'In WO-2604-96746: "he said "no go" re: the roof"',
    });
    expect(m.sourceLabel).toBe('WO-2604-96746');
    expect(m.snippet).toBe('he said "no go" re: the roof');
  });

  it('handles the no-body form', () => {
    const m = mentionFromNotification({ ...base, message: 'You were mentioned in a customer record' });
    expect(m.sourceLabel).toBe('a customer record');
    expect(m.snippet).toBe('');
  });

  it('never drops a mention whose message is an unknown shape', () => {
    const m = mentionFromNotification({ ...base, message: 'something else entirely' });
    expect(m.snippet).toBe('something else entirely');
  });
});

describe('getMentionsFor', () => {
  const feed: AppNotification[] = [
    { ...base, id: 'a', createdAt: '2026-08-01T00:00:00.000Z' },
    { ...base, id: 'b', createdAt: '2026-08-03T00:00:00.000Z', read: true },
    { ...base, id: 'c', userId: 'u2' },                       // someone else's
    { ...base, id: 'd', type: 'assignment', title: 'Job assigned' }, // not a mention
  ];

  it('returns only this user\'s mentions, newest first', () => {
    expect(getMentionsFor(feed, 'u1').map(m => m.id)).toEqual(['b', 'a']);
  });

  it('counts only this user\'s unread mentions', () => {
    expect(unreadCountFor(feed, 'u1')).toBe(1);
    expect(unreadCountFor(feed, 'u2')).toBe(1);
    expect(unreadCountFor([], 'u1')).toBe(0);
  });
});
