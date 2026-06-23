import React, { useState } from 'react';
import { X, Send, Mail, DollarSign, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { sendQuoteEmail } from '../lib/quoteService';
import { MentionTextarea, type MentionUser } from './ui/MentionTextarea';

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface QuotePreviewProps {
  customerName: string;
  customerEmail: string;
  address: string;
  woNumber: string;
  jobId: string;
  lineItems: LineItem[];
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  notes?: string;
  onClose: () => void;
  onSent: () => void;
  /** When provided, the primary action SAVES the quote preview and @mentions a
   *  teammate (e.g. Daniel Matos) to create the quote in the accounting software,
   *  instead of emailing the customer directly. Customer email becomes optional. */
  onSavePreview?: (payload: {
    lineItems: LineItem[];
    notes: string;
    laborTotal: number;
    partsTotal: number;
    grandTotal: number;
  }) => void;
  /** Teammate notified when the preview is saved (shown on the primary button). */
  notifyName?: string;
  /** Staff roster for @mention autocomplete in the Notes field. */
  users?: MentionUser[];
}

export const QuotePreviewModal: React.FC<QuotePreviewProps> = ({
  customerName: initialName,
  customerEmail: initialEmail,
  address,
  woNumber,
  jobId,
  lineItems: initialItems,
  notes: initialNotes,
  onClose,
  onSent,
  onSavePreview,
  notifyName,
  users,
}) => {
  const [customerName, setCustomerName] = useState(initialName);
  const [customerEmail, setCustomerEmail] = useState(initialEmail);
  const [lineItems, setLineItems] = useState<LineItem[]>(initialItems);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const computedTotal = lineItems.reduce((s, i) => s + i.total, 0);
  const computedLabor = lineItems.filter(i => i.description.toLowerCase().includes('labor')).reduce((s, i) => s + i.total, 0);
  const computedParts = computedTotal - computedLabor;

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'qty' || field === 'unitPrice') {
        updated.total = Number(updated.qty) * Number(updated.unitPrice);
      }
      return updated;
    }));
  };

  const handleSaveAndNotify = () => {
    onSavePreview?.({
      lineItems,
      notes: notes.trim(),
      laborTotal: computedLabor,
      partsTotal: computedParts,
      grandTotal: computedTotal,
    });
  };

  const removeItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const addItem = () => setLineItems(prev => [...prev, { description: '', qty: 1, unitPrice: 0, total: 0 }]);

  const handleSend = async () => {
    if (!customerEmail.trim()) {
      setResult({ ok: false, msg: 'Customer email is required' });
      return;
    }
    setSending(true);
    setResult(null);
    const res = await sendQuoteEmail({
      customerName,
      customerEmail: customerEmail.trim(),
      address,
      woNumber,
      jobId,
      lineItems,
      laborTotal: computedLabor,
      partsTotal: computedParts,
      grandTotal: computedTotal,
      notes: notes.trim() || undefined,
    });
    setSending(false);
    if (res.success) {
      setResult({ ok: true, msg: 'Quote sent successfully!' });
      setTimeout(onSent, 1500);
    } else {
      setResult({ ok: false, msg: res.error || 'Failed to send quote' });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" />
            <h2 className="text-lg font-bold text-slate-900">Quote Preview</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Customer Name</label>
              <input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email</label>
              <input
                type="email"
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="customer@email.com"
              />
            </div>
          </div>

          <div className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">SO:</span> {woNumber} &nbsp;·&nbsp;
            <span className="font-medium text-slate-700">Address:</span> {address}
          </div>

          {onSavePreview && (
            <div className="flex items-start gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
              <Send className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
              <span>
                Saving this preview hands the quote to <strong>{notifyName ?? 'the quote owner'}</strong> to create and
                send it to the accounting software. The service order advances to <strong>Quote Sent</strong>; any teammate
                can mark it approved afterward.
              </span>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Line Items</label>
              <button onClick={addItem} className="text-xs text-orange-600 font-medium hover:text-orange-700 cursor-pointer">+ Add Item</button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-center w-16">Qty</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <input
                          value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="w-full bg-transparent text-sm focus:outline-none"
                          placeholder="Description"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                          className="w-full text-center bg-transparent text-sm focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing is handled in Xero by Daniel; this preview captures scope only. */}
          <div className="flex items-start gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
            <DollarSign className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
            <span>Pricing is set in Xero. This preview captures the scope of work (line items and quantities) for the quote owner to price and send.</span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes (optional)</label>
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              users={users ?? []}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Additional notes… use @ to mention a teammate"
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
            Cancel
          </button>
          {onSavePreview ? (
            <>
              {/* Optional: email the customer directly (only when an email exists) */}
              <button
                onClick={handleSend}
                disabled={sending || !customerEmail.trim()}
                title={customerEmail.trim() ? 'Email this quote to the customer' : 'Add a customer email to enable'}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Mail className="w-4 h-4" /> Email Customer</>}
              </button>
              {/* Primary: save the preview and hand off to the quote owner */}
              <button
                onClick={handleSaveAndNotify}
                disabled={sending}
                className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" /> Save Quote &amp; Notify {notifyName ?? 'Quote Owner'}
              </button>
            </>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || !customerEmail.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4" /> Send Quote Email</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
