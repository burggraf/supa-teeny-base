# Supaflare Test Catalog

SQLite-backed test catalog tracking **230 in-scope tests** across DATA, AUTH, and STORAGE categories.
Extracted automatically from Supabase docs — every tab on every page creates a catalog entry.

## Quick Start

```bash
cd scripts/test-catalog
npm install

# Extract from live docs (creates catalog from every tab on the Supabase JS reference page)
node extract.js

# View status
node catalog.js status
node catalog.js report
```

## How It Works

### Automated Extraction (`extract.js`)

Visits the Supabase JavaScript reference mega-page, finds every h2 section heading and every tab
within each section, then creates a catalog entry for each tab. Sections are mapped to categories:

| Section | Category | Subcategory |
|---------|----------|-------------|
| Fetch data | DATA | select |
| Insert/Update/Upsert/Delete | DATA | crud |
| Using filters, eq, neq, gt, ... | DATA | filters |
| Return data after inserting, Order, Limit, ... | DATA | modifiers |
| Create a new user, Sign in, Verify OTP, ... | AUTH | signup, signin, otp, ... |
| Auth Admin subsections | AUTH | admin |
| List/Retrieve/Create/Update/Delete buckets | STORAGE | buckets |
| Upload/Download/Move/Copy/Remove/Info/List | STORAGE | objects |
| Signed URL operations | STORAGE | signed-urls |

Sections not in the map are skipped (Installing, TypeScript, etc.).
Sections for range operators, RPC, MFA, passkey, OAuth server, realtime, edge functions → `skip_v1`.

### CLI Commands (`catalog.js`)

```bash
# Extract from docs (auto-populates catalog)
node extract.js                    # all categories
node extract.js --category DATA    # DATA only
node extract.js --dry-run          # preview without inserting

# View status (side-by-side supabase vs supaflare)
node catalog.js status                             # all tests
node catalog.js status --category DATA             # DATA only
node catalog.js status --category DATA --subcategory select
node catalog.js status --id 3                      # single test

# List tests
node catalog.js list                               # table format
node catalog.js list --format json                 # JSON
node catalog.js list --format csv                  # CSV
node catalog.js list --status pending              # filter by status
node catalog.js list --category DATA --subcategory filters

# Record test run
node catalog.js run --id 3 --target supabase --status pass
node catalog.js run --id 3 --target supaflare --status fail --error "wrong rows returned"
node catalog.js run --category DATA --subcategory filters --operation eq --target supaflare --status pass

# Reports
node catalog.js report                             # text summary
node catalog.js report --format markdown           # markdown report
node catalog.js report --format json               # JSON report
node catalog.js report --target supaflare          # Supaflare only

# Export
node catalog.js export --format markdown           # detailed markdown per test
node catalog.js export --format csv                # CSV for spreadsheets
node catalog.js export --format json               # full JSON dump
node catalog.js export --category DATA --format markdown > DATA-report.md
```

## Classification

```
Category     → DATA | AUTH | STORAGE
Subcategory  → select, crud, filters, modifiers, signup, signin, admin, buckets, objects, ...
Operation    → query-referenced-tables, eq, upload, create-signed-url, ... (slugified from tab name)
```

Example: `DATA/select/query-referenced-tables` = "Fetch data: Query referenced tables"

## Result States

| State | Meaning |
|-------|---------|
| `pending` | Not yet run |
| `pass` | Passed |
| `fail` | Failed (response mismatch) |
| `error` | Error (crash, timeout, infra issue) |
| `skip` | Intentionally skipped for this run |
| `blocked` | Blocked by dependency |
| `not_applicable` | N/A for SQLite/Cloudflare Workers |

## Two-Target Tracking

Every test records results for **two targets**:

| Target | Purpose |
|--------|---------|
| `supabase` | Local dev Supabase (reference — validates the test itself) |
| `supaflare` | Our Cloudflare Workers implementation |

**Workflow:** Run against Supabase first → verify test is correct → run against Supaflare.

## Test Counts (in_scope)

| Category | Tests | Subcategories |
|----------|------:|---------------|
| **DATA** | 103 | select(12), crud(14), filters(34), modifiers(24), prefer(4), rls(10), errors(5) |
| **AUTH** | 85 | admin(30), events(8), jwt(5), otp(10), password(3), pkce(1), rate-limit(4), recovery(2), session(7), signin(4), signup(5), user(4), overview(2) |
| **STORAGE** | 42 | buckets(9), objects(16), signed-urls(6), access-control(4), validation(3), public(4) |

Plus 112 `skip_v1` tests (range ops, RPC, MFA, passkey, OAuth, realtime, edge functions, analytics, vector) and 13 `v2` tests (OAuth, SSO, Web3, identities).

## Database Schema

See `schema.sql`. Main tables:
- `test_catalog` — test definitions
- `test_runs` — execution results (upsert per test_id + target)
- `test_procedures` — shared procedure templates (optional)

## Files

| File | Purpose |
|------|---------|
| `extract.js` | Automated extractor — visits docs page, creates entries for every tab |
| `catalog.js` | CLI — seed, list, run, report, status, export |
| `schema.sql` | SQLite schema |
| `seed-data.js` | Legacy hand-curated seeds (deprecated, use extract.js instead) |
| `test-catalog.db` | SQLite database (not committed to git) |
