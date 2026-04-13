// PhoneLink — shows a phone number; clicking it reveals Call / SMS buttons
// that trigger the RingCentral desktop/mobile app via rcmobile:// deep links.

import React, { useState, useRef, useEffect } from 'react';
import { Phone, MessageSquare } from 'lucide-react';
import { rcCall, rcSMS } from '../lib/ringcentral';

interface PhoneLinkProps {
  phone: string;
  className?: string;
  /** Size variant: 'sm' (default) or 'md' */
  size?: 'sm' | 'md';
}

export const PhoneLink: React.FC<PhoneLinkProps> = ({ phone, className = '', size = 'sm' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!phone) return null;

  const textClass = size === 'md' ? 'text-sm' : 'text-xs sm:text-sm';

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${textClass} font-medium text-orange-600 hover:text-orange-500 transition-colors underline-offset-2 hover:underline ${className}`}
      >
        {phone}
      </button>

      {open && (
        <span className="absolute bottom-full left-0 mb-1.5 z-50 flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-lg px-2 py-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={() => { rcCall(phone); setOpen(false); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Phone className="w-3 h-3" />
            Call
          </button>
          <button
            type="button"
            onClick={() => { rcSMS(phone); setOpen(false); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            SMS
          </button>
        </span>
      )}
    </span>
  );
};

export default PhoneLink;
