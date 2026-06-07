// RingCentral — deep-link helpers only (no widget, no iframe)
// Phone numbers throughout the app open the RC desktop/mobile app via URI scheme.
// rcmobile:// is registered by the RC app on install — no auth or Client ID required.

export const RC_CLIENT_ID_KEY = 'solarops_rc_client_id';
export const RC_ENV_KEY       = 'solarops_rc_env';

export type RCEnv = 'production' | 'sandbox';

export function getRCClientId(): string {
  return (import.meta.env['VITE_RC_CLIENT_ID'] as string) || 'enabled';
}

/** Dial a number via the RC desktop/mobile app.
 *  Uses an anchor-click approach which is the most reliable way to
 *  trigger custom URI schemes across all browsers without getting blocked. */
export function rcCall(phoneNumber: string): void {
  const digits = phoneNumber.replace(/\D/g, '');
  const uri = `rcmobile://call?number=${encodeURIComponent(digits)}`;
  const a = document.createElement('a');
  a.href = uri;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Fallback: if RC app isn't installed, tel: prompts the OS dialer after 800ms
  setTimeout(() => {
    if (document.hasFocus()) {
      window.location.href = `tel:${digits}`;
    }
  }, 800);
}

/** Open RC SMS compose to a number */
export function rcSMS(phoneNumber: string): void {
  const digits = phoneNumber.replace(/\D/g, '');
  const uri = `rcmobile://compose?number=${encodeURIComponent(digits)}&type=sms`;
  const a = document.createElement('a');
  a.href = uri;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Fallback: sms: scheme after 800ms if RC didn't open
  setTimeout(() => {
    if (document.hasFocus()) {
      window.location.href = `sms:${digits}`;
    }
  }, 800);
}

// Backward-compat aliases
export const rcClickToCall = rcCall;
export const rcSendSMS     = rcSMS;

// Legacy no-ops kept so imports don't break during the transition
export function getRCEnv(): RCEnv { return 'production'; }
export function setRCConfig(_clientId: string, _env: RCEnv): void {}
export function clearRCConfig(): void {}
export function isRCWidgetReady(): boolean { return false; }
export function loadRCWidget(_clientId: string, _env?: RCEnv): void {}
export function unloadRCWidget(): void {}
export function registerRCService(): void {}

export interface RCCallEndData {
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  startTime?: string;
  sessionId?: string;
  fromNumber?: string;
  toNumber?: string;
}

/** No-op — widget removed; returns a no-op cleanup */
export function onRCCallEnd(_callback: (data: RCCallEndData) => void): () => void {
  return () => {};
}
