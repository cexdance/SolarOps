// SolarOps — Passkey / WebAuthn utilities (shared between staff and contractor login)

export const PASSKEY_STORE_KEY             = 'solarops_passkey_cred_id';
export const PASSKEY_STORE_KEY_CONTRACTOR  = 'solarops_passkey_cred_id_contractor';

const PASSKEY_RP_ID = window.location.hostname;

export function isPlatformAuthAvailable(): boolean {
  return !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
}

export async function registerPasskey(
  userId: string,
  userEmail: string,
  storeKey = PASSKEY_STORE_KEY,
): Promise<boolean> {
  try {
    const challenge  = crypto.getRandomValues(new Uint8Array(32));
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'SolarOps', id: PASSKEY_RP_ID },
        user: {
          id: new TextEncoder().encode(userId),
          name: userEmail,
          displayName: userEmail,
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) return false;
    localStorage.setItem(storeKey, btoa(String.fromCharCode(...new Uint8Array(credential.rawId))));
    return true;
  } catch {
    return false;
  }
}

export async function authenticateWithPasskey(
  storeKey = PASSKEY_STORE_KEY,
): Promise<ArrayBuffer | null> {
  try {
    const storedId = localStorage.getItem(storeKey);
    if (!storedId) return null;
    const credId   = Uint8Array.from(atob(storedId), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: PASSKEY_RP_ID,
        allowCredentials: [{ type: 'public-key', id: credId }],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    return assertion ? assertion.rawId : null;
  } catch {
    return null;
  }
}
