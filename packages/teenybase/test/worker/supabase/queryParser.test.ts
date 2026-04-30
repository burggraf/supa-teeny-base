import { describe, it, expect } from 'vitest';
import {
  parsePostgrestRequest,
  parseFilterValue,
  parseSelectColumns,
  parseOrder,
} from '../../../src/worker/supabase/postgrest/queryParser';

describe('queryParser', () => {
  describe('parseFilterValue', () => {
    it('parses null', () => { expect(parseFilterValue('null')).toBeNull(); });
    it('parses true', () => { expect(parseFilterValue('true')).toBe(true); });
    it('parses false', () => { expect(parseFilterValue('false')).toBe(false); });
    it('parses integer', () => { expect(parseFilterValue('42')).toBe(42); });
    it('parses negative integer', () => { expect(parseFilterValue('-7')).toBe(-7); });
    it('parses float', () => { expect(parseFilterValue('3.14')).toBe(3.14); });
    it('keeps strings as strings', () => { expect(parseFilterValue('Luke')).toBe('Luke'); });
    it('keeps comma-separated strings', () => { expect(parseFilterValue('a,b,c')).toBe('a,b,c'); });
  });

  describe('parsePostgrestRequest', () => {
    it('parses basic request', () => {
      const params = new URLSearchParams('select=id,name&limit=10');
      const req = parsePostgrestRequest('GET', 'characters', params);
      expect(req.method).toBe('GET');
      expect(req.table).toBe('characters');
      expect(req.select).toBe('id,name');
      expect(req.limit).toBe(10);
      expect(req.offset).toBeUndefined();
    });

    it('parses filter params', () => {
      const params = new URLSearchParams('name.eq=Luke&age.gt=18&status.is=null');
      const req = parsePostgrestRequest('GET', 'characters', params);
      expect(req.filters).toEqual([
        { column: 'name', operator: 'eq', value: 'Luke' },
        { column: 'age', operator: 'gt', value: 18 },
        { column: 'status', operator: 'is', value: null },
      ]);
    });

    it('parses order param', () => {
      const params = new URLSearchParams('order=created_at.desc');
      const req = parsePostgrestRequest('GET', 'characters', params);
      expect(req.order).toBe('created_at.desc');
    });

    it('parses on_conflict and resolution', () => {
      const params = new URLSearchParams('on_conflict=username&resolution=merge-duplicates');
      const req = parsePostgrestRequest('POST', 'users', params, { username: 'luke' });
      expect(req.onConflict).toBe('username');
      expect(req.resolution).toBe('merge-duplicates');
      expect(req.body).toEqual({ username: 'luke' });
    });

    it('does not treat select as a filter', () => {
      const params = new URLSearchParams('select=id,name');
      const req = parsePostgrestRequest('GET', 'characters', params);
      expect(req.filters).toEqual([]);
      expect(req.select).toBe('id,name');
    });

    it('handles POST with array body', () => {
      const body = [{ name: 'Luke' }, { name: 'Leia' }];
      const req = parsePostgrestRequest('POST', 'characters', new URLSearchParams(), body);
      expect(req.body).toEqual(body);
    });

    it('parses offset', () => {
      const params = new URLSearchParams('offset=20');
      const req = parsePostgrestRequest('GET', 'characters', params);
      expect(req.offset).toBe(20);
    });
  });

  describe('parseSelectColumns', () => {
    it('returns empty for *', () => {
      expect(parseSelectColumns('*')).toEqual([]);
    });
    it('parses simple columns', () => {
      expect(parseSelectColumns('id,name,age')).toEqual(['id', 'name', 'age']);
    });
    it('parses nested FK', () => {
      const result = parseSelectColumns('id,name,countries(name)');
      expect(result).toEqual([
        'id',
        'name',
        { table: 'countries', columns: ['name'] },
      ]);
    });
    it('parses deep nesting', () => {
      const result = parseSelectColumns('id,cities(name,countries(name))');
      expect(result).toEqual([
        'id',
        { table: 'cities', columns: ['name', { table: 'countries', columns: ['name'] }] },
      ]);
    });
    it('handles spaces', () => {
      expect(parseSelectColumns('id, name , age')).toEqual(['id', 'name', 'age']);
    });
  });

  describe('parseOrder', () => {
    it('parses ascending', () => {
      expect(parseOrder('name.asc')).toEqual([{ column: 'name', ascending: true, nullsFirst: false }]);
    });
    it('parses descending', () => {
      expect(parseOrder('name.desc')).toEqual([{ column: 'name', ascending: false, nullsFirst: false }]);
    });
    it('parses nullsfirst', () => {
      expect(parseOrder('name.desc.nullsfirst')).toEqual([
        { column: 'name', ascending: false, nullsFirst: true },
      ]);
    });
    it('parses nullslast', () => {
      expect(parseOrder('name.desc.nullslast')).toEqual([
        { column: 'name', ascending: false, nullsFirst: false },
      ]);
    });
    it('parses multiple order specs', () => {
      expect(parseOrder('name.asc,age.desc')).toEqual([
        { column: 'name', ascending: true, nullsFirst: false },
        { column: 'age', ascending: false, nullsFirst: false },
      ]);
    });
    it('parses foreign table order', () => {
      const result = parseOrder('countries.name.desc');
      expect(result[0].column).toBe('name');
      expect(result[0].ascending).toBe(false);
      expect(result[0].foreignTable).toBe('countries');
    });
    it('returns empty for empty string', () => {
      expect(parseOrder('')).toEqual([]);
    });
  });
});
