import { describe, it, expect } from 'vitest';
import {
  greetingFor,
  leadOutreachBody,
  leadOutreachMailto,
  LEAD_OUTREACH_SUBJECT,
  CONEXSOL_PHONE,
} from '../lib/leadOutreach';

const at = (hour: number) => new Date(2026, 8, 30, hour, 0, 0);

// No senderPhone: the app never passes one, so this mirrors real calls.
const full = {
  customerFirstName: 'Maria',
  senderFullName: 'Cesar Jurado',
  now: at(9),
};

describe('lead outreach template', () => {
  it('greets by the sender local clock, including the boundaries', () => {
    expect(greetingFor(at(0))).toBe('Good morning');
    expect(greetingFor(at(11))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17))).toBe('Good afternoon');
    expect(greetingFor(at(18))).toBe('Good evening');
    expect(greetingFor(at(23))).toBe('Good evening');
  });

  it('fills every placeholder, leaving no {{token}} behind', () => {
    const body = leadOutreachBody(full);
    expect(body).not.toMatch(/\{\{.*?\}\}/);
    expect(body.startsWith('Good morning Maria,')).toBe(true);
    expect(body).toContain("I'm Cesar Jurado with Conexsol.");
    expect(body).toContain(`call us at ${CONEXSOL_PHONE},`);
    expect(body).toContain('Conexsol | Solar Operations and Maintenance');
    // sender name appears in the opener and again in the signature
    expect(body.match(/Cesar Jurado/g)).toHaveLength(2);
  });

  it('drops the comma dangle when the import had no first name', () => {
    const body = leadOutreachBody({ ...full, customerFirstName: undefined });
    expect(body.startsWith('Good morning,')).toBe(true);
    expect(body).not.toContain('Good morning ,');
  });

  it('uses the company line by default, in both the CTA and the signature', () => {
    expect(CONEXSOL_PHONE).toBe('(305) 395-5404');
    const body = leadOutreachBody(full);
    expect(body.match(new RegExp(CONEXSOL_PHONE.replace(/[().\-\s]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(body.trimEnd().endsWith(CONEXSOL_PHONE)).toBe(true);
  });

  it('never emits "call us at ," if the phone is ever blanked out', () => {
    const body = leadOutreachBody({ ...full, senderPhone: '' });
    expect(body).not.toContain('call us at');
    expect(body).toContain("Just reply to this email and we'll get on the phone");
    // signature ends on the company line, with no empty phone line after it
    expect(body.trimEnd().endsWith('Conexsol | Solar Operations and Maintenance')).toBe(true);
  });

  it('falls back to a usable sender when the profile name is missing', () => {
    const body = leadOutreachBody({ ...full, senderFullName: undefined });
    expect(body).toContain("I'm the Conexsol team with Conexsol.");
  });

  it('builds a mailto whose decoded parts match the body', () => {
    const url = leadOutreachMailto(' lead@example.com ', full);
    expect(url.startsWith('mailto:lead%40example.com?')).toBe(true);
    const qs = new URLSearchParams(url.slice(url.indexOf('?') + 1));
    expect(qs.get('subject')).toBe(LEAD_OUTREACH_SUBJECT);
    expect(qs.get('body')).toBe(leadOutreachBody(full));
    // newlines must survive encoding, or the mail app renders one long line
    expect(url).toContain('%0A');
  });
});
