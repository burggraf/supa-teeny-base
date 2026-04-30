# AUTH.md: GoTrue Auth API Compatibility Plan

## Goal

Implement GoTrue-compatible Auth layer on Teenybase. Every feature tested at 3 levels:
- **Unit** — pure functions (JWT encode/decode, password hashing, email validation, PKCE), no D1
- **Integration** — real D1 via `@cloudflare/vitest-pool-workers`, supabase-js client against test Hono app
- **E2E** — `wrangler dev` live server + `@supabase/supabase-js` client in Node

Each test uses:
- **supabase-js call** — exact code from Supabase docs
- **expected response shape** — `{ data: { user, session }, error }` structure from Supabase docs
- **D1 state assertion** — verify auth tables updated correctly

---

## Approach: Extract Tests from Supabase Docs

Auth docs pages have **interactive tabbed examples** showing different credential types, options, and response shapes. Unlike Data API pages (which include SQL data source + JSON response), Auth pages focus on:
1. **Example code** — `supabase.auth.signUp({ email, password })`
2. **Parameters** — credential object shapes, options
3. **Return type** — Promise shapes, user/session objects

We extract **example code** and **parameter/return shapes** to create test fixtures covering each tab variant.

### Extraction Script

```js
// For each auth page:
// 1. Navigate to URL
// 2. Find all h2 headings (each = an auth method)
// 3. For each heading, find all [role="tab"] elements
// 4. Click each tab, extract example code
// 5. Extract parameter descriptions and return type info
// 6. Save as structured test fixtures
```

---

## URLs to Process (Catalog)

### Auth Core (all methods on `supabase.auth.*`)
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 1 | `https://supabase.com/docs/reference/javascript/auth-api` | 2 | Overview |
| 2 | `https://supabase.com/docs/reference/javascript/auth-signup` | 5 | Email+password, phone+password, redirect URLs |
| 3 | `https://supabase.com/docs/reference/javascript/auth-signinwithpassword` | 2 | Email or phone credentials |
| 4 | `https://supabase.com/docs/reference/javascript/auth-signinwithotp` | 3 | Email OTP, phone OTP, captcha |
| 5 | `https://supabase.com/docs/reference/javascript/auth-verifyotp` | 3 | Types: signup, magiclink, recovery, invite, email_change, phone_change |
| 6 | `https://supabase.com/docs/reference/javascript/auth-signout` | 3 | Scopes: global, local, others |
| 7 | `https://supabase.com/docs/reference/javascript/auth-getsession` | 1 | Returns current session from storage |
| 8 | `https://supabase.com/docs/reference/javascript/auth-getuser` | 2 | JWT required, cached vs network |
| 9 | `https://supabase.com/docs/reference/javascript/auth-onauthstatechange` | 7 | Events: INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED |
| 10 | `https://supabase.com/docs/reference/javascript/auth-refreshsession` | 2 | Force refresh before expiry |
| 11 | `https://supabase.com/docs/reference/javascript/auth-setsession` | 1 | Set session from custom tokens |
| 12 | `https://supabase.com/docs/reference/javascript/auth-updateuser` | 5 | Email, password, phone, metadata, reauthentication |
| 13 | `https://supabase.com/docs/reference/javascript/auth-getclaims` | 1 | Decode JWT without network call |
| 14 | `https://supabase.com/docs/reference/javascript/auth-signinanonymously` | 2 | Anonymous user, no credentials |
| 15 | `https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail` | 2 | Recovery email flow |
| 16 | `https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession` | 1 | PKCE callback exchange |
| 17 | `https://supabase.com/docs/reference/javascript/auth-resend` | 4 | Resend: signup, email_change, phone_change |
| 18 | `https://supabase.com/docs/reference/javascript/auth-reauthentication` | 1 | Nonce for sensitive operations |
| 19 | `https://supabase.com/docs/reference/javascript/auth-getuseridentities` | 1 | Linked OAuth identities |
| 20 | `https://supabase.com/docs/reference/javascript/auth-linkidentity` | 1 | Link OAuth identity to existing user |
| 21 | `https://supabase.com/docs/reference/javascript/auth-unlinkidentity` | 1 | Unlink identity |
| 22 | `https://supabase.com/docs/reference/javascript/auth-initialize` | — | Client init |
| 23 | `https://supabase.com/docs/reference/javascript/auth-startautorefresh` | 1 | Background token refresh |
| 24 | `https://supabase.com/docs/reference/javascript/auth-stopautorefresh` | 1 | Stop background refresh |

### OAuth Sign In (`supabase.auth.signInWithOAuth`)
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 25 | `https://supabase.com/docs/reference/javascript/auth-signinwithoauth` | 3 | Provider redirect, scopes, PKCE |
| 26 | `https://supabase.com/docs/reference/javascript/auth-signinwithidtoken` | 1 | Apple/Google ID token — **v2** (OIDC provider verification) |
| 27 | `https://supabase.com/docs/reference/javascript/auth-signinwithsso` | 2 | Enterprise SSO — **v2** |
| 28 | `https://supabase.com/docs/reference/javascript/auth-signinwithweb3` | 4 | Solana/Ethereum wallet — **v2** |

