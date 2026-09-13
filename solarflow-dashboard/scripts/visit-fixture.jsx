// Synthetic browser fixture. Never imported by the production application.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { ServiceOrderPanel } from '../src/components/ServiceOrderPanel';
import { JobDetail } from '../src/components/contractor/JobDetail';
import { toContractorJobView } from '../src/lib/woHelpers';
const initial = { id: 'visit-fixture', woNumber: 'SO-TEST', title: 'Follow-up regression', customerId: 'fixture-customer', clientName: 'Visit Test Customer', siteAddress: '100 Test Street', contractorId: 'fixture-crew', serviceType: 'Diagnostic', scheduledDate: '2099-09-12', scheduledTime: '09:00', status: 'in_progress', woStatus: 'in_progress', serviceReport: 'Found failed optimizer', laborHours: 2, laborRate: 60, partsCost: 0, totalAmount: 120, quoteAmount: 120, quoteSentAt: '2099-09-10', createdAt: '2099-09-10', updatedAt: '2026-09-12T00:00:00Z', woPhotos: [], lineItems: [], notes: '', urgency: 'medium' };
function Fixture() {
  const [job, setJob] = useState(initial); const [cj, setCj] = useState(); const [role, setRole] = useState('contractor');
  window.__visitJob = job; window.__setRole = setRole; window.__setJob = setJob;
  useEffect(() => { const accept = e => { setJob(e.detail); setCj(old => toContractorJobView(e.detail, old)); }; window.addEventListener('solarops-visit-transition', accept); return () => window.removeEventListener('solarops-visit-transition', accept); }, []);
  const saveCj = c => { setCj(c); setJob(j => ({ ...j, serviceReport: c.operationalNotes, visitLabor: c.visitLabor, visits: c.visits ?? j.visits, visitPhotoOwners: c.visitPhotoOwners, contractorParts: c.parts, completedAt: c.completedAt, startedAt: c.startedAt, woStatus: c.status === 'completed' ? 'completed' : j.woStatus })); };
  return role === 'contractor' ? <JobDetail key={`${job.id}:${job.currentVisit?.id || 'original'}`} job={toContractorJobView(job, cj)} contractorId="fixture-crew" onBack={() => {}} onUpdateJob={saveCj} onProposeSchedule={() => { window.__scheduleCalls = (window.__scheduleCalls || 0) + 1; }} /> : <ServiceOrderPanel key={job.currentVisit?.id || job.id} job={job} siteId="fixture-customer" siteName="Visit Test Customer" currentUserRole={role} currentUserName="Daniel Test" onClose={() => {}} onSave={p => setJob(j => ({ ...j, ...p }))} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
