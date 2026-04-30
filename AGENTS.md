# AGENTS.md

## Project

Supaflare — Supabase-compatible API layer on Teenybase (D1 + R2 + Cloudflare Workers).

## Stack

- **Runtime:** Cloudflare Workers (Hono framework)
- **Database:** D1 (SQLite)
- **Storage:** R2 (S3-compatible)
- **Test:** Vitest + `@cloudflare/vitest-pool-workers` + `@supabase/supabase-js`
- **SQL parsing:** jsep expression parser
- **Language:** TypeScript (ESM)

## Key Directories

```
packages/teenybase/src/worker/             # Core Teenybase (existing)
packages/teenybase/src/worker/supabase/    # Supabase compat layer (NEW)
packages/teenybase/test/worker/supabase/   # Supabase compat tests (all levels)
tests/supabase-compat/                     # Helpers + fixtures (mostly orphaned)
scripts/test-catalog/                      # Test catalog DB + extraction tools
```

## Architecture

- Compatibility layer extends `$Database` as `$DBExtension`
- Routes: `/rest/v1/{table}`, `/auth/v1/*`, `/storage/v1/*`
- Teenybase native routes (`/api/v1/`) coexist unchanged
- Opt-in via config flag `supabaseCompat: true`

### Auth Architecture (Phase 2)

- Extends existing Teenybase auth (`_auth_identities`, `SecretResolver`, `AuthContext`)
- New D1 tables: `auth_sessions` (refresh tokens), `auth_otps` (one-time tokens), `auth_rate_limits` (brute force protection)
- JWT: HMAC-SHA256, secret from `SUPAFLARE_JWT_SECRET` env var
- Password hashing: bcrypt (pure-JS `bcryptjs` fallback for Workers)
- Email/SMS: tokens stored in D1, **no actual sending** in v1. Use `auth.email.autoConfirm: true` for tests.
- Rate limiting: per-IP/email tracking in `auth_rate_limits` table
- PKCE: store `code_challenge` in `auth_otps`, verify `SHA256(verifier)` on exchange
- Admin routes require `service_role` key (bypasses RLS)

### Storage Architecture (Phase 3)

- **R2**: actual file content storage (binary objects, path = key)
- **D1**: bucket metadata (`storage_buckets`) + object registry (`storage_objects`)
- Bucket config: `public` flag, `fileSizeLimit`, `allowedMimeTypes`
- Signed URLs: HMAC-SHA256 tokens (same secret as auth), short-lived
- `getPublicUrl()` / `toBase64()`: client-side sync utilities — no server code needed
- `service_role` bypasses all storage access control
- Private buckets: authenticated owner or service_role required
- Public buckets: anon can read and list

## Testing Rules

- **TDD always.** Unit → Integration → E2E, in that order.
- **Unit:** pure functions, no D1. Fast feedback.
- **Integration:** `@cloudflare/vitest-pool-workers`, real D1, SELF.fetch() against test Hono app.
- **E2E:** `wrangler dev` live server + `@supabase/supabase-js` client in Node process. (Not yet built)
- **Auth tests:** set `auth.email.autoConfirm: true` to skip email sending. Seed bcrypt passwords via helper.
- **Test location:** All supabase-compat tests live in `packages/teenybase/test/worker/supabase/`. Tests use `SELF.fetch()` (not supabase-js client) for integration tests.

## Plan File Accuracy (CRITICAL)

**After completing any implementation phase, you MUST update the corresponding plan file.** This is non-negotiable. Plan files are the single source of truth for project status.

**When to update:**
1. After committing a completed phase — update STATUS, tradeoffs, and gaps
2. When deferring a feature — document WHY and WHERE in PLAN.md
3. When deviating from the original plan — document the deviation and rationale
4. When discovering a Teenybase limitation — document it in the relevant plan file

**What to update:**
- `DATA.md` — Phase 1 (DATA) implementation status, test results, deferred items, known gaps
- `AUTH.md` — Phase 2 (Auth) implementation status (when started)
- `STORAGE.md` — Phase 3 (Storage) implementation status (when started)
- `PLAN.md` — Cross-phase summary (when started)