### Passkey (`supabase.auth.*`) — **SKIP v1**
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 29 | `https://supabase.com/docs/reference/javascript/auth-signinwithpasskey` | — | WebAuthn authentication — **SKIP v1** |
| 30 | `https://supabase.com/docs/reference/javascript/auth-registerpasskey` | — | WebAuthn registration — **SKIP v1** |

### Admin Methods (`supabase.auth.admin.*`) — all on same page
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 31 | `https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid` | 1 | `getUserById(uid)` — service_role only |
| 32 | `https://supabase.com/docs/reference/javascript/auth-admin-listusers` | 2 | `listUsers(params?)` — paginated |
| 33 | `https://supabase.com/docs/reference/javascript/auth-admin-createuser` | 3 | `createUser(attributes)` — email_confirm, metadata |
| 34 | `https://supabase.com/docs/reference/javascript/auth-admin-deleteuser` | 1 | `deleteUser(id, shouldSoftDelete)` |
| 35 | `https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid` | 8 | `updateUserById(uid, attributes)` — email, password, role, banned_until, metadata |
| 36 | `https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail` | 1 | `inviteUserByEmail(email, options)` |
| 37 | `https://supabase.com/docs/reference/javascript/auth-admin-generatelink` | 5 | `generateLink(params)` — signup, invite, magiclink, recovery, email_change |
| 38 | `https://supabase.com/docs/reference/javascript/auth-admin-signout` | — | `signOut(jwt, scope)` — admin sign out |

### Admin Passkey (`supabase.auth.admin.passkey.*`) — **SKIP v1**
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 39 | `https://supabase.com/docs/reference/javascript/auth-admin-listpasskeys` | — | `listPasskeys(params)` — **SKIP v1** |
| 40 | `https://supabase.com/docs/reference/javascript/auth-admin-deletepasskey` | — | `deletePasskey(params)` — **SKIP v1** |

### Admin MFA (`supabase.auth.admin.*`) — **SKIP v1**
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 41 | `https://supabase.com/docs/reference/javascript/auth-admin-deletefactor` | 1 | `deleteFactor(params)` — **SKIP v1** |
| 42 | `https://supabase.com/docs/reference/javascript/auth-admin-listfactors` | 1 | `listFactors(params)` — **SKIP v1** |

### Auth MFA (`supabase.auth.mfa.*`) — **SKIP v1**
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 43 | `https://supabase.com/docs/reference/javascript/auth-mfa-enroll` | — | TOTP enrollment — **SKIP v1** |
| 44 | `https://supabase.com/docs/reference/javascript/auth-mfa-challenge` | — | TOTP challenge — **SKIP v1** |
| 45 | `https://supabase.com/docs/reference/javascript/auth-mfa-verify` | — | TOTP verify — **SKIP v1** |
| 46 | `https://supabase.com/docs/reference/javascript/auth-mfa-unenroll` | — | Remove factor — **SKIP v1** |
| 47 | `https://supabase.com/docs/reference/javascript/auth-mfa-getaal` | — | Authentication assurance level — **SKIP v1** |
| 48 | `https://supabase.com/docs/reference/javascript/auth-mfa-listfactors` | — | List enrolled factors — **SKIP v1** |

### OAuth Server/Admin — **SKIP v1**
| # | Page | Tabs | Notes |
|---|------|------|-------|
| 49 | OAuth admin: `listClients`, `getClient`, `createClient`, `updateClient`, `deleteClient`, `regenerateClientSecret` | — | OAuth 2.1 consent screens, client management — **SKIP v1** |

**Total: 49 pages.** 24 P0/P1 in scope for v1. 25 skipped (MFA, passkey, OAuth server, admin OAuth).

**All OAuth Server and OAuth Admin methods are out of scope for v1** — they require OAuth 2.1 server enablement, a Supabase Platform feature not applicable to self-hosted/Teenybase.

---

## Configuration & Environment

### Required Env Vars

| Variable | Purpose | Example |
|---|---|---|
| `SUPAFLARE_JWT_SECRET` | HMAC-SHA256 signing key for JWTs | `"your-32-char-min-secret-key!"` |
| `SUPAFLARE_JWT_EXPIRY` | Access token lifetime in seconds | `3600` (default: 1h) |
| `SUPAFLARE_SITE_URL` | Site URL for redirect/callback | `"http://localhost:3000"` |
| `SUPAFLARE_ANON_KEY` | Public anon key (for client auth) | `"sb-anon-..."` |
| `SUPAFLARE_SERVICE_KEY` | Service role key (bypasses RLS) | `"sb-service-..."` |

### Configurable Behavior (via `DatabaseSettings` or env)

| Setting | Default | Effect |
|---|---|---|
| `auth.email.confirmRequired` | `true` | If true, signup returns `session: null` until email confirmed |
| `auth.email.autoConfirm` | `false` | If true, auto-confirm on signup (dev mode) |
| `auth.password.minLength` | `6` | Minimum password length |
| `auth.signup.enabled` | `true` | Allow new user registration |
| `auth.rateLimit.signup` | `3 per minute` | Max signups per IP per minute |
| `auth.rateLimit.login` | `10 per minute` | Max login attempts per IP per minute |
| `auth.rateLimit.otp` | `5 per minute` | Max OTP sends per email/phone per minute |
| `auth.rateLimit.lockoutDuration` | `300` seconds | Lockout duration after rate limit exceeded |

