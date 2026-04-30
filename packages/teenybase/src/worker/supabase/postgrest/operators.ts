import { SQLLiteral, SQLQuery } from '../../types/sql';

/**
 * Map PostgREST filter operators to SQL expressions for jsep.
 *
 * Each operator takes a column name and a value and returns
 * a SQL expression string that jsep can parse.
 */

export interface OperatorDef {
  /** Build jsep expression: "col = $val" etc. */
  toExpr: (column: string, value: unknown) => string;
}

export const OPERATORS: Record<string, OperatorDef> = {
  // Comparison
  eq: { toExpr: (c, _v) => `${c} = $${paramName(c, _v)}` },
  neq: { toExpr: (c, _v) => `${c} != $${paramName(c, _v)}` },
  gt: { toExpr: (c, _v) => `${c} > $${paramName(c, _v)}` },
  gte: { toExpr: (c, _v) => `${c} >= $${paramName(c, _v)}` },
  lt: { toExpr: (c, _v) => `${c} < $${paramName(c, _v)}` },
  lte: { toExpr: (c, _v) => `${c} <= $${paramName(c, _v)}` },

  // Pattern matching
  like: { toExpr: (c, _v) => `${c} LIKE $${paramName(c, _v)}` },
  ilike: { toExpr: (c, _v) => `LOWER(${c}) LIKE LOWER($${paramName(c, _v)})` },

  // Null / Boolean
  is: {
    toExpr: (c, v) => {
      if (v === null) return `${c} IS NULL`;
      if (v === true) return `${c} IS TRUE`;
      if (v === false) return `${c} IS FALSE`;
      return `${c} = $${paramName(c, v)}`;
    },
  },

  // IN list — value is comma-separated string
  in: {
    toExpr: (c, v) => {
      const vals = String(v).split(',').map((_, i) => `$${paramName(c, v)}_${i}`);
      return `${c} IN (${vals.join(', ')})`;
    },
  },

  // Contains (array/jsonb) — uses json_each for SQLite
  cs: { toExpr: (c, _v) => `${c} LIKE $${paramName(c, _v)}` }, // simplified; full impl via json_each
  containedBy: { toExpr: (c, _v) => `${c} LIKE $${paramName(c, _v)}` },
  overlaps: { toExpr: (c, _v) => `${c} LIKE $${paramName(c, _v)}` },

  // Match — shorthand for multiple eq with AND
  match: { toExpr: (_c, _v) => '' }, // handled separately

  // Negation (not) — handled at query parser level
};

/**
 * Build a SQL expression from a filter.
 * Returns { q: sqlString, p: params } suitable for Teenybase WHERE clause.
 */
export function filterToExpr(
  column: string,
  operator: string,
  value: unknown,
): { q: string; p: Record<string, unknown> } {
  const op = OPERATORS[operator];
  if (!op) {
    throw new Error(`Unsupported filter operator: ${operator}`);
  }

  const params: Record<string, unknown> = {};

  if (operator === 'in') {
    // Special handling for IN — value is comma-separated
    const vals = String(value).split(',');
    let expr = `${column} IN (`;
    vals.forEach((v, i) => {
      const key = `${column}_${i}`;
      params[key] = parseInValue(v);
      expr += (i > 0 ? ', ' : '') + `$${key}`;
    });
    expr += ')';
    return { q: expr, p: params };
  }

  if (operator === 'is') {
    if (value === null) return { q: `${column} IS NULL`, p: {} };
    if (value === true) return { q: `${column} IS TRUE`, p: {} };
    if (value === false) return { q: `${column} IS FALSE`, p: {} };
    // Fall through to equality
  }

  if (operator === 'like' || operator === 'ilike') {
    const key = column;
    params[key] = value;
    const expr = op.toExpr(column, value);
    return { q: expr, p: params };
  }

  if (operator === 'cs' || operator === 'containedBy' || operator === 'overlaps') {
    // For array containment, we use json_each subquery
    // Simplified: use LIKE for JSON string matching
    const key = column;
    const pattern = typeof value === 'string' ? `%${value}%` : value;
    params[key] = pattern;
    return { q: `${column} LIKE $${key}`, p: params };
  }

  // Default: single value operator
  const key = column;
  params[key] = value;
  const expr = op.toExpr(column, value);
  return { q: expr, p: params };
}

/**
 * Build a combined WHERE expression from multiple filters.
 * Returns { q: sqlExpression, p: mergedParams } or null if no filters.
 */
export function filtersToWhere(
  filters: Array<{ column: string; operator: string; value: unknown }>,
): { q: string; p: Record<string, unknown> } | null {
  if (!filters.length) return null;

  const parts: string[] = [];
  const allParams: Record<string, unknown> = {};

  for (const filter of filters) {
    const { q, p } = filterToExpr(filter.column, filter.operator, filter.value);
    parts.push(`(${q})`);
    // Merge params, deduplicating keys
    for (const [k, v] of Object.entries(p)) {
      let key = k;
      let idx = 0;
      while (key in allParams) {
        key = `${k}_${idx++}`;
      }
      // Also fix the query string if key was renamed
      if (key !== k) {
        parts[parts.length - 1] = parts[parts.length - 1].replace(`$${k}`, `$${key}`);
      }
      allParams[key] = v;
    }
  }

  return {
    q: parts.join(' AND '),
    p: allParams,
  };
}

function paramName(_column: string, _value: unknown): string {
  return 'val';
}

function parseInValue(v: string): unknown {
  const trimmed = v.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  return trimmed;
}
