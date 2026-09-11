// "Send to Trello" on a service order. The office logs a new customer in
// SolarOps; Anthony works only in Trello and needs a card there to follow up
// on the RMA and the order. One card per order: once sent, this becomes an
// "Open in Trello" link.
import React, { useEffect, useRef, useState } from 'react';
import { Send, ExternalLink, ChevronDown } from 'lucide-react';
import type { Job, Customer, RMAEntry } from '../types';
import {
  cachedTrelloLists, fetchTrelloLists, defaultListFor, soCardContent,
  sendServiceOrderToTrello, type TrelloList,
} from '../lib/trelloSync';

const BTN = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700';

export const SendToTrello: React.FC<{
  job: Job;
  customer?: Customer;
  /** The panel's LIVE RMA list, so an RMA added but not yet saved still goes on the card. */
  rmaEntries: RMAEntry[];
  onLinked: (link: { trelloCardId: string; trelloCardUrl: string }) => void;
}> = ({ job, customer, rmaEntries, onLinked }) => {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<TrelloList[]>(() => (cachedTrelloLists() ?? []).filter(l => !l.closed));
  const [listId, setListId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // A ref, not just state: two clicks inside one render both read sending=false
  // and would create two cards. Same guard as Move to Client (44b772d).
  const inFlight = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    fetchTrelloLists().then(l => { if (live && l) setLists(l.filter(x => !x.closed)); });
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => { live = false; document.removeEventListener('mousedown', h); };
  }, [open]);

  useEffect(() => {
    if (!listId && lists.length) setListId(defaultListFor(lists, job.pipelineStage));
  }, [lists, listId, job.pipelineStage]);

  // A lead is already a Trello card; its link is its own id.
  if (job.id.startsWith('job-trello-')) return null;

  if (job.trelloCardUrl) {
    return (
      <a href={job.trelloCardUrl} target="_blank" rel="noreferrer" className={BTN} title="This order's card on the Florida Trello board">
        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
        Open in Trello
      </a>
    );
  }

  const content = soCardContent(job, customer, rmaEntries);

  const send = async () => {
    if (inFlight.current || !listId) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      const { cardId, url } = await sendServiceOrderToTrello(job.id, listId, content);
      onLinked({ trelloCardId: cardId, trelloCardUrl: url });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the Trello card');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={BTN} aria-expanded={open}>
        <Send className="w-3.5 h-3.5 text-slate-500" />
        Send to Trello
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // right-0: the button sits at the right edge of the SO panel, so a
        // left-anchored popover ran off the panel and was clipped (caught in
        // the production capture).
        <div className="absolute right-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Card</p>
            <p className="text-sm font-semibold text-slate-800 truncate" title={content.name}>{content.name}</p>
          </div>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Column on the Trello board</span>
            <select
              value={listId ?? ''}
              onChange={e => setListId(e.target.value)}
              disabled={sending || lists.length === 0}
              className="mt-1 w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400"
            >
              {lists.length === 0 && <option value="">Loading columns...</option>}
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">
            Adds client, contact, site, status{rmaEntries.length ? ', RMA' : ''} and notes to the card, so Anthony can follow up from Trello.
          </p>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={sending} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={sending || !listId}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60"
            >
              {sending ? 'Creating card...' : 'Create card'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
