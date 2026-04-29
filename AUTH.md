# Phase 2: Supabase Auth (GoTrue) API Compatibility

## Goal

Implement Supabase Auth API endpoints (`/auth/v1/*`) so that `supabase.auth.signUp()`, `signInWithPassword()`, `signInWithOAuth()`, etc. work against the D1 backend. The auth system reuses Teenybase's existing JWT, password hashing, email, and OAuth infrastructure but presents a GoTrue-compatible HTTP surface.

## Supabase Auth API Surface

```
POST /auth/v1/signup              → email + password registration
POST /auth/v1/token               → login (grant_type: password, refresh_token, pkce)
POST /auth/v1/logout              → sign out
POST /auth/v1/recover             → forgot password (sends email)
POST /auth/v1/verify              → email/phone verification
POST /auth/v1/invite              → invite user (admin)
POST /auth/v1/admin/users         → CRUD users (service_role key)
POST /auth/v1/admin/users/{id}    → update/delete user
GET  /auth/v1/user                → get current user
PUT  /auth/v1/user                → update current user
GET  /auth/v1/sso                 → SSO providers
GET  /auth/v1/sso/domains         → SSO domains
POST /auth/v1/oauth/authorize     → start OAuth flow
POST /auth/v1/oauth/token         → exchange OAuth code
POST /auth/v1/reauthenticate      → require re-auth
GET  /auth/v1/settings            → auth server settings
```

## Tasks

### 2.1 Dedicated Auth Users Table
Create the internal schema for the GoTrue-compatible users table in D1:

```sql
CREATE TABLE supa_auth_users (
    id TEXT PRIMARY KEY,           -- UUID
    aud TEXT,                      -- audience
    role TEXT DEFAULT 'authenticated',
    email TEXT UNIQUE,
    encrypted_password TEXT,       -- bcrypt/argon2 hash
    email_confirmed_at DATETIME,
    invited_at DATETIME,
    confirmation_token TEXT,
    confirmation_sent_at DATETIME,
    recovery_token TEXT,
    recovery_sent_at DATETIME,
    email_change_token_new TEXT,
    email_change TEXT,
    email_change_sent_at DATETIME,
    last_sign_in_at DATETIME,
    raw_app_meta_data TEXT,        -- JSON
    raw_user_meta_data TEXT,       -- JSON
    is_super_admin BOOLEAN,
    created_at DATETIME,
    updated_at DATETIME,
    phone TEXT,
    phone_confirmed_at DATETIME,
    phone_change TEXT,
    phone_change_token TEXT,
    phone_change_sent_at DATETIME,
    email_change_token_current TEXT,
    email_change_confirm_status INTEGER,
    banned_until DATETIME,
    reauthentication_token TEXT,
    reauthentication_sent_at DATETIME,
    is_sso_user BOOLEAN DEFAULT FALSE,
    deleted_at DATETIME
);

CREATE TABLE supa_auth_sessions (
    id TEXT PRIMARY KEY,           -- UUID
    user_id TEXT REFERENCES supa_auth_users(id),
    not_after DATETIME,
    refreshed_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME
);

CREATE TABLE supa_auth_identities (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES supa_auth_users(id),
    provider_id TEXT,
    provider_name TEXT,            -- 'google', 'github', etc.
    identity_data TEXT,            -- JSON
    created_at DATETIME,
    last_sign_in_at DATETIME,
    updated_at DATETIME
);
```

**Output:** Migration to create tables. Can piggyback on Teenybase's existing migration system.
**Difficulty:** Easy
**Effort:** 1-2 days

**Gotchas:**
- Teenybase uses a per-table auth extension model. This new layer needs a standalone users table, separate from any Teenybase config tables.
- Phone/SMS auth is out of scope for v1 (columns present but unused).

### 2.2 Route Registration (`router.ts`)
Register all `/auth/v1/*` routes on the Hono app:

- `POST /auth/v1/signup`
- `POST /auth/v1/token`
- `POST /auth/v1/logout`
- `POST /auth/v1/recover`
- `POST /auth/v1/verify`
- `GET /auth/v1/user`
- `PUT /auth/v1/user`
- `POST /auth/v1/invite`
- `GET/POST /auth/v1/admin/users`
- `GET/PATCH/DELETE /auth/v1/admin/users/{id}`
- `POST /auth/v1/oauth/authorize`
- `GET /auth/v1/oauth/callback`
- `POST /auth/v1/reauthenticate`
- `GET /auth/v1/settings`

**Output:** Hono routes dispatching to individual handlers.
**Difficulty:** Easy
**Effort:** 1 day

### 2.3 JWT Builder (`jwtBuilder.ts`)
Generate Supabase-compatible JWTs with the correct claim structure:

