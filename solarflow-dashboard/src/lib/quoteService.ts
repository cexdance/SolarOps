import { supabase } from './supabase';

interface QuoteEmailPayload {
  customerName: string;
  customerEmail: string;
  address: string;
  woNumber: string;
  jobId: string;
  lineItems: { description: string; qty: number; unitPrice: number; total: number }[];
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  notes?: string;
}

export async function sendQuoteEmail(payload: QuoteEmailPayload): Promise<{ success: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { success: false, error: 'Not authenticated' };

  const res = await fetch('/api/send-quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { success: false, error: body.error || `HTTP ${res.status}` };
  }

  return { success: true };
}

export async function notifyAdminForInvoice(
  jobId: string,
  woNumber: string,
  customerName: string,
  totalAmount: number,
  senderName: string,
  users: { id: string; name: string }[],
): Promise<void> {
  const daniel = users.find(u => u.name.toLowerCase().includes('daniel'));
  if (!daniel) {
    console.warn('[quoteService] Daniel Matos not found in users list');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  await fetch('/api/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      mentionedUserIds: [daniel.id],
      notifierName: senderName,
      customerName,
      customerId: jobId,
      message: `${woNumber} is ready for invoicing. Customer: ${customerName}. Total: $${totalAmount.toFixed(2)}. Please send the invoice and mark as paid when received.`,
    }),
  }).catch(err => console.error('[quoteService] notify failed:', err));
}
