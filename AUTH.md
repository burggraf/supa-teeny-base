# AUTH.md: Test Suite Plan for Supabase Auth API Compatibility

## Goal

Verify GoTrue-compatible Auth layer produces responses matching real Supabase. Every feature tested at 3 levels:
- **Unit** — pure functions (JWT encoding/decoding, password hashing, email validation), no D1
- **Integration** — real D1 via `@cloudflare/vitest-pool-workers`, supabase-js client against test Hono app
- **E2E** — `wrangler dev` live server + `@supabase/supabase-js` client in Node

Each test uses:
- **supabase-js call** — exact code from Supabase docs
- **expected response shape** — `{ data: { user, session }, error }` structure from Supabase docs

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

## URLs to Process (Catalog)

### Auth Client Methods (`supabase.auth.*`) — 30 pages

| # | Method | URL suffix | Tab Count | Priority |
|---|--------|-----------|-----------|----------|
| 1 | Overview | `/auth-api` | 2 tabs | **P0** |
| 2 | `signUp(credentials)` | `/auth-signup` | 5 tabs | **P0** |
| 3 | `onAuthStateChange(callback)` | `/auth-onauthstatechange` | 7 tabs | **P0** |
| 4 | `signInAnonymously(credentials?)` | `/auth-signinanonymously` | 2 tabs | P1 |
| 5 | `signInWithPassword(credentials)` | `/auth-signinwithpassword` | 2 tabs | **P0** |
| 6 | `signInWithIdToken(credentials)` | `/auth-signinwithidtoken` | 1 tab | P2 |
| 7 | `signInWithOtp(credentials)` | `/auth-signinwithotp` | 3 tabs | **P0** |
| 8 | `signInWithOAuth(credentials)` | `/auth-signinwithoauth` | 3 tabs | P1 |
| 9 | `signInWithSSO(params)` | `/auth-signinwithsso` | 2 tabs | P2 |
| 10 | `signInWithWeb3(credentials)` | `/auth-signinwithweb3` | 4 tabs | P2 |
| 11 | `signInWithPasskey(credentials?)` | `/auth-signinwithpasskey` | — | **SKIP v1** (passkey) |
| 12 | `registerPasskey(credentials?)` | `/auth-registerpasskey` | — | **SKIP v1** (passkey) |
| 13 | `getClaims(jwt?, options)` | `/auth-getclaims` | 1 tab | **P0** |
| 14 | `signOut(options)` | `/auth-signout` | 3 tabs | **P0** |
| 15 | `resetPasswordForEmail(email, options)` | `/auth-resetpasswordforemail` | 2 tabs | P1 |
| 16 | `verifyOtp(params)` | `/auth-verifyotp` | 3 tabs | **P0** |
| 17 | `getSession()` | `/auth-getsession` | 1 tab | **P0** |
| 18 | `refreshSession(currentSession?)` | `/auth-refreshsession` | 2 tabs | P1 |
| 19 | `getUser(jwt?)` | `/auth-getuser` | 2 tabs | **P0** |
| 20 | `updateUser(attributes, options)` | `/auth-updateuser` | 5 tabs | P1 |
| 21 | `getUserIdentities()` | `/auth-getuseridentities` | 1 tab | P2 |
| 22 | `linkIdentity(credentials)` | `/auth-linkidentity` | 1 tab | P2 |
| 23 | `unlinkIdentity(identity)` | `/auth-unlinkidentity` | 1 tab | P2 |
| 24 | `reauthenticate()` | `/auth-reauthentication` | 1 tab | P2 |
| 25 | `resend(credentials)` | `/auth-resend` | 4 tabs | P2 |
| 26 | `setSession(currentSession)` | `/auth-setsession` | 1 tab | P1 |
| 27 | `exchangeCodeForSession(authCode)` | `/auth-exchangecodeforsession` | 1 tab | P1 |
| 28 | `startAutoRefresh()` | `/auth-startautorefresh` | 1 tab | P2 |
| 29 | `stopAutoRefresh()` | `/auth-stopautorefresh` | 1 tab | P2 |
| 30 | `initialize()` | `/auth-initialize` | — | P2 |

