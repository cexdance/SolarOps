import { describe, it, expect } from 'vitest';
import { toDateInputValue, dateInputToISO } from '../components/Billing';

describe('close-out date', () => {
  it('defaults the picker to TODAY in local time', () => {
    const now = new Date(2026, 7, 21, 22, 30); // 21 Aug, late evening local
    // toISOString().slice(0,10) would say the 22nd here for any positive offset
    // and the 21st only by luck. Local parts are the only correct source.
    expect(toDateInputValue(now)).toBe('2026-08-21');
  });

  it('pads single-digit months and days', () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trips a picked date back to the SAME calendar day', () => {
    // The bug this guards: new Date('2026-08-21') is UTC midnight, which is
    // 20 Aug in every US timezone, so the contractor would see "Paid Aug 20".
    for (const day of ['2026-01-01', '2026-08-21', '2026-12-31']) {
      const iso = dateInputToISO(day);
      expect(iso).toBeTruthy();
      expect(toDateInputValue(new Date(iso as string))).toBe(day);
    }
  });

  it('anchors at local midday so no timezone can shift the day', () => {
    const d = new Date(dateInputToISO('2026-08-21') as string);
    expect(d.getHours()).toBe(12);
    expect(d.getDate()).toBe(21);
  });

  it('rejects junk instead of writing a bad close-out date', () => {
    for (const bad of ['', 'today', '21-08-2026', '2026-8-1', '2026-13-45']) {
      expect(dateInputToISO(bad)).toBeNull();
    }
  });
});
