# STORAGE.md: Supabase Storage API Compatibility Plan

## Goal

Implement Supabase Storage-compatible API layer on Teenybase backed by Cloudflare R2. Every feature tested at 3 levels:
- **Unit** — pure functions (signed URL generation, path validation, MIME detection, JWT token signing), no R2/D1
- **Integration** — real D1 + R2 via `@cloudflare/vitest-pool-workers`, supabase-js client against test Hono app
- **E2E** — `wrangler dev` live server + `@supabase/supabase-js` client in Node

Each test uses:
- **supabase-js call** — exact code from Supabase docs
- **expected response shape** — `{ data, error }` structure from Supabase docs
- **R2 state assertion** — verify objects stored/correct metadata

---

## Approach: Extract Tests from Supabase Docs

Storage docs pages have **interactive tabbed examples** showing different options and file types. Unlike Data API pages (SQL + response), Storage pages focus on:
1. **Example code** — `supabase.storage.from('bucket').upload(...)`
2. **Parameters** — options object shapes, file types, return types
3. **Response shape** — `{ data, error }` for each operation

We extract **example code** and **parameter/return shapes** from all storage pages to create test fixtures.

### Extraction Script

```js
// For each storage page:
// 1. Navigate to URL
// 2. Find all h2 headings (each = a method)
// 3. For each heading, find all [role="tab"] elements
// 4. Click each tab, extract example code + parameters
// 5. Extract response type info
// 6. Save as structured test fixtures
```

---

## URLs to Process (Catalog)

### Bucket Management (7 pages)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 1 | `https://supabase.com/docs/reference/javascript/file-buckets` | — | Overview / getting started |
| 2 | `https://supabase.com/docs/reference/javascript/storageclient-from` | — | `from(id)` — storage bucket entry point |
| 3 | `https://supabase.com/docs/reference/javascript/storage-listbuckets` | — | `listBuckets(options?)` |
| 4 | `https://supabase.com/docs/reference/javascript/storage-getbucket` | — | `getBucket(id)` |
| 5 | `https://supabase.com/docs/reference/javascript/storage-createbucket` | — | `createBucket(id, options)` |
| 6 | `https://supabase.com/docs/reference/javascript/storage-emptybucket` | — | `emptyBucket(id)` |
| 7 | `https://supabase.com/docs/reference/javascript/storage-updatebucket` | — | `updateBucket(id, options)` |
| 8 | `https://supabase.com/docs/reference/javascript/storage-deletebucket` | — | `deleteBucket(id)` |

### File Operations — Upload/Update (2 pages)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 9 | `https://supabase.com/docs/reference/javascript/storage-from-upload` | — | `upload(path, fileBody, fileOptions?)` |
| 10 | `https://supabase.com/docs/reference/javascript/storage-from-update` | — | `update(path, fileBody, fileOptions?)` |

### File Operations — Move/Copy (2 pages)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 11 | `https://supabase.com/docs/reference/javascript/storage-from-move` | — | `move(fromPath, toPath, options?)` |
| 12 | `https://supabase.com/docs/reference/javascript/storage-from-copy` | — | `copy(fromPath, toPath, options?)` |

### Signed URLs (4 pages)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 13 | `https://supabase.com/docs/reference/javascript/storage-from-createsignedurl` | — | `createSignedUrl(path, expiresIn, options?)` |
| 14 | `https://supabase.com/docs/reference/javascript/storage-from-createsignedurls` | — | `createSignedUrls(paths, expiresIn, options?)` |
| 15 | `https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl` | — | `createSignedUploadUrl(path, options?)` |
| 16 | `https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl` | — | `uploadToSignedUrl(path, token, fileBody, fileOptions?)` |

### File Access — Public/Download (2 pages)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 17 | `https://supabase.com/docs/reference/javascript/storage-from-getpublicurl` | — | `getPublicUrl(path, options?)` |
| 18 | `https://supabase.com/docs/reference/javascript/storage-from-download` | — | `download(path, options?, parameters?)` |

### File Operations — Remove/List (5 pages)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 19 | `https://supabase.com/docs/reference/javascript/storage-from-remove` | — | `remove(paths)` |
| 20 | `https://supabase.com/docs/reference/javascript/storage-from-list` | — | `list(path?, options?, parameters?)` |
| 21 | `https://supabase.com/docs/reference/javascript/storage-from-exists` | — | `exists(path)` |
| 22 | `https://supabase.com/docs/reference/javascript/storage-from-info` | — | `info(path)` |
| 23 | `https://supabase.com/docs/reference/javascript/storage-from-listv2` | — | `listV2(options?, parameters?)` — cursor-based pagination |

### Utility (1 page)
| # | URL | Tabs | Notes |
|---|-----|------|-------|
| 24 | `https://supabase.com/docs/reference/javascript/storage-from-tobase64` | — | `toBase64(data)` — sync, client-side only |

**Total: 24 pages.** All in scope for v1.

---

## Architecture

### Storage Stack

