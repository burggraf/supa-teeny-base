# Supa-Teenybase: Master Plan

## Vision

Build a Supabase-compatible API layer on top of Teenybase, so that frontend code written against `@supabase/supabase-js` works unmodified against a Cloudflare D1 + R2 backend. The end goal: develop locally and deploy to Cloudflare Workers using the same infra as Teenybase, with a path to migrate to real Supabase later.

## Architecture

```
@supabase/supabase-js (unchanged frontend client)
         │
         │ HTTP calls to Supabase-compatible endpoints
         ▼
┌─────────────────────────────────────────┐
│  Supa-Teenybase Compatibility Layer     │
│  (new)                                  │
│  ┌───────────┬──────────┬────────────┐  │
│  │ PostgREST │ GoTrue   │ Storage    │  │
│  │ Translator│ Adapter  │ Adapter    │  │
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

## Phase Plans

| Phase | Plan File | Scope | Est. Effort |
|-------|-----------|-------|-------------|
| 1 | [DATA.md](./DATA.md) | PostgREST + RLS policies + auth functions | 4-5 weeks |
| 2 | [AUTH.md](./AUTH.md) | GoTrue Auth + roles + JWT injection | 2-3 weeks |
| 3 | [STORAGE.md](./STORAGE.md) | Supabase Storage REST API | 1-2 weeks |

**Total v1 estimate (no realtime, no S3-compat): 7-11 weeks.**

*RLS adds ~1-1.5 weeks to Phase 1. Roles/JWT injection adds ~2-3 days to Phase 2 (partially covered by Teenybase auth).*

## Out of Scope (v1)

- Realtime / WebSockets / Postgres change streams
- S3-compatible storage endpoint
- Edge Functions (supabase.functions)
- MFA, SSO/SAML
- Admin API (auth.admin.*) — can add later
- Data migration SQLite → Postgres

## Key Design Decisions

### A. Translation Layer, Not Fork

Add a supabase-compatibility layer as a new set of route handlers that sit alongside Teenybase's existing `/api/v1/` routes. This layer:
- Parses PostgREST HTTP format (query params, headers)
- Translates to Teenybase's internal query format
- Reshapes responses to match Supabase/PostgREST conventions
- Falls through to Teenybase's existing auth, SQL execution, R2 storage

### B. Route Coexistence

Both URL schemes coexist:
- `/api/v1/table/{table}/select` — Teenybase native (unchanged)
- `/rest/v1/{table}` — PostgREST-compatible (new)
- `/auth/v1/*` — GoTrue-compatible (new)
- `/storage/v1/object/*` — Storage-compatible (new)

### C. One Dedicated Auth Table

Unlike Teenybase's per-table auth extension, the Supabase layer uses a single dedicated `auth.users` table (like GoTrue). This matches Supabase's mental model and makes JWT claim mapping straightforward. The Teenybase auth extension can still exist for native-mode users.

### D. RLS: Supabase-Compatible Row-Level Security

Policies stored in D1 `rls_policies` table, parsed from `CREATE POLICY` SQL or JSON format. At query time:
1. Determine role (anon/authenticated/service_role) from JWT or apikey header
2. Collect applicable policies for the table + operation
3. Combine USING expressions (OR for PERMISSIVE, AND for RESTRICTIVE)
4. Inject as WHERE clause via Teenybase's existing rule compilation
5. `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` resolved from AuthContext via jsep function mapping
6. `service_role` bypasses all policies entirely

See [DATA.md → RLS section](./DATA.md#rls-supabase-compatible-row-level-security) and [AUTH.md → Roles section](./AUTH.md#roles--jwt-injection-how-auth-feeds-into-rls).

### E. SQLite-Compatible SQL Translation

All PostgREST operators get translated to SQLite-compatible SQL. Known gaps:
- `ILIKE` → `LIKE ... COLLATE NOCASE`
- Array operators (`cs`, `cd`, `ov`) → JSON-based emulation or skip
- Full-text search → SQLite FTS5 (different syntax)
- JSONB operators → SQLite `json_extract()`

## File Structure (planned)

```
packages/teenybase/src/
├── worker/
│   ├── supabase/                    ← NEW: compatibility layer
│   │   ├── index.ts                 ← Entry point, registers all routes
│   │   ├── postgrest/
│   │   │   ├── router.ts            ← POST/GET/PATCH/DELETE route handlers
│   │   │   ├── queryParser.ts       ← URL params → jsep expression
│   │   │   ├── operators.ts         ← eq, neq, gt, lt, like, ilike, in, etc.
│   │   │   ├── selectParser.ts      ← select=id,name,posts(title) → subqueries
│   │   │   ├── preferHeader.ts      ← Prefer: return=representation, count=exact
│   │   │   └── responseFormatter.ts ← JSON array + Content-Range header
│   │   ├── auth/
│   │   │   ├── router.ts            ← /auth/v1/* route handlers
│   │   │   ├── signup.ts
│   │   │   ├── token.ts             ← grant_type: password, refresh_token, pkce
│   │   │   ├── user.ts              ← GET/PUT /auth/v1/user
│   │   │   ├── recover.ts           ← password reset
│   │   │   ├── verify.ts            ← email verification
│   │   │   ├── oauth.ts             ← OAuth authorize/callback
│   │   │   ├── jwtBuilder.ts        ← Supabase-compatible JWT claims
│   │   │   └── pkce.ts              ← PKCE code verifier/challenge
│   │   ├── storage/
│   │   │   ├── router.ts            ← /storage/v1/object/* handlers
│   │   │   ├── buckets.ts           ← bucket CRUD in D1
│   │   │   ├── upload.ts
│   │   │   ├── download.ts
│   │   │   ├── list.ts
│   │   │   ├── remove.ts
│   │   │   ├── move.ts
│   │   │   ├── copy.ts
│   │   │   └── signedUrl.ts         ← JWT-signed temporary URLs
│   │   └── shared/
│   │       ├── types.ts             ← Shared type definitions
│   │       ├── config.ts            ← Supabase-compat mode config
│   │       └── authContext.ts       ← AuthContext extraction from JWT
│   │   ├── rls/
│   │       ├── policyStore.ts       ← D1 CRUD for rls_policies table
│   │       ├── policyParser.ts      ← CREATE POLICY SQL parser
│   │       ├── policyCompiler.ts    ← Compile policies → WHERE clauses
│   │       └── authFunctions.ts     ← auth.uid(), auth.role(), auth.jwt() jsep funcs
```

## Testing Strategy

- Integration tests using the real `@supabase/supabase-js` client
- Each phase has its own test suite
- Mock R2 + D1 for local testing (same pattern Teenybase uses)
- Compatibility matrix: test against supabase-js v2.x

## Migration Path to Real Supabase

Not in scope for v1, but design considerations:
- Use standard column names where possible
- Avoid SQLite-specific features that have no Postgres equivalent
- Store timestamps as ISO-8601 strings (compatible with both)
- FK relationships stored as text/UUID (not SQLite rowids)
- JWT secrets and algorithm should match Supabase defaults (HS256)
