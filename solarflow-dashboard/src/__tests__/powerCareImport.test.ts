import { describe, it, expect } from 'vitest';
import { mapRowToContact, rowToNotes, rowToPowerCareRecords } from '../lib/leadImport';
import { generateServiceOrderNumber } from '../lib/woHelpers';
import { findPowercareCaseNo } from '../lib/woHelpers';

// One real row from "Cases for Conexsol 8.31.26.xlsx", the export this path exists for.
const row = {
  'Case Number': 7162665,
  'RMA Street': '5604 Northwest 189th Terrace',
  'RMA City': 'Miami Gardens',
  'RMA State': 'Florida',
  'RMA Zip/Postal Code': 33169,
  'Site Main Contact Email': 'Carlosdiaz88@me.com',
  'Site Main Contact Phone': "'+17863020089",   // Excel text-forces with a leading '
  'Site Main Contact Name': 'CARLOS DIAZ',
  'Shipping Tracking Number': '1Z769A050307707031',
  'Actual Ship Date': 46261.558333333334,   // number-formatted, arrives as a day serial
  'Part Number (old)': 'SE10000H-US000BEU4',
  'Serial Number (old)': 'SV2422-0740BF7B7-2D',
  'Work Description (Internal comments)': 'V-CAP Inverter Replacement, Restore Communication',
  'Account Name': 'SolarEdge Power Care Premium',
  'RMA Country': '',
};

describe('mapRowToContact', () => {
  it('maps contact fields and strips the Excel text-force apostrophe', () => {
    const c = mapRowToContact(row);
    expect(c.firstName).toBe('CARLOS');
    expect(c.lastName).toBe('DIAZ');
    expect(c.phone).toBe('7863020089');
    expect(c.email).toBe('Carlosdiaz88@me.com');
    expect(c.address).toBe('5604 Northwest 189th Terrace');
    expect(c.zip).toBe('33169');
    expect(c.caseNumber).toBe('7162665');
    expect(c.trackingNumber).toBe('1Z769A050307707031');
  });

  it('carries every unmapped column into the notes, dates included', () => {
    const notes = mapRowToContact(row).notes ?? '';
    expect(notes).toContain('Part Number (old): SE10000H-US000BEU4');
    expect(notes).toContain('Serial Number (old): SV2422-0740BF7B7-2D');
    expect(notes).toContain('Account Name: SolarEdge Power Care Premium');
    // Excel itself displays this cell as the bare number '46261.55833'; agrees
    // with XLSX.SSF.parse_date_code, which reads it as 2026-08-27 13:24.
    expect(notes).toContain('Actual Ship Date: 2026-08-27');
    expect(notes).toContain('V-CAP Inverter Replacement');
    expect(notes).toContain('RMA State: Florida');              // ignored for the form, kept here
    expect(notes).not.toContain('RMA Country');                // empty cells dropped
  });

  it('leads the notes with a case line findPowercareCaseNo can read back', () => {
    const notes = mapRowToContact(row).notes ?? '';
    expect(notes.startsWith('Case #: 7162665')).toBe(true);
    expect(findPowercareCaseNo({ job: { notes } })).toBe('7162665');
  });
});

describe('rowToNotes', () => {
  it('skips columns that already have a form field', () => {
    const notes = rowToNotes(row);
    expect(notes).not.toContain('Site Main Contact Name');
    expect(notes).not.toContain('RMA Street');
    expect(notes).not.toContain('Case Number');
  });
});