### Skipped Sections (v1)
- **Auth MFA** (`supabase.auth.mfa.*`) — enroll, challenge, verify, unenroll, getAAL, listFactors
- **Auth Passkey** (`supabase.auth.passkey.*`) — list, update, delete, registration, authentication
- **OAuth Server** — getAuthorizationDetails, approve/deny, listGrants, revokeGrant

### Auth Admin Methods (`supabase.auth.admin.*`) — 8 pages

| # | Method | URL suffix | Tab Count | Priority |
|---|--------|-----------|-----------|----------|
| 31 | `getUserById(uid)` | (same page) | 1 tab | **P0** |
| 32 | `listUsers(params?)` | (same page) | 2 tabs | P1 |
| 33 | `createUser(attributes)` | (same page) | 3 tabs | **P0** |
| 34 | `deleteUser(id, shouldSoftDelete)` | (same page) | 1 tab | P1 |
| 35 | `inviteUserByEmail(email, options)` | (same page) | 1 tab | P2 |
| 36 | `generateLink(params)` | (same page) | 5 tabs | P1 |
| 37 | `updateUserById(uid, attributes)` | (same page) | 8 tabs | P1 |
| 38 | `signOut(jwt, scope)` | (same page) | — | P2 |
| 39 | `deleteFactor(params)` (admin MFA) | (same page) | 1 tab | **SKIP v1** |
| 40 | `listFactors(params)` (admin MFA) | (same page) | 1 tab | **SKIP v1** |

### Passkey Admin Methods (`supabase.auth.admin.passkey.*`) — 2 pages
| # | Method | Tab Count | Priority |
|---|--------|-----------|----------|
| 41 | `listPasskeys(params)` | — | **SKIP v1** |
| 42 | `deletePasskey(params)` | — | **SKIP v1** |

### OAuth Admin Methods (`supabase.auth.admin.oauth.*`) — 6 pages
| # | Method | Tab Count | Priority |
|---|--------|-----------|----------|
| 43 | `listClients(params?)` | — | **SKIP v1** |
| 44 | `getClient(clientId)` | — | **SKIP v1** |
| 45 | `createClient(params)` | — | **SKIP v1** |
| 46 | `updateClient(clientId, params)` | — | **SKIP v1** |
| 47 | `deleteClient(clientId)` | — | **SKIP v1** |
| 48 | `regenerateClientSecret(clientId)` | — | **SKIP v1** |

**All OAuth Server and OAuth Admin methods are out of scope for v1** — they require OAuth 2.1 server enablement, which is a Supabase Platform feature not applicable to self-hosted/Teeneybase.

## Auth Routes to Implement

| GoTrue Route | Teenybase Mapping | Notes |
|---|---|---|
| `POST /auth/v1/signup` | GoTrue signup | Email+password, phone+password |
| `POST /auth/v1/token?grant_type=password` | GoTrue token | Password signin |
| `POST /auth/v1/token?grant_type=refresh_token` | GoToken refresh | Session refresh |
| `POST /auth/v1/otp` | OTP signin | Email/phone magic link/OTP |
| `POST /auth/v1/verify` | OTP verify | Verify OTP/token hash |
| `POST /auth/v1/logout` | Sign out | global/local/others scope |
| `GET /auth/v1/user` | Get current user | JWT auth required |
| `PUT /auth/v1/user` | Update user | JWT auth required |
| `POST /auth/v1/reauthenticate` | Reauth nonce | Password reauth |
| `POST /auth/v1/resend` | Resend OTP | Signup/email_change/phone_change |
| `POST /auth/v1/invite` | Admin invite | service_role only |
| `POST /auth/v1/admin/users` | Admin create | service_role only |
| `GET /auth/v1/admin/users` | Admin list | service_role, paginated |
| `GET /auth/v1/admin/users/{uid}` | Admin get by ID | service_role |
| `PUT /auth/v1/admin/users/{uid}` | Admin update | service_role |
| `DELETE /auth/v1/admin/users/{uid}` | Admin delete | service_role |
| `POST /auth/v1/admin/generate_link` | Admin generate link | service_role |
| `GET /auth/v1/user/identities` | Get identities | JWT auth required |
| `POST /auth/v1/logout` (admin) | Admin sign out | service_role + JWT |
| `GET /auth/v1/settings` | Project settings | Auth config |

