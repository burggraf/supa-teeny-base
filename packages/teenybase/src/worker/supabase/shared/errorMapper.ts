import { HTTPException } from 'hono/http-exception';
import { SupabaseError } from './types';

// Error code constants
export const ERROR_CODES = {
  TABLE_NOT_FOUND: 'PGRST200',
  BAD_QUERY: 'PGRST100',
  UNAUTHORIZED: 'PGRST301',
  RLS_VIOLATION: 'PGRST305',
  UNIQUE_VIOLATION: '23505',
  NO_ROWS_FOR_SINGLE: 'PGRST204',
  MULTIPLE_ROWS_FOR_SINGLE: 'PGRST116',
  INTERNAL_ERROR: 'PGRST000',
} as const;

/** Map HTTP status to Supabase error code */
export function statusToCode(status: number, fallback = ERROR_CODES.INTERNAL_ERROR): string {
  switch (status) {
    case 400: return ERROR_CODES.BAD_QUERY;
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.RLS_VIOLATION;
    case 404: return ERROR_CODES.TABLE_NOT_FOUND;
    case 409: return ERROR_CODES.UNIQUE_VIOLATION;
    case 422: return ERROR_CODES.NO_ROWS_FOR_SINGLE;
    default: return fallback;
  }
}

/** Convert any error to Supabase error shape */
export function toSupabaseError(error: unknown, fallbackCode = ERROR_CODES.INTERNAL_ERROR): SupabaseError {
  if (error instanceof HTTPException) {
    const code = statusToCode(error.status, fallbackCode);
    return {
      code,
      message: error.message,
      details: null,
      hint: null,
    };
  }
  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
      details: null,
      hint: null,
    };
  }
  return {
    code: fallbackCode,
    message: String(error),
    details: null,
    hint: null,
  };
}

/** Build error response envelope */
export function errorResponse(error: SupabaseError, status: number) {
  return { data: null as unknown, error, status };
}

/** Throw HTTPException with Supabase error JSON body */
export function throwSupabaseError(
  code: string,
  message: string,
  details?: string | null,
  hint?: string | null,
  httpStatus = 400,
): never {
  const body = JSON.stringify({ code, message, details: details ?? null, hint: hint ?? null });
  throw new HTTPException(httpStatus, { message: body });
}
