/** Generate random code verifier (43+ chars, URL-safe base64, per RFC 7636) */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** SHA256 hash + base64url encode (S256 method per RFC 7636) */
export async function createChallengeFromVerifier(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Verify code_verifier matches stored challenge (S256) */
export async function verifyPKCE(verifier: string, challenge: string): Promise<boolean> {
  const computed = await createChallengeFromVerifier(verifier);
  return computed === challenge;
}

/** Generate a random 6-digit OTP */
export function generateOTP(): string {
  const num = Math.floor(Math.random() * 1_000_000);
  return num.toString().padStart(6, '0');
}

/** SHA256 hash of a token string for storage */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray, b => b.toString(16).padStart(2, '0')).join('');
}
