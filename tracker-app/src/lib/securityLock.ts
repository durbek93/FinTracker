const PIN_HASH_KEY = 'fintracker_pin_hash_v1';
const BIO_CRED_KEY = 'fintracker_bio_cred_v1';
const PIN_SALT = 'fintracker_local_salt_v1_';

const bufferToBase64Url = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlToBuffer = (base64url: string): ArrayBuffer => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const hashPin = async (pin: string): Promise<string> => {
  const input = `${PIN_SALT}${pin.trim()}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash for non-HTTPS local testing
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

export const hasPinEnabled = (): boolean => {
  return Boolean(localStorage.getItem(PIN_HASH_KEY));
};

export const setSecurityPin = async (pin: string): Promise<void> => {
  const hash = await hashPin(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
  window.dispatchEvent(new CustomEvent('fintracker-pin-changed'));
};

export const verifySecurityPin = async (pin: string): Promise<boolean> => {
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (!stored) return true;
  const candidate = await hashPin(pin);
  return candidate === stored;
};

export const clearSecurityPin = (): void => {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(BIO_CRED_KEY);
  window.dispatchEvent(new CustomEvent('fintracker-pin-changed'));
};

export const isBiometricSupported = async (): Promise<boolean> => {
  try {
    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
    ) {
      return false;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const hasBiometricEnabled = (): boolean => {
  return Boolean(localStorage.getItem(BIO_CRED_KEY));
};

export const disableBiometricUnlock = (): void => {
  localStorage.removeItem(BIO_CRED_KEY);
  window.dispatchEvent(new CustomEvent('fintracker-pin-changed'));
};

export const registerBiometricUnlock = async (userLabel = 'FinTracker User'): Promise<boolean> => {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    window.crypto.getRandomValues(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'FinTracker',
          id: window.location.hostname || 'localhost',
        },
        user: {
          id: userId,
          name: userLabel,
          displayName: userLabel,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return false;
    const credId = bufferToBase64Url(credential.rawId);
    localStorage.setItem(BIO_CRED_KEY, credId);
    window.dispatchEvent(new CustomEvent('fintracker-pin-changed'));
    return true;
  } catch (err) {
    console.warn('Biometric registration cancelled or failed:', err);
    return false;
  }
};

export const verifyBiometricUnlock = async (): Promise<boolean> => {
  try {
    const credId = localStorage.getItem(BIO_CRED_KEY);
    if (!credId || !window.PublicKeyCredential || !navigator.credentials) return false;

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: base64UrlToBuffer(credId),
            type: 'public-key',
            transports: ['internal'],
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return Boolean(assertion);
  } catch (err) {
    console.warn('Biometric unlock cancelled or failed:', err);
    return false;
  }
};
