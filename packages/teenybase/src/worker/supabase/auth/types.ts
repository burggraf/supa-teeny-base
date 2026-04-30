// Auth database entity types

export interface AuthUser {
  id: string;                     // UUID text
  email: string | null;
  phone: string | null;
  encrypted_password: string | null;
  email_confirmed_at: string | null;   // ISO 8601
  phone_confirmed_at: string | null;
  email_change: string | null;
  email_change_token_current: string | null;
  email_change_token_new: string | null;
  email_change_confirm_sent_at: string | null;
  recovery_token: string | null;
  recovery_sent_at: string | null;
  confirmation_token: string | null;
  confirmation_sent_at: string | null;
  raw_app_meta_data: string | null;    // JSON string
  raw_user_meta_data: string | null;   // JSON string
  is_super_admin: number;              // 0 or 1
  role: string;                        // 'authenticated' | 'anon'
  created_at: string;                  // ISO 8601
  updated_at: string;                  // ISO 8601
  last_sign_in_at: string | null;
  banned_until: string | null;
  deleted_at: string | null;           // soft delete
}

export interface AuthSession {
  id: string;                     // refresh token value (opaque hex)
  user_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  revoked: number;                // 0 = active, 1 = revoked
}

export type OTPType = 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change' | 'phone_change' | 'sms';

export interface AuthOTP {
  id: string;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  token_hash: string;               // SHA256 hash of OTP
  token_type: OTPType;
  code_challenge: string | null;    // PKCE challenge
  code_challenge_method: string | null;
  created_at: string;
  expires_at: string;
  consumed: number;                 // 0 or 1
}

export interface AuthRateLimit {
  id: string;
  identifier: string;               // IP or email
  action: string;                   // login, signup, otp, reset
  attempt_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

// Auth configuration

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: number;                // seconds
  anonKey: string;
  serviceKey: string;
  emailConfirmRequired: boolean;
  emailAutoConfirm: boolean;
  passwordMinLength: number;
  signupEnabled: boolean;
}

// Request body types

export interface SignupRequest {
  email?: string;
  password?: string;
  phone?: string;
  data?: Record<string, unknown>;
  redirect_to?: string;
}

export interface TokenRequest {
  grant_type: 'password' | 'refresh_token' | 'pkce';
  email?: string;
  phone?: string;
  password?: string;
  refresh_token?: string;
  auth_code?: string;
  code_verifier?: string;
}

export interface OTPRequest {
  email?: string;
  phone?: string;
  data?: Record<string, unknown>;
  create_user?: boolean;
  redirect_to?: string;
}

export interface VerifyRequest {
  token: string;
  token_hash?: string;
  type: OTPType;
  redirect_to?: string;
}

export interface UpdateUserRequest {
  email?: string;
  password?: string;
  phone?: string;
  data?: Record<string, unknown>;
  nonce?: string;
}

export interface RecoverRequest {
  email: string;
  redirect_to?: string;
}

export interface ResendRequest {
  type: 'signup' | 'email_change' | 'phone_change';
  email?: string;
  phone?: string;
  redirect_to?: string;
}

// Response body types

export interface SessionResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: UserResponse;
}

export interface UserResponse {
  id: string;
  aud: string;
  role: string;
  email: string | null;
  email_confirmed_at: string | null;
  phone: string | null;
  phone_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  identities?: AuthIdentityResponse[];
  banned_until?: string | null;
}

export interface AuthIdentityResponse {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string;
  identity_data: Record<string, unknown>;
  created_at: string;
}

export interface SettingsResponse {
  external: Record<string, unknown>;
  disable_signup: boolean;
  mailers: string[];
  gotrue_version: string;
}

export interface SignupResponseNoSession {
  id: string;
  aud: string;
  role: string;
  email: string | null;
  email_confirmed_at: string | null;
  phone: string | null;
  created_at: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}

// Auth error shape (matches Supabase error format)

export interface AuthError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

// Generate link response (admin)

export interface GenerateLinkResponse {
  action_link: string;
  email_otp: string;
  hashed_token: string;
  redirect_to: string;
  verification_type: string;
  user: UserResponse;
}

export type GenerateLinkType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change';
