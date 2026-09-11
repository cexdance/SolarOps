// Earlier site visits on a service order, oldest first. Shared by the
// contractor Work Order card and the office Service Order panel.
import React from 'react';
import { CalendarCheck } from 'lucide-react';
import type { WOVisit } from '../types';

const fmt = (d?: string) => {
  if (!d) return '';
  const t = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const VisitHistory: React.FC<{ visits?: WOVisit[]; showBilling?: boolean }> = ({ visits, showBilling }) => {
  if (!visits?.length) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        <CalendarCheck className="w-3.5 h-3.5" /> Previous visits ({visits.length})
      </p>
      <ol className="space-y-2">
        {visits.map(v => (
          <li key={v.id} className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">Visit {v.number}</span>
              <span className="text-xs text-slate-500">{fmt(v.date)}</span>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{v.workDone || 'No work notes recorded.'}</p>
            {v.nextSteps && (
              <p className="text-xs text-slate-500 whitespace-pre-wrap"><span className="font-semibold">Left to do:</span> {v.nextSteps}</p>
            )}
            {v.parts && v.parts.length > 0 && (
              <p className="text-xs text-slate-500">
                <span className="font-semibold">Parts:</span> {v.parts.map(p => `${p.name}${p.quantity > 1 ? ` x${p.quantity}` : ''}`).join(', ')}
              </p>
            )}
            {v.photoUrls.length > 0 && (
              <div className="grid grid-cols-6 gap-1">
                {v.photoUrls.map(src => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden bg-slate-100 border border-slate-200">
                    <img src={src} alt={`Visit ${v.number} photo`} loading="lazy" className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            {showBilling && v.billing && (
              <p className="text-xs text-slate-500">
                <span className="font-semibold">Billing:</span>{' '}
                {[
                  v.billing.quoteSentAt && `quote sent ${fmt(v.billing.quoteSentAt)}`,
                  v.billing.quoteApprovedAt && `approved ${fmt(v.billing.quoteApprovedAt)}`,
                  v.billing.invoicedAt && `invoiced ${fmt(v.billing.invoicedAt)}`,
                  v.billing.clientPaidAt && `paid ${fmt(v.billing.clientPaidAt)}`,
                ].filter(Boolean).join(', ') || 'no quote or invoice'}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default VisitHistory;
