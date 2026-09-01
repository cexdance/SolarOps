/** Site transfer, customer information request.
 *
 *  Opens a prefilled draft in the user's own mail app rather than sending
 *  through Resend. The `conexsol.us` sending domain is not verified, so every
 *  Resend send 403s; until that is sorted the office sends these by hand.
 *  The server path still exists (/api/notify action 'site-transfer-request')
 *  and needs no change to come back: point the button at it again.
 *
 *  mailto cannot carry an attachment, so the instructions image is linked in
 *  the body and the caller reminds the user to attach it.
 */
export const SITE_ID_GUIDE_URL =
  'https://solarflow-dashboard-sooty.vercel.app/site-id-instructions.png';

/** Office copy on every outbound email, matching the server-side CC. */
export const OFFICE_CC = 'cesar.jurado@conexsol.us';

export function buildSiteTransferMailto(opts: {
  customerEmail: string;
  customerName: string;
  orderNo?: string;
}): string {
  const subject = `Information needed for your site transfer${opts.orderNo ? `, ${opts.orderNo}` : ''}`;

  // \r\n, not \n: Outlook and some webmail clients drop bare newlines.
  const body = [
    `Hello ${opts.customerName || 'there'},`,
    '',
    'I am emailing you to request two pieces of information that we need to perform the "site transfer" of your installation and gain access to its monitoring. These pieces of information are:',
    '',
    '* Site ID: Your Site ID is in the mySolarEdge app. Tap the menu icon in the top left corner, then tap "Site Details," and your Site ID will be right there.',
    '',
    '* Full inverter serial number: This number is located on the label of the inverter.',
    '',
    'I appreciate your cooperation in providing us with this information. This will allow us to complete the process and ensure that your installation is properly monitored.',
    '',
    'If you have any questions or need additional assistance in finding these details, please do not hesitate to contact me.',
    '',
    'I look forward to your response.',
  ].join('\r\n');

  return `mailto:${encodeURIComponent(opts.customerEmail)}`
    + `?cc=${encodeURIComponent(OFFICE_CC)}`
    + `&subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
}
