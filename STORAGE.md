# Phase 3: Supabase Storage REST API Compatibility

## Goal

Implement Supabase Storage API endpoints (`/storage/v1/object/*`) so that `supabase.storage.from('bucket').upload()`, `.download()`, `.list()`, etc. work against R2 (or S3-compatible storage). Unlike Teenybase's file-attachment model (files tied to table records), this provides a general-purpose bucket/object storage system.

## Supabase Storage API Surface

```
PUT    /storage/v1/object/{bucket}/{path}    → upload
POST   /storage/v1/object/{bucket}/{path}    → upload (multipart)
GET    /storage/v1/object/{bucket}/{path}    → download
DELETE /storage/v1/object/{bucket}/{path}    → delete (single)
POST   /storage/v1/object/{bucket}           → delete (batch)
POST   /storage/v1/object/{bucket}/{path}    → move (x-headers: destination)
POST   /storage/v1/object/{bucket}/{path}    → copy (x-headers: destination)
POST   /storage/v1/object/sign/{bucket}/{path} → create signed URL
GET    /storage/v1/object/sign/{bucket}/{path} → access via signed URL
GET    /storage/v1/object/public/{bucket}/{path} → public URL access
POST   /storage/v1/bucket                     → create bucket
GET    /storage/v1/bucket                     → list buckets
GET    /storage/v1/bucket/{id}                → get bucket
PUT    /storage/v1/bucket/{id}                → update bucket
DELETE /storage/v1/bucket/{id}                → delete bucket
POST   /storage/v1/bucket/{id}/empty          → empty bucket
GET    /storage/v1/list                        → search/list objects
POST   /storage/v1/cache/sign                 → cache signed URLs (optional)
```

## Tasks

### 3.1 Bucket Metadata Table
Create D1 table for bucket metadata (R2 stores objects, not bucket metadata):

```sql
CREATE TABLE storage_buckets (
    id TEXT PRIMARY KEY,              -- bucket name
    name TEXT UNIQUE NOT NULL,
    owner TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    public BOOLEAN DEFAULT FALSE,
    avif_autodetection BOOLEAN DEFAULT FALSE,
    file_size_limit INTEGER,           -- max file size in bytes
    allowed_mime_types TEXT            -- JSON array of allowed MIME types
);
```

**Output:** Migration to create table.
**Difficulty:** Easy
**Effort:** 1 day

### 3.2 Route Registration (`router.ts`)
Register all `/storage/v1/*` routes:

- `/storage/v1/bucket` (GET, POST)
- `/storage/v1/bucket/{id}` (GET, PUT, DELETE)
- `/storage/v1/bucket/{id}/empty` (POST)
- `/storage/v1/object/{bucket}/{path}` (PUT, POST, GET, DELETE)
- `/storage/v1/object/{bucket}` (POST — batch delete)
- `/storage/v1/object/sign/{bucket}/{path}` (POST, GET)
- `/storage/v1/object/public/{bucket}/{path}` (GET)
- `/storage/v1/list` (GET)

**Output:** Hono routes dispatching to handlers.
**Difficulty:** Easy
**Effort:** 1 day

### 3.3 Bucket CRUD (`buckets.ts`)
Implement bucket management endpoints:

**POST /storage/v1/bucket** — Create bucket:
```json
{ "id": "avatars", "name": "avatars", "public": false }
```
- Validate bucket name (alphanumeric, hyphens, max 100 chars)
- Insert into `storage_buckets` table
- Create R2 bucket if not exists
- Return `{ message: "Bucket created" }`

**GET /storage/v1/bucket** — List all buckets:
- Query `storage_buckets` table
- Return array of bucket objects

**GET /storage/v1/bucket/{id}** — Get single bucket:
- Look up by ID
- Return bucket details or 404

**PUT /storage/v1/bucket/{id}** — Update bucket:
- Update metadata (name, public, limits)

**DELETE /storage/v1/bucket/{id}** — Delete bucket:
- Delete metadata row
- Delete all objects in R2 bucket (or require empty first)

**POST /storage/v1/bucket/{id}/empty** — Empty bucket:
- List and delete all objects in R2 bucket
- Keep bucket metadata

**Difficulty:** Easy
**Effort:** 2-3 days

### 3.4 Upload (`upload.ts`)
`PUT /storage/v1/object/{bucket}/{path}`

