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
