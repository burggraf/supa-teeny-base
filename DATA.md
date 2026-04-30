# DATA.md: Supabase.js Data API — Implementation Status

## Current State

**Tests:** 127 passing, 1 skipped (128 total)
**Location:** `packages/teenybase/test/worker/supabase/`
**Approach:** Unit + Integration via `@cloudflare/vitest-pool-workers` + `SELF.fetch()`
**E2E:** Not yet built

---

## Implementation Status by Sub-Phase

### Phase 0: Foundation ✅

| Item | Status | Notes |
|---|---|---|
| Extension routing (`$DBExtension`) | ✅ | Registers `/rest/v1/:table` routes |
| Shared types | ✅ | `SupabaseRole`, `PostgrestRequest`, `SupabaseError`, `FilterExpr` |
| Error code mapping | ✅ | 8 codes: PGRST200/100/301/305, 23505, PGRST204/116/000 |
| Config resolution | ✅ | Reads `SUPAFLARE_*` env vars, provides defaults |

**Tradeoff:** Tests live in `packages/teenybase/test/worker/supabase/` (inside teenybase package) instead of separate `tests/supabase-compat/` directory. This gives direct access to Teenybase internals but means tests are tightly coupled to the teenybase monorepo.

### Phase 1A: Request Parsing ✅

| Item | Status | Tests | Notes |
|---|---|---|---|
| URL query param parsing | ✅ | 27 | `select`, `limit`, `offset`, `order`, `on_conflict`, `resolution` |
| Filter param parsing | ✅ | 27 | `column.op=value` → `{column, operator, value}` |
| Type coercion | ✅ | 8 | `null`→null, `true`/`false`→bool, digits→number |
| Prefer header parsing | ✅ | 15 | `return=`, `count=`, `resolution=`, `handling=` |
| Auth context extraction | ✅ | 11 | apikey header → role, Bearer JWT → payload decode |

**Tradeoff:** JWT decoding uses raw base64 without signature validation. Full validation deferred to Phase 2 (auth module).

### Phase 1B: SELECT ✅

| Item | Status | Tests | Notes |
|---|---|---|---|
| Basic SELECT (`select=*`) | ✅ | — | Returns all columns |
| Column selection (`select=id,name`) | ✅ | 1 | Returns specific columns |
| Nested FK joins (`select=id,countries(name)`) | ✅ | 0 | Code exists, no integration test. Requires FK-configured test tables. |
| Limit + Offset | ✅ | 2 | `limit=10`, `offset=20` |
| Order (asc/desc) | ✅ | 2 | `-column` for desc via Teenybase `parseColumnList` |
| Order (nullsfirst/nullslast) | ⚠️ | 0 | Parsed but not passed through to Teenybase |
| single() | ✅ | 1 | `single=true` query param → object response, 406 if 0 rows |
| maybeSingle() | ✅ | 1 | `maybeSingle=true` → null for 0 rows, 400 if >1 |

**Tradeoff:** `single()` and `maybeSingle()` use query params (`?single=true`) rather than PostgREST header approach. Works but differs from real Supabase API.

### Phase 1C: Filter Operators

| Operator | Status | Notes |
|---|---|---|
| `eq` | ✅ | jsep `==` (handles NULL correctly) |
| `neq` | ✅ | jsep `!=` |
| `gt`, `gte`, `lt`, `lte` | ✅ | Direct SQLite comparison |
| `like` | ✅ | jsep `~` (LIKE) |
| `ilike` | ✅ | `LOWER(col) ~ LOWER(val)` |
| `is` (null/true/false) | ✅ | `col == null` / `col == true` / `col == false` |
| `in` | ✅ | OR chain: `(col == a) | (col == b)` |
| `match` | ✅ | Expands to AND of eq expressions |
| `not` | ⚠️ | Parser exists, no test coverage |
| `or` | ⚠️ | `buildOrExpression()` exists but **not wired** into request parser. `or=()` syntax from URL not parsed. |
| `contains` (cs) | ⚠️ | Partial — uses `%pattern%` LIKE matching on JSON text, not `json_each` |
| `containedBy` (cd) | ⚠️ | Same as contains |
| `overlaps` (ov) | ⚠️ | Same as contains |
| `textSearch` | ❌ | Not implemented |
| `range*` operators | ❌ | Skipped — no SQLite range types |
| `imatch` (regex) | ❌ | Skipped — no POSIX regex in SQLite |

