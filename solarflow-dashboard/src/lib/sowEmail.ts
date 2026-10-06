// SolarOps, email the SOW Completion Report.
//
// Twin of attachSowToTrello: the PDF is already in Storage by the time this
// runs, so the server mails the stored file rather than taking bytes over the
// wire (a report with photos exceeds Vercel's 4.5 MB request cap).
import { authedFetch } from './supabase';

export interface SowEmailResult {
  to: string;
  filename: string;
  bytes: number;
}

export async function emailSowReport(jobId: string): Promise<SowEmailResult> {
  const r = await authedFetch('/api/users?sowEmail=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  const body = await r.json().catch(() => ({})) as Partial<SowEmailResult> & { error?: string };
  if (r.ok && body.to) {
    return { to: body.to, filename: body.filename ?? '', bytes: body.bytes ?? 0 };
  }
  throw new Error(body.error || `Email failed (${r.status})`);
}
