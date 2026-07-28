import { describe, it, expect } from 'vitest';
import { filterMentionUsers, handleFor, parseMentions, parseMentionEmails, type MentionUser } from '../components/ui/MentionTextarea';

// The real staff list, shape and order as /api/users returns it (name-sorted).
// Daniel Matos is 7th of 9, which is exactly why the old slice(0, 6) hid him.
const STAFF: (MentionUser & { email: string })[] = [
  { id: '1', name: 'Andrea Alvarez (Admin)', username: 'aalvarez',  email: 'andrea.alvarez@conexsol.net' },
  { id: '2', name: 'Andreina Lecue',         username: 'alecue',    email: 'andreina.lecue@conexsol.us' },
  { id: '3', name: 'Anthony Lopez (Admin)',  username: 'alopez',    email: 'anthony.lopez@conexsol.us' },
  { id: '4', name: 'Carlos Valbuena',        username: 'cvalbuena', email: 'carlos.valbuena@conexsol.us' },
  { id: '5', name: 'Cesar Jurado (Admin)',   username: 'cjurado',   email: 'cesar.jurado@conexsol.us' },
  { id: '6', name: 'Cruz Fernandez',         username: '',          email: 'cruz.fernandez@conexsol.us' },
  { id: '7', name: 'Daniel Matos (Admin)',   username: 'dmatos',    email: 'daniel.matos@conexsol.us' },
  { id: '8', name: 'Edgar Diaz',             username: 'ediaz',     email: 'edgar.diaz@conexsol.us' },
  { id: '9', name: 'Mia Lopez (Admin)',      username: 'mlopez',    email: 'mia.lopez@conexsol.us' },
];

const ids = (list: MentionUser[]) => list.map(u => u.id);
const DANIEL = '7';

describe('filterMentionUsers', () => {
  it('returns every staff member for a bare @, not a truncated first page', () => {
    const all = filterMentionUsers(STAFF, '');
    expect(all).toHaveLength(9);
    expect(ids(all)).toContain(DANIEL); // the regression: he is 7th
  });

  it.each([
    ['daniel',       'first name'],
    ['dmatos',       'username'],
    ['matos',        'last name, mid-field'],
    ['d',            'single letter'],
    ['Daniel',       'capitalised'],
    ['DMATOS',       'shouting'],
    ['daniel.matos', 'email local-part'],
  ])('finds Daniel by %s (%s)', (query) => {
    expect(ids(filterMentionUsers(STAFF, query))).toContain(DANIEL);
  });

  it('ranks a prefix hit above a mid-word hit', () => {
    // "a" prefixes three usernames; it also appears mid-name in others.
    const result = filterMentionUsers(STAFF, 'a');
    expect(ids(result).slice(0, 3)).toEqual(['1', '2', '3']);
  });

  it('keeps the incoming order among equally-ranked hits', () => {
    expect(ids(filterMentionUsers(STAFF, 'admin'))).toEqual(['1', '3', '5', '7', '9']);
  });

  it('returns nothing for a query that matches nobody', () => {
    expect(filterMentionUsers(STAFF, 'zzz')).toEqual([]);
  });
});

describe('handleFor', () => {
  it('prefers the explicit username', () => {
    expect(handleFor(STAFF[6])).toBe('dmatos');
  });

  it('strips a stored leading @ rather than doubling it', () => {
    expect(handleFor({ id: 'x', name: 'Daniel Matos', username: '@dmatos' })).toBe('dmatos');
  });

  it('drops the role suffix when there is no username, so the handle stays parseable', () => {
    // "Cruz Fernandez (Admin)" must not become "@cruzfernandez(admin)": the
    // parens fall outside [\w.] and parseMentions could never match it back.
    const h = handleFor({ id: '6', name: 'Cruz Fernandez (Admin)' });
    expect(h).toBe('cruzfernandez');
    expect(h).toMatch(/^[\w.]+$/);
  });
});

describe('parseMentions round-trip', () => {
  it('resolves a handle that handleFor produced', () => {
    for (const u of STAFF) {
      expect(parseMentions(`ping @${handleFor(u)} please`, STAFF)).toContain(u.id);
    }
  });

  it('picks up Daniel and returns his email for the notify API', () => {
    const text = 'checked the inverter, @dmatos can you confirm the RMA?';
    expect(parseMentions(text, STAFF)).toEqual([DANIEL]);
    expect(parseMentionEmails(text, STAFF)).toEqual(['daniel.matos@conexsol.us']);
  });

  it('resolves a hand-typed full name that omits the role suffix', () => {
    expect(parseMentions('@danielmatos can you look?', STAFF)).toEqual([DANIEL]);
  });

  it('does not double-report the same person', () => {
    expect(parseMentions('@dmatos and @dmatos again', STAFF)).toEqual([DANIEL]);
  });

  it('ignores an unknown handle and a bare email address', () => {
    expect(parseMentions('@nobody here', STAFF)).toEqual([]);
    expect(parseMentions('mail me at bob@example.com', STAFF)).toEqual([]);
  });
});
