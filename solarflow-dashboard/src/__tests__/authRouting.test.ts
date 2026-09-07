import { describe, it, expect } from 'vitest';
import {
  resolveSessionRoute,
  isContractorAccount,
  requiresPasswordChange,
  SessionContractor,
} from '../lib/authRouting';

// Regression guard for the CRITICAL access-control rule: a contractor account
// must NEVER be routed into the staff app. These pin the routing decision used
// by both the durable-session restore and the staff-login screen.

const contractors: SessionContractor[] = [
  { id: 'contractor-4', email: 'j.mendez@ingenieriageneral.com', altEmails: ['jmendez@ingengroup.com'], status: 'approved' },
  { id: 'contractor-9', email: 'pending@example.com', status: 'pending' },
  { id: 'contractor-2', email: 'cjurado@mpowermarketing.com', status: 'approved' },
];

describe('isContractorAccount', () => {
  it('is true only when role === contractor', () => {
    expect(isContractorAccount({ role: 'contractor' })).toBe(true);
    expect(isContractorAccount({ role: 'admin' })).toBe(false);
    expect(isContractorAccount({ role: 'technician' })).toBe(false);
    expect(isContractorAccount({})).toBe(false);
    expect(isContractorAccount(null)).toBe(false);
    expect(isContractorAccount(undefined)).toBe(false);
  });

  it('dual-role staff (staff role + isContractor flag) are NOT pure contractors', () => {
    expect(isContractorAccount({ role: 'admin', isContractor: true })).toBe(false);
  });
});

describe('resolveSessionRoute', () => {
  it('routes staff roles to staff', () => {
    expect(resolveSessionRoute({ role: 'admin' }, 'boss@x.com', contractors)).toEqual({ route: 'staff' });
    expect(resolveSessionRoute({ role: 'technician' }, 't@x.com', contractors)).toEqual({ route: 'staff' });
    expect(resolveSessionRoute({}, 'x@x.com', contractors)).toEqual({ route: 'staff' });
  });

  it('routes an approved contractor to the contractor portal', () => {
    expect(
      resolveSessionRoute({ role: 'contractor' }, 'j.mendez@ingenieriageneral.com', contractors),
    ).toEqual({ route: 'contractor', contractorId: 'contractor-4' });
  });

  it('matches a contractor by altEmail and is case-insensitive', () => {
    expect(
      resolveSessionRoute({ role: 'contractor' }, 'JMENDEZ@ingengroup.com', contractors),
    ).toEqual({ route: 'contractor', contractorId: 'contractor-4' });
  });

  it('DENIES a contractor-role session with no matching record (never falls to staff)', () => {
    expect(
      resolveSessionRoute({ role: 'contractor' }, 'stranger@nowhere.com', contractors),
    ).toEqual({ route: 'deny' });
  });

  it('DENIES a contractor whose record is not approved (pending/rejected/suspended)', () => {
    expect(
      resolveSessionRoute({ role: 'contractor' }, 'pending@example.com', contractors),
    ).toEqual({ route: 'deny' });
  });

  it('a contractor-role session is NEVER routed to staff', () => {
    for (const email of ['j.mendez@ingenieriageneral.com', 'stranger@nowhere.com', 'pending@example.com']) {
      const r = resolveSessionRoute({ role: 'contractor' }, email, contractors);
      expect(r.route).not.toBe('staff');
    }
  });
});


describe('password-change restoration', () => {
  it('preserves an auth requirement across either portal even without a cached flag', () => {
    expect(requiresPasswordChange({ mustChangePassword: true }, false)).toBe(true);
  });
  it('does not reinstate a completed change from stale contractor data', () => {
    expect(requiresPasswordChange({ mustChangePassword: false }, true)).toBe(false);
  });
  it('honors legacy contractor requirements when auth metadata has no decision', () => {
    expect(requiresPasswordChange({}, true)).toBe(true);
    expect(requiresPasswordChange(null)).toBe(false);
  });
});

describe('contractor identity guard', () => {
  it('never matches an empty authenticated identity to an empty cached email', () => {
    expect(resolveSessionRoute({ role: 'contractor' }, '', [{ id: 'empty', email: '', status: 'approved' }])).toEqual({ route: 'deny' });
  });
  it.each(['suspended', 'rejected', 'pending'])('denies %s cached accounts', status => {
    expect(resolveSessionRoute({ role: 'contractor' }, 'test@example.com', [{ id: 'test', email: 'test@example.com', status }])).toEqual({ route: 'deny' });
  });
});