```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "email": "user@example.com",
  "phone": "",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  },
  "user_metadata": {
    "name": "John",
    "avatar_url": "..."
  },
  "sub": "<user-uuid>",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Sub-tasks:**
- Map Teenybase's existing JWT helper to produce these claims
- `role` defaults to `authenticated` (or `anon` if not logged in)
- `sub` = user UUID
- `app_metadata.providers` array tracks all OAuth providers linked
- `user_metadata` = free-form user properties from signup/update
- Use HS256 algorithm (Supabase default)
- Support configurable JWT expiry (default: 3600s for access, 30 days for refresh)

**Output:** `buildSupabaseJWT(user, opts) → string`
**Difficulty:** Medium
**Effort:** 2-3 days

**Gotchas:**
- Teenybase may use different JWT claim names internally. Need a translation layer.
- Supabase JS client validates the JWT structure in `getUser()`. If claims are missing, it fails.
- Must use the same JWT secret as configured in the project settings.

### 2.4 Session Management
Track active sessions in D1 (`supa_auth_sessions` table):

- Create session on login/signup
- Track refresh token → session ID mapping
- Support session expiry and max refresh count
- Invalidate session on logout/password change

**Sub-tasks:**
- Generate refresh tokens (cryptographically secure, stored hashed)
- Map refresh token to session ID on `grant_type: refresh_token`
- Implement token rotation (new refresh token on each refresh)
- Delete session on logout

**Difficulty:** Medium
**Effort:** 2-3 days

**Gotchas:**
- Teenybase already has session tracking in its auth extension. Can reuse or adapt that logic.
- Supabase stores refresh tokens hashed (not plaintext). Must do the same for security.

### 2.5 Sign Up (`signup.ts`)
`POST /auth/v1/signup` with body: `{ email, password, data?: {...}, redirect_to?: string }`

**Sub-tasks:**
- Validate email format, check blocklist (reuse Teenybase logic)
- Hash password with bcrypt/argon2 (reuse Teenybase's `passwordProcessors`)
- Insert user into `supa_auth_users` table
- Generate confirmation token if email confirmation required
- Send confirmation email (reuse Teenybase email system)
- Return `{ user: {...}, session: { access_token, refresh_token, ... } }` or just `{ user }` if email confirmation needed
- Support `data` field for `user_metadata`

**Output:** GoTrue-compatible response.
**Difficulty:** Medium
**Effort:** 2-3 days

### 2.6 Token / Login (`token.ts`)
`POST /auth/v1/token` with various `grant_type` values:

#### `grant_type: password`
Body: `{ email, password }`
- Look up user by email
- Verify password hash
- Create session, return tokens

#### `grant_type: refresh_token`
Body: `{ refresh_token }`
- Look up session by refresh token
- Validate expiry and max refresh count
- Rotate refresh token
- Return new token pair

#### `grant_type: pkce` (authorization code exchange)
Body: `{ auth_code, code_verifier, redirect_to }`
- Exchange OAuth authorization code for tokens
- Validate PKCE code verifier against stored challenge
- Return tokens

**Sub-tasks:**
- Implement all three grant types
- Handle errors: wrong password, user not found, token expired
- Return proper GoTree error codes

**Output:** Unified token endpoint handler.
**Difficulty:** Medium
**Effort:** 3-4 days

### 2.7 PKCE Support (`pkce.ts`)
Implement PKCE (Proof Key for Code Exchange) flow:

- `code_challenge` = base64url(sha256(code_verifier))
- Store code challenge + auth code during OAuth authorize step
- Verify code_verifier during token exchange
- Support both `plain` and `S256` code challenge methods

**Difficulty:** Medium
**Effort:** 2-3 days

### 2.8 User Endpoints (`user.ts`)
`GET /auth/v1/user` — Get current authenticated user:
- Decode JWT from `Authorization: Bearer` header
- Look up user from D1
- Return `{ id, email, ...app_metadata, ...user_metadata, ... }`

`PUT /auth/v1/user` — Update current user:
- Accept `{ email, password, data, ... }`
- Handle email change (two-step flow with confirmation)
- Handle password change (requires current password via `X-GoTrue-User-Password` header or reauthentication)
- Update `user_metadata`
- Return updated user

**Difficulty:** Medium
**Effort:** 2-3 days

### 2.9 Password Recovery (`recover.ts`)
`POST /auth/v1/recover` with body: `{ email, redirect_to? }`

**Sub-tasks:**
- Look up user by email
- Generate recovery token
- Store recovery token + timestamp
- Send recovery email with token link
- Return 200 (even if email not found — security best practice)

**Difficulty:** Easy
**Effort:** 1 day

### 2.10 Email/Phone Verification (`verify.ts`)
`POST /auth/v1/verify` with body: `{ token, type: 'signup'|'recovery'|'email_change', redirect_to? }`

**Sub-tasks:**
- Validate token type
- For `signup`: confirm email, set `email_confirmed_at`
- For `recovery`: validate recovery token, log in user, return session
- For `email_change`: confirm new email address
- Return `{ user, session }` on success

**Difficulty:** Medium
**Effort:** 2-3 days

### 2.11 Logout (`logout`)
`POST /auth/v1/logout` (with `scope: global|local|others`)

- Invalidate current session
- `global`: all sessions for this user
- `local`: current session only (default)
- `others`: all sessions except current

**Difficulty:** Easy
**Effort:** 1 day

### 2.12 OAuth Integration
Reuse Teenybase's existing OAuth infrastructure (Google, GitHub, Discord, LinkedIn presets) but adapt the flow:

`POST /auth/v1/oauth/authorize` — Start OAuth flow:
- Build authorize URL with state + PKCE challenge
- Store PKCE code verifier in cookie/KV
- Redirect user to provider

`GET /auth/v1/oauth/callback` — Handle OAuth callback:
- Exchange authorization code for access token
- Fetch user info from provider
- Look up or create user + identity record
- Create session, set auth cookie
- Redirect to `redirect_to` URL with `#access_token=...&refresh_token=...` (implicit flow) or code (PKCE flow)

