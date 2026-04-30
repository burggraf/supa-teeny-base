import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

async function signUpAndSignIn() {
  // Sign up
  await SELF.fetch('http://localhost/auth/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'session@test.com', password: 'password123' }),
  });

  // Sign in to get tokens
  const signInRes = await SELF.fetch('http://localhost/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'session@test.com', password: 'password123' }),
  });
  return signInRes.json() as Promise<{
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string };
  }>;
}

describe('POST /auth/v1/token (refresh)', () => {
  it('refresh token grant returns new session', async () => {
    const session = await signUpAndSignIn();

    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBeDefined();
    expect(data.refresh_token).toBeDefined();
    expect(data.refresh_token).not.toBe(session.refresh_token); // new token
    expect(data.user.email).toBe('session@test.com');
  });

  it('revoked refresh token rejected with session_not_found', async () => {
    const session = await signUpAndSignIn();

    // First refresh: revokes old token
    await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    // Try to use old token again
    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('session_not_found');
  });

  it('old refresh token unusable after refresh (single-use)', async () => {
    const session = await signUpAndSignIn();

    // Refresh to get new token
    const refreshRes = await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const refreshed = await refreshRes.json();

    // Old token should fail
    const oldRes = await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    expect(oldRes.status).toBe(400);

    // New token should work
    const newRes = await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshed.refresh_token }),
    });
    expect(newRes.status).toBe(200);
  });
});

describe('GET /auth/v1/user', () => {
  it('get user with valid JWT returns user data', async () => {
    const session = await signUpAndSignIn();

    const res = await SELF.fetch('http://localhost/auth/v1/user', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe('session@test.com');
    expect(data.id).toBe(session.user.id);
  });

  it('get user with expired JWT returns 401', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/user', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer expired.fake.token',
      },
    });

    expect(res.status).toBe(401);
  });
});
