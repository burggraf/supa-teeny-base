import jsep from 'jsep';
import { FilterExpr, PostgrestRequest, PostgrestResponse, SupabaseError } from '../shared/types';
import { ERROR_CODES, throwSupabaseError } from '../shared/errorMapper';
import { OPERATORS } from './operators';
import {
  buildSelectQuery,
  SelectQuery,
  SelectQueryJoin,
  SelectQuerySelect,
  SelectSubQuery,
} from '../../../sql/build/select';
import { parseSelectQuery } from '../../../sql/parse/select';
import { SelectParams, SQLLiteral, SQLQuery, TableSelectParams } from '../../../types/sql';
import { JsepContext, createJsepContext, honoToJsep, parseColumnList } from '../../../sql/parse/jsep';
import { $Table } from '../$Table';
import { TableData } from '../../types/table';

/**
 * Build a WHERE clause jsep expression from PostgREST filters.
 *
 * For eq/neq/gt/gte/lt/lte: generates jsep tree like {type: 'BinaryExpression', ...}
 * For is: handles IS NULL / IS TRUE / IS FALSE
 * For like/ilike: uses LIKE operator
 * For in: generates OR chain of equality
 *
 * Returns a jsep expression string that can be parsed by Teenybase's jsep system.
 */
export function buildFilterExpression(filters: FilterExpr[]): string | null {
  if (!filters.length) return null;

  const parts: string[] = [];
  for (const f of filters) {
    parts.push(filterToJsepExpr(f));
  }
  return parts.length === 1 ? parts[0] : `(${parts.join(') & (')})`;
}

function filterToJsepExpr(f: FilterExpr): string {
  const col = f.column;

  switch (f.operator) {
    case 'eq':
      return `(${quoteCol(col)} == ${jsonVal(f.value)})`;
    case 'neq':
      return `(${quoteCol(col)} != ${jsonVal(f.value)})`;
    case 'gt':
      return `(${quoteCol(col)} > ${jsonVal(f.value)})`;
    case 'gte':
      return `(${quoteCol(col)} >= ${jsonVal(f.value)})`;
    case 'lt':
      return `(${quoteCol(col)} < ${jsonVal(f.value)})`;
    case 'lte':
      return `(${quoteCol(col)} <= ${jsonVal(f.value)})`;
    case 'like':
      return `(${quoteCol(col)} ~ ${jsonVal(f.value)})`;
    case 'ilike':
      return `(LOWER(${quoteCol(col)}) ~ LOWER(${jsonVal(f.value)}))`;
    case 'is':
      if (f.value === null) return `(${quoteCol(col)} == null)`;
      if (f.value === true) return `(${quoteCol(col)} == true)`;
      if (f.value === false) return `(${quoteCol(col)} == false)`;
      return `(${quoteCol(col)} == ${jsonVal(f.value)})`;
    case 'in': {
      // value is comma-separated string
      const vals = String(f.value).split(',').map((v) => v.trim());
      // Use OR with | (jsep uses | for OR)
      return vals.map((v) => `(${quoteCol(col)} == ${jsonVal(v)})`).join(' | ');
    }
    case 'not':
      return `!(${filterToJsepExpr(f as unknown as FilterExpr)})`;
    case 'cs':
    case 'cd':
    case 'ov': {
      // Array containment — use LIKE with pattern
      const pattern = `%${f.value}%`;
      return `(${quoteCol(col)} ~ ${jsonVal(pattern)})`;
    }
    case 'match':
      // Handled separately — expands to multiple eq with AND
      if (typeof f.value === 'object' && f.value !== null) {
        const eqs: string[] = [];
        for (const [k, v] of Object.entries(f.value)) {
          eqs.push(`(${quoteCol(k)} == ${jsonVal(v)})`);
        }
        return eqs.join(' & ');
      }
      return '(1)';
    default:
      throw new Error(`Unsupported filter operator: ${f.operator}`);
  }
}

function quoteCol(col: string): string {
  // Handle nested column access (e.g., metadata->'key')
  if (col.includes('->')) {
    const parts = col.split('->');
    return parts[0];
  }
  return col;
}

function jsonVal(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  // Escape single quotes for SQL
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

/**
 * Parse PostgREST select columns into Teenybase select format.
 *
 * PostgREST: "id,name,countries(name,cities(name))"
 * Teenybase: uses parseColumnList with JsepContext
 *
 * Returns the select string for Teenybase, plus any nested subqueries.
 */
export function buildSelectClause(
  select: string | undefined,
  table: $Table,
  tables: TableData[],
): { selects: SelectQuerySelect[]; subQueries: SelectSubQuery[] } {
  if (!select || select === '*') {
    return { selects: [], subQueries: [] };
  }

  const jc = createJsepContext(
    table.name,
    tables,
    honoToJsep(table.$db.c.req, table.$db.c.get('auth')),
    [table.name],
  );

  const columns = parseColumnList(select, jc, true, true, true);
  const selects: SelectQuerySelect[] = [];
  const subQueries: SelectSubQuery[] = [];

  for (const col of columns) {
    if (typeof col === 'string') {
      selects.push(col);
    } else if ((col as SelectSubQuery).from) {
      subQueries.push(col as SelectSubQuery);
    } else {
      selects.push(col as SelectQuerySelect);
    }
  }

  return { selects, subQueries };
}

/**
 * Parse PostgREST order into Teenybase order format.
 *
 * PostgREST: "created_at.desc,nullsfirst"
 * Teenybase: "-created_at" for desc, "created_at" for asc
 */
export function buildOrderBy(order: string | undefined): string | undefined {
  if (!order) return undefined;

  const parts: string[] = [];
  for (const part of order.split(',')) {
    const tokens = part.trim().split('.');
    if (tokens.length === 0) continue;

    let column = tokens[0];
    let descending = false;

    for (const tok of tokens.slice(1)) {
      switch (tok.toLowerCase()) {
        case 'desc':
          descending = true;
          break;
        case 'asc':
          descending = false;
          break;
        // nullsfirst/nullslast not yet supported
      }
    }

    parts.push(descending ? `-${column}` : column);
  }

  return parts.join(', ');
}

/**
 * Execute a PostgREST SELECT request against Teenybase.
 *
 * 1. Parse PostgREST request params
 * 2. Build jsep WHERE expression from filters
 * 3. Build Teenybase select query
 * 4. Execute via $Table.select()
 * 5. Format response
 */
export async function executeSelect(
  req: PostgrestRequest,
  table: $Table,
  tables: TableData[],
): Promise<PostgrestResponse> {
  const whereExpr = buildFilterExpression(req.filters);

  // Build the select params for Teenybase
  const selectParams: TableSelectParams = {
    select: req.select || '*',
    where: whereExpr ? whereExpr : undefined,
    limit: req.limit,
    offset: req.offset,
    order: buildOrderBy(req.order),
  };

  // Execute
  let data: unknown;
  let count: number | null = null;

  if (req.preferCount === 'exact') {
    const result = await table.select(selectParams, true);
    data = result.items;
    count = result.total;
  } else {
    data = await table.select(selectParams);
  }

  // Handle single/maybeSingle — determined by response shape
  // This is checked at the router level, not here

  return {
    data: data as Record<string, unknown>[],
    error: null,
    count,
    status: 200,
  };
}
