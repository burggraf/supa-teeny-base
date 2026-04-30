import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('POST /auth/v1/otp', () => {
  it('sends OTP to email (creates user)', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'otp-user@example.com',
        create_user: true,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message_id).toBeNull();
    expect(data.user).toBeNull();
  });

  it('sends OTP to existing email', async () => {
    // Signup first
    await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'otp-existing@example.com',
        password: 'password123',
      }),
    });

    const res = await SELF.fetch('http://localhost/auth/v1/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'otp-existing@example.com',
      }),
    });

    expect(res.status).toBe(200);
  });

  it('returns 400 when email/phone missing', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('invalid_credentials');
  });
});

describe('POST /auth/v1/recover', () => {
  it('creates recovery token for existing user', async () => {
    // Signup first
    await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recover@example.com',
        password: 'password123',
      }),
    });

    const res = await SELF.fetch('http://localhost/auth/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recover@example.com',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({});
  });

  it('returns success even for non-existent user (no enumeration)', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nobody@example.com',
      }),
    });

    expect(res.status).toBe(200);
  });
});

describe('POST /auth/v1/resend', () => {
  it('resends signup OTP', async () => {
    // Create user without auto-confirm would be needed, but with auto-confirm=true
    // just verify the endpoint works
    await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'resend@example.com',
        password: 'password123',
      }),
    });

    const res = await SELF.fetch('http://localhost/auth/v1/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'signup',
        email: 'resend@example.com',
      }),
    });

    expect(res.status).toBe(200);
  });

  it('returns 400 when email/phone missing', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'signup' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /auth/v1/settings', () => {
  it('returns settings object', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/settings');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.external).toEqual({});
    expect(data.disable_signup).toBe(false);
    expect(data.mailers).toEqual(['email']);
    expect(data.gotrue_version).toBe('supaflare-v1');
  });
});
