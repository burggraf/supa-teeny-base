# Supa-Teenybase: Master Implementation Plan

## Vision

Supabase-compatible API layer on Teenybase. Frontend code using `@supabase/supabase-js` works unmodified against Cloudflare D1 + R2. Same code later points to hosted Supabase — zero frontend changes.

## Architecture

```
@supabase/supabase-js (unchanged frontend client)
         │
         │ HTTP: /rest/v1/*  /auth/v1/*  /storage/v1/*
         ▼
┌─────────────────────────────────────────┐
│  Supa-Teenybase Compatibility Layer     │
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
- Shared test helper: `createSupaTeenyClient()` returns configured `createClient('http://localhost:8787', anonKey)`
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

**See [AUTH.md](./AUTH.md)** — dedicated auth users table, JWT building, email flows, OAuth, PKCE, role injection into RLS.

Key compatibility requirements:
- `POST /auth/v1/signup` → create user in `supa_auth_users`, send JWT
- `POST /auth/v1/token` → password grant, refresh token, PKCE exchange
- `GET/PUT /auth/v1/user` → current user management
- JWT format matches Supabase: `HS256`, `aud` = role, `role` claim, `app_metadata`/`user_metadata`
- JWT secret configurable via `SUPA_TEENY_JWT_SECRET` env var

---

## Phase 3: Storage API

**See [STORAGE.md](./STORAGE.md)** — bucket/object CRUD on R2, signed URLs, public access.

Key compatibility requirements:
- `PUT /storage/v1/object/{bucket}/{path}` → upload to R2
- `GET /storage/v1/object/{bucket}/{path}` → download from R2
- `POST /storage/v1/object/sign/{bucket}/{path}` → JWT-signed temporary URL
- Bucket metadata in D1 `storage_buckets` table

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
│   │   │   ├── signup.ts
│   │   │   ├── token.ts                   ← password/refresh_token/pkce grants
│   │   │   ├── user.ts                    ← GET/PUT /user
│   │   │   ├── recover.ts                 ← password reset
│   │   │   ├── verify.ts                  ← email verification
│   │   │   ├── oauth.ts                   ← OAuth authorize/callback
│   │   │   ├── jwtBuilder.ts              ← Supabase-compatible JWT
│   │   │   └── pkce.ts                    ← PKCE verifier/challenge
│   │   ├── storage/
│   │   │   ├── router.ts                  ← /storage/v1/* dispatch
│   │   │   ├── buckets.ts                 ← bucket CRUD in D1
│   │   │   ├── upload.ts
│   │   │   ├── download.ts
│   │   │   ├── list.ts
│   │   │   ├── remove.ts
│   │   │   ├── move.ts
│   │   │   ├── copy.ts
│   │   │   └── signedUrl.ts               ← JWT temporary URLs
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
│   │   └── authContext.test.ts
│   ├── integration/                       ← D1-backed tests via vitest-pool-workers
│   │   ├── setup.ts                       ← Test Hono app with supabase compat
│   │   ├── fixtures/
│   │   │   ├── schemas/                   ← SQL seed scripts
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
│   │   ├── prefer-headers.test.ts
│   │   └── error-codes.test.ts
│   ├── e2e/                               ← wrangler dev + supabase-js client
│   │   ├── setup.ts                       ← Spawn wrangler dev, create client
│   │   ├── crud.test.ts
│   │   ├── filters.test.ts
│   │   ├── auth.test.ts                   ← Phase 2
│   │   └── storage.test.ts                ← Phase 3
│   └── helpers/
│       ├── supabaseClient.ts              ← createClient(url, key)
│       ├── seed.ts                        ← Run SQL fixtures
│       └── compare.ts                     ← Deep-compare actual vs expected
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