```
@supabase/supabase-js (unchanged frontend)
         │
         │ HTTP: /storage/v1/object/*
         │        /storage/v1/bucket/*
         ▼
┌─────────────────────────────────────────┐
│  Supa-Teenybase Storage Adapter         │
│  ┌──────────┬──────────┬──────────────┐ │
│  │ Bucket   │ Object   │ Signed URL   │ │
│  │ Routes   │ Routes   │ Generator    │ │
│  └────┬─────┴────┬─────┴─────┬────────┘ │
│       │          │           │           │
│       ▼          ▼           ▼           │
│  ┌────────────────────────────────────┐  │
│  │  D1: Bucket metadata + object      │  │
│  │       registry (names, paths,      │  │
│  │       sizes, MIME types, owners)   │  │
│  │  R2: Actual file content storage   │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Storage Routes: Request/Response Catalog

#### Bucket Routes

##### `GET /storage/v1/bucket/list`

Maps to: `supabase.storage.listBuckets()`

**Response:** `200`
```json
[
  {
    "id": "avatars",
    "name": "avatars",
    "owner": "user-uuid",
    "public": false,
    "created_at": "2026-04-29T00:00:00Z",
    "updated_at": "2026-04-29T00:00:00Z",
    "file_size_limit": 52428800,
    "allowed_mime_types": ["image/png", "image/jpeg"]
  }
]
```

---

##### `GET /storage/v1/bucket/{id}`

Maps to: `supabase.storage.getBucket(id)`

**Response:** `200`
```json
{
  "id": "avatars",
  "name": "avatars",
  "owner": "user-uuid",
  "public": false,
  "created_at": "2026-04-29T00:00:00Z",
  "updated_at": "2026-04-29T00:00:00Z",
  "file_size_limit": 52428800,
  "allowed_mime_types": ["image/png", "image/jpeg"]
}
```

**Errors:**
- `404` — `not_found` (bucket does not exist)

---

##### `POST /storage/v1/bucket`

Maps to: `supabase.storage.createBucket(id, options)`

**Request:**
```json
{
  "id": "avatars",
  "name": "avatars",
  "public": false,
  "file_size_limit": 52428800,
  "allowed_mime_types": ["image/png", "image/jpeg"]
}
```

**Response:** `200`
```json
{ "name": "avatars" }
```

**Errors:**
- `400` — `Duplicate` (bucket already exists)

---

##### `PUT /storage/v1/bucket/{id}`

Maps to: `supabase.storage.updateBucket(id, options)`

**Request:**
```json
{
  "public": true,
  "file_size_limit": 10485760,
  "allowed_mime_types": ["image/png"]
}
```

**Response:** `200`
```json
{ "message": "Bucket updated" }
```

**Errors:**
- `404` — `not_found` (bucket does not exist)

---

##### `DELETE /storage/v1/bucket/{id}`

Maps to: `supabase.storage.deleteBucket(id)`

**Response:** `200`
```json
{
  "id": "avatars",
  "name": "avatars",
  "deleted_at": "2026-04-29T00:00:00Z"
}
```

**Errors:**
- `404` — `not_found` (bucket does not exist)
- `400` — `BucketNotEmpty` (bucket must be emptied first)

---

##### `POST /storage/v1/bucket/{id}/empty`

Maps to: `supabase.storage.emptyBucket(id)`

**Response:** `200`
```json
[
  { "bucket_id": "avatars", "name": "avatar1.png" },
  { "bucket_id": "avatars", "name": "avatar2.jpg" }
]
```

**Errors:**
- `404` — `not_found` (bucket does not exist)

---

#### Object Routes

##### `POST /storage/v1/object/{bucket}`

Maps to: `supabase.storage.from('bucket').upload(path, fileBody, options)`

**Headers:**
- `x-upsert`: `false` (default) — fail if exists
- `x-upsert`: `true` — overwrite if exists
- `x-cache-control`: `3600` (optional)
- `content-type`: MIME type
- `content-length`: file size

**Body:** raw binary file content

**Query params:**
- `name=path/to/file.png` — object path

**Response:** `200`
```json
{ "Key": "bucket/path/to/file.png" }
```

**Errors:**
- `400` — `Duplicate` (file exists, no upsert)
- `413` — file exceeds bucket size limit
- `422` — MIME type not in allowed list
- `404` — bucket not found

---

##### `PUT /storage/v1/object/{bucket}`

Maps to: `supabase.storage.from('bucket').update(path, fileBody, options)`

Same shape as upload. Updates existing object.

**Response:** `200`
```json
{ "Key": "bucket/path/to/file.png" }
```

**Errors:**
- `404` — object or bucket not found

---

##### `GET /storage/v1/object/{bucket}/{path}`

Maps to: `supabase.storage.from('bucket').download(path)`

**Response:** `200`
- Body: raw binary content
- Headers: `content-type`, `content-length`, `cache-control`, `etag`, `last-modified`

**Errors:**
- `404` — object or bucket not found
- `403` — object exists but permission denied (private bucket, no auth)

---

##### `DELETE /storage/v1/object/{bucket}`

Maps to: `supabase.storage.from('bucket').remove(paths)`

**Request:**
```json
[
  "folder/avatar1.png",
  "folder/avatar2.jpg"
]
```

**Response:** `200`
```json
[
  { "bucket_id": "avatars", "name": "folder/avatar1.png" },
  { "bucket_id": "avatars", "name": "folder/avatar2.jpg" }
]
```

**Errors:**
- `404` — bucket not found

---

##### `POST /storage/v1/object/{bucket}/move`

Maps to: `supabase.storage.from('bucket').move(fromPath, toPath)`

**Request:**
```json
{
  "bucketId": "avatars",
  "sourceKey": "public/avatar1.png",
  "destinationKey": "private/avatar2.png"
}
```

**Response:** `200`
```json
{ "message": "move complete" }
```

**Errors:**
- `404` — source object or bucket not found
- `400` — destination already exists

---

##### `POST /storage/v1/object/{bucket}/copy`

Maps to: `supabase.storage.from('bucket').copy(fromPath, toPath)`

**Request:**
```json
{
  "bucketId": "avatars",
  "sourceKey": "public/avatar1.png",
  "destinationKey": "private/avatar2.png"
}
```

**Response:** `200`
```json
{ "Key": "avatars/private/avatar2.png" }
```

**Errors:**
- `404` — source object or bucket not found

---

##### `POST /storage/v1/object/{bucket}/list`

Maps to: `supabase.storage.from('bucket').list(path, options)`

**Request:**
```json
{
  "prefix": "folder/",
  "limit": 100,
  "offset": 0,
  "sortBy": { "column": "name", "order": "asc" }
}
```

**Response:** `200`
```json
[
  {
    "name": "avatar1.png",
    "id": "object-uuid",
    "updated_at": "2026-04-29T00:00:00Z",
    "created_at": "2026-04-29T00:00:00Z",
    "last_accessed_at": "2026-04-29T00:00:00Z",
    "metadata": { "size": 1024, "mimetype": "image/png" }
  },
  {
    "name": "subfolder/",
    "id": null
  }
]
```

**Note:** `id: null` indicates a folder (prefix), not a file.

**Errors:**
- `404` — bucket not found

---

##### `POST /storage/v1/object/{bucket}/list/v2`

Maps to: `supabase.storage.from('bucket').listV2(options)`

**Request:**
```json
{
  "prefix": "folder/",
  "limit": 100,
  "cursor": "eyJwYWdlIjoyfQ=="
}
```

**Response:** `200`
```json
{
  "objects": [
    {
      "name": "avatar1.png",
      "id": "object-uuid",
      "metadata": { "size": 1024, "mimetype": "image/png" }
    }
  ],
  "folders": [
    { "name": "subfolder" }
  ],
  "hasNext": true,
  "nextCursor": "eyJwYWdlIjozfQ=="
}
```

**Errors:**
- `404` — bucket not found

---

##### `POST /storage/v1/object/sign/{bucket}`

Maps to: `supabase.storage.from('bucket').createSignedUrl(path, expiresIn)`

**Request:**
```json
{
  "url": "folder/avatar1.png",
  "expiresIn": 60,
  "download": true
}
```

**Response:** `200`
```json
{
  "signedURL": "/storage/v1/object/sign/avatars/folder/avatar1.png?token=eyJ..."
}
```

---

##### `POST /storage/v1/object/signatures`

Maps to: `supabase.storage.from('bucket').createSignedUrls(paths, expiresIn)`

**Request:**
```json
{
  "urls": ["folder/avatar1.png", "folder/avatar2.png"],
  "expiresIn": 60
}
```

**Response:** `200`
```json
[
  {
    "url": "folder/avatar1.png",
    "error": null,
    "signedURL": "/storage/v1/object/sign/avatars/folder/avatar1.png?token=..."
  },
  {
    "url": "folder/avatar2.png",
    "error": null,
    "signedURL": "/storage/v1/object/sign/avatars/folder/avatar2.png?token=..."
  }
]
```

---

##### `POST /storage/v1/upload/resumable`

Maps to: `supabase.storage.from('bucket').createSignedUploadUrl(path)`

**Request:**
```json
{
  "url": "folder/cat.jpg",
  "upsert": true
}
```

**Response:** `200`
```json
{
  "url": "/storage/v1/upload/resumable",
  "token": "signed-upload-token",
  "path": "folder/cat.jpg"
}
```

---

##### `PUT /storage/v1/upload/resumable`

Maps to: `supabase.storage.from('bucket').uploadToSignedUrl(path, token, fileBody)`

**Headers:**
- `x-upsert-token`: token from createSignedUploadUrl
- `content-type`: MIME type
- `content-length`: file size

**Body:** raw binary file content

**Query params:**
- `uploadType=resumable`

**Response:** `200`
```json
{ "Key": "avatars/folder/cat.jpg" }
```

---

#### Public URL (synchronous, no API call)

##### `GET /storage/v1/object/public/{bucket}/{path}`

Maps to: `supabase.storage.from('bucket').getPublicUrl(path)`

**Note:** This is a **synchronous** client-side method. No server call needed.
Returns `{ data: { publicUrl: "..." } }` constructed from URL.

**URL format:**
```
https://<supabase-url>/storage/v1/object/public/{bucket}/{path}
```

---

#### File Info / Exists

##### `POST /storage/v1/object/info/{bucket}/{path}`

Maps to: `supabase.storage.from('bucket').info(path)`

**Response:** `200`
```json
{
  "name": "folder/avatar1.png",
  "size": 1024,
  "mimetype": "image/png",
  "cacheControl": "3600",
  "lastModified": "2026-04-29T00:00:00Z",
  "created_at": "2026-04-29T00:00:00Z",
  "eTag": "\"abc123\""
}
```

**Errors:**
- `404` — object not found

---

##### `HEAD /storage/v1/object/{bucket}/{path}`

Maps to: `supabase.storage.from('bucket').exists(path)`

**Response:** `200` if object exists, `404` if not.
**No body** — HEAD request, only status matters.

---

## R2 Integration

### How R2 Maps to Supabase Storage

| Supabase Storage | Cloudflare R2 | Notes |
|---|---|---|
| Bucket | R2 Bucket | 1:1 mapping |
| Object | R2 Object | path = key |
| `public` flag | N/A | Tracked in D1 bucket metadata |
| `fileSizeLimit` | N/A | Enforced at API level |
| `allowedMimeTypes` | N/A | Enforced at API level |
| Signed URLs | JWT token in query | HMAC-signed, short-lived |
| File content | R2 `put()` / `get()` / `delete()` | Binary body passthrough |

### D1 Schema for Storage Metadata

```sql
-- Bucket registry
CREATE TABLE storage_buckets (
  id TEXT PRIMARY KEY,                  -- bucket name (unique)
  name TEXT NOT NULL,
  owner TEXT,                           -- creator user UUID
  public INTEGER DEFAULT 0,             -- 0 = private, 1 = public
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  file_size_limit INTEGER,              -- max file size in bytes (NULL = unlimited)
  allowed_mime_types TEXT               -- JSON array: '["image/png","image/jpeg"]'
);

