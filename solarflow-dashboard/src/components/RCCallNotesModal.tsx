import React, { useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, X, User, CheckCircle2, Search } from 'lucide-react';
import { RCCallEndData } from '../lib/ringcentral';
import { CRMCustomer, Customer, InteractionOutcome } from '../types/index';

interface Props {
  callData: RCCallEndData;
  crmCustomers: CRMCustomer[];
  legacyCustomers: Customer[];
  currentUserName: string;
  currentUserId: string;
  onSave: (params: {
    notes: string;
    outcome: string;
    customerId?: string;
    customerType: 'crm' | 'legacy' | 'none';
  }) => void;
  onDismiss: () => void;
}

function fmtDuration(seconds: number): string {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  return digits.slice(-10);
}

const OUTCOME_OPTIONS: { value: InteractionOutcome; label: string }[] = [
  { value: 'connected', label: 'Contacted' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'voicemail', label: 'Left Voicemail' },
  { value: 'callback_requested', label: 'Callback Requested' },
  { value: 'appointment_scheduled', label: 'Appointment Scheduled' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up_needed', label: 'Follow-up Needed' },
];

export const RCCallNotesModal: React.FC<Props> = ({
  callData,
  crmCustomers,
  legacyCustomers,
  currentUserName,
  currentUserId,
  onSave,
  onDismiss,
}) => {
  const normalizedCallPhone = normalizePhone(callData.phoneNumber);

  // Try to match phone number to a customer
  const matchedCRM = crmCustomers.find(c => normalizePhone(c.phone) === normalizedCallPhone);
  const matchedLegacy = !matchedCRM
    ? legacyCustomers.find(c => normalizePhone(c.phone) === normalizedCallPhone)
    : undefined;

  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<InteractionOutcome>('connected');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCRMId, setSelectedCRMId] = useState<string | undefined>(matchedCRM?.id);
  const [selectedLegacyId, setSelectedLegacyId] = useState<string | undefined>(matchedLegacy?.id);
  const [customerType, setCustomerType] = useState<'crm' | 'legacy' | 'none'>(
    matchedCRM ? 'crm' : matchedLegacy ? 'legacy' : 'none'
  );

  const hasMatch = !!matchedCRM || !!matchedLegacy;

  // Search results for manual selection
  const searchResults = searchQuery.trim().length > 1
    ? crmCustomers.filter(c => {
        const q = searchQuery.toLowerCase();
        return (
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          normalizePhone(c.phone).includes(normalizePhone(q))
        );
      }).slice(0, 5)
    : [];

  const handleSave = () => {
    onSave({
      notes,
      outcome,
      customerId: customerType === 'crm' ? selectedCRMId : customerType === 'legacy' ? selectedLegacyId : undefined,
      customerType,
    });
  };

  const matchedName = matchedCRM
    ? `${matchedCRM.firstName} ${matchedCRM.lastName}`
    : matchedLegacy
    ? matchedLegacy.name
    : null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-96 bg-white rounded-2xl shadow-2xl border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
        <div className="flex items-center gap-2">
          {callData.direction === 'inbound' ? (
            <PhoneIncoming className="w-4 h-4 text-green-500" />
          ) : (
            <PhoneOutgoing className="w-4 h-4 text-orange-500" />
          )}
          <span className="text-sm font-semibold text-slate-800">
            {callData.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call Ended
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Call info row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Phone className="w-3.5 h-3.5" />
            <span className="text-sm font-mono">{callData.phoneNumber || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-sm">{fmtDuration(callData.duration)}</span>
          </div>
        </div>

        {/* Matched customer */}
        {hasMatch ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-100">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">{matchedName}</p>
              <p className="text-xs text-green-600">
                {matchedCRM ? 'CRM Customer' : 'Legacy Customer'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100">
              <User className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700">Unknown caller — search to link</p>
            </div>
            {/* Manual search */}
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                  {searchResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCRMId(c.id);
                        setCustomerType('crm');
                        setSearchQuery(`${c.firstName} ${c.lastName}`);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <span className="font-medium text-slate-800">{c.firstName} {c.lastName}</span>
                      <span className="text-slate-400 ml-2 text-xs">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Outcome */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Outcome</label>
          <select
            value={outcome}
            onChange={e => setOutcome(e.target.value as InteractionOutcome)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {OUTCOME_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What was discussed..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save to Activity
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default RCCallNotesModal;
