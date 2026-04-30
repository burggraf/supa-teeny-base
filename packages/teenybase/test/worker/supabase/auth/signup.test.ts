import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('POST /auth/v1/signup', () => {
  it('email signup with auto-confirm returns session', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    // Session response shape
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(data.refresh_token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('test@example.com');
    expect(data.user.email_confirmed_at).toBeDefined();
    expect(data.user.app_metadata).toHaveProperty('provider', 'email');
  });

  it('weak password rejected (422, weak_password)', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'weak@example.com',
        password: '123',
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('weak_password');
  });

  it('duplicate email rejected (422, user_already_exists)', async () => {
    // First signup
    await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dup@example.com',
        password: 'password123',
      }),
    });

    // Second signup with same email
    const res = await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dup@example.com',
        password: 'password123',
      }),
    });

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('user_already_exists');
  });

  it('user metadata stored correctly', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'meta@example.com',
        password: 'password123',
        data: { name: 'Test User', age: 30 },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.user_metadata).toEqual({ name: 'Test User', age: 30 });
  });

  it('app metadata has provider: email', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'provider@example.com',
        password: 'password123',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.app_metadata).toEqual({
      provider: 'email',
      providers: ['email'],
    });
  });
});
