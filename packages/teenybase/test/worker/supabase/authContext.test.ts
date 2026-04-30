import { describe, it, expect } from 'vitest';
import { extractAuthContext, decodeJwtPayload } from '../../../src/worker/supabase/postgrest/authContext';

const OPTIONS = {
  anonKey: 'anon-key-123',
  serviceKey: 'service-key-456',
};

describe('authContext', () => {
  describe('extractAuthContext', () => {
    it('defaults to anon with no headers', () => {
      const ctx = extractAuthContext(null, null, OPTIONS);
      expect(ctx.role).toBe('anon');
      expect(ctx.uid).toBeNull();
      expect(ctx.email).toBeNull();
      expect(ctx.apikey).toBeNull();
    });

    it('detects anon key', () => {
      const ctx = extractAuthContext('anon-key-123', null, OPTIONS);
      expect(ctx.role).toBe('anon');
      expect(ctx.apikey).toBe('anon-key-123');
    });

    it('detects service key', () => {
      const ctx = extractAuthContext('service-key-456', null, OPTIONS);
      expect(ctx.role).toBe('service_role');
    });

    it('unknown apikey stays anon', () => {
      const ctx = extractAuthContext('unknown-key', null, OPTIONS);
      expect(ctx.role).toBe('anon');
    });

    it('parses JWT from Bearer token', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ sub: 'user-1', email: 'test@example.com', role: 'authenticated' }));
      const token = `${header}.${payload}.fake-sig`;

      const ctx = extractAuthContext('anon-key-123', `Bearer ${token}`, OPTIONS);
      expect(ctx.role).toBe('authenticated');
      expect(ctx.uid).toBe('user-1');
      expect(ctx.email).toBe('test@example.com');
    });

    it('service_role apikey overrides JWT role', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ sub: 'user-1', role: 'authenticated' }));
      const token = `${header}.${payload}.sig`;

      const ctx = extractAuthContext('service-key-456', `Bearer ${token}`, OPTIONS);
      expect(ctx.role).toBe('service_role');
    });

    it('uses aud claim for role when role absent', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ sub: 'u1', aud: 'authenticated' }));
      const token = `${header}.${payload}.sig`;

      const ctx = extractAuthContext('anon-key-123', `Bearer ${token}`, OPTIONS);
      expect(ctx.role).toBe('authenticated');
    });
  });

  describe('decodeJwtPayload', () => {
    it('decodes valid JWT payload', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ sub: '123', name: 'test' }));
      const token = `${header}.${payload}.sig`;
      const result = decodeJwtPayload(token);
      expect(result).toEqual({ sub: '123', name: 'test' });
    });

    it('returns null for single-segment token', () => {
      expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    });

    it('returns null for invalid base64', () => {
      expect(decodeJwtPayload('abc.!!!.def')).toBeNull();
    });

    it('handles base64url encoding', () => {
      // base64url: - instead of +, _ instead of /
      const header = btoa(JSON.stringify({ alg: 'HS256' })).replace(/\+/g, '-').replace(/\//g, '_');
      const payload = btoa(JSON.stringify({ sub: '42' })).replace(/\+/g, '-').replace(/\//g, '_');
      const token = `${header}.${payload}.sig`;
      const result = decodeJwtPayload(token);
      expect(result).toEqual({ sub: '42' });
    });
  });
});
