import { FilterExpr, PostgrestRequest, PostgrestResponse, SupabaseAuthContext } from '../shared/types';
import { ERROR_CODES, throwSupabaseError } from '../shared/errorMapper';
import {
  SelectQuerySelect,
  SelectSubQuery,
} from '../../../sql/build/select';
import { SelectParams, TableSelectParams } from '../../../types/sql';
import { JsepContext, createJsepContext, honoToJsep, parseColumnList } from '../../../sql/parse/jsep';
import { $Table } from '../$Table';
import { TableData } from '../../types/table';
import { compileRlsExpression } from '../rls/policyCompiler';
import { RlsPolicy } from '../rls/policyStore';

/**
 * Build a WHERE clause jsep expression from PostgREST filters.
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
      const vals = String(f.value).split(',').map((v) => v.trim());
      return vals.map((v) => `(${quoteCol(col)} == ${jsonVal(v)})`).join(' | ');
    }
    case 'not':
      return `!(${filterToJsepExpr(f as unknown as FilterExpr)})`;
    case 'cs':
    case 'cd':
    case 'ov': {
      const pattern = `%${f.value}%`;
      return `(${quoteCol(col)} ~ ${jsonVal(pattern)})`;
    }
    case 'match':
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

/** Build an OR expression from filter groups. */
export function buildOrExpression(filterGroups: FilterExpr[][]): string | null {
  if (!filterGroups.length) return null;

  const orParts = filterGroups.map((group) => {
    const andParts = group.map((f) => filterToJsepExpr(f));
    return andParts.length === 1 ? andParts[0] : `(${andParts.join(') & (')})`;
  });

  return orParts.length === 1 ? orParts[0] : `(${orParts.join(') | (')})`;
}

function quoteCol(col: string): string {
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
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

/**
 * Parse PostgREST select columns into Teenybase select format.
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
        case 'desc': descending = true; break;
        case 'asc': descending = false; break;
      }
    }

    parts.push(descending ? `-${column}` : column);
  }

  return parts.join(', ');
}

/** Convert result array to CSV format. */
export function toCsv(data: unknown[]): string {
  if (!data.length) return '';

  const headers = Object.keys(data[0]);
  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => escapeCsv((row as Record<string, unknown>)[h])).join(','),
    ),
  ];
  return lines.join('\r\n');
}

/**
 * Execute a PostgREST SELECT request against Teenybase with RLS injection.
 */
export async function executeSelect(
  req: PostgrestRequest,
  table: $Table,
  tables: TableData[],
  authCtx: SupabaseAuthContext,
  policies: RlsPolicy[] = [],
): Promise<PostgrestResponse> {
  // Build user filter
  const userWhere = buildFilterExpression(req.filters);

  // Build RLS filter
  const rlsWhere = compileRlsExpression(policies, 'SELECT', authCtx, table.name);

  // Combine: user filter AND RLS filter
  let whereExpr: string | null = null;
  if (userWhere && rlsWhere) {
    whereExpr = `(${userWhere}) & (${rlsWhere})`;
  } else if (userWhere) {
    whereExpr = userWhere;
  } else if (rlsWhere) {
    whereExpr = rlsWhere;
  }

  // Parse select columns
  const { selects, subQueries } = buildSelectClause(req.select, table, tables);

  const selectParams: TableSelectParams = {
    select: req.select || '*',
    where: whereExpr ?? undefined,
    limit: req.limit,
    offset: req.offset,
    order: buildOrderBy(req.order),
  };

  let data: unknown;
  let count: number | null = null;

  if (req.preferCount === 'exact') {
    const result = await table.select(selectParams, true);
    data = result.items;
    count = result.total;
  } else {
    data = await table.select(selectParams);
  }

  // Apply subqueries for FK joins
  if (data && Array.isArray(data) && subQueries.length > 0) {
    for (const row of data as Record<string, unknown>[]) {
      for (const sq of subQueries) {
        const fkTable = tables.find((t) => t.name === (sq.from as string));
        if (!fkTable) continue;
        const fkTableObj = table.$db.table(fkTable.name);
        const fkWhere = (sq.where as any)?.q;
        const fkSelect = (sq.selects || ['*']) as string;
        const fkLimit = (sq as any).limit;

        try {
          const fkResult = await fkTableObj.select({
            select: typeof fkSelect === 'string' ? fkSelect : undefined,
            where: fkWhere ? { q: fkWhere } : undefined,
            limit: fkLimit === 1 ? 1 : undefined,
          });
          const alias = (sq as any).as || sq.from;
          row[alias] = fkLimit === 1 ? (fkResult?.[0] ?? null) : (fkResult ?? []);
        } catch {
          const alias = (sq as any).as || sq.from;
          row[alias] = fkLimit === 1 ? null : [];
        }
      }
    }
  }

  // Handle single/maybeSingle
  const singleParam = table.$db.c.req.query('single');
  const maybeSingleParam = table.$db.c.req.query('maybeSingle');
  if (singleParam !== undefined || maybeSingleParam !== undefined) {
    const dataArr = data as unknown[] | null;
    if (!dataArr || dataArr.length === 0) {
      if (singleParam !== undefined) {
        throwSupabaseError(ERROR_CODES.NO_ROWS_FOR_SINGLE, 'JSON object requested, multiple (or no) rows returned', null, null, 406);
      }
      data = null;
    } else if (dataArr.length > 1) {
      throwSupabaseError('PGRST116', 'More than one row returned', null, null, 400);
    } else {
      data = dataArr[0];
    }
  }

  return {
    data: data as Record<string, unknown>[],
    error: null,
    count,
    status: 200,
  };
}
