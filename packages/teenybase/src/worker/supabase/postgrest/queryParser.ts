import { PostgrestRequest, FilterExpr } from '../shared/types';

const RESERVED_PARAMS = new Set([
  'select', 'columns', 'order', 'limit', 'offset',
  'on_conflict', 'resolution', 'schema', 't',
  'callback',
]);

/**
 * Parse a PostgREST request from HTTP method, URLSearchParams, and optional body.
 */
export function parsePostgrestRequest(
  method: string,
  table: string,
  params: URLSearchParams,
  body?: Record<string, unknown> | Record<string, unknown>[] | null,
): PostgrestRequest {
  const filters: FilterExpr[] = [];

  for (const [key, value] of params.entries()) {
    // Filter syntax: column.op=value (e.g., name.eq=Luke)
    // But skip reserved params like select, limit, order, etc.
    const dotIdx = key.indexOf('.');
    if (dotIdx > 0 && !RESERVED_PARAMS.has(key)) {
      const column = key.slice(0, dotIdx);
      const operator = key.slice(dotIdx + 1);
      filters.push({ column, operator, value: parseFilterValue(value) });
    }
  }

  return {
    method: method.toUpperCase() as PostgrestRequest['method'],
    table,
    schema: params.get('schema') ?? undefined,
    select: params.get('select') ?? undefined,
    columns: params.get('columns') ?? undefined,
    filters,
    order: params.get('order') ?? undefined,
    limit: parseIntParam(params.get('limit')),
    offset: parseIntParam(params.get('offset')),
    onConflict: params.get('on_conflict') ?? undefined,
    resolution: params.get('resolution') ?? undefined,
    body: body ?? undefined,
    accept: undefined,
  };
}

/**
 * Parse a filter value from URL string to appropriate JS type.
 */
export function parseFilterValue(raw: string): unknown {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

function parseIntParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = parseInt(value, 10);
  return isNaN(n) ? undefined : n;
}

/** Select column: simple name or nested FK ref */
export type SelectColumn = string | { table: string; columns: SelectColumn[]; alias?: string };

/**
 * Parse the select parameter for column list with nested FK refs.
 * e.g. "id,name,countries(name)" → ["id", "name", { table: "countries", columns: ["name"] }]
 */
export function parseSelectColumns(select: string): SelectColumn[] {
  if (!select || select === '*') return [];
  const columns: SelectColumn[] = [];
  let current = '';
  let depth = 0;
  let nested = '';

  for (let i = 0; i < select.length; i++) {
    const ch = select[i];
    if (ch === '(' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) columns.push(trimmed);
      nested = '';
      depth++;
      current = '';
      continue;
    }
    if (ch === '(') {
      nested += ch;
      depth++;
      continue;
    }
    if (ch === ')' && depth > 0) {
      depth--;
      if (depth === 0) {
        const last = columns[columns.length - 1];
        if (typeof last === 'string') {
          columns[columns.length - 1] = {
            table: last,
            columns: parseSelectColumns(nested),
          };
        }
        nested = '';
        continue;
      }
      nested += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) columns.push(trimmed);
      current = '';
      continue;
    }
    if (depth > 0) {
      nested += ch;
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) columns.push(trimmed);
  return columns;
}

/** Parsed order specification */
export interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
  foreignTable?: string;
}

/**
 * Parse order param into structured form.
 * e.g. "created_at.desc,nullslast" or "countries.name.desc"
 */
const ORDER_TOKENS = new Set(['asc', 'desc', 'nullsfirst', 'nullslast']);

export function parseOrder(order: string): OrderSpec[] {
  if (!order) return [];
  const specs: OrderSpec[] = [];
  for (const part of order.split(',')) {
    const tokens = part.trim().split('.');
    if (tokens.length === 0) continue;

    // Collect non-direction tokens to find foreign table
    const nonDirTokens = tokens.filter((t) => !ORDER_TOKENS.has(t.toLowerCase()));

    let foreignTable: string | undefined;
    let column: string;
    let ascending = true;
    let nullsFirst = false;

    // If 2+ non-direction tokens, first is foreign table, second is column
    if (nonDirTokens.length >= 2) {
      foreignTable = nonDirTokens[0];
      column = nonDirTokens[1];
    } else {
      column = nonDirTokens[0];
    }

    // Parse direction from all tokens
    for (const tok of tokens.slice(1)) {
      switch (tok.toLowerCase()) {
        case 'asc': ascending = true; break;
        case 'desc': ascending = false; break;
        case 'nullsfirst': nullsFirst = true; break;
        case 'nullslast': nullsFirst = false; break;
      }
    }

    specs.push({ column, ascending, nullsFirst, foreignTable });
  }
  return specs;
}
