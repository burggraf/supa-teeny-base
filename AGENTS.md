# AGENTS.md

## Project

Supa-Teenybase — Supabase-compatible API layer on Teenybase (D1 + R2 + Cloudflare Workers).

## Stack

- **Runtime:** Cloudflare Workers (Hono framework)
- **Database:** D1 (SQLite)
- **Storage:** R2 (S3-compatible)
- **Test:** Vitest + `@cloudflare/vitest-pool-workers` + `@supabase/supabase-js`
- **SQL parsing:** jsep expression parser
- **Language:** TypeScript (ESM)

## Key Directories

```
packages/teenybase/src/worker/    # Core Teenybase (existing)
packages/teenybase/src/worker/supabase/  # Supabase compat layer (NEW)
packages/teenybase/test/worker/   # Existing Teenybase tests
tests/supabase-compat/            # Supabase compat tests (NEW)
```

## Architecture

- Compatibility layer extends `$Database` as `$DBExtension`
- Routes: `/rest/v1/{table}`, `/auth/v1/*`, `/storage/v1/*`
- Teenybase native routes (`/api/v1/`) coexist unchanged
- Opt-in via config flag `supabaseCompat: true`

### Auth Architecture (Phase 2)

- Extends existing Teenybase auth (`_auth_identities`, `SecretResolver`, `AuthContext`)
- New D1 tables: `auth_sessions` (refresh tokens), `auth_otps` (one-time tokens), `auth_rate_limits` (brute force protection)
- JWT: HMAC-SHA256, secret from `SUPA_TEENY_JWT_SECRET` env var
- Password hashing: bcrypt (pure-JS `bcryptjs` fallback for Workers)
- Email/SMS: tokens stored in D1, **no actual sending** in v1. Use `auth.email.autoConfirm: true` for tests.
- Rate limiting: per-IP/email tracking in `auth_rate_limits` table
- PKCE: store `code_challenge` in `auth_otps`, verify `SHA256(verifier)` on exchange
- Admin routes require `service_role` key (bypasses RLS)

## Testing Rules

- **TDD always.** Unit → Integration → E2E, in that order.
- **Unit:** pure functions, no D1. Fast feedback.
- **Integration:** `@cloudflare/vitest-pool-workers`, real D1, supabase-js client.
- **E2E:** `wrangler dev` live server + supabase-js in Node process.
- **Test fixtures** extracted from Supabase docs (see DATA.md, AUTH.md extraction plans).
- **Auth tests:** set `auth.email.autoConfirm: true` to skip email sending. Seed bcrypt passwords via helper.

## Design Principles

1. **Translation, not fork.** Parse PostgREST → Teenybase internal → reshape response.
2. **Supabase-compatible, not identical.** SQLite has gaps (no range types, no regex). Return error with hint for unsupported features.
3. **Forward-compatible.** UUIDs as text, ISO timestamps, standard JWT claims. Migrate to hosted Supabase by changing the client URL.
4. **service_role bypasses RLS.** Matches Supabase behavior.
5. **Prefer headers control response.** `return=representation|minimal`, `count=exact|planned|estimated`.

## Env Vars for Auth Testing

| Variable | Purpose | Test Default |
|---|---|---|
| `SUPA_TEENY_JWT_SECRET` | JWT signing key | `"test-jwt-secret-at-least-32-chars!"` |
| `SUPA_TEENY_JWT_EXPIRY` | Token lifetime (seconds) | `3600` |
| `SUPA_TEENY_ANON_KEY` | Public anon key | `"sb-anon-test-key"` |
| `SUPA_TEENY_SERVICE_KEY` | Service role key | `"sb-service-test-key"` |

## Error Mapping

Map Teenybase errors to Supabase error codes (see PLAN.md Phase 0.4). Response shape: `{ message, code, details, hint }`.

Auth-specific errors (see AUTH.md):
- `weak_password` (422), `user_already_exists` (422), `invalid_credentials` (400)
- `otp_expired` (400), `session_not_found` (400), `invalid_token` (401)
- `lockout_active` (429), `signup_disabled` (422)

## Skip List (v1)

- Range operators (no SQLite range types)
- Regex matching `imatch` (no POSIX regex)
- Realtime/WebSockets
- S3-compatible storage endpoint
- Edge Functions
- MFA, SSO/SAML
- Admin API