**Sub-tasks:**
- Validate bucket exists
- Check file size limits
- Check allowed MIME types
- Validate path (no `..`, max length, allowed characters)
- Upload to R2: `bucket.put(path, body, { httpMetadata, customMetadata })`
- Store metadata in R2 object (owner, content-type, cache-control)
- Return `{ Key: "{bucket}/{path}" }`

**Multipart upload** (`POST` with `Content-Type: multipart/form-data`):
- Parse `multipart/form-data` body
- Extract file from `cache-control` + file fields
- Same validation as PUT

**Upsert** (overwrite existing):
- R2's `put()` overwrites by default — no extra work needed
- Optional header to reject if exists

**Difficulty:** Medium
**Effort:** 3-4 days

**Gotchas:**
- R2 supports large objects natively (multipart upload is automatic for large files via the Workers API)
- Path encoding: URL path segments need decoding (spaces, special chars)
- Content-type detection: if not provided, infer from file extension

### 3.5 Download (`download.ts`)
`GET /storage/v1/object/{bucket}/{path}`

**Sub-tasks:**
- Look up object in R2: `bucket.get(path)`
- Return 404 if not found
- Set response headers:
  - `Content-Type` from `httpMetadata.contentType`
  - `Content-Length` from `size`
  - `ETag` from `httpEtag`
  - `Cache-Control` from `httpMetadata.cacheControl`
  - `Accept-Ranges: bytes` (for range requests)
- Support range requests (`Range: bytes=0-999`) for large files

**Difficulty:** Easy
**Effort:** 1-2 days

### 3.6 List Objects (`list.ts`)
`POST /storage/v1/list` with body:
```json
{
  "prefix": "avatars/",
  "limit": 100,
  "offset": 0,
  "sortBy": { "column": "name", "order": "asc" }
}
```

**Sub-tasks:**
- Use R2 `list({ prefix, limit, startAfter })` to enumerate objects
- Return array of `{ name, id, updated_at, created_at, metadata }`
- Support pagination via `startAfter` cursor
- Support filtering by prefix (folder-like behavior)

**Difficulty:** Medium
**Effort:** 2-3 days

**Gotchas:**
- R2 `list()` returns objects in lexicographic order — sorting options may require fetching all and sorting in-memory (acceptable for reasonable limits)
- R2 doesn't have a native `offset` — use `startAfter` cursor pagination instead
- Supabase Storage API expects offset-based pagination — need to bridge this gap

### 3.7 Delete (`remove.ts`)
`DELETE /storage/v1/object/{bucket}/{path}` — Single delete
`POST /storage/v1/object/{bucket}` — Batch delete with body `{ prefixes: ["path1", "path2"] }`

**Sub-tasks:**
- Single: `bucket.delete(path)`
- Batch: `bucket.delete(prefixes[])` (R2 supports batch delete)
- Return `{ message: "Deleted" }` or per-object status for batch

**Difficulty:** Easy
**Effort:** 1 day

### 3.8 Move (`move.ts`)
`POST /storage/v1/object/{bucket}/{path}` with header `x-forwarded-to: new-path`

**Sub-tasks:**
- Get source object from R2
- Put to destination path (copy metadata)
- Delete source object
- Return `{ message: "Moved" }`

**Difficulty:** Easy
**Effort:** 1 day

### 3.9 Copy (`copy.ts`)
`POST /storage/v1/object/{bucket}/{path}` with header `x-forward-to: dest-path`

**Sub-tasks:**
- Get source object from R2
- Put to destination (same data, copy metadata)
- Don't delete source
- Return `{ message: "Copied" }`

**Difficulty:** Easy
**Effort:** 1 day

### 3.10 Signed URLs (`signedUrl.ts`)
`POST /storage/v1/object/sign/{bucket}/{path}` — Create signed URL:
```json
{ "expiresIn": 3600, "transform": { "width": 200 } }
```

**Sub-tasks:**
- Generate JWT-signed URL with expiry
- JWT payload: `{ bucket, path, exp, ... }`
- Sign with the project's JWT secret
- Return `{ signedURL: "/storage/v1/object/sign/{bucket}/{path}?token=..." }`

`GET /storage/v1/object/sign/{bucket}/{path}?token=xxx` — Access via signed URL:
- Verify JWT token (signature + expiry)
- If valid, serve the object (same as download)
- If invalid/expired, return 403

**Difficulty:** Medium
**Effort:** 2-3 days

