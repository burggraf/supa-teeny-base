// Seed data — ALL tests from DATA.md, AUTH.md, STORAGE.md
// Covers every section and tab from Supabase docs pages

export default function seed(db) {
    const insert = db.prepare(`
        INSERT OR IGNORE INTO test_catalog 
            (category, subcategory, operation, title, description, source_url, priority, v1_scope, test_code, data_source, expected_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    function add(cat, sub, op, title, desc, url, pri, scope, code, sql, resp) {
        insert.run(cat, sub, op, title, desc || null, url || null, pri || 'P1', scope || 'in_scope', code || null, sql || null, resp || null);
        count++;
    }

    // ═══════════════════════════════════════════════════════════
    // DATA — SELECT: Fetch data (12 sections)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'select', 'select-all', 'Getting your data — select all rows', 'Basic SELECT * from table', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data, error } = await supabase.from('characters').select()`,
        `CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters VALUES (1,'Luke'),(2,'Leia'),(3,'Han');`,
        `{ "data": [{ "id": 1, "name": "Luke" }, { "id": 2, "name": "Leia" }, { "id": 3, "name": "Han" }], "error": null }`);

    add('DATA', 'select', 'select-columns', 'Selecting specific columns', 'SELECT id,name from table', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data } = await supabase.from('characters').select('id,name')`, null, null);

    add('DATA', 'select', 'select-referenced', 'Query referenced tables (FK join)', 'Embedded FK relation via select()', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data } = await supabase.from('cities').select('id,name,countries(name)')`,
        `CREATE TABLE countries(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE cities(id INTEGER PRIMARY KEY, name TEXT, country_id INTEGER REFERENCES countries(id));\nINSERT INTO countries VALUES(1,'France'),(2,'Japan');\nINSERT INTO cities VALUES(1,'Paris',1),(2,'Tokyo',2);`, null);

    add('DATA', 'select', 'select-referenced-spaces', 'Query referenced tables with spaces in names', 'Table/column names with spaces need quotes', 'https://supabase.com/docs/reference/javascript/select', 'P1', 'in_scope',
        `const { data } = await supabase.from('user profiles').select('id,"first name",profiles(bio)')`, null, null);

    add('DATA', 'select', 'select-through-join-table', 'Query referenced tables through a join table', 'Many-to-many via junction table', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data } = await supabase.from('students').select('id,name,student_classes(classes(id,name))')`,
        `CREATE TABLE students(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE classes(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE student_classes(student_id INTEGER, class_id INTEGER, PRIMARY KEY(student_id,class_id));`, null);

    add('DATA', 'select', 'select-referenced-multiple', 'Query the same referenced table multiple times', 'Two FKs pointing to same table (e.g. home/away)', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data } = await supabase.from('matches').select('id,home:home_team_id(name),away:away_team_id(name)')`,
        `CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT);\nCREATE TABLE matches(id INTEGER PRIMARY KEY, home_team_id INTEGER REFERENCES teams(id), away_team_id INTEGER REFERENCES teams(id));`, null);

    add('DATA', 'select', 'select-referenced-filter', 'Filtering through referenced tables', 'Filter on FK relation columns', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data } = await supabase.from('cities').select('name,countries(name)').eq('countries.name', 'France')`, null, null);

    add('DATA', 'select', 'select-referenced-count', 'Querying referenced table with count', 'Count rows in referenced table', 'https://supabase.com/docs/reference/javascript/select', 'P1', 'in_scope',
        `const { data } = await supabase.from('countries').select('name,cities(count)')`, null, null);

    add('DATA', 'select', 'select-count-option', 'Querying with count option', 'Include total count in response headers', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data, count, error } = await supabase.from('characters').select('*', { count: 'exact' })`, null, null);

    add('DATA', 'select', 'select-json', 'Querying JSON data', 'Query JSON/JSONB columns with ->> operator', 'https://supabase.com/docs/reference/javascript/select', 'P0', 'in_scope',
        `const { data } = await supabase.from('users').select('id, metadata->>display_name')`, null, null);

    add('DATA', 'select', 'select-referenced-inner', 'Querying referenced table with inner join', 'Only return rows where FK exists', 'https://supabase.com/docs/reference/javascript/select', 'P1', 'in_scope',
        `const { data } = await supabase.from('cities').select('id,name,countries!inner(name)')`, null, null);

    add('DATA', 'select', 'select-schema', 'Switching schemas per query', 'Query non-public schema', 'https://supabase.com/docs/reference/javascript/select', 'P2', 'in_scope',
        `const { data } = await supabase.schema('private').from('users').select()`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — INSERT (3 tabs)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'crud', 'insert-create', 'Create a record', 'Basic INSERT single row', 'https://supabase.com/docs/reference/javascript/insert', 'P0', 'in_scope',
        `const { data } = await supabase.from('countries').insert({ name: 'Naboo' })`,
        `CREATE TABLE countries(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);`, null);

    add('DATA', 'crud', 'insert-create-return', 'Create a record and return it', 'INSERT with .select()', 'https://supabase.com/docs/reference/javascript/insert', 'P0', 'in_scope',
        `const { data } = await supabase.from('countries').insert({ name: 'Naboo' }).select()`, null, null);

    add('DATA', 'crud', 'insert-bulk', 'Bulk create', 'INSERT multiple rows in one call', 'https://supabase.com/docs/reference/javascript/insert', 'P0', 'in_scope',
        `const { data } = await supabase.from('countries').insert([{ name: 'Alderaan' }, { name: 'Tatooine' }])`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — UPDATE (3 tabs)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'crud', 'update-single', 'Updating your data', 'Basic UPDATE with filter', 'https://supabase.com/docs/reference/javascript/update', 'P0', 'in_scope',
        `const { data } = await supabase.from('instruments').update({ name: 'piano' }).eq('name', 'harpsichord')`,
        `CREATE TABLE instruments(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO instruments VALUES(1,'harpsichord');`, null);

    add('DATA', 'crud', 'update-return', 'Update a record and return it', 'UPDATE with .select()', 'https://supabase.com/docs/reference/javascript/update', 'P0', 'in_scope',
        `const { data } = await supabase.from('instruments').update({ name: 'piano' }).eq('name', 'harpsichord').select()`, null, null);

    add('DATA', 'crud', 'update-json', 'Updating JSON data', 'Update JSON/JSONB column fields', 'https://supabase.com/docs/reference/javascript/update', 'P1', 'in_scope',
        `const { data } = await supabase.from('users').update({ metadata: { display_name: 'Bob' } }).eq('id', 1)`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — UPSERT (5 tabs)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'crud', 'upsert-single', 'Upsert a single row using a unique key', 'INSERT ... ON CONFLICT DO UPDATE', 'https://supabase.com/docs/reference/javascript/upsert', 'P0', 'in_scope',
        `const { data } = await supabase.from('users').upsert({ id: 1, username: 'alice', message: 'updated' }, { onConflict: 'username' })`,
        `CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, message TEXT);\nINSERT INTO users VALUES(1,'alice','hello');`, null);

    add('DATA', 'crud', 'upsert-count', 'Upsert with conflict resolution and exact row counting', 'Upsert with count=exact option', 'https://supabase.com/docs/reference/javascript/upsert', 'P1', 'in_scope',
        `const { data, count } = await supabase.from('users').upsert({ id: 1, username: 'alice' }, { onConflict: 'username', count: 'exact' })`, null, null);

    add('DATA', 'crud', 'upsert-basic', 'Upsert your data', 'Basic upsert without return', 'https://supabase.com/docs/reference/javascript/upsert', 'P0', 'in_scope',
        `const { data } = await supabase.from('users').upsert({ username: 'bob', message: 'hi' })`, null, null);

    add('DATA', 'crud', 'upsert-bulk', 'Bulk Upsert your data', 'Multiple rows upsert in one call', 'https://supabase.com/docs/reference/javascript/upsert', 'P0', 'in_scope',
        `const { data } = await supabase.from('users').upsert([{ username: 'a', message: '1' }, { username: 'b', message: '2' }])`, null, null);

    add('DATA', 'crud', 'upsert-constraints', 'Upserting into tables with constraints', 'Upsert respecting unique constraints', 'https://supabase.com/docs/reference/javascript/upsert', 'P0', 'in_scope',
        `const { data } = await supabase.from('users').upsert({ username: 'existing', message: 'new' }, { onConflict: 'username' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — DELETE (3 tabs)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'crud', 'delete-single', 'Delete a single record', 'Basic DELETE with filter', 'https://supabase.com/docs/reference/javascript/delete', 'P0', 'in_scope',
        `const { data } = await supabase.from('countries').delete().eq('name', 'Naboo')`,
        `CREATE TABLE countries(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO countries VALUES(1,'Naboo');`, null);

    add('DATA', 'crud', 'delete-return', 'Delete a record and return it', 'DELETE with .select()', 'https://supabase.com/docs/reference/javascript/delete', 'P0', 'in_scope',
        `const { data } = await supabase.from('countries').delete().eq('name', 'Naboo').select()`, null, null);

    add('DATA', 'crud', 'delete-bulk', 'Delete multiple records', 'DELETE matching multiple rows', 'https://supabase.com/docs/reference/javascript/delete', 'P0', 'in_scope',
        `const { data } = await supabase.from('countries').delete().in('name', ['Naboo', 'Alderaan'])`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — RPC / POSTGRES FUNCTIONS (SKIP v1)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'rpc', 'rpc-no-args', 'Call a Postgres function without arguments', null, 'https://supabase.com/docs/reference/javascript/rpc', 'P2', 'skip_v1', `await supabase.rpc('hello_world')`, null, null);
    add('DATA', 'rpc', 'rpc-with-args', 'Call a Postgres function with arguments', null, 'https://supabase.com/docs/reference/javascript/rpc', 'P2', 'skip_v1', `await supabase.rpc('add_numbers', { a: 2, b: 3 })`, null, null);
    add('DATA', 'rpc', 'rpc-bulk', 'Bulk processing via RPC', null, 'https://supabase.com/docs/reference/javascript/rpc', 'P2', 'skip_v1', null, null, null);
    add('DATA', 'rpc', 'rpc-with-filters', 'Call a Postgres function with filters', null, 'https://supabase.com/docs/reference/javascript/rpc', 'P2', 'skip_v1', null, null, null);
    add('DATA', 'rpc', 'rpc-readonly', 'Call a read-only Postgres function', null, 'https://supabase.com/docs/reference/javascript/rpc', 'P2', 'skip_v1', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — USING FILTERS: overview (5 tabs)
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'filters', 'filter-applying', 'Applying Filters — basic usage', null, 'https://supabase.com/docs/reference/javascript/using-filters', 'P0', 'in_scope', `.eq('name', 'Leia')`, null, null);
    add('DATA', 'filters', 'filter-chaining', 'Chaining multiple filters', '.eq().gt() — AND logic', 'https://supabase.com/docs/reference/javascript/using-filters', 'P0', 'in_scope', `.eq('name', 'Luke').gt('id', 0)`, null, null);
    add('DATA', 'filters', 'filter-conditional', 'Conditional Chaining', 'Apply filter only if condition met', 'https://supabase.com/docs/reference/javascript/using-filters', 'P1', 'in_scope', `if (nameFilter) query.eq('name', nameFilter)`, null, null);
    add('DATA', 'filters', 'filter-json-column', 'Filter by values within a JSON column', 'JSON path filtering', 'https://supabase.com/docs/reference/javascript/using-filters', 'P1', 'in_scope', `.eq('metadata->>display_name', 'Alice')`, null, null);
    add('DATA', 'filters', 'filter-referenced', 'Filter referenced tables', 'Filter on FK relation columns', 'https://supabase.com/docs/reference/javascript/using-filters', 'P0', 'in_scope', `.eq('countries.name', 'France')`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — INDIVIDUAL FILTER OPERATORS
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'filters', 'eq', 'Column is equal to a value (eq)', null, 'https://supabase.com/docs/reference/javascript/eq', 'P0', 'in_scope', `.eq('name', 'Leia')`, null, null);
    add('DATA', 'filters', 'neq', 'Column is not equal to a value (neq)', null, 'https://supabase.com/docs/reference/javascript/neq', 'P0', 'in_scope', `.neq('name', 'Luke')`, null, null);
    add('DATA', 'filters', 'gt', 'Column is greater than a value (gt)', null, 'https://supabase.com/docs/reference/javascript/gt', 'P0', 'in_scope', `.gt('id', 1)`, null, null);
    add('DATA', 'filters', 'gte', 'Column is greater than or equal to a value (gte)', null, 'https://supabase.com/docs/reference/javascript/gte', 'P0', 'in_scope', `.gte('id', 2)`, null, null);
    add('DATA', 'filters', 'lt', 'Column is less than a value (lt)', null, 'https://supabase.com/docs/reference/javascript/lt', 'P0', 'in_scope', `.lt('id', 3)`, null, null);
    add('DATA', 'filters', 'lte', 'Column is less than or equal to a value (lte)', null, 'https://supabase.com/docs/reference/javascript/lte', 'P0', 'in_scope', `.lte('id', 2)`, null, null);
    add('DATA', 'filters', 'like', 'Column matches a pattern (like)', null, 'https://supabase.com/docs/reference/javascript/like', 'P0', 'in_scope', `.like('name', 'L%')`, null, null);
    add('DATA', 'filters', 'ilike', 'Column matches a case-insensitive pattern (ilike)', null, 'https://supabase.com/docs/reference/javascript/ilike', 'P0', 'in_scope', `.ilike('name', 'luke')`, null, null);
    add('DATA', 'filters', 'is', 'Column is a value (is) — NULL/true/false', null, 'https://supabase.com/docs/reference/javascript/is', 'P0', 'in_scope', `.is('name', null)`, null, null);
    add('DATA', 'filters', 'in', 'Column is in an array (in)', null, 'https://supabase.com/docs/reference/javascript/in', 'P0', 'in_scope', `.in('name', ['Luke', 'Han'])`, null, null);

    add('DATA', 'filters', 'contains-array', 'Column contains — on array columns', null, 'https://supabase.com/docs/reference/javascript/contains', 'P1', 'in_scope', `.contains('tags', ['bug'])`, null, null);
    add('DATA', 'filters', 'contains-range', 'Column contains — on range columns — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/contains', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'contains-jsonb', 'Column contains — on jsonb columns', null, 'https://supabase.com/docs/reference/javascript/contains', 'P1', 'in_scope', `.contains('metadata', { key: 'value' })`, null, null);

    add('DATA', 'filters', 'containedBy-array', 'Contained by — on array columns', null, 'https://supabase.com/docs/reference/javascript/containedby', 'P1', 'in_scope', `.containedBy('tags', ['bug', 'urgent'])`, null, null);
    add('DATA', 'filters', 'containedBy-range', 'Contained by — on range columns — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/containedby', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'containedBy-jsonb', 'Contained by — on jsonb columns', null, 'https://supabase.com/docs/reference/javascript/containedby', 'P1', 'in_scope', null, null, null);

    add('DATA', 'filters', 'rangeGt', 'Greater than a range — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/rangegt', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeGte', 'Greater than or equal to a range — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/rangegte', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeLt', 'Less than a range — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/rangelt', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeLte', 'Less than or equal to a range — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/rangelte', 'P1', 'skip_v1', null, null, null);
    add('DATA', 'filters', 'rangeAdjacent', 'Mutually exclusive to a range — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/rangeadjacent', 'P1', 'skip_v1', null, null, null);

    add('DATA', 'filters', 'overlaps-array', 'With a common element — on array columns', null, 'https://supabase.com/docs/reference/javascript/overlaps', 'P1', 'in_scope', `.overlaps('tags', ['bug', 'docs'])`, null, null);
    add('DATA', 'filters', 'overlaps-range', 'With a common element — on range columns — SKIP v1', null, 'https://supabase.com/docs/reference/javascript/overlaps', 'P1', 'skip_v1', null, null, null);

    add('DATA', 'filters', 'textSearch-basic', 'Match a string — text search basic', null, 'https://supabase.com/docs/reference/javascript/textsearch', 'P1', 'in_scope', `.textSearch('content', 'cat')`, null, null);
    add('DATA', 'filters', 'textSearch-phrase', 'Match a string — phrase search', null, 'https://supabase.com/docs/reference/javascript/textsearch', 'P2', 'in_scope', `.textSearch('content', '"fat cat"', { type: 'phrase' })`, null, null);
    add('DATA', 'filters', 'textSearch-plain', 'Match a string — plain search', null, 'https://supabase.com/docs/reference/javascript/textsearch', 'P1', 'in_scope', `.textSearch('content', 'cat', { type: 'plain' })`, null, null);
    add('DATA', 'filters', 'textSearch-websearch', 'Match a string — websearch', null, 'https://supabase.com/docs/reference/javascript/textsearch', 'P2', 'in_scope', `.textSearch('content', 'cat OR dog', { type: 'websearch' })`, null, null);

    add('DATA', 'filters', 'match', 'Match an associated value (match)', null, 'https://supabase.com/docs/reference/javascript/match', 'P0', 'in_scope', `.match({ name: 'Luke', id: 1 })`, null, null);
    add('DATA', 'filters', 'not', "Don't match the filter (not)", null, 'https://supabase.com/docs/reference/javascript/not', 'P0', 'in_scope', `.not('name', 'eq', 'Luke')`, null, null);
    add('DATA', 'filters', 'or', 'Match at least one filter (or)', null, 'https://supabase.com/docs/reference/javascript/or', 'P0', 'in_scope', `.or('name.eq.Luke,name.eq.Han')`, null, null);
    add('DATA', 'filters', 'or-and', 'Use or with and — nested OR/AND', null, 'https://supabase.com/docs/reference/javascript/or', 'P1', 'in_scope', `.or('and(name.eq.Luke,id.eq.1),name.eq.Han')`, null, null);
    add('DATA', 'filters', 'or-referenced', 'Use or on referenced tables', null, 'https://supabase.com/docs/reference/javascript/or', 'P1', 'in_scope', null, null, null);

    add('DATA', 'filters', 'filter-raw', 'Match the filter — raw PostgREST', null, 'https://supabase.com/docs/reference/javascript/filter', 'P2', 'in_scope', `.filter('name', 'eq', 'Luke')`, null, null);
    add('DATA', 'filters', 'filter-referenced-raw', 'Match the filter — on a referenced table', null, 'https://supabase.com/docs/reference/javascript/filter', 'P2', 'in_scope', `.filter('countries.name', 'eq', 'France')`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — MODIFIERS
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'modifiers', 'return-after-insert', 'Return data after inserting', null, 'https://supabase.com/docs/reference/javascript/db-modifiers-select', 'P0', 'in_scope', `.upsert({ username: 'a' }).select()`, null, null);
    add('DATA', 'modifiers', 'order', 'Order the results — basic', null, 'https://supabase.com/docs/reference/javascript/order', 'P0', 'in_scope', `.order('name', { ascending: true })`, null, null);
    add('DATA', 'modifiers', 'order-referenced', 'Order — on a referenced table', null, 'https://supabase.com/docs/reference/javascript/order', 'P0', 'in_scope', `.order('name', { foreignTable: 'countries' })`, null, null);
    add('DATA', 'modifiers', 'order-parent-by-ref', 'Order — parent table by referenced table', null, 'https://supabase.com/docs/reference/javascript/order', 'P1', 'in_scope', null, null, null);
    add('DATA', 'modifiers', 'limit', 'Limit the number of rows', null, 'https://supabase.com/docs/reference/javascript/limit', 'P0', 'in_scope', `.limit(2)`, null, null);
    add('DATA', 'modifiers', 'limit-referenced', 'Limit — on a referenced table', null, 'https://supabase.com/docs/reference/javascript/limit', 'P1', 'in_scope', `.limit(3, { foreignTable: 'cities' })`, null, null);
    add('DATA', 'modifiers', 'range', 'Limit the query to a range', null, 'https://supabase.com/docs/reference/javascript/range', 'P0', 'in_scope', `.range(1, 3)`, null, null);
    add('DATA', 'modifiers', 'abort', 'Abort signal — aborting in-flight', null, 'https://supabase.com/docs/reference/javascript/db-abortsignal', 'P2', 'in_scope', `const c = new AbortController(); supabase.from('t').select().abortSignal(c.signal)`, null, null);
    add('DATA', 'modifiers', 'timeout', 'Abort signal — set a timeout', null, 'https://supabase.com/docs/reference/javascript/db-abortsignal', 'P2', 'in_scope', `setTimeout(() => c.abort(), 5000)`, null, null);
    add('DATA', 'modifiers', 'single', 'Retrieve one row (single)', 'Error if 0 or >1 rows', 'https://supabase.com/docs/reference/javascript/single', 'P0', 'in_scope', `.single()`, null, null);
    add('DATA', 'modifiers', 'maybesingle', 'Retrieve zero or one row (maybeSingle)', 'Null if 0, error if >1', 'https://supabase.com/docs/reference/javascript/maybesingle', 'P0', 'in_scope', `.maybeSingle()`, null, null);
    add('DATA', 'modifiers', 'csv', 'Retrieve as a CSV', null, 'https://supabase.com/docs/reference/javascript/db-csv', 'P1', 'in_scope', `.csv()`, null, null);
    add('DATA', 'modifiers', 'strip-nulls', 'Strip null values', null, 'https://supabase.com/docs/reference/javascript/db-strip-nulls', 'P2', 'in_scope', null, null, null);
    add('DATA', 'modifiers', 'override-type', 'Override type of successful response', null, 'https://supabase.com/docs/reference/javascript/db-overrideTypes', 'P2', 'in_scope', null, null, null);
    add('DATA', 'modifiers', 'override-type-object', 'Override type of object response', null, 'https://supabase.com/docs/reference/javascript/db-overrideTypes', 'P2', 'in_scope', null, null, null);
    add('DATA', 'modifiers', 'explain-plan', 'Using explain — get execution plan', null, 'https://supabase.com/docs/reference/javascript/explain', 'P2', 'in_scope', `.explain()`, null, null);
    add('DATA', 'modifiers', 'explain-analyze', 'Using explain — with analyze and verbose', null, 'https://supabase.com/docs/reference/javascript/explain', 'P2', 'in_scope', `.explain({ analyze: true, verbose: true })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — ERROR CODES
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'errors', 'table-not-found', 'Error: PGRST200 table not found', null, null, 'P0', 'in_scope', `supabase.from('nonexistent').select()`, null, `{ "message": "relation does not exist", "code": "PGRST200", "details": "", "hint": "" }`);
    add('DATA', 'errors', 'bad-query', 'Error: PGRST100 invalid query', null, null, 'P0', 'in_scope', null, null, `{ "message": "column does not exist", "code": "PGRST100", "details": "", "hint": "" }`);
    add('DATA', 'errors', 'unauthorized', 'Error: PGRST301 unauthorized', null, null, 'P0', 'in_scope', null, null, `{ "message": "JWT expired or invalid", "code": "PGRST301", "details": "", "hint": "" }`);
    add('DATA', 'errors', 'rls-violation', 'Error: PGRST305 RLS violation', null, null, 'P0', 'in_scope', null, null, `{ "message": "row violates RLS policy", "code": "PGRST305", "details": "", "hint": "" }`);
    add('DATA', 'errors', 'unique-violation', 'Error: 23505 unique violation', null, null, 'P0', 'in_scope', null, null, `{ "message": "duplicate key value", "code": "23505", "details": "", "hint": "" }`);

    // ═══════════════════════════════════════════════════════════
    // DATA — PREFER HEADERS
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'prefer', 'return-representation', 'Prefer: return=representation', null, null, 'P0', 'in_scope', `.insert({ name: 'X' }).select()`, null, null);
    add('DATA', 'prefer', 'return-minimal', 'Prefer: return=minimal', '204 No Content', null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'prefer', 'count-exact', 'Prefer: count=exact', null, null, 'P0', 'in_scope', `.select('*', { count: 'exact' })`, null, null);
    add('DATA', 'prefer', 'count-planned', 'Prefer: count=planned (fallback exact)', null, null, 'P1', 'in_scope', `.select('*', { count: 'planned' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // DATA — RLS
    // ═══════════════════════════════════════════════════════════

    add('DATA', 'rls', 'policy-create', 'RLS: Create policy', null, null, 'P0', 'in_scope', null,
        `CREATE TABLE rls_policies(id TEXT PRIMARY KEY, table_name TEXT, name TEXT, role TEXT, operation TEXT, using_expr TEXT, with_check_expr TEXT, permissive INTEGER DEFAULT 1);`, null);
    add('DATA', 'rls', 'policy-select', 'RLS: SELECT policy injection', null, null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'rls', 'policy-insert', 'RLS: INSERT policy injection', null, null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'rls', 'policy-update', 'RLS: UPDATE policy injection', null, null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'rls', 'policy-delete', 'RLS: DELETE policy injection', null, null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'rls', 'auth-uid', 'RLS: auth.uid() function', null, null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'rls', 'auth-role', 'RLS: auth.role() function', null, null, 'P0', 'in_scope', null, null, null);
    add('DATA', 'rls', 'auth-email', 'RLS: auth.email() function', null, null, 'P1', 'in_scope', null, null, null);
    add('DATA', 'rls', 'auth-jwt', 'RLS: auth.jwt() function', null, null, 'P1', 'in_scope', null, null, null);
    add('DATA', 'rls', 'service-role-bypass', 'RLS: service_role bypasses all policies', null, null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — SIGNUP
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'signup', 'signup-email-password', 'Signup with email and password', 'POST /auth/v1/signup', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P0', 'in_scope',
        `const { data, error } = await supabase.auth.signUp({ email: 'user@example.com', password: 'secret' })`,
        null, null);
    add('AUTH', 'signup', 'signup-phone-password', 'Signup with phone and password', null, 'https://supabase.com/docs/reference/javascript/auth-signup', 'P1', 'in_scope',
        `await supabase.auth.signUp({ phone: '+1234567890', password: 'secret' })`, null, null);
    add('AUTH', 'signup', 'signup-redirect-url', 'Signup with email redirect URL', 'Redirect to URL after email confirm', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P1', 'in_scope',
        `await supabase.auth.signUp({ email: 'user@example.com', password: 'secret', options: { emailRedirectTo: 'https://example.com' } })`, null, null);
    add('AUTH', 'signup', 'signup-user-metadata', 'Signup with user metadata', 'Include data field in signup', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P0', 'in_scope',
        `await supabase.auth.signUp({ email: 'user@example.com', password: 'secret', options: { data: { display_name: 'Alice' } } })`, null, null);
    add('AUTH', 'signup', 'signup-captcha', 'Signup with captcha token', 'Include captcha verification', 'https://supabase.com/docs/reference/javascript/auth-signup', 'P2', 'in_scope',
        `await supabase.auth.signUp({ email: 'u@e.com', password: 'secret', options: { captchaToken: 'xxx' } })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — SIGN IN WITH PASSWORD
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'signin', 'signin-email-password', 'Sign in with email and password', 'POST /auth/v1/token?grant_type=password', 'https://supabase.com/docs/reference/javascript/auth-signinwithpassword', 'P0', 'in_scope',
        `await supabase.auth.signInWithPassword({ email: 'user@example.com', password: 'secret' })`, null, null);
    add('AUTH', 'signin', 'signin-phone-password', 'Sign in with phone and password', null, 'https://supabase.com/docs/reference/javascript/auth-signinwithpassword', 'P1', 'in_scope',
        `await supabase.auth.signInWithPassword({ phone: '+1234567890', password: 'secret' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — SIGN IN WITH OTP
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'otp', 'otp-email', 'Sign in with email OTP', 'POST /auth/v1/otp', 'https://supabase.com/docs/reference/javascript/auth-signinwithotp', 'P0', 'in_scope',
        `await supabase.auth.signInWithOtp({ email: 'user@example.com' })`, null, null);
    add('AUTH', 'otp', 'otp-phone', 'Sign in with phone OTP', null, 'https://supabase.com/docs/reference/javascript/auth-signinwithotp', 'P1', 'in_scope',
        `await supabase.auth.signInWithOtp({ phone: '+1234567890' })`, null, null);
    add('AUTH', 'otp', 'otp-captcha', 'Sign in with OTP and captcha', null, 'https://supabase.com/docs/reference/javascript/auth-signinwithotp', 'P2', 'in_scope',
        `await supabase.auth.signInWithOtp({ email: 'u@e.com', options: { captchaToken: 'xxx' } })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — VERIFY OTP
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'otp', 'verify-signup', 'Verify OTP — signup type', 'POST /auth/v1/verify', 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P0', 'in_scope',
        `await supabase.auth.verifyOtp({ email: 'user@example.com', token: '123456', type: 'email' })`, null, null);
    add('AUTH', 'otp', 'verify-magiclink', 'Verify OTP — magiclink type', null, 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P0', 'in_scope',
        `await supabase.auth.verifyOtp({ email: 'user@example.com', token: '123456', type: 'magiclink' })`, null, null);
    add('AUTH', 'otp', 'verify-recovery', 'Verify OTP — recovery type', null, 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P0', 'in_scope',
        `await supabase.auth.verifyOtp({ email: 'user@example.com', token: '123456', type: 'recovery' })`, null, null);
    add('AUTH', 'otp', 'verify-invite', 'Verify OTP — invite type', null, 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P1', 'in_scope',
        `await supabase.auth.verifyOtp({ email: 'user@example.com', token: '123456', type: 'invite' })`, null, null);
    add('AUTH', 'otp', 'verify-email-change', 'Verify OTP — email_change type', null, 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P1', 'in_scope',
        `await supabase.auth.verifyOtp({ email: 'user@example.com', token: '123456', type: 'email_change' })`, null, null);
    add('AUTH', 'otp', 'verify-phone-change', 'Verify OTP — phone_change type', null, 'https://supabase.com/docs/reference/javascript/auth-verifyotp', 'P1', 'in_scope',
        `await supabase.auth.verifyOtp({ phone: '+1234567890', token: '123456', type: 'phone_change' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — SIGN OUT
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'user', 'signout-global', 'Sign out — global scope', 'POST /auth/v1/logout (default)', 'https://supabase.com/docs/reference/javascript/auth-signout', 'P0', 'in_scope',
        `await supabase.auth.signOut()`, null, null);
    add('AUTH', 'user', 'signout-local', 'Sign out — local scope', 'Revoke current session only', 'https://supabase.com/docs/reference/javascript/auth-signout', 'P0', 'in_scope',
        `await supabase.auth.signOut({ scope: 'local' })`, null, null);
    add('AUTH', 'user', 'signout-others', 'Sign out — others scope', 'Revoke all other sessions', 'https://supabase.com/docs/reference/javascript/auth-signout', 'P0', 'in_scope',
        `await supabase.auth.signOut({ scope: 'others' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — SESSION
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'session', 'get-session', 'Get current session', 'Returns session from storage', 'https://supabase.com/docs/reference/javascript/auth-getsession', 'P0', 'in_scope',
        `const { data } = await supabase.auth.getSession()`, null, null);
    add('AUTH', 'session', 'refresh-session', 'Refresh session', 'Force refresh before expiry', 'https://supabase.com/docs/reference/javascript/auth-refreshsession', 'P0', 'in_scope',
        `const { data } = await supabase.auth.refreshSession()`, null, null);
    add('AUTH', 'session', 'set-session', 'Set session data', 'Set session from custom tokens', 'https://supabase.com/docs/reference/javascript/auth-setsession', 'P0', 'in_scope',
        `await supabase.auth.setSession({ access_token: '...', refresh_token: '...' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — USER
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'user', 'get-user', 'Get current user', 'GET /auth/v1/user with JWT', 'https://supabase.com/docs/reference/javascript/auth-getuser', 'P0', 'in_scope',
        `const { data } = await supabase.auth.getUser()`, null, null);
    add('AUTH', 'user', 'get-user-jwt', 'Get user — from JWT without network', 'Decode claims from verified JWT', 'https://supabase.com/docs/reference/javascript/auth-getuser', 'P1', 'in_scope',
        `const { data } = await supabase.auth.getUser(jwt)`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — UPDATE USER
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'user', 'update-user-email', 'Update user — email', 'PUT /auth/v1/user (email change flow)', 'https://supabase.com/docs/reference/javascript/auth-updateuser', 'P0', 'in_scope',
        `await supabase.auth.updateUser({ email: 'new@example.com' })`, null, null);
    add('AUTH', 'user', 'update-user-password', 'Update user — password', 'Rehash on password change', 'https://supabase.com/docs/reference/javascript/auth-updateuser', 'P0', 'in_scope',
        `await supabase.auth.updateUser({ password: 'new-password' })`, null, null);
    add('AUTH', 'user', 'update-user-phone', 'Update user — phone', 'Phone change flow', 'https://supabase.com/docs/reference/javascript/auth-updateuser', 'P1', 'in_scope',
        `await supabase.auth.updateUser({ phone: '+1234567890' })`, null, null);
    add('AUTH', 'user', 'update-user-metadata', 'Update user — metadata', 'Update user_metadata', 'https://supabase.com/docs/reference/javascript/auth-updateuser', 'P0', 'in_scope',
        `await supabase.auth.updateUser({ data: { display_name: 'Alice' } })`, null, null);
    add('AUTH', 'user', 'update-user-reauth', 'Update user — requires reauthentication', 'Sensitive ops need reauth nonce', 'https://supabase.com/docs/reference/javascript/auth-updateuser', 'P1', 'in_scope',
        `await supabase.auth.reauthenticate(); await supabase.auth.updateUser({ email: 'new@e.com' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — ANONYMOUS SIGN IN
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'signin', 'signin-anonymous', 'Anonymous sign in', 'Generate random UUID, aud=anon', 'https://supabase.com/docs/reference/javascript/auth-signinanonymously', 'P1', 'in_scope',
        `await supabase.auth.signInAnonymously()`, null, null);
    add('AUTH', 'signin', 'signin-anonymous-metadata', 'Anonymous sign in with metadata', 'Include data on anonymous user', 'https://supabase.com/docs/reference/javascript/auth-signinanonymously', 'P2', 'in_scope',
        `await supabase.auth.signInAnonymously({ options: { data: { role: 'guest' } } })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — PASSWORD RECOVERY
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'recovery', 'recovery-request', 'Reset password for email', 'POST /auth/v1/recover', 'https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail', 'P0', 'in_scope',
        `await supabase.auth.resetPasswordForEmail('user@example.com')`, null, null);
    add('AUTH', 'recovery', 'recovery-redirect', 'Reset password with redirect URL', 'Include redirectTo option', 'https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail', 'P0', 'in_scope',
        `await supabase.auth.resetPasswordForEmail('user@example.com', { redirectTo: 'https://example.com/reset' })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — PKCE
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'pkce', 'pkce-exchange', 'Exchange code for session', 'POST /auth/v1/token?grant_type=pkce', 'https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession', 'P0', 'in_scope',
        `await supabase.auth.exchangeCodeForSession('auth-code-from-url')`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — RESEND
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'otp', 'resend-signup', 'Resend — signup type', 'POST /auth/v1/resend', 'https://supabase.com/docs/reference/javascript/auth-resend', 'P1', 'in_scope',
        `await supabase.auth.resend({ email: 'user@example.com', type: 'signup' })`, null, null);
    add('AUTH', 'otp', 'resend-email-change', 'Resend — email_change type', null, 'https://supabase.com/docs/reference/javascript/auth-resend', 'P1', 'in_scope',
        `await supabase.auth.resend({ email: 'user@example.com', type: 'email_change' })`, null, null);
    add('AUTH', 'otp', 'resend-phone-change', 'Resend — phone_change type', null, 'https://supabase.com/docs/reference/javascript/auth-resend', 'P2', 'in_scope',
        `await supabase.auth.resend({ phone: '+1234567890', type: 'phone_change' })`, null, null);
    add('AUTH', 'otp', 'resend-captcha', 'Resend with captcha token', null, 'https://supabase.com/docs/reference/javascript/auth-resend', 'P2', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — REAUTHENTICATION
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'user', 'reauthenticate', 'Send reauthentication nonce', 'POST /auth/v1/reauthenticate', 'https://supabase.com/docs/reference/javascript/auth-reauthentication', 'P1', 'in_scope',
        `await supabase.auth.reauthenticate()`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — EVENTS
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'events', 'onAuthStateChange', 'Listen to auth state changes', 'INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED', 'https://supabase.com/docs/reference/javascript/auth-onauthstatechange', 'P0', 'in_scope',
        `supabase.auth.onAuthStateChange((event, session) => { ... })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — GET CLAIMS
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'jwt', 'get-claims', 'Get user claims from verified JWT', 'Decode JWT without network call', 'https://supabase.com/docs/reference/javascript/auth-getclaims', 'P1', 'in_scope',
        `const { data } = await supabase.auth.getClaims()`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — AUTO REFRESH
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'session', 'start-auto-refresh', 'Start auto-refresh session (non-browser)', null, 'https://supabase.com/docs/reference/javascript/auth-startautorefresh', 'P2', 'in_scope',
        `await supabase.auth.startAutoRefresh()`, null, null);
    add('AUTH', 'session', 'stop-auto-refresh', 'Stop auto-refresh session (non-browser)', null, 'https://supabase.com/docs/reference/javascript/auth-stopautorefresh', 'P2', 'in_scope',
        `await supabase.auth.stopAutoRefresh()`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — INITIALIZE
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'session', 'initialize', 'Initialize client session', 'Client init', 'https://supabase.com/docs/reference/javascript/auth-initialize', 'P2', 'in_scope',
        `await supabase.auth.initialize()`, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — JWT (Unit)
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'jwt', 'jwt-encode', 'JWT encode claims', 'HS256 sign with correct claims', null, 'P0', 'in_scope', null, null, null);
    add('AUTH', 'jwt', 'jwt-decode', 'JWT decode and validate', 'Verify signature + expiry', null, 'P0', 'in_scope', null, null, null);
    add('AUTH', 'jwt', 'jwt-expiry', 'JWT expiry rejection', 'Token past exp = 401', null, 'P0', 'in_scope', null, null, null);
    add('AUTH', 'jwt', 'jwt-wrong-secret', 'JWT wrong secret rejection', 'Different secret = invalid sig', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — PASSWORD HASHING (Unit)
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'password', 'bcrypt-hash', 'bcrypt password hash', 'Produce valid bcrypt hash', null, 'P0', 'in_scope', null, null, null);
    add('AUTH', 'password', 'bcrypt-compare', 'bcrypt compare match/mismatch', null, null, 'P0', 'in_scope', null, null, null);
    add('AUTH', 'password', 'password-min-length', 'Password minimum length validation', null, null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — RATE LIMITING
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'rate-limit', 'rate-signup', 'Rate limit signup', '3/min per IP', null, 'P1', 'in_scope', null, null, null);
    add('AUTH', 'rate-limit', 'rate-login', 'Rate limit login', '10/min per IP', null, 'P1', 'in_scope', null, null, null);
    add('AUTH', 'rate-limit', 'rate-otp', 'Rate limit OTP', '5/min per email', null, 'P1', 'in_scope', null, null, null);
    add('AUTH', 'rate-limit', 'lockout', 'Lockout enforcement', '300s lockout after threshold', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — ADMIN
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'admin', 'admin-get-user', 'Admin get user by ID', 'GET /auth/v1/admin/users/{uid}', 'https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid', 'P0', 'in_scope',
        `supabase.auth.admin.getUserById('uid')`, null, null);
    add('AUTH', 'admin', 'admin-list-users', 'Admin list users', 'GET /auth/v1/admin/users (paginated)', 'https://supabase.com/docs/reference/javascript/auth-admin-listusers', 'P0', 'in_scope',
        `supabase.auth.admin.listUsers()`, null, null);
    add('AUTH', 'admin', 'admin-list-users-paginated', 'Admin list users — paginated', 'With page/perPage params', 'https://supabase.com/docs/reference/javascript/auth-admin-listusers', 'P0', 'in_scope',
        `supabase.auth.admin.listUsers({ page: 2, perPage: 25 })`, null, null);
    add('AUTH', 'admin', 'admin-create-user', 'Admin create user', 'POST /auth/v1/admin/users', 'https://supabase.com/docs/reference/javascript/auth-admin-createuser', 'P0', 'in_scope',
        `supabase.auth.admin.createUser({ email: 'admin@e.com' })`, null, null);
    add('AUTH', 'admin', 'admin-create-user-confirm', 'Admin create user — auto confirm email', 'email_confirm: true', 'https://supabase.com/docs/reference/javascript/auth-admin-createuser', 'P0', 'in_scope',
        `supabase.auth.admin.createUser({ email: 'a@e.com', email_confirm: true })`, null, null);
    add('AUTH', 'admin', 'admin-create-user-metadata', 'Admin create user — with metadata', 'app_metadata + user_metadata', 'https://supabase.com/docs/reference/javascript/auth-admin-createuser', 'P0', 'in_scope',
        `supabase.auth.admin.createUser({ email: 'a@e.com', user_metadata: { name: 'A' }, app_metadata: { provider: 'email' } })`, null, null);
    add('AUTH', 'admin', 'admin-delete-user', 'Admin delete user', 'DELETE /auth/v1/admin/users/{uid}', 'https://supabase.com/docs/reference/javascript/auth-admin-deleteuser', 'P0', 'in_scope',
        `supabase.auth.admin.deleteUser('uid')`, null, null);
    add('AUTH', 'admin', 'admin-update-user-email', 'Admin update user — email', 'PUT /auth/v1/admin/users/{uid}', 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P0', 'in_scope',
        `supabase.auth.admin.updateUserById('uid', { email: 'new@e.com' })`, null, null);
    add('AUTH', 'admin', 'admin-update-user-password', 'Admin update user — password', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P0', 'in_scope',
        `supabase.auth.admin.updateUserById('uid', { password: 'new' })`, null, null);
    add('AUTH', 'admin', 'admin-update-user-role', 'Admin update user — role', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P1', 'in_scope',
        `supabase.auth.admin.updateUserById('uid', { role: 'service_role' })`, null, null);
    add('AUTH', 'admin', 'admin-update-user-banned', 'Admin update user — banned_until', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P1', 'in_scope',
        `supabase.auth.admin.updateUserById('uid', { banned_until: '2026-12-31T00:00:00Z' })`, null, null);
    add('AUTH', 'admin', 'admin-update-user-metadata', 'Admin update user — metadata', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P0', 'in_scope',
        `supabase.auth.admin.updateUserById('uid', { user_metadata: { name: 'B' } })`, null, null);
    add('AUTH', 'admin', 'admin-update-user-app-meta', 'Admin update user — app_metadata', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P1', 'in_scope', null, null, null);
    add('AUTH', 'admin', 'admin-update-user-phone', 'Admin update user — phone', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P1', 'in_scope', null, null, null);
    add('AUTH', 'admin', 'admin-update-user-confirm', 'Admin update user — email_confirm', null, 'https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid', 'P0', 'in_scope', null, null, null);
    add('AUTH', 'admin', 'admin-invite-user', 'Admin invite user by email', 'POST /auth/v1/admin/users with invite', 'https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail', 'P0', 'in_scope',
        `supabase.auth.admin.inviteUserByEmail('invited@e.com')`, null, null);
    add('AUTH', 'admin', 'admin-generate-link-signup', 'Admin generate link — signup', 'POST /auth/v1/admin/generate_link', 'https://supabase.com/docs/reference/javascript/auth-admin-generatelink', 'P0', 'in_scope',
        `supabase.auth.admin.generateLink({ type: 'signup', email: 'u@e.com' })`, null, null);
    add('AUTH', 'admin', 'admin-generate-link-invite', 'Admin generate link — invite', null, 'https://supabase.com/docs/reference/javascript/auth-admin-generatelink', 'P0', 'in_scope',
        `supabase.auth.admin.generateLink({ type: 'invite', email: 'u@e.com' })`, null, null);
    add('AUTH', 'admin', 'admin-generate-link-magiclink', 'Admin generate link — magiclink', null, 'https://supabase.com/docs/reference/javascript/auth-admin-generatelink', 'P0', 'in_scope',
        `supabase.auth.admin.generateLink({ type: 'magiclink', email: 'u@e.com' })`, null, null);
    add('AUTH', 'admin', 'admin-generate-link-recovery', 'Admin generate link — recovery', null, 'https://supabase.com/docs/reference/javascript/auth-admin-generatelink', 'P0', 'in_scope',
        `supabase.auth.admin.generateLink({ type: 'recovery', email: 'u@e.com' })`, null, null);
    add('AUTH', 'admin', 'admin-generate-link-email-change', 'Admin generate link — email_change', null, 'https://supabase.com/docs/reference/javascript/auth-admin-generatelink', 'P0', 'in_scope',
        `supabase.auth.admin.generateLink({ type: 'email_change', email: 'u@e.com', options: { newEmail: 'new@e.com' } })`, null, null);
    add('AUTH', 'admin', 'admin-signout', 'Admin sign out', 'POST /auth/v1/admin/signout', 'https://supabase.com/docs/reference/javascript/auth-admin-signout', 'P1', 'in_scope',
        `supabase.auth.admin.signOut('jwt', 'global')`, null, null);
    add('AUTH', 'admin', 'admin-requires-service-role', 'Admin routes reject anon key', '401 for anon', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — SETTINGS
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'settings', 'get-settings', 'Get project settings', 'GET /auth/v1/settings', null, 'P1', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // AUTH — IDENTITIES (v2 scope)
    // ═══════════════════════════════════════════════════════════

    add('AUTH', 'identities', 'get-identities', 'Get user identities', 'Linked OAuth identities', 'https://supabase.com/docs/reference/javascript/auth-getuseridentities', 'P2', 'v2', null, null, null);
    add('AUTH', 'identities', 'link-identity', 'Link OAuth identity', null, 'https://supabase.com/docs/reference/javascript/auth-linkidentity', 'P2', 'v2', null, null, null);
    add('AUTH', 'identities', 'unlink-identity', 'Unlink identity', null, 'https://supabase.com/docs/reference/javascript/auth-unlinkidentity', 'P2', 'v2', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — BUCKETS
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'buckets', 'list-buckets', 'List all buckets', null, 'https://supabase.com/docs/reference/javascript/storage-listbuckets', 'P0', 'in_scope',
        `const { data } = await supabase.storage.listBuckets()`,
        `CREATE TABLE storage_buckets(id TEXT PRIMARY KEY, name TEXT, owner TEXT, public INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, file_size_limit INTEGER, allowed_mime_types TEXT);`, null);
    add('STORAGE', 'buckets', 'get-bucket', 'Retrieve a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-getbucket', 'P0', 'in_scope',
        `const { data } = await supabase.storage.getBucket('avatars')`, null, null);
    add('STORAGE', 'buckets', 'create-bucket', 'Create a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-createbucket', 'P0', 'in_scope',
        `const { data } = await supabase.storage.createBucket('avatars', { public: false, fileSizeLimit: 52428800 })`, null, null);
    add('STORAGE', 'buckets', 'create-bucket-duplicate', 'Create bucket rejects duplicate', '400 Duplicate', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'buckets', 'empty-bucket', 'Empty a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-emptybucket', 'P0', 'in_scope',
        `const { data } = await supabase.storage.emptyBucket('avatars')`, null, null);
    add('STORAGE', 'buckets', 'update-bucket', 'Update a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-updatebucket', 'P0', 'in_scope',
        `const { data } = await supabase.storage.updateBucket('avatars', { public: true })`, null, null);
    add('STORAGE', 'buckets', 'delete-bucket', 'Delete a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-deletebucket', 'P0', 'in_scope',
        `const { data } = await supabase.storage.deleteBucket('avatars')`, null, null);
    add('STORAGE', 'buckets', 'delete-bucket-not-empty', 'Delete rejects non-empty bucket', '400 BucketNotEmpty', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — OBJECTS: UPLOAD/UPDATE
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'objects', 'upload', 'Upload a file', null, 'https://supabase.com/docs/reference/javascript/storage-from-upload', 'P0', 'in_scope',
        `const { data } = await supabase.storage.from('avatars').upload('user1/avatar.png', fileBody)`, null, null);
    add('STORAGE', 'objects', 'upload-duplicate', 'Upload rejects existing file', '400 Duplicate', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'objects', 'upload-upsert', 'Upload with upsert', 'x-upsert: true', null, 'P0', 'in_scope',
        `await supabase.storage.from('avatars').upload('user1/avatar.png', fileBody, { upsert: true })`, null, null);
    add('STORAGE', 'objects', 'update', 'Replace an existing file', null, 'https://supabase.com/docs/reference/javascript/storage-from-update', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').update('user1/avatar.png', newFileBody)`, null, null);
    add('STORAGE', 'objects', 'update-not-found', 'Update rejects if file missing', '404 ObjectNotFound', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — OBJECTS: MOVE/COPY
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'objects', 'move', 'Move an existing file', null, 'https://supabase.com/docs/reference/javascript/storage-from-move', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').move('old/path.png', 'new/path.png')`, null, null);
    add('STORAGE', 'objects', 'copy', 'Copy an existing file', null, 'https://supabase.com/docs/reference/javascript/storage-from-copy', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').copy('src/path.png', 'dst/path.png')`, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — SIGNED URLS
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'signed-urls', 'create-signed-url', 'Create a signed URL', null, 'https://supabase.com/docs/reference/javascript/storage-from-createsignedurl', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').createSignedUrl('user1/avatar.png', 600)`, null, null);
    add('STORAGE', 'signed-urls', 'create-signed-urls', 'Create signed URLs (batch)', null, 'https://supabase.com/docs/reference/javascript/storage-from-createsignedurls', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').createSignedUrls(['f1.png','f2.png'], 600)`, null, null);
    add('STORAGE', 'signed-urls', 'signed-url-expired', 'Signed URL rejects when expired', '400 InvalidToken', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'signed-urls', 'signed-url-wrong-sig', 'Signed URL rejects bad signature', '400 InvalidToken', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'signed-urls', 'create-signed-upload-url', 'Create signed upload URL', null, 'https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').createSignedUploadUrl('user1/avatar.png')`, null, null);
    add('STORAGE', 'signed-urls', 'upload-to-signed-url', 'Upload to a signed URL', null, 'https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl', 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — PUBLIC / DOWNLOAD
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'public', 'get-public-url', 'Retrieve public URL', 'Sync URL construction', 'https://supabase.com/docs/reference/javascript/storage-from-getpublicurl', 'P1', 'in_scope',
        `const { data } = supabase.storage.from('avatars').getPublicUrl('user1/avatar.png')`, null, null);
    add('STORAGE', 'objects', 'download', 'Download a file', null, 'https://supabase.com/docs/reference/javascript/storage-from-download', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').download('user1/avatar.png')`, null, null);
    add('STORAGE', 'objects', 'download-not-found', 'Download rejects missing file', '404 ObjectNotFound', null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — REMOVE / LIST
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'objects', 'remove', 'Delete files in a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-from-remove', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').remove(['user1/avatar.png'])`, null, null);
    add('STORAGE', 'objects', 'list', 'List all files in a bucket', null, 'https://supabase.com/docs/reference/javascript/storage-from-list', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').list('user1/', { limit: 10, offset: 0 })`, null, null);
    add('STORAGE', 'objects', 'exists', 'Check if file exists', null, 'https://supabase.com/docs/reference/javascript/storage-from-exists', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').exists('user1/avatar.png')`, null, null);
    add('STORAGE', 'objects', 'info', 'Get file metadata', null, 'https://supabase.com/docs/reference/javascript/storage-from-info', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').info('user1/avatar.png')`, null, null);
    add('STORAGE', 'objects', 'listV2', 'List files (v2) — cursor pagination', null, 'https://supabase.com/docs/reference/javascript/storage-from-listv2', 'P0', 'in_scope',
        `await supabase.storage.from('avatars').listV2({ prefix: 'user1/', cursor: null })`, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — UTILITY
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'public', 'to-base64', 'Convert file to base64', 'Sync, client-side only', 'https://supabase.com/docs/reference/javascript/storage-from-tobase64', 'P2', 'in_scope',
        `const { data } = await supabase.storage.from('avatars').toBase64('user1/avatar.png')`, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'access-control', 'public-bucket-read', 'Public bucket: anon read access', null, null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'access-control', 'private-bucket-read-denied', 'Private bucket: anon denied', '403 PermissionDenied', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'access-control', 'owner-access', 'Owner can access own files', null, null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'access-control', 'service-role-bypass', 'service_role bypasses all storage ACL', null, null, 'P0', 'in_scope', null, null, null);

    // ═══════════════════════════════════════════════════════════
    // STORAGE — VALIDATION
    // ═══════════════════════════════════════════════════════════

    add('STORAGE', 'validation', 'size-limit', 'Reject upload exceeding size limit', '413 SizeLimitExceeded', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'validation', 'mime-validation', 'Reject disallowed MIME type', '422 MimeTypeNotAllowed', null, 'P0', 'in_scope', null, null, null);
    add('STORAGE', 'validation', 'path-validation', 'Validate file path format', null, null, 'P0', 'in_scope', null, null, null);

    console.log(`\n✓ Seeded ${count} tests into test catalog`);
}
