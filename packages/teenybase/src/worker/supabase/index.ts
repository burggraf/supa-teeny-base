import { $Database } from '../$Database';
import { $DBExtension } from '../$DBExtension';
import { $Env } from '../env';
import { HttpRoute } from '../types/route';
import { TableData } from '../types/table';
import { resolveConfig, SupabaseCompatConfig } from './shared/config';
import { ERROR_CODES, throwSupabaseError } from './shared/errorMapper';
import { PostgrestRequest, SupabaseError } from './shared/types';
import { parsePostgrestRequest } from './postgrest/queryParser';
import { parsePreferHeader } from './postgrest/preferHeader';
import { extractAuthContext, AuthContextOptions } from './postgrest/authContext';
import { executeSelect, buildFilterExpression } from './postgrest/selectHandler';
import { $Table } from '../$Table';

/**
 * SupabaseCompatExtension — wires /rest/v1/* routes into Teenybase.
 *
 * Phase 1A: Routing + request parsing
 * Phase 1B: SELECT with filters, order, limit, offset
 * Phase 1D: INSERT, UPDATE, UPSERT, DELETE mutations
 * Phase 1E: Response formatting (return=representation, Content-Range)
 */
export class SupabaseCompatExtension<T extends $Env = $Env> implements $DBExtension<T> {
  readonly routes: HttpRoute[];
  readonly config: SupabaseCompatConfig;
  private authOptions: AuthContextOptions;

  constructor(
    private db: $Database<T>,
    config?: Partial<SupabaseCompatConfig>,
  ) {
    const env = db.c.env as Record<string, string | undefined>;
    this.config = { ...resolveConfig(env), ...config };
    this.authOptions = {
      anonKey: this.config.anonKey ?? '',
      serviceKey: this.config.serviceKey ?? '',
    };
    this.routes = this.buildRoutes();
  }

  private buildRoutes(): HttpRoute[] {
    return [
      { method: 'get', path: '/rest/v1/:table', handler: this.handleGet.bind(this), zod: () => ({}) as any },
      { method: 'post', path: '/rest/v1/:table', handler: this.handlePost.bind(this), zod: () => ({}) as any },
      { method: 'patch', path: '/rest/v1/:table', handler: this.handlePatch.bind(this), zod: () => ({}) as any },
      { method: 'delete', path: '/rest/v1/:table', handler: this.handleDelete.bind(this), zod: () => ({}) as any },
      { method: 'head', path: '/rest/v1/:table', handler: this.handleHead.bind(this), zod: () => ({}) as any },
    ];
  }

  private buildRequest(method: string, table: string, body?: unknown): PostgrestRequest {
    const c = this.db.c;
    const params = new URLSearchParams(c.req.url.split('?')[1] || '');
    const req = parsePostgrestRequest(method, table, params, body as Record<string, unknown> | Record<string, unknown>[] | null);

    const prefer = c.req.header('Prefer');
    if (prefer) {
      const parsed = parsePreferHeader(prefer);
      req.preferReturn = parsed.preferReturn ?? undefined;
      req.preferCount = parsed.preferCount ?? undefined;
    }
    req.accept = c.req.header('Accept') ?? undefined;
    return req;
  }

  getAuthContext() {
    const c = this.db.c;
    const apikey = c.req.header('apikey') ?? null;
    const authorization = c.req.header('Authorization') ?? null;
    return extractAuthContext(apikey, authorization, this.authOptions);
  }

  private checkTable(name: string): void {
    const exists = (this.db as any).settings?.tables?.some((t: { name: string }) => t.name === name);
    if (!exists) throwSupabaseError(ERROR_CODES.TABLE_NOT_FOUND, `relation "${name}" does not exist`, null, null, 404);
  }

  // ===================== SELECT =====================

  private async handleGet(_data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);
    const req = this.buildRequest('GET', table, _data);

