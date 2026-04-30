import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, VerifyRequest, SessionResponse } from './types';
import { hashToken } from './pkce';
import { throwAuthError, AUTH_ERRORS } from './errorCodes';
import { findUserById, createFullSession, toUserResponse } from './sessionManager';

/** Handle POST /auth/v1/verify */
export async function handleVerify(
  db: D1Database,
  body: VerifyRequest,
  config: AuthConfig,
): Promise<Response> {
  const { token, token_hash, type, redirect_to } = body;

  // Resolve token hash: use provided hash or hash the token
  const resolvedHash = token_hash ?? await hashToken(token);

  // Look up OTP
  const otp = await db
    .prepare(
      'SELECT * FROM auth_otps WHERE token_hash = ? AND consumed = 0',
    )
    .bind(resolvedHash)
    .first();

  if (!otp) {
    throwAuthError('OTP_EXPIRED', 'Token has expired or is invalid');
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(otp.expires_at as string);
  if (now > expiresAt) {
    throwAuthError('OTP_EXPIRED', 'Token has expired or is invalid');
  }

  // Handle by type
  if (type === 'signup') {
    return handleSignupVerify(db, otp, config);
  }

  if (type === 'recovery' || type === 'magiclink') {
    return handleRecoveryVerify(db, otp, config);
  }

  if (type === 'email_change') {
    return handleEmailChangeVerify(db, otp, config);
  }

  throwAuthError('INVALID_CODE', `Unsupported verify type: ${type}`);
}

async function handleSignupVerify(
  db: D1Database,
  otp: Record<string, unknown>,
  config: AuthConfig,
): Promise<Response> {
  const userId = otp.user_id as string;

  // Confirm email
  const now = new Date().toISOString();
  await db
    .prepare(
      'UPDATE auth_users SET email_confirmed_at = ?, updated_at = ? WHERE id = ?',
    )
    .bind(now, now, userId)
    .run();

  // Mark OTP as consumed
  await db
    .prepare('UPDATE auth_otps SET consumed = 1 WHERE id = ?')
    .bind(otp.id as string)
    .run();

  // Create session
  const session = await createFullSession(db, userId, config.jwtSecret, config.jwtExpiry);

  return new Response(JSON.stringify(session), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleRecoveryVerify(
  db: D1Database,
  otp: Record<string, unknown>,
  config: AuthConfig,
): Promise<Response> {
  const userId = otp.user_id as string;

  // Confirm email (recovery implies email ownership)
  const now = new Date().toISOString();
  await db
    .prepare(
      'UPDATE auth_users SET email_confirmed_at = ?, updated_at = ? WHERE id = ?',
    )
    .bind(now, now, userId)
    .run();

  // Mark OTP as consumed
  await db
    .prepare('UPDATE auth_otps SET consumed = 1 WHERE id = ?')
    .bind(otp.id as string)
    .run();

  // Create session
  const session = await createFullSession(db, userId, config.jwtSecret, config.jwtExpiry);

  return new Response(JSON.stringify(session), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleEmailChangeVerify(
  db: D1Database,
  otp: Record<string, unknown>,
  config: AuthConfig,
): Promise<Response> {
  const userId = otp.user_id as string;
  const emailChange = otp.email as string;

  // Apply email change
  const now = new Date().toISOString();
  await db
    .prepare(
      'UPDATE auth_users SET email = ?, email_confirmed_at = ?, updated_at = ? WHERE id = ?',
    )
    .bind(emailChange, now, now, userId)
    .run();

  // Mark OTP as consumed
  await db
    .prepare('UPDATE auth_otps SET consumed = 1 WHERE id = ?')
    .bind(otp.id as string)
    .run();

  // Create session
  const session = await createFullSession(db, userId, config.jwtSecret, config.jwtExpiry);

  return new Response(JSON.stringify(session), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
