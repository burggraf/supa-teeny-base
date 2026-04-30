import { describe, it, expect } from 'vitest';
import { buildJWTPayload, signJWT, verifyJWT, decodeJWTPayloadUnsafe } from '../../../src/worker/supabase/auth/jwt';

const SECRET = 'test-jwt-secret-at-least-32-chars!';

describe('buildJWTPayload', () => {
  it('produces correct structure with all required claims', () => {
    const payload = buildJWTPayload(
      'user-uuid-123',
      'test@example.com',
      '+1234567890',
      'authenticated',
      { provider: 'email', providers: ['email'] },
      { display_name: 'Alice' },
      3600,
    );

    expect(payload.sub).toBe('user-uuid-123');
    expect(payload.email).toBe('test@example.com');
    expect(payload.phone).toBe('+1234567890');
    expect(payload.role).toBe('authenticated');
    expect(payload.aud).toBe('authenticated');
    expect(payload.app_metadata).toEqual({ provider: 'email', providers: ['email'] });
    expect(payload.user_metadata).toEqual({ display_name: 'Alice' });
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat as number);
    expect((payload.exp as number) - (payload.iat as number)).toBe(3600);
  });

  it('handles null email and phone', () => {
    const payload = buildJWTPayload(
      'user-uuid',
      null,
      null,
      'anon',
      {},
      {},
      3600,
    );

    expect(payload.email).toBe('');
    expect(payload.phone).toBe('');
    expect(payload.role).toBe('anon');
  });
});

describe('signJWT / verifyJWT', () => {
  it('signs and verifies a valid token', async () => {
    const payload = buildJWTPayload(
      'user-123',
      'test@example.com',
      null,
      'authenticated',
      { provider: 'email' },
      {},
      3600,
    );
    const token = await signJWT(payload, SECRET);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = await verifyJWT(token, SECRET);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('authenticated');
  });

  it('rejects token signed with wrong secret', async () => {
    const payload = { sub: 'user-123', role: 'authenticated' };
    const token = await signJWT(payload, SECRET);

    await expect(verifyJWT(token, 'wrong-secret')).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const payload = { sub: 'user-123', exp: past, iat: past - 3600 };
    const token = await signJWT(payload, SECRET);

    await expect(verifyJWT(token, SECRET)).rejects.toThrow(/expired|Invalid token/i);
  });

  it('rejects malformed tokens', async () => {
    await expect(verifyJWT('not.a.valid.jwt', SECRET)).rejects.toThrow();
    await expect(verifyJWT('garbage', SECRET)).rejects.toThrow();
  });
});

describe('decodeJWTPayloadUnsafe', () => {
  it('decodes payload without signature check', async () => {
    const payload = { sub: 'user-123', email: 'test@example.com' };
    const token = await signJWT(payload, SECRET);

    const decoded = decodeJWTPayloadUnsafe(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.sub).toBe('user-123');
    expect(decoded!.email).toBe('test@example.com');
  });

  it('returns null for malformed tokens', () => {
    expect(decodeJWTPayloadUnsafe('garbage')).toBeNull();
    expect(decodeJWTPayloadUnsafe('')).toBeNull();
  });
});
