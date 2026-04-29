# Phase 1: PostgREST Data API Compatibility

## Goal

Translate PostgREST HTTP protocol (URLs, query params, headers, response format) into Teenybase's internal query format so that `supabase.from('table').select().eq('id', 1)` works against the D1 backend without modifying the frontend client.

## What PostgREST Looks Like

```
GET  /rest/v1/posts?select=id,title&published=eq.true&order=created.desc&limit=10
POST /rest/v1/posts                    → insert (JSON body)
PATCH /rest/v1/posts?id=eq.1           → update (JSON body)
DELETE /rest/v1/posts?id=eq.1          → delete
Headers: Prefer: return=representation, Prefer: count=exact
Response: JSON array at top level + Content-Range header
```

## What Teenybase Looks Like

```
POST /api/v1/table/posts/select        → {where: "published == true", select: "id,title", order: "-created", limit: 10}
POST /api/v1/table/posts/insert        → {values: {...}, returning: "*"}
POST /api/v1/table/posts/update        → {where: "id == '1'", setValues: {...}, returning: "*"}
POST /api/v1/table/posts/delete        → {where: "id == '1'", returning: "*"}
Response: JSON array or {items, total}
```

## Tasks

### 1.1 Route Registration
- Register `/rest/v1/{table}` routes on the Hono app
- Map HTTP methods: `GET` → select, `POST` → insert, `PATCH` → update, `DELETE` → delete
- Parse table name from URL path segment
- Pass through existing auth middleware

**Output:** Routes that intercept PostgREST URLs and dispatch to internal handlers.
**Difficulty:** Easy
**Effort:** 2-3 days

### 1.2 Query Parameter Parser (`queryParser.ts`)
Convert PostgREST filter syntax to Teenybase jsep expressions:

| PostgREST | Teenybase jsep |
|---|---|
| `name=eq.John` | `name == 'John'` |
| `age=gt.18` | `age > 18` |
| `title=ilike.%hello%` | `title ~* '%hello%'` (→ `LIKE ... COLLATE NOCASE`) |
| `status=in.(active,pending)` | `status == 'active' | status == 'pending'` |
| `email=is.null` | `email == null` |
| `name=not.eq.John` | `name != 'John'` |

**Sub-tasks:**
- Parse `column=operator.value` format (value may contain dots, need right-split on operator)
- Handle all operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `match`, `imatch`, `in`, `is`, `isdistinct`, `fts`, `plfts`, `phfts`, `wfts`
- Handle negation: `not.{op}.value`
- Combine multiple filters with AND (implicit `&` between params)
- Handle `?and=(...)` and `?or=(...)` logical groups
- Handle JSON column access: `metadata->>key=eq.value`

**Output:** `parseQueryParams(params: URLSearchParams) → { where: string, ... }`
**Difficulty:** Hard (operator count + edge cases)
**Effort:** 1-2 weeks

**Gotchas:**
- Values can contain dots: `url=eq.http://example.com` — must parse from the right
- `or()` and `and()` use parenthesized comma-separated syntax that needs recursive parsing
- `in()` uses parens with comma-separated values that may contain special chars
- FTS operators (`fts`, `plfts`, etc.) map to SQLite FTS5 differently
- `match`/`imatch` use POSIX regex — SQLite uses different regex engine or none (may need to skip)

### 1.3 Select Column Parser (`selectParser.ts`)
Convert PostgREST column selection to Teenybase format:

| PostgREST | Teenybase |
|---|---|
| `select=id,title` | `select: "id,title"` |
| `select=id,title,created` | `select: "id,title,created"` |
| `select=title,author(name,email)` | subquery via FK join |

**Sub-tasks:**
- Parse comma-separated column list (easy — already supported)
- Parse nested resource embedding: `author(name,email)` → FK join subquery
- Handle `*` wildcard
- Handle computed columns / aggregates

**Output:** `parseSelect(select: string) → { selects: string[], joins: ... }`
**Difficulty:** Medium
**Effort:** 3-4 days

**Gotchas:**
- Nested joins require FK metadata from Teenybase config
- PostgREST supports renaming: `author:owner_id(name)` — Teenybase may not support this syntax
- Array of relations vs single relation (1:N vs N:1)

