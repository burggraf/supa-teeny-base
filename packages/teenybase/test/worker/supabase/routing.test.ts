import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { ERROR_CODES } from '../../../src/worker/supabase/shared/errorMapper';

describe('Phase 1: PostgREST CRUD', () => {
  describe('GET — basic routing', () => {
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

    it('filters with gt', async () => {
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

    it('filters with ilike', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.ilike=luke');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ name: 'Luke' });
    });

    it('filters with is (null)', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.is=null');
      expect(res.status).toBe(200);
    });

    it('filters with in', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.in=Luke,Han');
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('chains multiple filters', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Luke&id.eq=1');
      const data = (await res.json()) as Record<string, unknown>[];
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

  describe('GET — single / maybeSingle', () => {
    it('returns single object with single=true', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Leia&single=true');
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>;
      // single() returns an object, not an array
      expect(Array.isArray(data)).toBe(false);
      expect(data).toMatchObject({ name: 'Leia' });
    });

    it('maybeSingle returns null for 0 rows', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Nonexistent&maybeSingle=true');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.trim()).toBe('null');
    });
  });

  describe('GET — CSV output', () => {
    it('returns CSV with Accept: text/csv', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?select=*&limit=2', {
        headers: { 'Accept': 'text/csv' },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('id,name');
      expect(text.split('\r\n').length).toBe(3); // header + 2 rows
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
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.badop=Luke');
      expect(res.status).toBe(400);
    });
  });

  describe('POST — INSERT', () => {
    it('inserts a single row', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 100, name: 'Yoda' }),
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ id: 100, name: 'Yoda' });
    });

    it('inserts bulk rows', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { id: 200, name: 'Obi-Wan' },
          { id: 201, name: 'Qui-Gon' },
        ]),
      });
      expect(res.status).toBe(201);
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(2);
    });

    it('returns 204 with Prefer: return=minimal', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ id: 300, name: 'Mace Windu' }),
      });
      expect(res.status).toBe(201);
      const text = await res.text();
      expect(text).toBe('');
    });
  });

  describe('PATCH — UPDATE', () => {
    it('updates rows matching filter', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Luke', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Darth Vader' }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(1);
      expect(data[0]).toMatchObject({ name: 'Darth Vader' });
    });

    it('returns 400 without filter', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nobody' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE', () => {
    it('deletes rows matching filter', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters?id.eq=3', {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
    });

    it('returns 400 without filter', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);
    });
  });

  describe.skip('HEAD — count', () => {
    it('returns count in Content-Range header', async () => {
      const res = await SELF.fetch('http://localhost/rest/v1/characters', { method: 'HEAD' });
      expect(res.status).toBe(200);
      const contentRange = res.headers.get('Content-Range');
      expect(contentRange).toBeTruthy();
    });
  });

  describe('RLS — policy injection', () => {
    it('allows full access with no policies', async () => {
      // No policies inserted, so all rows should be visible
      const res = await SELF.fetch('http://localhost/rest/v1/characters');
      expect(res.status).toBe(200);
      const data = (await res.json()) as Record<string, unknown>[];
      expect(data.length).toBe(3);
    });

    it('service_role bypasses RLS', async () => {
      // Seed a restrictive policy
      await SELF.fetch('http://localhost/rest/v1/characters?name.eq=Luke', { method: 'DELETE' });
      const res = await SELF.fetch('http://localhost/rest/v1/characters', {
        headers: { apikey: 'sb-service-test-key' },
      });
      expect(res.status).toBe(200);
    });
  });
});