### Request Context

Auth middleware runs before each `/auth/v1/*` handler. Populates:
- `c.var.auth` — `SupabaseAuthContext` (role, uid, email, jwt payload, apikey)
- `service_role` detection → bypass RLS, enable admin routes

---

## Auth Routes: Request/Response Catalog

### Public Routes

#### `POST /auth/v1/signup`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "data": { "display_name": "Alice" },  // optional user_metadata
  "phone": "+1234567890"                // optional, alternative to email
}
```

**Response (email confirm enabled):** `200`
```json
{
  "id": "user-uuid",
  "aud": "authenticated",
  "role": "authenticated",
  "email": "user@example.com",
  "email_confirmed_at": null,
  "phone": null,
  "created_at": "2026-04-29T00:00:00Z",
  "user_metadata": { "display_name": "Alice" },
  "app_metadata": { "provider": "email", "providers": ["email"] }
}
```
- `session: null` when email confirmation required

**Response (email confirm disabled / auto-confirm):** `200`
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1714348800,
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4",
  "user": { /* user object */ }
}
```

**Errors:**
- `422` — `weak_password`, `user_already_exists`, `signup disabled`

---

#### `POST /auth/v1/token?grant_type=password`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```
-or-
```json
{
  "phone": "+1234567890",
  "password": "secure-password"
}
```

**Response:** `200`
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1714348800,
  "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4",
  "user": { /* user object */ }
}
```

**Errors:**
- `400` — `invalid_credentials` (wrong password or user not found)

---

#### `POST /auth/v1/token?grant_type=refresh_token`

**Request:**
```json
{ "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4" }
```

**Response:** `200` — same shape as password grant
**Errors:**
- `400` — `session_not_found` (revoked or invalid refresh token)

---

#### `POST /auth/v1/token?grant_type=pkce`

**Request:**
```json
{
  "auth_code": "code-from-redirect",
  "code_verifier": "original-pkce-verifier"
}
```

**Response:** `200` — same shape as password grant
**Errors:**
- `400` — `invalid_code`, `code_expired`, `code_verifier_mismatch`

---

#### `POST /auth/v1/otp`

**Request (email):**
```json
{
  "email": "user@example.com",
  "data": { "display_name": "Alice" },
  "create_user": true
}
```

**Request (phone):**
```json
{
  "phone": "+1234567890",
  "create_user": true
}
```

**Response:** `200`
```json
{
  "message_id": null,   // null since we don't send emails
  "user": null          // user may exist already
}
```
- Teenybase v1: OTP stored in D1. No actual email/SMS sent.
- Client must retrieve OTP from D1 for testing (or use auto-confirm mode).

**Errors:**
- `422` — `over_email_send_rate_limit`, `over_sms_send_rate_limit`

---

#### `POST /auth/v1/verify`

**Request:**
```json
{
  "token": "abc123",
  "token_hash": "sha256-hash-of-token",
  "type": "signup",   // signup, magiclink, recovery, invite, email_change, phone_change, sms
  "redirect_to": "http://localhost:3000/auth/callback"
}
```

**Response (with email confirm):** `200`
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "user": { "email_confirmed_at": "2026-04-29T00:00:00Z", /* ... */ }
}
```

**Errors:**
- `400` — `otp_expired`, `invalid_token`

---

#### `POST /auth/v1/logout`

**Headers:** `Authorization: Bearer <access_token>`

**Query params:** `scope` = `global` | `local` | `others`

**Response:** `204 No Content`

**Errors:**
- `401` — `invalid_token` (no valid JWT)

---

#### `GET /auth/v1/user`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200` — user object (same shape as signup response user field)

**Errors:**
- `401` — `invalid_token`

---

#### `PUT /auth/v1/user`

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "email": "new@example.com",
  "password": "new-password",
  "data": { "display_name": "New Name" }
}
```

**Response:** `200` — updated user object

**Errors:**
- `400` — `weak_password`, `user_already_exists` (email taken)
- `401` — `invalid_token`

---

#### `POST /auth/v1/reauthenticate`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200` — nonce for reauth confirmation

**Errors:**
- `401` — `invalid_token`

---

#### `POST /auth/v1/resend`

**Request:**
```json
{
  "type": "signup",     // signup, email_change, phone_change
  "email": "user@example.com"
}
```

**Response:** `200` — same shape as OTP

**Errors:**
- `422` — rate limit exceeded

---

#### `POST /auth/v1/recover`

**Request:**
```json
{
  "email": "user@example.com",
  "redirect_to": "http://localhost:3000/reset-password"
}
```

**Response:** `200` — `{}`
- Recovery token stored in D1. No email sent in v1.

**Errors:**
- `422` — rate limit exceeded

---

### Admin Routes (require `service_role` key or admin JWT)

#### `POST /auth/v1/admin/users`

