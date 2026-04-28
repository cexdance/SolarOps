import type { Contractor } from '../../types/contractor';

export const PendingApprovalScreen: React.FC<{ contractor: Contractor; onLogout: () => void }> = ({ contractor, onLogout }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="w-full max-w-md text-center">
      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">⏳</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Application Under Review</h1>
      <p className="text-slate-600 mb-6">
        Your contractor application for <strong>{contractor.businessName}</strong> is being reviewed by our team.
      </p>
      <div className="bg-white rounded-xl p-4 border border-slate-200 mb-6">
        <div className="flex items-center justify-center gap-2 text-amber-600">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium">Pending Approval</span>
        </div>
      </div>
      <button onClick={onLogout} className="text-sm text-slate-500 hover:text-slate-700">
        Sign out and return later
      </button>
    </div>
  </div>
);
