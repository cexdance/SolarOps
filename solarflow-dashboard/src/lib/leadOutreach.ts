// Initial-contact outreach for leads landing from Trello.
//
// Plain text on purpose: a mailto: body is text/plain only (RFC 6068), so there
// is no markup here and none can be added without moving off mailto entirely.

export const LEAD_OUTREACH_SUBJECT = 'Your SolarEdge service request';

/**
 * The number leads are told to call. Deliberately the company line, not the
 * sender's own profile phone: staff profiles are frequently blank, and a lead
 * should reach whoever is at the desk rather than one person's handset.
 */
export const CONEXSOL_PHONE = '(305) 395-5404';

/** Greeting by the sender's own clock, since they are the one hitting send. */
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export interface LeadOutreachVars {
  customerFirstName?: string;
  senderFullName?: string;
  /** Overrides the company line. Omitted everywhere in the app today. */
  senderPhone?: string;
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

export function leadOutreachBody({
  customerFirstName,
  senderFullName,
  senderPhone,
  now,
}: LeadOutreachVars): string {
  const name = (customerFirstName ?? '').trim();
  const sender = (senderFullName ?? '').trim() || 'the Conexsol team';
  const phone = (senderPhone ?? CONEXSOL_PHONE).trim();

  // "Good morning Maria," but plain "Good morning," when the import had no
  // first name, rather than shipping a dangling space before the comma.
  const salutation = name ? `${greetingFor(now)} ${name},` : `${greetingFor(now)},`;

  // A missing profile phone must not produce "call us at ," in a customer-facing
  // email, so the sentence and the signature line both drop out with it.
  const callToAction = phone
    ? `Just reply to this email or call us at ${phone}, and we'll get on the phone to map out the fix.`
    : `Just reply to this email and we'll get on the phone to map out the fix.`;

  const signature = ['Talk soon,', '', sender, 'Conexsol | Solar Operations and Maintenance'];
  if (phone) signature.push(phone);

  return [
    salutation,
    '',
    `I'm ${sender} with Conexsol. Your service request came to us through the SolarEdge portal, and our team is ready to get your system back to full production.`,
    '',
    `Is your system completely down, or is it still running but producing less than it used to? Either way, every month it underperforms shows up on your utility bill as savings you already paid for and aren't getting back.`,
    '',
    callToAction,
    '',
    `We'd also like to become your installer of record with SolarEdge. That means one local team takes ownership of your system from here forward: warranty claims, repairs, and ongoing maintenance, all handled by people who know your setup.`,
    '',
    ...signature,
  ].join('\n');
}

/** mailto: URL for the lead's pre-filled initial-contact draft. */
export function leadOutreachMailto(email: string, vars: LeadOutreachVars): string {
  const subject = encodeURIComponent(LEAD_OUTREACH_SUBJECT);
  const body = encodeURIComponent(leadOutreachBody(vars));
  return `mailto:${encodeURIComponent(email.trim())}?subject=${subject}&body=${body}`;
}
