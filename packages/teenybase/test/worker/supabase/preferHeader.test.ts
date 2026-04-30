import { describe, it, expect } from 'vitest';
import { parsePreferHeader } from '../../../src/worker/supabase/postgrest/preferHeader';

describe('preferHeader', () => {
  describe('parsePreferHeader', () => {
    it('returns nulls for empty input', () => {
      expect(parsePreferHeader(null)).toEqual({
        preferReturn: null,
        preferCount: null,
        preferResolution: null,
        preferHandling: null,
      });
    });
    it('returns nulls for undefined input', () => {
      const r = parsePreferHeader(undefined);
      expect(r.preferReturn).toBeNull();
    });
    it('parses return=representation', () => {
      expect(parsePreferHeader('return=representation').preferReturn).toBe('representation');
    });
    it('parses return=minimal', () => {
      expect(parsePreferHeader('return=minimal').preferReturn).toBe('minimal');
    });
    it('parses count=exact', () => {
      expect(parsePreferHeader('count=exact').preferCount).toBe('exact');
    });
    it('parses count=planned', () => {
      expect(parsePreferHeader('count=planned').preferCount).toBe('planned');
    });
    it('parses count=estimated', () => {
      expect(parsePreferHeader('count=estimated').preferCount).toBe('estimated');
    });
    it('parses resolution=merge-duplicates', () => {
      expect(parsePreferHeader('resolution=merge-duplicates').preferResolution).toBe('merge-duplicates');
    });
    it('parses resolution=ignore-duplicates', () => {
      expect(parsePreferHeader('resolution=ignore-duplicates').preferResolution).toBe('ignore-duplicates');
    });
    it('parses handling=strict', () => {
      expect(parsePreferHeader('handling=strict').preferHandling).toBe('strict');
    });
    it('parses handling=lenient', () => {
      expect(parsePreferHeader('handling=lenient').preferHandling).toBe('lenient');
    });
    it('parses multiple preferences', () => {
      const r = parsePreferHeader('return=representation, count=exact');
      expect(r.preferReturn).toBe('representation');
      expect(r.preferCount).toBe('exact');
    });
    it('ignores invalid values', () => {
      const r = parsePreferHeader('return=invalid, count=maybe');
      expect(r.preferReturn).toBeNull();
      expect(r.preferCount).toBeNull();
    });
    it('ignores unknown keys', () => {
      const r = parsePreferHeader('foo=bar');
      expect(r.preferReturn).toBeNull();
    });
    it('handles leading/trailing spaces', () => {
      const r = parsePreferHeader(' return=representation , count=exact ');
      expect(r.preferReturn).toBe('representation');
      expect(r.preferCount).toBe('exact');
    });
  });
});
