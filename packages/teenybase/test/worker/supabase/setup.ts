import { $Database, $Env, teenyHono, D1Adapter } from '../../../src/worker';
import { SupabaseCompatExtension } from '../../../src/worker/supabase';
import { SupabaseCompatConfig } from '../../../src/worker/supabase/shared/config';
import { ProvidedEnv } from 'cloudflare:test';
import { Hono } from 'hono';
import { ensureAuthSchema } from '../../../src/worker/supabase/auth/schema';
import { handleSignup } from '../../../src/worker/supabase/auth/signup';
import { handleVerify } from '../../../src/worker/supabase/auth/verify';
import { handleToken } from '../../../src/worker/supabase/auth/token';
import { handleGetUser, handleUpdateUser } from '../../../src/worker/supabase/auth/user';
import { handleLogout } from '../../../src/worker/supabase/auth/logout';
import { handleOTP } from '../../../src/worker/supabase/auth/otp';
import { handleRecover } from '../../../src/worker/supabase/auth/recover';
import { handleResend } from '../../../src/worker/supabase/auth/resend';
import { handleSettings } from '../../../src/worker/supabase/auth/settings';
import {
  handleAdminCreateUser,
  handleAdminListUsers,
  handleAdminGetUser,
  handleAdminUpdateUser,
  handleAdminDeleteUser,
} from '../../../src/worker/supabase/auth/admin/users';
import { handleGenerateLink } from '../../../src/worker/supabase/auth/admin/generateLink';
import type { AuthConfig } from '../../../src/worker/supabase/auth/types';
import type { D1Database } from '@cloudflare/workers-types';
import { HTTPException } from 'hono/http-exception';

type Env = $Env & { Bindings: ProvidedEnv };

const app = new Hono<Env>();

/** Build AuthConfig from env vars with test defaults */
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
  };
}

