# Code Context

## Files Retrieved

1. `packages/teenybase/src/worker/honoApp.ts` (full, 68 lines) — routing middleware, how `$db` is created and routes wired
2. `packages/teenybase/src/worker/$DBExtension.ts` (full, 13 lines) — `$DBExtension` interface
3. `packages/teenybase/src/worker/$Database.ts` (lines 1-80, 312-380, 1270-1310) — class definition, extensions array, `route()` method, `_initRoutes()` with extension route merging
4. `packages/teenybase/src/types/route.ts` (full, 30 lines) — `HttpRoute`, `RawRouterHandlerFunction` types
5. `packages/teenybase/src/worker/env.ts` (full, 27 lines) — `$Env`, `$CloudflareBindings` types
6. `packages/teenybase/src/types/env.ts` (full, 13 lines) — `AuthContext` interface
7. `packages/teenybase/test/worker/vitest.config.ts` (full) — vitest config with D1/R2 bindings
8. `packages/teenybase/test/worker/sampleHonoApp.ts` (full) — how extensions get wired in tests
9. `packages/teenybase/package.json` — devDependencies section
10. `ls packages/teenybase/test/worker/` — 7 files listed
11. `ls packages/teenybase/src/types/` — type definition directory

## Key Code

### $DBExtension interface (`$DBExtension.ts`, lines 1-13)

```ts
export interface $DBExtension<T extends $Env = $Env>{
    getAuthToken?(): Promise<string | undefined>
    setup?(version: number): Promise<Omit<DBMigration, 'id'> | null | void>
    routes: HttpRoute[]
}
```

Three members: optional `getAuthToken()` for auth, optional `setup()` for migrations, required `routes` array.

### $Database extensions wiring (`$Database.ts`, line 51, 70, 98)

```ts
readonly extensions: $DBExtension<T>[] = []
// constructor:
this.extensions.push(new MigrationHelper(this, this.kv, undefined))
// later if email is configured:
if(this.email) this.extensions.push(this.email)
```

Extensions are pushed in constructor order. Auth resolution iterates extensions (line 194):
```ts
for (const extension of this.extensions) {
    if (extension.getAuthToken) tok = await extension.getAuthToken()
    if (tok) break
}
```

### Extension route merging (`$Database.ts`, lines 1282-1295)

```ts
protected _initRoutes(){
    if(!this.router) this.router = new LinearRouter()
    if(this._routesInit) return this.router

    this.routes.push(
        ...this.extensions.flatMap(e=>e.routes),
    )

    for (const route of this.routes) {
        this.router.add(route.method.toUpperCase(), route.path, this.rawRouteHandler(route))
    }
    this._routesInit = true
    return this.router
}
```

Extensions' routes are flatMap'd into `$Database.routes`, then registered in a `LinearRouter`.

### honoApp.ts routing (`honoApp.ts`, lines 47-63)

```ts
app.use('*', async (c, next) => {
    c.set('$db', await createDb(c))
    if(onRequest) {
        const res = await onRequest(c)
        if(res) return res
    }
    return next()
})
app.use('/api/*', async (c, next) => {
    if(beforeRoute) {
        const res = await beforeRoute(c)
        if(res) return res
    }
    const base = c.req.routePath.replace('/api/*', '')
    const path = c.req.path.replace(base, '')
    let res = (await c.get('$db').route(path))
    if(!res) res = await next()
    return res
})
```

Key: all `/api/*` requests go through `c.get('$db').route(path)`. Extensions add their own routes to `$db.routes` via `_initRoutes()`. The `route()` method (line 317) handles `/api/v1/` prefix and dispatches.

### HttpRoute type (`route.ts`, lines 17-21)

```ts
export type HttpRoute<TBody = Record<string, any>, TParams = Record<string, string>> = {
    handler: RouteFunction<TBody, TParams>,
    path: string,
    method: RouteMethod
    zod: ()=>HttpRouteZod
}
```

`RouteMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'`

### Test pattern (`sampleHonoApp.ts`)

```ts
const app = teenyHono<Env>(async (c)=> {
    const db = new $Database(c, undefined, new D1Adapter(c.env.PRIMARY_DB), c.env.PRIMARY_R2)
    db.extensions.push(new OpenApiExtension(db, true))
    return db
})
```

Tests create `$Database` in `teenyHono` factory, push extensions onto `db.extensions`, return db.