## JWT / Token Handling

### Token Structure
```
Access Token (JWT):
{
  "aud": "authenticated",
  "exp": <timestamp>,
  "sub": "<user-uuid>",
  "email": "user@example.com",
  "phone": "",
  "app_metadata": { "provider": "email", "providers": ["email"] },
  "user_metadata": { ... },
  "role": "authenticated"
}

Refresh Token: opaque string, stored in D1
```

### Key Types
| Token | Lifetime | Storage |
|---|---|---|
| Access token (JWT) | Configurable (default 1h) | Client memory |
| Refresh token | Until revoked/used once | D1 + client storage |
| Session | Tied to refresh token | Client storage |

### JWT Signing
- **Symmetric (HMAC)** — default, simpler, server-only verification
- **Asymmetric (JWKS)** — optional, enables client-side `getClaims()` without network call
- Teenybase v1: **HMAC only** (simpler, D1-compatible)
- Store signing secret in D1 or Worker env var

## Test Directory Structure (Auth additions)

```
tests/supabase-compat/
├── unit/
│   ├── jwt.test.ts                    ← JWT encode/decode, claims extraction
│   ├── passwordHasher.test.ts         ← bcrypt/argon2 hashing
│   ├── emailValidator.test.ts         ← Email format validation
│   ├── sessionManager.test.ts         ← Session creation/refresh logic
│   ├── authContext.test.ts            ← Header → SupabaseAuthContext
│   └── authErrorMapper.test.ts        ← Auth errors → Supabase codes
│
├── integration/
│   ├── fixtures/
│   │   └── auth/
│   │       ├── responses/
│   │       │   ├── signup/
│   │       │   ├── signin/
│   │       │   ├── otp/
│   │       │   └── user/
│   │       └── seeds/
│   │           └── auth-users.sql     ← Pre-seeded users in auth.users
│   ├── auth/
│   │   ├── signup.test.ts             ← Email+password, confirm behavior
│   │   ├── signin.test.ts             ← Password, OTP verification
│   │   ├── session.test.ts            ← getSession, refreshSession, setSession
│   │   ├── user.test.ts               ← getUser, updateUser, getUserIdentities
│   │   ├── signout.test.ts            ← global/local/others scope
│   │   ├── events.test.ts             ← onAuthStateChange events
│   │   ├── password-reset.test.ts     ← resetPasswordForEmail flow
│   │   ├── otp.test.ts                ← verifyOtp types (email, sms, phone_change)
│   │   └── admin/
│   │       ├── admin-users.test.ts    ← CRUD via admin API
│   │       └── admin-links.test.ts    ← generateLink variants
│   └── rls/
│       └── auth-functions.test.ts     ← auth.uid(), auth.role(), auth.email()
│
├── e2e/
│   ├── auth.test.ts                   ← Full auth flows via supabase.auth.*
│   └── admin-auth.test.ts             ← Admin operations via service_role
│
└── helpers/
    ├── authClient.ts                  ← createClient with auth config
    └── authSeed.ts                    ← Seed auth users in D1
```

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
    };
    const token = encodeJWT(payload, SECRET);
    const decoded = decodeJWT(token, SECRET);
    expect(decoded.sub).toBe('user-uuid-123');
    expect(decoded.email).toBe('test@example.com');
  });

  it('rejects expired tokens', () => {
    const payload = { sub: 'user-uuid', exp: Date.now() / 1000 - 10 };
    const token = encodeJWT(payload, SECRET);
    expect(() => decodeJWT(token, SECRET)).toThrow('Token expired');
  });
});
```

### Integration Test
```typescript
// Integration: signUp via supabase.auth
import { describe, it, beforeAll } from 'vitest';
import { createSupaTeenyClient } from '../../helpers/supabaseClient';

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
});
```

## Auth Events (onAuthStateChange)

| Event | When Emitted | Test Coverage |
|---|---|---|
| `INITIAL_SESSION` | Client constructed, session loaded from storage | Integration |
| `SIGNED_IN` | User session confirmed/re-established | Integration |
| `SIGNED_OUT` | User signs out / session expires | Integration |
| `TOKEN_REFRESHED` | New access/refresh tokens fetched | Integration |
| `USER_UPDATED` | updateUser() completes | Integration |
| `PASSWORD_RECOVERY` | Password recovery link clicked | Integration |

## D1 Schema for Auth

```sql
-- Teenybase already has an auth system. We map GoTrue concepts to it.