    try {
      const t = this.db.table(table);
      const tables = (this.db as any).settings?.tables as TableData[] | undefined;
      const result = await executeSelect(req, t, tables || []);

      const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
      if (req.preferCount && result.count !== null) {
        const dataArr = result.data as unknown[] | null;
        if (dataArr && dataArr.length > 0) {
          headers['Content-Range'] = `0-${dataArr.length - 1}/${result.count}`;
        } else {
          headers['Content-Range'] = `*/${result.count}`;
        }
      }
      return this.db.c.json(result.data, { headers });
    } catch (err) {
      if (err instanceof Error && 'status' in err) throw err;
      throwSupabaseError(ERROR_CODES.BAD_QUERY, (err as Error)?.message || 'Query failed', null, null, 400);
    }
  }

  // ===================== INSERT =====================

  private async handlePost(body: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);
    const req = this.buildRequest('POST', table, body);

    if (!req.body) throwSupabaseError(ERROR_CODES.BAD_QUERY, 'Request body is required', null, null, 400);

    try {
      const t = this.db.table(table);
      const values = Array.isArray(req.body) ? req.body : [req.body];

      // Teenybase insert: { values: [{field: value}, ...], returning?: string, or?: 'IGNORE'|'REPLACE' }
      const insertParams: Record<string, unknown> = {
        values: values,
        // Default to returning all columns (PostgREST default is return=representation)
        returning: req.select === undefined ? '*' : (req.select || '*'),
      };

      if (req.onConflict) {
        // UPSERT mode
        insertParams.or = req.resolution === 'ignore-duplicates' ? 'IGNORE' : 'REPLACE';
      }

      const result = await t.insert(insertParams);
      return this.mutationResponse(result, req);
    } catch (err) {
      if (err instanceof Error && 'status' in err) throw err;
      const msg = (err as Error)?.message || 'Insert failed';
      if (msg.includes('UNIQUE constraint')) {
        throwSupabaseError('23505', msg, null, null, 409);
      }
      throwSupabaseError(ERROR_CODES.BAD_QUERY, msg, null, null, 400);
    }
  }

  // ===================== UPDATE =====================

  private async handlePatch(body: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);
    const req = this.buildRequest('PATCH', table, body);

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throwSupabaseError(ERROR_CODES.BAD_QUERY, 'Request body must be a JSON object', null, null, 400);
    }

    // Safety: require at least one filter for UPDATE
    if (!req.filters.length) {
      throwSupabaseError(ERROR_CODES.BAD_QUERY, 'Filter required for UPDATE (use at least one filter param)', null, null, 400);
    }

    try {
      const t = this.db.table(table);
      const whereExpr = buildFilterExpression(req.filters);

      // Teenybase update: { setValues: {field: value}, where: jsepExpression, returning?: string }
      const updateParams: Record<string, unknown> = {
        setValues: req.body,
        where: whereExpr ?? undefined,
        returning: '*',
      };

      const result = await t.update(updateParams);
      return this.mutationResponse(result, req);
    } catch (err) {
      if (err instanceof Error && 'status' in err) throw err;
      throwSupabaseError(ERROR_CODES.BAD_QUERY, (err as Error)?.message || 'Update failed', null, null, 400);
    }
  }

  // ===================== DELETE =====================

  private async handleDelete(_body: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);
    const req = this.buildRequest('DELETE', table, _body);

    // Safety: require at least one filter for DELETE
    if (!req.filters.length) {
      throwSupabaseError(ERROR_CODES.BAD_QUERY, 'Filter required for DELETE (use at least one filter param)', null, null, 400);
    }

    try {
      const t = this.db.table(table);
      const whereExpr = buildFilterExpression(req.filters);

      // Teenybase delete: { where: jsepExpression, returning?: string }
      const deleteParams: Record<string, unknown> = {
        where: whereExpr ?? undefined,
        returning: '*',
      };

      const result = await t.delete(deleteParams);
      return this.mutationResponse(result, req);
    } catch (err) {
      if (err instanceof Error && 'status' in err) throw err;
      throwSupabaseError(ERROR_CODES.BAD_QUERY, (err as Error)?.message || 'Delete failed', null, null, 400);
    }
  }

  // ===================== HEAD (count only) =====================

  private async handleHead(_data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);

    try {
      const t = this.db.table(table);
      // HEAD without filters — just count all rows
      const count = await t.selectCount({});
      const headers: Record<string, string> = { 'Content-Range': `*/${count}` };
      return this.db.c.json(null, { status: 200, headers });
    } catch (err) {
      if (err instanceof Error && 'status' in err) throw err;
      throwSupabaseError(ERROR_CODES.BAD_QUERY, (err as Error)?.message || 'Count failed', null, null, 400);
    }
  }

  // ===================== HELPERS =====================

  /** Clean values for Teenybase insert/update — convert to SQLLiteral format */
  private cleanValues(obj: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val === null) {
        cleaned[key] = null;
      } else if (typeof val === 'object') {
        // JSON values stored as strings
        cleaned[key] = JSON.stringify(val);
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }

  /** Format mutation response based on Prefer: return= header */
  private mutationResponse(
    data: unknown,
    req: PostgrestRequest,
  ): unknown {
    const returnMode = req.preferReturn;

    if (returnMode === 'minimal') {
      return { __status: 201 };
    }

    // return=representation (default): return the data with 201 for POST, 200 for PATCH/DELETE
    return data;
  }
}
