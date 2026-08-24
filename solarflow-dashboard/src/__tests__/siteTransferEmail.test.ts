import { describe, it, expect } from 'vitest';
import { buildSiteTransferMailto, OFFICE_CC } from '../lib/siteTransferEmail';

describe('buildSiteTransferMailto', () => {
  const url = buildSiteTransferMailto({
    customerEmail: 'micheal73279@hotmail.com',
    customerName: 'Micheal Kim',
    orderNo: 'SO-30577',
  });
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));

  it('addresses the customer and CCs the office', () => {
    expect(url.startsWith('mailto:micheal73279%40hotmail.com?')).toBe(true);
    expect(params.get('cc')).toBe(OFFICE_CC);
  });

  it('carries the order number in the subject', () => {
    expect(params.get('subject')).toBe('Information needed for your site transfer, SO-30577');
  });

  it('greets by name and asks for both identifiers', () => {
    const body = params.get('body') ?? '';
    expect(body).toContain('Hello Micheal Kim,');
    expect(body).toContain('Site ID:');
    expect(body).toContain('Full inverter serial number:');
  });

  it('falls back gracefully with no name and no order number', () => {
    const bare = buildSiteTransferMailto({ customerEmail: 'a@b.com', customerName: '' });
    const p = new URLSearchParams(bare.slice(bare.indexOf('?') + 1));
    expect(p.get('subject')).toBe('Information needed for your site transfer');
    expect(p.get('body')).toContain('Hello there,');
  });
});
