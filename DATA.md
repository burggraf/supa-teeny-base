# DATA.md: Test Suite Plan for Supabase.js Data API Compatibility

## Goal

Verify PostgREST compatibility layer produces responses matching real Supabase. Every feature tested at 3 levels:
- **Unit** — pure functions (parsers, formatters, mappers), no D1
- **Integration** — real D1 via `@cloudflare/vitest-pool-workers`, supabase-js client against test Hono app
- **E2E** — `wrangler dev` live server + `@supabase/supabase-js` client in Node

Each test uses:
- **SQL setup** — DDL/DML from Supabase docs examples
- **supabase-js call** — exact code from Supabase docs
- **expected response** — exact JSON response from Supabase docs

## Approach: Extract Tests from Supabase Docs

Supabase docs pages have **interactive tabbed examples** with:
1. **Example code** — `supabase.from('table').select()...`
2. **Data source** — SQL `CREATE TABLE` + `INSERT` statements
3. **Response** — expected `{ data, status, statusText }` JSON

Use **Chrome DevTools** (via `chrome-devtools` MCP) to programmatically extract all three. Better than manual copy-paste: hundreds of examples across ~40 pages, tabs change with docs updates.

### Extraction Script

```js
// For each page:
// 1. Navigate to URL
// 2. Find all h2 headings (each = a method/filter/modifier)
// 3. For each heading, find all [role="tab"] elements
// 4. Click each tab, then click "Data source" and "Response" buttons
// 5. Extract content from [data-state="open"] panels
// 6. Save as structured test fixtures
```

## URLs to Process (Catalog)

### CRUD Operations (all on same URL)
| # | Page | Tab Count | Priority |
|---|------|-----------|----------|
| 1 | `https://supabase.com/docs/reference/javascript/select` | 12 tabs + 44 sections | **P0** |
| 2 | `insert` | Same page, 3 tabs | **P0** |
| 3 | `update` | Same page, 3 tabs | **P0** |
| 4 | `upsert` | Same page, 5 tabs | **P0** |
| 5 | `delete` | Same page, 3 tabs | **P0** |
| 6 | `rpc` | Same page, 6 tabs | P1 |

### Filters (23 pages)
| # | URL suffix | Tabs | Notes |
|---|-----------|------|-------|
| 7 | `/javascript/using-filters` | 5 | Overview |
| 8 | `/javascript/eq` | 1 | `eq(column, value)` |
| 9 | `/javascript/neq` | 1 | `neq(column, value)` |
| 10 | `/javascript/gt` | 1+Notes | `gt(column, value)` |
| 11 | `/javascript/gte` | 1 | `gte(column, value)` |
| 12 | `/javascript/lt` | 1 | `lt(column, value)` |
| 13 | `/javascript/lte` | 1 | `lte(column, value)` |
| 14 | `/javascript/like` | 1 | `like(column, pattern)` |
| 15 | `/javascript/ilike` | 1 | `ilike(column, pattern)` |
| 16 | `/javascript/is` | 1+Notes | NULL/bool |
| 17 | `/javascript/in` | 1 | array inclusion |
| 18 | `/javascript/contains` | 3 | array, range, jsonb |
| 19 | `/javascript/containedby` | 3 | array, range, jsonb |
| 20–24 | `/javascript/range{gt,gte,lt,lte,adjacent}` | 1 each | **SKIP v1** |
| 25 | `/javascript/overlaps` | 2 | array, range |
| 26 | `/javascript/textsearch` | 4 | FTS variants |
| 27 | `/javascript/match` | 1 | multi-eq shorthand |
| 28 | `/javascript/not` | 1 | negation |
| 29 | `/javascript/or` | 3 | or, or+and, referenced |
| 30 | `/javascript/filter` | 2 | raw PostgREST escape |

