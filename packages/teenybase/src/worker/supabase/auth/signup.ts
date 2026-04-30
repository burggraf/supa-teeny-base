import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, SignupRequest } from './types';
import { hashPassword, validatePasswordStrength } from './passwordHasher';
import { generateOTP, hashToken } from './pkce';
import { throwAuthError, AUTH_ERRORS } from './errorCodes';
import { findUserByEmail, createFullSession, toUserResponse } from './sessionManager';
import { checkRateLimit } from './rateLimiter';

/** Generate a random confirmation token */
function generateConfirmationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Handle POST /auth/v1/signup */
export async function handleSignup(
  db: D1Database,
  body: SignupRequest,
  config: AuthConfig,
  clientIp?: string,
): Promise<Response> {
  // Check signup enabled
  if (!config.signupEnabled) {
    throwAuthError('SIGNUP_DISABLED', 'Signups not allowed');
  }

  const { email, password, phone, data, redirect_to } = body;

  // Rate limit by IP (or email fallback)
  const rateId = clientIp || email || 'unknown';
  const rateLimit = await checkRateLimit(db, rateId, 'signup');
  if (rateLimit) return rateLimit;

  // Determine signup method: email+password or phone+password
  if (email) {
    return handleEmailSignup(db, email, password, data, redirect_to, config);
  }

  if (phone) {
    return handlePhoneSignup(db, phone, password, data, redirect_to, config);
  }

  throwAuthError('INVALID_CREDENTIALS', 'Email or phone required');
}

async function handleEmailSignup(
  db: D1Database,
  email: string,
  password: string | undefined,
  data: Record<string, unknown> | undefined,
  redirect_to: string | undefined,
  config: AuthConfig,
): Promise<Response> {
  // Validate password
  if (!password) {
    throwAuthError('INVALID_CREDENTIALS', 'Password required');
  }

  // Password strength check
  const strength = validatePasswordStrength(password, config.passwordMinLength);
  if (!strength.valid) {
    throwAuthError('WEAK_PASSWORD', strength.reason ?? 'Weak password');
  }

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Check duplicate
  const existing = await findUserByEmail(db, normalizedEmail);
  if (existing) {
    throwAuthError('USER_ALREADY_EXISTS', 'User already registered');
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userMetadata = data ? JSON.stringify(data) : null;
  const appMetadata = JSON.stringify({ provider: 'email', providers: ['email'] });

  await db
    .prepare(
      `INSERT INTO auth_users (
        id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data,
        role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'authenticated', ?, ?)`,
    )
    .bind(userId, normalizedEmail, hashedPassword, userMetadata, appMetadata, now, now)
    .run();

  if (config.emailAutoConfirm) {
    // Auto-confirm: create session + JWT
    await db
      .prepare('UPDATE auth_users SET email_confirmed_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, userId)
      .run();

    const session = await createFullSession(db, userId, config.jwtSecret, config.jwtExpiry);
    return new Response(JSON.stringify(session), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Confirmation required: generate OTP
  const confirmationToken = generateConfirmationToken();
  const tokenHash = await hashToken(confirmationToken);
  const otpId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  await db
    .prepare(
      'INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(otpId, userId, normalizedEmail, tokenHash, 'signup', now, expiresAt, 0)
    .run();

  // Return user without session
  const user = await db
    .prepare('SELECT * FROM auth_users WHERE id = ?')
    .bind(userId)
    .first();

  const userResponse = toUserResponse(user!);
  // Strip confirmed_at since not confirmed yet
  userResponse.email_confirmed_at = null;

  return new Response(JSON.stringify(userResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handlePhoneSignup(
  db: D1Database,
  phone: string,
  password: string | undefined,
  data: Record<string, unknown> | undefined,
  redirect_to: string | undefined,
  config: AuthConfig,
): Promise<Response> {
  if (!password) {
    throwAuthError('INVALID_CREDENTIALS', 'Password required');
  }

  const strength = validatePasswordStrength(password, config.passwordMinLength);
  if (!strength.valid) {
    throwAuthError('WEAK_PASSWORD', strength.reason ?? 'Weak password');
  }

  // Check duplicate phone
  const existing = await db
    .prepare('SELECT * FROM auth_users WHERE phone = ? AND deleted_at IS NULL')
    .bind(phone)
    .first();

  if (existing) {
    throwAuthError('USER_ALREADY_EXISTS', 'User already registered');
  }

  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const userMetadata = data ? JSON.stringify(data) : null;
  const appMetadata = JSON.stringify({ provider: 'phone', providers: ['phone'] });

  await db
    .prepare(
      `INSERT INTO auth_users (
        id, phone, encrypted_password, raw_user_meta_data, raw_app_meta_data,
        role, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'authenticated', ?, ?)`,
    )
    .bind(userId, phone, hashedPassword, userMetadata, appMetadata, now, now)
    .run();

  if (config.emailAutoConfirm) {
    await db
      .prepare('UPDATE auth_users SET phone_confirmed_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, userId)
      .run();

    const session = await createFullSession(db, userId, config.jwtSecret, config.jwtExpiry);
    return new Response(JSON.stringify(session), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate OTP for phone confirmation
  const otpCode = generateOTP();
  const tokenHash = await hashToken(otpCode);
  const otpId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      'INSERT INTO auth_otps (id, user_id, phone, token_hash, token_type, created_at, expires_at, consumed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(otpId, userId, phone, tokenHash, 'signup', now, expiresAt, 0)
    .run();

  const user = await db
    .prepare('SELECT * FROM auth_users WHERE id = ?')
    .bind(userId)
    .first();

  const userResponse = toUserResponse(user!);
  userResponse.phone_confirmed_at = null;

  return new Response(JSON.stringify(userResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
