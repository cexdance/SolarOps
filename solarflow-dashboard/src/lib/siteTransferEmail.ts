import { supabase } from './supabase';

/** Emails the customer asking for the Site ID + inverter serial we need to run
 *  the SolarEdge ownership transfer. Server branch: /api/notify
 *  action 'site-transfer-request'. */
export async function sendSiteTransferRequest(payload: {
  customerEmail: string;
  customerName: string;
  orderNo?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!payload.customerEmail) return { success: false, error: 'Customer has no email on file' };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { success: false, error: 'Not authenticated' };

  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'site-transfer-request', ...payload }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { success: false, error: body.error || `HTTP ${res.status}` };
  }
  return { success: true };
}
