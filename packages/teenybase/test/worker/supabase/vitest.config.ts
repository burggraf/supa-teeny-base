import path from 'path';
import { fileURLToPath } from 'url';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DATABASE_SETTINGS = JSON.stringify({
  version: 1,
  appUrl: 'http://localhost',
  jwtSecret: 'test-jwt-secret',
  tables: [
    {
      name: 'characters',
      extensions: [],
      fields: [
        { name: 'id', sqlType: 'integer', type: 'number' },
        { name: 'name', sqlType: 'text', type: 'text' },
      ],
    },
    {
      name: 'countries',
      extensions: [],
      fields: [
        { name: 'id', sqlType: 'integer', type: 'number' },
        { name: 'name', sqlType: 'text', type: 'text' },
      ],
    },
    {
      name: 'cities',
      extensions: [],
      fields: [
        { name: 'id', sqlType: 'integer', type: 'number' },
        { name: 'name', sqlType: 'text', type: 'text' },
        { name: 'country_id', sqlType: 'integer', type: 'number', foreignKey: { table: 'countries', column: 'id' } },
      ],
    },
  ],
});

export default defineWorkersConfig({
  test: {
    include: ['test/worker/supabase/**/*.test.ts'],
    poolOptions: {
      workers: {
        main: path.resolve(__dirname, 'setup.ts'),
        singleWorker: true,
        isolatedStorage: true,
        miniflare: {
          compatibilityDate: '2024-08-06',
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            IS_VITEST: true,
            DATABASE_SETTINGS: TEST_DATABASE_SETTINGS,
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