**Sub-tasks:**
- Adapt Teenybase's existing OAuth handlers (`TableAuthExtension`) to work with the standalone auth table
- Support implicit flow (hash fragment) and PKCE flow
- Link OAuth identities to existing email users
- Handle provider-specific quirks (GitHub email list, Google One Tap)

**Difficulty:** Medium-Hard
**Effort:** 1 week

**Gotchas:**
- Teenybase's OAuth is tied to a specific table extension. Need to decouple it.
- Supabase supports 20+ OAuth providers. Start with Google, GitHub, Discord (TeenYbase already supports these).
- Provider-specific user info mappings differ (email field location, avatar field, etc.)

### 2.13 Invite (`invite.ts`)
`POST /auth/v1/invite` — Admin-only endpoint:

- Create user with `invited_at` set
- Generate invite token
- Send invite email
- User claims invite via `/verify?type=signup`

**Difficulty:** Easy
**Effort:** 1 day

### 2.14 Admin API (service_role)
Endpoints that require a service role key (bypass RLS):

- `GET /auth/v1/admin/users` — List all users (pagination)
- `POST /auth/v1/admin/users` — Create user
- `GET /auth/v1/admin/users/{id}` — Get user by ID
- `PUT /auth/v1/admin/users/{id}` — Update user
- `DELETE /auth/v1/admin/users/{id}` — Delete user

**Sub-tasks:**
- Implement service role key validation (separate from user JWT)
- Map CRUD operations to D1 queries
- Support pagination (`page`, `per_page`)

**Difficulty:** Easy-Medium
**Effort:** 2-3 days

### 2.15 Settings Endpoint
`GET /auth/v1/settings` — Return auth server configuration:

```json
{
  "external": {
    "google": true,
    "github": true,
    "discord": true
  },
  "disable_signup": false,
  "mailer_autoconfirm": false,
  "phone_autoconfirm": false,
  "sms_provider": "twilio"
}
```

**Difficulty:** Easy
**Effort:** 1 day

### 2.16 Auth Cookie Support
When `authCookie` is configured:
- Set `Set-Cookie` header with JWT on login/signup/OAuth callback
- Read cookie as fallback when `Authorization` header absent
- Delete cookie on logout

**Difficulty:** Easy
**Effort:** 1 day

## Response Format

