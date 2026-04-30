import type { $CloudflareBindings } from '../../../packages/teenybase/src/worker/env';
import type { AuthContext } from '../../../packages/teenybase/src/types/env';
import type { DatabaseSettings } from '../../../packages/teenybase/src/types/config';

export interface TestBindings extends $CloudflareBindings {
  IS_VITEST: boolean;
  SUPAFLARE_JWT_SECRET: string;
  SUPAFLARE_ANON_KEY: string;
  SUPAFLARE_SERVICE_KEY: string;
  SUPAFLARE_JWT_EXPIRY: string;
  SUPAFLARE_SIGNED_URL_EXPIRY: string;
}

export interface TestVariables {
  auth?: AuthContext;
  settings: DatabaseSettings;
  $db: unknown;
}

export interface Env {
  Bindings: TestBindings;
  Variables: TestVariables;
}

export const TEST_ANON_KEY = 'sb-anon-test-key';
export const TEST_SERVICE_KEY = 'sb-service-test-key';
export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-chars!';
