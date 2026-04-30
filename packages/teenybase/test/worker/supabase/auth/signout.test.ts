import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

async function signUpAndSignIn() {
  // Sign up
  await SELF.fetch('http://localhost/auth/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'signout@test.com', password: 'password123' }),
  });

  // Sign in
  const signInRes = await SELF.fetch('http://localhost/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'signout@test.com', password: 'password123' }),
  });
  return signInRes.json() as Promise<{
    access_token: string;
    refresh_token: string;
  }>;
}

describe('POST /auth/v1/logout', () => {
  it('global sign out revokes all sessions', async () => {
    const session = await signUpAndSignIn();

    // Sign out
    const res = await SELF.fetch('http://localhost/auth/v1/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    expect(res.status).toBe(204);
  });

  it('after global sign out, refresh tokens no longer work', async () => {
    const session = await signUpAndSignIn();

    // Sign out
    await SELF.fetch('http://localhost/auth/v1/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    // Try to refresh
    const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('session_not_found');
  });

  it('sign out requires valid JWT (401 without)', async () => {
    const res = await SELF.fetch('http://localhost/auth/v1/logout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid.token.here',
      },
    });

    expect(res.status).toBe(401);
  });
});
