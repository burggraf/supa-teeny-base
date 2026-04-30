# Supaflare: Master Implementation Plan

## Vision

Supabase-compatible API layer on Teenybase. Frontend code using `@supabase/supabase-js` works unmodified against Cloudflare D1 + R2. Same code later points to hosted Supabase — zero frontend changes.

## Architecture

```
@supabase/supabase-js (unchanged frontend client)
         │
         │ HTTP: /rest/v1/*  /auth/v1/*  /storage/v1/*
         ▼
┌─────────────────────────────────────────┐
│  Supaflare Compatibility Layer     │
│  ┌───────────┬──────────┬────────────┐  │
│  │ PostgREST │ GoTrue   │ Storage    │  │
│  │ Adapter   │ Adapter  │ Adapter    │  │
│  └─────┬─────┴────┬─────┴─────┬──────┘  │
│        │          │           │          │
│        ▼          ▼           ▼          │
│  ┌─────────────────────────────────────┐ │
│  │     Teenybase Core (existing)       │ │
│  │  SQL parser · D1 adapter · Auth     │ │
│  │  R2 storage · Migrations · Actions  │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
         │          │           │
         ▼          ▼           ▼
       D1 SQLite   D1 KV     R2 Bucket
```

## Route Coexistence

| Prefix | Purpose | Status |
|--------|---------|--------|
| `/api/v1/table/{table}/...` | Teenybase native | Existing |
| `/rest/v1/{table}` | PostgREST-compatible | **NEW** |
| `/auth/v1/*` | GoTrue-compatible | **NEW** |
| `/storage/v1/object/*` | Storage-compatible | **NEW** |

## Phase Schedule

| Phase | Plan File | Scope | Est. Effort |
|-------|-----------|-------|-------------|
| 1 | [DATA.md](./DATA.md) | PostgREST + RLS + test suite | 4-5 weeks |
| 2 | [AUTH.md](./AUTH.md) | GoTrue Auth + roles + JWT | 2-3 weeks |
| 3 | [STORAGE.md](./STORAGE.md) | Storage REST API | 1-2 weeks |

**Total v1: 7-11 weeks.** (No realtime, no S3-compat.)

## Out of Scope (v1)

- Realtime / WebSockets / Postgres change streams
- S3-compatible storage endpoint
- Edge Functions (`supabase.functions`)
- MFA, SSO/SAML
- Admin API (`auth.admin.*`)
- Data migration SQLite → Postgres tooling

---

# Implementation Phases (Detailed)

## Phase 0: Foundation — Project Scaffolding, Types, Routing Hook

**Goal:** Wire compatibility layer into Teenybase's existing `$Database` routing. Establish test infrastructure.

### 0.1 — Routing Integration
- Extend `$Database.route()` to dispatch `/rest/v1/*`, `/auth/v1/*`, `/storage/v1/*` prefixes
- Add `SupabaseCompatExtension` implementing `$DBExtension` interface
- Register as optional extension (opt-in via config flag `supabaseCompat: true`)
- Falls through to Teenybase native routes for unmatched paths

### 0.2 — Shared Types
- `SupabaseRole`: `'anon' | 'authenticated' | 'service_role'`
- `SupabaseAuthContext`: role, uid, email, jwt payload, apikey
- `PostgrestRequest`: parsed method, table, columns, filters, order, range, headers
- `PostgrestResponse<T>`: `{ data: T | null; error: SupabaseError | null }`
- `SupabaseError`: `{ code: string; message: string; details: string; hint: string }`
- `RLSPolicy`: parsed policy record with USING/WITH CHECK expressions

### 0.3 — Test Infrastructure
- **Unit tests**: pure functions (parsers, formatters, operator translators) — no D1/worker
- **Integration tests**: real D1 via `@cloudflare/vitest-pool-workers`, supabase-js client against test Hono app
- **E2E tests**: spin up `wrangler dev` + real `@supabase/supabase-js` client in Node process
- Shared test helper: `createSupaflareClient()` returns configured `createClient('http://localhost:8787', anonKey)`
- Reuse existing Teenybase vitest pool config (`test/worker/vitest.config.ts`)
- Seed helper: runs SQL fixtures against fresh D1 before each test group

### 0.4 — Error Code Mapping
Map Teenybase errors → Supabase error codes:

| Teenybase | Supabase Code | HTTP |
|-----------|--------------|------|
| 404 table not found | `PGRST200` (relation not found) | 404 |
| 400 bad query | `PGRST100` (invalid query) | 400 |
| 401 unauthorized | `PGRST301` (JWT expired/invalid) | 401 |
| 403 RLS violation | `PGRST305` (row-level security) | 403 |
| 409 unique violation | `23505` (unique violation) | 409 |
| 422 validation | `PGRST204` (no rows returned for single) | 422 |
| 500 internal | `PGRST000` (internal error) | 500 |

**Tests:** Unit tests for each mapping. Integration tests verify error shape `{code, message, details, hint}`.

---

## Phase 1: PostgREST Data API

**Goal:** Full CRUD + filters + modifiers via `/rest/v1/{table}` matching supabase-js expectations.

### Sub-phase 1A: Core Routing + Request Parsing

#### 1A.1 — Route Registration
- `GET /rest/v1/{table}` → SELECT
- `POST /rest/v1/{table}` → INSERT
- `PATCH /rest/v1/{table}` → UPDATE
- `DELETE /rest/v1/{table}` → DELETE
- `HEAD /rest/v1/{table}` → count only (no body)

**Tests:** Integration — verify each method routes correctly, returns 404 for unknown tables.

#### 1A.2 — Auth Context from Headers
- Extract `apikey` header → resolve to anon key or service role
- Extract `Authorization: Bearer <jwt>` → decode, extract role from `aud` claim
- Default role: `anon` if no auth header
- `service_role` bypasses RLS entirely
- Populate `SupabaseAuthContext` on request

