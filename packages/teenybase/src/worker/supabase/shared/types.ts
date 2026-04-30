export type SupabaseRole = 'anon' | 'authenticated' | 'service_role';

export interface SupabaseAuthContext {
  role: SupabaseRole;
  uid: string | null;
  email: string | null;
  jwtPayload: Record<string, unknown> | null;
  apikey: string | null;
}

export interface SupabaseError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}

export interface PostgrestResponse<T = unknown> {
  data: T | null;
  error: SupabaseError | null;
  count: number | null;
  status: number;
}

export interface PostgrestRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  table: string;
  schema?: string;
  select?: string;
  columns?: string;
  filters: FilterExpr[];
  order?: string;
  limit?: number;
  offset?: number;
  onConflict?: string;
  resolution?: string;
  preferReturn?: 'representation' | 'minimal';
  preferCount?: 'exact' | 'planned' | 'estimated';
  body?: Record<string, unknown> | Record<string, unknown>[];
  accept?: string;
}

export interface FilterExpr {
  column: string;
  operator: string;
  value: unknown;
}