async function seedD1(db: D1Database) {
  await db.exec(`CREATE TABLE IF NOT EXISTS characters (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`);
  await db.exec(`INSERT OR REPLACE INTO characters (id, name) VALUES (1, 'Luke'), (2, 'Leia'), (3, 'Han')`);

  await db.exec(`CREATE TABLE IF NOT EXISTS countries (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`);
  await db.exec(`INSERT OR REPLACE INTO countries (id, name) VALUES (1, 'Alderaan'), (2, 'Tatooine')`);

  await db.exec(`CREATE TABLE IF NOT EXISTS cities (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_id INTEGER REFERENCES countries(id))`);
  await db.exec(`INSERT OR REPLACE INTO cities (id, name, country_id) VALUES (1, 'Aldera', 1), (2, 'Mos Eisley', 2)`);

  await db.exec(`CREATE TABLE IF NOT EXISTS instruments (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`);
  await db.exec(`INSERT OR REPLACE INTO instruments (id, name) VALUES (1, 'harpsichord')`);

  await db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, message TEXT)`);

  await db.exec(`CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY, title TEXT, tags TEXT)`);
  await db.exec(`INSERT OR REPLACE INTO issues (id, title, tags) VALUES (1, 'Login broken', '["bug","urgent"]')`);
  await db.exec(`INSERT OR REPLACE INTO issues (id, title, tags) VALUES (2, 'Add dark mode', '["feature"]')`);

  await db.exec(`CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY, name TEXT, days TEXT)`);

  await db.exec(`CREATE TABLE IF NOT EXISTS texts (id INTEGER PRIMARY KEY, content TEXT)`);
  await db.exec(`INSERT OR REPLACE INTO texts (id, content) VALUES (2, 'jumps over the lazy dog')`);

  // RLS policies table
  await db.exec(`CREATE TABLE IF NOT EXISTS rls_policies (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, operation TEXT NOT NULL, using_expr TEXT, with_check_expr TEXT, permissive INTEGER DEFAULT 1)`);

  // Seed auth schema
  await ensureAuthSchema(db);
}

app.all('/rest/v1/:table', async (c) => {
  const db = new $Database(c, undefined, new D1Adapter(c.env.PRIMARY_DB), c.env.PRIMARY_R2);

  await seedD1(c.env.PRIMARY_DB);

  const config: SupabaseCompatConfig = {
    enabled: true,
    anonKey: c.env.SUPAFLARE_ANON_KEY,
    serviceKey: c.env.SUPAFLARE_SERVICE_KEY,
    jwtSecret: c.env.SUPAFLARE_JWT_SECRET,
    jwtExpiry: parseInt(c.env.SUPAFLARE_JWT_EXPIRY, 10) || 3600,
    signedUrlExpiry: parseInt(c.env.SUPAFLARE_SIGNED_URL_EXPIRY, 10) || 600,
  };
  const ext = new SupabaseCompatExtension(db, config);
  db.extensions.push(ext);

  const method = c.req.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head';
  const route = ext.routes.find((r) => r.method === method && r.path === '/rest/v1/:table');
  if (!route) return c.json({ error: 'method not allowed' }, { status: 405 });
  const params = c.req.param();
  let body: unknown = null;
  if (['post', 'put', 'patch'].includes(method)) {
    body = await c.req.json().catch(() => null);
  }

  try {
    const result = await (route.handler as any)(body, params);
    if (result instanceof Response) return result;
    if (result && typeof result === 'object' && '__status' in result) {
      return c.body(null, { status: (result as any).__status });
    }
    const status = method === 'post' ? 201 : 200;
    return c.json(result, { status });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e && typeof e === 'object' && 'status' in e && typeof e.status === 'number') {
      try {
        const msg = e.message || '';
        const parsed = JSON.parse(msg);
        return c.json(parsed, { status: e.status });
      } catch {
        return c.json({ message: e.message || 'error' }, { status: e.status });
      }
    }
    throw err;
  }
});

// ─── Auth routes ───

app.post('/auth/v1/signup', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? '127.0.0.1';
  return handleSignup(c.env.PRIMARY_DB, body, authConfig, clientIp);
});

app.post('/auth/v1/verify', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  return handleVerify(c.env.PRIMARY_DB, body, authConfig);
});

function authJsonError(c: any, message: string, status: number) {
  return c.json({ code: message, message, details: null, hint: null }, { status });
}

function authErrorToResponse(c: any, err: unknown, authConfig: AuthConfig) {
  // HTTPException from throwAuthError — message is JSON body
  if (err instanceof HTTPException) {
    try {
      const parsed = JSON.parse(err.message);
      return c.json(parsed, { status: err.status });
    } catch {
      return c.json({ code: 'error', message: err.message, details: null, hint: null }, { status: err.status });
    }
  }
  // Plain error with .status and .code (from verifyJWT or throwAuthError alternative)
  const e = err as { code?: string; status?: number; message?: string };
  if (e && typeof e === 'object' && 'status' in e && typeof e.status === 'number') {
    return c.json(
      { code: e.code || 'error', message: e.message || 'error', details: null, hint: null },
      { status: e.status },
    );
  }
  return null;
}

app.post('/auth/v1/token', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const grantType = c.req.query('grant_type') ?? '';
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  try {
    const result = await handleToken(c.env.PRIMARY_DB, body, grantType, authConfig);
    return c.json(result, { status: 200 });
  } catch (err: unknown) {
    const resp = authErrorToResponse(c, err, authConfig);
    if (resp) return resp;
    throw err;
  }
});

app.get('/auth/v1/user', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const authHeader = c.req.header('Authorization') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  try {
    const result = await handleGetUser(c.env.PRIMARY_DB, authHeader, authConfig);
    return c.json(result, { status: 200 });
  } catch (err: unknown) {
    const resp = authErrorToResponse(c, err, authConfig);
    if (resp) return resp;
    throw err;
  }
});

app.put('/auth/v1/user', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const authHeader = c.req.header('Authorization') ?? '';
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  try {
    const result = await handleUpdateUser(c.env.PRIMARY_DB, authHeader, body, authConfig);
    return c.json(result, { status: 200 });
  } catch (err: unknown) {
    const resp = authErrorToResponse(c, err, authConfig);
    if (resp) return resp;
    throw err;
  }
});

app.post('/auth/v1/logout', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const authHeader = c.req.header('Authorization') ?? '';
  const scope = c.req.query('scope') ?? 'global';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  try {
    await handleLogout(c.env.PRIMARY_DB, authHeader, scope, authConfig);
    return c.body(null, { status: 204 });
  } catch (err: unknown) {
    const resp = authErrorToResponse(c, err, authConfig);
    if (resp) return resp;
    throw err;
  }
});

app.post('/auth/v1/otp', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  return handleOTP(c.env.PRIMARY_DB, body, authConfig);
});

app.post('/auth/v1/recover', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  return handleRecover(c.env.PRIMARY_DB, body, authConfig);
});

app.post('/auth/v1/resend', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const body = await c.req.json().catch(() => ({}));
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  return handleResend(c.env.PRIMARY_DB, body, authConfig);
});

app.get('/auth/v1/settings', async (c) => {
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  return c.json(handleSettings(authConfig), { status: 200 });
});

// Admin routes — require service_role key
app.post('/auth/v1/admin/users', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const apikey = c.req.header('apikey') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  if (apikey !== authConfig.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required', details: null, hint: null }, { status: 403 });
  }
  const body = await c.req.json().catch(() => ({}));
  return handleAdminCreateUser(c.env.PRIMARY_DB, body, authConfig);
});

app.get('/auth/v1/admin/users', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const apikey = c.req.header('apikey') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  if (apikey !== authConfig.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required', details: null, hint: null }, { status: 403 });
  }
  return handleAdminListUsers(c.env.PRIMARY_DB, {
    page: c.req.query('page') ?? undefined,
    per_page: c.req.query('per_page') ?? undefined,
  }, authConfig);
});

app.get('/auth/v1/admin/users/:uid', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const apikey = c.req.header('apikey') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  if (apikey !== authConfig.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required', details: null, hint: null }, { status: 403 });
  }
  return handleAdminGetUser(c.env.PRIMARY_DB, c.req.param('uid'), authConfig);
});

app.put('/auth/v1/admin/users/:uid', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const apikey = c.req.header('apikey') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  if (apikey !== authConfig.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required', details: null, hint: null }, { status: 403 });
  }
  const body = await c.req.json().catch(() => ({}));
  return handleAdminUpdateUser(c.env.PRIMARY_DB, c.req.param('uid'), body, authConfig);
});

app.delete('/auth/v1/admin/users/:uid', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const apikey = c.req.header('apikey') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  if (apikey !== authConfig.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required', details: null, hint: null }, { status: 403 });
  }
  return handleAdminDeleteUser(c.env.PRIMARY_DB, c.req.param('uid'), {
    should_soft_delete: c.req.query('should_soft_delete') ?? undefined,
  }, authConfig);
});

app.post('/auth/v1/admin/generate_link', async (c) => {
  await ensureAuthSchema(c.env.PRIMARY_DB);
  const apikey = c.req.header('apikey') ?? '';
  const authConfig = buildAuthConfig(c.env as Record<string, string | undefined>);
  if (apikey !== authConfig.serviceKey) {
    return c.json({ code: 'forbidden', message: 'service_role required', details: null, hint: null }, { status: 403 });
  }
  const body = await c.req.json().catch(() => ({}));
  return handleGenerateLink(c.env.PRIMARY_DB, body, authConfig);
});

export default app;
