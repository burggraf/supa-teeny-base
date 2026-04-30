import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/** Hash password with bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Compare password against bcrypt hash */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/** Validate password meets minimum length requirement */
export function validatePasswordStrength(password: string, minLength: number): { valid: boolean; reason?: string } {
  if (!password || password.length < minLength) {
    return { valid: false, reason: `Password should be at least ${minLength} characters` };
  }
  return { valid: true };
}