### Modifiers (13 pages)
| # | URL suffix | Tabs | Notes |
|---|-----------|------|-------|
| 31 | `/javascript/db-modifiers-select` | — | Return data after mutation |
| 32 | `/javascript/order` | 3 | asc/desc/nullsfirst/nullslast |
| 33 | `/javascript/limit` | 2 | limit, referenced table |
| 34 | `/javascript/range` | 1 | range(from, to) |
| 35 | `/javascript/db-abortsignal` | 2 | abort, timeout |
| 36 | `/javascript/single` | 1 | error if ≠1 row |
| 37 | `/javascript/maybesingle` | 1 | null if 0 rows |
| 38 | `/javascript/db-csv` | 1+Notes | csv() output |
| 39 | `/javascript/db-strip-nulls` | 1 | PostgREST 11.2+ |
| 40 | `/javascript/db-returns` | 2 | deprecated |
| 41 | `/javascript/db-overrideTypes` | 6 | client-only |
| 42 | `/javascript/explain` | 2+Notes | EXPLAIN plan |

## Test Database Schema

### Core Tables (Postgres syntax → SQLite translations)
```sql
-- characters (most filter examples)
CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO characters VALUES (1, 'Luke'), (2, 'Leia'), (3, 'Han');

-- countries (insert/delete/is, join with cities)
CREATE TABLE countries (id INTEGER PRIMARY KEY, name TEXT);

-- cities (FK join examples)
CREATE TABLE cities (id INTEGER PRIMARY KEY, name TEXT, country_id INTEGER REFERENCES countries(id));

-- instruments (update examples)
CREATE TABLE instruments (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO instruments VALUES (1, 'harpsichord');

-- users (upsert examples)
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, message TEXT);

-- issues (array columns → stored as JSON)
CREATE TABLE issues (id INTEGER PRIMARY KEY, title TEXT, tags TEXT);
-- tags stored as JSON: '["bug","urgent"]'

-- classes (array columns → stored as JSON)
CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT, days TEXT);

-- reservations (range → **SKIP v1**, table exists but range ops not implemented)
CREATE TABLE reservations (id INTEGER PRIMARY KEY, during TEXT);

-- texts (FTS5)
CREATE TABLE texts (id INTEGER PRIMARY KEY, content TEXT);
CREATE VIRTUAL TABLE texts_fts USING fts5(content, content_rowid=id);
```

## Test Directory Structure

```
tests/supabase-compat/
├── unit/                              ← Pure functions, no D1, no worker
│   ├── queryParser.test.ts            ← URL params → internal AST
│   ├── operators.test.ts              ← eq/neq/gt/... → jsep expressions
│   ├── selectParser.test.ts           ← select=col,rel(col) parsing
│   ├── preferHeader.test.ts           ← Prefer header parsing
│   ├── responseFormatter.test.ts      ← JSON/CSV output, Content-Range
│   ├── errorMapper.test.ts            ← Teenybase errors → Supabase codes
│   ├── policyParser.test.ts           ← CREATE POLICY → internal format
│   └── authContext.test.ts            ← Header → SupabaseAuthContext
│
├── integration/                       ← D1-backed via vitest-pool-workers
│   ├── setup.ts                       ← Test Hono app with supabase compat
│   ├── fixtures/
│   │   ├── schemas/                   ← SQL seed scripts (from extraction)
│   │   │   ├── characters.sql
│   │   │   ├── countries.sql
│   │   │   ├── cities.sql
│   │   │   ├── instruments.sql
│   │   │   ├── users.sql
│   │   │   ├── issues.sql
│   │   │   ├── classes.sql
│   │   │   └── texts.sql
│   │   └── responses/                 ← Expected JSON (from extraction)
│   │       ├── select/
│   │       ├── insert/
│   │       ├── update/
│   │       ├── upsert/
│   │       ├── delete/
│   │       ├── filters/
│   │       └── modifiers/
│   ├── crud/
│   │   ├── select.test.ts             ← All select scenarios from docs
│   │   ├── insert.test.ts             ← Single, bulk, columns param
│   │   ├── update.test.ts             ← Filtered update
│   │   ├── upsert.test.ts             ← Merge, ignore, on_conflict
│   │   └── delete.test.ts             ← Filtered delete
│   ├── filters/
│   │   ├── comparisons.test.ts        ← eq/neq/gt/gte/lt/lte
│   │   ├── pattern.test.ts            ← like/ilike
│   │   ├── null-bool.test.ts          ← is (NULL, true, false)
│   │   ├── array-json.test.ts         ← contains/containedBy/overlaps (JSON)
│   │   ├── logical.test.ts            ← not, or, and
│   │   ├── match.test.ts              ← match multi-eq
│   │   └── textsearch.test.ts         ← FTS5 basic search
│   ├── modifiers/
│   │   ├── order.test.ts              ← asc/desc/nullsfirst/nullslast
│   │   ├── pagination.test.ts         ← limit, offset, range
│   │   ├── single.test.ts             ← single(), maybeSingle()
│   │   └── csv.test.ts                ← Accept: text/csv
│   ├── rls/
│   │   ├── policies.test.ts           ← CRUD + injection
│   │   └── auth-functions.test.ts     ← auth.uid(), auth.role(), etc.
│   ├── prefer-headers.test.ts         ← return, count, resolution
│   └── error-codes.test.ts            ← Verify error shape + codes
│
├── e2e/                               ← wrangler dev + real supabase-js
│   ├── setup.ts                       ← Spawn dev server, create client
│   ├── crud.test.ts                   ← Full CRUD via supabase.from()
│   ├── filters.test.ts                ← All filters via supabase client
│   ├── auth.test.ts                   ← Phase 2: signUp, signIn, user
│   └── storage.test.ts                ← Phase 3: upload, download, list
│
└── helpers/
    ├── supabaseClient.ts              ← createClient('http://localhost:8787', key)
    ├── seed.ts                        ← Run SQL fixtures against D1
    └── compare.ts                     ← Deep-compare actual vs expected
```

