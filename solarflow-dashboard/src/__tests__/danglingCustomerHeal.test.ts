import { describe, it, expect } from 'vitest';
import { hasDanglingCustomerRef } from '../lib/dataStore';

// This predicate decides whether a device forces a full reconcile. A false
// negative leaves a client permanently invisible (the US-15674 report); a false
// positive puts every device into a reconcile on every boot.
describe('hasDanglingCustomerRef', () => {
  const none = new Set<string>();

  it('spots the reported case: job present, its customer missing', () => {
    const jobs = [{ customerId: 'cust-1786033162788' }];       // SO-2608-77819
    const customers = [{ id: 'cust-other' }];                   // US-15674 absent
    expect(hasDanglingCustomerRef(jobs, customers, none)).toBe(true);
  });

  it('stays quiet when every reference resolves', () => {
    const jobs = [{ customerId: 'cust-1' }, { customerId: 'cust-2' }];
    const customers = [{ id: 'cust-1' }, { id: 'cust-2' }];
    expect(hasDanglingCustomerRef(jobs, customers, none)).toBe(false);
  });

  it('ignores a job whose customer was deliberately deleted', () => {
    // An orphan, not a hole. Healing this would reconcile forever.
    const jobs = [{ customerId: 'cust-gone' }];
    expect(hasDanglingCustomerRef(jobs, [{ id: 'cust-1' }], new Set(['cust-gone']))).toBe(false);
  });

  it('ignores jobs with no customer at all', () => {
    // S1 leads carry no customerId and must not trigger anything.
    expect(hasDanglingCustomerRef([{}, { customerId: '' }], [{ id: 'cust-1' }], none)).toBe(false);
  });

  it('still fires when only one job among many dangles', () => {
    const jobs = [{ customerId: 'cust-1' }, { customerId: 'cust-missing' }, { customerId: 'cust-1' }];
    expect(hasDanglingCustomerRef(jobs, [{ id: 'cust-1' }], none)).toBe(true);
  });
});
