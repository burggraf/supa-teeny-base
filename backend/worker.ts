import { $Database, $Env, D1Adapter } from 'teenybase/worker'
import { SupabaseCompatExtension } from 'teenybase/worker/supabase'
import { SupabaseCompatConfig } from 'teenybase/worker/supabase/shared/config'
import { ensureAuthSchema } from 'teenybase/worker/supabase/auth/schema'
import { handleSignup } from 'teenybase/worker/supabase/auth/signup'
import { handleVerify } from 'teenybase/worker/supabase/auth/verify'
import { handleToken } from 'teenybase/worker/supabase/auth/token'
import { handleGetUser, handleUpdateUser } from 'teenybase/worker/supabase/auth/user'
import { handleLogout } from 'teenybase/worker/supabase/auth/logout'
import { handleOTP } from 'teenybase/worker/supabase/auth/otp'
import { handleRecover } from 'teenybase/worker/supabase/auth/recover'
import { handleResend } from 'teenybase/worker/supabase/auth/resend'
import { handleSettings } from 'teenybase/worker/supabase/auth/settings'
import {
  handleAdminCreateUser,
  handleAdminListUsers,
  handleAdminGetUser,
  handleAdminUpdateUser,
  handleAdminDeleteUser,
} from 'teenybase/worker/supabase/auth/admin/users'
import { handleGenerateLink } from 'teenybase/worker/supabase/auth/admin/generateLink'
import type { AuthConfig } from 'teenybase/worker/supabase/auth/types'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

interface Env extends $Env {
  Bindings: {
    PRIMARY_DB: D1Database
    PRIMARY_R2: R2Bucket
    SUPAFLARE_JWT_SECRET: string
    SUPAFLARE_ANON_KEY: string
    SUPAFLARE_SERVICE_KEY: string
    SUPAFLARE_JWT_EXPIRY: string
    SUPAFLARE_SIGNED_URL_EXPIRY: string
  }
}

function buildAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  return {
    jwtSecret: env.SUPAFLARE_JWT_SECRET ?? 'test-jwt-secret-at-least-32-chars!',
    jwtExpiry: parseInt(env.SUPAFLARE_JWT_EXPIRY ?? '3600', 10),
    anonKey: env.SUPAFLARE_ANON_KEY ?? 'sb-anon-test-key',
    serviceKey: env.SUPAFLARE_SERVICE_KEY ?? 'sb-service-test-key',
    emailConfirmRequired: false,
    emailAutoConfirm: true,
    passwordMinLength: 6,
    signupEnabled: true,
  }
}

// Decode JWT payload to get user id (sub claim) — no signature check,
// just extracting the uid. The extension verifies the signature.
function getUserIdFromAuth(c: Context<Env>): string | null {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const parts = token.split('.')
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='))
    )
    return payload.sub || null
  } catch {
    return null
  }
}

// ── Supabase Compat REST handler factory ────────────────────
function createRestHandler(method: string) {
  return async (c: Context<Env>) => {
    const db = c.get('$db') as $Database<Env>
    const config: SupabaseCompatConfig = {
      enabled: true,
      anonKey: c.env.SUPAFLARE_ANON_KEY || 'sb-anon-test-key',
      serviceKey: c.env.SUPAFLARE_SERVICE_KEY || 'sb-service-test-key',
      jwtSecret: c.env.SUPAFLARE_JWT_SECRET || 'test-jwt-secret-at-least-32-chars!',
      jwtExpiry: parseInt(c.env.SUPAFLARE_JWT_EXPIRY || '3600', 10),
      signedUrlExpiry: parseInt(c.env.SUPAFLARE_SIGNED_URL_EXPIRY || '600', 10),
    }

    const ext = new SupabaseCompatExtension(db, config)
    db.extensions.push(ext)

    const route = ext.routes.find((r) => r.method === method && r.path === '/rest/v1/:table')
    if (!route) return c.json({ error: 'method not allowed' }, { status: 405 })

    let body: unknown = null
    if (['post', 'put', 'patch'].includes(method)) {
      body = await c.req.json().catch(() => null)
    }

    // RLS: auto-inject user_id from JWT on POST to tasks
    const table = c.req.param('table')
    if (method === 'post' && table === 'tasks' && body && typeof body === 'object' && !Array.isArray(body)) {
      const uid = getUserIdFromAuth(c)
      if (uid) (body as Record<string, unknown>).user_id = uid
    }

    const params = c.req.param()
    try {
      const result = await (route.handler as any)(body, params)
      if (result instanceof Response) return result
      const status = method === 'post' ? 201 : 200
      return c.json(result, { status })
    } catch (err: any) {
      const status = err?.status ?? 500
      const msg = err?.message || 'Internal error'
      console.error(`REST ${method} error:`, err)
      try {
        const parsed = JSON.parse(msg)
        return c.json(parsed, { status })
      } catch {
        return c.json({ code: status, message: msg }, { status })
      }
    }
  }
}