describe('rowToPowerCareRecords', () => {
  it('marks the customer PowerCare and hangs the case number off it', () => {
    const { customer } = rowToPowerCareRecords(row, 'SO-2609-00001');
    expect(customer.isPowerCare).toBe(true);
    expect(customer.name).toBe('CARLOS DIAZ');
    expect(customer.powerCareCaseNumber).toBe('7162665');
    expect(customer.powerCareTrackingNumber).toBe('1Z769A050307707031');
  });

  it('creates a service order (woNumber present) at the PowerCare entry stage', () => {
    const { job } = rowToPowerCareRecords(row, 'SO-2609-00001');
    expect(job.woNumber).toBe('SO-2609-00001');   // isServiceOrder = !!woNumber
    expect(job.woStatus).toBe('contact_client');
    expect(job.isPowercare).toBe(true);
    expect(job.clientName).toBe('CARLOS DIAZ');
    // State stays 'FL': mapRowToContact deliberately ignores "RMA State", which
    // is preserved in the notes instead.
    expect(job.siteAddress).toBe('5604 Northwest 189th Terrace, Miami Gardens, FL, 33169');
  });

  it('puts the case number on the SO header via the order notes alone', () => {
    const { job } = rowToPowerCareRecords(row, 'SO-2609-00001');
    expect(findPowercareCaseNo({ job: { notes: job.notes } })).toBe('7162665');
  });
});

describe('generateServiceOrderNumber', () => {
  it('never repeats inside one millisecond, so a bulk import cannot collapse rows', () => {
    const nums = Array.from({ length: 50 }, () => generateServiceOrderNumber());
    expect(new Set(nums).size).toBe(50);
  });
});

// --- Re-import safety -------------------------------------------------------
// The 8.31.26 sheet was first imported by hand, one row at a time, before the
// bulk path existed: both customers were already on file with a claimed
// US-XXXXX and nothing else. Re-running the sheet must enrich those, not clone
// them.
import { matchExistingCustomer, findOrderForCase, enrichCustomerFromRow } from '../lib/leadImport';

const onFile = [
  { id: 'cust-1788285446169', name: 'CARLOS DIAZ', email: 'Carlosdiaz88@me.com', phone: '7863020089',
    clientId: 'US-15689', notes: '' },
  { id: 'cust-1788285518430', name: 'Wilber Vega', email: 'wilbervega25@gmail.com', phone: '8139938671',
    clientId: 'US-15690', notes: '' },
];

describe('matchExistingCustomer', () => {
  it('matches the record already on file by email, case-insensitively', () => {
    const c = mapRowToContact(row);
    expect(matchExistingCustomer(onFile, c)?.clientId).toBe('US-15689');
  });

  it('falls back to phone when the sheet has no email', () => {
    const c = mapRowToContact({ ...row, 'Site Main Contact Email': '' });
    expect(matchExistingCustomer(onFile, c)?.clientId).toBe('US-15689');
  });

  it('falls back to name when the sheet has neither', () => {
    const c = mapRowToContact({ ...row, 'Site Main Contact Email': '', 'Site Main Contact Phone': '' });
    expect(matchExistingCustomer(onFile, c)?.clientId).toBe('US-15689');
  });

  it('a blank key matches NOTHING, or every record with no email collapses into one', () => {
    const blanks = [{ id: 'a', name: '', email: '', phone: '' }];
    expect(matchExistingCustomer(blanks, { firstName: '', lastName: '', email: '', phone: '' })).toBeUndefined();
  });

  it('does not match a different person', () => {
    const c = mapRowToContact({ 'Site Main Contact Name': 'Nobody Here', 'Site Main Contact Email': 'x@y.z' });
    expect(matchExistingCustomer(onFile, c)).toBeUndefined();
  });
});

