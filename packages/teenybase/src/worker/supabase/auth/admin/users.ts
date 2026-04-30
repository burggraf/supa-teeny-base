import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, UserResponse } from './types';
import { ensureAuthSchema } from '../schema';
import { hashPassword, validatePasswordStrength } from '../passwordHasher';
import { buildJWTPayload, signJWT } from '../jwt';
import { createSession, buildSessionResponse, findUserById } from '../sessionManager';
import { throwAuthError, buildAuthErrorBody, AUTH_ERRORS } from '../errorCodes';

/**
 * POST /auth/v1/admin/users — Create user (service_role only)
 */
export async function handleAdminCreateUser(
  db: D1Database,
  body: Record<string, unknown>,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const email = (body.email as string)?.toLowerCase();
  const phone = body.phone as string | undefined;
  const password = body.password as string | undefined;
  const emailConfirm = body.email_confirm as boolean ?? false;
  const userMetadata = (body.user_metadata as Record<string, unknown>) || {};
  const appMetadata = (body.app_metadata as Record<string, unknown>) || {};

  if (!email && !phone) {
    return new Response(buildAuthErrorBody('invalid_credentials', 'Email or phone required'), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check duplicate
  if (email) {
    const existing = await db.prepare(`SELECT id FROM auth_users WHERE email = ? AND deleted_at IS NULL`).bind(email).first();
    if (existing) {
      return new Response(buildAuthErrorBody('user_already_exists', 'User already registered'), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const role = (body.role as string) || 'authenticated';
  const finalAppMeta = { ...appMetadata, provider: email ? 'email' : 'phone', providers: [email ? 'email' : 'phone'] };

  let hashedPassword: string | null = null;
  if (password) {
    const pwCheck = validatePasswordStrength(password, config.passwordMinLength);
    if (!pwCheck.valid) {
      return new Response(buildAuthErrorBody('weak_password', pwCheck.reason), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }
    hashedPassword = await hashPassword(password);
  }

  await db.prepare(
    `INSERT INTO auth_users (id, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    userId, email || null, phone || null, hashedPassword,
    emailConfirm ? now : null, phone || emailConfirm ? now : null,
    role, JSON.stringify(finalAppMeta), JSON.stringify(userMetadata),
    now, now,
  ).run();

  const user = await findUserById(db, userId);
  if (!user) throw new Error('User not found after creation');

  return new Response(JSON.stringify(toAdminUserResponse(user)), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /auth/v1/admin/users — List users (paginated)
 */
export async function handleAdminListUsers(
  db: D1Database,
  params: { page?: string; per_page?: string },
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const page = parseInt(params.page || '1', 10);
  const perPage = Math.min(parseInt(params.per_page || '50', 10), 1000);
  const offset = (page - 1) * perPage;

  const { results } = await db.prepare(
    `SELECT * FROM auth_users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(perPage, offset).all<Record<string, unknown>>();

  const { total } = await db.prepare(
    `SELECT COUNT(*) as total FROM auth_users WHERE deleted_at IS NULL`
  ).first<{ total: number }>();

  const users = (results || []).map(toAdminUserResponse);

  return new Response(JSON.stringify({ users, total_count: total }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /auth/v1/admin/users/:uid — Get user by ID
 */
export async function handleAdminGetUser(
  db: D1Database,
  uid: string,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const user = await findUserById(db, uid);
  if (!user) {
    return new Response(JSON.stringify({ code: 'user_not_found', message: 'User not found', details: null, hint: null }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(toAdminUserResponse(user)), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * PUT /auth/v1/admin/users/:uid — Update user
 */
export async function handleAdminUpdateUser(
  db: D1Database,
  uid: string,
  body: Record<string, unknown>,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const user = await findUserById(db, uid);
  if (!user) {
    return new Response(JSON.stringify({ code: 'user_not_found', message: 'User not found', details: null, hint: null }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.email !== undefined) {
    updates.push('email = ?', 'email_confirmed_at = ?');
    values.push((body.email as string).toLowerCase(), body.email_confirm ? now : null);
  }
  if (body.password !== undefined) {
    const pw = body.password as string;
    const pwCheck = validatePasswordStrength(pw, config.passwordMinLength);
    if (!pwCheck.valid) {
      return new Response(buildAuthErrorBody('weak_password', pwCheck.reason), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
    }
    updates.push('encrypted_password = ?');
    values.push(await hashPassword(pw));
  }
  if (body.role !== undefined) {
    updates.push('role = ?');
    values.push(body.role);
  }
  if (body.banned_until !== undefined) {
    updates.push('banned_until = ?');
    values.push(body.banned_until || null);
  }
  if (body.user_metadata !== undefined) {
    updates.push('raw_user_meta_data = ?');
    values.push(JSON.stringify(body.user_metadata));
  }
  if (body.app_metadata !== undefined) {
    updates.push('raw_app_meta_data = ?');
    values.push(JSON.stringify(body.app_metadata));
  }
  if (body.email_confirm === true) {
    updates.push('email_confirmed_at = ?');
    values.push(now);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(now);
    values.push(uid);
    const setClause = updates.join(', ');
    await db.prepare(`UPDATE auth_users SET ${setClause} WHERE id = ?`).bind(...values).run();
  }

  const updated = await findUserById(db, uid);
  if (!updated) throw new Error('User not found after update');
  return new Response(JSON.stringify(toAdminUserResponse(updated)), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /auth/v1/admin/users/:uid — Delete user
 */
export async function handleAdminDeleteUser(
  db: D1Database,
  uid: string,
  params: { should_soft_delete?: string },
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const user = await findUserById(db, uid);
  if (!user) {
    return new Response(JSON.stringify({ code: 'user_not_found', message: 'User not found', details: null, hint: null }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const softDelete = params.should_soft_delete !== 'false';
  const now = new Date().toISOString();

  if (softDelete) {
    await db.prepare(`UPDATE auth_users SET deleted_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, uid).run();
  } else {
    await db.prepare(`DELETE FROM auth_users WHERE id = ?`).bind(uid).run();
    // Also delete sessions and OTPs
    await db.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(uid).run();
    await db.prepare(`DELETE FROM auth_otps WHERE user_id = ?`).bind(uid).run();
  }

  return new Response(JSON.stringify({}), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/** Convert DB row to admin user response */
function toAdminUserResponse(user: Record<string, unknown>): UserResponse {
  const appMeta = typeof user.raw_app_meta_data === 'string'
    ? JSON.parse(user.raw_app_meta_data as string)
    : (user.raw_app_meta_data || {});
  const userMeta = typeof user.raw_user_meta_data === 'string'
    ? JSON.parse(user.raw_user_meta_data as string)
    : (user.raw_user_meta_data || {});

  return {
    id: user.id as string,
    aud: (user.role as string) || 'authenticated',
    role: (user.role as string) || 'authenticated',
    email: user.email as string | null,
    email_confirmed_at: user.email_confirmed_at as string | null,
    phone: user.phone as string | null,
    phone_confirmed_at: user.phone_confirmed_at as string | null,
    created_at: user.created_at as string,
    updated_at: user.updated_at as string,
    last_sign_in_at: user.last_sign_in_at as string | null,
    user_metadata: userMeta,
    app_metadata: appMeta,
    banned_until: user.banned_until as string | null,
  };
}