// ── Auth helpers ────────────────────────────────────────────
async function jsonBody(c: Context<Env>) {
  return c.req.json().catch(() => ({}))
}

function clientIp(c: Context<Env>) {
  return c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1'
}

async function ensureAuth(c: Context<Env>) {
  await ensureAuthSchema(c.env.PRIMARY_DB)
  return buildAuthConfig(c.env as Record<string, string | undefined>)
}

async function adminCheck(c: Context<Env>): Promise<AuthConfig | Response> {
  await ensureAuthSchema(c.env.PRIMARY_DB)
  const cfg = buildAuthConfig(c.env as Record<string, string | undefined>)
  const apikey = c.req.header('apikey') ?? ''
  if (apikey !== cfg.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required' }, { status: 403 })
  }
  return cfg
}

// ── Build Hono app ──────────────────────────────────────────
const app = new Hono<Env>()

app.onError((err, c) => {
  const msg = err instanceof Error ? err.message : 'Internal error'
  const status = (err as any)?.status ?? 500
  return c.json({ code: status, message: msg }, { status })
})

app.use(logger())

app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
  exposeHeaders: ['*'],
  maxAge: 600,
  credentials: true,
}))

// Seed flag
let _seeded = false

// $db middleware — creates $Database + seeds RLS policies
app.use('*', async (c, next) => {
  const d1 = c.env.PRIMARY_DB

  if (!_seeded) {
    _seeded = true
    try {
      // Create tasks table (no hardcoded seed data — each user starts empty)
      await d1.prepare(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          priority TEXT DEFAULT 'medium',
          status TEXT DEFAULT 'todo',
          due_date TEXT,
          user_id TEXT,
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
          updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        )
      `).run()

      // Ensure auth schema
      await ensureAuthSchema(d1)

      // Seed RLS policies for tasks table (Phase 1F — Row-Level Security)
      await d1.prepare(`
        CREATE TABLE IF NOT EXISTS rls_policies (
          id TEXT PRIMARY KEY,
          table_name TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          operation TEXT NOT NULL,
          using_expr TEXT,
          with_check_expr TEXT,
          permissive INTEGER DEFAULT 1
        )
      `).run()

      // Check if policies already seeded
      const { results } = await d1.prepare("SELECT COUNT(*) as cnt FROM rls_policies WHERE table_name = 'tasks'").all()
      if ((results as any)?.[0]?.cnt === 0) {
        await d1.prepare(`
          INSERT INTO rls_policies (id, table_name, name, role, operation, using_expr, permissive) VALUES
            ('tasks-select-auth', 'tasks', 'users_can_read_own_tasks', 'authenticated', 'SELECT', 'user_id == auth.uid()', 1),
            ('tasks-update-auth', 'tasks', 'users_can_update_own_tasks', 'authenticated', 'UPDATE', 'user_id == auth.uid()', 1),
            ('tasks-delete-auth', 'tasks', 'users_can_delete_own_tasks', 'authenticated', 'DELETE', 'user_id == auth.uid()', 1)
        `).run()
      }
    } catch (e) {
      console.error('Seed error:', e)
      _seeded = false
    }
  }

  const db = new $Database(c, undefined, new D1Adapter(d1), c.env.PRIMARY_R2)
  c.set('$db', db)
  return next()
})

// ── REST routes ─────────────────────────────────────────────
app.get('/rest/v1/:table', createRestHandler('get'))
app.post('/rest/v1/:table', createRestHandler('post'))
app.patch('/rest/v1/:table', createRestHandler('patch'))
app.delete('/rest/v1/:table', createRestHandler('delete'))

// ── Auth routes ─────────────────────────────────────────────
app.post('/auth/v1/signup', async (c) => {
  const cfg = await ensureAuth(c)
  const body = await jsonBody(c)
  return handleSignup(c.env.PRIMARY_DB, body, cfg, clientIp(c))
})

app.post('/auth/v1/verify', async (c) => {
  const cfg = await ensureAuth(c)
  const body = await jsonBody(c)
  return c.json(await handleVerify(c.env.PRIMARY_DB, body, cfg))
})

app.post('/auth/v1/token', async (c) => {
  const cfg = await ensureAuth(c)
  const body = await jsonBody(c)
  const grantType = c.req.query('grant_type') || ''
  return c.json(await handleToken(c.env.PRIMARY_DB, body, grantType, cfg))
})

app.get('/auth/v1/user', async (c) => {
  const cfg = await ensureAuth(c)
  const authHeader = c.req.header('Authorization') || ''
  return c.json(await handleGetUser(c.env.PRIMARY_DB, authHeader, cfg))
})

app.put('/auth/v1/user', async (c) => {
  const cfg = await ensureAuth(c)
  const authHeader = c.req.header('Authorization') || ''
  const body = await jsonBody(c)
  return c.json(await handleUpdateUser(c.env.PRIMARY_DB, authHeader, body, cfg))
})

app.post('/auth/v1/logout', async (c) => {
  const cfg = await ensureAuth(c)
  const authHeader = c.req.header('Authorization') || ''
  const scope = c.req.query('scope') || 'global'
  await handleLogout(c.env.PRIMARY_DB, authHeader, scope, cfg)
  return c.body(null, { status: 204 })
})

app.post('/auth/v1/otp', async (c) => {
  const cfg = await ensureAuth(c)
  const body = await jsonBody(c)
  return c.json(await handleOTP(c.env.PRIMARY_DB, body, cfg, clientIp(c)))
})

app.post('/auth/v1/recover', async (c) => {
  const cfg = await ensureAuth(c)
  const body = await jsonBody(c)
  return c.json(await handleRecover(c.env.PRIMARY_DB, body, cfg, clientIp(c)))
})

app.post('/auth/v1/resend', async (c) => {
  const cfg = await ensureAuth(c)
  const body = await jsonBody(c)
  return c.json(await handleResend(c.env.PRIMARY_DB, body, cfg, clientIp(c)))
})

app.get('/auth/v1/settings', async (c) => {
  const cfg = buildAuthConfig(c.env as Record<string, string | undefined>)
  return c.json(handleSettings(cfg))
})

// ── Admin routes ────────────────────────────────────────────
app.post('/auth/v1/admin/users', async (c) => {
  const r = await adminCheck(c)
  if (r instanceof Response) return r
  const body = await jsonBody(c)
  return handleAdminCreateUser(c.env.PRIMARY_DB, body, r)
})

app.get('/auth/v1/admin/users', async (c) => {
  const r = await adminCheck(c)
  if (r instanceof Response) return r
  return handleAdminListUsers(c.env.PRIMARY_DB, {
    page: parseInt(c.req.query('page') || '1', 10),
    per_page: parseInt(c.req.query('per_page') || '50', 10),
  }, r)
})

app.get('/auth/v1/admin/users/:uid', async (c) => {
  const r = await adminCheck(c)
  if (r instanceof Response) return r
  return handleAdminGetUser(c.env.PRIMARY_DB, c.req.param('uid'), r)
})

app.put('/auth/v1/admin/users/:uid', async (c) => {
  const r = await adminCheck(c)
  if (r instanceof Response) return r
  const body = await jsonBody(c)
  return handleAdminUpdateUser(c.env.PRIMARY_DB, c.req.param('uid'), body, r)
})

app.delete('/auth/v1/admin/users/:uid', async (c) => {
  const r = await adminCheck(c)
  if (r instanceof Response) return r
  return handleAdminDeleteUser(c.env.PRIMARY_DB, c.req.param('uid'), {
    should_soft_delete: c.req.query('should_soft_delete') ?? undefined,
  }, r)
})

app.post('/auth/v1/admin/generate_link', async (c) => {
  const r = await adminCheck(c)
  if (r instanceof Response) return r
  const body = await jsonBody(c)
  return handleGenerateLink(c.env.PRIMARY_DB, body, r)
})

// Health
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

export default app
