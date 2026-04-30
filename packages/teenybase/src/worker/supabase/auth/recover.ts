import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, RecoverRequest } from './types';
import { ensureAuthSchema } from './schema';
import { generateOTP, hashToken } from './pkce';
import { buildAuthErrorBody } from './errorCodes';
import { findUserByEmail } from './sessionManager';

/**
 * Handle POST /auth/v1/recover
 * Generates recovery token and stores in D1 (no email sent in v1).
 */
export async function handleRecover(
  db: D1Database,
  body: RecoverRequest,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const email = body.email.toLowerCase();
  const user = await findUserByEmail(db, email);

  if (!user) {
    // Return success even if user not found (prevent enumeration)
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const otp = generateOTP();
  const otpHash = await hashToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Store recovery OTP
  await db.prepare(
    `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
     VALUES (?, ?, ?, ?, 'recovery', ?, ?, 0)`
  ).bind(crypto.randomUUID(), user.id, email, otpHash, now, expiresAt).run();

  // Also update user's recovery_token field
  await db.prepare(
    `UPDATE auth_users SET recovery_token = ?, recovery_sent_at = ?, updated_at = ? WHERE id = ?`
  ).bind(otpHash, now, now, user.id).run();

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
