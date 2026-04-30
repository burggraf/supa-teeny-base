import { SupabaseRole } from '../shared/types';

export interface RlsPolicy {
  id: string;
  table_name: string;
  name: string;
  role: SupabaseRole | 'anon' | 'authenticated' | 'service_role';
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  using_expr: string | null;
  with_check_expr: string | null;
  permissive: boolean;
}

/** Create the rls_policies table in D1 */
export async function ensureRlsSchema(db: any): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS rls_policies (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, operation TEXT NOT NULL, using_expr TEXT, with_check_expr TEXT, permissive INTEGER DEFAULT 1)`);
}

/** Insert a policy record */
export async function insertPolicy(db: any, policy: Omit<RlsPolicy, 'id'>): Promise<void> {
  const id = `${policy.table_name}_${policy.name}_${policy.role}_${policy.operation}`;
  await db.prepare(
    `INSERT OR REPLACE INTO rls_policies
     (id, table_name, name, role, operation, using_expr, with_check_expr, permissive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, policy.table_name, policy.name, policy.role, policy.operation, policy.using_expr, policy.with_check_expr, policy.permissive ? 1 : 0).run();
}

/** Load all policies for a table from D1 */
export async function loadPolicies(
  db: any,
  tableName: string,
): Promise<RlsPolicy[]> {
  const { results } = await db.prepare(
    'SELECT * FROM rls_policies WHERE table_name = ?',
  ).bind(tableName).all();
  return (results || []) as RlsPolicy[];
}
