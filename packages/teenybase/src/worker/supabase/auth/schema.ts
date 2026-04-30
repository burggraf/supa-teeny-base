import type { D1Database } from '@cloudflare/workers-types';

/** Ensure all auth-related tables exist in D1. Call once at startup. */
export async function ensureAuthSchema(db: D1Database): Promise<void> {
  const statements = [
    // Auth users — extends Teenybase's _auth_identities with full GoTrue user fields
    `CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      encrypted_password TEXT,
      email_confirmed_at TEXT,
      phone_confirmed_at TEXT,
      email_change TEXT,
      email_change_token_current TEXT,
      email_change_token_new TEXT,
      email_change_confirm_sent_at TEXT,
      recovery_token TEXT,
      recovery_sent_at TEXT,
      confirmation_token TEXT,
      confirmation_sent_at TEXT,
      raw_app_meta_data TEXT,
      raw_user_meta_data TEXT,
      is_super_admin INTEGER DEFAULT 0,
      role TEXT DEFAULT 'authenticated',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_sign_in_at TEXT,
      banned_until TEXT,
      deleted_at TEXT
    );`,

    // Refresh token sessions
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      revoked INTEGER DEFAULT 0
    );`,

    // One-time passwords (email OTP, magic links, recovery tokens, PKCE codes)
    `CREATE TABLE IF NOT EXISTS auth_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      phone TEXT,
      token_hash TEXT,
      token_type TEXT,
      code_challenge TEXT,
      code_challenge_method TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed INTEGER DEFAULT 0
    );`,

    // Rate limiting / brute force protection
    `CREATE TABLE IF NOT EXISTS auth_rate_limits (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      action TEXT NOT NULL,
      attempt_count INTEGER DEFAULT 1,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    // OAuth identities (for future OAuth support)
    `CREATE TABLE IF NOT EXISTS auth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      identity_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_id)
    );`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_token_hash ON auth_otps(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_email ON auth_otps(email)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_code_challenge ON auth_otps(code_challenge)`,
    `CREATE INDEX IF NOT EXISTS idx_identities_user ON auth_identities(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_identities_provider ON auth_identities(provider, provider_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON auth_rate_limits(identifier, action)`,
  ];

  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}
