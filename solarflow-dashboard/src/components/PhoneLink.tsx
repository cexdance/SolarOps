import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Phone, MessageSquare } from 'lucide-react';
import { phoneHref, normalizePhoneNumber, type PhoneAction } from '../lib/ringcentral';

interface PhoneLinkProps {
  phone?: string;
  className?: string;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
  action?: PhoneAction;
  onAction?: (action: PhoneAction) => void;
  title?: string;
}

/** A top-layer chooser stays visible inside scrolling tables and mobile panels.
 * Real anchors keep the OS handoff directly attached to the user's tap. */
export const PhoneLink: React.FC<PhoneLinkProps> = ({ phone, className, size = 'sm', children, action, onAction, title }) => {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus();
  };
  if (!phone || !normalizePhoneNumber(phone)) return children ? <button type="button" disabled className={className} aria-label="Phone number unavailable">{children}</button> : <>{phone}</>;
  const actions: PhoneAction[] = action ? [action] : ['call', 'sms'];
  return <>
    <button ref={trigger} type="button" title={title} aria-label={`${action === 'call' ? 'Call' : action === 'sms' ? 'Text' : 'Call or text'} ${phone}`}
      aria-haspopup="dialog" aria-expanded={open}
      onClick={e => { e.stopPropagation(); setOpen(true); }}
      className={className ?? `${size === 'md' ? 'text-sm' : 'text-xs sm:text-sm'} font-medium text-orange-600 hover:text-orange-500 underline-offset-2 hover:underline`}>
      {children ?? phone}
    </button>
    {open && createPortal(
      <dialog ref={dialog} aria-labelledby={headingId}
        className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl bg-white p-5 shadow-xl backdrop:bg-black/40"
        onCancel={e => { e.preventDefault(); close(); }}
        onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}>
        <div onClick={e => e.stopPropagation()}>
          <h2 id={headingId} className="text-lg font-semibold text-slate-900">{phone}</h2>
          <p className="mt-1 text-sm text-slate-500">Choose how to connect</p>
          {(['device', 'ringcentral'] as const).map(provider => <div key={provider} className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">{provider === 'device' ? 'Phone / Messages' : 'RingCentral'}</p>
            <div className="flex gap-2">
              {actions.map(kind => <a key={kind} href={phoneHref(phone, kind, provider)}
                onClick={e => { e.stopPropagation(); if (onAction) { dialog.current?.close(); onAction(kind); setOpen(false); } }}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-200">
                {kind === 'call' ? <Phone className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                {kind === 'call' ? 'Call' : 'SMS'}
              </a>)}
            </div>
          </div>)}
          <p className="mt-3 text-xs text-slate-500">Phone / Messages uses your device’s default apps. RingCentral requires the app to be installed and signed in.</p>
          <button type="button" onClick={close} className="mt-4 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">Close</button>
        </div>
      </dialog>, document.body)}
  </>;
};

export default PhoneLink;
