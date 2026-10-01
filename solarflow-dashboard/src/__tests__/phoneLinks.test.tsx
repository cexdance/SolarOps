import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneLink } from '../components/PhoneLink';
import { normalizePhoneNumber, phoneHref } from '../lib/ringcentral';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const containers: HTMLDivElement[] = [];
afterEach(() => { containers.forEach(c => c.remove()); containers.length = 0; vi.restoreAllMocks(); });

describe('phone handoff', () => {
  it('preserves international prefixes and excludes extensions', () => {
    expect(normalizePhoneNumber('+44 (20) 7946-0123')).toBe('+442079460123');
    expect(normalizePhoneNumber('(212) 555-0100 ext. 123')).toBe('2125550100');
    expect(phoneHref('not available', 'call', 'device')).toBeUndefined();
    expect(phoneHref('', 'sms', 'ringcentral')).toBeUndefined();
  });
  it('uses native iPhone schemes and the documented RingCentral SMS route', () => {
    expect(phoneHref('+1 (212) 555-0100', 'call', 'device')).toBe('tel:+12125550100');
    expect(phoneHref('+1 (212) 555-0100', 'sms', 'device')).toBe('sms:+12125550100');
    expect(phoneHref('+1 (212) 555-0100', 'call', 'ringcentral')).toBe('rcmobile://call?number=%2B12125550100');
    expect(phoneHref('+1 (212) 555-0100', 'sms', 'ringcentral')).toBe('rcmobile://sms?number=%2B12125550100');
  });
  it('opens all four real links outside clipping parents without triggering row clicks', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
    const container = document.createElement('div'); document.body.appendChild(container); containers.push(container);
    const root = createRoot(container);
    const rowClick = vi.fn(); const onAction = vi.fn();
    await act(async () => root.render(<div onClick={rowClick} style={{overflow: 'hidden'}}><PhoneLink phone="+1 212-555-0100" /></div>));
    await act(async () => container.querySelector('button')!.click());
    const dialog = document.querySelector('dialog')!;
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.open).toBe(true);
    expect(rowClick).not.toHaveBeenCalled();
    const links = [...dialog.querySelectorAll('a')];
    expect(links.map(a => a.getAttribute('href'))).toEqual(['tel:+12125550100', 'sms:+12125550100', 'rcmobile://call?number=%2B12125550100', 'rcmobile://sms?number=%2B12125550100']);
    // Avoid an actual OS launch while testing that React leaves navigation enabled.
    links[1].href = '#';
    const tap = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { links[1].dispatchEvent(tap); });
    expect(tap.defaultPrevented).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
    expect(rowClick).not.toHaveBeenCalled();
    await act(async () => dialog.querySelector('button')!.click());
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('button'));
    await act(async () => root.unmount());
  });
});
