import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, createChallengeFromVerifier, verifyPKCE, generateOTP, hashToken } from '../../../src/worker/supabase/auth/pkce';

describe('generateCodeVerifier', () => {
  it('returns 43+ characters', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('produces URL-safe base64 characters only', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique values', () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
  });
});

describe('createChallengeFromVerifier', () => {
  it('produces consistent output for same input', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const c1 = await createChallengeFromVerifier(verifier);
    const c2 = await createChallengeFromVerifier(verifier);
    expect(c1).toBe(c2);
  });

  it('produces URL-safe base64 characters only', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await createChallengeFromVerifier(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('matches known RFC 7636 test vector', async () => {
    // From RFC 7636 Appendix B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const challenge = await createChallengeFromVerifier(verifier);
    expect(challenge).toBe(expected);
  });
});

describe('verifyPKCE', () => {
  it('returns true for matching verifier and challenge', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await createChallengeFromVerifier(verifier);
    expect(await verifyPKCE(verifier, challenge)).toBe(true);
  });

  it('returns false for wrong verifier', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await createChallengeFromVerifier(verifier);
    expect(await verifyPKCE('wrong-verifier', challenge)).toBe(false);
  });

  it('returns false for wrong challenge', async () => {
    const verifier = generateCodeVerifier();
    expect(await verifyPKCE(verifier, 'wrong-challenge')).toBe(false);
  });
});

describe('generateOTP', () => {
  it('returns 6-digit string', () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('hashToken', () => {
  it('produces consistent hex hash', async () => {
    const h1 = await hashToken('test-token');
    const h2 = await hashToken('test-token');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different tokens', async () => {
    const h1 = await hashToken('token-a');
    const h2 = await hashToken('token-b');
    expect(h1).not.toBe(h2);
  });

  it('returns 64-char hex string (SHA-256)', async () => {
    const hash = await hashToken('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