### Phase 1D: Mutations ✅

| Item | Status | Tests | Notes |
|---|---|---|---|
| INSERT (single row) | ✅ | 1 | Returns inserted row |
| INSERT (bulk) | ✅ | 1 | Array body |
| UPDATE (filtered) | ✅ | 2 | Requires at least one filter (safety) |
| DELETE (filtered) | ✅ | 2 | Requires at least one filter (safety) |
| UPSERT (`on_conflict`) | ✅ | 0 | Implemented, no test coverage |
| UPSERT resolution (merge/ignore) | ✅ | 0 | `IGNORE`/`REPLACE` mapped |
| `Prefer: return=minimal` (204) | ✅ | 1 | Returns empty body |
| `Prefer: return=representation` | ✅ | — | Default — returns rows |

### Phase 1E: Response Formatting ✅

| Item | Status | Notes |
|---|---|---|
| JSON response | ✅ | `application/json; charset=utf-8` |
| CSV output | ✅ | `Accept: text/csv` → RFC 4180 CSV with proper escaping |
| HTTP status codes | ✅ | 200 (GET/PATCH/DELETE), 201 (POST), 204 (minimal) |
| Content-Range header | ✅ | `Prefer: count=exact` → `0-N/total` |
| Content-Range (planned/estimated) | ❌ | Falls back to exact count |

### Phase 1F: RLS (Row-Level Security) ✅ Core, ⚠️ Partial

| Item | Status | Notes |
|---|---|---|
| `rls_policies` D1 table | ✅ | Created at test seed time. Schema: `id, table_name, name, role, operation, using_expr, with_check_expr, permissive` |
| Policy lookup | ✅ | `loadPolicies(db, tableName)` → filters by table |
| PERMISSIVE combination (OR) | ✅ | Multiple permissive policies joined with `\|` |
| RESTRICTIVE combination (AND) | ✅ | Multiple restrictive policies joined with `&` |
| Mixed PERMISSIVE + RESTRICTIVE | ✅ | `(PERM) & (REST)` |
| `service_role` bypass | ✅ | Returns null (no RLS filter) |
| `auth.uid()` replacement | ✅ | Replaced with actual uid string |
| `auth.role()` replacement | ✅ | Replaced with role string |
| `auth.email()` replacement | ✅ | Replaced with email string |
| `auth.jwt()` replacement | ✅ | Replaced with JSON object literal |
| Column qualification | ✅ | `user_id` → `todos.user_id` |
| RLS injection into SELECT | ✅ | User WHERE & RLS WHERE combined |
| RLS injection into UPDATE | ✅ | Same pattern |
| RLS injection into DELETE | ✅ | Same pattern |
| RLS injection into INSERT | ⚠️ | Policies loaded but not enforced. WITH CHECK not applied to inserted rows. |
| WITH CHECK for INSERT/UPDATE | ❌ | Deferred — no pre-insert validation |
| `CREATE POLICY` SQL parsing | ❌ | Not implemented. Policies must be inserted directly into D1. |
| RLS on nested FK joins | ❌ | Only top-level table policies are applied. Subqueries don't inherit RLS. |
| Admin API for policy CRUD | ❌ | No REST endpoint. Use direct D1 access. |

**Tradeoff:** Auth functions (`auth.uid()`, etc.) are string-replaced in policy expressions before jsep parsing. This works but doesn't integrate with Teenybase's jsep function registry. If a policy expression references `auth.uid()` as a column name (unlikely), it would be incorrectly replaced.

**Tradeoff:** `qualifyColumns()` qualifies ALL bare identifiers. This means policy expressions like `user_id == auth.uid()` become `todos.user_id == 'user-123'` — correct for simple cases but breaks if the expression uses a subquery or function that references another table.

### Phase 1G: Modifiers

| Item | Status | Notes |
|---|---|---|
| Order (asc/desc) | ✅ | `-column` syntax |
| Limit | ✅ | `limit=N` |
| Offset | ✅ | `offset=N` |
| Schema switching | ❌ | Not implemented |
| `stripNulls()` | ❌ | Client-side per PostgREST 11.2+ |
| `explain` | ❌ | Not implemented |

