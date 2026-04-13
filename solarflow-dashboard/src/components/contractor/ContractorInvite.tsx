// ContractorInvite — Admin modal to generate & send a contractor invite link
import React, { useState } from 'react';
import {
  X, Mail, Copy, CheckCircle, Link2, Send, UserPlus,
} from 'lucide-react';
import { createInvite } from '../../lib/contractorStore';
import { ContractorInvite as InviteType } from '../../types/contractor';

interface ContractorInviteProps {
  adminName: string;
  adminEmail: string;
  onClose: () => void;
}

export const ContractorInvite: React.FC<ContractorInviteProps> = ({
  adminName,
  adminEmail,
  onClose,
}) => {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [invite, setInvite] = useState<InviteType | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const inviteLink = invite
    ? `${window.location.origin}${window.location.pathname}?invite=${invite.token}`
    : '';

  const handleGenerate = () => {
    setError('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    const newInvite = createInvite(email, adminName, adminEmail, note || undefined);
    setInvite(newInvite);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = inviteLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSendEmail = () => {
    const subject = encodeURIComponent('You\'re invited to join ConexSol as a contractor');
    const body = encodeURIComponent(
      `Hi,\n\nYou've been invited by ${adminName} to register as a contractor with ConexSol Applications LLC.\n\n` +
      (note ? `Message from ${adminName}:\n"${note}"\n\n` : '') +
      `Click the link below to complete your onboarding:\n${inviteLink}\n\n` +
      `This link is tied to your email address (${invite?.email}) and can only be used once.\n\n` +
      `If you have any questions, reply to this email or contact us at ${adminEmail}.\n\n` +
      `— ConexSol Operations Team`
    );
    window.open(`mailto:${invite?.email}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-orange-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Invite Contractor</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!invite ? (
            <>
              <p className="text-sm text-slate-500">
                Enter the contractor's email address. They'll receive a unique onboarding link
                that pre-fills their account and guides them through W-9, insurance, and safety acknowledgment.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contractor Email <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="contractor@company.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Personal message (optional)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Hi John, looking forward to working with you…"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={handleGenerate}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Link2 className="w-4 h-4" />
                Generate Invite Link
              </button>
            </>
          ) : (
            <>
              {/* Success state */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-emerald-800">Invite link generated for</p>
                  <p className="text-xs text-emerald-700">{invite.email}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Onboarding Link</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-mono truncate">
                    {inviteLink}
                  </div>
                  <button
                    onClick={handleCopy}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      copied
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleSendEmail}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Open in Email Client
                </button>
                <button
                  onClick={() => { setInvite(null); setEmail(''); setNote(''); }}
                  className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm cursor-pointer"
                >
                  Invite someone else
                </button>
              </div>

              <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 space-y-1">
                <p>• Link is single-use and tied to <strong>{invite.email}</strong></p>
                <p>• Contractor will complete W-9, insurance & safety guide before approval</p>
                <p>• You'll be notified once they submit their application</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
