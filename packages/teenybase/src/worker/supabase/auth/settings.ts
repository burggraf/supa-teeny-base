import type { AuthConfig, SettingsResponse } from './types';

/**
 * Handle GET /auth/v1/settings
 * Returns project auth settings.
 */
export function handleSettings(config: AuthConfig): SettingsResponse {
  return {
    external: {}, // No OAuth providers in v1
    disable_signup: !config.signupEnabled,
    mailers: ['email'],
    gotrue_version: 'supaflare-v1',
  };
}
