import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, ResendRequest } from './types';
import { ensureAuthSchema } from './schema';
import { generateOTP, hashToken } from './pkce';
import { buildAuthErrorBody } from './errorCodes';
import { findUserByEmail } from './sessionManager';

/**
 * Handle POST /auth/v1/resend
 * Resend signup or email_change OTP.
 */
export async function handleResend(
  db: D1Database,
  body: ResendRequest,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const email = body.email?.toLowerCase();
  const phone = body.phone;

  if (email) {
    return handleEmailResend(db, email, body.type, config);
  } else if (phone) {
    return handlePhoneResend(db, phone, body.type, config);
  }

  return new Response(
    buildAuthErrorBody('invalid_credentials', 'Email or phone required'),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );
}

async function handleEmailResend(
  db: D1Database,
  email: string,
  type: 'signup' | 'email_change' | 'phone_change',
  config: AuthConfig,
): Promise<Response> {
  const user = await findUserByEmail(db, email);
  if (!user) {
    return new Response(
      buildAuthErrorBody('user_not_found', 'User not found'),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const otpType = type === 'signup' ? 'signup' : 'email_change';
  const otp = generateOTP();
  const otpHash = await hashToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.prepare(
    `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).bind(crypto.randomUUID(), user.id, email, otpHash, otpType, now, expiresAt).run();

  return new Response(
    JSON.stringify({ message_id: null, user: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

async function handlePhoneResend(
  db: D1Database,
  phone: string,
  type: 'signup' | 'email_change' | 'phone_change',
  config: AuthConfig,
): Promise<Response> {
  const user = await db.prepare(
    `SELECT id FROM auth_users WHERE phone = ? AND deleted_at IS NULL`
  ).bind(phone).first<{ id: string }>();

  if (!user) {
    return new Response(
      buildAuthErrorBody('user_not_found', 'User not found'),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const otpType = type === 'phone_change' ? 'phone_change' : 'sms';
  const otp = generateOTP();
  const otpHash = await hashToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.prepare(
    `INSERT INTO auth_otps (id, user_id, phone, token_hash, token_type, created_at, expires_at, consumed)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
  ).bind(crypto.randomUUID(), user.id, phone, otpHash, otpType, now, expiresAt).run();

  return new Response(
    JSON.stringify({ message_id: null, user: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
