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

## Testing Rules

- **TDD always.** Unit → Integration → E2E, in that order.
- **Unit:** pure functions, no D1. Fast feedback.
- **Integration:** `@cloudflare/vitest-pool-workers`, real D1, supabase-js client.
- **E2E:** `wrangler dev` live server + supabase-js in Node process.
- **Test fixtures** extracted from Supabase docs (see DATA.md extraction plan).

## Design Principles

1. **Translation, not fork.** Parse PostgREST → Teenybase internal → reshape response.
2. **Supabase-compatible, not identical.** SQLite has gaps (no range types, no regex). Return error with hint for unsupported features.
3. **Forward-compatible.** UUIDs as text, ISO timestamps, standard JWT claims. Migrate to hosted Supabase by changing the client URL.
4. **service_role bypasses RLS.** Matches Supabase behavior.
5. **Prefer headers control response.** `return=representation|minimal`, `count=exact|planned|estimated`.

## Error Mapping

Map Teenybase errors to Supabase error codes (see PLAN.md Phase 0.4). Response shape: `{ message, code, details, hint }`.

## Skip List (v1)

- Range operators (no SQLite range types)
- Regex matching `imatch` (no POSIX regex)
- Realtime/WebSockets
- S3-compatible storage endpoint
- Edge Functions
- MFA, SSO/SAML
- Admin API
