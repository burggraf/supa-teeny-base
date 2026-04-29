# DATA.md: Test Suite Plan for Supabase.js Data API Compatibility

## Goal

Build a complete integration test suite that verifies our PostgREST compatibility layer produces responses identical to real Supabase. Each test uses:
- **SQL setup** — DDL/DML from Supabase docs examples
- **supabase-js call** — exact code from Supabase docs
- **expected response** — exact JSON response from Supabase docs

## Approach: Extract Tests from Supabase Docs

The Supabase docs pages contain **interactive tabbed examples** with three components per example:
1. **Example code** — `supabase.from('table').select()...` 
2. **Data source** — SQL `CREATE TABLE` + `INSERT` statements
3. **Response** — expected `{ data, status, statusText }` JSON

We use **Chrome DevTools** (via `chrome-devtools` MCP server) to programmatically:
1. Navigate to each docs page
2. Click every tab in each example section
3. Click "Data source" and "Response" expandable panels
4. Extract SQL, code, and response JSON
5. Generate test fixtures from the extracted data

This is better than manual copy-paste because:
- Hundreds of examples across ~40 pages
- Tabs change with Supabase docs updates
- Automated extraction stays current

### Extraction Script Approach

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

### CRUD Operations (6 pages)
| # | Page | Tab Count | Priority |
|---|------|-----------|----------|
| 1 | `https://supabase.com/docs/reference/javascript/select` | 12 tabs (fetch data) + 44 sections | **P0** |
| 2 | `https://supabase.com/docs/reference/javascript/insert` | Same page, 3 tabs (insert data) | **P0** |
| 3 | `https://supabase.com/docs/reference/javascript/update` | Same page, 3 tabs (update data) | **P0** |
| 4 | `https://supabase.com/docs/reference/javascript/upsert` | Same page, 5 tabs (upsert data) | **P0** |
| 5 | `https://supabase.com/docs/reference/javascript/delete` | Same page, 3 tabs (delete data) | **P0** |
| 6 | `https://supabase.com/docs/reference/javascript/rpc` | Same page, 6 tabs (Call a Postgres function) | P1 |

> Note: All 6 CRUD pages are on the **same URL** (`/javascript/select`). Each method is an h2 section with tabs.

### Filters (23 pages)
| # | URL | Tab Count | Notes |
|---|-----|-----------|-------|
| 7 | `/javascript/using-filters` | 5 tabs | Filter overview |
| 8 | `/javascript/eq` | 1 tab | `eq(column, value)` |
| 9 | `/javascript/neq` | 1 tab | `neq(column, value)` |
| 10 | `/javascript/gt` | 1 tab + Notes | `gt(column, value)` |
| 11 | `/javascript/gte` | 1 tab | `gte(column, value)` |
| 12 | `/javascript/lt` | 1 tab | `lt(column, value)` |
| 13 | `/javascript/lte` | 1 tab | `lte(column, value)` |
| 14 | `/javascript/like` | 1 tab | `like(column, pattern)` |
| 15 | `/javascript/ilike` | 1 tab | `ilike(column, pattern)` |
| 16 | `/javascript/is` | 1 tab + Notes | `is(column, value)` — NULL/bool |
| 17 | `/javascript/in` | 1 tab | `in(column, values)` |
| 18 | `/javascript/contains` | 3 tabs | array, range, jsonb |
| 19 | `/javascript/containedby` | 3 tabs | array, range, jsonb |
| 20 | `/javascript/rangegt` | 1 tab + Notes | `rangeGt` — range cols only |
| 21 | `/javascript/rangegte` | 1 tab + Notes | `rangeGte` — range cols only |
| 22 | `/javascript/rangelt` | 1 tab + Notes | `rangeLt` — range cols only |
| 23 | `/javascript/rangelte` | 1 tab + Notes | `rangeLte` — range cols only |
| 24 | `/javascript/rangeadjacent` | 1 tab + Notes | `rangeAdjacent` — range cols only |
| 25 | `/javascript/overlaps` | 2 tabs | array, range |
| 26 | `/javascript/textsearch` | 4 tabs | text search variants |
| 27 | `/javascript/match` | 1 tab | `match({col: val, ...})` |
| 28 | `/javascript/not` | 1 tab | `not(column, op, value)` |
| 29 | `/javascript/or` | 3 tabs | `or()`, `or+and`, referenced tables |
| 30 | `/javascript/filter` | 2 tabs | `filter(col, op, val)` |