All auth responses follow GoTree format:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "abc123...",
  "user": {
    "id": "uuid",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "user@example.com",
    "email_confirmed_at": "2025-01-01T00:00:00.000Z",
    "phone": "",
    "confirmation_sent_at": null,
    "app_metadata": { "provider": "email", "providers": ["email"] },
    "user_metadata": { "name": "John" },
    "identities": [...],
    "created_at": "2025-01-01T00:00:00.000Z",
    "updated_at": "2025-01-01T00:00:00.000Z"
  }
}
```

## Error Format

```json
{
  "code": 400,
  "msg": "Invalid login credentials"
}
```

Or specific error codes:
- `400` — Invalid input, validation errors
- `401` — Invalid credentials, expired token
- `403` — Forbidden (e.g., signup disabled)
- `404` — User not found
- `422` — Unprocessable (e.g., email already registered)
- `429` — Rate limited (if implemented)

## Roles & JWT Injection: How Auth Feeds Into RLS

This section details how the Auth layer produces the context that the Data layer's RLS policies consume.

### Role Lifecycle

Supabase has a three-role system encoded in the JWT `role` claim:

| Role | Source | RLS effect |
|---|---|---|
| `anon` | No token, or token with `role: "anon"` | Policies matching `anon` role apply. Default restrictive. |
| `authenticated` | User JWT with `role: "authenticated"` | Policies matching `authenticated` role apply. |
| `service_role` | Service role key (separate secret) | Bypasses ALL RLS. Full access. |

**JWT production:**
- Login/signup → JWT with `role: "authenticated"`, `sub: <user-uuid>`, `email: <email>`
- No auth → anon role (either no JWT or anon JWT with `role: "anon"`)
- Service role key → passed via `apikey` header matching `SUPABASE_SERVICE_ROLE_KEY` env var

**Middleware flow per request:**
```
Request arrives
  → Check apikey header == service_role_key? → role = 'service_role', admin = true
  → Check Authorization: Bearer <token>
    → Valid user JWT → decode claims → role = 'authenticated', uid = sub
    → Valid anon JWT → role = 'anon', uid = null
    → No token → role = 'anon', uid = null
  → Build AuthContext → inject into request context
  → RLS engine reads AuthContext → compiles WHERE clauses
```

### AuthContext → Policy Expression Injection

The `AuthContext` object bridges Auth and Data:

```typescript
interface AuthContext {
  uid: string | null;       // JWT.sub — the user's UUID
  role: string;             // JWT.role — 'anon' | 'authenticated' | 'service_role'
  email: string | null;     // JWT.email
  jwt: Record<string, any>; // full decoded JWT payload
  admin: boolean;           // true if service_role
}
```

This context is:
1. **Built** by the Auth middleware on each request (decode JWT, validate, extract claims)
2. **Injected** into jsep globals so policy expressions can reference `auth.uid()`, `auth.role()`, etc.
3. **Consumed** by the RLS compilation engine to resolve function calls to concrete values

**Mapping to Supabase SQL functions:**

```sql
-- Supabase policy expression:
USING (auth.uid() = author_id)

-- At query time, our engine resolves:
-- auth.uid() → current AuthContext.uid → parameterized as ? with value 'user-uuid'
-- Final SQL: WHERE (? = author_id)  [bound with user's UUID]
```

This is essentially **parameter injection**: the policy expression is a template that gets the auth context values plugged in before execution.

### JWT Claim Structure (Supabase-Compatible)

Every user JWT must contain these claims for RLS to work:

```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "sub": "<user-uuid>",
  "email": "user@example.com",
  "phone": "",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  },
  "user_metadata": {
    "name": "John Doe"
  },
  "iat": 1700000000,
  "exp": 1700003600
}
```

Critical claims for RLS:
- `role` → determines which policies apply
- `sub` → used by `auth.uid()`
- `email` → used by `auth.email()`
- Full payload → used by `auth.jwt()`

**Anon JWT** (optional, for consistency with Supabase):
```json
{
  "aud": "anon",
  "role": "anon",
  "sub": null,
  "iat": 1700000000,
  "exp": 1700003600
}
```

### Service Role Key

A separate secret (not a JWT) that grants bypass:
- Set as `SUPABASE_SERVICE_ROLE_KEY` environment variable
- Passed via `apikey` header: `apikey: <service-role-key>`
- When matched, sets `AuthContext = { role: 'service_role', admin: true }`
- RLS engine detects `service_role` and skips all policy compilation

**Security note**: The service role key must NEVER be exposed to the frontend. It's for server-side use only (admin APIs, migrations, background jobs).

## Testing

- Unit tests for JWT builder, PKCE, password hashing, role extraction
- Integration tests using `@supabase/supabase-js`:
  ```js
  const { data, error } = await supabase.auth.signUp({ email, password })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  const { data, error } = await supabase.auth.getUser()
  const { error } = await supabase.auth.signOut()
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
  ```
- RLS integration tests:
  ```js
  // Verify anon user cannot see private data
  const { data: publicOnly } = await supabase.from('posts').select()
  // Verify authenticated user sees own data
  const { data: ownPosts } = await supabase.from('posts').select().eq('author_id', user.id)
  // Verify service_role bypasses RLS
  const adminClient = createClient(url, serviceRoleKey)
  const { data: allPosts } = await adminClient.from('posts').select()
  ```

## Phase 2 Dependencies

- Phase 1 (optional — auth can be built in parallel)
- Teenybase core: JWT helper, password processors, email system, OAuth presets
- D1: user/sessions/identities tables

## Phase 2 Deliverables

1. All major `/auth/v1/*` endpoints working
2. GoTree-compatible JWT format
3. Session management with refresh tokens
4. PKCE OAuth flow working
5. Email confirmation + password reset flows
6. Admin API for user management
7. Integration test suite passing