**Tests:** Unit — header parsing, role resolution. Integration — requests with different auth headers produce correct role.

#### 1A.3 — Query Parameter Parsing
Parse PostgREST query params:
- `select` — column list with nested relations
- `columns` — insert/update column whitelist
- Filter params: `{column}.{op}` (e.g., `name.eq=Luke`, `age.gt=18`)
- `order` — `column.desc.nullslast`
- `limit` / `offset` — pagination
- `on_conflict` — upsert conflict column
- `resolution` — upsert resolution mode

**Tests:** Unit — parser produces correct internal representation for each param combination.

#### 1A.4 — Prefer Header Parsing
- `Prefer: return=representation` → return inserted/updated/deleted rows
- `Prefer: return=minimal` → return `204 No Content`
- `Prefer: count=exact` → include `Content-Range` with exact count
- `Prefer: count=planned` → return estimate (SQLite: fall back to exact, warn)
- `Prefer: count=estimated` → return estimate (SQLite: fall back to exact, warn)

**Tests:** Unit — header parsing. Integration — verify response body / status code / headers match.

### Sub-phase 1B: SELECT Implementation

#### 1B.1 — Basic SELECT
- `select=*` → all columns
- `select=id,name` → specific columns
- Map Teenybase `$Table.select()` → PostgREST response shape
- Response: JSON array `[{...}, {...}]`
- Content-Type: `application/json; charset=utf-8`

**Tests:** Integration — `supabase.from('characters').select()` returns correct shape.

#### 1B.2 — Nested Select (FK Joins)
- `select=id,name,countries(name)` → embed FK relation
- Parse `select` for nested `table(column)` syntax
- Use Teenybase's existing FK relationship metadata
- Issue separate query per nested relation (N+1 acceptable for v1)
- Embed results in parent row under foreign key name

**Tests:** Integration — cities/countries join example from Supabase docs.

#### 1B.3 — Single / MaybeSingle
- `single()` → error if 0 or >1 rows
- `maybeSingle()` → null if 0 rows, error if >1 rows
- Server: detect row count, return appropriate status

**Tests:** Integration — verify error codes (`PGRST204` for single with 0 rows, `PGRST116` for single with >1).

### Sub-phase 1C: Filter Operators