### Modifiers (13 pages)
| # | URL | Tab Count | Notes |
|---|-----|-----------|-------|
| 31 | `/javascript/db-modifiers-select` | Same as `/select` page | Return data after mutation |
| 32 | `/javascript/order` | 3 tabs | order, referenced table, parent order |
| 33 | `/javascript/limit` | 2 tabs | limit, referenced table |
| 34 | `/javascript/range` | 1 tab | range(from, to) |
| 35 | `/javascript/db-abortsignal` | 2 tabs | abort, timeout |
| 36 | `/javascript/single` | 1 tab | single() — error if ≠1 row |
| 37 | `/javascript/maybesingle` | 1 tab | maybeSingle() — null if 0 rows |
| 38 | `/javascript/db-csv` | 1 tab + Notes | csv() output |
| 39 | `/javascript/db-strip-nulls` | 1 tab | stripNulls() |
| 40 | `/javascript/db-returns` | 2 tabs | returns<T>() — deprecated |
| 41 | `/javascript/db-overrideTypes` | 6 tabs | overrideTypes with merge/full |
| 42 | `/javascript/explain` | 2 tabs + Notes | EXPLAIN plan |

## Test Database Schema

Based on extracted SQL data sources, the following tables are needed for test fixtures:

### Core Tables
```sql
-- characters table (used by most filter examples)
CREATE TABLE characters (id int8 PRIMARY KEY, name text);
INSERT INTO characters (id, name) VALUES (1, 'Luke'), (2, 'Leia'), (3, 'Han');

-- countries table (insert/delete/is examples)
CREATE TABLE countries (id int8 PRIMARY KEY, name text);

-- instruments table (update examples)
CREATE TABLE instruments (id int8 PRIMARY KEY, name text);
INSERT INTO instruments (id, name) VALUES (1, 'harpsichord');

-- users table (upsert examples)
CREATE TABLE users (id int8 PRIMARY KEY, username text UNIQUE, message text);

-- issues table (contains/overlaps with array columns)
CREATE TABLE issues (id int8 PRIMARY KEY, title text, tags text[]);

-- classes table (containedBy with array columns)
CREATE TABLE classes (id int8 PRIMARY KEY, name text, days text[]);

-- reservations table (range operator examples)
CREATE TABLE reservations (id int8 PRIMARY KEY, during tsrange);

-- texts table (full-text search examples)
CREATE TABLE texts (id int8 PRIMARY KEY, content text);

-- cities/countries (join examples)
CREATE TABLE countries (id int8 PRIMARY KEY, name text);
CREATE TABLE cities (id int8 PRIMARY KEY, name text, country_id int8 REFERENCES countries(id));
```

### SQLite-Compatible Translations
Since we target D1 (SQLite), some types need translation:
- `int8` → `INTEGER`
- `text[]` → `TEXT` (stored as JSON array)
- `tsrange` → `TEXT` (stored as `'[start, end)'`)
- `tsvector` → `TEXT` + FTS5 virtual table
- `jsonb` → `TEXT` (stored as JSON string, queried via `json_extract`)

## Test Structure

```
tests/
├── fixtures/
│   ├── schemas/           # SQL setup scripts per table
│   │   ├── characters.sql
│   │   ├── countries.sql
│   │   ├── instruments.sql
│   │   ├── users.sql
│   │   ├── issues.sql
│   │   ├── classes.sql
│   │   ├── reservations.sql
│   │   └── texts.sql
│   └── responses/         # Expected responses per test
│       ├── select/
│       ├── insert/
│       ├── update/
│       ├── upsert/
│       ├── delete/
│       ├── filters/
│       └── modifiers/
├── integration/
│   ├── select.test.ts     # Fetch data tests
│   ├── insert.test.ts     # Insert tests
│   ├── update.test.ts     # Update tests
│   ├── upsert.test.ts     # Upsert tests
│   ├── delete.test.ts     # Delete tests
│   ├── rpc.test.ts        # RPC tests (if implemented)
│   ├── filters/
│   │   ├── eq.test.ts
│   │   ├── neq.test.ts
│   │   ├── gt.test.ts
│   │   ├── ... (one per filter)
│   └── modifiers/
│       ├── order.test.ts
│       ├── limit.test.ts
│       ├── single.test.ts
│       └── ... (one per modifier)
└── helpers/
    ├── supabaseClient.ts  # Creates supabase client pointing to our layer
    ├── seedDatabase.ts    # Runs SQL fixtures
    └── compareResponse.ts # Compares actual vs expected response
```

## Test Pattern

Each test follows this pattern:

```typescript
// Example: eq filter test
describe('eq(column, value)', () => {
  beforeAll(async () => {
    await seedDatabase('characters');  // runs characters.sql
  });

  it('matches rows where column equals value', async () => {
    const { data, error } = await supabase
      .from('characters')
      .select()
      .eq('name', 'Leia');
    
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: 2, name: 'Leia' }
    ]);
  });
});
```

## Implementation Phases

### Phase 1: URL Catalog & Extraction (this task)
- [x] Catalog all URLs with tab counts
- [x] Identify test database schema from extracted SQL
- [ ] Write extraction script to pull all data source SQL + responses
- [ ] Generate test fixture files from extracted data

### Phase 2: Core CRUD Tests
- [ ] select.test.ts (all 12 select tabs)
- [ ] insert.test.ts (all 3 insert tabs)
- [ ] update.test.ts (all 3 update tabs)
- [ ] upsert.test.ts (all 5 upsert tabs)
- [ ] delete.test.ts (all 3 delete tabs)

