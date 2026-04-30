export interface SupabaseCompatConfig {
  enabled: boolean;
  anonKey?: string;
  serviceKey?: string;
  jwtSecret?: string;
  jwtExpiry?: number;
  signedUrlExpiry?: number;
}

export const defaultConfig: SupabaseCompatConfig = {
  enabled: false,
  jwtExpiry: 3600,
  signedUrlExpiry: 600,
};

export function resolveConfig(env: Record<string, string | undefined>): SupabaseCompatConfig {
  return {
    enabled: env.SUPABASE_COMPAT === 'true',
    anonKey: env.SUPAFLARE_ANON_KEY,
    serviceKey: env.SUPAFLARE_SERVICE_KEY,
    jwtSecret: env.SUPAFLARE_JWT_SECRET,
    jwtExpiry: env.SUPAFLARE_JWT_EXPIRY ? parseInt(env.SUPAFLARE_JWT_EXPIRY, 10) : 3600,
    signedUrlExpiry: env.SUPAFLARE_SIGNED_URL_EXPIRY ? parseInt(env.SUPAFLARE_SIGNED_URL_EXPIRY, 10) : 600,
  };
}
