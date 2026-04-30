import { RlsPolicy } from './policyStore';
import { SupabaseAuthContext, SupabaseRole } from '../shared/types';

/**
 * Compile RLS policies for a (table, role, operation) into a jsep WHERE expression.
 *
 * Rules:
 * - service_role bypasses all RLS → returns null
 * - PERMISSIVE policies are combined with OR (|)
 * - RESTRICTIVE policies are combined with AND (&)
 * - If both types exist: (PERMISSIVE combined) & (RESTRICTIVE combined)
 * - operation 'ALL' matches any operation
 * - role matches the current role or any broader role
 *
 * Expressions have auth.* functions replaced with actual values.
 * Column names are qualified with table name.
 */
export function compileRlsExpression(
  policies: RlsPolicy[],
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  authCtx: SupabaseAuthContext,
  tableName: string,
): string | null {
  if (authCtx.role === 'service_role') return null;
  if (!policies.length) return null;

  const matching = policies.filter((p) => {
    const opMatch = p.operation === operation || p.operation === 'ALL';
    const roleMatch = p.role === authCtx.role || p.role === 'anon' || p.role === 'authenticated';
    return opMatch && roleMatch;
  });

  if (!matching.length) return null;

  const permissive = matching.filter((p) => p.permissive !== false);
  const restrictive = matching.filter((p) => p.permissive === false);

  const compileGroup = (group: RlsPolicy[], exprKey: 'using_expr' | 'with_check_expr'): string | null => {
    const exprs = group
      .map((p) => p[exprKey])
      .filter((e): e is string => !!e);

    if (!exprs.length) return null;

    const processed = exprs.map((expr) => {
      let q = expr;
      // Replace auth.* functions BEFORE qualifying columns
      q = replaceAuthFunctions(q, authCtx);
      // Then qualify remaining bare column names
      q = qualifyColumns(q, tableName);
      return `(${q})`;
    });

    // Permissive uses OR (|), Restrictive uses AND (&)
    const separator = group === permissive ? ' | ' : ' & ';
    if (processed.length === 1) return processed[0];
    return `(${processed.join(separator)})`;
  };

  const usingPermissive = compileGroup(permissive, 'using_expr');
  const usingRestrictive = compileGroup(restrictive, 'using_expr');
  const withCheckPermissive = compileGroup(permissive, 'with_check_expr');
  const withCheckRestrictive = compileGroup(restrictive, 'with_check_expr');

  // For SELECT/DELETE: use USING expressions
  // For INSERT/UPDATE: combine USING and WITH CHECK
  const parts: string[] = [];
  if (operation === 'SELECT' || operation === 'DELETE') {
    if (usingPermissive) parts.push(usingPermissive);
    if (usingRestrictive) parts.push(usingRestrictive);
  } else {
    // INSERT/UPDATE: combine USING and WITH CHECK
    const allPermissive = [usingPermissive, withCheckPermissive].filter(Boolean);
    const allRestrictive = [usingRestrictive, withCheckRestrictive].filter(Boolean);
    if (allPermissive.length) parts.push(allPermissive.join(' | '));
    if (allRestrictive.length) parts.push(allRestrictive.join(' & '));
  }

  if (!parts.length) return null;
  return parts.join(' & ');
}

/** Replace auth.* function calls with actual values */
function replaceAuthFunctions(expr: string, authCtx: SupabaseAuthContext): string {
  return expr
    .replace(/auth\.uid\(\)/g, authCtx.uid !== null ? `'${authCtx.uid}'` : 'null')
    .replace(/auth\.role\(\)/g, `'${authCtx.role}'`)
    .replace(/auth\.email\(\)/g, authCtx.email !== null ? `'${authCtx.email}'` : 'null')
    .replace(/auth\.jwt\(\)/g, authCtx.jwtPayload ? JSON.stringify(authCtx.jwtPayload) : 'null');
}

/** Qualify unqualified column names with table name.
 * Only qualifies bare identifiers that are not:
 * - already qualified (preceded by dot)
 * - keywords (null, true, false)
 * - string literals (inside single quotes)
 * - auth.* function results (already replaced)
 * - numbers
 */
function qualifyColumns(expr: string, tableName: string): string {
  // Split by single-quoted strings to avoid qualifying inside strings
  const parts = expr.split(/('[^']*')/);
  return parts
    .map((part) => {
      if (part.startsWith("'") && part.endsWith("'")) return part; // literal string
      return part.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
        const lower = match.toLowerCase();
        if (lower === 'null' || lower === 'true' || lower === 'false') return match;
        return `${tableName}.${match}`;
      });
    })
    .join('');
}
