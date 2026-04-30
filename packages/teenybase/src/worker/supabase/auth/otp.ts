import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, OTPRequest } from './types';
import { ensureAuthSchema } from './schema';
import { generateOTP, hashToken } from './pkce';
import { buildAuthErrorBody, AUTH_ERRORS } from './errorCodes';
import { findUserByEmail } from './sessionManager';

/**
 * Handle POST /auth/v1/otp
 * Sends OTP to email or phone (stored in D1, no actual sending in v1).
 */
export async function handleOTP(
  db: D1Database,
  body: OTPRequest,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const email = body.email?.toLowerCase();
  const phone = body.phone;
  const userData = body.data || {};
  const createUser = body.create_user ?? true;

  if (email) {
    return handleEmailOTP(db, email, userData, createUser, config);
  } else if (phone) {
    return handlePhoneOTP(db, phone, createUser, config);
  }

  return new Response(
    buildAuthErrorBody('invalid_credentials', 'Email or phone required'),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );
}

async function handleEmailOTP(
  db: D1Database,
  email: string,
  userData: Record<string, unknown>,
  createUser: boolean,
  config: AuthConfig,
): Promise<Response> {
  const otp = generateOTP();
  const otpHash = await hashToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Check if user exists
  let user = await findUserByEmail(db, email);
  let userId: string | null = null;

  if (user) {
    userId = user.id as string;
  } else if (createUser) {
    // Create user on the fly
    userId = crypto.randomUUID();
    const appMetadata = { provider: 'email', providers: ['email'] };
    await db.prepare(
      `INSERT INTO auth_users (id, email, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       VALUES (?, ?, 'authenticated', ?, ?, ?, ?)`
    ).bind(
      userId, email,
      JSON.stringify(appMetadata),
      JSON.stringify(userData),
      now, now,
    ).run();
  } else {
    return new Response(
      buildAuthErrorBody('user_not_found', 'User not found'),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Store OTP
  await db.prepare(
    `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
     VALUES (?, ?, ?, ?, 'magiclink', ?, ?, 0)`
  ).bind(crypto.randomUUID(), userId, email, otpHash, now, expiresAt).run();

  return new Response(
    JSON.stringify({ message_id: null, user: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

async function handlePhoneOTP(
  db: D1Database,
  phone: string,
  createUser: boolean,
  config: AuthConfig,
): Promise<Response> {
  const otp = generateOTP();
  const otpHash = await hashToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  let user = await db.prepare(
    `SELECT id FROM auth_users WHERE phone = ? AND deleted_at IS NULL`
  ).bind(phone).first<{ id: string }>();

  let userId: string | null = null;
  if (user) {
    userId = user.id;
  } else if (createUser) {
    userId = crypto.randomUUID();
    const appMetadata = { provider: 'phone', providers: ['phone'] };
    await db.prepare(
      `INSERT INTO auth_users (id, phone, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       VALUES (?, ?, 'authenticated', ?, ?, ?, ?)`
    ).bind(
      userId, phone,
      JSON.stringify(appMetadata), '{}',
      now, now,
    ).run();
  } else {
    return new Response(
      buildAuthErrorBody('user_not_found', 'User not found'),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  await db.prepare(
    `INSERT INTO auth_otps (id, user_id, phone, token_hash, token_type, created_at, expires_at, consumed)
     VALUES (?, ?, ?, ?, 'sms', ?, ?, 0)`
  ).bind(crypto.randomUUID(), userId, phone, otpHash, now, expiresAt).run();

  return new Response(
    JSON.stringify({ message_id: null, user: null }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}
