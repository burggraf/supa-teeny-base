// Seed data for test catalog — extracted from DATA.md, AUTH.md, STORAGE.md
// Run: node scripts/test-catalog/catalog.js seed

export default function seed(db) {
    const insert = db.prepare(`
        INSERT OR IGNORE INTO test_catalog 
            (category, subcategory, operation, title, description, source_url, priority, v1_scope, test_code, data_source, expected_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    function add(...args) {
        insert.run(...args);
        count++;
    }

    // ═══════════════════════════════════════════════════
    // DATA — CRUD: SELECT
    // ═══════════════════════════════════════════════════

    add('DATA', 'crud', 'select-all', 'Select all rows', 'SELECT * FROM table', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `supabase.from('characters').select()`,
        `CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters VALUES (1,'Luke'),(2,'Leia'),(3,'Han');`,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'crud', 'select-columns', 'Select specific columns', 'SELECT col1, col2', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `supabase.from('characters').select('id,name')`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }], "error": null }`);

    add('DATA', 'crud', 'select-nested', 'Select with nested FK join', 'Embedded FK relation', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `supabase.from('cities').select('id,name,countries(name)')`,
        `CREATE TABLE countries(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE cities(id INTEGER PRIMARY KEY, name TEXT, country_id INTEGER REFERENCES countries(id));\nINSERT INTO countries VALUES(1,'France'),(2,'Japan');\nINSERT INTO cities VALUES(1,'Paris',1),(2,'Tokyo',2);`,
        `{ "data": [{ "id": 1, "name": "Paris", "countries": { "name": "France" } }], "error": null }`);

    add('DATA', 'crud', 'select-single', 'Select single row', 'Returns error if 0 or >1 rows', 'https://supabase.com/docs/reference/javascript/single', 'P0', 'in_scope',
        `supabase.from('characters').select().eq('name','Luke').single()`,
        null,
        `{ "data": { "id": 1, "name": "Luke" }, "error": null }`);

    add('DATA', 'crud', 'select-maybesingle', 'Select maybe single row', 'Returns null if 0 rows, error if >1', 'https://supabase.com/docs/reference/javascript/maybesingle', 'P0', 'in_scope',
        `supabase.from('characters').select().eq('name','Nobody').maybeSingle()`,
        null,
        `{ "data": null, "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — CRUD: INSERT
    // ═══════════════════════════════════════════════════

    add('DATA', 'crud', 'insert-single', 'Insert single row', 'POST with single object body', 'https://supabase.com/docs/reference/javascript/insert', 'P0', 'in_scope',
        `supabase.from('countries').insert({ name: 'Naboo' }).select()`,
        `CREATE TABLE countries(id INTEGER PRIMARY KEY, name TEXT);`,
        `{ "data": [{ "id": 1, "name": "Naboo" }], "error": null }`);

    add('DATA', 'crud', 'insert-bulk', 'Insert multiple rows', 'POST with array body', 'https://supabase.com/docs/reference/javascript/insert', 'P0', 'in_scope',
        `supabase.from('countries').insert([{name:'Alderaan'},{name:'Tatooine'}]).select()`,
        null,
        `{ "data": [{ "id": 1, "name": "Alderaan" }, { "id": 2, "name": "Tatooine" }], "error": null }`);

    add('DATA', 'crud', 'insert-columns', 'Insert with column whitelist', 'columns param restricts inserted cols', 'https://supabase.com/docs/reference/javascript/insert', 'P1', 'in_scope',
        `supabase.from('users').insert([{username:'alice',message:'hello'}]).select('username')`,
        `CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, message TEXT);`,
        `{ "data": [{ "username": "alice" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — CRUD: UPDATE
    // ═══════════════════════════════════════════════════

    add('DATA', 'crud', 'update', 'Update with filter', 'PATCH with WHERE clause', 'https://supabase.com/docs/reference/javascript/update', 'P0', 'in_scope',
        `supabase.from('instruments').update({ name: 'piano' }).eq('name', 'harpsichord').select()`,
        `CREATE TABLE instruments(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO instruments VALUES(1,'harpsichord');`,
        `{ "data": [{ "id": 1, "name": "piano" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — CRUD: UPSERT
    // ═══════════════════════════════════════════════════

    add('DATA', 'crud', 'upsert-merge', 'Upsert with merge', 'INSERT ... ON CONFLICT DO UPDATE', 'https://supabase.com/docs/reference/javascript/upsert', 'P0', 'in_scope',
        `supabase.from('users').upsert({ id: 1, username: 'alice', message: 'updated' }, { onConflict: 'username' }).select()`,
        `CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, message TEXT);\nINSERT INTO users VALUES(1,'alice','hello');`,
        `{ "data": [{ "id": 1, "username": "alice", "message": "updated" }], "error": null }`);

    add('DATA', 'crud', 'upsert-ignore', 'Upsert with ignore duplicates', 'INSERT ... ON CONFLICT DO NOTHING', 'https://supabase.com/docs/reference/javascript/upsert', 'P0', 'in_scope',
        `supabase.from('users').upsert({ username: 'alice', message: 'new' }, { onConflict: 'username', ignoreDuplicates: true }).select()`,
        null,
        `{ "data": [], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — CRUD: DELETE
    // ═══════════════════════════════════════════════════

    add('DATA', 'crud', 'delete', 'Delete with filter', 'DELETE with WHERE clause', 'https://supabase.com/docs/reference/javascript/delete', 'P0', 'in_scope',
        `supabase.from('countries').delete().eq('name', 'Naboo').select()`,
        null,
        `{ "data": [{ "id": 1, "name": "Naboo" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: Comparison operators
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'eq', 'Filter: column equals value', 'WHERE col = val', 'https://supabase.com/docs/reference/javascript/eq', 'P0', 'in_scope',
        `supabase.from('characters').select().eq('name', 'Leia')`,
        `CREATE TABLE characters(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters VALUES(1,'Luke'),(2,'Leia'),(3,'Han');`,
        `{ "data": [{ "id": 2, "name": "Leia" }], "error": null }`);

    add('DATA', 'filters', 'neq', 'Filter: column not equals', 'WHERE col != val', 'https://supabase.com/docs/reference/javascript/neq', 'P0', 'in_scope',
        `supabase.from('characters').select().neq('name', 'Luke')`,
        null,
        `{ "data": [{ "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'filters', 'gt', 'Filter: greater than', 'WHERE col > val', 'https://supabase.com/docs/reference/javascript/gt', 'P0', 'in_scope',
        `supabase.from('characters').select().gt('id', 1)`,
        null,
        `{ "data": [{ "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'filters', 'gte', 'Filter: greater than or equal', 'WHERE col >= val', 'https://supabase.com/docs/reference/javascript/gte', 'P0', 'in_scope',
        `supabase.from('characters').select().gte('id', 2)`,
        null,
        `{ "data": [{ "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'filters', 'lt', 'Filter: less than', 'WHERE col < val', 'https://supabase.com/docs/reference/javascript/lt', 'P0', 'in_scope',
        `supabase.from('characters').select().lt('id', 3)`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 2, "name": "Leia" }], "error": null }`);

    add('DATA', 'filters', 'lte', 'Filter: less than or equal', 'WHERE col <= val', 'https://supabase.com/docs/reference/javascript/lte', 'P0', 'in_scope',
        `supabase.from('characters').select().lte('id', 2)`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 2, "name": "Leia" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: Pattern matching
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'like', 'Filter: LIKE pattern', 'SQL LIKE', 'https://supabase.com/docs/reference/javascript/like', 'P0', 'in_scope',
        `supabase.from('characters').select().like('name', 'L%')`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 2, "name": "Leia" }], "error": null }`);

    add('DATA', 'filters', 'ilike', 'Filter: case-insensitive LIKE', 'LIKE COLLATE NOCASE', 'https://supabase.com/docs/reference/javascript/ilike', 'P0', 'in_scope',
        `supabase.from('characters').select().ilike('name', 'luke')`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: Null/Boolean/IN
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'is', 'Filter: IS NULL/TRUE/FALSE', 'SQL IS NULL/TRUE/FALSE', 'https://supabase.com/docs/reference/javascript/is', 'P0', 'in_scope',
        `supabase.from('characters').select().is('name', null)`,
        `CREATE TABLE characters(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters VALUES(1,'Luke'),(2,NULL);`,
        `{ "data": [{ "id": 2, "name": null }], "error": null }`);

    add('DATA', 'filters', 'in', 'Filter: IN list', 'WHERE col IN (...)', 'https://supabase.com/docs/reference/javascript/in', 'P0', 'in_scope',
        `supabase.from('characters').select().in('name', ['Luke','Han'])`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 3, "name": "Han" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: Logical operators
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'not', 'Filter: NOT negation', 'Negate a filter', 'https://supabase.com/docs/reference/javascript/not', 'P0', 'in_scope',
        `supabase.from('characters').select().not('name', 'eq', 'Luke')`,
        null,
        `{ "data": [{ "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'filters', 'or', 'Filter: OR logic', 'WHERE A OR B', 'https://supabase.com/docs/reference/javascript/or', 'P0', 'in_scope',
        `supabase.from('characters').select().or('name.eq.Luke,name.eq.Han')`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 3, "name": "Han" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: Array/JSONB (emulated)
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'contains', 'Filter: array contains', 'JSON array containment via json_each', 'https://supabase.com/docs/reference/javascript/contains', 'P1', 'in_scope',
        `supabase.from('issues').select().contains('tags', ['bug'])`,
        `CREATE TABLE issues(id INTEGER PRIMARY KEY, title TEXT, tags TEXT);\nINSERT INTO issues VALUES(1,'Crash','["bug","urgent"]'),(2,'Feature','["enhancement"]');`,
        `{ "data": [{ "id": 1, "title": "Crash", "tags": ["bug","urgent"] }], "error": null }`);

    add('DATA', 'filters', 'containedBy', 'Filter: array contained by', 'Reverse containment', 'https://supabase.com/docs/reference/javascript/containedby', 'P1', 'in_scope',
        `supabase.from('issues').select().containedBy('tags', ['bug','urgent','feature'])`,
        null,
        `{ "data": [{ "id": 1, "title": "Crash", "tags": ["bug","urgent"] }], "error": null }`);

    add('DATA', 'filters', 'overlaps', 'Filter: array overlaps', 'JSON array intersection', 'https://supabase.com/docs/reference/javascript/overlaps', 'P1', 'in_scope',
        `supabase.from('issues').select().overlaps('tags', ['bug','docs'])`,
        null,
        `{ "data": [{ "id": 1, "title": "Crash", "tags": ["bug","urgent"] }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: Match / TextSearch
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'match', 'Filter: multi-EQ shorthand', 'col1=val1 AND col2=val2', 'https://supabase.com/docs/reference/javascript/match', 'P0', 'in_scope',
        `supabase.from('characters').select().match({ name: 'Luke' })`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }], "error": null }`);

    add('DATA', 'filters', 'textSearch', 'Filter: full-text search (FTS5)', 'SQLite FTS5 basic terms', 'https://supabase.com/docs/reference/javascript/textsearch', 'P2', 'in_scope',
        `supabase.from('texts').select().textSearch('content', 'cat')`,
        `CREATE TABLE texts(id INTEGER PRIMARY KEY, content TEXT);\nCREATE VIRTUAL TABLE texts_fts USING fts5(content, content_rowid=id);\nINSERT INTO texts VALUES(1,'The cat sat'),(2,'Dog bark');`,
        `{ "data": [{ "id": 1, "content": "The cat sat" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // DATA — FILTERS: SKIP v1 (range operators)
    // ═══════════════════════════════════════════════════

    add('DATA', 'filters', 'rangeGt', 'Filter: range > (SKIP v1)', 'No SQLite range types', 'https://supabase.com/docs/reference/javascript/rangegt', 'P1', 'skip_v1',
        `supabase.from('reservations').select().rangeGt('during', '[2000-01-01,2000-12-31)')`,
        `CREATE TABLE reservations(id INTEGER PRIMARY KEY, during TEXT);`,
        null);

    add('DATA', 'filters', 'rangeGte', 'Filter: range >= (SKIP v1)', null, 'https://supabase.com/docs/reference/javascript/rangegte', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeLt', 'Filter: range < (SKIP v1)', null, 'https://supabase.com/docs/reference/javascript/rangelt', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeLte', 'Filter: range <= (SKIP v1)', null, 'https://supabase.com/docs/reference/javascript/rangelte', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeAdjacent', 'Filter: range adjacent (SKIP v1)', null, 'https://supabase.com/docs/reference/javascript/rangeadjacent', 'P1', 'skip_v1', null, null, null);

    // ═══════════════════════════════════════════════════
    // DATA — MODIFIERS
    // ═══════════════════════════════════════════════════

    add('DATA', 'modifiers', 'order', 'Order: ascending/descending/nulls', 'ORDER BY col [ASC|DESC] [NULLS FIRST|LAST]', 'https://supabase.com/docs/reference/javascript/order', 'P0', 'in_scope',
        `supabase.from('characters').select().order('name', { ascending: true })`,
        null,
        `{ "data": [{ "id": 3, "name": "Han" }, { "id": 2, "name": "Leia" }, { "id": 1, "name": "Luke" }], "error": null }`);

    add('DATA', 'modifiers', 'limit', 'Limit results', 'LIMIT N', 'https://supabase.com/docs/reference/javascript/limit', 'P0', 'in_scope',
        `supabase.from('characters').select().limit(2)`,
        null,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 2, "name": "Leia" }], "error": null }`);

    add('DATA', 'modifiers', 'range', 'Range: offset pagination', 'LIMIT N OFFSET M', 'https://supabase.com/docs/reference/javascript/range', 'P0', 'in_scope',
        `supabase.from('characters').select().range(1, 2)`,
        null,
        `{ "data": [{ "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'modifiers', 'csv', 'CSV output', 'Accept: text/csv', 'https://supabase.com/docs/reference/javascript/db-csv', 'P1', 'in_scope',
        `supabase.from('characters').select().csv()`,
        null,
        `id,name\n1,Luke\n2,Leia\n3,Han`);

    add('DATA', 'modifiers', 'explain', 'EXPLAIN query plan', 'EXPLAIN QUERY PLAN', 'https://supabase.com/docs/reference/javascript/explain', 'P2', 'in_scope',
        `supabase.from('characters').select().explain()`,
        null, null);

    // ═══════════════════════════════════════════════════
    // DATA — PREFER HEADERS
    // ═══════════════════════════════════════════════════

    add('DATA', 'prefer', 'return-representation', 'Prefer: return=representation', 'Return inserted/updated rows', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `supabase.from('countries').insert({ name: 'Naboo' }).select()`,
        null, null);

    add('DATA', 'prefer', 'return-minimal', 'Prefer: return=minimal', 'Return 204 No Content', null, 'P0', 'in_scope',
        `// No .select() after insert/update/delete`,
        null, null);

    add('DATA', 'prefer', 'count-exact', 'Prefer: count=exact', 'Include Content-Range with exact count', null, 'P0', 'in_scope',
        `supabase.from('characters').select('*', { count: 'exact', head: false })`,
        null, null);

    add('DATA', 'prefer', 'count-planned', 'Prefer: count=planned (fallback exact)', 'Planner stats not in SQLite', null, 'P1', 'in_scope',
        `supabase.from('characters').select('*', { count: 'planned' })`,
        null, null);

    // ═══════════════════════════════════════════════════
    // DATA — RLS
    // ═══════════════════════════════════════════════════

    add('DATA', 'rls', 'policy-create', 'RLS: Create policy', 'CREATE POLICY → D1 rls_policies', null, 'P0', 'in_scope',
        `// Policy injection tested via integration`,
        `CREATE TABLE rls_policies(id TEXT PRIMARY KEY, table_name TEXT, name TEXT, role TEXT, operation TEXT, using_expr TEXT, with_check_expr TEXT, permissive INTEGER DEFAULT 1);`,
        null);

    add('DATA', 'rls', 'policy-select', 'RLS: SELECT policy injection', 'WHERE clause from USING expr', null, 'P0', 'in_scope', null, null, null);

    add('DATA', 'rls', 'policy-insert', 'RLS: INSERT policy injection', 'WITH CHECK validation on insert', null, 'P0', 'in_scope', null, null, null);

    add('DATA', 'rls', 'auth-uid', 'RLS: auth.uid() function', 'Returns current user uid from JWT', null, 'P0', 'in_scope', null, null, null);

    add('DATA', 'rls', 'auth-role', 'RLS: auth.role() function', 'Returns current role string', null, 'P0', 'in_scope', null, null, null);

    add('DATA', 'rls', 'auth-email', 'RLS: auth.email() function', 'Returns current user email', null, 'P1', 'in_scope', null, null, null);

    add('DATA', 'rls', 'auth-jwt', 'RLS: auth.jwt() function', 'Returns full JWT payload', null, 'P1', 'in_scope', null, null, null);

    add('DATA', 'rls', 'service-role-bypass', 'RLS: service_role bypasses all policies', 'service_role = no RLS injection', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════
    // DATA — ERROR CODES
    // ═══════════════════════════════════════════════════

    add('DATA', 'errors', 'table-not-found', 'Error: PGRST200 table not found', '404 for unknown table', null, 'P0', 'in_scope',
        `supabase.from('nonexistent').select()`,
        null,
        `{ "message": "relation \"nonexistent\" does not exist", "code": "PGRST200", "details": "", "hint": "" }`);

    add('DATA', 'errors', 'bad-query', 'Error: PGRST100 invalid query', '400 for bad query', null, 'P0', 'in_scope',
        `supabase.from('characters').select().eq('nonexistent_col', 'x')`,
        null,
        `{ "message": "column \"nonexistent_col\" does not exist", "code": "PGRST100", "details": "", "hint": "" }`);

    add('DATA', 'errors', 'unauthorized', 'Error: PGRST301 unauthorized', '401 for bad JWT', null, 'P0', 'in_scope', null, null,
        `{ "message": "JWT expired or invalid", "code": "PGRST301", "details": "", "hint": "" }`);

    add('DATA', 'errors', 'rls-violation', 'Error: PGRST305 RLS violation', '403 for RLS deny', null, 'P0', 'in_scope', null, null,
        `{ "message": "new row violates row-level security policy", "code": "PGRST305", "details": "", "hint": "" }`);

    add('DATA', 'errors', 'unique-violation', 'Error: 23505 unique violation', '409 for unique conflict', null, 'P0', 'in_scope',
        `supabase.from('users').insert({ username: 'duplicate' })`,
        null,
        `{ "message": "duplicate key value violates unique constraint", "code": "23505", "details": "", "hint": "" }`);

    // ═══════════════════════════════════════════════════
    // AUTH — Signup + Email
    // ═══════════════════════════════════════════════════

    add('AUTH', 'signup', 'signup-email', 'Signup with email+password', 'POST /auth/v1/signup', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P0', 'in_scope',
        `supabase.auth.signUp({ email: 'user@example.com', password: 'secure-password' })`,
        null,
        `{ "data": { "user": { "id": "uuid", "email": "user@example.com", "email_confirmed_at": null }, "session": null }, "error": null }`);

    add('AUTH', 'signup', 'signup-autoconfirm', 'Signup with auto-confirm', 'email.autoConfirm = true', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P0', 'in_scope',
        `supabase.auth.signUp({ email: 'user@example.com', password: 'secure-password' })`,
        null,
        `{ "data": { "user": { "id": "uuid", "email": "user@example.com", "email_confirmed_at": "2026-04-29T00:00:00Z" }, "session": { "access_token": "...", "refresh_token": "..." } }, "error": null }`);

    add('AUTH', 'signup', 'signup-phone', 'Signup with phone+password', 'Phone-based signup', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P1', 'in_scope',
        `supabase.auth.signUp({ phone: '+1234567890', password: 'secure-password' })`,
        null, null);

    add('AUTH', 'signup', 'signup-duplicate', 'Signup rejects duplicate email', '422 user_already_exists', null, 'P0', 'in_scope',
        `supabase.auth.signUp({ email: 'existing@example.com', password: 'secure' })`,
        null,
        `{ "data": null, "error": { "message": "User already registered", "code": "user_already_exists", "status": 422 } }`);

    add('AUTH', 'signup', 'signup-weak-password', 'Signup rejects weak password', '422 weak_password', null, 'P0', 'in_scope',
        `supabase.auth.signUp({ email: 'user@example.com', password: '123' })`,
        null,
        `{ "data": null, "error": { "message": "Password should be at least 6 characters", "code": "weak_password", "status": 422 } }`);

    add('AUTH', 'signup', 'signup-disabled', 'Signup when disabled', '422 signup_disabled', null, 'P1', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Signups not allowed", "code": "signup_disabled", "status": 422 } }`);

    // ═══════════════════════════════════════════════════
    // AUTH — Sign In
    // ═══════════════════════════════════════════════════

    add('AUTH', 'signin', 'signin-password', 'Sign in with email+password', 'POST /auth/v1/token?grant_type=password', 'https://supabase.com/docs/reference/javascript/auth-signinwithpassword', 'P0', 'in_scope',
        `supabase.auth.signInWithPassword({ email: 'user@example.com', password: 'secure-password' })`,
        null,
        `{ "data": { "user": { "id": "uuid", "email": "user@example.com" }, "session": { "access_token": "...", "refresh_token": "...", "expires_in": 3600 } }, "error": null }`);

    add('AUTH', 'signin', 'signin-invalid', 'Sign in rejects wrong password', '400 invalid_credentials', null, 'P0', 'in_scope',
        `supabase.auth.signInWithPassword({ email: 'user@example.com', password: 'wrong' })`,
        null,
        `{ "data": null, "error": { "message": "Invalid login credentials", "code": "invalid_credentials", "status": 400 } }`);

    add('AUTH', 'signin', 'signin-anonymous', 'Anonymous sign in', 'Generate random UUID user, aud=anon', 'https://supabase.com/docs/reference/javascript/auth-signinanonymously', 'P1', 'in_scope',
        `supabase.auth.signInAnonymously()`,
        null,
        `{ "data": { "user": { "id": "uuid", "aud": "anon" }, "session": { "access_token": "..." } }, "error": null }`);

    add('AUTH', 'signin', 'refresh-token', 'Refresh token exchange', 'Single-use refresh token', 'https://supabase.com/docs/reference/javascript/auth-refreshsession', 'P0', 'in_scope',
        `supabase.auth.refreshSession()`,
        null,
        `{ "data": { "session": { "access_token": "new-token", "refresh_token": "new-refresh" } }, "error": null }`);

    add('AUTH', 'signin', 'refresh-revoked', 'Refresh rejected if revoked', '400 session_not_found', null, 'P0', 'in_scope',
        `// Attempt refresh after signOut('global')`,
        null,
        `{ "data": null, "error": { "message": "Session not found", "code": "session_not_found", "status": 400 } }`);

    // ═══════════════════════════════════════════════════
    // AUTH — OTP + Magic Links
    // ═══════════════════════════════════════════════════

    add('AUTH', 'otp', 'otp-send', 'Send OTP to email', 'POST /auth/v1/otp', 'https://supabase.com/docs/reference/javascript/auth-signinwithotp', 'P0', 'in_scope',
        `supabase.auth.signInWithOtp({ email: 'user@example.com' })`,
        null,
        `{ "data": { "message_id": null, "user": null }, "error": null }`);

    add('AUTH', 'otp', 'otp-verify', 'Verify OTP token', 'POST /auth/v1/verify', 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P0', 'in_scope',
        `supabase.auth.verifyOtp({ email: 'user@example.com', token: '123456', type: 'email' })`,
        null,
        `{ "data": { "user": { "id": "uuid" }, "session": { "access_token": "..." } }, "error": null }`);

    add('AUTH', 'otp', 'otp-expired', 'Reject expired OTP', '400 otp_expired', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Token has expired", "code": "otp_expired", "status": 400 } }`);

    add('AUTH', 'otp', 'magiclink', 'Magic link flow', 'OTP with type=magiclink', null, 'P1', 'in_scope',
        `supabase.auth.signInWithOtp({ email: 'user@example.com' })`,
        null, null);

    add('AUTH', 'otp', 'resend', 'Resend OTP', 'POST /auth/v1/resend', 'https://supabase.com/docs/reference/javascript/auth-resend', 'P1', 'in_scope',
        `supabase.auth.resend({ email: 'user@example.com', type: 'signup' })`,
        null, null);

    // ═══════════════════════════════════════════════════
    // AUTH — PKCE
    // ═══════════════════════════════════════════════════

    add('AUTH', 'pkce', 'pkce-challenge', 'PKCE challenge storage', 'Store code_challenge in auth_otps', null, 'P0', 'in_scope',
        `// URL param: code_challenge=SHA256(verifier)`,
        null, null);

    add('AUTH', 'pkce', 'pkce-exchange', 'PKCE token exchange', 'POST /auth/v1/token?grant_type=pkce', 'https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession', 'P0', 'in_scope',
        `supabase.auth.exchangeCodeForSession('auth-code-from-url')`,
        null,
        `{ "data": { "session": { "access_token": "..." } }, "error": null }`);

    add('AUTH', 'pkce', 'pkce-wrong-verifier', 'PKCE rejects wrong verifier', '400 code_verifier_mismatch', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Code verifier mismatch", "code": "code_verifier_mismatch", "status": 400 } }`);

    // ═══════════════════════════════════════════════════
    // AUTH — User Management
    // ═══════════════════════════════════════════════════

    add('AUTH', 'user', 'get-user', 'Get current user', 'GET /auth/v1/user with JWT', 'https://supabase.com/docs/reference/javascript/auth-getuser', 'P0', 'in_scope',
        `supabase.auth.getUser()`,
        null,
        `{ "data": { "user": { "id": "uuid", "email": "user@example.com" } }, "error": null }`);

    add('AUTH', 'user', 'update-user', 'Update current user', 'PUT /auth/v1/user', 'https://supabase.com/docs/reference/javascript/auth-updateuser', 'P0', 'in_scope',
        `supabase.auth.updateUser({ email: 'new@example.com' })`,
        null, null);

    add('AUTH', 'user', 'update-password', 'Update password', 'Rehash on password change', null, 'P0', 'in_scope',
        `supabase.auth.updateUser({ password: 'new-password' })`,
        null, null);

    add('AUTH', 'user', 'update-metadata', 'Update user metadata', 'Update user_metadata field', null, 'P0', 'in_scope',
        `supabase.auth.updateUser({ data: { display_name: 'Alice' } })`,
        null, null);

    add('AUTH', 'user', 'signout', 'Sign out (all scopes)', 'POST /auth/v1/logout', 'https://supabase.com/docs/reference/javascript/auth-signout', 'P0', 'in_scope',
        `supabase.auth.signOut()`,
        null,
        `{ "data": null, "error": null }`);

    add('AUTH', 'user', 'signout-local', 'Sign out current session only', 'scope=local', null, 'P1', 'in_scope',
        `supabase.auth.signOut({ scope: 'local' })`,
        null, null);

    add('AUTH', 'user', 'signout-others', 'Sign out other sessions', 'scope=others', null, 'P1', 'in_scope',
        `supabase.auth.signOut({ scope: 'others' })`,
        null, null);

    // ═══════════════════════════════════════════════════
    // AUTH — Password Recovery
    // ═══════════════════════════════════════════════════

    add('AUTH', 'recovery', 'recovery-request', 'Request password recovery', 'POST /auth/v1/recover', 'https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail', 'P0', 'in_scope',
        `supabase.auth.resetPasswordForEmail('user@example.com')`,
        null, null);

    add('AUTH', 'recovery', 'recovery-verify', 'Verify recovery token', 'Via POST /auth/v1/verify type=recovery', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════
    // AUTH — Events
    // ═══════════════════════════════════════════════════

    add('AUTH', 'events', 'onAuthStateChange', 'Auth state change events', 'INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED', 'https://supabase.com/docs/reference/javascript/auth-onauthstatechange', 'P0', 'in_scope',
        `supabase.auth.onAuthStateChange((event, session) => { ... })`,
        null, null);

    // ═══════════════════════════════════════════════════
    // AUTH — Rate Limiting
    // ═══════════════════════════════════════════════════

    add('AUTH', 'rate-limit', 'rate-signup', 'Rate limit signup', '3 per minute per IP', null, 'P1', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Too many requests", "code": "lockout_active", "status": 429 } }`);

    add('AUTH', 'rate-limit', 'rate-login', 'Rate limit login', '10 per minute per IP', null, 'P1', 'in_scope', null, null, null);

    add('AUTH', 'rate-limit', 'rate-otp', 'Rate limit OTP', '5 per minute per email', null, 'P1', 'in_scope', null, null, null);

    add('AUTH', 'rate-limit', 'lockout', 'Lockout enforcement', '300s lockout after threshold', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Security lockout active", "code": "lockout_active", "status": 429 } }`);

    // ═══════════════════════════════════════════════════
    // AUTH — Admin API
    // ═══════════════════════════════════════════════════

    add('AUTH', 'admin', 'admin-create-user', 'Admin create user', 'POST /auth/v1/admin/users', 'https://supabase.com/docs/reference/javascript/auth-admin-createuser', 'P0', 'in_scope',
        `supabase.auth.admin.createUser({ email: 'admin@example.com', email_confirm: true })`,
        null, null);

    add('AUTH', 'admin', 'admin-list-users', 'Admin list users', 'GET /auth/v1/admin/users (paginated)', 'https://supabase.com/docs/reference/javascript/auth-admin-listusers', 'P0', 'in_scope',
        `supabase.auth.admin.listUsers()`,
        null, null);

    add('AUTH', 'admin', 'admin-get-user', 'Admin get user by ID', 'GET /auth/v1/admin/users/{uid}', 'https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid', 'P0', 'in_scope',
        `supabase.auth.admin.getUserById('user-uuid')`,
        null, null);

    add('AUTH', 'admin', 'admin-update-user', 'Admin update user', 'PUT /auth/v1/admin/users/{uid}', 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P0', 'in_scope',
        `supabase.auth.admin.updateUserById('user-uuid', { email: 'new@example.com' })`,
        null, null);

    add('AUTH', 'admin', 'admin-delete-user', 'Admin delete user', 'DELETE /auth/v1/admin/users/{uid}', 'https://supabase.com/docs/reference/javascript/auth-admin-deleteuser', 'P0', 'in_scope',
        `supabase.auth.admin.deleteUser('user-uuid')`,
        null, null);

    add('AUTH', 'admin', 'admin-generate-link', 'Admin generate link', 'POST /auth/v1/admin/generate_link', 'https://supabase.com/docs/reference/javascript/auth-admin-generatelink', 'P0', 'in_scope',
        `supabase.auth.admin.generateLink({ type: 'signup', email: 'user@example.com' })`,
        null, null);

    add('AUTH', 'admin', 'admin-requires-service-role', 'Admin routes reject anon key', '401 for anon on admin routes', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════
    // AUTH — Settings
    // ═══════════════════════════════════════════════════

    add('AUTH', 'settings', 'get-settings', 'Get project settings', 'GET /auth/v1/settings', 'https://supabase.com/docs/reference/javascript/auth-api', 'P1', 'in_scope',
        `// GET /auth/v1/settings`,
        null, null);

    // ═══════════════════════════════════════════════════
    // AUTH — JWT / Password Hashing (Unit tests)
    // ═══════════════════════════════════════════════════

    add('AUTH', 'jwt', 'jwt-encode', 'JWT encode claims', 'HS256 sign with correct claims', null, 'P0', 'in_scope', null, null, null);

    add('AUTH', 'jwt', 'jwt-decode', 'JWT decode and validate', 'Verify signature + expiry', null, 'P0', 'in_scope', null, null, null);

    add('AUTH', 'jwt', 'jwt-expiry', 'JWT expiry rejection', 'Token past exp = 401', null, 'P0', 'in_scope', null, null, null);

    add('AUTH', 'jwt', 'jwt-wrong-secret', 'JWT wrong secret rejection', 'Different secret = invalid sig', null, 'P0', 'in_scope', null, null, null);

    add('AUTH', 'password', 'bcrypt-hash', 'bcrypt password hash', 'Produce valid bcrypt hash', null, 'P0', 'in_scope', null, null, null);

    add('AUTH', 'password', 'bcrypt-compare', 'bcrypt compare match/mismatch', 'Correct = true, wrong = false', null, 'P0', 'in_scope', null, null, null);

    add('AUTH', 'password', 'password-min-length', 'Password minimum length validation', 'Default 6 chars', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════
    // STORAGE — Buckets
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'buckets', 'list-buckets', 'List all buckets', 'GET /storage/v1/bucket/list', 'https://supabase.com/docs/reference/javascript/storage-listbuckets', 'P0', 'in_scope',
        `supabase.storage.listBuckets()`,
        `CREATE TABLE storage_buckets(id TEXT PRIMARY KEY, name TEXT, owner TEXT, public INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, file_size_limit INTEGER, allowed_mime_types TEXT);`,
        `{ "data": [{ "id": "avatars", "name": "avatars", "public": false }], "error": null }`);

    add('STORAGE', 'buckets', 'get-bucket', 'Get bucket by ID', 'GET /storage/v1/bucket/{id}', 'https://supabase.com/docs/reference/javascript/storage-getbucket', 'P0', 'in_scope',
        `supabase.storage.getBucket('avatars')`,
        null,
        `{ "data": { "id": "avatars", "name": "avatars", "public": false }, "error": null }`);

    add('STORAGE', 'buckets', 'create-bucket', 'Create bucket', 'POST /storage/v1/bucket', 'https://supabase.com/docs/reference/javascript/storage-createbucket', 'P0', 'in_scope',
        `supabase.storage.createBucket('avatars', { public: false, fileSizeLimit: 52428800 })`,
        null,
        `{ "data": "avatars", "error": null }`);

    add('STORAGE', 'buckets', 'create-bucket-duplicate', 'Create bucket rejects duplicate', '400 Duplicate', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Bucket already exists", "code": "Duplicate", "status": 400 } }`);

    add('STORAGE', 'buckets', 'update-bucket', 'Update bucket', 'PUT /storage/v1/bucket/{id}', 'https://supabase.com/docs/reference/javascript/storage-updatebucket', 'P0', 'in_scope',
        `supabase.storage.updateBucket('avatars', { public: true })`,
        null,
        `{ "data": { "message": "Bucket updated" }, "error": null }`);

    add('STORAGE', 'buckets', 'delete-bucket', 'Delete bucket', 'DELETE /storage/v1/bucket/{id}', 'https://supabase.com/docs/reference/javascript/storage-deletebucket', 'P0', 'in_scope',
        `supabase.storage.deleteBucket('avatars')`,
        null,
        `{ "data": { "message": "Deleted" }, "error": null }`);

    add('STORAGE', 'buckets', 'delete-bucket-not-empty', 'Delete rejects non-empty bucket', '400 BucketNotEmpty', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Bucket is not empty", "code": "BucketNotEmpty", "status": 400 } }`);

    add('STORAGE', 'buckets', 'empty-bucket', 'Empty bucket', 'POST /storage/v1/bucket/{id}/empty', 'https://supabase.com/docs/reference/javascript/storage-emptybucket', 'P0', 'in_scope',
        `supabase.storage.emptyBucket('avatars')`,
        null,
        `{ "data": [{ "bucket_id": "avatars", "name": "avatar1.png" }], "error": null }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Objects: Upload/Update
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'objects', 'upload', 'Upload file', 'POST /storage/v1/object/{bucket}', 'https://supabase.com/docs/reference/javascript/storage-from-upload', 'P0', 'in_scope',
        `supabase.storage.from('avatars').upload('user1/avatar.png', fileBody)`,
        null,
        `{ "data": { "path": "user1/avatar.png" }, "error": null }`);

    add('STORAGE', 'objects', 'upload-duplicate', 'Upload rejects existing file', '400 Duplicate without upsert', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "The resource already exists", "code": "Duplicate", "status": 400 } }`);

    add('STORAGE', 'objects', 'upload-upsert', 'Upload with upsert', 'x-upsert: true header', null, 'P0', 'in_scope',
        `supabase.storage.from('avatars').upload('user1/avatar.png', fileBody, { upsert: true })`,
        null,
        `{ "data": { "path": "user1/avatar.png" }, "error": null }`);

    add('STORAGE', 'objects', 'update', 'Update existing file', 'PUT /storage/v1/object/{bucket}', 'https://supabase.com/docs/reference/javascript/storage-from-update', 'P0', 'in_scope',
        `supabase.storage.from('avatars').update('user1/avatar.png', newFileBody)`,
        null, null);

    add('STORAGE', 'objects', 'update-not-found', 'Update rejects if file missing', '404 ObjectNotFound', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "The resource was not found", "code": "ObjectNotFound", "status": 404 } }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Objects: Download/Remove
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'objects', 'download', 'Download file', 'GET /storage/v1/object/{bucket}/{path}', 'https://supabase.com/docs/reference/javascript/storage-from-download', 'P0', 'in_scope',
        `supabase.storage.from('avatars').download('user1/avatar.png')`,
        null,
        `{ "data": Blob, "error": null }`);

    add('STORAGE', 'objects', 'download-not-found', 'Download rejects missing file', '404 ObjectNotFound', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "The resource was not found", "code": "ObjectNotFound", "status": 404 } }`);

    add('STORAGE', 'objects', 'remove', 'Remove files', 'DELETE /storage/v1/object/{bucket}', 'https://supabase.com/docs/reference/javascript/storage-from-remove', 'P0', 'in_scope',
        `supabase.storage.from('avatars').remove(['user1/avatar.png'])`,
        null,
        `{ "data": [{ "bucket_id": "avatars", "name": "user1/avatar.png" }], "error": null }`);

    add('STORAGE', 'objects', 'exists', 'Check file exists (HEAD)', 'HEAD /storage/v1/object/{bucket}/{path}', 'https://supabase.com/docs/reference/javascript/storage-from-exists', 'P0', 'in_scope',
        `supabase.storage.from('avatars').exists('user1/avatar.png')`,
        null,
        `{ "data": true, "error": null }`);

    add('STORAGE', 'objects', 'info', 'Get file info', 'POST /storage/v1/object/info/{bucket}/{path}', 'https://supabase.com/docs/reference/javascript/storage-from-info', 'P0', 'in_scope',
        `supabase.storage.from('avatars').info('user1/avatar.png')`,
        null,
        `{ "data": { "name": "avatar.png", "size": 1024, "mimetype": "image/png", "cacheControl": "3600", "lastModified": "2026-04-29T00:00:00Z", "eTag": "abc123" }, "error": null }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Objects: Move/Copy
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'objects', 'move', 'Move file', 'POST /storage/v1/object/{bucket}/move', 'https://supabase.com/docs/reference/javascript/storage-from-move', 'P0', 'in_scope',
        `supabase.storage.from('avatars').move('old/path.png', 'new/path.png')`,
        null,
        `{ "data": { "message": "move object" }, "error": null }`);

    add('STORAGE', 'objects', 'copy', 'Copy file', 'POST /storage/v1/object/{bucket}/copy', 'https://supabase.com/docs/reference/javascript/storage-from-copy', 'P0', 'in_scope',
        `supabase.storage.from('avatars').copy('src/path.png', 'dst/path.png')`,
        null,
        `{ "data": { "path": "dst/path.png" }, "error": null }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Objects: List
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'objects', 'list', 'List objects (offset pagination)', 'POST /storage/v1/object/{bucket}/list', 'https://supabase.com/docs/reference/javascript/storage-from-list', 'P0', 'in_scope',
        `supabase.storage.from('avatars').list('user1/', { limit: 10, offset: 0 })`,
        null,
        `{ "data": [{ "name": "avatar.png", "id": "uuid", "updated_at": "...", "created_at": "...", "last_accessed_at": "...", "metadata": {} }], "error": null }`);

    add('STORAGE', 'objects', 'listV2', 'List objects V2 (cursor pagination)', 'POST /storage/v1/object/{bucket}/list/v2', 'https://supabase.com/docs/reference/javascript/storage-from-listv2', 'P0', 'in_scope',
        `supabase.storage.from('avatars').listV2({ prefix: 'user1/', cursor: null })`,
        null,
        `{ "data": { "objects": [...], "folders": [...], "hasNext": false, "nextCursor": null }, "error": null }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Signed URLs
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'signed-urls', 'create-signed-url', 'Create signed download URL', 'POST /storage/v1/object/sign/{bucket}', 'https://supabase.com/docs/reference/javascript/storage-from-createsignedurl', 'P0', 'in_scope',
        `supabase.storage.from('avatars').createSignedUrl('user1/avatar.png', 600)`,
        null,
        `{ "data": { "signedURL": "/storage/v1/object/sign/avatars/user1/avatar.png?token=..." }, "error": null }`);

    add('STORAGE', 'signed-urls', 'create-signed-urls', 'Create multiple signed URLs', 'POST /storage/v1/object/signatures', 'https://supabase.com/docs/reference/javascript/storage-from-createsignedurls', 'P0', 'in_scope',
        `supabase.storage.from('avatars').createSignedUrls(['file1.png','file2.png'], 600)`,
        null,
        `{ "data": [{ "path": "file1.png", "signedURL": "..." }, { "path": "file2.png", "signedURL": "..." }], "error": null }`);

    add('STORAGE', 'signed-urls', 'signed-url-expired', 'Signed URL rejects when expired', '400 InvalidToken', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Token has expired", "code": "InvalidToken", "status": 400 } }`);

    add('STORAGE', 'signed-urls', 'signed-url-wrong-sig', 'Signed URL rejects bad signature', '400 InvalidToken', null, 'P0', 'in_scope', null, null, null);

    add('STORAGE', 'signed-urls', 'create-signed-upload-url', 'Create signed upload URL', 'POST /storage/v1/upload/resumable', 'https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl', 'P0', 'in_scope',
        `supabase.storage.from('avatars').createSignedUploadUrl('user1/avatar.png')`,
        null,
        `{ "data": { "url": "/storage/v1/upload/resumable", "token": "..." }, "error": null }`);

    add('STORAGE', 'signed-urls', 'upload-to-signed-url', 'Upload via signed URL', 'PUT /storage/v1/upload/resumable', 'https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl', 'P0', 'in_scope',
        `// PUT /storage/v1/upload/resumable with x-upsert-token header`,
        null,
        `{ "data": { "path": "user1/avatar.png" }, "error": null }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Public URLs
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'public', 'get-public-url', 'Get public URL (client-side)', 'Sync URL construction', 'https://supabase.com/docs/reference/javascript/storage-from-getpublicurl', 'P1', 'in_scope',
        `supabase.storage.from('avatars').getPublicUrl('user1/avatar.png')`,
        null,
        `{ "data": { "publicUrl": "https://base/storage/v1/object/public/avatars/user1/avatar.png" } }`);

    // ═══════════════════════════════════════════════════
    // STORAGE — Access Control
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'access-control', 'public-bucket-read', 'Public bucket: anon read', 'Anon can read/list public buckets', null, 'P0', 'in_scope', null, null, null);

    add('STORAGE', 'access-control', 'private-bucket-read-denied', 'Private bucket: anon denied', 'Anon cannot read private', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "Permission denied", "code": "PermissionDenied", "status": 403 } }`);

    add('STORAGE', 'access-control', 'owner-access', 'Owner can access own files', 'Authenticated owner access', null, 'P0', 'in_scope', null, null, null);

    add('STORAGE', 'access-control', 'service-role-bypass', 'service_role bypasses all storage ACL', 'service_role = full access', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════
    // STORAGE — Validation
    // ═══════════════════════════════════════════════════

    add('STORAGE', 'validation', 'size-limit', 'Reject upload exceeding size limit', '413 SizeLimitExceeded', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "File size exceeds limit", "code": "SizeLimitExceeded", "status": 413 } }`);

    add('STORAGE', 'validation', 'mime-validation', 'Reject disallowed MIME type', '422 MimeTypeNotAllowed', null, 'P0', 'in_scope', null, null,
        `{ "data": null, "error": { "message": "MIME type not allowed", "code": "MimeTypeNotAllowed", "status": 422 } }`);

    add('STORAGE', 'validation', 'path-validation', 'Validate file path format', 'No leading slash, no empty segments', null, 'P0', 'in_scope', null, null, null);

    console.log(`\n✓ Seeded ${count} tests into test catalog`);
}
