import { $Database } from '../$Database';
import { $DBExtension } from '../$DBExtension';
import { $Env } from '../env';
import { HttpRoute } from '../types/route';
import { TableData } from '../types/table';
import { resolveConfig, SupabaseCompatConfig } from './shared/config';
import {
  ERROR_CODES,
  throwSupabaseError,
} from './shared/errorMapper';
import {
  PostgrestRequest,
  PostgrestResponse,
  SupabaseError,
} from './shared/types';
import { parsePostgrestRequest } from './postgrest/queryParser';
import { parsePreferHeader } from './postgrest/preferHeader';
import { extractAuthContext, AuthContextOptions } from './postgrest/authContext';
import { executeSelect } from './postgrest/selectHandler';

/**
 * SupabaseCompatExtension — wires /rest/v1/*, /auth/v1/*, /storage/v1/*
 * routes into the Teenybase $Database routing system.
 *
 * Phase 1A: Routing + request parsing with queryParser, preferHeader, authContext.
 * Phase 1B+: SELECT implementation.
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
      {
        method: 'get',
        path: '/rest/v1/:table',
        handler: this.handleGet.bind(this),
        zod: () => ({}) as any,
      },
      {
        method: 'post',
        path: '/rest/v1/:table',
        handler: this.handlePost.bind(this),
        zod: () => ({}) as any,
      },
      {
        method: 'patch',
        path: '/rest/v1/:table',
        handler: this.handlePatch.bind(this),
        zod: () => ({}) as any,
      },
      {
        method: 'delete',
        path: '/rest/v1/:table',
        handler: this.handleDelete.bind(this),
        zod: () => ({}) as any,
      },
      {
        method: 'head',
        path: '/rest/v1/:table',
        handler: this.handleHead.bind(this),
        zod: () => ({}) as any,
      },
    ];
  }

  /** Parse request + auth context from Hono context */
  private buildRequest(method: string, table: string, body?: unknown): PostgrestRequest {
    const c = this.db.c;
    const params = new URLSearchParams(c.req.url.split('?')[1] || '');
    const req = parsePostgrestRequest(method, table, params, body as Record<string, unknown> | Record<string, unknown>[] | null);

    // Parse Prefer header
    const prefer = c.req.header('Prefer');
    if (prefer) {
      const parsed = parsePreferHeader(prefer);
      req.preferReturn = parsed.preferReturn ?? undefined;
      req.preferCount = parsed.preferCount ?? undefined;
    }

    // Parse Accept header
    req.accept = c.req.header('Accept') ?? undefined;

    return req;
  }

  /** Extract auth context from request headers */
  getAuthContext(): ReturnType<typeof extractAuthContext> {
    const c = this.db.c;
    const apikey = c.req.header('apikey') ?? null;
    const authorization = c.req.header('Authorization') ?? null;
    return extractAuthContext(apikey, authorization, this.authOptions);
  }

  private checkTable(name: string): void {
    const exists = (this.db as any).settings?.tables?.some((t: { name: string }) => t.name === name);
    if (!exists) {
      throwSupabaseError(ERROR_CODES.TABLE_NOT_FOUND, `relation "${name}" does not exist`, null, null, 404);
    }
  }

  private async handleGet(_data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);

    const req = this.buildRequest('GET', table, _data);

    try {
      const t = this.db.table(table);
      const tables = (this.db as any).settings?.tables as TableData[] | undefined;
      const result = await executeSelect(req, t, tables || []);

      // Build response with headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
      };

      // Content-Range header for count
      if (req.preferCount && result.count !== null) {
        const dataArr = result.data as unknown[] | null;
        const count = result.count;
        if (dataArr && dataArr.length > 0) {
          headers['Content-Range'] = `0-${dataArr.length - 1}/${count}`;
        } else {
          headers['Content-Range'] = `*/${count}`;
        }
      }

      // Return response with headers
      return this.db.c.json(result.data, { headers });
    } catch (err) {
      if (err instanceof Error && 'status' in err) throw err;
      throwSupabaseError(ERROR_CODES.BAD_QUERY, (err as Error)?.message || 'Query failed', null, null, 400);
    }
  }

  private async handlePost(data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);

    const req = this.buildRequest('POST', table, data);

    return {
      method: req.method,
      table: req.table,
      onConflict: req.onConflict ?? null,
      resolution: req.resolution ?? null,
      preferReturn: req.preferReturn ?? null,
      message: `POST /rest/v1/${table} — INSERT not yet implemented`,
    };
  }

  private async handlePatch(data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);

    const req = this.buildRequest('PATCH', table, data);

    return {
      method: req.method,
      table: req.table,
      filters: req.filters,
      preferReturn: req.preferReturn ?? null,
      message: `PATCH /rest/v1/${table} — UPDATE not yet implemented`,
    };
  }

  private async handleDelete(data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);

    const req = this.buildRequest('DELETE', table, data);

    return {
      method: req.method,
      table: req.table,
      filters: req.filters,
      preferReturn: req.preferReturn ?? null,
      message: `DELETE /rest/v1/${table} — DELETE not yet implemented`,
    };
  }

  private async handleHead(data: unknown, params: Record<string, string>): Promise<unknown> {
    const table = params['table'];
    this.checkTable(table);

    const req = this.buildRequest('HEAD', table, data);

    return {
      method: req.method,
      table: req.table,
      preferCount: req.preferCount ?? null,
      message: `HEAD /rest/v1/${table} — count not yet implemented`,
    };
  }
}
