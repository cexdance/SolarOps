// Work typed in the visit box must not be lost when the user clicks
// Save Changes instead of "Add work": leaving the box adds it.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import VisitLaborEditor from '../components/VisitLaborEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('VisitLaborEditor', () => {
  it('adds typed work when focus leaves the box', () => {
    const onChange = vi.fn();
    const host = document.createElement('div'); document.body.appendChild(host);
    const outside = document.createElement('button'); document.body.appendChild(outside);
    act(() => createRoot(host).render(<VisitLaborEditor visitId="v1" entries={[]} onChange={onChange} />));
    const [desc, hours] = Array.from(host.querySelectorAll('input'));
    act(() => { type(desc, 'Commissioned inverter'); type(hours, '2'); });
    act(() => { hours.focus(); outside.focus(); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ visitId: 'v1', description: 'Commissioned inverter', hours: 2 });
  });
});