## Test Pattern

### Unit Test
```typescript
// Unit: pure function, no D1
import { parseQueryParams } from './queryParser';

describe('parseQueryParams', () => {
  it('parses filter params into filter expressions', () => {
    const params = new URLSearchParams('name.eq=Luke&age.gt=18');
    const result = parseQueryParams(params);
    expect(result.filters).toEqual([
      { column: 'name', operator: 'eq', value: 'Luke' },
      { column: 'age', operator: 'gt', value: '18' },
    ]);
  });
});
```

### Integration Test
```typescript
// Integration: real D1 via vitest-pool-workers
import { describe, it, beforeAll } from 'vitest';
import { createSupaTeenyClient } from '../helpers/supabaseClient';
import { seed } from '../helpers/seed';

describe('eq(column, value)', () => {
  beforeAll(async () => { await seed('characters'); });

  it('matches rows where column equals value', async () => {
    const { data, error } = await supabase
      .from('characters')
      .select()
      .eq('name', 'Leia');

    expect(error).toBeNull();
    expect(data).toEqual([{ id: 2, name: 'Leia' }]);
  });
});
```

### E2E Test
```typescript
// E2E: wrangler dev + real @supabase/supabase-js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:8787', ANON_KEY);

describe('E2E: CRUD via supabase-js', () => {
  it('inserts and selects a row', async () => {
    const { data: inserted } = await supabase
      .from('countries')
      .insert({ name: 'Naboo' })
      .select()
      .single();

    expect(inserted.name).toBe('Naboo');

    const { data: found } = await supabase
      .from('countries')
      .select()
      .eq('name', 'Naboo')
      .single();

    expect(found.id).toBe(inserted.id);
  });
});
```

## Implementation-Test Phase Mapping

Each implementation sub-phase ships with its tests. TDD flow:
1. Write unit test → fail → implement → pass
2. Write integration test → fail → implement handler → pass
3. Write e2e test → fail → wire together → pass