**Request:**
```json
{
  "email": "admin-created@example.com",
  "password": "secure-password",
  "email_confirm": true,
  "user_metadata": { "role": "editor" },
  "app_metadata": { "admin": true }
}
```

**Response:** `200` — user object

---

#### `GET /auth/v1/admin/users`

**Query params:** `page`, `per_page`

**Response:** `200`
```json
{
  "users": [ /* user objects */ ],
  "total_count": 42
}
```

---

#### `GET /auth/v1/admin/users/{uid}`

**Response:** `200` — single user object
**Errors:**
- `404` — user not found

---

#### `PUT /auth/v1/admin/users/{uid}`

**Request:** subset of user fields (email, password, email_confirm, user_metadata, app_metadata, banned_until, role)

**Response:** `200` — updated user object

---

#### `DELETE /auth/v1/admin/users/{uid}`

**Query params:** `should_soft_delete` (default `false`)

**Response:** `200` — `{}`

---

#### `POST /auth/v1/admin/generate_link`

**Request:**
```json
{
  "type": "signup",      // signup, invite, magiclink, recovery, email_change
  "email": "user@example.com",
  "password": "secure-password",
  "data": { "display_name": "Alice" },
  "redirect_to": "http://localhost:3000/callback"
}
```

**Response:** `200`
```json
{
  "action_link": "http://localhost:8787/auth/v1/verify?token=...",
  "email_otp": "abc123",
  "hashed_token": "sha256-hash",
  "redirect_to": "http://localhost:3000/callback",
  "verification_type": "signup",
  "user": { /* user object */ }
}
```

---

### Settings Route

#### `GET /auth/v1/settings`

**Response:** `200`
```json
{
  "external": {},                    // OAuth providers (empty in v1)
  "disable_signup": false,
  "mailers": ["email"],
  "gotrue_version": "supaflare-v1"
}
```

---

## JWT / Token Handling

### Access Token Structure (JWT — HS256)

```json
{
  "aud": "authenticated",
  "exp": 1714348800,
  "iat": 1714345200,
  "sub": "user-uuid-123",
  "email": "user@example.com",
  "phone": "",
  "app_metadata": { "provider": "email", "providers": ["email"] },
  "user_metadata": { "display_name": "Alice" },
  "role": "authenticated"
}
```

**Claims:**
| Claim | Type | Source |
|---|---|---|
| `aud` | string | `"authenticated"` for logged-in, `"anon"` for anonymous |
| `exp` | number | `iat + JWT_EXPIRY` |
| `iat` | number | Token creation Unix timestamp |
| `sub` | string | User UUID |
| `email` | string | User email (empty string if none) |
| `phone` | string | User phone (empty string if none) |
| `role` | string | `"authenticated"` or `"anon"` |
| `app_metadata` | object | Provider info, admin flags |
| `user_metadata` | object | User-custom data from signup/update |

### Refresh Token

- Opaque string (random 64-byte hex).
- Stored in `auth_sessions` D1 table.
- **Single-use:** consumed on refresh. New refresh token issued with each refresh.
- Revoked on sign out.

### PKCE Flow

1. Client generates `code_verifier` (43–128 char random string).
2. Client derives `code_challenge = SHA256(code_verifier)` (base64url).
3. OAuth/OTP flow redirects with `code_challenge` and `code_challenge_method=S256`.
4. Server stores `code_challenge` in `auth_otps` row.
5. Callback includes `auth_code`.
6. Client sends `grant_type=pkce` with `auth_code` + `code_verifier`.
7. Server verifies `SHA256(code_verifier)` matches stored challenge.

### Key Types

| Token | Lifetime | Storage |
|---|---|---|
| Access token (JWT) | Configurable (default 1h) | Client memory |
| Refresh token | Until revoked/used once | D1 + client storage |
| Session | Tied to refresh token | Client storage |

### JWT Signing

- **Symmetric (HMAC-SHA256)** — v1 default. Secret from `SUPAFLARE_JWT_SECRET`.
- **Asymmetric (JWKS)** — v2. Enables client-side `getClaims()` without network call.
- Use `@tsndoo/hono-jwt` or `jose` library for JWT operations.

---

## Security & Rate Limiting

### Password Requirements
- Minimum length: 6 characters (configurable via `auth.password.minLength`)
- No complexity requirements in v1 (matches GoTrue default)

### Brute Force Protection
- Track failed login attempts per email/IP in D1 `auth_rate_limits` table.
- After 10 failed attempts: 5-minute lockout.
- Lockout resets on successful login or after duration.

### Rate Limiting (per IP)
| Action | Limit | Window |
|---|---|---|
| Signup | 3 | 60s |
| Login | 10 | 60s |
| OTP send | 5 | 60s |
| Password reset | 3 | 60s |
| Resend | 3 | 60s |

### Email Confirmation Flow (v1 — no actual sending)

```
POST /auth/v1/signup { email, password }
  → User created, email_confirmed_at = NULL
  → confirmation_token generated, stored in D1
  → Response: user object, session = null
  → (No email sent; token available via admin or auto-confirm mode)

POST /auth/v1/verify { token, type: "signup" }
  → Token validated, email_confirmed_at = NOW
  → Session created, JWT issued
  → Response: { access_token, refresh_token, user }
```

