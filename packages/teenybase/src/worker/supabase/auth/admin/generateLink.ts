import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig, GenerateLinkType, UserResponse } from './types';
import { ensureAuthSchema } from '../schema';
import { hashPassword, validatePasswordStrength } from '../passwordHasher';
import { generateOTP, hashToken } from '../pkce';
import { findUserByEmail, findUserById } from '../sessionManager';
import { buildAuthErrorBody } from '../errorCodes';

/**
 * POST /auth/v1/admin/generate_link
 * Generate signup, invite, magiclink, recovery, or email_change links.
 */
export async function handleGenerateLink(
  db: D1Database,
  body: Record<string, unknown>,
  config: AuthConfig,
): Promise<Response> {
  await ensureAuthSchema(db);

  const type = body.type as GenerateLinkType;
  const email = (body.email as string)?.toLowerCase();
  const password = body.password as string | undefined;
  const userData = (body.data as Record<string, unknown>) || {};
  const redirectTo = (body.redirect_to as string) || 'http://localhost:3000';

  if (!email) {
    return new Response(buildAuthErrorBody('invalid_credentials', 'Email required'), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  }

  const otp = generateOTP();
  const otpHash = await hashToken(otp);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const siteUrl = 'http://localhost:8787';

  switch (type) {
    case 'signup': {
      if (!password) {
        return new Response(buildAuthErrorBody('weak_password', 'Password required for signup link'), {
          status: 422, headers: { 'Content-Type': 'application/json' },
        });
      }
      const pwCheck = validatePasswordStrength(password, config.passwordMinLength);
      if (!pwCheck.valid) {
        return new Response(buildAuthErrorBody('weak_password', pwCheck.reason), {
          status: 422, headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check if user exists
      const existing = await findUserByEmail(db, email);
      if (existing) {
        return new Response(buildAuthErrorBody('user_already_exists', 'User already registered'), {
          status: 422, headers: { 'Content-Type': 'application/json' },
        });
      }

      const userId = crypto.randomUUID();
      const hashed = await hashPassword(password);
      const appMeta = { provider: 'email', providers: ['email'] };

      await db.prepare(
        `INSERT INTO auth_users (id, email, encrypted_password, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES (?, ?, ?, 'authenticated', ?, ?, ?, ?)`
      ).bind(userId, email, hashed, JSON.stringify(appMeta), JSON.stringify(userData), now, now).run();

      // Store confirmation token
      await db.prepare(
        `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
         VALUES (?, ?, ?, ?, 'signup', ?, ?, 0)`
      ).bind(crypto.randomUUID(), userId, email, otpHash, now, expiresAt).run();

      const user = await findUserById(db, userId);
      const actionLink = `${siteUrl}/auth/v1/verify?token=${otp}&type=signup&redirect_to=${encodeURIComponent(redirectTo)}`;

      return new Response(JSON.stringify({
        action_link: actionLink,
        email_otp: otp,
        hashed_token: otpHash,
        redirect_to: redirectTo,
        verification_type: 'signup',
        user: toUserResponse(user!),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    case 'invite': {
      let user = await findUserByEmail(db, email);
      let userId: string;

      if (!user) {
        userId = crypto.randomUUID();
        const appMeta = { provider: 'email', providers: ['email'] };
        await db.prepare(
          `INSERT INTO auth_users (id, email, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
           VALUES (?, ?, 'authenticated', ?, ?, ?, ?)`
        ).bind(userId, email, JSON.stringify(appMeta), JSON.stringify(userData), now, now).run();
        user = await findUserById(db, userId);
      } else {
        userId = user.id as string;
      }

      await db.prepare(
        `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
         VALUES (?, ?, ?, ?, 'invite', ?, ?, 0)`
      ).bind(crypto.randomUUID(), userId, email, otpHash, now, expiresAt).run();

      const actionLink = `${siteUrl}/auth/v1/verify?token=${otp}&type=invite&redirect_to=${encodeURIComponent(redirectTo)}`;

      return new Response(JSON.stringify({
        action_link: actionLink,
        email_otp: otp,
        hashed_token: otpHash,
        redirect_to: redirectTo,
        verification_type: 'invite',
        user: toUserResponse(user!),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    case 'magiclink':
    case 'recovery': {
      const user = await findUserByEmail(db, email);
      if (!user) {
        return new Response(JSON.stringify({}), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      const otpType = type;
      await db.prepare(
        `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
      ).bind(crypto.randomUUID(), user.id, email, otpHash, otpType, now, expiresAt).run();

      const actionLink = `${siteUrl}/auth/v1/verify?token=${otp}&type=${otpType}&redirect_to=${encodeURIComponent(redirectTo)}`;

      return new Response(JSON.stringify({
        action_link: actionLink,
        email_otp: otp,
        hashed_token: otpHash,
        redirect_to: redirectTo,
        verification_type: otpType,
        user: toUserResponse(user),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    case 'email_change': {
      const newEmail = (body.new_email as string)?.toLowerCase();
      if (!newEmail) {
        return new Response(buildAuthErrorBody('invalid_credentials', 'new_email required for email_change'), {
          status: 422, headers: { 'Content-Type': 'application/json' },
        });
      }

      const user = await findUserByEmail(db, email);
      if (!user) {
        return new Response(JSON.stringify({}), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      await db.prepare(
        `INSERT INTO auth_otps (id, user_id, email, token_hash, token_type, created_at, expires_at, consumed)
         VALUES (?, ?, ?, ?, 'email_change', ?, ?, 0)`
      ).bind(crypto.randomUUID(), user.id, email, otpHash, now, expiresAt).run();

      const actionLink = `${siteUrl}/auth/v1/verify?token=${otp}&type=email_change&redirect_to=${encodeURIComponent(redirectTo)}`;

      return new Response(JSON.stringify({
        action_link: actionLink,
        email_otp: otp,
        hashed_token: otpHash,
        redirect_to: redirectTo,
        verification_type: 'email_change',
        user: toUserResponse(user),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    default:
      return new Response(buildAuthErrorBody('invalid_code', `Unknown link type: ${type}`), {
        status: 422, headers: { 'Content-Type': 'application/json' },
      });
  }
}

function toUserResponse(user: Record<string, unknown>): UserResponse {
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
