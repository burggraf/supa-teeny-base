import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('Rate Limiting', () => {
  it('enforces signup rate limit after multiple attempts', async () => {
    // Send 3 rapid signups (limit is 3 per minute)
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await SELF.fetch('http://localhost/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `rate-${i}-${Date.now()}@example.com`,
          password: 'password123',
        }),
      });
      results.push(res.status);
    }

    // First 3 should succeed (200), subsequent should be rate limited (429)
    const successes = results.filter(s => s === 200).length;
    const rateLimited = results.filter(s => s === 429).length;
    expect(successes).toBeGreaterThanOrEqual(3);
    expect(rateLimited).toBeGreaterThan(0);
  });

  it('enforces login rate limit', async () => {
    // Signup a user first
    await SELF.fetch('http://localhost/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rate-login@example.com',
        password: 'password123',
      }),
    });

    // Send many failed login attempts
    const results: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await SELF.fetch('http://localhost/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'rate-login@example.com',
          password: 'wrong-password',
        }),
      });
      results.push(res.status);
    }

    // Some should be rate limited (429)
    const rateLimited = results.filter(s => s === 429).length;
    expect(rateLimited).toBeGreaterThan(0);
  });
});
