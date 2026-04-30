import { HTTPException } from 'hono/http-exception';

export const AUTH_ERRORS = {
  WEAK_PASSWORD: { code: 'weak_password', httpStatus: 422 },
  USER_ALREADY_EXISTS: { code: 'user_already_exists', httpStatus: 422 },
  INVALID_CREDENTIALS: { code: 'invalid_credentials', httpStatus: 400 },
  OTP_EXPIRED: { code: 'otp_expired', httpStatus: 400 },
  SESSION_NOT_FOUND: { code: 'session_not_found', httpStatus: 400 },
  INVALID_TOKEN: { code: 'invalid_token', httpStatus: 401 },
  LOCKOUT_ACTIVE: { code: 'lockout_active', httpStatus: 429 },
  SIGNUP_DISABLED: { code: 'signup_disabled', httpStatus: 422 },
  INVALID_CODE: { code: 'invalid_code', httpStatus: 400 },
  CODE_EXPIRED: { code: 'code_expired', httpStatus: 400 },
  CODE_VERIFIER_MISMATCH: { code: 'code_verifier_mismatch', httpStatus: 400 },
  EMAIL_NOT_CONFIRMED: { code: 'email_not_confirmed', httpStatus: 401 },
  FORBIDDEN: { code: 'forbidden', httpStatus: 403 },
  OVER_EMAIL_RATE_LIMIT: { code: 'over_email_send_rate_limit', httpStatus: 422 },
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

/** Build JSON error body matching Supabase shape */
export function buildAuthErrorBody(
  code: string,
  message: string,
  details?: string | null,
  hint?: string | null,
): string {
  return JSON.stringify({
    code,
    message,
    details: details ?? null,
    hint: hint ?? null,
  });
}

/** Throw HTTPException with Supabase auth error JSON body */
export function throwAuthError(
  errorCode: AuthErrorCode,
  message?: string,
  details?: string | null,
  hint?: string | null,
): never {
  const err = AUTH_ERRORS[errorCode];
  const body = buildAuthErrorBody(err.code, message || errorCode, details, hint);
  throw new HTTPException(err.httpStatus, { message: body });
}
