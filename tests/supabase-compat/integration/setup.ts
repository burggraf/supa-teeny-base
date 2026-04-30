import { $Database, $Env, teenyHono, D1Adapter } from '../../../packages/teenybase/src/worker';
import { SupabaseCompatExtension } from '../../../packages/teenybase/src/worker/supabase';
import { ProvidedEnv } from 'cloudflare:test';
import { Hono } from 'hono';

type Env = $Env & { Bindings: ProvidedEnv };

// Create the teenybase Hono app
const teenyApp = teenyHono<Env>(async (c) => {
  const db = new $Database(c, undefined, new D1Adapter(c.env.PRIMARY_DB), c.env.PRIMARY_R2);
  db.extensions.push(new SupabaseCompatExtension(db, { enabled: true }));
  return db;
});

// Mount teenybase at /api/* and also at root so /rest/v1/* etc. work
const app = new Hono<Env>();
app.route('/', teenyApp);

export default app;
