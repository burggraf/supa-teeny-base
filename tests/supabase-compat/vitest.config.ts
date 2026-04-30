import path from 'path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const projectRoot = path.resolve(__dirname, '../..');
const teenybaseSrc = path.join(projectRoot, 'packages/teenybase/src/worker');

export default defineWorkersConfig({
  resolve: {
    alias: {
      '~teenybase': teenybaseSrc,
    },
  },
  test: {
    poolOptions: {
      workers: {
        main: path.resolve(__dirname, 'integration/setup.ts'),
        singleWorker: true,
        isolatedStorage: true,
        miniflare: {
          compatibilityDate: '2024-08-06',
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            IS_VITEST: true,
            SUPAFLARE_JWT_SECRET: 'test-jwt-secret-at-least-32-chars!',
            SUPAFLARE_ANON_KEY: 'sb-anon-test-key',
            SUPAFLARE_SERVICE_KEY: 'sb-service-test-key',
            SUPAFLARE_JWT_EXPIRY: '3600',
            SUPAFLARE_SIGNED_URL_EXPIRY: '600',
          },
          d1Databases: ['PRIMARY_DB'],
          r2Buckets: ['PRIMARY_R2'],
        },
      },
    },
  },
});
