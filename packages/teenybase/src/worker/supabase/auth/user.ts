import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, UserResponse, UpdateUserRequest } from './types';
import { verifyJWT } from './jwt';
import { hashPassword } from './passwordHasher';
import { throwAuthError } from './errorCodes';
import { findUserById, toUserResponse } from './sessionManager';

/**
 * Handle GET /auth/v1/user
 * Extract JWT from Authorization header: "Bearer <token>"
 */
export async function handleGetUser(
  db: D1Database,
  authHeader: string,
  config: AuthConfig,
): Promise<UserResponse> {
  const token = extractBearerToken(authHeader);
  const payload = await verifyJWT(token, config.jwtSecret);
  const userId = payload.sub as string;

  const user = await findUserById(db, userId);
  if (!user) {
    throwAuthError('INVALID_TOKEN', 'User not found');
  }

  return toUserResponse(user);
}

/**
 * Handle PUT /auth/v1/user
 * Update email, password, or user_metadata
 */
export async function handleUpdateUser(
  db: D1Database,
  authHeader: string,
  body: UpdateUserRequest,
  config: AuthConfig,
): Promise<UserResponse> {
  const token = extractBearerToken(authHeader);
  const payload = await verifyJWT(token, config.jwtSecret);
  const userId = payload.sub as string;

  const user = await findUserById(db, userId);
  if (!user) {
    throwAuthError('INVALID_TOKEN', 'User not found');
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: unknown[] = [];

  // Update email (requires re-confirmation)
  if (body.email !== undefined && body.email !== user.email) {
    updates.push('email = ?', 'email_confirmed_at = NULL');
    values.push(body.email.toLowerCase());
  }

  // Update password (rehash)
  if (body.password !== undefined) {
    if (body.password.length < config.passwordMinLength) {
      throwAuthError('WEAK_PASSWORD', `Password should be at least ${config.passwordMinLength} characters`);
    }
    const hashed = await hashPassword(body.password);
    updates.push('encrypted_password = ?');
    values.push(hashed);
  }

  // Update user_metadata (merge)
  if (body.data !== undefined) {
    const existingMeta = user.raw_user_meta_data
      ? JSON.parse(user.raw_user_meta_data)
      : {};
    const merged = { ...existingMeta, ...body.data };
    updates.push('raw_user_meta_data = ?');
    values.push(JSON.stringify(merged));
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(now);
    values.push(userId);

    const setClause = updates.map((u, i) => {
      if (u === 'updated_at = ?') return u;
      return u;
    }).join(', ');

    await db.prepare(
      `UPDATE auth_users SET ${setClause} WHERE id = ?`
    ).bind(...values).run();
  }

  // Return updated user
  const updated = await findUserById(db, userId);
  if (!updated) throw new Error('User not found after update');
  return toUserResponse(updated);
}

/** Extract Bearer token from Authorization header */
function extractBearerToken(authHeader: string): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throwAuthError('INVALID_TOKEN', 'Missing or invalid Authorization header');
  }
  return authHeader.slice(7);
}