### Phase 3: Filter Tests
- [ ] eq, neq, gt, gte, lt, lte (6 basic comparisons)
- [ ] like, ilike (2 pattern matching)
- [ ] is (NULL/bool)
- [ ] in (array inclusion)
- [ ] contains, containedBy (array/jsonb/range — may skip range for SQLite)
- [ ] rangeGt, rangeGte, rangeLt, rangeLte, rangeAdjacent (5 range ops — **SKIP for v1**, SQLite lacks native range types)
- [ ] overlaps (array — **SKIP for v1**, SQLite lacks native arrays)
- [ ] textSearch (FTS — **partial**, SQLite FTS5 vs Postgres tsvector)
- [ ] match (multi-eq shorthand)
- [ ] not (negation)
- [ ] or (OR logic)
- [ ] filter (raw PostgREST syntax escape hatch)

### Phase 4: Modifier Tests
- [ ] select after mutation (return=representation)
- [ ] order (asc/desc/nullsfirst/nullslast)
- [ ] limit
- [ ] range (offset pagination)
- [ ] single / maybeSingle
- [ ] csv
- [ ] stripNulls (PostgREST 11.2+ — may skip)
- [ ] overrideTypes (client-only, no server change needed)
- [ ] explain (PostgREST-specific — may skip)

### Phase 5: Edge Cases & Prefer Headers
- [ ] Prefer: return=representation vs return=minimal
- [ ] Prefer: count=exact / count=planned / count=estimated
- [ ] Prefer: tx=rollback
- [ ] Prefer: resolution=merge-duplicates (upsert)
- [ ] on_conflict parameter
- [ ] columns parameter (limit inserted columns)
- [ ] Schema switching (`.schema('other')`)
- [ ] Nested resource embedding (FK joins)
- [ ] Head requests (count without data)

## SQLite Compatibility Matrix

| PostgREST Feature | SQLite Support | Action |
|---|---|---|
| `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | ✅ Native | Direct support |
| `like` | ✅ Native | Direct support |
| `ilike` | ⚠️ Via `LIKE COLLATE NOCASE` | Translate |
| `is` (NULL) | ✅ Native | Direct support |
| `in` | ✅ Native | Direct support |
| `contains` (array) | ⚠️ Via JSON emulation | Emulate or skip |
| `contains` (jsonb) | ⚠️ Via `json_extract` | Emulate |
| `containedBy` (array) | ⚠️ Via JSON emulation | Emulate or skip |
| `containedBy` (jsonb) | ⚠️ Via `json_extract` | Emulate |
| `range*` operators | ❌ No range types | **Skip v1** |
| `overlaps` (array) | ⚠️ Via JSON | Emulate or skip |
| `overlaps` (range) | ❌ No range types | **Skip v1** |
| `textSearch` (fts) | ⚠️ SQLite FTS5 | Partial support |
| `match` / `imatch` (regex) | ❌ No POSIX regex | **Skip v1** |
| `csv()` output | ✅ | Direct support |
| `stripNulls()` | ⚠️ PostgREST 11.2+ | May skip |
| `explain` | ✅ SQLite EXPLAIN | Direct support |
| `single()` / `maybeSingle()` | ✅ Validate row count | Direct support |

## Extraction Script

The extraction script (to be written in a subagent task) will:

1. **Navigate** to each URL via Chrome DevTools
2. **Discover** all h2 headings and their tabs
3. **For each tab**: click it, wait for render
4. **Click** "Data source" button, extract SQL
5. **Click** "Response" button, extract JSON
6. **Also capture** the example code (always visible)
7. **Save** as structured JSON fixtures:
   ```json
   {
     "page": "select",
     "section": "Column is equal to a value",
     "tab": "With `select()`",
     "code": "supabase.from('characters').select().eq('name', 'Leia')",
     "sql": "CREATE TABLE characters (...); INSERT INTO ...",
     "response": { "data": [...], "status": 200 }
   }
   ```

## Notes

- **RPC**: May not implement in v1. Teenybase has `/action/{name}` which maps conceptually but the interface differs.
- **Range operators**: SQLite has no native range types. PostgREST uses `int4range`, `tsrange`, etc. These are **v2 or skip**.
- **Array operators**: SQLite has no native arrays. We store as JSON text. `contains`/`containedBy`/`overlaps` need JSON-based emulation.
- **Full-text search**: Postgres uses `tsvector`/`tsquery`. SQLite uses FTS5 virtual tables. Different syntax, different stemmers. We can support basic text search but not exact Postgres compatibility.
- **`stripNulls()`**: Requires PostgREST 11.2+. May skip if Teenybase's PostgREST compatibility layer doesn't support it.
- **`explain()`**: Requires `db_plan_enabled` setting in Supabase. For our layer, we can use SQLite's `EXPLAIN QUERY PLAN`.
- **Auth/Storage/Realtime/Edge Functions**: Not in scope for DATA.md. Covered by AUTH.md, STORAGE.md, and out of scope.
