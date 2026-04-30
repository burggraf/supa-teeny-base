import { describe, it, expect } from 'vitest';
import { resolveConfig, defaultConfig } from '../../../src/worker/supabase/shared/config';

describe('SupabaseCompatConfig', () => {
  describe('defaultConfig', () => {
    it('has sensible defaults', () => {
      expect(defaultConfig.enabled).toBe(false);
      expect(defaultConfig.jwtExpiry).toBe(3600);
      expect(defaultConfig.signedUrlExpiry).toBe(600);
      expect(defaultConfig.anonKey).toBeUndefined();
      expect(defaultConfig.serviceKey).toBeUndefined();
      expect(defaultConfig.jwtSecret).toBeUndefined();
    });
  });

  describe('resolveConfig', () => {
    it('reads SUPABASE_COMPAT flag', () => {
      const config = resolveConfig({ SUPABASE_COMPAT: 'true' });
      expect(config.enabled).toBe(true);
    });
    it('reads SUPAFLARE_JWT_SECRET', () => {
      const config = resolveConfig({ SUPAFLARE_JWT_SECRET: 'my-secret' });
      expect(config.jwtSecret).toBe('my-secret');
    });
    it('reads SUPAFLARE_ANON_KEY', () => {
      const config = resolveConfig({ SUPAFLARE_ANON_KEY: 'anon-key' });
      expect(config.anonKey).toBe('anon-key');
    });
    it('reads SUPAFLARE_SERVICE_KEY', () => {
      const config = resolveConfig({ SUPAFLARE_SERVICE_KEY: 'service-key' });
      expect(config.serviceKey).toBe('service-key');
    });
    it('parses SUPAFLARE_JWT_EXPIRY as number', () => {
      const config = resolveConfig({ SUPAFLARE_JWT_EXPIRY: '7200' });
      expect(config.jwtExpiry).toBe(7200);
    });
    it('uses default expiry when env var missing', () => {
      const config = resolveConfig({});
      expect(config.jwtExpiry).toBe(3600);
    });
    it('parses SUPAFLARE_SIGNED_URL_EXPIRY as number', () => {
      const config = resolveConfig({ SUPAFLARE_SIGNED_URL_EXPIRY: '1200' });
      expect(config.signedUrlExpiry).toBe(1200);
    });
    it('handles empty env', () => {
      const config = resolveConfig({});
      expect(config.enabled).toBe(false);
    });
  });
});
