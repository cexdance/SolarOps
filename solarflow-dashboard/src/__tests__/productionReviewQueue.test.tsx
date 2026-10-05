import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionReviewQueue } from '../components/ProductionReviewQueue';
import { authedFetch } from '../lib/supabase';
vi.mock('../lib/supabase', () => ({ authedFetch: vi.fn() }));
const review = { id: 'test-incident', siteId: 42, name: 'Test site', kind: 'production', finding: { kind: 'production', detail: 'Production down 40%' }, openedAt: '2026-10-04T00:00:00Z', lastCheckedAt: '2026-10-04T00:00:00Z', active: false, status: 'open' };
let root: Root; let container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function button(text: string) { return [...container.querySelectorAll('button')].find(b => b.textContent === text)!; }
describe('production review queue interactions', () => {
  it('keeps recovered incidents pending and toggles review history', async () => {
    vi.mocked(authedFetch).mockResolvedValue(new Response(JSON.stringify({ reviews: [review], recipients: [] })));
    await act(async () => root.render(<ProductionReviewQueue role="technician" />));
    expect(container.textContent).toContain('Condition recovered; review still open'); expect(button('Record review')).toBeUndefined();
    await act(async () => button('Show history').click()); expect(button('Show pending')).toBeDefined();
  });
  it('requires notes, completes a review and submits the selected incident', async () => {
    vi.mocked(authedFetch).mockImplementation(async (_url, options) => new Response(JSON.stringify({ reviews: [{ ...review, status: options?.method === 'POST' ? 'reviewed' : 'open' }], recipients: [] })));
    await act(async () => root.render(<ProductionReviewQueue role="support" />));
    await act(async () => button('Record review').click()); expect(button('Complete review').disabled).toBe(true);
    const textarea = container.querySelector('textarea')!;
    await act(async () => { textarea.value = 'Weather checked. Follow up tomorrow.'; Simulate.change(textarea); });
    expect(button('Complete review').disabled).toBe(false);
    await act(async () => Simulate.submit(container.querySelector('form')!));
    const options = vi.mocked(authedFetch).mock.calls[1]![1]!;
    expect(JSON.parse(options.body as string)).toEqual({ id: 'test-incident', status: 'reviewed', notes: 'Weather checked. Follow up tomorrow.' }); expect(container.textContent).toContain('No sites awaiting review.');
  });
  it('shows a readable error for a stale endpoint response', async () => {
    vi.mocked(authedFetch).mockResolvedValue(new Response('{"sites":{}}'));
    await act(async () => root.render(<ProductionReviewQueue role="admin" />)); expect(container.querySelector('[role="alert"]')?.textContent).toContain('Refresh after deployment');
  });
});
