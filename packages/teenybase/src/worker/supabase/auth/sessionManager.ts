import type { D1Database } from '@cloudflare/workers-types';
import type { AuthUser, SessionResponse, UserResponse } from './types';
import { buildJWTPayload, signJWT } from './jwt';

/** Generate random hex string */
function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/** Generate UUID v4 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/** Create a new session. Returns the 64-char hex refresh token (which is also the session id). */
export async function createSession(db: D1Database, userId: string): Promise<string> {
  const refreshToken = randomHex(32); // 64 hex chars
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO auth_sessions (id, user_id, created_at, updated_at, revoked) VALUES (?, ?, ?, ?, 0)'
  ).bind(refreshToken, userId, now, now).run();

  return refreshToken;
}

/** Revoke a single session by refresh token */
export async function revokeSession(db: D1Database, refreshToken: string): Promise<void> {
  await db.prepare(
    `UPDATE auth_sessions SET revoked = 1, updated_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), refreshToken).run();
}

/** Revoke all sessions for a user, optionally excluding one token */
export async function revokeAllSessions(
  db: D1Database,
  userId: string,
  exceptToken?: string,
): Promise<void> {
  const now = new Date().toISOString();
  if (exceptToken) {
    await db.prepare(
      `UPDATE auth_sessions SET revoked = 1, updated_at = ? WHERE user_id = ? AND id != ? AND revoked = 0`
    ).bind(now, userId, exceptToken).run();
  } else {
    await db.prepare(
      `UPDATE auth_sessions SET revoked = 1, updated_at = ? WHERE user_id = ? AND revoked = 0`
    ).bind(now, userId).run();
  }
}

/** Find session by refresh token. Returns null if not found or revoked. */
export async function findSession(
  db: D1Database,
  refreshToken: string,
): Promise<{ id: string; user_id: string; revoked: number } | null> {
  const row = await db.prepare(
    'SELECT id, user_id, revoked FROM auth_sessions WHERE id = ?'
  ).bind(refreshToken).first<{ id: string; user_id: string; revoked: number }>();

  return row ?? null;
}

/** Find user by ID */
export async function findUserById(db: D1Database, userId: string): Promise<AuthUser | null> {
  const row = await db.prepare(
    'SELECT * FROM auth_users WHERE id = ? AND deleted_at IS NULL'
  ).bind(userId).first<AuthUser>();

  return row ?? null;
}

/** Find user by email (case-insensitive) */
export async function findUserByEmail(db: D1Database, email: string): Promise<AuthUser | null> {
  const row = await db.prepare(
    'SELECT * FROM auth_users WHERE LOWER(email) = LOWER(?)'
  ).bind(email).first<AuthUser>();

  return row ?? null;
}

/** Convert DB user row to Supabase UserResponse shape */
export function toUserResponse(user: AuthUser): UserResponse {
  const appMetadata: Record<string, unknown> = user.raw_app_meta_data
    ? JSON.parse(user.raw_app_meta_data)
    : { provider: 'email', providers: ['email'] };

  const userMetadata: Record<string, unknown> = user.raw_user_meta_data
    ? JSON.parse(user.raw_user_meta_data)
    : {};

  return {
    id: user.id,
    aud: user.role ?? 'authenticated',
    role: user.role ?? 'authenticated',
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    phone: user.phone,
    phone_confirmed_at: user.phone_confirmed_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_sign_in_at: user.last_sign_in_at,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
    banned_until: user.banned_until,
  };
}

/** Build full session response with JWT, refresh token, and user */
export async function buildSessionResponse(
  db: D1Database,
  userId: string,
  jwtToken: string,
  refreshToken: string,
  jwtExpiry: number,
): Promise<SessionResponse> {
  const user = await findUserById(db, userId);
  if (!user) throw new Error('User not found');

  const userResponse = toUserResponse(user);
  const expiresAt = Math.floor(Date.now() / 1000) + jwtExpiry;

  return {
    access_token: jwtToken,
    token_type: 'bearer',
    expires_in: jwtExpiry,
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user: userResponse,
  };
}

/** Create session + JWT + return full SessionResponse (used by signup auto-confirm) */
export async function createFullSession(
  db: D1Database,
  userId: string,
  jwtSecret: string,
  jwtExpiry: number,
): Promise<SessionResponse> {
  const user = await findUserById(db, userId);
  if (!user) throw new Error('User not found');

  const refreshToken = await createSession(db, userId);

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
    jwtExpiry,
  );

  const jwtToken = await signJWT(payload, jwtSecret);
  return buildSessionResponse(db, userId, jwtToken, refreshToken, jwtExpiry);
}

/** Create anonymous user and session */
export async function createAnonymousSession(
  db: D1Database,
  jwtSecret: string,
  jwtExpiry: number,
): Promise<SessionResponse> {
  const userId = generateUUID();
  const now = new Date().toISOString();
  const appMetadata = JSON.stringify({ provider: 'anonymous', providers: ['anonymous'] });

  await db.prepare(
    `INSERT INTO auth_users (id, email, phone, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES (?, NULL, NULL, 'anon', ?, '{}', ?, ?)`
  ).bind(userId, appMetadata, now, now).run();

  const refreshToken = await createSession(db, userId);

  const payload = buildJWTPayload(userId, null, null, 'anon', JSON.parse(appMetadata), {}, jwtExpiry);
  const jwtToken = await signJWT(payload, jwtSecret);

  return buildSessionResponse(db, userId, jwtToken, refreshToken, jwtExpiry);
}
