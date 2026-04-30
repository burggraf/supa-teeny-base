import { describe, it, expect } from 'vitest';
import { compileRlsExpression } from '../../../src/worker/supabase/rls/policyCompiler';
import { RlsPolicy } from '../../../src/worker/supabase/rls/policyStore';
import { SupabaseAuthContext } from '../../../src/worker/supabase/shared/types';

function makePolicy(overrides: Partial<RlsPolicy>): RlsPolicy {
  return {
    id: 'test',
    table_name: 'todos',
    name: 'test_policy',
    role: 'authenticated',
    operation: 'SELECT',
    using_expr: null,
    with_check_expr: null,
    permissive: true,
    ...overrides,
  };
}

function makeAuthCtx(overrides: Partial<SupabaseAuthContext> = {}): SupabaseAuthContext {
  return {
    role: 'authenticated',
    uid: 'user-123',
    email: 'test@example.com',
    jwtPayload: null,
    apikey: null,
    ...overrides,
  };
}

describe('RLS policyCompiler', () => {
  describe('service_role bypass', () => {
    it('returns null for service_role', () => {
      const result = compileRlsExpression(
        [makePolicy({ using_expr: 'user_id = auth.uid()' })],
        'SELECT',
        makeAuthCtx({ role: 'service_role' }),
        'todos',
      );
      expect(result).toBeNull();
    });
  });

  describe('PERMISSIVE policies', () => {
    it('combines permissive policies with OR', () => {
      const policies = [
        makePolicy({ name: 'owner', using_expr: 'user_id == auth.uid()' }),
        makePolicy({ name: 'public', using_expr: 'public == true' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain(' | ');
      expect(result).toContain('user_id');
      expect(result).toContain('public');
    });

    it('qualifies column names with table name', () => {
      const policies = [
        makePolicy({ using_expr: 'user_id == auth.uid()' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain('todos.user_id');
    });
  });

  describe('RESTRICTIVE policies', () => {
    it('combines restrictive policies with AND', () => {
      const policies = [
        makePolicy({ name: 'r1', permissive: false, using_expr: 'active == true' }),
        makePolicy({ name: 'r2', permissive: false, using_expr: 'deleted == false' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain(' & ');
    });
  });

  describe('auth.uid() replacement', () => {
    it('replaces auth.uid() with actual uid', () => {
      const policies = [
        makePolicy({ using_expr: 'user_id == auth.uid()' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain("'user-123'");
      expect(result).not.toContain('auth.uid()');
    });

    it('uses null for missing uid', () => {
      const policies = [
        makePolicy({ using_expr: 'user_id == auth.uid()' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx({ uid: null }), 'todos');
      expect(result).toContain('null');
    });
  });

  describe('auth.role() replacement', () => {
    it('replaces auth.role() with actual role', () => {
      const policies = [
        makePolicy({ using_expr: 'role_col == auth.role()' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain("'authenticated'");
    });
  });

  describe('auth.email() replacement', () => {
    it('replaces auth.email() with actual email', () => {
      const policies = [
        makePolicy({ using_expr: 'email == auth.email()' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain("'test@example.com'");
    });
  });

  describe('operation matching', () => {
    it('matches SELECT policies for SELECT', () => {
      const policies = [
        makePolicy({ operation: 'SELECT', using_expr: 'visible == true' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toContain('todos.visible');
    });

    it('matches ALL policies for any operation', () => {
      const policies = [
        makePolicy({ operation: 'ALL', using_expr: 'active == true' }),
      ];
      const result = compileRlsExpression(policies, 'DELETE', makeAuthCtx(), 'todos');
      expect(result).toContain('todos.active');
    });

    it('does not match SELECT policies for DELETE', () => {
      const policies = [
        makePolicy({ operation: 'SELECT', using_expr: 'visible == true' }),
      ];
      const result = compileRlsExpression(policies, 'DELETE', makeAuthCtx(), 'todos');
      expect(result).toBeNull();
    });
  });

  describe('role matching', () => {
    it('matches authenticated policies for authenticated role', () => {
      const policies = [
        makePolicy({ role: 'authenticated', using_expr: 'owner == true' }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toBeTruthy();
    });

    it('no policies means no RLS', () => {
      const result = compileRlsExpression([], 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toBeNull();
    });

    it('null expression means no filtering', () => {
      const policies = [
        makePolicy({ using_expr: null }),
      ];
      const result = compileRlsExpression(policies, 'SELECT', makeAuthCtx(), 'todos');
      expect(result).toBeNull();
    });
  });
});
