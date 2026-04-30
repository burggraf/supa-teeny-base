import type { D1Database } from '@cloudflare/workers-types';
import { ensureAuthSchema } from './schema';
import { AUTH_ERRORS, buildAuthErrorBody } from './errorCodes';

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
}

export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  signup: { maxAttempts: 3, windowSeconds: 60, lockoutSeconds: 300 },
  login: { maxAttempts: 10, windowSeconds: 60, lockoutSeconds: 300 },
  otp: { maxAttempts: 5, windowSeconds: 60, lockoutSeconds: 300 },
  reset: { maxAttempts: 3, windowSeconds: 60, lockoutSeconds: 300 },
  resend: { maxAttempts: 3, windowSeconds: 60, lockoutSeconds: 300 },
};

/**
 * Check rate limit for an identifier + action.
 * Returns null if within limits, or a Response if rate limited.
 */
export async function checkRateLimit(
  db: D1Database,
  identifier: string,
  action: string,
  config?: RateLimitConfig,
): Promise<Response | null> {
  await ensureAuthSchema(db);
  const limits = config ?? DEFAULT_RATE_LIMITS[action] ?? DEFAULT_RATE_LIMITS.login;
  const now = new Date().toISOString();

  const row = await db.prepare(
    `SELECT * FROM auth_rate_limits WHERE identifier = ? AND action = ?`
  ).bind(identifier, action).first<Record<string, unknown>>();

  if (!row) {
    // First attempt — create record
    await db.prepare(
      `INSERT INTO auth_rate_limits (id, identifier, action, attempt_count, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    ).bind(crypto.randomUUID(), identifier, action, now, now).run();
    return null;
  }

  // Check if locked out
  if (row.locked_until) {
    const lockoutUntil = new Date(row.locked_until as string);
    if (lockoutUntil > new Date()) {
      return new Response(
        buildAuthErrorBody('lockout_active', 'Too many attempts, try again later'),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
    // Lockout expired — reset
    await db.prepare(
      `UPDATE auth_rate_limits SET attempt_count = 1, locked_until = NULL, updated_at = ? WHERE id = ?`
    ).bind(now, row.id).run();
    return null;
  }

  // Check window
  const updatedAt = new Date(row.updated_at as string);
  const elapsedMs = Date.now() - updatedAt.getTime();
  if (elapsedMs > limits.windowSeconds * 1000) {
    // Window expired — reset
    await db.prepare(
      `UPDATE auth_rate_limits SET attempt_count = 1, updated_at = ? WHERE id = ?`
    ).bind(now, row.id).run();
    return null;
  }

  // Within window — increment
  const newCount = (row.attempt_count as number) + 1;
  if (newCount > limits.maxAttempts) {
    // Lockout
    const lockoutUntil = new Date(Date.now() + limits.lockoutSeconds * 1000).toISOString();
    await db.prepare(
      `UPDATE auth_rate_limits SET attempt_count = ?, locked_until = ?, updated_at = ? WHERE id = ?`
    ).bind(newCount, lockoutUntil, now, row.id).run();
    return new Response(
      buildAuthErrorBody('lockout_active', 'Too many attempts, try again later'),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  await db.prepare(
    `UPDATE auth_rate_limits SET attempt_count = ?, updated_at = ? WHERE id = ?`
  ).bind(newCount, now, row.id).run();
  return null;
}