**Dev mode:** Set `auth.email.autoConfirm: true` → `email_confirmed_at` set immediately, session returned with signup response.

---

## D1 Schema for Auth

```sql
-- Users table (Teenybase native auth, extended with Supabase fields)
-- Columns:
--   id TEXT PRIMARY KEY (UUID text)
--   email TEXT UNIQUE
--   phone TEXT UNIQUE
--   encrypted_password TEXT (bcrypt hash)
--   email_confirmed_at TEXT (ISO 8601)
--   phone_confirmed_at TEXT (ISO 8601)
--   email_change TEXT (new email pending)
--   email_change_token_current TEXT
--   email_change_token_new TEXT
--   email_change_confirm_sent_at TEXT
--   recovery_token TEXT
--   recovery_sent_at TEXT
--   confirmation_token TEXT
--   confirmation_sent_at TEXT
--   raw_app_meta_data TEXT (JSON)
--   raw_user_meta_data TEXT (JSON)
--   is_super_admin INTEGER DEFAULT 0
--   role TEXT DEFAULT 'authenticated'
--   created_at TEXT DEFAULT CURRENT_TIMESTAMP
--   updated_at TEXT DEFAULT CURRENT_TIMESTAMP
--   last_sign_in_at TEXT
--   banned_until TEXT
--   deleted_at TEXT (soft delete)

-- Rate limiting
CREATE TABLE auth_rate_limits (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,     -- IP or email
  action TEXT NOT NULL,         -- login, signup, otp, reset
  attempt_count INTEGER DEFAULT 1,
  locked_until TEXT,            -- ISO 8601, NULL if not locked
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sessions / refresh tokens
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,          -- refresh token value (opaque hex)
  user_id TEXT NOT NULL,        -- FK to users
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT,              -- ISO 8601 (optional expiry)
  revoked INTEGER DEFAULT 0     -- 0 = active, 1 = revoked
);

-- One-time passwords
CREATE TABLE auth_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT,                 -- NULL for sign-up OTPs
  email TEXT,
  phone TEXT,
  token_hash TEXT,              -- SHA256 hash of OTP
  token_type TEXT,              -- signup, magiclink, recovery, invite, email_change, phone_change, sms
  code_challenge TEXT,          -- PKCE code_challenge (SHA256 of verifier)
  code_challenge_method TEXT,   -- S256
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER DEFAULT 0
);

-- Identities (OAuth, etc.)
CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,       -- google, github, apple, etc.
  provider_id TEXT NOT NULL,    -- provider's user ID
  identity_data TEXT,           -- JSON blob from provider
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_id)
);

-- Indexes
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_otps_token_hash ON auth_otps(token_hash);
CREATE INDEX idx_otps_email ON auth_otps(email);
CREATE INDEX idx_otps_code_challenge ON auth_otps(code_challenge);
CREATE INDEX idx_identities_user ON auth_identities(user_id);
CREATE INDEX idx_identities_provider ON auth_identities(provider, provider_id);
CREATE INDEX idx_rate_limits_identifier ON auth_rate_limits(identifier, action);
```

---

## Auth Events (onAuthStateChange)

| Event | When Emitted | Test Coverage |
|---|---|---|
| `INITIAL_SESSION` | Client constructed, session loaded from storage | Integration |
| `SIGNED_IN` | User session confirmed/re-established | Integration |
| `SIGNED_OUT` | User signs out / session expires | Integration |
| `TOKEN_REFRESHED` | New access/refresh tokens fetched | Integration |
| `USER_UPDATED` | updateUser() completes | Integration |
| `PASSWORD_RECOVERY` | Password recovery link clicked | Integration |

**Note:** `onAuthStateChange` is a client-side event system. Server generates correct HTTP responses; supabase-js client emits events based on those responses. No server-side event stream needed.

---

## Auth Error Codes (Supabase GoTrue)

| Code | Message | HTTP | When |
|---|---|---|---|
| `weak_password` | Password should be at least 6 characters | 422 | Password too short |
| `user_already_exists` | User already registered | 422 | Duplicate email/phone |
| `user_not_found` | Invalid login credentials | 400 | Email not found |
| `wrong_password` | Invalid login credentials | 400 | Wrong password |
| `invalid_credentials` | Invalid login credentials | 400 | Generic auth failure |
| `email_not_confirmed` | Email not confirmed | 401 | Accessing confirmed-only resource |
| `phone_not_confirmed` | Phone not confirmed | 401 | Phone auth unconfirmed |
| `otp_expired` | Token has expired or is invalid | 400 | OTP past expiry |
| `otp_disabled` | Phone provider not configured | 400 | SMS not set up |
| `session_not_found` | Session not found | 400 | Invalid/revoked refresh token |
| `invalid_token` | Invalid token | 401 | Malformed/expired JWT |
| `forbidden` | Forbidden | 403 | Insufficient permissions |
| `over_email_send_rate_limit` | Email rate limit exceeded | 422 | Too many emails |
| `over_sms_send_rate_limit` | SMS rate limit exceeded | 422 | Too many SMS |
| `signup_disabled` | Signups not allowed | 422 | `auth.signup.enabled = false` |
| `invalid_code` | Invalid PKCE code | 400 | auth_code not found |
| `code_expired` | PKCE code expired | 400 | auth_code past expiry |
| `code_verifier_mismatch` | Code verifier mismatch | 400 | SHA256 doesn't match challenge |
| `lockout_active` | Too many attempts, try again later | 429 | Rate limit lockout |