### Vitest config (`vitest.config.ts`)

- Uses `@cloudflare/vitest-pool-workers`
- `main: "./sampleHonoApp.ts"` — entry point
- Bindings: `IS_VITEST`, `RESPOND_WITH_QUERY_LOG`, `RESPOND_WITH_ERRORS`, `ADMIN_SERVICE_TOKEN`, `ADMIN_JWT_SECRET`
- D1: `PRIMARY_DB`, R2: `PRIMARY_R2`
- `compatibilityDate: "2024-08-06"`, `nodejs_compat`

### $Env type (`env.ts`, lines 14-21)

```ts
export interface $Env<Bindings = {}, Variables = {}> {
    Bindings: $CloudflareBindings & Bindings,
    Variables: {
        auth?: AuthContext
        settings: DatabaseSettings
        $db: $Database
    } & Variables
}
```

## Architecture

**Route flow:**
1. `teenyHono()` creates Hono app with middleware stack
2. Per-request: `createDb(c)` builds `$Database` instance, stores in `c.set('$db', db)`
3. `$Database` constructor pushes `MigrationHelper` (and email if configured) to `extensions`
4. Supaflare extension pushes itself: `db.extensions.push(new SupabaseCompatExtension(db))`
5. Request to `/api/*` → `c.get('$db').route(path)` → `$Database.route()` → `_route()` → `_initRoutes()` → LinearRouter match
6. `_initRoutes()` merges all `extension.routes` into db's route table via `flatMap`

**Extension contract:**
- `routes: HttpRoute[]` — array of `{handler, path, method, zod}` objects
- `getAuthToken?()` — called during auth init to extract token from request
- `setup?()` — called during migrations to create extension-specific D1 tables

**Test harness:**
- Uses `cloudflare:test` `SELF` for in-process fetch
- `sampleHonoApp.ts` wraps teenyHono in a root Hono app
- D1/R2 provided by miniflare bindings in vitest config
- Tests hit paths like `/api/v1/users/select` directly

## Start Here

1. **`packages/teenybase/src/worker/$DBExtension.ts`** — smallest file, defines the extension interface. This is the contract your SupabaseCompat extension must implement.
2. **`packages/teenybase/src/worker/honoApp.ts`** — shows how routes get wired. Supaflare routes must integrate via the extension mechanism, not as separate Hono apps.
3. **`packages/teenybase/test/worker/sampleHonoApp.ts`** — test setup pattern. Copy this approach for supaflare tests.

## Directory Status

- **`packages/teenybase/src/worker/supabase/`** — does NOT exist yet. Must be created for Phase 0.
- **`tests/` at project root** — does NOT exist. AGENTS.md references `tests/supabase-compat/` — must be created.
- **`packages/teenybase/src/types/`** — exists with: `config/`, `config.ts`, `dataTypes.ts`, `email.ts`, `env.ts`, `field.ts`, `jwt.ts`, `mailgun.ts`, `resend.ts`, `route.ts`, `sql.ts`, `table.ts`, `tableExtensions.ts`, `zod/`

## devDependencies (teenybase package.json)

```json
{
  "@cloudflare/vitest-pool-workers": "^0.12.10",
  "@types/node": "^22.5.0",
  "concurrently": "^9.2.1",
  "typescript": "^5.9.3",
  "vite": "^7.3.1",
  "vitest": "3.2.4"
}
```

Note: `@supabase/supabase-js` NOT in dependencies yet — needed for integration tests.

## Open Questions / Risks

1. **Route path collision**: Teenybase native routes use `/api/v1/`. Supabase routes use `/rest/v1/`, `/auth/v1/`, `/storage/v1/`. These don't overlap — good. But `honoApp.ts` middleware only matches `/api/*` (line 52). Supabase routes at `/rest/*`, `/auth/*`, `/storage/*` will NOT go through `$db.route()`. They need separate Hono middleware or the honoApp needs modification.
2. **$CloudflareBindings** lacks supabase-specific env vars (`SUPAFLARE_JWT_SECRET`, `SUPAFLARE_ANON_KEY`, etc.). Need to extend or add new binding type.
3. **Extension `setup()`** runs during migrations — supabase auth/storage tables need to be created via this mechanism.
4. **Test catalog** at `scripts/test-catalog/test-catalog.db` — exists, needs to be queried for test extraction before writing tests.
