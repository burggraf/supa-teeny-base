import { describe, it, expect } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  ERROR_CODES,
  statusToCode,
  toSupabaseError,
  errorResponse,
  throwSupabaseError,
} from '../../../src/worker/supabase/shared/errorMapper';

describe('errorMapper', () => {
  describe('statusToCode', () => {
    it('maps 400 to PGRST100', () => {
      expect(statusToCode(400)).toBe(ERROR_CODES.BAD_QUERY);
    });
    it('maps 401 to PGRST301', () => {
      expect(statusToCode(401)).toBe(ERROR_CODES.UNAUTHORIZED);
    });
    it('maps 403 to PGRST305', () => {
      expect(statusToCode(403)).toBe(ERROR_CODES.RLS_VIOLATION);
    });
    it('maps 404 to PGRST200', () => {
      expect(statusToCode(404)).toBe(ERROR_CODES.TABLE_NOT_FOUND);
    });
    it('maps 409 to 23505', () => {
      expect(statusToCode(409)).toBe(ERROR_CODES.UNIQUE_VIOLATION);
    });
    it('maps 422 to PGRST204', () => {
      expect(statusToCode(422)).toBe(ERROR_CODES.NO_ROWS_FOR_SINGLE);
    });
    it('returns fallback for unmapped status', () => {
      expect(statusToCode(500, 'CUSTOM')).toBe('CUSTOM');
    });
    it('returns PGRST000 for unmapped status with default fallback', () => {
      expect(statusToCode(500)).toBe(ERROR_CODES.INTERNAL_ERROR);
    });
  });

  describe('toSupabaseError', () => {
    it('converts HTTPException to SupabaseError', () => {
      const err = new HTTPException(404, { message: 'table not found' });
      const result = toSupabaseError(err);
      expect(result).toEqual({
        code: ERROR_CODES.TABLE_NOT_FOUND,
        message: 'table not found',
        details: null,
        hint: null,
      });
    });
    it('converts generic Error to SupabaseError', () => {
      const err = new Error('something broke');
      const result = toSupabaseError(err);
      expect(result.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(result.message).toBe('something broke');
    });
    it('converts string to SupabaseError', () => {
      const result = toSupabaseError('raw string');
      expect(result.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(result.message).toBe('raw string');
    });
    it('uses custom fallback code', () => {
      const result = toSupabaseError('oops', 'CUSTOM_CODE');
      expect(result.code).toBe('CUSTOM_CODE');
    });
  });

  describe('errorResponse', () => {
    it('returns correct envelope', () => {
      const err = { code: 'PGRST100', message: 'bad query', details: null, hint: null };
      const result = errorResponse(err, 400);
      expect(result.data).toBeNull();
      expect(result.error).toEqual(err);
      expect(result.status).toBe(400);
    });
  });

  describe('throwSupabaseError', () => {
    it('throws HTTPException with JSON body and default status 400', () => {
      expect(() => throwSupabaseError('PGRST100', 'bad query')).toThrow(HTTPException);
      try {
        throwSupabaseError('PGRST100', 'bad query');
      } catch (e) {
        expect(e).toBeInstanceOf(HTTPException);
        expect((e as HTTPException).status).toBe(400);
        const body = JSON.parse((e as HTTPException).message);
        expect(body.code).toBe('PGRST100');
        expect(body.message).toBe('bad query');
        expect(body.details).toBeNull();
        expect(body.hint).toBeNull();
      }
    });
    it('throws with custom status', () => {
      try {
        throwSupabaseError('PGRST204', 'multiple rows', null, null, 422);
      } catch (e) {
        expect((e as HTTPException).status).toBe(422);
        const body = JSON.parse((e as HTTPException).message);
        expect(body.code).toBe('PGRST204');
      }
    });
    it('includes details and hint when provided', () => {
      try {
        throwSupabaseError('PGRST100', 'error', 'some details', 'try this', 400);
      } catch (e) {
        const body = JSON.parse((e as HTTPException).message);
        expect(body.details).toBe('some details');
        expect(body.hint).toBe('try this');
      }
    });
  });
});