---

## SQLite Compatibility Matrix (Auth)

| GoTrue Feature | SQLite Support | Action |
|---|---|---|
| Email/password signup | ✅ | Direct |
| Email confirmation | ✅ | Token storage + expiry check |
| Password sign in | ✅ | bcrypt compare |
| OTP (email) | ✅ | Token storage + expiry |
| OTP (phone/SMS) | ⚠️ | D1 storage only, no SMS sending |
| Magic links | ✅ | Token-based redirect |
| PKCE exchange | ✅ | Store challenge, verify on callback |
| Session management | ✅ | Refresh tokens in D1 |
| JWT (HMAC-SHA256) | ✅ | `jose` or `@tsndoo/hono-jwt` |
| JWT (asymmetric/JWKS) | ⚠️ | **v2** |
| OAuth redirect flow | ❌ | **v2** (external provider orchestration) |
| SSO/SAML | ❌ | **Out of scope** |
| MFA (TOTP) | ❌ | **Out of scope** |
| Passkey/WebAuthn | ❌ | **Out of scope** |
| Web3 (Solana/Ethereum) | ❌ | **Out of scope** |
| Password recovery | ✅ | Token-based (no email sending) |
| Email change (secure) | ✅ | Dual-token flow |
| Phone change | ⚠️ | D1 only, no SMS |
| Admin user CRUD | ✅ | Direct D1 operations |
| Invite by email | ✅ | Token generation |
| generateLink | ✅ | Link token creation |
| Sign out scopes (global/local/others) | ✅ | Token revocation logic |
| Anonymous sign in | ✅ | Random UUID user |
| ID token sign in (OIDC) | ⚠️ | Provider verification — **v2** |
| Rate limiting | ✅ | D1 table + timestamp checks |
| Brute force lockout | ✅ | D1 table + attempt counting |

---

## Test Directory Structure (Auth additions)

```
tests/supabase-compat/
├── unit/
│   ├── jwt.test.ts                    ← JWT encode/decode, claims extraction, expiry
│   ├── passwordHasher.test.ts         ← bcrypt hash + compare
│   ├── emailValidator.test.ts         ← Email format validation
│   ├── sessionManager.test.ts         ← Session create/refresh/revoke logic
│   ├── pkce.test.ts                   ← PKCE challenge/verifier generation + validation
│   ├── rateLimiter.test.ts            ← Rate limit check + lockout logic
│   ├── authContext.test.ts            ← Header → SupabaseAuthContext
│   └── authErrorMapper.test.ts        ← Auth errors → Supabase codes
│
├── integration/
│   ├── fixtures/
│   │   ├── auth/
│   │   │   ├── responses/
│   │   │   │   ├── signup/
│   │   │   │   │   ├── email-confirm-required.json
│   │   │   │   │   ├── email-auto-confirm.json
│   │   │   │   │   └── phone-signup.json
│   │   │   │   ├── signin/
│   │   │   │   │   ├── password-success.json
│   │   │   │   │   └── wrong-password-error.json
│   │   │   │   ├── session/
│   │   │   │   │   ├── refresh-success.json
│   │   │   │   │   └── revoked-token-error.json
│   │   │   │   ├── otp/
│   │   │   │   │   ├── send-success.json
│   │   │   │   │   └── verify-success.json
│   │   │   │   ├── user/
│   │   │   │   │   ├── get-success.json
│   │   │   │   │   ├── update-email.json
│   │   │   │   │   └── update-password.json
│   │   │   │   └── admin/
│   │   │   │       ├── create-user.json
│   │   │   │       ├── list-users.json
│   │   │   │       └── generate-link.json
│   │   │   └── seeds/
│   │   │       └── auth-users.sql     ← Pre-seeded users with bcrypt passwords
│   ├── auth/
│   │   ├── signup.test.ts             ← Email+password, confirm behavior, phone
│   │   ├── signin.test.ts             ← Password, OTP, anonymous
│   │   ├── session.test.ts            ← getSession, refreshSession, setSession
│   │   ├── user.test.ts               ← getUser, updateUser, getUserIdentities
│   │   ├── signout.test.ts            ← global/local/others scope
│   │   ├── events.test.ts             ← onAuthStateChange event flow
│   │   ├── password-reset.test.ts     ← resetPasswordForEmail → verify flow
│   │   ├── otp.test.ts                ← verifyOtp types (email, sms, phone_change)
│   │   ├── pkce.test.ts               ← PKCE code challenge → exchange flow
│   │   ├── rate-limit.test.ts         ← Rate limit enforcement + lockout
│   │   └── admin/
│   │       ├── admin-users.test.ts    ← CRUD via admin API
│   │       └── admin-links.test.ts    ← generateLink variants
│   └── rls/
│       └── auth-functions.test.ts     ← auth.uid(), auth.role(), auth.email()
│
├── e2e/
│   ├── auth.test.ts                   ← Full auth lifecycle via supabase.auth.*
│   ├── admin-auth.test.ts             ← Admin operations via service_role
│   └── rls-auth.test.ts               ← RLS policies with auth.uid()
│
└── helpers/
    ├── authClient.ts                  ← createClient with auth config
    └── authSeed.ts                    ← Seed auth users in D1
```

