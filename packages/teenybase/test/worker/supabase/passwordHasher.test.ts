import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, validatePasswordStrength } from '../../../src/worker/supabase/auth/passwordHasher';

describe('hashPassword', () => {
  it('returns bcrypt hash with correct prefix and length', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).toMatch(/^\$2[ab]\$10\$/);
    expect(hash).toHaveLength(60);
  });

  it('produces different hashes for same password (random salt)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });
});

describe('comparePassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await comparePassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await comparePassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('verifies against pre-computed hash', async () => {
    // Known bcrypt hash of "test-password-123"
    const knownHash = '$2b$10$UGbGYEJ0W3CU3zcQ.on1KOehUyqeESDHah4dUa0bwrwQvu4BoumuG';
    const result = await comparePassword('test-password-123', knownHash);
    expect(result).toBe(true);
  });
});

describe('validatePasswordStrength', () => {
  it('rejects empty password', () => {
    const result = validatePasswordStrength('', 6);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('at least 6 characters');
  });

  it('rejects short password', () => {
    const result = validatePasswordStrength('abc', 6);
    expect(result.valid).toBe(false);
  });

  it('rejects exactly at min length - 1', () => {
    const result = validatePasswordStrength('12345', 6);
    expect(result.valid).toBe(false);
  });

  it('accepts password at minimum length', () => {
    const result = validatePasswordStrength('123456', 6);
    expect(result.valid).toBe(true);
  });

  it('accepts password above minimum length', () => {
    const result = validatePasswordStrength('secure-password-123', 6);
    expect(result.valid).toBe(true);
  });

  it('respects custom min length', () => {
    const result = validatePasswordStrength('123456', 8);
    expect(result.valid).toBe(false);
  });
});