#### 1C.1 — Basic Comparison Operators
Implement: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`
- Map to jsep expressions → Teenybase WHERE clause
- All native SQLite

**Tests:** Unit — operator → jsep mapping. Integration — each filter against characters table.

#### 1C.2 — Pattern Matching
- `like` → SQLite `LIKE`
- `ilike` → `LIKE ... COLLATE NOCASE` (or `LOWER(col) LIKE LOWER(pattern)`)

**Tests:** Integration — pattern matching against characters/countries.

#### 1C.3 — Null / Boolean / IN
- `is` → `IS NULL` / `IS NOT NULL` / `IS TRUE` / `IS FALSE`
- `in` → `IN (...)`
- `not` → negation wrapper

**Tests:** Integration — null filtering, boolean filtering, IN lists.

#### 1C.4 — OR Filters
- `or=(and(filter1,filter2),filter3)`
- Parse PostgREST OR syntax → jsep OR expression
- Support nested AND within OR

**Tests:** Integration — complex OR/AND combinations.

#### 1C.5 — Array / JSONB Operators (Emulated)
- `contains` (array) → JSON array containment via `json_extract`
- `containedBy` (array) → reverse containment
- `overlaps` (array) → JSON array intersection
- Store arrays as JSON text: `["tag1","tag2"]`
- SQLite: use `json_each` + subqueries for containment checks

**Tests:** Integration — issues/tags table. Compare against real Supabase responses.

#### 1C.6 — Match (Multi-EQ Shorthand)
- `match({col1: val1, col2: val2})` → `col1=val1 AND col2=val2`

**Tests:** Unit — match → AND expansion. Integration.

#### 1C.7 — Text Search (Partial)
- `textSearch` → SQLite FTS5 virtual table
- Basic term matching only (no phrase, no weight ranking)
- Require FTS5 index on target column

**Tests:** Integration — FTS5 setup + basic search. Document limitations vs Postgres tsvector.

#### 1C.8 — SKIP for v1 (document in error response)
- Range operators (`rangeGt`, `rangeGte`, `rangeLt`, `rangeLte`, `rangeAdjacent`) — no SQLite range types
- `imatch` (regex) — no POSIX regex in SQLite
- Return `PGRST100` with hint: "not supported on SQLite backend"

### Sub-phase 1D: Mutations (INSERT / UPDATE / UPSERT / DELETE)

#### 1D.1 — INSERT
- `POST /rest/v1/{table}` with JSON body (single object or array)
- `columns` param → whitelist inserted columns
- `Prefer: return=representation` → return inserted rows
- Auto-generated IDs (UUID) via Teenybase

**Tests:** Integration — single insert, bulk insert, columns param.

#### 1D.2 — UPDATE
- `PATCH /rest/v1/{table}` with filter params as WHERE clause
- `Prefer: return=representation` → return updated rows
- Must have at least one filter (safety: prevent full-table update)

**Tests:** Integration — filtered update, return representation.

#### 1D.3 — UPSERT
- `POST /rest/v1/{table}` with `on_conflict=column` param
- `Prefer: resolution=merge-duplicates` → update existing
- `Prefer: resolution=ignore-duplicates` → skip existing
- SQLite: `INSERT ... ON CONFLICT(column) DO UPDATE/NOTHING`

**Tests:** Integration — upsert new row, upsert existing with merge, upsert with ignore.

#### 1D.4 — DELETE
- `DELETE /rest/v1/{table}` with filter params as WHERE clause
- Must have at least one filter (safety)
- `Prefer: return=representation` → return deleted rows

**Tests:** Integration — filtered delete, return representation.

### Sub-phase 1E: Response Formatting

#### 1E.1 — Response Envelope
- **PostgREST mode:** raw JSON array (no `{data, error}` wrapper — that's client-side)
- Error responses: `{ message, code, details, hint }` with correct HTTP status
- `Content-Type: application/json; charset=utf-8`

**Tests:** Integration — verify response headers, body shape, error shape.

#### 1E.2 — Content-Range Header
- Format: `0-9/42` (start-end/total) or `*/42` (HEAD request)
- Include when `Prefer: count=exact` or pagination used
- HEAD requests: return header only, no body

**Tests:** Integration — verify header format with various pagination scenarios.

#### 1E.3 — CSV Output
- `Accept: text/csv` → CSV response
- Column headers from select
- Proper escaping of special characters

**Tests:** Integration — CSV output matches Supabase CSV format.

### Sub-phase 1F: RLS (Row-Level Security)

#### 1F.1 — Policy Storage
- D1 table `rls_policies`:
  ```sql
  CREATE TABLE rls_policies (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,  -- anon, authenticated, service_role
    operation TEXT NOT NULL, -- SELECT, INSERT, UPDATE, DELETE, ALL
    using_expr TEXT,    -- USING expression (jsep-compatible)
    with_check_expr TEXT, -- WITH CHECK expression
    permissive BOOLEAN DEFAULT TRUE
  );
  ```
- CRUD API for managing policies (admin only)
- Support `CREATE POLICY` SQL parsing

**Tests:** Unit — SQL parser. Integration — policy CRUD.

#### 1F.2 — Policy Injection
- At query time: collect policies for (table, role, operation)
- PERMISSIVE: combine USING expressions with OR
- RESTRICTIVE: combine with AND
- Inject as WHERE clause into Teenybase query
- INSERT/UPDATE: inject WITH CHECK as validation
- `service_role` bypasses all policies

**Tests:** Integration — create policies, verify they filter rows correctly.

#### 1F.3 — Auth Functions
- `auth.uid()` → current user's uid from JWT
- `auth.role()` → current role string
- `auth.email()` → current user's email
- `auth.jwt()` → full JWT payload as JSON
- Register as jsep functions in query context

**Tests:** Unit — function resolution. Integration — policy using `auth.uid()`.

### Sub-phase 1G: Modifiers

#### 1G.1 — Order / Limit / Range
- `order=column.desc.nullslast` → `ORDER BY column DESC`
- `limit=N` → `LIMIT N`
- `offset=N` → `OFFSET N`
- Combined: `?order=created_at.desc&limit=10&offset=20`

**Tests:** Integration — pagination scenarios, null ordering.

#### 1G.2 — Schema Switching
- `.schema('other')` → query different schema namespace
- SQLite: prefix table with schema name (e.g., `other.users`)
- Default schema: `public`

**Tests:** Integration — cross-schema queries.

---

## Phase 2: GoTrue Auth API

**See [AUTH.md](./AUTH.md)** — dedicated auth users table, JWT building, email flows, OTP, PKCE, rate limiting, admin API, role injection into RLS.

### Sub-phase 2A: Foundation — Routing, JWT, Password Hashing

#### 2A.1 — Auth Route Registration
- `POST /auth/v1/signup` → create user
- `POST /auth/v1/token` → authenticate (password/refresh_token/pkce grants)
- `POST /auth/v1/otp` → send OTP/magic link
- `POST /auth/v1/verify` → verify OTP/token
- `POST /auth/v1/logout` → sign out
- `GET /auth/v1/user` → get current user
- `PUT /auth/v1/user` → update current user
- `POST /auth/v1/reauthenticate` → reauth nonce
- `POST /auth/v1/resend` → resend OTP
- `POST /auth/v1/recover` → password recovery
- `GET /auth/v1/settings` → project settings
- Admin routes under `/auth/v1/admin/*` (service_role only)

**Tests:** Integration — verify each route dispatches, returns correct status for unauthenticated access.

#### 2A.2 — JWT Builder
- HMAC-SHA256 signing via `SUPAFLARE_JWT_SECRET` env var
- Claims: `sub` (user UUID), `aud` (role), `role`, `email`, `phone`, `app_metadata`, `user_metadata`, `exp`, `iat`
- `exp = iat + JWT_EXPIRY` (default 3600s)
- Use `jose` or `@tsndoo/hono-jwt` library
- Validate: signature, expiry, required claims

**Tests:** Unit — encode, decode, expiry rejection, wrong-secret rejection. Integration — JWT from signup usable in `GET /auth/v1/user`.

#### 2A.3 — Password Hashing
- bcrypt hash on signup
- bcrypt compare on password signin
- Minimum length validation (default 6, configurable)

**Tests:** Unit — hash produces valid bcrypt, compare matches/mismatches, weak password rejection.

#### 2A.4 — Auth Context Middleware
- Extract `apikey` header → resolve anon key or service role
- Extract `Authorization: Bearer <jwt>` → decode, validate, extract claims
- Populate `SupabaseAuthContext` on request context
- `service_role` bypasses RLS, enables admin routes

**Tests:** Unit — header parsing, role resolution. Integration — requests with different auth headers produce correct context.

### Sub-phase 2B: Signup + Email Confirmation

#### 2B.1 — Email/Password Signup
- Validate email format, password strength
- Check duplicate email/phone
- Generate user UUID (v4)
- Hash password, store in D1 users table
- Generate `confirmation_token`, store with expiry
- If `email.confirmRequired = true`: return user, `session: null`
- If `email.autoConfirm = true`: set `email_confirmed_at`, return user + session

**Tests:** Integration — signup returns correct shape, duplicate rejection, weak password rejection. E2E — `supabase.auth.signUp()` flow.

#### 2B.2 — Email Verification
- `POST /auth/v1/verify` with token + type `signup`
- Validate token, check expiry
- Set `email_confirmed_at = NOW`
- Create session, issue JWT + refresh token
- Consume OTP record

**Tests:** Integration — verify valid token creates session, expired token rejected. E2E — full signup→verify→signin flow.

### Sub-phase 2C: Authentication (Sign In)

#### 2C.1 — Password Sign In
- `POST /auth/v1/token?grant_type=password`
- Look up user by email or phone
- bcrypt compare password
- Create session (refresh token), issue JWT
- Update `last_sign_in_at`

**Tests:** Integration — correct credentials return session, wrong password returns `invalid_credentials`, user not found returns same error (no enumeration).

#### 2C.2 — Anonymous Sign In
- Generate random UUID user
- No password, no email
- `aud: "anon"`, `role: "anon"`
- Return session with JWT

**Tests:** Integration — anonymous user created, JWT has correct claims.

#### 2C.3 — Refresh Token Exchange
- `POST /auth/v1/token?grant_type=refresh_token`
- Look up refresh token in `auth_sessions`
- Check not revoked, not expired
- **Single-use:** revoke old refresh token, issue new one
- Issue new JWT with updated `exp`

**Tests:** Integration — valid refresh token returns new session, revoked token rejected, old refresh token unusable after refresh.

### Sub-phase 2D: OTP + Magic Links

#### 2D.1 — OTP Send (Email)
- `POST /auth/v1/otp` with email
- Generate random 6-digit token
- Store SHA256 hash in `auth_otps` with expiry
- Return success (no actual email sent in v1)

**Tests:** Integration — OTP record created in D1, rate limit enforced.

#### 2D.2 — OTP Verification
- `POST /auth/v1/verify` with token_hash + type
- Lookup by hash, check expiry, check type match
- Create session, issue JWT
- Consume OTP record

**Tests:** Integration — valid OTP creates session, expired OTP rejected, consumed OTP rejected.

#### 2D.3 — Magic Links
- OTP with type `magiclink`
- Same flow as email OTP
- Redirect URL included in verification response

**Tests:** Integration — magiclink OTP stored, verified, redirects correctly.

### Sub-phase 2E: PKCE Flow

#### 2E.1 — PKCE Challenge Storage
- OAuth/OTP signup stores `code_challenge` + `code_challenge_method` in `auth_otps`
- S256 method only (SHA256 of verifier, base64url encoded)

**Tests:** Unit — challenge derivation matches spec.

#### 2E.2 — PKCE Token Exchange
- `POST /auth/v1/token?grant_type=pkce`
- Lookup `auth_code` in `auth_otps`
- Verify `SHA256(code_verifier)` matches stored challenge
- Create session, issue JWT

**Tests:** Integration — correct verifier returns session, wrong verifier rejected, expired code rejected.

### Sub-phase 2F: User Management

#### 2F.1 — Get Current User
- `GET /auth/v1/user` with JWT
- Decode JWT, look up user by `sub`
- Return user object

**Tests:** Integration — valid JWT returns user, expired JWT returns 401.

#### 2F.2 — Update User
- `PUT /auth/v1/user` with JWT
- Update email (with confirmation flow if changing)
- Update password (rehash)
- Update `user_metadata`
- Return updated user

**Tests:** Integration — update email, password, metadata. Verify old password no longer works after change.

#### 2F.3 — Sign Out
- `POST /auth/v1/logout` with JWT
- Scope `global`: revoke all sessions for user
- Scope `local`: revoke current session only
- Scope `others`: revoke all other sessions

**Tests:** Integration — global sign out revokes all tokens, local revokes current only.

### Sub-phase 2G: Password Recovery

#### 2G.1 — Recovery Request
- `POST /auth/v1/recover` with email
- Generate `recovery_token`, store with expiry
- Return success (no email sent in v1)

**Tests:** Integration — recovery token created, rate limit enforced.

#### 2G.2 — Recovery Verification
- Via `POST /auth/v1/verify` with type `recovery`
- Validate token, create session
- User can then `PUT /auth/v1/user` to set new password

**Tests:** Integration — full recovery flow.

### Sub-phase 2H: Rate Limiting & Security

#### 2H.1 — Rate Limiter
- Track attempts per identifier (IP/email) in `auth_rate_limits` D1 table
- Configurable limits: signup (3/min), login (10/min), OTP (5/min)
- After threshold: lockout for configurable duration (default 300s)

**Tests:** Unit — rate limit check logic. Integration — rapid signups trigger rate limit, lockout enforced.

### Sub-phase 2I: Admin API

#### 2I.1 — Admin Auth Middleware
- Require `service_role` key or admin JWT
- Reject anon key access to admin routes

**Tests:** Integration — anon key rejected from admin routes, service_role accepted.

#### 2I.2 — Admin User CRUD
- `POST /auth/v1/admin/users` → create user (with optional `email_confirm`)
- `GET /auth/v1/admin/users` → list users (paginated)
- `GET /auth/v1/admin/users/{uid}` → get user by ID
- `PUT /auth/v1/admin/users/{uid}` → update user
- `DELETE /auth/v1/admin/users/{uid}` → delete (soft or hard)

**Tests:** Integration — full admin CRUD, pagination, soft delete.

#### 2I.3 — Admin Generate Link
- `POST /auth/v1/admin/generate_link`
- Types: `signup`, `invite`, `magiclink`, `recovery`, `email_change`
- Generate token, return action_link + email_otp + hashed_token

**Tests:** Integration — each link type generates correct token and response shape.

### Sub-phase 2J: Settings

#### 2J.1 — Project Settings
- `GET /auth/v1/settings`
- Return configured OAuth providers (empty in v1), signup enabled flag, mailers

**Tests:** Integration — returns correct settings object.

Key compatibility requirements:
- `POST /auth/v1/signup` → create user in D1, send JWT or null session (email confirm)
- `POST /auth/v1/token` → password grant, refresh token, PKCE exchange
- `GET/PUT /auth/v1/user` → current user management
- JWT format matches Supabase: `HS256`, `aud` = role, `role` claim, `app_metadata`/`user_metadata`
- JWT secret configurable via `SUPAFLARE_JWT_SECRET` env var
- Refresh tokens single-use, stored in D1 `auth_sessions`
- OTP stored in D1 `auth_otps` (no actual email/SMS sending in v1)
- Rate limiting via D1 `auth_rate_limits` table

---

## Phase 3: Storage API

**See [STORAGE.md](./STORAGE.md)** — full Supabase Storage-compatible API on R2, signed URLs, public access, access control.

### Sub-phase 3.1: Storage Routing + R2 Integration

#### 3.1.1 — Route Registration
- `GET /storage/v1/bucket/list` → listBuckets
- `GET /storage/v1/bucket/{id}` → getBucket
- `POST /storage/v1/bucket` → createBucket
- `PUT /storage/v1/bucket/{id}` → updateBucket
- `DELETE /storage/v1/bucket/{id}` → deleteBucket
- `POST /storage/v1/bucket/{id}/empty` → emptyBucket
- `POST /storage/v1/object/{bucket}` → upload (binary body)
- `PUT /storage/v1/object/{bucket}` → update (binary body)
- `GET /storage/v1/object/{bucket}/{path}` → download (binary response)
- `HEAD /storage/v1/object/{bucket}/{path}` → exists (status only)
- `DELETE /storage/v1/object/{bucket}` → remove (paths in body)
- `POST /storage/v1/object/{bucket}/move` → move
- `POST /storage/v1/object/{bucket}/copy` → copy
- `POST /storage/v1/object/{bucket}/list` → list (offset pagination)
- `POST /storage/v1/object/{bucket}/list/v2` → listV2 (cursor pagination)
- `POST /storage/v1/object/sign/{bucket}` → createSignedUrl
- `POST /storage/v1/object/signatures` → createSignedUrls (batch)
- `POST /storage/v1/upload/resumable` → createSignedUploadUrl
- `PUT /storage/v1/upload/resumable` → uploadToSignedUrl
- `GET /storage/v1/object/sign/{bucket}/{path}` → signed URL download
- `GET /storage/v1/object/public/{bucket}/{path}` → public URL download
- `POST /storage/v1/object/info/{bucket}/{path}` → object info

**Tests:** Integration — verify each route dispatches, returns correct status for missing bucket.

#### 3.1.2 — R2 Client Integration
- Use Cloudflare Workers `env.R2_BUCKET` binding
- Helper layer: `putObject()`, `getObject()`, `headObject()`, `deleteObject()`, `listObjects()`, `copyObject()`
- Map R2 responses → Supabase shapes
- Handle R2 errors → Supabase error codes (`not_found`, `Duplicate`, etc.)

**Tests:** Integration — upload/download binary content, verify R2 state.

#### 3.1.3 — Storage Auth Middleware
- Extract `apikey` + `Authorization` headers → `SupabaseAuthContext`
- Public bucket: anon read access
- Private bucket: authenticated owner or service_role
- `service_role`: bypass all checks

**Tests:** Unit — permission check logic. Integration — access control scenarios.

### Sub-phase 3.2: D1 Bucket Metadata Schema

#### 3.2.1 — Schema Migration
```sql
CREATE TABLE storage_buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT,
  public INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  file_size_limit INTEGER,
  allowed_mime_types TEXT
);

CREATE TABLE storage_objects (
  id TEXT PRIMARY KEY,
  bucket_id TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT,
  version TEXT
);
```

**Tests:** Integration — schema creation, indexes.

#### 3.2.2 — Bucket CRUD
- Create: validate name, check duplicate, store in D1
- List: query all buckets for current user (or all for service_role)
- Get: single bucket by id
- Update: modify public flag, size limit, MIME types
- Delete: check empty first, then remove from D1 + R2
- Empty: list all objects, delete from R2, remove from D1

**Tests:** Integration — full bucket CRUD lifecycle.

### Sub-phase 3.3: Object Operations

#### 3.3.1 — Upload
- Parse `x-upsert`, `x-cache-control`, `content-type`, `content-length` headers
- Validate: size limit, MIME type against bucket config, path format
- Write to R2 via `put()`, register in D1 `storage_objects`
- Upsert mode: overwrite if exists

**Tests:** Integration — upload text/binary, upsert, size limit, MIME rejection, path validation.

#### 3.3.2 — Update
- Same as upload but requires existing object
- Overwrite R2 content, update D1 metadata

**Tests:** Integration — update existing file, reject if not found.

#### 3.3.3 — Download
- Read from R2 via `get()`, return binary with correct headers
- `Content-Type`, `Content-Length`, `Cache-Control`, `ETag`, `Last-Modified`
- Access control check before serving

**Tests:** Integration — download blob, verify content and headers.

#### 3.3.4 — Remove
- Accept paths array in JSON body
- Delete from R2, remove from D1
- Return array of deleted object names

**Tests:** Integration — remove single/multiple files.

#### 3.3.5 — Move
- R2: copy to new key, delete old key
- D1: update path, update `updated_at`
- Verify source gone, destination exists

**Tests:** Integration — move file, verify source deleted, destination present.

#### 3.3.6 — Copy
- R2: `copy()` or `get()` + `put()`
- D1: new registry entry
- Source remains intact

**Tests:** Integration — copy file, verify both source and destination exist.

### Sub-phase 3.4: Listing & Metadata

#### 3.4.1 — List (v1)
- `prefix`, `limit`, `offset` params
- R2 `list()` + sort
- Return objects + folders (`id: null` for folders)
- Sort by name/size/created_at

**Tests:** Integration — list root, subfolder, pagination, sort order.

#### 3.4.2 — ListV2
- Cursor-based pagination
- Separate `objects` and `folders` arrays
- `hasNext` / `nextCursor` response fields

**Tests:** Integration — cursor pagination, folders vs objects separation.

#### 3.4.3 — Info
- R2 `head()` for metadata
- Return: name, size, mimetype, cacheControl, lastModified, eTag

**Tests:** Integration — info on uploaded file, verify all fields.

#### 3.4.4 — Exists
- `HEAD /storage/v1/object/{bucket}/{path}`
- Return 200 if exists, 404 if not
- No body — status only

**Tests:** Integration — exists returns true/false via HEAD.

### Sub-phase 3.5: Signed URLs

#### 3.5.1 — Download Signed URL
- Generate HMAC-SHA256 token (same secret as auth)
- Token includes: bucket, path, expiry, download flag
- Store token expiry in D1 for revocation (optional)
- `GET .../sign/{bucket}/{path}?token=...` → validate + serve from R2

**Tests:** Unit — token encode/decode, expiry validation. Integration — create signed URL, download via it, expired URL rejected, wrong signature rejected.

#### 3.5.2 — Batch Signed URLs
- `POST /storage/v1/object/signatures` → array of signed URLs
- Return `{ url, signedURL, error }` per path

**Tests:** Integration — batch creation, mixed valid/invalid paths.

#### 3.5.3 — Signed Upload URL
- `POST /storage/v1/upload/resumable` → generate upload token
- Token includes `upsert` flag (baked in, cannot override)
- `PUT /storage/v1/upload/resumable` with `x-upsert-token` header
- Validate token, store file in R2

**Tests:** Unit — upload token. Integration — create upload URL, upload via token, verify file stored. Upsert from token.

### Sub-phase 3.6: Public URLs

#### 3.6.1 — Public URL Builder
- `getPublicUrl(path)` — **sync, client-side only**
- No server API call needed
- Construct URL: `{baseUrl}/storage/v1/object/public/{bucket}/{path}`

**Tests:** Unit — URL construction for public bucket.

### Sub-phase 3.7: Access Control

#### 3.7.1 — Bucket-Level Permissions
| Role | Public Bucket | Private Bucket |
|---|---|---|
| `anon` | Read objects, list | Denied |
| `authenticated` | Read/write objects | Read/write if owner |
| `service_role` | Full access | Full access |

**Tests:** Integration — access public/private buckets with different auth levels.

#### 3.7.2 — Object-Level Permissions
- Upload: bucket exists + size limit + MIME + auth check
- Download: public OR signed URL OR owner/service_role
- Delete/Move/Copy: owner/service_role

**Tests:** Integration — various permission scenarios, edge cases.

### Sub-phase 3.8: File Size & MIME Enforcement

#### 3.8.1 — Size Limit
- Check `Content-Length` header before reading body
- Reject early if exceeds bucket `file_size_limit`
- Global cap from `storage.maxUploadSize` config

**Tests:** Integration — upload exceeds limit → 413.

#### 3.8.2 — MIME Validation
- Check `Content-Type` against bucket `allowed_mime_types`
- Reject if not in allowed list

**Tests:** Integration — upload disallowed MIME → 422.

Key compatibility requirements:
- `POST /storage/v1/object/{bucket}` → upload to R2 (binary body, `x-upsert` header)
- `GET /storage/v1/object/{bucket}/{path}` → download from R2 (binary response)
- `POST /storage/v1/object/sign/{bucket}` → JWT-signed temporary download URL
- `POST /storage/v1/upload/resumable` → JWT-signed upload token
- Bucket metadata in D1 `storage_buckets` table (public flag, size limit, MIME types)
- Object metadata in D1 `storage_objects` table (path, size, MIME, owner)
- `getPublicUrl()` and `toBase64()` are client-side sync utilities — no server code
- Signed URLs use HMAC-SHA256 tokens (same secret as auth JWT)
- `service_role` bypasses all storage access control
- R2 is the actual file content store; D1 holds metadata only

---

## SQLite Compatibility Matrix

| PostgREST Feature | SQLite Support | Action |
|---|---|---|
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | ✅ Native | Direct |
| `like` | ✅ Native | Direct |
| `ilike` | ⚠️ Via `LIKE COLLATE NOCASE` | Translate |
| `is` (NULL/bool) | ✅ Native | Direct |
| `in` | ✅ Native | Direct |
| `contains` (array) | ⚠️ JSON emulation | Emulate via `json_each` |
| `contains` (jsonb) | ⚠️ Via `json_extract` | Emulate |
| `containedBy` (array/jsonb) | ⚠️ Via JSON | Emulate |
| `overlaps` (array) | ⚠️ Via JSON | Emulate |
| `range*` operators | ❌ No range types | **Skip v1**, return error |
| `textSearch` | ⚠️ SQLite FTS5 | Partial (basic terms only) |
| `match` / `imatch` (regex) | ❌ No POSIX regex | **Skip v1**, return error |
| `csv()` | ✅ | Direct |
| `single()` / `maybeSingle()` | ✅ Row count check | Direct |
| `explain` | ✅ `EXPLAIN QUERY PLAN` | Direct |
| `count=exact` | ✅ `COUNT(*)` | Direct |
| `count=planned/estimated` | ❌ No planner stats | Fall back to exact |
| `stripNulls()` | ⚠️ Client-side | Skip (client handles) |

---

## Migration Path to Real Supabase

Design choices ensuring forward compatibility:
- All IDs stored as UUID text strings (not SQLite rowids)
- Timestamps as ISO-8601 strings (both SQLite and Postgres compatible)
- JWT: HS256, standard claims (`sub`, `aud`, `exp`, `iat`)
- Array columns stored as JSON text — Postgres accepts JSON for array insertion
- No SQLite-specific functions in user-facing queries
- RLS policies stored in portable JSON format alongside D1 table

---

## File Structure

```
packages/teenybase/src/
├── worker/
│   ├── supabase/                          ← NEW: compatibility layer
│   │   ├── index.ts                       ← Extension entry, registers routes
│   │   ├── postgrest/
│   │   │   ├── router.ts                  ← GET/POST/PATCH/DELETE/HEAD handlers
│   │   │   ├── queryParser.ts             ← URL params → internal query AST
│   │   │   ├── operators.ts               ← eq/neq/gt/lt/like/ilike/in/... → jsep
│   │   │   ├── selectParser.ts            ← select=id,name,rel(col) → queries
│   │   │   ├── preferHeader.ts            ← Prefer header parsing
│   │   │   ├── responseFormatter.ts       ← JSON/CSV + Content-Range + errors
│   │   │   └── errorMapper.ts             ← Teenybase errors → Supabase codes
│   │   ├── auth/
│   │   │   ├── router.ts                  ← /auth/v1/* dispatch
│   │   │   ├── signup.ts                  ← POST /signup, email confirm flow
│   │   │   ├── token.ts                   ← POST /token (password/refresh_token/pkce)
│   │   │   ├── otp.ts                     ← POST /otp, POST /verify
│   │   │   ├── user.ts                    ← GET/PUT /user
│   │   │   ├── recover.ts                 ← POST /recover, password reset
│   │   │   ├── logout.ts                  ← POST /logout (global/local/others)
│   │   │   ├── resend.ts                  ← POST /resend
│   │   │   ├── settings.ts                ← GET /settings
│   │   │   ├── admin/
│   │   │   │   ├── users.ts               ← CRUD /admin/users
│   │   │   │   └── generateLink.ts        ← /admin/generate_link
│   │   │   ├── jwtBuilder.ts              ← Supabase-compatible JWT (HS256)
│   │   │   ├── passwordHasher.ts          ← bcrypt hash + compare
│   │   │   ├── sessionManager.ts          ← refresh token CRUD, single-use
│   │   │   ├── rateLimiter.ts             ← per-IP/email rate limiting
│   │   │   └── pkce.ts                    ← PKCE challenge/verifier
│   │   ├── storage/                       ← Phase 3: Supabase Storage compat
│   │   │   ├── router.ts                  ← /storage/v1/* dispatch
│   │   │   ├── buckets.ts                 ← bucket CRUD (D1 metadata + R2)
│   │   │   ├── upload.ts                  ← upload binary to R2
│   │   │   ├── download.ts                ← download binary from R2
│   │   │   ├── list.ts                    ← list/listV2 objects
│   │   │   ├── remove.ts                  ← delete objects
│   │   │   ├── move.ts                    ← move objects (R2 copy+delete)
│   │   │   ├── copy.ts                    ← copy objects
│   │   │   ├── info.ts                    ← HEAD/info for object metadata
│   │   │   ├── signedUrl.ts               ← HMAC signed URL tokens
│   │   │   ├── signedUploadUrl.ts         ← signed upload URL tokens
│   │   │   ├── publicUrl.ts               ← public URL builder (client-side)
│   │   │   ├── validators.ts              ← path, MIME, size validation
│   │   │   └── accessControl.ts           ← bucket/object permission checks
│   │   ├── rls/
│   │   │   ├── policyStore.ts             ← D1 CRUD for rls_policies
│   │   │   ├── policyParser.ts            ← CREATE POLICY → internal format
│   │   │   ├── policyCompiler.ts          ← policies → WHERE clauses
│   │   │   └── authFunctions.ts           ← auth.uid()/role()/email()/jwt()
│   │   └── shared/
│   │       ├── types.ts                   ← SupabaseRole, PostgrestResponse, etc.
│   │       ├── config.ts                  ← supabaseCompat config
│   │       └── authContext.ts             ← extract AuthContext from headers
│
tests/
├── supabase-compat/                       ← NEW: compatibility test suite
│   ├── unit/                              ← Pure function tests (no D1)
│   │   ├── queryParser.test.ts
│   │   ├── operators.test.ts
│   │   ├── selectParser.test.ts
│   │   ├── preferHeader.test.ts
│   │   ├── responseFormatter.test.ts
│   │   ├── errorMapper.test.ts
│   │   ├── policyParser.test.ts
│   │   ├── authContext.test.ts            ← Header → SupabaseAuthContext
│   │   ├── jwt.test.ts                    ← JWT encode/decode, claims, expiry
│   │   ├── passwordHasher.test.ts         ← bcrypt hash + compare
│   │   ├── sessionManager.test.ts         ← Session create/refresh/revoke
│   │   ├── pkce.test.ts                   ← PKCE challenge/verifier
│   │   ├── rateLimiter.test.ts            ← Rate limit + lockout logic
│   │   ├── signedUrl.test.ts              ← Signed URL encode/decode, expiry
│   │   ├── signedUploadUrl.test.ts        ← Upload token generation + validation
│   │   ├── pathValidator.test.ts          ← Path name validation
│   │   ├── mimeTypeValidator.test.ts      ← MIME type matching
│   │   ├── fileSizeValidator.test.ts      ← Size limit enforcement
│   │   ├── publicUrlBuilder.test.ts       ← getPublicUrl URL construction
│   │   └── storageErrorMapper.test.ts     ← Storage errors → Supabase codes
│   ├── integration/                       ← D1-backed tests via vitest-pool-workers
│   │   ├── setup.ts                       ← Test Hono app with supabase compat
│   │   ├── fixtures/
│   │   │   ├── schemas/                   ← SQL seed scripts
│   │   │   │   ├── characters.sql
│   │   │   │   ├── countries.sql
│   │   │   │   ├── cities.sql
│   │   │   │   ├── instruments.sql
│   │   │   │   ├── users.sql
│   │   │   │   ├── issues.sql
│   │   │   │   ├── classes.sql
│   │   │   │   ├── texts.sql
│   │   │   │   ├── auth-users.sql         ← Pre-seeded auth users (bcrypt passwords)
│   │   │   │   └── storage-buckets.sql    ← Pre-seeded storage buckets
│   │   │   └── responses/                 ← Expected JSON responses
│   │   ├── crud/
│   │   │   ├── select.test.ts
│   │   │   ├── insert.test.ts
│   │   │   ├── update.test.ts
│   │   │   ├── upsert.test.ts
│   │   │   └── delete.test.ts
│   │   ├── filters/
│   │   │   ├── comparisons.test.ts        ← eq/neq/gt/gte/lt/lte
│   │   │   ├── pattern.test.ts            ← like/ilike
│   │   │   ├── null-bool.test.ts          ← is
│   │   │   ├── array-json.test.ts         ← contains/containedBy/overlaps
│   │   │   ├── logical.test.ts            ← not/or/and
│   │   │   └── match.test.ts              ← match
│   │   ├── modifiers/
│   │   │   ├── order.test.ts
│   │   │   ├── pagination.test.ts         ← limit/offset/range
│   │   │   ├── single.test.ts
│   │   │   └── csv.test.ts
│   │   ├── rls/
│   │   │   ├── policies.test.ts           ← CRUD + injection
│   │   │   └── auth-functions.test.ts     ← auth.uid(), auth.role(), etc.
│   │   ├── auth/
│   │   │   ├── signup.test.ts             ← Email+password, confirm behavior
│   │   │   ├── signin.test.ts             ← Password, OTP, anonymous
│   │   │   ├── session.test.ts            ← getSession, refreshSession, setSession
│   │   │   ├── user.test.ts               ← getUser, updateUser
│   │   │   ├── signout.test.ts            ← global/local/others scope
│   │   │   ├── events.test.ts             ← onAuthStateChange event flow
│   │   │   ├── password-reset.test.ts     ← resetPasswordForEmail flow
│   │   │   ├── otp.test.ts                ← verifyOtp types
│   │   │   ├── pkce.test.ts               ← PKCE challenge → exchange
│   │   │   ├── rate-limit.test.ts         ← Rate limit enforcement + lockout
│   │   │   └── admin/
│   │   │       ├── admin-users.test.ts    ← CRUD via admin API
│   │   │       └── admin-links.test.ts    ← generateLink variants
│   │   ├── storage/
│   │   │   ├── buckets/
│   │   │   │   ├── list.test.ts           ← listBuckets()
│   │   │   │   ├── get.test.ts            ← getBucket()
│   │   │   │   ├── create.test.ts         ← createBucket()
│   │   │   │   ├── update.test.ts         ← updateBucket()
│   │   │   │   ├── delete.test.ts         ← deleteBucket()
│   │   │   │   └── empty.test.ts          ← emptyBucket()
│   │   │   ├── objects/
│   │   │   │   ├── upload.test.ts         ← upload()
│   │   │   │   ├── update.test.ts         ← update()
│   │   │   │   ├── download.test.ts       ← download()
│   │   │   │   ├── remove.test.ts         ← remove()
│   │   │   │   ├── move.test.ts           ← move()
│   │   │   │   ├── copy.test.ts           ← copy()
│   │   │   │   ├── list.test.ts           ← list() offset pagination
│   │   │   │   ├── listV2.test.ts         ← listV2() cursor pagination
│   │   │   │   ├── exists.test.ts         ← exists() HEAD
│   │   │   │   └── info.test.ts           ← info()
│   │   │   ├── signed-urls/
│   │   │   │   ├── createSignedUrl.test.ts
│   │   │   │   ├── createSignedUrls.test.ts
│   │   │   │   ├── signedUrlAccess.test.ts
│   │   │   │   ├── createSignedUploadUrl.test.ts
│   │   │   │   └── uploadToSignedUrl.test.ts
│   │   │   └── access-control/
│   │   │       ├── public-bucket.test.ts
│   │   │       ├── private-bucket.test.ts
│   │   │       ├── owner-access.test.ts
│   │   │       └── service-role-access.test.ts
│   │   ├── prefer-headers.test.ts
│   │   └── error-codes.test.ts
│   │   ├── e2e/                               ← wrangler dev + supabase-js client
│   │   ├── setup.ts                       ← Spawn wrangler dev, create client
│   │   ├── crud.test.ts
│   │   ├── filters.test.ts
│   │   ├── auth.test.ts                   ← Phase 2: signUp, signIn, user, signOut
│   │   ├── admin-auth.test.ts             ← Phase 2: admin CRUD via service_role
│   │   ├── rls-auth.test.ts               ← Phase 2: RLS policies with auth.uid()
│   │   ├── storage.test.ts                ← Phase 3: full storage lifecycle
│   │   └── storage-access-control.test.ts ← Phase 3: public/private bucket auth
│   └── helpers/
│       ├── supabaseClient.ts              ← createClient(url, key)
│       ├── seed.ts                        ← Run SQL fixtures
│       ├── compare.ts                     ← Deep-compare actual vs expected
│       ├── authClient.ts                  ← createClient with auth config
│       ├── authSeed.ts                    ← Seed auth users in D1
│       ├── storageClient.ts               ← createClient with storage config
│       ├── testFiles.ts                   ← Generate test file blobs
│       └── compareStorage.ts              ← Compare storage responses
```

---

## Testing Strategy Summary

| Level | What | Where | Tooling |
|-------|------|-------|---------|
| **Unit** | Pure functions: parsers, formatters, mappers | `tests/supabase-compat/unit/` | Vitest (no worker pool needed) |
| **Integration** | Full request → D1 → response cycle | `tests/supabase-compat/integration/` | `@cloudflare/vitest-pool-workers` |
| **E2E** | Real `@supabase/supabase-js` client against live server | `tests/supabase-compat/e2e/` | `wrangler dev` + Node test runner |

**TDD flow for every feature:**
1. Write unit test for parser/translator → fail
2. Implement parser/translator → pass
3. Write integration test with supabase-js call → fail
4. Implement route handler → pass
5. Write e2e test against live dev server → fail
6. Wire everything together → pass

**Test data extraction:** Use Chrome DevTools (via `chrome-devtools` MCP) to extract SQL fixtures, example code, and expected responses from Supabase docs pages. See [DATA.md](./DATA.md) for extraction plan.