---

## Test Pattern Examples

### Unit Test
```typescript
// Unit: JWT encoding/decoding
import { encodeJWT, decodeJWT } from '../../src/worker/supabase/auth/jwt';

describe('encodeJWT', () => {
  it('produces valid JWT with correct claims', () => {
    const payload = {
      sub: 'user-uuid-123',
      email: 'test@example.com',
      role: 'authenticated',
      aud: 'authenticated',
    };
    const token = encodeJWT(payload, SECRET);
    const decoded = decodeJWT(token, SECRET);
    expect(decoded.sub).toBe('user-uuid-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.aud).toBe('authenticated');
  });

  it('rejects expired tokens', () => {
    const payload = { sub: 'user-uuid', exp: Math.floor(Date.now() / 1000) - 10 };
    const token = encodeJWT(payload, SECRET);
    expect(() => decodeJWT(token, SECRET)).toThrow('Token expired');
  });

  it('rejects tokens signed with wrong secret', () => {
    const payload = { sub: 'user-uuid', role: 'authenticated' };
    const token = encodeJWT(payload, SECRET);
    expect(() => decodeJWT(token, 'wrong-secret')).toThrow('Invalid signature');
  });
});
```

### Integration Test
```typescript
// Integration: signUp via supabase.auth
import { describe, it, beforeAll } from 'vitest';
import { createSupaflareClient } from '../../helpers/supabaseClient';

describe('signUp(email, password)', () => {
  it('returns user with unconfirmed email when email confirm enabled', async () => {
    const { data, error } = await supabase.auth.signUp({
      email: 'newuser@example.com',
      password: 'secure-password-123',
    });

    expect(error).toBeNull();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('newuser@example.com');
    expect(data.user.email_confirmed_at).toBeNull();
    // When email confirm enabled: session is null
    expect(data.session).toBeNull();
  });

  it('returns user + session when email confirm disabled', async () => {
    // Config: email confirm = false
    const { data, error } = await supabase.auth.signUp({
      email: 'instant@example.com',
      password: 'secure-password-123',
    });

    expect(error).toBeNull();
    expect(data.user).toBeDefined();
    expect(data.session).toBeDefined();
    expect(data.session.access_token).toBeDefined();
    expect(data.session.refresh_token).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    const { error } = await supabase.auth.signUp({
      email: 'newuser@example.com',
      password: 'another-password',
    });
    expect(error).toBeDefined();
    expect(error.code).toBe('user_already_exists');
  });

  it('rejects weak password', async () => {
    const { error } = await supabase.auth.signUp({
      email: 'weak@example.com',
      password: 'short',
    });
    expect(error).toBeDefined();
    expect(error.code).toBe('weak_password');
  });
});
```

### E2E Test
```typescript
// E2E: full sign in → session → user flow
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:8787', ANON_KEY);

describe('E2E: Auth lifecycle', () => {
  it('signs up, signs in, gets user, signs out', async () => {
    // 1. Sign up
    const { data: signup } = await supabase.auth.signUp({
      email: 'e2e@test.com',
      password: 'test-password',
    });
    expect(signup.user).toBeDefined();

    // 2. Sign in
    const { data: signin } = await supabase.auth.signInWithPassword({
      email: 'e2e@test.com',
      password: 'test-password',
    });
    expect(signin.session.access_token).toBeDefined();

    // 3. Get user
    const { data: user } = await supabase.auth.getUser();
    expect(user.user.email).toBe('e2e@test.com');

    // 4. Sign out
    const { error } = await supabase.auth.signOut();
    expect(error).toBeNull();

    // 5. Verify signed out
    const { data: after } = await supabase.auth.getSession();
    expect(after.session).toBeNull();
  });

  it('refreshes session with valid refresh token', async () => {
    // Sign in first
    await supabase.auth.signInWithPassword({
      email: 'e2e@test.com',
      password: 'test-password',
    });

    const { data: before } = supabase.auth.getSession();
    const oldToken = before.session.access_token;

    // Force refresh
    const { data: refreshed } = await supabase.auth.refreshSession();
    expect(refreshed.session.access_token).toBeDefined();
    expect(refreshed.session.access_token).not.toBe(oldToken);
    // Old refresh token should be revoked
  });
});
```

---

## Implementation-Test Phase Mapping

Each implementation sub-phase ships with its tests. TDD flow:
1. Write unit test → fail → implement → pass
2. Write integration test → fail → implement handler → pass
3. Write e2e test → fail → wire together → pass

