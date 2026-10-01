// RingCentral, deep-link helpers only (no widget, no iframe)
// Phone numbers throughout the app open the RC desktop/mobile app via URI scheme.
// rcmobile:// is registered by the RC app on install, no auth or Client ID required.

export const RC_CLIENT_ID_KEY = 'solarops_rc_client_id';
export const RC_ENV_KEY       = 'solarops_rc_env';

export type RCEnv = 'production' | 'sandbox';

export function getRCClientId(): string {
  return (import.meta.env['VITE_RC_CLIENT_ID'] as string) || 'enabled';
}

export type PhoneAction = 'call' | 'sms';
export type PhoneProvider = 'device' | 'ringcentral';

/** Keep international prefixes; never concatenate an extension into the number. */
export function normalizePhoneNumber(value: string): string {
  const base = value.trim().split(/(?:\bext\.?|\bx|[;,#])/i)[0].trim();
  if (!/^[+\d\s().-]+$/.test(base)) return '';
  const digits = base.replace(/\D/g, '');
  return digits ? `${base.startsWith('+') ? '+' : ''}${digits}` : '';
}

export function phoneHref(phone: string, action: PhoneAction, provider: PhoneProvider): string | undefined {
  const number = normalizePhoneNumber(phone);
  if (!number) return undefined;
  return provider === 'device'
    ? `${action === 'call' ? 'tel' : 'sms'}:${number}`
    : `rcmobile://${action}?number=${encodeURIComponent(number)}`;
}

/** Legacy callers must invoke this synchronously from a user gesture. */
export function rcCall(phoneNumber: string): void {
  const href = phoneHref(phoneNumber, 'call', 'ringcentral');
  if (href) window.location.assign(href);
}

export function rcSMS(phoneNumber: string): void {
  const href = phoneHref(phoneNumber, 'sms', 'ringcentral');
  if (href) window.location.assign(href);
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

/** No-op, widget removed; returns a no-op cleanup */
export function onRCCallEnd(_callback: (data: RCCallEndData) => void): () => void {
  return () => {};
}
