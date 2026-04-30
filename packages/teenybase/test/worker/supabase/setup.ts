import { $Database, $Env, teenyHono, D1Adapter } from '../../../src/worker';
import { SupabaseCompatExtension } from '../../../src/worker/supabase';
import { SupabaseCompatConfig } from '../../../src/worker/supabase/shared/config';
import { ProvidedEnv } from 'cloudflare:test';
import { Hono } from 'hono';

type Env = $Env & { Bindings: ProvidedEnv };

const app = new Hono<Env>();

// Seed D1 tables and data before each test run
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
  await db.exec(`INSERT OR REPLACE INTO texts (id, content) VALUES (1, 'The quick brown fox')`);
  await db.exec(`INSERT OR REPLACE INTO texts (id, content) VALUES (2, 'jumps over the lazy dog')`);
}

app.all('/rest/v1/:table', async (c) => {
  const db = new $Database(c, undefined, new D1Adapter(c.env.PRIMARY_DB), c.env.PRIMARY_R2);

  // Seed data for tests
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
    // If handler returned a Response object, forward it
    if (result instanceof Response) return result;
    // Handle 204 No Content
    if (result && typeof result === 'object' && '__status' in result) {
      return c.body(null, { status: (result as any).__status });
    }
    // Determine status: POST = 201 (Created), PATCH/DELETE = 200 (OK)
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

export default app;
