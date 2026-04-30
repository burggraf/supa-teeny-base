import type { D1Database } from '@cloudflare/workers-types';
import type { AuthConfig } from './types';
import { verifyJWT, decodeJWTPayloadUnsafe } from './jwt';
import { throwAuthError } from './errorCodes';
import { revokeAllSessions, revokeSession, findSession } from './sessionManager';

/**
 * Handle POST /auth/v1/logout
 * scope: 'global' | 'local' | 'others'
 * - global: revoke all sessions for user
 * - local: revoke current session only
 * - others: revoke all other sessions
 */
export async function handleLogout(
  db: D1Database,
  authHeader: string,
  scope: string,
  config: AuthConfig,
): Promise<void> {
  const token = extractBearerToken(authHeader);
  const payload = await verifyJWT(token, config.jwtSecret);
  const userId = payload.sub as string;

  switch (scope) {
    case 'global':
      await revokeAllSessions(db, userId);
      break;

    case 'local': {
      // Need to find which session this JWT corresponds to.
      // Since JWT doesn't contain the refresh token, we revoke the most recent active session.
      // Alternative: track current session via a cookie or separate field.
      // For simplicity, revoke all sessions (same as global for local scope).
      // Better approach: look up the session associated with this JWT's jti if we had it.
      // Since we don't have jti, find the most recent non-revoked session for this user.
      const session = await findMostRecentSession(db, userId);
      if (session) {
        await revokeSession(db, session.id);
      }
      break;
    }

    case 'others': {
      const session = await findMostRecentSession(db, userId);
      if (session) {
        await revokeAllSessions(db, userId, session.id);
      } else {
        await revokeAllSessions(db, userId);
      }
      break;
    }

    default:
      // Default to global if scope not specified
      await revokeAllSessions(db, userId);
      break;
  }
}

/** Find the most recent non-revoked session for a user */
async function findMostRecentSession(
  db: D1Database,
  userId: string,
): Promise<{ id: string } | null> {
  const row = await db.prepare(
    'SELECT id FROM auth_sessions WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first<{ id: string }>();

  return row ?? null;
}

/** Extract Bearer token from Authorization header */
function extractBearerToken(authHeader: string): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throwAuthError('INVALID_TOKEN', 'Missing or invalid Authorization header');
  }
  return authHeader.slice(7);
}
