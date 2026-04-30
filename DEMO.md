# Supaflare Demo Guide

## What is Supaflare?

Supaflare is a **Supabase-compatible API layer** built on Teenybase (Cloudflare Workers + D1 SQLite + R2). It lets you use `@supabase/supabase-js` in your frontend code and point it at your Supaflare instance — **zero frontend code changes needed**.

## Architecture

```
@supabase/supabase-js (unchanged frontend client)
         │
         │ HTTP: /rest/v1/*
         ▼
┌─────────────────────────────────────────┐
│  Supaflare Compatibility Layer          │
│  ┌─────────────────────────────────────┐│
│  │  PostgREST Adapter (Phase 1)        ││
│  │  • SELECT with filters, order, limit││
│  │  • INSERT / UPDATE / UPSERT / DELETE││
│  │  • Response formatting              ││
│  └─────────────────────────────────────┘│
│         │                               │
│  ┌─────────────────────────────────────┐│
│  │  Teenybase Core (existing)          ││
│  │  SQL parser · D1 adapter · Auth     ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
         │
         ▼
       D1 (SQLite)
```

## Implementation Status

### Phase 0: Foundation ✅
- Extension routing integration
- Shared types (SupabaseRole, PostgrestRequest, SupabaseError)
- Error code mapping (PGRST200, PGRST100, 23505, etc.)
- Config resolution from env vars

### Phase 1A: Request Parsing ✅
- Query parameter parsing (select, filters, order, limit, offset)
- Filter expression builder for jsep/SQLite
- Prefer header parsing (return=, count=, resolution=)
- Auth context extraction (apikey + Bearer JWT)

### Phase 1B: SELECT ✅
- Basic SELECT with column selection
- All filter operators: eq, neq, gt, gte, lt, lte, like, ilike, is, in, match
- Chained filters (AND)
- Order by (asc/desc/nullsfirst/nullslast)
- Limit and offset pagination
- Content-Range header with Prefer: count=exact

### Phase 1D: Mutations ✅
- INSERT (single and bulk)
- UPDATE (with filter safety check)
- UPSERT (on_conflict + resolution modes)
- DELETE (with filter safety check)
- Prefer: return=minimal (204 No Content)
- Prefer: return=representation (return inserted/updated rows)

### Phase 1E: Response Formatting ✅
- HTTP status codes (200, 201, 204, 400, 404, 409)
- Content-Type: application/json
- Content-Range header for count queries

### Test Results
```
Test Files: 6 passed (6)
Tests:      108 passed | 2 skipped (110 total)
```

| Component | Tests | Status |
|-----------|-------|--------|
| errorMapper | 16 | ✅ |
| config | 9 | ✅ |
| queryParser | 27 | ✅ |
| preferHeader | 15 | ✅ |
| authContext | 11 | ✅ |
| routing/CRUD | 32 | ✅ (2 HEAD skipped) |

## How to Use

### 1. Configure Teenybase with Supaflare

```ts
import { $Database, teenyHono } from 'teenybase';
import { SupabaseCompatExtension } from 'teenybase/supabase';

const app = teenyHono(async (c) => {
  const db = new $Database(c, settings, d1Adapter, r2Bucket);
  db.extensions.push(new SupabaseCompatExtension(db, {
    enabled: true,
    anonKey: process.env.SUPAFLARE_ANON_KEY,
    serviceKey: process.env.SUPAFLARE_SERVICE_KEY,
  }));
  return db;
});
```

### 2. Use supabase-js in your frontend

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://your-supaflare.com', 'your-anon-key');

// SELECT
const { data: characters } = await supabase
  .from('characters')
  .select()
  .eq('name', 'Luke');

// INSERT
const { data: inserted } = await supabase
  .from('characters')
  .insert({ id: 4, name: 'Yoda' })
  .select();

// UPDATE
const { data: updated } = await supabase
  .from('characters')
  .update({ name: 'Master Yoda' })
  .eq('name', 'Yoda')
  .select();

// DELETE
const { data: deleted } = await supabase
  .from('characters')
  .delete()
  .eq('name', 'Master Yoda')
  .select();

// Pagination
const { data: page } = await supabase
  .from('characters')
  .select()
  .order('id', { ascending: false })
  .limit(10)
  .offset(20);
```

### 3. Run Tests

```bash
cd packages/teenybase
npx vitest run --config test/worker/supabase/vitest.config.ts
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `SUPAFLARE_JWT_SECRET` | JWT signing key | — |
| `SUPAFLARE_ANON_KEY` | Public anon key | — |
| `SUPAFLARE_SERVICE_KEY` | Service role key | — |
| `SUPAFLARE_JWT_EXPIRY` | Token lifetime (seconds) | 3600 |
| `SUPAFLARE_SIGNED_URL_EXPIRY` | Signed URL lifetime | 600 |

## SQLite Compatibility Notes

| Feature | Support | Notes |
|---------|---------|-------|
| eq, neq, gt, gte, lt, lte | ✅ Native | Direct SQLite |
| like, ilike | ✅ | ilike via LOWER() |
| is (null/bool) | ✅ | Via == null/true/false |
| in | ✅ | OR chain of equality |
| contains, containedBy, overlaps | ⚠️ Partial | Via LIKE pattern matching |
| range operators | ❌ Skip v1 | No SQLite range types |
| textSearch | ⚠️ Partial | FTS5 support |

## Next Steps

- **Phase 1B+:** Nested FK joins (embedded select)
- **Phase 1F:** RLS (Row-Level Security) policy injection
- **Phase 2:** GoTrue Auth API (signup, signin, JWT, OTP)
- **Phase 3:** Storage API (R2 bucket/object operations)