-- Users table (Teenybase native, extended with Supabase fields)
-- auth.users columns:
--   id UUID PRIMARY KEY
--   email TEXT UNIQUE
--   phone TEXT UNIQUE
--   encrypted_password TEXT (bcrypt hash)
--   email_confirmed_at TIMESTAMPTZ
--   phone_confirmed_at TIMESTAMPTZ
--   email_change TEXT (new email pending)
--   email_change_token_current TEXT
--   email_change_token_new TEXT
--   email_change_confirm_sent_at TIMESTAMPTZ
--   recovery_token TEXT
--   recovery_sent_at TIMESTAMPTZ
--   confirmation_token TEXT
--   confirmation_sent_at TIMESTAMPTZ
--   raw_app_meta_data JSON
--   raw_user_meta_data JSON
--   is_super_admin BOOLEAN
--   role TEXT (default: 'authenticated')
--   created_at TIMESTAMPTZ
--   updated_at TIMESTAMPTZ
--   last_sign_in_at TIMESTAMPTZ
--   banned_until TIMESTAMPTZ
--   deleted_at TIMESTAMPTZ (soft delete)

-- Sessions / refresh tokens
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,          -- refresh token value
  user_id TEXT NOT NULL,        -- FK to auth.users
  created_at TEXT NOT NULL,     -- ISO 8601
  updated_at TEXT NOT NULL,     -- ISO 8601
  expires_at TEXT,              -- ISO 8601 (optional expiry)
  revoked BOOLEAN DEFAULT 0     -- 0 = active, 1 = revoked
);

-- One-time passwords
CREATE TABLE auth_otps (
  id TEXT PRIMARY KEY,
  user_id TEXT,                 -- NULL for sign-up OTPs
  email TEXT,
  phone TEXT,
  token_hash TEXT,              -- SHA256 hash of OTP
  token_type TEXT,              -- signup, magiclink, recovery, invite, email_change, phone_change, sms
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed BOOLEAN DEFAULT 0
);

-- Identities (OAuth, etc.)
CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,       -- google, github, apple, etc.
  provider_id TEXT NOT NULL,    -- provider's user ID
  identity_data JSON,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_id)
);