**Gotchas:**
- Supabase uses HMAC-SHA256 with the project's JWT secret to sign URLs
- The signed URL format includes the token as a query parameter
- URL must be shareable — no auth header required

### 3.11 Public Object Access
`GET /storage/v1/object/public/{bucket}/{path}`

- If bucket is marked `public: true`, serve the object directly (no auth required)
- If bucket is private, return 403
- Same response format as regular download

**Difficulty:** Easy
**Effort:** 1 day

### 3.12 R2 vs S3 Backend
R2 is S3-compatible and works natively with Cloudflare Workers. For the Supabase Storage REST API, R2 is the natural backend.

**Decision:** Use R2 directly (not S3 emulation) for v1. S3-compatible endpoint (`/storage/v1/s3/*`) is a separate, larger undertaking that can be deferred.

**R2 operations used:**
- `bucket.put(key, value, options)` — upload
- `bucket.get(key, options)` — download
- `bucket.head(key)` — metadata check
- `bucket.delete(key | keys[])` — delete
- `bucket.list({ prefix, limit, startAfter })` — list

**All map directly to Supabase Storage operations.**

### 3.13 Auth Integration (RLS Policies)
Supabase Storage enforces bucket-level policies. Implement a simple policy system:

```sql
CREATE TABLE storage_policies (
    id TEXT PRIMARY KEY,
    bucket_id TEXT REFERENCES storage_buckets(id),
    name TEXT NOT NULL,
    operation TEXT NOT NULL,  -- 'select', 'insert', 'update', 'delete'
    definition TEXT NOT NULL  -- SQL expression or simple rule
);
```

**Simple policy model for v1:**
- `public: true` on bucket → anyone can read
- Authenticated user can upload to their own path (e.g., `avatars/{user_id}/*`)
- Admin (service role) bypasses all policies
- Custom policies expressed as SQL expressions evaluated against auth context

**Difficulty:** Medium
**Effort:** 2-3 days

**Gotchas:**
- Full Supabase Storage RLS uses Postgres policies. Our SQLite version will be simpler.
- Policy evaluation needs access to the auth context (user ID, role) from the JWT.

### 3.14 Image Transformations (Optional, skip for v1)
Supabase supports on-the-fly image resizing:
```
/storage/v1/render/image/resize/avatars/photo.jpg?width=200&height=200
```

This requires an image processing library (e.g., `@cloudflare/images`) and is a significant addition. **Skip for v1.**

## Response Format

### Success Responses
```json
// Upload
{ "Key": "avatars/user-123/photo.jpg" }

// List
{ "name": "avatars/", "id": "avatars/", "updated_at": "...", "created_at": "..." }

// Signed URL
{ "signedURL": "/storage/v1/object/sign/bucket/path?token=..." }

// Bucket CRUD
{ "id": "avatars", "name": "avatars", "public": false, ... }
```

### Error Format
```json
{
  "statusCode": 400,
  "error": "Invalid bucket name",
  "message": "Bucket name must be alphanumeric with hyphens"
}
```

## Testing

- Unit tests for bucket CRUD, path validation, signed URL generation
- Integration tests using `@supabase/supabase-js`:
  ```js
  const { data, error } = await supabase.storage.from('avatars').upload('user/1.jpg', file)
  const { data, error } = await supabase.storage.from('avatars').download('user/1.jpg')
  const { data, error } = await supabase.storage.from('avatars').list('user/')
  const { data, error } = await supabase.storage.from('avatars').remove(['user/1.jpg'])
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl('user/1.jpg', 3600)
  const { data, error } = await supabase.storage.from('avatars').move('old/path.jpg', 'new/path.jpg')
  const { data, error } = await supabase.storage.from('avatars').copy('src.jpg', 'dst.jpg')
  const { data, error } = await supabase.storage.createBucket('documents', { public: false })
  const { data, error } = await supabase.storage.listBuckets()
  ```

## Phase 3 Dependencies

- R2 bucket binding in Cloudflare Workers (already supported by Teenybase)
- Phase 2 (auth) for policy enforcement (optional — can build storage without auth first)

## Phase 3 Deliverables

1. Full bucket CRUD (create, list, get, update, delete, empty)
2. Object upload/download/delete/move/copy
3. Object listing with prefix filtering and pagination
4. Signed URL generation and verification
5. Public bucket access
6. Basic policy enforcement (public vs private, user-scoped paths)
7. Integration test suite passing against supabase-js client
