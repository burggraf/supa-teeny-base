import jwt from '@tsndr/cloudflare-worker-jwt';

/** Build standard Supabase JWT payload */
export function buildJWTPayload(
  userId: string,
  email: string | null,
  phone: string | null,
  role: string,
  appMetadata: Record<string, unknown>,
  userMetadata: Record<string, unknown>,
  expirySeconds: number,
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: role,
    sub: userId,
    email: email ?? '',
    phone: phone ?? '',
    role,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
    iat: now,
    exp: now + expirySeconds,
  };
}

/** Sign JWT with HS256 */
export async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  return await jwt.sign(payload, secret, { algorithm: 'HS256' });
}

/** Verify and decode JWT. Throws errors with .status=401 on invalid/expired/wrong-secret. */
export async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown>> {
  let valid: boolean;
  try {
    valid = await jwt.verify(token, secret, { algorithm: 'HS256' });
  } catch {
    const e = new Error('Invalid token');
    (e as any).status = 401;
    (e as any).code = 'invalid_token';
    throw e;
  }
  if (!valid) {
    const e = new Error('Invalid token');
    (e as any).status = 401;
    (e as any).code = 'invalid_token';
    throw e;
  }
  // Use safe manual decode — jwt.decode() may return unexpected structure
  const payload = decodeJWTPayloadUnsafe(token);
  if (!payload) {
    const e = new Error('Invalid token');
    (e as any).status = 401;
    (e as any).code = 'invalid_token';
    throw e;
  }

  if (payload.exp && (payload.exp as number) < Math.floor(Date.now() / 1000)) {
    const e = new Error('Token expired');
    (e as any).status = 401;
    (e as any).code = 'invalid_token';
    throw e;
  }
  return payload;
}

/** Decode JWT payload without verification (for extracting claims from untrusted tokens) */
export function decodeJWTPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = globalThis.atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