-- Indexes
CREATE INDEX idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_otps_token_hash ON auth_otps(token_hash);
CREATE INDEX idx_otps_email ON auth_otps(email);
CREATE INDEX idx_identities_user ON auth_identities(user_id);
CREATE INDEX idx_identities_provider ON auth_identities(provider, provider_id);
```

## Auth Error Codes (Supabase GoTrue)

| Code | Message | When |
|---|---|---|
| `weak_password` | Password should be at least 6 characters | Password too short |
| `user_already_exists` | User already registered | Duplicate email/phone |
| `user_not_found` | Invalid login credentials | Email not found |
| `wrong_password` | Invalid login credentials | Wrong password |
| `invalid_credentials` | Invalid login credentials | Generic auth failure |
| `email_not_confirmed` | Email not confirmed | Accessing confirmed-only resource |
| `phone_not_confirmed` | Phone not confirmed | Phone auth unconfirmed |
| `otp_expired` | Token has expired or is invalid | OTP past expiry |
| `otp_disabled` | Phone provider not configured | SMS not set up |
| `session_not_found` | Session not found | Invalid refresh token |
| `invalid_token` | Invalid token | Malformed/expired JWT |
| `forbidden` | Forbidden | Insufficient permissions |
| `over_email_send_rate_limit` | Email rate limit exceeded | Too many emails |
| `over_sms_send_rate_limit` | SMS rate limit exceeded | Too many SMS |

## SQLite Compatibility Matrix (Auth)

| GoTrue Feature | SQLite Support | Action |
|---|---|---|
| Email/password signup | ✅ | Direct |
| Email confirmation | ✅ | Token storage + expiry check |
| Password sign in | ✅ | bcrypt compare |
| OTP (email/phone) | ✅ | Token storage + expiry |
| Magic links | ✅ | Token-based redirect |
| Session management | ✅ | Refresh tokens in D1 |
| JWT (HMAC) | ✅ | @tsndoo/hono-jwt or jose |
| JWT (asymmetric/JWKS) | ⚠️ | **v2** (nice-to-have) |
| OAuth sign in (redirect) | ❌ | **v2** (external provider orchestration) |
| SSO/SAML | ❌ | **Out of scope** |
| MFA (TOTP) | ❌ | **Out of scope** |
| Passkey/WebAuthn | ❌ | **Out of scope** |
| Web3 (Solana/Ethereum) | ❌ | **Out of scope** |
| Password recovery | ✅ | Token-based email flow |
| Email change (secure) | ✅ | Dual-token flow |
| Phone change | ⚠️ | Requires SMS provider |
| Admin user CRUD | ✅ | Direct D1 operations |
| Invite by email | ✅ | Token generation |
| generateLink | ✅ | Link token creation |
| Sign out scopes | ✅ | Token revocation logic |
| Anonymous sign in | ✅ | Random UUID user |
| ID token sign in | ⚠️ | OIDC provider verification — **v2** |

## Implementation-Test Phase Mapping

| Impl Phase | Tests |
|------------|-------|
| **2.1** Auth routing + JWT | Unit: `jwt.test.ts`, `authContext.test.ts` |
| **2.2** Signup + email confirm | Integration: `auth/signup.test.ts` |
| **2.3** Sign in (password) | Integration: `auth/signin.test.ts` |
| **2.4** Session management | Integration: `auth/session.test.ts` |
| **2.5** User operations | Integration: `auth/user.test.ts` |
| **2.6** OTP + magic links | Integration: `auth/otp.test.ts` |
| **2.7** Password reset | Integration: `auth/password-reset.test.ts` |
| **2.8** Sign out scopes | Integration: `auth/signout.test.ts` |
| **2.9** Auth events | Integration: `auth/events.test.ts` |
| **2.10** Admin user CRUD | Integration: `auth/admin/admin-users.test.ts` |
| **2.11** Admin links/generate | Integration: `auth/admin/admin-links.test.ts` |
| **2.12** RLS auth functions | Integration: `rls/auth-functions.test.ts` |
| **2.13** E2E auth lifecycle | E2E: `auth.test.ts`, `admin-auth.test.ts` |

## Auth Fixture Extraction

Extract from Supabase docs via Chrome DevTools:

1. **Navigate** to each auth URL
2. **Discover** all h2 headings (each auth method)
3. **For each tab**: click it, wait for render
4. **Extract** example code (always visible or in tab)
5. **Extract** parameter info from headings/descriptions
6. **Save** as structured JSON:
   ```json
   {
     "page": "auth-signup",
     "section": "Create a new user",
     "tab": "Sign up with an email and password",
     "code": "supabase.auth.signUp({ email: 'example@email.com', password: 'example-password' })",
     "params": { "email": "string", "password": "string" },
     "returns": { "data": { "user": "User | null", "session": "Session | null" }, "error": "AuthError | null" }
   }
   ```

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

## Notes

- **JWT signing**: Use HMAC-SHA256 with a secret stored in Worker env. Simpler than asymmetric for v1.
- **Password hashing**: Use bcrypt (available in Cloudflare Workers via WebAssembly or use Worker-native crypto).
- **Email sending**: Teenybase doesn't send emails. v1 returns success with token; actual email sending is deferred to user's email service integration.
- **Phone OTP**: Requires external SMS provider. v1 stores OTP in D1 but cannot send SMS.
- **OAuth**: Full OAuth flow requires external provider configuration. v1 stores identity data but doesn't implement redirect flow.
- **`autoRefreshToken`**: Client-side feature. Server just needs to respond correctly to refresh token requests.
- **`persistSession`**: Client-side storage. Server is stateless regarding session persistence.
- **Admin API**: Requires `service_role` key. In Teenybase, this maps to Teenybase's admin role or a configured admin API key.
- **`onAuthStateChange`**: Client-side event system. Server generates correct responses; events are emitted by supabase-js client based on server responses.