describe('enrichCustomerFromRow', () => {
  it('sets the PowerCare fields the hand entry never had, keeping the record', () => {
    const patch = enrichCustomerFromRow(onFile[0], mapRowToContact(row));
    expect(patch.isPowerCare).toBe(true);
    expect(patch.powerCareCaseNumber).toBe('7162665');
    expect(patch.powerCareTrackingNumber).toBe('1Z769A050307707031');
    expect(patch.notes).toContain('Case #: 7162665');
    expect(patch).not.toHaveProperty('name');      // never overwrites reviewed fields
    expect(patch).not.toHaveProperty('clientId');
  });

  it('is idempotent: a second run does not stack the same block twice', () => {
    const c = mapRowToContact(row);
    const once = enrichCustomerFromRow(onFile[0], c);
    const twice = enrichCustomerFromRow({ ...onFile[0], ...once }, c);
    expect(twice.notes).toBe(once.notes);
  });

  it('keeps a case number already on the record rather than overwriting it', () => {
    const patch = enrichCustomerFromRow({ ...onFile[0], powerCareCaseNumber: '999' }, mapRowToContact(row));
    expect(patch.powerCareCaseNumber).toBe('999');
  });
});

describe('findOrderForCase', () => {
  const withOrder = [{ woNumber: 'SO-2609-00001', notes: 'Case #: 7162665\nV-CAP' }];
  it('finds the order already opened for a case', () => {
    expect(findOrderForCase(withOrder, '7162665')?.woNumber).toBe('SO-2609-00001');
  });
  it('does not match a different case, or a case number embedded in a longer number', () => {
    expect(findOrderForCase(withOrder, '7099775')).toBeUndefined();
    expect(findOrderForCase([{ woNumber: 'x', notes: 'Case #: 71626650' }], '7162665')).toBeUndefined();
  });
  it('ignores a lead with no woNumber, since only orders count', () => {
    expect(findOrderForCase([{ notes: 'Case #: 7162665' }], '7162665')).toBeUndefined();
  });
  it('a blank case number matches nothing', () => {
    expect(findOrderForCase(withOrder, '')).toBeUndefined();
  });
});

// --- The sheet contents must land in the COMMENTS ---------------------------
// The client card renders activityHistory through ActivityFeed; `notes` is a
// separate field that does not show there. Contents in notes alone read as an
// empty import on the surface people actually look at.
import { sheetImportActivity } from '../lib/leadImport';

describe('sheet contents in the comments', () => {
  it('a new customer AND its order both carry the sheet block as a comment', () => {
    const { customer, job } = rowToPowerCareRecords(row, 'SO-2609-00001');
    for (const rec of [customer, job]) {
      const c = rec.activityHistory?.[0];
      expect(c?.type).toBe('note_added');
      expect(c?.description).toContain('Part Number (old): SE10000H-US000BEU4');
      expect(c?.description).toContain('Serial Number (old): SV2422-0740BF7B7-2D');
      expect(c?.description).toContain('Account Name: SolarEdge Power Care Premium');
      expect(c?.description).toContain('Actual Ship Date: 2026-08-27');
      expect(c?.description).toContain('Case #: 7162665');
    }
  });

  it('enriching a customer already on file adds the comment', () => {
    const patch = enrichCustomerFromRow(onFile[0], mapRowToContact(row));
    expect(patch.activityHistory).toHaveLength(1);
    expect(patch.activityHistory?.[0].description).toContain('Serial Number (old): SV2422-0740BF7B7-2D');
  });

  it('re-importing does not stack a second copy of the same comment', () => {
    const c = mapRowToContact(row);
    const once = enrichCustomerFromRow(onFile[0], c);
    const twice = enrichCustomerFromRow({ ...onFile[0], ...once }, c);
    expect(twice.activityHistory).toHaveLength(1);
  });

  it('keeps comments the record already had', () => {
    const prior = { id: 'a1', type: 'note_added' as const, description: 'Called client', timestamp: 'x' };
    const patch = enrichCustomerFromRow({ ...onFile[0], activityHistory: [prior] }, mapRowToContact(row));
    expect(patch.activityHistory).toHaveLength(2);
    expect(patch.activityHistory?.map(a => a.id)).toContain('a1');
  });

  it('keys the comment id off the case number so it is stable across runs', () => {
    expect(sheetImportActivity(mapRowToContact(row)).id).toBe('xls-case-7162665');
  });
});