### 1.4 Operator Mapping (`operators.ts`)
Map each PostgREST operator to SQL that works on SQLite:

| Operator | PostgreSQL (PostgREST) | SQLite (ours) |
|---|---|---|
| `eq` | `= ` | `= ` |
| `neq` | `<>` | `<>` |
| `gt` | `>` | `>` |
| `gte` | `>=` | `>=` |
| `lt` | `<` | `<` |
| `lte` | `<=` | `<=` |
| `like` | `LIKE` | `LIKE` |
| `ilike` | `ILIKE` | `LIKE ... COLLATE NOCASE` |
| `match` | `~` (POSIX regex) | *skip or use custom UDF* |
| `imatch` | `~*` (case-insensitive regex) | *skip or use custom UDF* |
| `in` | `IN (...)` | `IN (...)` |
| `is` | `IS` (for null/bool) | `IS` |
| `contains` (cs) | `@>` (array/jsonb) | `json_each` emulation |
| `contained` (cd) | `<@` (array/jsonb) | `json_each` emulation |
| `overlap` (ov) | `&&` (array/range) | *skip* |

**Sub-tasks:**
- Implement all basic comparison operators (easy)
- Implement `ilike` via `COLLATE NOCASE`
- Decide on array/JSONB operators: either implement via JSON functions, or throw "not supported" error
- Implement FTS operators via SQLite FTS5 `MATCH`

**Output:** Operator function map: `Record<string, (col, val) => SQLQuery>`
**Difficulty:** Medium
**Effort:** 3-4 days

### 1.5 Order/Pagination Parser
Convert PostgREST ordering and pagination:

| PostgREST | Teenybase |
|---|---|
| `order=id.desc,name.asc.nullslast` | `order: ["-id", "+name"]` |
| `limit=10` | `limit: 10` |
| `offset=20` | `offset: 20` |

