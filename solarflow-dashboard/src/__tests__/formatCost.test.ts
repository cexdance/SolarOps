/**
 * Operational costs vs the hidden commercial layer.
 *
 * `SHOW_MONEY` is false while stakeholders test the platform ahead of the Xero
 * integration, and `formatMoney` blanks every commercial figure (client rates,
 * quotes, revenue, margins, contractor pay) to "-".
 *
 * Costs the user typed in themselves are NOT part of that rule. A contractor who
 * logs a $48.25 receipt or a $120 part has to be able to read it back, and the
 * office needs it to price the quote. These tests pin that distinction so a
 * future sweep cannot quietly blank field-entered costs again.
 */
import { describe, it, expect } from 'vitest';
import { formatCost, formatMoney, SHOW_MONEY, MONEY_HIDDEN } from '../lib/money';

describe('formatCost (operational, always visible)', () => {
  it('shows a contractor-entered amount even while money is globally hidden', () => {
    expect(SHOW_MONEY).toBe(false);
    expect(formatMoney(48.25)).toBe(MONEY_HIDDEN); // commercial layer stays dark
    expect(formatCost(48.25)).toBe('$48.25');      // what the tech typed is readable
  });

  it('formats a computed line total', () => {
    expect(formatCost(120 * 2)).toBe('$240.00');
  });

  it('honours a decimals override', () => {
    expect(formatCost(240, { decimals: 0 })).toBe('$240');
  });

  it('falls back for null/undefined/NaN rather than printing $NaN', () => {
    expect(formatCost(null)).toBe(MONEY_HIDDEN);
    expect(formatCost(undefined)).toBe(MONEY_HIDDEN);
    expect(formatCost(Number('nope'))).toBe(MONEY_HIDDEN);
    expect(formatCost(null, { blank: 'not priced' })).toBe('not priced');
  });

  it('shows a genuine zero rather than treating it as missing', () => {
    expect(formatCost(0)).toBe('$0.00');
  });
});
