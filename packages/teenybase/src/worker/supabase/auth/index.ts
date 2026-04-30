export type {
  AuthUser,
  AuthSession,
  AuthOTP,
  AuthRateLimit,
  OTPType,
  AuthConfig,
  SignupRequest,
  TokenRequest,
  OTPRequest,
  VerifyRequest,
  UpdateUserRequest,
  RecoverRequest,
  ResendRequest,
  SessionResponse,
  UserResponse,
  SettingsResponse,
  SignupResponseNoSession,
  AuthError,
  GenerateLinkResponse,
  GenerateLinkType,
  AuthIdentityResponse,
} from './types';

export { ensureAuthSchema } from './schema';
export { buildJWTPayload, signJWT, verifyJWT, decodeJWTPayloadUnsafe } from './jwt';
export { hashPassword, comparePassword, validatePasswordStrength } from './passwordHasher';
export {
  generateCodeVerifier,
  createChallengeFromVerifier,
  verifyPKCE,
  generateOTP,
  hashToken,
} from './pkce';
export { AUTH_ERRORS, throwAuthError, buildAuthErrorBody } from './errorCodes';
export type { AuthErrorCode } from './errorCodes';
export {
  createSession,
  revokeSession,
  revokeAllSessions,
  findSession,
  findUserById,
  findUserByEmail,
  toUserResponse,
  buildSessionResponse,
  createFullSession,
} from './sessionManager';
export { handleSignup } from './signup';
export { handleVerify } from './verify';
export {
  createSession,
  revokeSession,
  revokeAllSessions,
  findSession,
  findUserById,
  findUserByEmail,
  toUserResponse,
  buildSessionResponse,
  createFullSession,
  createAnonymousSession,
} from './sessionManager';
export { handleToken, handleAnonymousSignIn } from './token';
export { handleGetUser, handleUpdateUser } from './user';
export { handleLogout } from './logout';
export { handleOTP } from './otp';
export { handleRecover } from './recover';
export { handleResend } from './resend';
export { handleSettings } from './settings';
export { checkRateLimit, DEFAULT_RATE_LIMITS } from './rateLimiter';
export {
  handleAdminCreateUser,
  handleAdminListUsers,
  handleAdminGetUser,
  handleAdminUpdateUser,
  handleAdminDeleteUser,
} from './admin/users';
export { handleGenerateLink } from './admin/generateLink';
