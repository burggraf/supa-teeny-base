# Supaflare Test Catalog

SQLite-backed test catalog tracking **135 in-scope tests** across DATA, AUTH, and STORAGE categories. Each test tracks results against both **real Supabase** (reference) and **Supaflare** (our implementation).

## Quick Start

```bash
cd scripts/test-catalog
npm install

# Initialize and seed
node catalog.js init
node catalog.js seed

# View status
node catalog.js status
node catalog.js report
```

## Classification

```
Category     → DATA | AUTH | STORAGE
Subcategory  → crud | filters | modifiers | signup | signin | buckets | objects | ...
Operation    → eq | insert | upload | signup-email | create-bucket | ... (specific test)
```

Example: `DATA/filters/eq` = "Filter: column equals value (eq)"

## Result States

| State | Meaning |
|-------|---------|
| `pending` | Not yet run |
| `pass` | Passed |
| `fail` | Failed (response mismatch) |
| `error` | Error (crash, timeout, infra issue) |
| `skip` | Intentionally skipped for this run |
| `blocked` | Blocked by dependency (e.g. feature not implemented) |
| `not_applicable` | N/A for SQLite/Cloudflare Workers |

## Two-Target Tracking

Every test records results for **two targets**:

| Target | Purpose |
|--------|---------|
| `supabase` | Local dev Supabase (reference — validates the test itself) |
| `supaflare` | Our Cloudflare Workers implementation |

**Workflow:** Run against Supabase first → verify test is correct → run against Supaflare.

## CLI Commands

### Seed catalog
```bash
node catalog.js seed
```
Populates 135 tests from DATA.md, AUTH.md, STORAGE.md.

### View status
```bash
node catalog.js status                              # all tests, side-by-side
node catalog.js status --category DATA               # DATA only
node catalog.js status --category DATA --subcategory filters
node catalog.js status --id 13                       # single test
```

### List tests
```bash
node catalog.js list                                 # table format
node catalog.js list --format json                   # JSON
node catalog.js list --format csv                    # CSV
node catalog.js list --status pending                # filter by status
node catalog.js list --target supabase               # filter by target
```

### Record test run
```bash
# By ID
node catalog.js run --id 13 --target supabase --status pass

# By classification
node catalog.js run --category DATA --subcategory filters --operation eq \
  --target supaflare --status fail --error "eq filter returns wrong rows"

# With notes
node catalog.js run --id 1 --target supaflare --status pass \
  --duration-ms 42 --notes "Verified against characters fixture"
```

### Reports
```bash
node catalog.js report                               # text summary
node catalog.js report --format markdown             # markdown report
node catalog.js report --format json                 # JSON report
node catalog.js report --target supaflare            # Supaflare only
node catalog.js report --v1-scope all                # include skip_v1 tests
```

### Export
```bash
node catalog.js export --format markdown             # detailed markdown per test
node catalog.js export --format csv                  # CSV for spreadsheets
node catalog.js export --format json                 # full JSON dump
node catalog.js export --category DATA --format markdown > DATA-report.md
```

### Add/delete tests
```bash
node catalog.js add --category DATA --subcategory filters --operation eq \
  --title "Filter: column equals value" --source-url "https://..." \
  --test-code "supabase.from('t').select().eq('x','y')"

node catalog.js delete --id 99
```

## Test Per Test Fields

| Field | Description |
|-------|-------------|
| `category` | DATA, AUTH, or STORAGE |
| `subcategory` | Group: crud, filters, modifiers, signup, buckets, objects, etc. |
| `operation` | Specific operation: eq, insert, upload, etc. |
| `title` | Human-readable description |
| `description` | What this test verifies |
| `source_url` | Supabase docs URL |
| `priority` | P0 (must-have) → P3 (nice-to-have) |
| `v1_scope` | in_scope, skip_v1, or v2 |
| `test_code` | supabase-js call template |
| `data_source` | SQL fixture (DDL + DML) |
| `expected_response` | Expected JSON response |
| `test_procedure` | Step-by-step procedure (if differs from default) |

## Run Record Fields

| Field | Description |
|-------|-------------|
| `test_id` | FK to test_catalog |
| `target` | supabase or supaflare |
| `status` | pending, pass, fail, error, skip, blocked, not_applicable |
| `run_at` | ISO timestamp |
| `duration_ms` | Execution time |
| `error_output` | Failure details |
| `notes` | Run-specific notes |

## Database Schema

See `schema.sql`. Main tables:
- `test_catalog` — test definitions (135 rows after seed)
- `test_runs` — execution results (upsert per test_id + target)
- `test_procedures` — shared procedure templates (optional)

## Integration with Test Runner

Future: wire `catalog.js run` into test runner CI so results auto-populate:

```bash
# After running tests:
node catalog.js run --id $TEST_ID --target supaflare \
  --status $RESULT --duration-ms $DURATION \
  ${FAILED:+--error "$ERROR_OUTPUT"}
```
