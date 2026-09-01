// Regression for 2026-09-01: "Move to Client" on the Danielle Ferrari lead
// claimed US-15688 from the registry sheet, but that number had been hand-typed
// onto Andres Jimenez hours earlier. The duplicate guard matched him, so her
// call logs were absorbed into his record and her card was wired to his id.
import { describe, it, expect } from 'vitest';
import { clientNumberOwner } from '../lib/leadConvert';

const jimenez = { id: 'cust-1787745932670', name: 'Andres Jimenez', clientId: 'US-15688' };

describe('clientNumberOwner', () => {
  it('flags a freshly claimed number that is already on another client', () => {
    expect(clientNumberOwner([jimenez], 'US-15688')?.name).toBe('Andres Jimenez');
  });

  it('ignores whitespace drift on the stored number', () => {
    expect(clientNumberOwner([{ ...jimenez, clientId: ' US-15688 ' }], 'US-15688')).toBeTruthy();
  });

  it('lets a genuinely free number through', () => {
    expect(clientNumberOwner([jimenez], 'US-15689')).toBeUndefined();
  });

  it('never matches on a blank number', () => {
    expect(clientNumberOwner([{ ...jimenez, clientId: '' }], '')).toBeUndefined();
    expect(clientNumberOwner([{ ...jimenez, clientId: undefined }], undefined)).toBeUndefined();
  });

  it('excuses the lead re-converting onto its own customer', () => {
    expect(clientNumberOwner([jimenez], 'US-15688', 'cust-1787745932670')).toBeUndefined();
  });
});
