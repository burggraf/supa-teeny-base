import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { ERROR_CODES } from '../../../src/worker/supabase/shared/errorMapper';

describe('Phase 1B: SELECT implementation', () => {
  describe('GET /rest/v1/:table — basic routing', () => {
    it('returns 404 for unknown table', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/nonexistent');
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.code).toBe(ERROR_CODES.TABLE_NOT_FOUND);
    });

    it('returns all rows for select=*', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?select=*');
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(3);
    });

    it('returns specific columns', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?select=name');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(3);
      expect(data[0]).toHaveProperty('name');
    });
  });

  describe('GET — filter operators', () => {
    it('filters with eq', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Leia');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ name: 'Leia' });
    });

    it('filters with neq', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.neq=Luke');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('filters with gt on integer', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?id.gt=1');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('filters with gte', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?id.gte=2');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('filters with lt', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?id.lt=3');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('filters with lte', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?id.lte=2');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('filters with like', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.like=L%25');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('filters with ilike (case-insensitive)', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.ilike=luke');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ name: 'Luke' });
    });

    it('filters with is (null check)', async () => {
      // No null names in characters, so should return 0 rows or empty array
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.is=null');
      expect(res.status).toBe(200);
      const text = await res.text();
      // Can be either [] or null depending on Teenybase behavior
      if (text.trim() === '[]' || text.trim() === 'null') {
        // Valid response
        return;
      }
      const data = JSON.parse(text) as Record<string, unknown>[];
      expect(data.length === 0 || data === null).toBe(true);
    });

    it('filters with in', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.in=Luke,Han');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('chains multiple filters', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Luke&id.eq=1');
      const text = await res.text();
      console.log('chained response:', text.slice(0, 200));
      const data = JSON.parse(text) as Record<string, unknown>[];
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ name: 'Luke', id: 1 });
    });
  });

  describe('GET — order, limit, offset', () => {
    it('orders ascending', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?select=*&order=name.asc');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data[0]).toMatchObject({ name: 'Han' });
    });

    it('orders descending', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?select=*&order=name.desc');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data[0]).toMatchObject({ name: 'Luke' });
    });

    it('applies limit', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?limit=2');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('applies offset', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?limit=1&offset=1&order=id.asc');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ id: 2 });
    });

    it('combines order, limit, offset', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?order=id.desc&limit=2&offset=1');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
      expect(data[0]).toMatchObject({ id: 2 });
      expect(data[1]).toMatchObject({ id: 1 });
    });
  });

  describe('Prefer header', () => {
    it('returns count with Prefer: count=exact', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        headers: { 'Prefer': 'count=exact' },
      });
      expect(res.status).toBe(200);
      const contentRange = res.headers.get('Content-Range');
      expect(contentRange).toBeTruthy();
    });
  });

  describe('Auth context', () => {
    it('defaults to anon role', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters');
      expect(res.status).toBe(200);
    });

    it('accepts service_role apikey', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        headers: { apikey: 'sb-service-test-key' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('returns PGRST100 for bad query', async () => {
      // Invalid operator
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.badop=Luke');
      expect(res.status).toBe(400);
    });
  });
});