**What each plan file MUST track:**
- ✅ What's implemented (with test counts)
- ⚠️ What's partially implemented (and what's missing)
- ❌ What's deferred/skipped (and WHY)
- Tradeoffs made (and their implications)
- Known gaps between plan and reality
- Test infrastructure notes (what works, what doesn't)
- SQLite compatibility notes for each feature

**Before starting a new phase, review all plan files to understand current state.**

## Test Catalog

All Supabase compatibility tests are tracked in a SQLite catalog at `scripts/test-catalog/test-catalog.db`.
Every tab on every Supabase docs page is auto-extracted into the catalog.

**Extract tests from docs** (run when Supabase docs update):
```bash
cd scripts/test-catalog && node catalog.js init && node extract.js
```

**View test status:**
```bash
node catalog.js status                                # all tests, side-by-side supabase vs supaflare
node catalog.js status --category DATA                # DATA only
node catalog.js status --category AUTH --subcategory admin  # specific subcategory
```

**Record test results** (after running tests):
```bash
node catalog.js run --id 3 --target supabase --status pass    # validated against reference Supabase
node catalog.js run --id 3 --target supaflare --status pass   # our implementation passes
node catalog.js run --id 5 --target supaflare --status fail --error "wrong response"  # failure
```

**Reports:**
```bash
node catalog.js report                            # text summary by category/subcategory
node catalog.js report --format markdown           # markdown report (for sharing)
node catalog.js report --target supaflare          # Supaflare implementation only
```

**Workflow for each feature:**
1. Find tests in catalog: `node catalog.js status --category DATA --subcategory filters`
2. Run test against local Supabase → record: `--target supabase --status pass`
3. Implement feature
4. Run test against Supaflare → record: `--target supaflare --status pass`
5. Run report to verify: `node catalog.js report`

**Add new tests** (if extracting misses something):
```bash
node catalog.js add --category DATA --subcategory filters --operation eq \
  --title "Filter: column equals value" --test-code ".eq('name','Luke')"
```

## Design Principles

1. **Translation, not fork.** Parse PostgREST → Teenybase internal → reshape response.
2. **Supabase-compatible, not identical.** SQLite has gaps (no range types, no regex). Return error with hint for unsupported features.
3. **Forward-compatible.** UUIDs as text, ISO timestamps, standard JWT claims. Migrate to hosted Supabase by changing the client URL.
4. **service_role bypasses RLS.** Matches Supabase behavior.
5. **Prefer headers control response.** `return=representation|minimal`, `count=exact|planned|estimated`.

## Env Vars for Auth & Storage Testing

| Variable | Purpose | Test Default |
|---|---|---|
| `SUPAFLARE_JWT_SECRET` | JWT signing key / signed URL token | `"test-jwt-secret-at-least-32-chars!"` |
| `SUPAFLARE_JWT_EXPIRY` | Token lifetime (seconds) | `3600` |
| `SUPAFLARE_ANON_KEY` | Public anon key | `"sb-anon-test-key"` |
| `SUPAFLARE_SERVICE_KEY` | Service role key | `"sb-service-test-key"` |
| `SUPAFLARE_SIGNED_URL_EXPIRY` | Default signed URL lifetime (s) | `600` (10 min) |

## Error Mapping

Map Teenybase errors to Supabase error codes (see PLAN.md Phase 0.4). Response shape: `{ message, code, details, hint }`.

Auth-specific errors (see AUTH.md):
- `weak_password` (422), `user_already_exists` (422), `invalid_credentials` (400)
- `otp_expired` (400), `session_not_found` (400), `invalid_token` (401)
- `lockout_active` (429), `signup_disabled` (422)

Storage-specific errors (see STORAGE.md):
- `not_found` (404), `Duplicate` (400), `BucketNotEmpty` (400)
- `ObjectNotFound` (404), `InvalidToken` (400), `PermissionDenied` (403)
- `SizeLimitExceeded` (413), `MimeTypeNotAllowed` (422)

## Skip List (v1)

- Range operators (no SQLite range types)
- Regex matching `imatch` (no POSIX regex)
- Realtime/WebSockets
- S3-compatible storage endpoint
- Edge Functions
- MFA, SSO/SAML
- Admin API