**Sub-tasks:**
- Parse `column.direction.nullsfirst/nullslast` format
- Convert `desc` → `-`, `asc` → `+` prefix
- Handle multiple sort columns (comma-separated)
- `nullslast`/`nullsfirst` → SQLite `IS NULL` ordering trick (may skip for v1, most queries don't need it)
- Pass through limit/offset as-is

**Output:** `parseOrder(order: string) → string[]`
**Difficulty:** Easy
**Effort:** 1 day

### 1.6 Prefer Header Handler (`preferHeader.ts`)
Parse and act on HTTP `Prefer` headers:

| Header | Behavior |
|---|---|
| `Prefer: return=representation` | Return inserted/updated/deleted rows (→ Teenybase `returning: "*"`) |
| `Prefer: return=minimal` | Return 204 No Content (→ Teenybase no returning) |
| `Prefer: count=exact` | Return exact count in `Content-Range` header |
| `Prefer: tx=rollback` | Rollback on error (Teenybase default) |
| `Prefer: resolution=merge-duplicates` | Upsert behavior |

**Output:** `parsePreferHeader(headers: Headers) → { returnMode, countMode, resolution }`
**Difficulty:** Easy
**Effort:** 1 day

### 1.7 Response Formatter (`responseFormatter.ts`)
Format responses to match PostgREST:

- **Top-level JSON array** (not wrapped in `{items, total}`)
- **Content-Range header**: `0-9/42` (start-end/total) when count requested
- **Status codes**: 200 OK for select, 201 Created for insert, 204 No Content for minimal return
- **Error format**: PostgREST uses `{message, code, details, hint}` — map Teenybase errors to this

**Sub-tasks:**
- Transform Teenybase `{items, total}` → bare array + Content-Range header
- Set correct HTTP status codes per operation type
- Map Teenybase error format to PostgREST error format
- Handle `single()` and `maybeSingle()` cases (supabase-js expects single object or null, not array)

**Output:** `formatResponse(data, opts) → Response`
**Difficulty:** Easy-Medium
**Effort:** 2-3 days

**Gotchas:**
- `Content-Range` format is specific: `items start-end/total` — must be exact or supabase-js fails to parse count
- `single()` expects exactly 1 row; `maybeSingle()` expects 0 or 1 — need to validate and error appropriately

### 1.8 INSERT Handling
- Parse POST body as insert values
- Support `?columns=col1,col2` to limit which columns are inserted
- Map `Prefer: return=representation` → Teenybase `returning: "*"`
- Map `Prefer: resolution=merge-duplicates` or `?on_conflict=id` → Teenybase `or: "REPLACE"`
- Handle batch inserts (array body)

**Difficulty:** Easy-Medium
**Effort:** 1-2 days

### 1.9 UPDATE Handling
- Parse PATCH body as update values
- Parse filter from query params (same as SELECT)
- Handle `set` vs `setValues` (SQL expressions vs literal values)
- Map to Teenybase `rawUpdate`

**Difficulty:** Easy-Medium
**Effort:** 1-2 days

### 1.10 DELETE Handling
- Parse filter from query params
- Map `Prefer: return=representation` → return deleted rows
- Map to Teenybase `rawDelete`

**Difficulty:** Easy
**Effort:** 1 day

### 1.11 RPC → Actions Mapping
- Map `POST /rest/v1/rpc/{function_name}` → Teenybase `/action/{name}`
- Pass body as action params
- Return results in PostgREST format

**Difficulty:** Easy
**Effort:** 2-3 days

## Testing

- Unit tests for each parser (queryParser, selectParser, operators, etc.)
- Integration tests using real `@supabase/supabase-js` client:
  ```js
  const { data } = await supabase.from('posts').select().eq('published', true)
  const { data } = await supabase.from('posts').insert({ title: 'Hello' })
  const { data } = await supabase.from('posts').update({ title: 'Bye' }).eq('id', 1)
  const { data } = await supabase.from('posts').delete().eq('id', 1)
  const { data } = await supabase.from('posts').select('*,author(name)').eq('id', 1)
  const { data, count } = await supabase.from('posts').select('*', { count: 'exact' })
  ```

## RLS: Supabase-Compatible Row Level Security

This section covers all four related concerns: RLS policies, JWT injection, auth functions in SQL, and roles. RLS is the intersection of Data and Auth.

### How Supabase RLS Works

Supabase uses PostgreSQL row-level security. Policies are SQL statements stored in Postgres system catalogs:

```sql
CREATE POLICY "Users can view own posts"
ON public.posts
FOR SELECT
USING (auth.uid() = author_id);

CREATE POLICY "Users can insert own posts"
ON public.posts
FOR INSERT
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own posts"
ON public.posts
FOR UPDATE
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);
```

Each policy has:
- **Table** it applies to
- **Operation**: SELECT, INSERT, UPDATE, DELETE, or ALL
- **USING expression**: WHERE clause for SELECT/UPDATE/DELETE — determines which existing rows are visible
- **WITH CHECK expression**: WHERE clause for INSERT/UPDATE — determines what new values are allowed
- **Permissive/Restrictive**: PERMISSIVE (any policy grants access, default) or RESTRICTIVE (all policies must pass)

At query time, Postgres:
1. Determines the current role from the JWT (`auth.role()`)
2. Collects all applicable policies for the operation
3. Combines USING clauses (OR for PERMISSIVE, AND for RESTRICTIVE)
4. Injects the combined expression as a WHERE clause on the query
5. For INSERT/UPDATE, also checks WITH CHECK before allowing the mutation

### R.1 — Policy Storage Schema

Store policies in D1 tables mirroring Supabase's `pg_policies` structure:

```sql
CREATE TABLE rls_policies (
    id TEXT PRIMARY KEY,
    tablename TEXT NOT NULL,
    policyname TEXT NOT NULL,
    permissive TEXT NOT NULL DEFAULT 'PERMISSIVE',
    roles TEXT NOT NULL,              -- JSON array: ["authenticated", "anon"]
    cmd TEXT NOT NULL,                -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'
    qual TEXT,                        -- USING expression (SQL/jsep)
    with_check TEXT                   -- WITH CHECK expression (SQL/jsep)
);
```

**CREATE POLICY parser**: Accept `CREATE POLICY` SQL statements, parse them, and store in `rls_policies`. Can also accept a simplified JSON format:

```json
{
  "name": "users_view_own",
  "table": "posts",
  "operation": "SELECT",
  "roles": ["authenticated"],
  "using": "auth.uid() == author_id"
}
```

**Difficulty:** Medium
**Effort:** 3-4 days

### R.2 — Role System (anon / authenticated / service_role)

Supabase has three roles determined by the JWT's `role` claim:

| Role | How obtained | RLS behavior |
|---|---|---|
| `anon` | No JWT or valid anon JWT | Only PERMISSIVE policies with `anon` role apply |
| `authenticated` | Valid user JWT with `role: "authenticated"` | Only policies with `authenticated` role apply |
| `service_role` | Service role key (not a user JWT) | Bypasses ALL RLS policies |

**Implementation:**
- Map to Teenybase's existing `AuthContext`:
  - No token → `{ role: 'anon', uid: null, admin: false }`
  - User JWT → `{ role: 'authenticated', uid: '<sub>', admin: false }`
  - Service role key → `{ role: 'service_role', uid: null, admin: true }`
- The `admin` flag in Teenybase already maps to `service_role` bypass behavior
- Store role in the jsep globals so policy expressions can reference it

**Difficulty:** Easy
**Effort:** 1 day

### R.3 — JWT Injection into Policy Evaluation

Supabase injects JWT claims into policy evaluation via SQL functions. The jsep globals context must contain:

```typescript
interface AuthContext {
  uid: string | null;        // from JWT.sub
  role: string;              // from JWT.role
  email: string | null;      // from JWT.email
  jwt: Record<string, any>;  // full decoded JWT payload
  claims: Record<string, any>; // same as jwt for convenience
}
```

At query time:
1. Extract JWT from `Authorization: Bearer <token>` header (or cookie)
2. Decode and validate JWT using project's JWT secret
3. Build `AuthContext` from claims
4. Pass `AuthContext` into jsep globals as `auth.*`
5. Policy expressions resolve `auth.uid()`, `auth.role()`, etc. to concrete values

This mirrors Teenybase's existing `JsepGlobals.auth` structure — just needs field name alignment with Supabase's conventions.

**Difficulty:** Easy (Teenybase already does most of this)
**Effort:** 1-2 days

### R.4 — Auth Functions in SQL Expressions

Supabase exposes these functions usable inside policy expressions (and general SQL):

| Function | Returns | Example |
|---|---|---|
| `auth.uid()` | UUID (text) | `auth.uid() = author_id` |
| `auth.role()` | text | `auth.role() = 'authenticated'` |
| `auth.email()` | text | `auth.email() = email` |
| `auth.jwt()` | jsonb | `auth.jwt()->>'app_metadata'` |
| `auth.jwt()->>'key'` | text | arbitrary JWT claim access |
| `request.jwt.claim('key')` | text | alternative claim access |

**Implementation in jsep parser:**

Register these as built-in functions in `functionMapping`:

```typescript
const authFunctions = {
  'auth.uid': () => ({ q: '?', p: { _auth_uid: globals.auth?.uid ?? null } }),
  'auth.role': () => ({ q: '?', p: { _auth_role: globals.auth?.role ?? 'anon' } }),
  'auth.email': () => ({ q: '?', p: { _auth_email: globals.auth?.email ?? null } }),
  'auth.jwt': () => ({ q: '?', p: { _auth_jwt: JSON.stringify(globals.auth?.jwt ?? {}) } }),
}
```

For `auth.jwt()->>'key'`, handle the `->>` operator (already in jsep) to extract JSON keys.

**SQLite note**: `auth.jwt()` returns a JSON string (not JSONB). The `->>` operator already maps to `json_extract()` in Teenybase's SQL builder. This works.

**Difficulty:** Medium
**Effort:** 2-3 days

**Gotchas:**
- `auth.jwt()` returns JSONB in Postgres, but JSON string in SQLite. Most policy expressions use `->>` to extract string values, which maps cleanly to `json_extract()`.
- `request.jwt.claim('key')` is a Postgres function — can alias to same implementation as `auth.jwt()->>'key'`
- Some Supabase policies use `auth.jwt()` with deep nesting: `auth.jwt()->'app_metadata'->>'provider'`. The jsep `->` operator chain handles this.

### R.5 — Policy Compilation Engine

At query time, compile applicable policies into WHERE clauses:

**Algorithm:**
```
1. Determine current role (anon/authenticated/service_role)
2. If service_role → skip policy compilation (bypass all)
3. Query rls_policies WHERE tablename = ? AND (cmd = ? OR cmd = 'ALL')
4. Filter policies WHERE current role IN roles array
5. Separate PERMISSIVE vs RESTRICTIVE policies
6. For SELECT/UPDATE/DELETE:
   a. Collect all USING expressions
   b. Combine PERMISSIVE USING clauses with OR
   c. Combine RESTRICTIVE USING clauses with AND
   d. Combine (PERMISSIVE_OR) AND (RESTRICTIVE_AND) → final WHERE
7. For INSERT:
   a. Collect all WITH CHECK expressions
   b. Same OR/AND combination logic
8. Inject compiled WHERE into the query
```

**Example:**
```sql
-- Policies on posts table:
-- P1: FOR SELECT USING (auth.uid() = author_id)       — permissive, authenticated
-- P2: FOR SELECT USING (published = true)              — permissive, anon + authenticated
-- P3: FOR SELECT USING (auth.role() = 'authenticated') — restrictive, authenticated

-- For authenticated user:
-- PERMISSIVE OR: (auth.uid() = author_id) OR (published = true)
-- RESTRICTIVE AND: (auth.role() = 'authenticated')
-- Final WHERE: ((auth.uid() = author_id) OR (published = true)) AND (auth.role() = 'authenticated')

-- For anon user:
-- PERMISSIVE: (published = true)
-- No RESTRICTIVE policies
-- Final WHERE: (published = true)
```

This maps directly to Teenybase's existing rule compilation system — the `tableRulesExtension` already combines rule expressions into WHERE clauses. The difference is:
- Teenybase: rules are defined in config file as string expressions per operation
- Supabase: policies are stored in a table with SQL-like expressions, supporting multiple policies per operation with PERMISSIVE/RESTRICTIVE logic

**Approach**: Extend the existing rule compilation to also read from `rls_policies` table, or create a parallel policy compilation layer that produces the same WHERE clause format.

**Difficulty:** Medium-Hard
**Effort:** 1 week

**Gotchas:**
- Policy expression syntax: Supabase uses Postgres SQL in policies (`auth.uid() = author_id`). We need to either parse this directly or accept jsep-compatible syntax. **Recommendation**: Accept both — parse Postgres-style `=` as jsep `==`, and handle `auth.*` function calls.
- `CREATE POLICY` DDL parsing: Users will write standard Supabase migration files with `CREATE POLICY` statements. Need a SQL parser that extracts policy components. Can be a simple regex-based parser since the syntax is constrained.
- Default-deny: Supabase RLS is deny-by-default when no policies match. Need to ensure our compiled WHERE clause returns zero rows when no policies grant access.
- `FOR ALL` policies apply to all operations — need to expand to each operation type.
- Role wildcard: `public` role in Supabase means all roles. Map to `["anon", "authenticated"]`.

### R.6 — Policy Management API

Endpoints to manage policies (for admin UI and programmatic access):

```
GET    /rest/v1/rls_policies          → list all policies
POST   /rest/v1/rls_policies          → create policy
PUT    /rest/v1/rls_policies/{id}     → update policy
DELETE /rest/v1/rls_policies/{id}     → delete policy
```

Also support raw `CREATE POLICY` / `DROP POLICY` SQL via the standard PostgREST RPC mechanism or a dedicated migration endpoint.

**Difficulty:** Easy
**Effort:** 1-2 days

---

## Phase 1 Dependencies

- Teenybase core (existing): SQL builder, D1 adapter, jsep parser, table extensions, rule compilation
- Phase 2 (Auth): JWT decoding, auth context — can be built in parallel with mock auth
- RLS policy tables and compilation engine

## Phase 1 Deliverables

1. `/rest/v1/{table}` routes working with GET/POST/PATCH/DELETE
2. All major PostgREST operators supported
3. Response format matches PostgREST (bare array + Content-Range)
4. Nested resource embedding (FK joins) working
5. RLS policies compatible with Supabase CREATE POLICY syntax
6. `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` available in policy expressions
7. Role-based access control (anon / authenticated / service_role)
8. Integration test suite passing against supabase-js client
