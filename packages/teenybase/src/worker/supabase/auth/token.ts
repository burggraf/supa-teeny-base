import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, SessionResponse } from './types';
import { comparePassword } from './passwordHasher';
import { buildJWTPayload, signJWT } from './jwt';
import { throwAuthError } from './errorCodes';
import {
  createSession,
  revokeSession,
  findSession,
  findUserByEmail,
  findUserById,
  buildSessionResponse,
  createAnonymousSession,
} from './sessionManager';
import { verifyPKCE } from './pkce';
import { checkRateLimit } from './rateLimiter';

/**
 * Handle POST /auth/v1/token
 * grant_type comes from URL query string.
 * body contains grant-specific fields.
 */
export async function handleToken(
  db: D1Database,
  body: Record<string, unknown>,
  grantType: string,
  config: AuthConfig,
): Promise<SessionResponse> {
  switch (grantType) {
    case 'password':
      return handlePasswordGrant(db, body, config);
    case 'refresh_token':
      return handleRefreshTokenGrant(db, body, config);
    case 'pkce':
      return handlePKCEGrant(db, body, config);
    case 'anonymous':
      return handleAnonymousSignIn(db, config);
    default:
      throwAuthError('INVALID_CODE', `Unsupported grant_type: ${grantType}`);
  }
}

/** Password grant: email + password → session */
async function handlePasswordGrant(
  db: D1Database,
  body: Record<string, unknown>,
  config: AuthConfig,
): Promise<SessionResponse> {
  const email = body.email as string | undefined;
  const password = body.password as string | undefined;

  if (!email || !password) {
    throwAuthError('INVALID_CREDENTIALS', 'Missing email or password');
  }

  // Rate limit check
  const rateLimit = await checkRateLimit(db, email, 'login');
  if (rateLimit) {
    const rateBody = await rateLimit.json();
    const e = new Error(rateBody.message);
    (e as any).status = rateLimit.status;
    (e as any).code = rateBody.code;
    throw e;
  }

  const user = await findUserByEmail(db, email);
  if (!user) {
    // Don't enumerate: same error for missing user and wrong password
    throwAuthError('INVALID_CREDENTIALS', 'Invalid login credentials');
  }

  if (!user.encrypted_password) {
    throwAuthError('INVALID_CREDENTIALS', 'Invalid login credentials');
  }

  const valid = await comparePassword(password, user.encrypted_password);
  if (!valid) {
    throwAuthError('INVALID_CREDENTIALS', 'Invalid login credentials');
  }

  // Update last_sign_in_at
  const now = new Date().toISOString();
  await db.prepare(
    'UPDATE auth_users SET last_sign_in_at = ?, updated_at = ? WHERE id = ?'
  ).bind(now, now, user.id).run();

  // Create session and issue JWT
  const refreshToken = await createSession(db, user.id);

  const appMetadata = user.raw_app_meta_data
    ? JSON.parse(user.raw_app_meta_data)
    : { provider: 'email', providers: ['email'] };
  const userMetadata = user.raw_user_meta_data
    ? JSON.parse(user.raw_user_meta_data)
    : {};

  const payload = buildJWTPayload(
    user.id,
    user.email,
    user.phone,
    user.role ?? 'authenticated',
    appMetadata,
    userMetadata,
    config.jwtExpiry,
  );

  const jwtToken = await signJWT(payload, config.jwtSecret);

  return buildSessionResponse(db, user.id, jwtToken, refreshToken, config.jwtExpiry);
}

/** Refresh token grant: refresh_token → new session */
async function handleRefreshTokenGrant(
  db: D1Database,
  body: Record<string, unknown>,
  config: AuthConfig,
): Promise<SessionResponse> {
  const refreshToken = body.refresh_token as string | undefined;

  if (!refreshToken) {
    throwAuthError('SESSION_NOT_FOUND', 'Missing refresh_token');
  }

  const session = await findSession(db, refreshToken);
  if (!session || session.revoked === 1) {
    throwAuthError('SESSION_NOT_FOUND', 'Invalid or revoked refresh token');
  }

  // Single-use: revoke old token immediately
  await revokeSession(db, refreshToken);

  // Create new session
  const newRefreshToken = await createSession(db, session.user_id);

  const user = await findUserById(db, session.user_id);
  if (!user) {
    throwAuthError('SESSION_NOT_FOUND', 'User not found');
  }

  const appMetadata = user.raw_app_meta_data
    ? JSON.parse(user.raw_app_meta_data)
    : { provider: 'email', providers: ['email'] };
  const userMetadata = user.raw_user_meta_data
    ? JSON.parse(user.raw_user_meta_data)
    : {};

  const payload = buildJWTPayload(
    user.id,
    user.email,
    user.phone,
    user.role ?? 'authenticated',
    appMetadata,
    userMetadata,
    config.jwtExpiry,
  );

  const jwtToken = await signJWT(payload, config.jwtSecret);

  return buildSessionResponse(db, user.id, jwtToken, newRefreshToken, config.jwtExpiry);
}

/** PKCE grant: auth_code + code_verifier → session */
async function handlePKCEGrant(
  db: D1Database,
  body: Record<string, unknown>,
  config: AuthConfig,
): Promise<SessionResponse> {
  const authCode = body.auth_code as string | undefined;
  const codeVerifier = body.code_verifier as string | undefined;

  if (!authCode || !codeVerifier) {
    throwAuthError('INVALID_CODE', 'Missing auth_code or code_verifier');
  }

  const otp = await db.prepare(
    `SELECT * FROM auth_otps WHERE id = ? AND code_challenge IS NOT NULL AND consumed = 0`
  ).bind(authCode).first<Record<string, unknown>>();

  if (!otp) {
    throwAuthError('INVALID_CODE', 'Invalid auth_code');
  }

  const expiresAt = new Date(otp.expires_at as string);
  if (expiresAt < new Date()) {
    throwAuthError('CODE_EXPIRED', 'Auth code expired');
  }

  const storedChallenge = otp.code_challenge as string;
  if (!verifyPKCE(codeVerifier, storedChallenge)) {
    throwAuthError('CODE_VERIFIER_MISMATCH', 'Code verifier mismatch');
  }

  await db.prepare(
    `UPDATE auth_otps SET consumed = 1 WHERE id = ?`
  ).bind(authCode).run();

  const userId = otp.user_id as string;
  if (!userId) {
    throwAuthError('INVALID_CODE', 'No user associated with auth code');
  }

  const user = await findUserById(db, userId);
  if (!user) {
    throwAuthError('INVALID_CODE', 'User not found');
  }

  const appMetadata = user.raw_app_meta_data
    ? JSON.parse(user.raw_app_meta_data)
    : { provider: 'email', providers: ['email'] };
  const userMetadata = user.raw_user_meta_data
    ? JSON.parse(user.raw_user_meta_data)
    : {};

  const payload = buildJWTPayload(
    user.id, user.email, user.phone,
    user.role ?? 'authenticated',
    appMetadata, userMetadata,
    config.jwtExpiry,
  );

  const jwtToken = await signJWT(payload, config.jwtSecret);
  const refreshToken = await createSession(db, user.id);
  return buildSessionResponse(db, user.id, jwtToken, refreshToken, config.jwtExpiry);
}

/** Anonymous sign in: creates anonymous user with role='anon' */
export async function handleAnonymousSignIn(
  db: D1Database,
  config: AuthConfig,
): Promise<SessionResponse> {
  return createAnonymousSession(db, config.jwtSecret, config.jwtExpiry);
}
