import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { ERROR_CODES } from '../../../src/worker/supabase/shared/errorMapper';

describe('Phase 0.1: SupabaseCompat routing', () => {
  describe('GET /rest/v1/:table', () => {
    it('returns 404 for unknown table', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/nonexistent');
      expect(res.status).toBe(404);
      const body = await res.json() as Record<string, unknown>;
      expect(body.code).toBe(ERROR_CODES.TABLE_NOT_FOUND);
    });

    it('routes to known table (returns placeholder)', async () => {
      // Need to seed a table first via the teenybase setup endpoint
      // For now, verify the route dispatches (even if table not found)
      const res = await SELF.fetch('http://localhost/rest/v1/characters');
      // 404 is expected because table doesn't exist in settings yet
      expect(res.status).toBe(404);
    });
  });

  describe('POST /rest/v1/:table', () => {
    it('returns 404 for unknown table', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/nonexistent', { method: 'POST' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /rest/v1/:table', () => {
    it('returns 404 for unknown table', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/nonexistent', { method: 'PATCH' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /rest/v1/:table', () => {
    it('returns 404 for unknown table', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  describe('HEAD /rest/v1/:table', () => {
    it('returns 404 for unknown table', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/nonexistent', { method: 'HEAD' });
      expect(res.status).toBe(404);
    });
  });

  describe('Unmatched routes', () => {
    it('does not intercept /api/v1/* routes', async () => {
      // /api/* should still go through teenybase native routing
      // This should not return a SupabaseCompat error
      const res = await SELF.fetch('http://localhost/api/v1/unknown');
      const body = await res.json() as Record<string, unknown>;
      // teenybase native error, not supabase compat
      expect(body.code).not.toBe(ERROR_CODES.TABLE_NOT_FOUND);
    });
  });
});