| Impl Phase | Tests |
|------------|-------|
| **2.1** Auth routing + JWT | Unit: `jwt.test.ts`, `authContext.test.ts` |
| **2.2** Signup + email confirm | Integration: `auth/signup.test.ts` |
| **2.3** Sign in (password) | Integration: `auth/signin.test.ts` |
| **2.4** Session management | Integration: `auth/session.test.ts` |
| **2.5** User operations | Integration: `auth/user.test.ts` |
| **2.6** OTP + magic links | Integration: `auth/otp.test.ts` |
| **2.7** PKCE exchange | Unit: `pkce.test.ts`. Integration: `auth/pkce.test.ts` |
| **2.8** Password reset | Integration: `auth/password-reset.test.ts` |
| **2.9** Sign out scopes | Integration: `auth/signout.test.ts` |
| **2.10** Rate limiting | Unit: `rateLimiter.test.ts`. Integration: `auth/rate-limit.test.ts` |
| **2.11** Auth events | Integration: `auth/events.test.ts` |
| **2.12** Admin user CRUD | Integration: `auth/admin/admin-users.test.ts` |
| **2.13** Admin links/generate | Integration: `auth/admin/admin-links.test.ts` |
| **2.14** RLS auth functions | Integration: `rls/auth-functions.test.ts` |
| **2.15** E2E auth lifecycle | E2E: `auth.test.ts`, `admin-auth.test.ts`, `rls-auth.test.ts` |

---

## Auth Fixture Extraction

Extract from Supabase docs via Chrome DevTools:

1. **Navigate** to each auth URL
2. **Discover** all h2 headings (each auth method)
3. **For each tab**: click it, wait for render
4. **Extract** example code (always visible or in tab)
5. **Extract** parameter info from headings/descriptions
6. **Extract** return type / response shape info
7. **Save** as structured JSON:
   ```json
   {
     "page": "auth-signup",
     "section": "Create a new user",
     "tab": "Sign up with an email and password",
     "code": "supabase.auth.signUp({ email: 'example@email.com', password: 'example-password' })",
     "params": { "email": "string", "password": "string", "options": { "data": "object", "phoneRedirectTo": "string" } },
     "returns": { "data": { "user": "User | null", "session": "Session | null" }, "error": "AuthError | null" }
   }
   ```

---

## Out of Scope (v1)

- **MFA/2FA** — TOTP enrollment, challenge/verify, AAL levels
- **Passkey/WebAuthn** — registration, authentication, management
- **OAuth sign in** — redirect flow, PKCE, provider tokens
- **SSO/SAML** — enterprise identity providers
- **Web3** — Solana/Ethereum wallet sign in
- **OAuth Server/Admin** — OAuth 2.1 consent screens, client management
- **Admin MFA** — deleteFactor, listFactors
- **Admin Passkey** — listPasskeys, deletePasskey
- **ID token sign in** — OIDC provider verification
- **Phone auth** — requires SMS provider (Twilio, etc.)
- **Real-time auth events** — WebSocket streaming
- **Edge Functions** — auth hooks

---

## Notes

- **JWT signing**: HMAC-SHA256 with secret from `SUPAFLARE_JWT_SECRET` env var. Simpler than asymmetric for v1.
- **Password hashing**: bcrypt (available in Cloudflare Workers via WebAssembly). Use `bcryptjs` pure-JS fallback if needed.
- **Email sending**: Teenybase doesn't send emails. v1 stores tokens in D1; actual email sending deferred to user's email service integration. Use `auth.email.autoConfirm: true` in tests.
- **Phone OTP**: D1 storage only. No SMS sending in v1.
- **OAuth**: Full OAuth flow requires external provider configuration. v1 stores identity data but doesn't implement redirect flow.
- **`autoRefreshToken`**: Client-side. Server responds correctly to refresh token requests.
- **`persistSession`**: Client-side storage. Server stateless regarding persistence.
- **Admin API**: Requires `service_role` key. Maps to Teenybase admin role or configured admin API key.
- **`onAuthStateChange`**: Client-side event system. Server generates correct HTTP responses; events emitted by supabase-js.
- **Existing Teenybase auth**: Teenybase already has `_auth_identities` table, `SecretResolver`, and basic auth context. GoTrue compat extends these with full user/session/token tables.
- **Forward compatibility**: All user IDs as UUID text. Timestamps ISO-8601. JWT standard claims. Migrate to hosted Supabase by changing client URL.

## Test Catalog

All AUTH tests are tracked in `scripts/test-catalog/test-catalog.db` (auto-extracted from Supabase docs).

**Check AUTH test status:**
```bash
cd scripts/test-catalog
node catalog.js status --category AUTH                        # all AUTH tests
node catalog.js status --category AUTH --subcategory signup   # signup tests only
node catalog.js status --category AUTH --subcategory admin    # admin tests only
```

**Record test results:**
```bash
# After validating against local Supabase
node catalog.js run --id 25 --target supabase --status pass
# After implementing in Supaflare
node catalog.js run --id 25 --target supaflare --status pass
```

**AUTH report:**
```bash
node catalog.js report --category AUTH
node catalog.js report --category AUTH --format markdown
```

**AUTH test counts:** 85 in_scope, 99 skip_v1 (MFA, passkey, OAuth server, OAuth admin)
