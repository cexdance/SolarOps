// A second "Move to Client" click during the registry round trip must not run a
// second conversion. On 2026-09-08 it did: Daniel Torres was clicked twice 2.9s
// apart, claimed US-15699 and US-15700, and became two clients. The duplicate
// guard downstream cannot catch it, because each click carries a different
// freshly minted clientId.
//
// The guard has two halves and this file covers the one that is testable with
// what the project already has (renderToStaticMarkup, no testing-library):
// the button must go disabled and say so. The other half, the ref in
// Jobs.tsx:handleConvertLead that blocks a same-tick re-entry, is 4 lines with
// no seam to test from here; the `disabled` attribute below is what actually
// stops the operator's second click reaching it.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { LeadPanel } from '../components/LeadPanel';
import type { Job } from '../types';

const lead = {
  id: 'job-lead-1',
  clientName: 'Daniel Torres',
  leadInfo: { firstName: 'Daniel', lastName: 'Torres', phone: '3054346454' },
  activityHistory: [],
} as unknown as Job;

const markup = (converting?: boolean) =>
  renderToStaticMarkup(
    <LeadPanel
      job={lead}
      onSave={() => {}}
      onClose={() => {}}
      onConvertToClient={() => {}}
      converting={converting}
    />,
  );

/**
 * The opening <button> tag of the button whose text contains `label`.
 *
 * Assertions must run against this tag alone, and against the `disabled=""`
 * ATTRIBUTE rather than the substring "disabled": the button's own Tailwind
 * classes include `disabled:opacity-60`, so a naive toContain('disabled')
 * passes whether or not the button is actually disabled. It did, at first.
 */
function buttonTagFor(html: string, label: string): string {
  const tags = [...html.matchAll(/<button[^>]*>/g)];
  for (let i = 0; i < tags.length; i++) {
    const start = tags[i].index!;
    const body = html.slice(start, html.indexOf('</button>', start));
    if (body.includes(label)) return tags[i][0];
  }
  throw new Error(`no <button> containing ${JSON.stringify(label)} was rendered`);
}

describe('Move to Client, while the client number is being claimed', () => {
  it('disables the button so a second click cannot start a second conversion', () => {
    expect(buttonTagFor(markup(true), 'Claiming number')).toMatch(/\sdisabled(=""|\s|>)/);
  });

  it('says what it is doing instead of looking untouched', () => {
    expect(markup(true)).toContain('Claiming number...');
  });

  it('is a live, enabled button the rest of the time', () => {
    expect(buttonTagFor(markup(false), 'Move to Client')).not.toMatch(/\sdisabled(=""|\s|>)/);
  });
});