---

## Deferred / Skipped for v1

| Feature | Reason |
|---|---|
| Range operators (`rangeGt`, etc.) | No SQLite range types |
| `imatch` (regex) | No POSIX regex in SQLite |
| `textSearch` (FTS5) | Requires FTS5 index setup, different syntax from Postgres tsvector |
| RPC (`supabase.rpc()`) | Teenybase `/action/{name}` maps conceptually but interface differs |
| `count=planned/estimated` | No SQLite query planner stats |
| `overrideTypes` / `returns<T>` | Client-side only |
| `abortSignal` / timeout | Client-side only |
| Realtime / WebSockets | Out of scope (Phase 2+) |
| E2E tests (`wrangler dev` + supabase-js) | Infrastructure needed |

---

## Known Gaps vs DATA.md Original Plan

| Planned in DATA.md | Reality |
|---|---|
| `tests/supabase-compat/unit/`, `integration/`, `e2e/` dirs | All tests in `packages/teenybase/test/worker/supabase/` |
| SQL fixtures in `fixtures/schemas/*.sql` used by seed | Fixtures created but unused — test harness seeds D1 programmatically |
| Expected responses in `fixtures/responses/` | Not created — no extracted JSON fixtures |
| `createSupaflareClient()` used in tests | Helper exists but unused — tests use `SELF.fetch()` directly |
| `compare.ts` deep-compare utility | Exists but unused |
| Per-feature test files (`crud/select.test.ts`, `filters/comparisons.test.ts`) | Monolithic `routing.test.ts` (36 tests in one file) |
| RLS integration test (`rls/policies.test.ts`) | Unit test only (`rlsCompiler.test.ts`), no integration test |
| `auth-functions.test.ts` | Not created |
| 3-level testing (unit → integration → E2E) | Only unit + integration. No E2E layer. |

---

## Test Infrastructure

### What We Have
- **Vitest pool-workers** config with D1/R2 bindings
- **In-process Hono app** via `SELF.fetch()` (no live server needed)
- **Programmatic D1 seeding** via `db.exec()` in setup.ts
- **Unit tests** for pure functions (parsers, mappers, compilers) — no D1, no worker pool

### What We Lack
- **E2E tests** — `wrangler dev` live server + real `@supabase/supabase-js` client
- **Supabase reference tests** — running same tests against real Supabase for comparison
- **Test catalog integration** — `catalog.js run` not called after test execution
- **Fixture extraction** — Supabase docs → test fixtures pipeline exists but unused

### HEAD Count Endpoint
- Skipped in tests. `t.selectCount({})` fails in Teenybase (needs valid `where` clause). Workaround: pass `{ select: '*' }` but this may still fail.

---

## SQLite Compatibility Matrix (Final)

| PostgREST Feature | SQLite Support | Implementation |
|---|---|---|
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | ✅ Native | jsep expressions → SQLite |
| `like` | ✅ Native | jsep `~` operator |
| `ilike` | ⚠️ Via LOWER | `LOWER(col) ~ LOWER(val)` |
| `is` (NULL/bool) | ✅ Native | `col == null` / `col == true` |
| `in` | ✅ Native | OR chain of equality |
| `contains` (array) | ⚠️ LIKE pattern | `%value%` on JSON text |
| `containedBy` | ⚠️ LIKE pattern | Same |
| `overlaps` | ⚠️ LIKE pattern | Same |
| `range*` | ❌ No range types | Skip v1 |
| `textSearch` | ⚠️ FTS5 | Not implemented |
| `match` | ✅ Multi-eq AND | Expands to AND chain |
| `imatch` | ❌ No POSIX regex | Skip v1 |
| `csv()` | ✅ | Manual CSV builder |
| `single()` | ✅ Row count | `single=true` query param |
| `maybeSingle()` | ✅ Row count | `maybeSingle=true` query param |
| `count=exact` | ✅ COUNT(*) | `table.select(params, true)` |
| `count=planned` | ❌ No planner stats | Skip |
| `count=estimated` | ❌ No planner stats | Skip |