-- Object metadata registry (mirrors R2 key listing)
CREATE TABLE storage_objects (
  id TEXT PRIMARY KEY,                  -- object UUID
  bucket_id TEXT NOT NULL,              -- FK to storage_buckets.id
  name TEXT NOT NULL,                   -- object path/key (e.g., 'folder/avatar.png')
  owner TEXT,                           -- uploader user UUID
  metadata TEXT,                        -- JSON: { size, mimetype, cacheControl, eTag }
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT,
  version TEXT                          -- R2 object version for concurrency
);

-- Indexes
CREATE INDEX idx_objects_bucket ON storage_objects(bucket_id);
CREATE INDEX idx_objects_bucket_name ON storage_objects(bucket_id, name);
CREATE INDEX idx_buckets_owner ON storage_buckets(owner);
```

### Signed URL Token Format

Signed URLs use HMAC-SHA256 tokens (same secret as auth JWT: `SUPA_TEENY_JWT_SECRET`).

```json
{
  "bucket": "avatars",
  "path": "folder/avatar1.png",
  "exp": 1714348800,
  "iat": 1714345200,
  "download": true
}
```

- Token encoded as base64url, appended as `?token=...` query param.
- `exp = iat + expiresIn` (seconds).
- On GET to `/storage/v1/object/sign/...`, validate token, serve from R2.

### Signed Upload URL Token Format

```json
{
  "bucket": "avatars",
  "path": "folder/cat.jpg",
  "upsert": true,
  "exp": 1714348800,
  "iat": 1714345200
}
```

- Separate token from download signed URL.
- `upsert: true` baked into token (cannot override at upload time).
- PUT to `/storage/v1/upload/resumable` with `x-upsert-token` header.

---

## Configuration & Environment

### Required Env Vars

| Variable | Purpose | Test Default |
|---|---|---|
| `SUPA_TEENY_JWT_SECRET` | HMAC signing for signed URLs | `"test-jwt-secret-at-least-32-chars!"` |
| `SUPA_TEENY_SIGNED_URL_EXPIRY` | Default signed URL lifetime (seconds) | `600` (10 min) |
| `SUPA_TEENY_ANON_KEY` | Public anon key (bucket perms) | `"sb-anon-test-key"` |
| `SUPA_TEENY_SERVICE_KEY` | Service role key (full access) | `"sb-service-test-key"` |

### Configurable Behavior (via `DatabaseSettings` or env)

| Setting | Default | Effect |
|---|---|---|
| `storage.defaultFileSizeLimit` | `52428800` (50MB) | Default max upload size |
| `storage.allowedMimeTypes` | `[]` (all allowed) | Default allowed MIME types (empty = all) |
| `storage.maxUploadSize` | `104857600` (100MB) | Hard cap on upload size (enforced at API) |
| `storage.publicBucketPrefix` | `""` | Bucket name prefix for auto-public buckets |

### Request Context

Storage middleware runs before each `/storage/v1/*` handler. Populates:
- `c.var.auth` — `SupabaseAuthContext` (role, uid, email, jwt payload)
- Permission checks: bucket public? user owner? service_role?

---

## Access Control

### Bucket-Level Permissions

| Role | Public Bucket | Private Bucket |
|---|---|---|
| `anon` | Read objects, list | Denied |
| `authenticated` | Read/write objects | Read/write if owner |
| `service_role` | Full access | Full access |

### Object-Level Permissions

- **Upload:** bucket exists + size limit + MIME allowed + auth check
- **Download:** public bucket OR valid signed URL OR authenticated owner/service_role
- **Delete:** authenticated owner OR service_role
- **Move/Copy:** authenticated owner of source OR service_role

---

## Error Codes (Supabase Storage)

| Code | Message | HTTP | When |
|---|---|---|---|
| `not_found` | Bucket/Resource not found | 404 | Bucket or object does not exist |
| `Duplicate` | The resource already exists | 400 | Bucket/file exists without upsert |
| `BucketNotEmpty` | Bucket must be empty before deletion | 400 | deleteBucket on non-empty bucket |
| `ObjectNotFound` | Object not found | 404 | File at path does not exist |
| `InvalidBucketName` | Bucket name is invalid | 400 | Name contains invalid characters |
| `SizeLimitExceeded` | File size exceeds limit | 413 | Upload exceeds fileSizeLimit |
| `MimeTypeNotAllowed` | MIME type not allowed | 422 | Content-Type not in allowed list |
| `PermissionDenied` | Permission denied | 403 | No access to private bucket/object |
| `InvalidToken` | Invalid or expired signed URL token | 400 | Token expired or malformed |
| `InvalidPath` | Invalid path | 400 | Path contains invalid characters |

---

## SQLite Compatibility Matrix (Storage)

| Supabase Storage Feature | R2 Support | Action |
|---|---|---|
| Bucket CRUD | ✅ | D1 metadata + R2 bucket existence |
| Object upload | ✅ | R2 `put()` |
| Object update | ✅ | R2 `put()` (overwrite) |
| Object download | ✅ | R2 `get()` |
| Object delete | ✅ | R2 `delete()` |
| Object list | ✅ | R2 `list()` + D1 metadata |
| Object listV2 | ✅ | R2 `list()` with cursor |
| Object move | ✅ | R2 `put()` + `delete()` |
| Object copy | ✅ | R2 `copy()` or `get()` + `put()` |
| Object exists (HEAD) | ✅ | R2 `head()` |
| Object info | ✅ | R2 `head()` |
| Signed URLs | ✅ | JWT tokens, short-lived |
| Signed upload URLs | ✅ | JWT tokens for resumable upload |
| Public URLs | ✅ | URL construction (no server call) |
| `toBase64()` | ✅ | Client-side sync utility |
| `public` bucket flag | ✅ | D1 metadata |
| `fileSizeLimit` | ✅ | API-level enforcement |
| `allowedMimeTypes` | ✅ | API-level enforcement |
| `cacheControl` | ✅ | R2 custom metadata |
| Empty bucket | ✅ | List + bulk delete |
| Empty bucket (not empty error) | ✅ | R2 check before delete |

---

## Test Directory Structure (Storage additions)

```
tests/supabase-compat/
├── unit/
│   ├── signedUrl.test.ts              ← Signed URL encode/decode, expiry, download flag
│   ├── signedUploadUrl.test.ts        ← Upload token generation + validation, upsert baked in
│   ├── pathValidator.test.ts          ← Path name validation (no leading /, no .., length limits)
│   ├── mimeTypeValidator.test.ts      ← MIME type matching against allowed list
│   ├── fileSizeValidator.test.ts      ← Size limit enforcement
│   ├── publicUrlBuilder.test.ts       ← getPublicUrl URL construction (sync, no server)
│   └── storageErrorMapper.test.ts     ← Internal errors → Supabase storage error codes
│
├── integration/
│   ├── fixtures/
│   │   ├── storage/
│   │   │   ├── responses/
│   │   │   │   ├── buckets/
│   │   │   │   │   ├── list-success.json
│   │   │   │   │   ├── get-success.json
│   │   │   │   │   ├── create-success.json
│   │   │   │   │   ├── create-duplicate.json
│   │   │   │   │   ├── update-success.json
│   │   │   │   │   ├── delete-success.json
│   │   │   │   │   ├── empty-success.json
│   │   │   │   │   └── delete-not-empty.json
│   │   │   │   ├── objects/
│   │   │   │   │   ├── upload-success.json
│   │   │   │   │   ├── upload-upsert.json
│   │   │   │   │   ├── upload-duplicate-error.json
│   │   │   │   │   ├── upload-size-exceeded.json
│   │   │   │   │   ├── update-success.json
│   │   │   │   │   ├── download-success.txt   ← binary content
│   │   │   │   │   ├── remove-success.json
│   │   │   │   │   ├── move-success.json
│   │   │   │   │   ├── copy-success.json
│   │   │   │   │   ├── list-success.json
│   │   │   │   │   ├── list-with-folders.json
│   │   │   │   │   ├── listV2-success.json
│   │   │   │   │   ├── listV2-pagination.json
│   │   │   │   │   ├── info-success.json
│   │   │   │   │   └── exists-200.txt          ← HEAD status only
│   │   │   │   └── signed-urls/
│   │   │   │       ├── create-signed-url.json
│   │   │   │       ├── create-signed-urls.json
│   │   │   │       ├── signed-url-download.json
│   │   │   │       ├── create-upload-url.json
│   │   │   │       └── upload-to-signed-url.json
│   │   │   └── seeds/
│   │   │       └── storage-buckets.sql        ← Pre-seeded buckets
│   │
│   ├── storage/
│   │   ├── buckets/
│   │   │   ├── list.test.ts                   ← listBuckets() — empty, populated
│   │   │   ├── get.test.ts                    ← getBucket() — exists, not-found
│   │   │   ├── create.test.ts                 ← createBucket() — public, private, mime types, size limit
│   │   │   ├── update.test.ts                 ← updateBucket() — change public flag, limits
│   │   │   ├── delete.test.ts                 ← deleteBucket() — empty, not-empty error
│   │   │   └── empty.test.ts                  ← emptyBucket() — delete all objects
│   │   ├── objects/
│   │   │   ├── upload.test.ts                 ← upload() — binary, text, upsert, MIME, size
│   │   │   ├── update.test.ts                 ← update() — overwrite existing object
│   │   │   ├── download.test.ts               ← download() — binary blob, headers
│   │   │   ├── remove.test.ts                 ← remove() — single, multiple files
│   │   │   ├── move.test.ts                   ← move() — same bucket, verify source gone
│   │   │   ├── copy.test.ts                   ← copy() — same bucket, verify source intact
│   │   │   ├── list.test.ts                   ← list() — root, subfolder, pagination, sort
│   │   │   ├── listV2.test.ts                 ← listV2() — cursor pagination, folders vs objects
│   │   │   ├── exists.test.ts                 ← exists() — true, false (HEAD)
│   │   │   └── info.test.ts                   ← info() — size, mimetype, cacheControl, eTag
│   │   ├── signed-urls/
│   │   │   ├── createSignedUrl.test.ts        ← single signed URL, download flag, expiry
│   │   │   ├── createSignedUrls.test.ts       ← batch signed URLs
│   │   │   ├── signedUrlAccess.test.ts        ← GET signed URL serves file, expired URL rejected
│   │   │   ├── createSignedUploadUrl.test.ts  ← upload token generation, upsert baked in
│   │   │   └── uploadToSignedUrl.test.ts      ← upload via token, upsert from token
│   │   ├── public-url/
│   │   │   └── getPublicUrl.test.ts           ← URL construction (sync, public bucket)
│   │   └── access-control/
│   │       ├── public-bucket.test.ts          ← anon read from public bucket
│   │       ├── private-bucket.test.ts         ← anon denied from private bucket
│   │       ├── owner-access.test.ts           ← authenticated user accesses own files
│   │       └── service-role-access.test.ts    ← service_role bypasses all checks
│   └── ... (existing data + auth tests)
│
├── e2e/
│   ├── storage.test.ts                        ← Full storage lifecycle via supabase.storage.*
│   └── storage-access-control.test.ts         ← Public/private bucket auth flows
│
└── helpers/
    ├── storageClient.ts                       ← createClient with storage config
    ├── testFiles.ts                           ← Generate test file blobs (PNG, TXT, binary)
    └── compareStorage.ts                      ← Compare storage responses (handle binary)
```

---

## Test Pattern Examples

### Unit Test
```typescript
// Unit: signed URL generation
import { generateSignedUrlToken, verifySignedUrlToken } from '../../src/worker/supabase/storage/signedUrl';

describe('signedUrl', () => {
  it('generates and verifies valid token', () => {
    const payload = { bucket: 'avatars', path: 'folder/avatar.png', expiresIn: 60 };
    const token = generateSignedUrlToken(payload, SECRET);
    const verified = verifySignedUrlToken(token, SECRET);
    expect(verified.bucket).toBe('avatars');
    expect(verified.path).toBe('folder/avatar.png');
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects expired tokens', () => {
    const payload = { bucket: 'avatars', path: 'file.txt', expiresIn: -1 };
    const token = generateSignedUrlToken(payload, SECRET);
    expect(() => verifySignedUrlToken(token, SECRET)).toThrow('Token expired');
  });

  it('rejects tokens signed with wrong secret', () => {
    const payload = { bucket: 'avatars', path: 'file.txt', expiresIn: 60 };
    const token = generateSignedUrlToken(payload, SECRET);
    expect(() => verifySignedUrlToken(token, 'wrong-secret')).toThrow('Invalid signature');
  });
});
```

### Integration Test
```typescript
// Integration: bucket CRUD via supabase.storage
import { describe, it, beforeAll } from 'vitest';
import { createSupaTeenyClient } from '../../helpers/supabaseClient';

describe('Bucket CRUD', () => {
  it('creates a private bucket with size limit and MIME types', async () => {
    const { data, error } = await supabase.storage.createBucket('avatars', {
      public: false,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
      fileSizeLimit: 1048576, // 1MB
    });
    expect(error).toBeNull();
    expect(data).toBe('avatars');
  });

  it('lists all buckets', async () => {
    const { data, error } = await supabase.storage.listBuckets();
    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Array);
    expect(data.some(b => b.name === 'avatars')).toBe(true);
  });

  it('gets bucket by id', async () => {
    const { data, error } = await supabase.storage.getBucket('avatars');
    expect(error).toBeNull();
    expect(data.name).toBe('avatars');
    expect(data.public).toBe(false);
    expect(data.file_size_limit).toBe(1048576);
  });

  it('rejects duplicate bucket creation', async () => {
    const { error } = await supabase.storage.createBucket('avatars');
    expect(error).toBeDefined();
    expect(error.message).toContain('already exists');
  });

  it('updates bucket settings', async () => {
    const { error } = await supabase.storage.updateBucket('avatars', {
      public: true,
    });
    expect(error).toBeNull();

    const { data } = await supabase.storage.getBucket('avatars');
    expect(data.public).toBe(true);
  });

  it('empties bucket before deletion', async () => {
    // Upload a file first
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload('temp/file.txt', new Blob(['hello']));
    expect(uploadErr).toBeNull();

    // Empty the bucket
    const { error: emptyErr } = await supabase.storage.emptyBucket('avatars');
    expect(emptyErr).toBeNull();

    // Now delete
    const { error: deleteErr } = await supabase.storage.deleteBucket('avatars');
    expect(deleteErr).toBeNull();
  });
});
```

### Integration Test (File Operations)
```typescript
// Integration: file upload, download, remove via supabase.storage.from()
describe('File operations', () => {
  beforeAll(async () => {
    await supabase.storage.createBucket('test-files', { public: true });
  });

  it('uploads a file', async () => {
    const file = new Blob(['hello world'], { type: 'text/plain' });
    const { data, error } = await supabase.storage
      .from('test-files')
      .upload('folder/hello.txt', file);
    expect(error).toBeNull();
    expect(data.path).toBe('folder/hello.txt');
  });

  it('downloads a file', async () => {
    const { data, error } = await supabase.storage
      .from('test-files')
      .download('folder/hello.txt');
    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Blob);
    const text = await data.text();
    expect(text).toBe('hello world');
  });

  it('gets file info', async () => {
    const { data, error } = await supabase.storage
      .from('test-files')
      .info('folder/hello.txt');
    expect(error).toBeNull();
    expect(data.size).toBe(11);
    expect(data.mimetype).toBe('text/plain');
  });

  it('checks file exists', async () => {
    const { data, error } = await supabase.storage
      .from('test-files')
      .exists('folder/hello.txt');
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('checks non-existent file does not exist', async () => {
    const { data, error } = await supabase.storage
      .from('test-files')
      .exists('folder/missing.txt');
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it('lists files in directory', async () => {
    const { data, error } = await supabase.storage
      .from('test-files')
      .list('folder', { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Array);
    expect(data.some(f => f.name === 'hello.txt')).toBe(true);
  });

  it('gets public URL', async () => {
    const { data } = supabase.storage
      .from('test-files')
      .getPublicUrl('folder/hello.txt');
    expect(data.publicUrl).toContain('/storage/v1/object/public/test-files/folder/hello.txt');
  });

  it('creates signed URL for private bucket', async () => {
    // Create private bucket
    await supabase.storage.createBucket('private-files', { public: false });
    await supabase.storage.from('private-files').upload('secret.txt', new Blob(['secret']));

    const { data, error } = await supabase.storage
      .from('private-files')
      .createSignedUrl('secret.txt', 60);
    expect(error).toBeNull();
    expect(data.signedUrl).toContain('token=');
  });

  it('moves a file', async () => {
    await supabase.storage.from('test-files').upload('old/path.txt', new Blob(['data']));
    const { error } = await supabase.storage
      .from('test-files')
      .move('old/path.txt', 'new/path.txt');
    expect(error).toBeNull();

    const { data: exists } = await supabase.storage.from('test-files').exists('new/path.txt');
    expect(exists).toBe(true);
  });

  it('copies a file', async () => {
    await supabase.storage.from('test-files').upload('source.txt', new Blob(['copy me']));
    const { error } = await supabase.storage
      .from('test-files')
      .copy('source.txt', 'dest.txt');
    expect(error).toBeNull();

    // Both should exist
    const { data: src } = await supabase.storage.from('test-files').exists('source.txt');
    const { data: dst } = await supabase.storage.from('test-files').exists('dest.txt');
    expect(src).toBe(true);
    expect(dst).toBe(true);
  });

  it('removes files', async () => {
    await supabase.storage.from('test-files').upload('delete-me.txt', new Blob(['bye']));
    const { data, error } = await supabase.storage
      .from('test-files')
      .remove(['delete-me.txt']);
    expect(error).toBeNull();
    expect(data).toBeInstanceOf(Array);
    expect(data[0].name).toBe('delete-me.txt');

    const { data: exists } = await supabase.storage.from('test-files').exists('delete-me.txt');
    expect(exists).toBe(false);
  });
});
```

### E2E Test
```typescript
// E2E: full storage lifecycle via supabase.storage.*
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:8787', ANON_KEY);

describe('E2E: Storage lifecycle', () => {
  it('creates bucket, uploads, downloads, signs URL, deletes', async () => {
    // 1. Create bucket
    const { data: bucketName } = await supabase.storage.createBucket('e2e-bucket', {
      public: false,
    });
    expect(bucketName).toBe('e2e-bucket');

    // 2. Upload file
    const file = new Blob(['e2e test content'], { type: 'text/plain' });
    const { data: upload } = await supabase.storage
      .from('e2e-bucket')
      .upload('docs/readme.txt', file);
    expect(upload.path).toBe('docs/readme.txt');

    // 3. Download file
    const { data: downloaded } = await supabase.storage
      .from('e2e-bucket')
      .download('docs/readme.txt');
    expect(await downloaded.text()).toBe('e2e test content');

    // 4. Get file info
    const { data: info } = await supabase.storage
      .from('e2e-bucket')
      .info('docs/readme.txt');
    expect(info.size).toBe(18);
    expect(info.mimetype).toBe('text/plain');

    // 5. Create signed URL (private bucket)
    const { data: signed } = await supabase.storage
      .from('e2e-bucket')
      .createSignedUrl('docs/readme.txt', 60);
    expect(signed.signedUrl).toContain('token=');

    // 6. Upload via signed URL
    const { data: uploadToken } = await supabase.storage
      .from('e2e-bucket')
      .createSignedUploadUrl('signed-upload/test.bin');
    const { data: uploadResult } = await supabase.storage
      .from('e2e-bucket')
      .uploadToSignedUrl('signed-upload/test.bin', uploadToken.token, new Blob(['signed']));
    expect(uploadResult.path).toBe('signed-upload/test.bin');

    // 7. List files
    const { data: files } = await supabase.storage
      .from('e2e-bucket')
      .list('docs');
    expect(files.some(f => f.name === 'readme.txt')).toBe(true);

    // 8. Move file
    await supabase.storage.from('e2e-bucket').move('docs/readme.txt', 'docs/readme-old.txt');
    const { data: moved } = await supabase.storage.from('e2e-bucket').exists('docs/readme-old.txt');
    expect(moved).toBe(true);

    // 9. Copy file
    await supabase.storage.from('e2e-bucket').copy('docs/readme-old.txt', 'docs/readme-backup.txt');
    const { data: src } = await supabase.storage.from('e2e-bucket').exists('docs/readme-old.txt');
    const { data: copy } = await supabase.storage.from('e2e-bucket').exists('docs/readme-backup.txt');
    expect(src).toBe(true);
    expect(copy).toBe(true);

    // 10. Clean up: empty bucket, then delete
    await supabase.storage.emptyBucket('e2e-bucket');
    const { error: deleteErr } = await supabase.storage.deleteBucket('e2e-bucket');
    expect(deleteErr).toBeNull();
  });
});
```

---

## Implementation-Test Phase Mapping

Each implementation sub-phase ships with its tests. TDD flow:
1. Write unit test → fail → implement → pass
2. Write integration test → fail → implement handler → pass
3. Write e2e test → fail → wire together → pass

| Impl Phase | Tests |
|------------|-------|
| **3.1** Storage routing + R2 setup | Integration — route dispatch, R2 bucket ops |
| **3.2** D1 bucket metadata schema | Integration — bucket CRUD, validation |
| **3.3** Bucket API (list/get/create/update/delete/empty) | Integration: `storage/buckets/*.test.ts` |
| **3.4** Object upload | Unit: validators. Integration: `storage/objects/upload.test.ts` |
| **3.5** Object update | Integration: `storage/objects/update.test.ts` |
| **3.6** Object download | Integration: `storage/objects/download.test.ts` |
| **3.7** Object remove | Integration: `storage/objects/remove.test.ts` |
| **3.8** Object move/copy | Integration: `storage/objects/move.test.ts`, `copy.test.ts` |
| **3.9** Object list / listV2 | Integration: `storage/objects/list.test.ts`, `listV2.test.ts` |
| **3.10** Object info / exists | Integration: `storage/objects/info.test.ts`, `exists.test.ts` |
| **3.11** Signed URLs (download) | Unit: token gen. Integration: `storage/signed-urls/*.test.ts` |
| **3.12** Signed upload URLs | Unit: upload token. Integration: `storage/signed-urls/uploadToSignedUrl.test.ts` |
| **3.13** Public URLs | Unit: `publicUrlBuilder.test.ts`. No server-side code. |
| **3.14** Access control | Integration: `storage/access-control/*.test.ts` |
| **3.15** E2E storage lifecycle | E2E: `storage.test.ts`, `storage-access-control.test.ts` |

---

## Storage Fixture Extraction

Extract from Supabase docs via Chrome DevTools:

1. **Navigate** to each storage URL
2. **Discover** all h2 headings (each method)
3. **For each tab**: click it, wait for render
4. **Extract** example code (always visible or in tab)
5. **Extract** parameter info from headings/descriptions
6. **Extract** response type / return shape info
7. **Save** as structured JSON:
   ```json
   {
     "page": "storage-from-upload",
     "section": "Upload a file",
     "tab": "Using upload()",
     "code": "supabase.storage.from('avatars').upload('public/avatar1.png', avatarFile, { cacheControl: '3600', upsert: false })",
     "params": { "path": "string", "fileBody": "File | Blob | ArrayBuffer | Uint8Array", "fileOptions": { "cacheControl": "string", "contentType": "string", "upsert": "boolean" } },
     "returns": { "data": { "path": "string" }, "error": "StorageError | null" }
   }
   ```

---

## Implementation Sub-Phases (Detailed)

### Sub-phase 3.1: Storage Routing + R2 Integration

#### 3.1.1 — Route Registration
Register `/storage/v1/*` routes with Hono:
- `GET /storage/v1/bucket/list` → listBuckets
- `GET /storage/v1/bucket/{id}` → getBucket
- `POST /storage/v1/bucket` → createBucket
- `PUT /storage/v1/bucket/{id}` → updateBucket
- `DELETE /storage/v1/bucket/{id}` → deleteBucket
- `POST /storage/v1/bucket/{id}/empty` → emptyBucket
- `POST /storage/v1/object/{bucket}` → upload
- `PUT /storage/v1/object/{bucket}` → update
- `GET /storage/v1/object/{bucket}/{path}` → download
- `HEAD /storage/v1/object/{bucket}/{path}` → exists
- `DELETE /storage/v1/object/{bucket}` → remove (paths in body)
- `POST /storage/v1/object/{bucket}/move` → move
- `POST /storage/v1/object/{bucket}/copy` → copy
- `POST /storage/v1/object/{bucket}/list` → list
- `POST /storage/v1/object/{bucket}/list/v2` → listV2
- `POST /storage/v1/object/sign/{bucket}` → createSignedUrl
- `POST /storage/v1/object/signatures` → createSignedUrls
- `POST /storage/v1/upload/resumable` → createSignedUploadUrl
- `PUT /storage/v1/upload/resumable` → uploadToSignedUrl
- `GET /storage/v1/object/sign/{bucket}/{path}` → signed URL download (token in query)
- `GET /storage/v1/object/public/{bucket}/{path}` → public URL download
- `POST /storage/v1/object/info/{bucket}/{path}` → object info

**Tests:** Integration — verify each route dispatches, returns correct status.

#### 3.1.2 — R2 Client Integration
- Use Cloudflare Workers `env.R2_BUCKET` binding
- Helper: `getObject(bucket, path)`, `putObject(bucket, path, body, options)`
- Map R2 responses to Supabase shapes
- Handle R2 errors → Supabase error codes

**Tests:** Integration — upload/download binary content, verify R2 state.

### Sub-phase 3.2: Bucket Management

#### 3.2.1 — D1 Bucket Metadata
- CRUD operations on `storage_buckets` D1 table
- Validation: bucket name format, duplicate check
- Default values from config

**Tests:** Integration — create, list, get, update, delete buckets.

#### 3.2.2 — Bucket Validation
- Name validation: alphanumeric, hyphens, underscores, max length
- Public/private flag enforcement
- `fileSizeLimit` and `allowedMimeTypes` storage/usage

**Tests:** Unit — validator functions. Integration — create bucket with various options.

### Sub-phase 3.3: Object Operations

#### 3.3.1 — Upload
- `POST /storage/v1/object/{bucket}` with binary body
- Parse `x-upsert`, `x-cache-control`, `content-type` headers
- Check size limit, MIME type against bucket config
- Write to R2, register in D1 `storage_objects`
- Upsert mode: overwrite if exists

**Tests:** Integration — upload text/binary, upsert, size limit, MIME rejection.

#### 3.3.2 — Download
- `GET /storage/v1/object/{bucket}/{path}`
- Read from R2, return binary with correct headers
- Access control: public bucket OR signed URL OR auth

**Tests:** Integration — download blob, verify content, headers.

#### 3.3.3 — Remove
- `DELETE /storage/v1/object/{bucket}` with JSON body (paths array)
- Delete from R2, remove from D1 registry

**Tests:** Integration — remove single/multiple files.

#### 3.3.4 — Move
- R2: copy to new key, delete old key
- D1: update path in registry
- Verify source gone, destination exists

**Tests:** Integration — move file, verify source deleted, destination present.

#### 3.3.5 — Copy
- R2: copy to new key (source intact)
- D1: new registry entry

**Tests:** Integration — copy file, verify both source and destination exist.

### Sub-phase 3.4: Listing & Metadata

#### 3.4.1 — List (v1)
- `POST /storage/v1/object/{bucket}/list`
- R2 `list()` with prefix, limit, offset
- Return objects + folders (id: null for folders)
- Sort by name/size/created_at

**Tests:** Integration — list root, subfolder, pagination, sort order.

#### 3.4.2 — ListV2
- `POST /storage/v1/object/{bucket}/list/v2`
- Cursor-based pagination
- Separate `objects` and `folders` arrays
- `hasNext` / `nextCursor` for pagination

**Tests:** Integration — cursor pagination, folders vs objects separation.

#### 3.4.3 — Info
- `POST /storage/v1/object/info/{bucket}/{path}`
- R2 `head()` for metadata
- Return: name, size, mimetype, cacheControl, lastModified, eTag

**Tests:** Integration — info on uploaded file, verify fields.

#### 3.4.4 — Exists
- `HEAD /storage/v1/object/{bucket}/{path}`
- R2 `head()` → 200 if exists, 404 if not
- No body, status only

**Tests:** Integration — exists returns true, false.

### Sub-phase 3.5: Signed URLs

#### 3.5.1 — Download Signed URL
- `POST /storage/v1/object/sign/{bucket}` → generate token
- Token: HMAC-SHA256, includes bucket, path, expiry, download flag
- `GET /storage/v1/object/sign/{bucket}/{path}?token=...` → validate + serve

**Tests:** Unit — token encode/decode, expiry. Integration — create URL, download via signed URL, expired URL rejected.

#### 3.5.2 — Batch Signed URLs
- `POST /storage/v1/object/signatures` → multiple URLs
- Return array of `{ url, signedURL, error }`

**Tests:** Integration — batch creation, mixed valid/invalid paths.

#### 3.5.3 — Upload Signed URL
- `POST /storage/v1/upload/resumable` → generate upload token
- Token includes `upsert` flag (baked in)
- `PUT /storage/v1/upload/resumable` → validate token + store file

**Tests:** Unit — upload token. Integration — create upload URL, upload via token, verify file stored.

### Sub-phase 3.6: Public URLs

#### 3.6.1 — Public URL Builder
- `getPublicUrl(path)` — **sync, client-side only**
- No server API call needed
- Construct URL from base URL + bucket + path

**Tests:** Unit — URL construction for public bucket.

### Sub-phase 3.7: Access Control

#### 3.7.1 — Bucket-Level Auth
- Public bucket: anon can read, list
- Private bucket: anon denied, authenticated needs ownership or service_role
- `service_role`: bypass all checks

**Tests:** Integration — access public/private buckets with different auth levels.

#### 3.7.2 — Object-Level Auth
- Upload: authenticated + bucket write permission
- Download: public bucket OR signed URL OR owner/service_role
- Delete/Move/Copy: owner/service_role

**Tests:** Integration — various permission scenarios.

---

## Out of Scope (v1)

- **S3-compatible endpoint** — Supabase storage is not S3 API. Separate endpoint, out of scope.
- **Real-time events** — file upload/delete notifications via WebSocket. **Out of scope.**
- **Resumable/multipart uploads** — large file chunked upload. **Out of scope.**
- **Image transformation** — resize, crop via URL params. **Out of scope.**
- **Vector storage** — `supabase.storage.vectors.*`. **Out of scope.**
- **Storage analytics** — `supabase.storage.analytics.*`. **Out of scope.**
- **Edge Functions** — storage webhooks. **Out of scope.**
- **CDN integration** — Cloudflare CDN caching. **Out of scope.**

---

## Notes

- **R2 bucket naming**: Must match Supabase bucket name format. Cloudflare R2 bucket names use same constraints.
- **Binary handling**: Cloudflare Workers handle binary via `ReadableStream`. Request body passthrough to R2.
- **MIME detection**: Use file extension or `Content-Type` header. Verify against bucket's `allowed_mime_types`.
- **Size enforcement**: Check `Content-Length` header before reading body. Reject early if exceeds limit.
- **Signed URLs**: Same JWT secret as auth (`SUPA_TEENY_JWT_SECRET`). Short-lived tokens.
- **`toBase64()`**: Client-side sync utility. No server implementation needed. Converts Blob/File/ArrayBuffer to base64 string.
- **`getPublicUrl()`**: Client-side sync utility. No server implementation needed. Constructs URL string.
- **Forward compatibility**: R2 storage can migrate to hosted Supabase by changing client URL. Same bucket names, same paths.
- **Empty bucket before delete**: Supabase requires bucket to be empty before deletion. Enforce at API level. Check R2 listing before delete.
- **Folder semantics**: Folders are implicit (prefixes). No actual "folder" objects. Distinguish from files by `id: null` in list responses.
