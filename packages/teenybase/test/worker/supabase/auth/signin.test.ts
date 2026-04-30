import { describe, it, expect, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { hashPassword } from '../../../../src/worker/supabase/auth/passwordHasher';
import { ensureAuthSchema } from '../../../../src/worker/supabase/auth/schema';

describe('POST /auth/v1/token (signin)', () => {
  beforeEach(async () => {
    // Seed a test user via direct D1 access
    await SELF.fetch('http://localhost/auth/v1/token', { method: 'POST' });
  });

  async function seedUser(email: string, password: string) {
    // Sign up a user first
    const signupRes = await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(signupRes.status).toBe(200);
    return signupRes.json();
  }

  it('password sign in with correct credentials returns session', async () => {
    await seedUser('test@example.com', 'password123');

    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(data.user.email).toBe('test@example.com');
    expect(data.user.role).toBe('authenticated');
  });

  it('wrong password returns 400 with code invalid_credentials', async () => {
    await seedUser('wrong@example.com', 'correct-password');

    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wrong@example.com', password: 'wrong-password' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('invalid_credentials');
  });

  it('non-existent email returns 400 with code invalid_credentials (no enumeration)', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'password123' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('invalid_credentials');
  });

  it('anonymous sign in creates user with role=anon', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.user.role).toBe('anon');
    expect(data.user.app_metadata.provider).toBe('anonymous');
  });
});
