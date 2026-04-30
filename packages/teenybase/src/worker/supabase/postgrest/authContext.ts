import { SupabaseAuthContext, SupabaseRole } from '../shared/types';

export interface AuthContextOptions {
  anonKey: string;
  serviceKey: string;
}

/**
 * Extract Supabase auth context from request headers.
 *
 * Resolution:
 * 1. apikey → anon vs service_role
 * 2. Bearer JWT → decode payload, extract role from claims
 * 3. service_role apikey always wins over JWT role
 */
export function extractAuthContext(
  apikey: string | null,
  authorization: string | null,
  options: AuthContextOptions,
): SupabaseAuthContext {
  let role: SupabaseRole = 'anon';

  if (apikey === options.serviceKey) {
    role = 'service_role';
  } else if (apikey === options.anonKey) {
    role = 'anon';
  }

  let jwtPayload: Record<string, unknown> | null = null;
  let uid: string | null = null;
  let email: string | null = null;

  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7);
    jwtPayload = decodeJwtPayload(token);
    if (jwtPayload) {
      uid = (jwtPayload.sub as string) ?? null;
      email = (jwtPayload.email as string) ?? null;
      const jwtRole = (jwtPayload.role as string) ?? (jwtPayload.aud as string);
      if (jwtRole === 'authenticated' && role !== 'service_role') {
        role = 'authenticated';
      } else if (jwtRole === 'service_role') {
        role = 'service_role';
      }
    }
  }

  return { role, uid, email, jwtPayload, apikey };
}

/**
 * Decode JWT payload (base64url-encoded JSON). No signature validation.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
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