| Impl Phase | Tests |
|------------|-------|
| **0.1** Routing integration | Integration — route dispatch, 404 fallback |
| **0.2** Shared types | Unit — type validation (zod schemas if used) |
| **0.3** Test infra | Helpers: `createSupaTeenyClient()`, `seed()`, `compare()` |
| **0.4** Error mapping | Unit: `errorMapper.test.ts`. Integration: `error-codes.test.ts` |
| **1A** Routing + parsing | Unit: `queryParser`, `operators`, `preferHeader`, `authContext` |
| **1B** SELECT | Integration: `crud/select.test.ts`, `modifiers/*.test.ts` |
| **1C** Filters | Integration: `filters/*.test.ts` |
| **1D** Mutations | Integration: `crud/{insert,update,upsert,delete}.test.ts` |
| **1E** Response formatting | Unit: `responseFormatter`. Integration: `prefer-headers`, `csv` |
| **1F** RLS | Integration: `rls/policies.test.ts`, `rls/auth-functions.test.ts` |
| **1G** Modifiers | Integration: `modifiers/*.test.ts` |

## Test Fixture Extraction

Extract from Supabase docs via Chrome DevTools:

1. **Navigate** to each URL
2. **Discover** all h2 headings and their tabs
3. **For each tab**: click it, wait for render
4. **Click** "Data source" button → extract SQL
5. **Click** "Response" button → extract JSON
6. **Capture** example code (always visible)
7. **Save** as structured JSON:
   ```json
   {
     "page": "select",
     "section": "Column is equal to a value",
     "tab": "With select()",
     "code": "supabase.from('characters').select().eq('name', 'Leia')",
     "sql": "CREATE TABLE characters (...); INSERT INTO ...",
     "response": { "data": [...], "status": 200 }
   }
   ```

## SQLite Compatibility Matrix

| PostgREST Feature | SQLite Support | Action |
|---|---|---|
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | ✅ Native | Direct |
| `like` | ✅ Native | Direct |
| `ilike` | ⚠️ Via `LIKE COLLATE NOCASE` | Translate |
| `is` (NULL) | ✅ Native | Direct |
| `in` | ✅ Native | Direct |
| `contains` (array) | ⚠️ JSON emulation | Emulate via `json_each` |
| `contains` (jsonb) | ⚠️ Via `json_extract` | Emulate |
| `containedBy` (array) | ⚠️ JSON emulation | Emulate or skip |
| `containedBy` (jsonb) | ⚠️ Via `json_extract` | Emulate |
| `range*` operators | ❌ No range types | **Skip v1**, test error response |
| `overlaps` (array) | ⚠️ Via JSON | Emulate or skip |
| `overlaps` (range) | ❌ No range types | **Skip v1** |
| `textSearch` | ⚠️ SQLite FTS5 | Partial (basic terms) |
| `match` / `imatch` (regex) | ❌ No POSIX regex | **Skip v1**, test error response |
| `csv()` | ✅ | Direct |
| `stripNulls()` | ⚠️ PostgREST 11.2+ | Skip (client handles) |
| `explain` | ✅ `EXPLAIN QUERY PLAN` | Direct |
| `single()` / `maybeSingle()` | ✅ Row count check | Direct |
| `count=exact` | ✅ `COUNT(*)` | Direct |
| `count=planned/estimated` | ❌ No planner stats | Fall back to exact |

## Notes

- **RPC**: Teenybase `/action/{name}` maps conceptually but interface differs. **v2 or skip.**
- **Range operators**: SQLite no native range types. **v2 or skip.**
- **Array operators**: Store as JSON text. `contains`/`containedBy`/`overlaps` need JSON emulation.
- **Full-text search**: Postgres `tsvector` vs SQLite FTS5. Different syntax/stemmers. Basic only.
- **`stripNulls()`**: PostgREST 11.2+. Skip if not needed.
- **`explain()`**: SQLite `EXPLAIN QUERY PLAN` — usable but different format.
- **`overrideTypes`**, **`returns<T>`**: Client-side only. No server changes needed.
- **`abortSignal`**: Client-side timeout. Server: standard Hono request lifecycle.
- **Auth/Storage/Realtime/Edge Functions**: Not in DATA.md. Covered by AUTH.md, STORAGE.md, out of scope.