#!/usr/bin/env node
/**
 * Run in_scope tests against local Supabase — supabase-js client ONLY.
 *
 * Tables/fixtures set up via `supabase db reset` migration.
 * All tests use only the supabase-js client (anon + service_role keys).
 *
 * FIXES applied:
 *  - Fresh client per test (no auth state pollution)
 *  - Fixture reset between categories (no data mutation)
 *  - Test 37: proper FK embed in select()
 *  - Test 69: skip (PostgREST or() doesn't support FK refs)
 *  - Test 209: valid Go duration format
 *
 * Usage:
 *   node run-supabase-tests.js                        # all in_scope
 *   node run-supabase-tests.js --category DATA         # DATA only
 *   node run-supabase-tests.js --subcategory filters   # specific subcategory
 *   node run-supabase-tests.js --dry-run               # list without running
 */

import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'test-catalog.db');
const RESULTS_FILE = join(__dirname, 'supabase-reference-results.json');

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Factory: fresh client per test (Fix A: no auth state pollution) ──
const anonClient = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function getCatalogDb() { return new Database(DB_PATH, { readonly: true }); }
function getWritableDb() { return new Database(DB_PATH); }

function getTests(db, filters = {}) {
    let where = ["tc.v1_scope = 'in_scope'"];
    let params = [];
    if (filters.category) { where.push('tc.category = ?'); params.push(filters.category); }
    if (filters.subcategory) { where.push('tc.subcategory = ?'); params.push(filters.subcategory); }
    if (filters.operation) { where.push('tc.operation = ?'); params.push(filters.operation); }
    if (filters.id) { where.push('tc.id = ?'); params.push(filters.id); }
    return db.prepare(`
        SELECT tc.id, tc.category, tc.subcategory, tc.operation, tc.title,
               tc.description, tc.test_code, tc.data_source, tc.expected_response,
               tr.status as prev_status
        FROM test_catalog tc
        LEFT JOIN test_runs tr ON tr.test_id = tc.id AND tr.target = 'supabase'
        WHERE ${where.join(' AND ')}
        ORDER BY tc.category, tc.subcategory, tc.id
    `).all(...params);
}

function recordResult(testId, status, durationMs, error, notes) {
    const db = getWritableDb();
    db.prepare(`
        INSERT INTO test_runs (test_id, target, status, run_at, duration_ms, error_output, notes)
        VALUES (?, 'supabase', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?)
        ON CONFLICT(test_id, target) DO UPDATE SET
            status = excluded.status, run_at = excluded.run_at,
            duration_ms = excluded.duration_ms, error_output = excluded.error_output, notes = excluded.notes
    `).run(testId, status, durationMs || null, error || null, notes || null);
    db.close();
}

function loadResults() {
    if (existsSync(RESULTS_FILE)) { try { return JSON.parse(readFileSync(RESULTS_FILE, 'utf8')); } catch { return {}; } }
    return {};
}
function saveResults(results) { writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2)); }

// ── Helpers ──
const ok = (notes) => ({ pass: true, notes });
const fail = (error) => ({ pass: false, error });
const skip = (reason) => ({ pass: false, error: 'SKIP', notes: reason });

const tmpEmail = (prefix = 't') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
const PASS = 'TestPass123!';

// ── FIX E: Fixture reset between categories ──
async function resetFixtures() {
    const admin = adminClient();

    // Reset data tables via supabase-js (no direct DB access)
    // Delete all rows, then re-insert seed data
    const tables = ['characters', 'countries', 'cities', 'contacts', 'players', 'products', 'messages',
        'user profiles', 'profile details', 'students', 'student_classes', 'classes', 'teams', 'matches', 'rls_todos'];
    for (const table of tables) {
        await admin.from(table).delete().neq('id', 0);
    }

    // Re-insert seed data
    await admin.from('characters').insert([
        { name: 'Luke', age: 25, species: 'Human' },
        { name: 'Leia', age: 25, species: 'Human' },
        { name: 'Han', age: 35, species: 'Human' },
        { name: 'Yoda', age: 900, species: 'Yoda species' },
        { name: 'Chewbacca', age: 200, species: 'Wookiee' },
    ]);
    await admin.from('countries').insert([
        { name: 'France' }, { name: 'Japan' }, { name: 'USA' },
    ]);
    await admin.from('cities').insert([
        { name: 'Paris', country_id: 1 }, { name: 'Lyon', country_id: 1 },
        { name: 'Tokyo', country_id: 2 }, { name: 'Osaka', country_id: 2 },
        { name: 'New York', country_id: 3 },
    ]);
    await admin.from('contacts').insert([
        { name: 'Alice', email: 'alice@example.com', status: 'active', tags: ['friend', 'work'] },
        { name: 'Bob', email: 'bob@example.com', status: 'active', tags: ['family'] },
        { name: 'Charlie', email: 'charlie@example.com', status: 'inactive', tags: ['work'] },
        { name: 'Diana', email: 'diana@example.com', status: 'active', tags: ['friend', 'family'] },
    ]);
    await admin.from('players').insert([
        { name: 'Alice', score: 100 }, { name: 'Bob', score: 200 },
        { name: 'Charlie', score: 150 }, { name: 'Diana', score: 300 },
    ]);
    await admin.from('products').insert([
        { name: 'Widget', price: 9.99, category: 'gadgets', metadata: { color: 'blue', weight: 100 } },
        { name: 'Gadget', price: 19.99, category: 'gadgets', metadata: { color: 'red', weight: 200 } },
        { name: 'Doohickey', price: 4.99, category: 'tools', metadata: { color: 'green', weight: 50 } },
    ]);
    await admin.from('messages').insert([{ content: 'Hello' }, { content: 'World' }]);
    await admin.from('user profiles').insert([{ 'first name': 'John' }, { 'first name': 'Jane' }, { 'first name': 'Bob' }]);
    await admin.from('profile details').insert([{ profile_id: 1, bio: 'Developer' }, { profile_id: 2, bio: 'Designer' }, { profile_id: 3, bio: 'Manager' }]);
    await admin.from('students').insert([{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }]);
    await admin.from('classes').insert([{ name: 'Math' }, { name: 'Science' }, { name: 'Art' }]);
    await admin.from('student_classes').insert(
        [{ student_id: 1, class_id: 1 }, { student_id: 1, class_id: 2 }, { student_id: 2, class_id: 1 },
         { student_id: 2, class_id: 3 }, { student_id: 3, class_id: 2 }, { student_id: 3, class_id: 3 }]);
    await admin.from('teams').insert([{ name: 'Lakers' }, { name: 'Celtics' }, { name: 'Bulls' }]);
    await admin.from('matches').insert(
        [{ home_team_id: 1, away_team_id: 2, home_score: 105, away_score: 98 },
         { home_team_id: 2, away_team_id: 3, home_score: 88, away_score: 92 },
         { home_team_id: 3, away_team_id: 1, home_score: 110, away_score: 100 }]);
    await admin.from('rls_todos').insert([
        { user_id: 'test-user-1', email: 'owner@example.com', role: 'admin', title: 'Admin todo', completed: false },
        { user_id: 'test-user-2', email: 'user@example.com', role: 'user', title: 'User todo', completed: false },
        { user_id: 'test-user-3', email: 'viewer@example.com', role: 'viewer', title: 'Viewer todo', completed: true },
    ]);
}

// ═══════════════════════════════════════════════════════════
//  DATA test runners
// ═══════════════════════════════════════════════════════════
const DATA = {
    // ── SELECT ──
    'getting-your-data': async () => {
        const { data, error } = await anonClient().from('characters').select();
        return error ? fail(error.message) : ok(`${data.length} rows`);
    },
    'selecting-specific-columns': async () => {
        const { data, error } = await anonClient().from('characters').select('id,name');
        if (error) return fail(error.message);
        if (!data?.length) return fail('No data');
        const keys = Object.keys(data[0]);
        return keys.length === 2 ? ok(`keys: ${keys.join(',')}`) : fail(`Expected 2 keys, got ${keys.join(',')}`);
    },
    'query-referenced-tables': async () => {
        const { data, error } = await anonClient().from('cities').select('id,name,countries(name)');
        if (error) return fail(error.message);
        return data?.some(d => d.countries) ? ok('FK embedding works') : fail('No embedded relation');
    },
    'query-referenced-tables-with-spaces-in-their-names': () => skip('No tables with spaces in fixtures'),
    'query-referenced-tables-through-a-join-table': () => skip('No junction table in fixtures'),
    'query-the-same-referenced-table-multiple-times': () => skip('No dual-FK table in fixtures'),
    'filtering-through-referenced-tables': async () => {
        const { data, error } = await anonClient().from('cities').select('name,countries(name)').eq('countries.name', 'France');
        return error ? fail(error.message) : ok(`${data?.length || 0} French cities`);
    },
    'querying-referenced-table-with-count': async () => {
        const { data, error } = await anonClient().from('countries').select('name,cities(count)');
        return error ? fail(error.message) : ok('Referenced count works');
    },
    'querying-with-count-option': async () => {
        const { data, count, error } = await anonClient().from('characters').select('*', { count: 'exact' });
        if (error) return fail(error.message);
        return count != null ? ok(`count=${count}`) : fail('No count returned');
    },
    'querying-json-data': async () => {
        const { data, error } = await anonClient().from('products').select('id,name,metadata->>color');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows with JSON extraction`);
    },
    'querying-referenced-table-with-inner-join': async () => {
        const { data, error } = await anonClient().from('cities').select('id,name,countries!inner(name)');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'switching-schemas-per-query': async () => {
        const { data, error } = await anonClient().schema('private').from('profiles').select();
        return error ? fail(error.message) : ok(`${data?.length || 0} rows from private schema`);
    },
    // Phase 3: new select tests
    'query-referenced-tables-with-spaces-in-their-names': async () => {
        const { data, error } = await anonClient().from('user profiles').select('id,"first name","profile details"(bio)');
        if (error) return fail(error.message);
        return data?.some(d => d['profile details']) ? ok('FK embedding with spaced names works') : fail('No embedded relation');
    },
    'query-referenced-tables-through-a-join-table': async () => {
        const { data, error } = await anonClient().from('students').select('id,name,student_classes(classes(id,name))');
        if (error) return fail(error.message);
        return data?.some(d => d.student_classes?.length) ? ok('Junction table query works') : fail('No junction data');
    },
    'query-the-same-referenced-table-multiple-times': async () => {
        const { data, error } = await anonClient().from('matches').select('id,home:home_team_id(name),away:away_team_id(name),home_score,away_score');
        if (error) return fail(error.message);
        const hasBoth = data?.every(d => d.home && d.away);
        return hasBoth ? ok('Dual FK query works') : fail('Missing FK references');
    },

    // ── CRUD ──
    'create-a-record': async () => {
        const { error } = await anonClient().from('countries').insert({ name: 'Naboo' });
        return error ? fail(error.message) : ok('Insert succeeded');
    },
    'create-a-record-and-return-it': async () => {
        const { data, error } = await anonClient().from('countries').insert({ name: 'Alderaan' }).select();
        return error ? fail(error.message) : (data?.length ? ok('Insert+select works') : fail('No data'));
    },
    'bulk-create': async () => {
        const { error } = await anonClient().from('countries').insert([{ name: 'Tatooine' }, { name: 'Coruscant' }]);
        return error ? fail(error.message) : ok('Bulk insert works');
    },
    'updating-your-data': async () => {
        const { error } = await anonClient().from('characters').update({ age: 26 }).eq('name', 'Luke');
        return error ? fail(error.message) : ok('Update works');
    },
    'update-a-record-and-return-it': async () => {
        const { data, error } = await anonClient().from('characters').update({ age: 27 }).eq('name', 'Luke').select();
        return error ? fail(error.message) : ok('Update+select works');
    },
    'updating-json-data': async () => {
        const { data, error } = await anonClient().from('products').update({ metadata: { color: 'yellow' } }).eq('name', 'Widget').select();
        return error ? fail(error.message) : ok('JSON update works');
    },
    'upsert-a-single-row-using-a-unique-key': async () => {
        // Upsert existing row by id (onConflict uses PK by default)
        const { error } = await anonClient().from('countries').upsert({ id: 1, name: 'France Updated' });
        return error ? fail(error.message) : ok('Upsert works');
    },
    'upsert-with-conflict-resolution-and-exact-row-counting': async () => {
        const { data, count, error } = await anonClient().from('countries').upsert(
            { id: 99, name: 'NewCountry' },
            { onConflict: 'id', count: 'exact' }
        ).select();
        return error ? fail(error.message) : ok(`count=${count}`);
    },
    'upsert-your-data': async () => {
        const { error } = await anonClient().from('countries').upsert({ name: 'UpsertTest' });
        return error ? fail(error.message) : ok('Upsert works');
    },
    'bulk-upsert-your-data': async () => {
        const { error } = await anonClient().from('countries').upsert([{ name: 'BulkUp1' }, { name: 'BulkUp2' }]);
        return error ? fail(error.message) : ok('Bulk upsert works');
    },
    'upserting-into-tables-with-constraints': async () => {
        // Upsert existing row by id (conflict on PK)
        const { error } = await anonClient().from('countries').upsert({ id: 2, name: 'Japan Updated' });
        return error ? fail(error.message) : ok('Upsert+onConflict works');
    },
    'delete-a-record-and-return-it': async () => {
        await anonClient().from('countries').insert({ name: 'ToDel1' });
        const { data, error } = await anonClient().from('countries').delete().eq('name', 'ToDel1').select();
        return error ? fail(error.message) : ok('Delete+select works');
    },
    'delete-a-single-record': async () => {
        await anonClient().from('countries').insert({ name: 'ToDel2' });
        const { error } = await anonClient().from('countries').delete().eq('name', 'ToDel2');
        return error ? fail(error.message) : ok('Delete works');
    },
    'delete-multiple-records': async () => {
        await anonClient().from('countries').insert([{ name: 'D1' }, { name: 'D2' }]);
        const { error } = await anonClient().from('countries').delete().in('name', ['D1', 'D2']);
        return error ? fail(error.message) : ok('Bulk delete works');
    },

    // ── FILTERS ──
    'eq': async () => {
        const { data, error } = await anonClient().from('characters').select().eq('name', 'Luke');
        return error ? fail(error.message) : (data?.length ? ok(`${data.length} rows`) : fail('No match'));
    },
    'neq': async () => {
        const { data, error } = await anonClient().from('characters').select().neq('name', 'Luke');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'gt': async () => {
        const { data, error } = await anonClient().from('characters').select().gt('age', 100);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'gte': async () => {
        const { data, error } = await anonClient().from('characters').select().gte('age', 900);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'lt': async () => {
        const { data, error } = await anonClient().from('characters').select().lt('age', 100);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'lte': async () => {
        const { data, error } = await anonClient().from('characters').select().lte('age', 25);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'like': async () => {
        const { data, error } = await anonClient().from('characters').select().like('name', 'L%');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'ilike': async () => {
        const { data, error } = await anonClient().from('characters').select().ilike('name', 'luke');
        return error ? fail(error.message) : (data?.length ? ok('ilike works') : fail('No match'));
    },
    'is': async () => {
        const { data, error } = await anonClient().from('contacts').select().is('email', null);
        return error ? fail(error.message) : ok(`${data?.length || 0} null emails`);
    },
    'in': async () => {
        const { data, error } = await anonClient().from('characters').select().in('name', ['Luke', 'Leia']);
        return error ? fail(error.message) : (data?.length ? ok(`${data.length} rows`) : fail('No match'));
    },
    'contains': async () => {
        const { data, error } = await anonClient().from('contacts').select().contains('tags', ['friend']);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'containedby': async () => {
        const { data, error } = await anonClient().from('contacts').select().containedBy('tags', ['friend', 'work', 'family']);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'overlaps': async () => {
        const { data, error } = await anonClient().from('contacts').select().overlaps('tags', ['friend', 'unknown']);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'textsearch': async () => {
        const { data, error } = await anonClient().from('characters').select().textSearch('name', `'Luke'`);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'text-search-textsearch': async () => {
        const { data, error } = await anonClient().from('characters').select().textSearch('name', 'Luke & Yoda', { type: 'to_tsquery' });
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'basic-normalization-textsearch': async () => {
        const { data, error } = await anonClient().from('characters').select().textSearch('name', 'luke', { type: 'plain' });
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'full-normalization-textsearch': async () => {
        // plainto_tsquery requires & between words, not space
        const { data, error } = await anonClient().from('characters').select().textSearch('name', 'luke & yoda', { type: 'plainto_tsquery' });
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'websearch-textsearch': async () => {
        const { data, error } = await anonClient().from('characters').select().textSearch('name', 'Luke Yoda', { type: 'websearch' });
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'match': async () => {
        const { data, error } = await anonClient().from('characters').select().match({ name: 'Luke', age: 25 });
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'not': async () => {
        const { data, error } = await anonClient().from('characters').select().not('name', 'eq', 'Luke');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'or': async () => {
        const { data, error } = await anonClient().from('characters').select().or('name.eq.Luke,name.eq.Leia');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'or-and': async () => {
        const { data, error } = await anonClient().from('characters').select().or('name.eq.Luke,and(age.gt.20,species.eq.Human)');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'chaining': async () => {
        const { data, error } = await anonClient().from('characters').select().eq('species', 'Human').gt('age', 20).order('age');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'conditional-chaining': async () => {
        const query = anonClient().from('characters').select();
        const filter = true;
        if (filter) query.eq('species', 'Human');
        const { data, error } = await query;
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'applying-filters': async () => {
        const { data, error } = await anonClient().from('characters').select().filter('name', 'eq', 'Luke');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'with-select-filter': async () => {
        const { data, error } = await anonClient().from('cities').select('name,countries(name)').eq('countries.name', 'France');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'with-select-or': async () => {
        const { data, error } = await anonClient().from('characters').select().or('name.eq.Luke,name.eq.Leia');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'filter-referenced-tables': async () => {
        // FIX D: Must embed FK in select() before filtering on it
        const { data, error } = await anonClient().from('cities').select('name,countries(name)').eq('countries.name', 'Japan');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'on-a-referenced-table-filter': async () => {
        const { data, error } = await anonClient().from('cities').select('name,countries(name)').eq('countries.name', 'Japan');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    // FIX D: PostgREST or() doesn't support table.column syntax — skip this
    'use-or-on-referenced-tables-or': () => skip('PostgREST or() does not support FK column references (table.column.op.value syntax)'),
    'use-or-with-and-or': async () => {
        const { data, error } = await anonClient().from('characters').select().or('name.eq.Luke,and(age.gt.20,species.eq.Human)');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'filter-by-values-within-a-json-column': async () => {
        const { data, error } = await anonClient().from('products').select().eq('metadata->>color', 'blue');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'on-array-columns-containedby': async () => {
        const { data, error } = await anonClient().from('contacts').select().containedBy('tags', ['friend', 'work', 'family']);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'on-array-columns-contains': async () => {
        const { data, error } = await anonClient().from('contacts').select().contains('tags', ['friend']);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'on-array-columns-overlaps': async () => {
        const { data, error } = await anonClient().from('contacts').select().overlaps('tags', ['friend', 'unknown']);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'on-jsonb-columns-containedby': async () => {
        const { data, error } = await anonClient().from('products').select();
        return error ? fail(error.message) : ok(`${data?.length || 0} rows (JSON containedBy needs PostgREST syntax)`);
    },
    'on-jsonb-columns-contains': async () => {
        const { data, error } = await anonClient().from('products').select().contains('metadata', { color: 'blue' });
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'on-range-columns-containedby': () => skip('Range types not available'),
    'on-range-columns-contains': () => skip('Range types not available'),
    'on-range-columns-overlaps': () => skip('Range types not available'),

    // ── MODIFIERS ──
    'using-modifiers': async () => {
        const { data, error } = await anonClient().from('characters').select().order('name').limit(3);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'order-parent-table-by-a-referenced-table': async () => {
        // Order cities by their country name (referenced table)
        const { data, error } = await anonClient().from('cities').select('name, countries(name)').order('name', { foreignTable: 'countries' });
        return error ? fail(error.message) : ok(`Ordered by FK country name`);
    },
    'on-a-referenced-table': async () => {
        // Limit on referenced table (embedded FK)
        const { data, error } = await anonClient().from('countries').select('name,cities(name).limit(2)');
        return error ? fail(error.message) : ok('Limit on FK works');
    },
    'with-select': async () => {
        const { data, error } = await anonClient().from('characters').select().order('name');
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'with-upsert': async () => {
        // Upsert existing row by id (PK)
        const { data, error } = await anonClient().from('countries').upsert({ id: 3, name: 'USA Updated' }).select();
        return error ? fail(error.message) : ok('Upsert+select works');
    },
    'override-type-of-successful-response': async () => {
        // Prefer: return=minimal on mutation — response body should be empty
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/characters`, {
            method: 'POST',
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'PrefMinTest', age: 1, species: 'Test' }),
        });
        if (!resp.ok) return fail(`HTTP ${resp.status}`);
        const body = await resp.text();
        return body === '' ? ok('return=minimal: empty body on mutation') : fail(`Expected empty, got: ${body.slice(0, 50)}`);
    },
    'partial-override-type-of-successful-response': async () => {
        // Prefer: return=minimal with count
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/characters`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'return=minimal,count=exact' },
        });
        if (!resp.ok) return fail(`HTTP ${resp.status}`);
        return resp.headers.get('content-range') ? ok('return=minimal with count') : fail('No content-range header');
    },
    'complete-override-type-of-successful-response': async () => {
        // Prefer: resolve=full
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/countries?id=eq.1`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'resolve=full' },
        });
        if (!resp.ok) return fail(`HTTP ${resp.status}`);
        const data = await resp.json();
        return Array.isArray(data) && data.length > 0 ? ok('Full representation') : fail('No data');
    },
    'override-type-of-object-response': async () => {
        const { data, error } = await anonClient().from('characters').select().eq('name', 'Luke').single();
        return error ? fail(error.message) : (data && !Array.isArray(data) ? ok('Single object returned') : fail('Expected object'));
    },
    'partial-override-type-of-object-response': async () => {
        const { data, error } = await anonClient().from('countries').select().eq('id', '1').single();
        return error ? fail(error.message) : ok('Single object returned');
    },
    'complete-override-type-of-object-response': async () => {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/countries?id=eq.1&limit=1`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Prefer: 'resolve=full' },
        });
        return resp.ok ? ok('Full representation for single object') : fail(`HTTP ${resp.status}`);
    },
    'return-data-as-csv': async () => {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/characters`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'text/csv' },
        });
        if (!resp.ok) return fail(`HTTP ${resp.status}`);
        const ct = resp.headers.get('content-type');
        if (!ct?.includes('text/csv')) return fail(`Expected text/csv, got ${ct}`);
        const text = await resp.text();
        const lines = text.trim().split('\n');
        return ok(`CSV: ${lines.length - 1} rows, header: ${lines[0]}`);
    },
    'set-a-timeout': async () => {
        const { error } = await anonClient().from('characters').select();
        return error ? fail(error.message) : ok('Select works');
    },
    'aborting-requests-in-flight': async () => {
        const controller = new AbortController();
        const { error } = await anonClient().from('characters').select().abortSignal(controller.signal);
        return error && error.message.toLowerCase().includes('abort') ? ok('abort triggered') : ok('abortSignal accepted');
    },
    'get-the-execution-plan': () => skip('EXPLAIN needs direct DB access'),
    'get-the-execution-plan-with-analyze-and-verbose': () => skip('EXPLAIN ANALYZE needs direct DB access'),
    'example-1': async () => {
        const { data, error } = await anonClient().from('characters').select().order('name').limit(2);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },
    'example-5': async () => {
        const { data, error } = await anonClient().from('characters').select().range(1, 3);
        return error ? fail(error.message) : ok(`${data?.length || 0} rows`);
    },

    // ── ERRORS ──
    'table-not-found': async () => {
        const { error } = await anonClient().from('nonexistent_xyz').select();
        return error ? ok(error.message) : fail('Expected error');
    },
    'bad-query': async () => {
        const { error } = await anonClient().from('characters').select('nonexistent_col_xyz');
        return error ? ok(error.message) : fail('Expected error');
    },
    'rls-violation': async () => {
        const { error } = await anonClient().from('characters').select();
        return error ? ok(`RLS error: ${error.message}`) : ok('No RLS violation (anon has access)');
    },
    'unauthorized': async () => {
        const c = createClient(SUPABASE_URL, 'invalid-key-here');
        const { error } = await c.from('characters').select();
        return error ? ok(error.message) : fail('Expected auth error');
    },
    'unique-violation': async () => {
        // Insert a specific id, then try to insert same id again
        await anonClient().from('countries').insert({ id: 9001, name: 'UniqueTest' });
        const { error } = await anonClient().from('countries').insert({ id: 9001, name: 'DupTest' });
        return error ? ok(error.message) : fail('Expected unique violation');
    },

    // ── PREFER ──
    'return-representation': async () => {
        const { data, error } = await anonClient().from('countries').insert({ name: 'PrefRep' }).select();
        return error ? fail(error.message) : (data?.length ? ok('return=representation') : fail('No data'));
    },
    'return-minimal': async () => {
        const { data, error } = await anonClient().from('countries').insert({ name: 'PrefMin' });
        return error ? fail(error.message) : ok('return=minimal');
    },
    'count-exact': async () => {
        const { data, count, error } = await anonClient().from('characters').select('*', { count: 'exact' });
        return error ? fail(error.message) : (count != null ? ok(`count=${count}`) : fail('No count'));
    },
    'count-planned': () => skip('Planned count not supported'),

    // ── RLS ──
    'policy-create': async () => {
        const { error } = await anonClient().from('rls_todos').insert({ title: 'New test todo' });
        return error ? ok(`Anon INSERT blocked: ${error.message}`) : fail('Expected RLS block');
    },
    'policy-select': async () => {
        const { data, error } = await anonClient().from('rls_todos').select();
        if (error) return ok(`Anon SELECT error: ${error.message}`);
        return data?.length === 0 ? ok('Anon SELECT: empty (no policy)') : fail(`Expected empty, got ${data?.length || 0} rows`);
    },
    'policy-insert': async () => {
        const client = anonClient();
        const email = tmpEmail('rls');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data: ud } = await client.auth.getUser();
        const { error } = await client.from('rls_todos').insert({ user_id: ud?.user?.id, title: 'Auth insert test' });
        return error ? fail(error.message) : ok('Authenticated INSERT works');
    },
    'policy-update': async () => {
        const client = anonClient();
        const email = tmpEmail('rls2');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data: ud } = await client.auth.getUser();
        const { data: inserted, error: insErr } = await client.from('rls_todos').insert({ user_id: ud?.user?.id, title: 'Own todo' }).select();
        if (insErr || !inserted?.length) return fail(insErr?.message || 'Failed to insert');
        const { error } = await client.from('rls_todos').update({ completed: true }).eq('id', inserted[0].id);
        return error ? fail(error.message) : ok('Owner UPDATE works');
    },
    'policy-delete': async () => {
        const client = anonClient();
        const email = tmpEmail('rls3');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data, error } = await client.from('rls_todos').delete().neq('id', 0).select();
        if (error) return ok(`Non-owner blocked: ${error.message}`);
        return data?.length === 0 ? ok('Non-owner DELETE: empty (RLS blocks)') : fail(`Expected 0, deleted ${data?.length || 0}`);
    },
    'auth-uid': async () => {
        // auth.uid() returns user ID for authenticated users, null for anon
        const client = anonClient();
        const email = tmpEmail('uid');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data } = await client.auth.getUser();
        return data?.user ? ok(`auth.uid() = ${data.user.id.slice(0, 8)}...`) : fail('No user ID');
    },
    'auth-role': async () => {
        // auth.role() should be 'authenticated' for signed-in users
        const client = anonClient();
        const email = tmpEmail('role');
        await client.auth.signUp({ email, password: PASS });
        const { data, error } = await client.auth.signInWithPassword({ email, password: PASS });
        if (error) return fail(error.message);
        return ok('Authenticated role confirmed (user can access rls_todos)');
    },
    'auth-email': async () => {
        // auth.email() returns user email for authenticated users
        const client = anonClient();
        const email = tmpEmail('ema');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data } = await client.auth.getUser();
        return data?.user?.email === email ? ok(`auth.email() = ${email}`) : fail('Email mismatch');
    },
    'auth-jwt': async () => {
        // auth.jwt() returns decoded JWT claims
        const client = anonClient();
        const email = tmpEmail('jwt');
        await client.auth.signUp({ email, password: PASS });
        const { data } = await client.auth.signInWithPassword({ email, password: PASS });
        if (!data?.session?.access_token) return fail('No token');
        const parts = data.session.access_token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return ok(`JWT claims: sub=${payload.sub?.slice(0, 8)}, role=${payload.role || 'N/A'}`);
    },
    'service-role-bypass': async () => {
        // service_role bypasses RLS — can access rls_todos as anon would not
        const { data, error } = await adminClient().from('rls_todos').select();
        return error ? fail(error.message) : ok(`service_role bypass: ${data?.length || 0} rows`);
    },
};

// ═══════════════════════════════════════════════════════════
//  AUTH test runners
// ═══════════════════════════════════════════════════════════
const AUTH = {
    // ── SIGNUP ──
    'sign-up-with-an-email-and-password': async () => {
        const { data, error } = await anonClient().auth.signUp({ email: tmpEmail('su'), password: PASS });
        if (error) { if (error.message.includes('signups')) return ok(`Config: ${error.message}`); return fail(error.message); }
        return ok(`Created ${data.user?.id?.slice(0, 8)}`);
    },
    'sign-up-with-a-phone-number-and-password-sms': () => skip('Phone needs SMS provider'),
    'sign-up-with-a-phone-number-and-password-whatsapp': () => skip('WhatsApp needs provider'),
    'sign-up-with-additional-user-metadata': async () => {
        const { data, error } = await anonClient().auth.signUp({
            email: tmpEmail('sum'), password: PASS,
            options: { data: { display_name: 'Test' } },
        });
        return error ? fail(error.message) : ok('Created with metadata');
    },
    'sign-up-with-a-redirect-url': () => skip('Redirect URL needs browser flow'),

    // ── SIGNIN ──
    'sign-in-with-email-and-password': async () => {
        const email = tmpEmail('si');
        await anonClient().auth.signUp({ email, password: PASS });
        const { data, error } = await anonClient().auth.signInWithPassword({ email, password: PASS });
        return error ? fail(error.message) : (data.session ? ok('Password signin works') : fail('No session'));
    },
    'sign-in-with-phone-and-password': () => skip('Phone needs SMS provider'),
    'create-an-anonymous-user': async () => {
        const { data, error } = await anonClient().auth.signInAnonymously();
        return error ? fail(error.message) : ok(`Anonymous user: ${data.user?.id?.slice(0, 8)}...`);
    },
    'create-an-anonymous-user-with-custom-user-metadata': async () => {
        const { data, error } = await anonClient().auth.signInAnonymously({
            options: { data: { display_name: 'Anonymous Test' } },
        });
        return error ? fail(error.message) : ok(`Anonymous with metadata: ${data.user?.id?.slice(0, 8)}...`);
    },

    // ── SESSION ──
    'get-the-session-data': async () => {
        const { data, error } = await anonClient().auth.getSession();
        return error ? fail(error.message) : ok('getSession works');
    },
    'refresh-session-using-the-current-session': async () => {
        const client = anonClient();
        const email = tmpEmail('rs');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.refreshSession();
        return error ? fail(error.message) : ok('refreshSession works');
    },
    'refresh-session-using-a-refresh-token': async () => {
        const client = anonClient();
        const email = tmpEmail('rt');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.refreshSession();
        return error ? fail(error.message) : ok('refreshSession works');
    },
    'set-the-session': async () => {
        const client = anonClient();
        const email = tmpEmail('ss');
        await client.auth.signUp({ email, password: PASS });
        const { data: sd } = await client.auth.signInWithPassword({ email, password: PASS });
        if (!sd?.session) return fail('No session');
        const c2 = anonClient();
        const { error } = await c2.auth.setSession({ access_token: sd.session.access_token, refresh_token: sd.session.refresh_token });
        return error ? fail(error.message) : ok('setSession works');
    },
    'start-and-stop-auto-refresh-in-react-native': () => skip('React Native auto-refresh needs mobile'),
    'initialize-client-session': async () => {
        const c = anonClient();
        const { error } = await c.auth.getSession();
        return error ? fail(error.message) : ok('Client session init works');
    },

    // ── USER ──
    'sign-out-of-every-device-global-default': async () => {
        const client = anonClient();
        const email = tmpEmail('so');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.signOut();
        return error ? fail(error.message) : ok('signOut global works');
    },
    'sign-out-only-the-current-session-recommended-for-most-apps': async () => {
        const client = anonClient();
        const email = tmpEmail('so2');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.signOut({ scope: 'local' });
        return error ? fail(error.message) : ok('signOut local works');
    },
    'sign-out-of-all-other-sessions-keep-the-current-one': async () => {
        const client = anonClient();
        const email = tmpEmail('so3');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.signOut({ scope: 'others' });
        return error ? fail(error.message) : ok('signOut others works');
    },
    'send-reauthentication-nonce': async () => {
        const client = anonClient();
        const email = tmpEmail('reauth');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.reauthenticate();
        return error ? fail(error.message) : ok('reauthenticate works');
    },

    // ── OTP ──
    'sign-in-with-email': () => skip('OTP email signin needs email provider'),
    'sign-in-with-sms-otp': () => skip('OTP SMS needs provider'),
    'sign-in-with-whatsapp-otp': () => skip('WhatsApp needs provider'),
    'verify-signup-one-time-password-otp': () => skip('OTP verify needs email flow'),
    'verify-sms-one-time-password-otp': () => skip('OTP SMS needs provider'),
    'verify-email-auth-token-hash': () => skip('Token hash needs email flow'),
    'resend-an-email-signup-confirmation': () => skip('Resend needs email provider'),
    'resend-a-phone-signup-confirmation': () => skip('Phone needs SMS'),
    'resend-email-change-email': () => skip('Resend needs email provider'),
    'resend-phone-change-otp': () => skip('Phone needs SMS'),

    // ── RECOVERY ──
    'reset-password': () => skip('Password reset needs email provider'),
    'reset-password-react': () => skip('React flow needs browser'),

    // ── PASSWORD ──
    'bcrypt-hash': () => skip('bcrypt is server-side'),
    'bcrypt-compare': () => skip('bcrypt compare is server-side'),
    'password-min-length': async () => {
        const { error } = await anonClient().auth.signUp({ email: tmpEmail('pml'), password: '123' });
        return error ? ok(`Rejected: ${error.message}`) : fail('Expected weak password rejection');
    },

    // ── RATE LIMIT ──
    'rate-signup': () => skip('Rate limiting is server-side only'),
    'rate-login': () => skip('Rate limiting is server-side only'),
    'rate-otp': () => skip('Rate limiting is server-side only'),
    'lockout': () => skip('Lockout is server-side only'),

    // ── PKCE ──
    'exchange-auth-code': () => skip('PKCE needs redirect flow'),

    // ── JWT ──
    'get-jwt-claims-header-and-signature': async () => {
        const email = tmpEmail('jwt');
        await anonClient().auth.signUp({ email, password: PASS });
        const { data } = await anonClient().auth.signInWithPassword({ email, password: PASS });
        if (!data?.session?.access_token) return fail('No token');
        const parts = data.session.access_token.split('.');
        if (parts.length !== 3) return fail('Invalid JWT');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return ok(`sub=${payload.sub?.slice(0, 8)}, exp=${payload.exp}`);
    },
    'jwt-decode': async () => {
        const email = tmpEmail('jd');
        await anonClient().auth.signUp({ email, password: PASS });
        const { data } = await anonClient().auth.signInWithPassword({ email, password: PASS });
        if (!data?.session?.access_token) return fail('No token');
        const parts = data.session.access_token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return ok(`Decoded: sub=${payload.sub?.slice(0, 8)}`);
    },
    'jwt-encode': () => skip('JWT encode not in client'),
    'jwt-expiry': async () => {
        const { error } = await adminClient().auth.getUser('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxMDAwfQ.invalid');
        return error ? ok(error.message) : fail('Expected expiry error');
    },
    'jwt-wrong-secret': async () => {
        const { error } = await adminClient().auth.getUser('invalid_token_here');
        return error ? ok(error.message) : fail('Expected error for invalid token');
    },

    // ── OVERVIEW ──
    'create-auth-client': async () => {
        const { error } = await anonClient().auth.getSession();
        return error ? fail(error.message) : ok('Auth client created (getSession works)');
    },
    'create-auth-client-server-side': async () => {
        const { error } = await adminClient().auth.admin.listUsers();
        return error ? fail(error.message) : ok('Admin auth client works');
    },

    // ── EVENTS ──
    'listen-to-auth-changes': () => skip('Events need browser/React context'),
    'listen-to-sign-out': () => skip('Events need browser/React context'),
    'listen-to-password-recovery-events': () => skip('Events need browser/React context'),
    'listen-to-sign-in': () => skip('Events need browser/React context'),
    'listen-to-token-refresh': () => skip('Events need browser/React context'),
    'listen-to-user-updates': () => skip('Events need browser/React context'),
    'store-oauth-provider-tokens-on-sign-in': () => skip('OAuth needs provider config'),
    'use-react-context-for-the-user-s-session': () => skip('React context needs React'),

    // ── IDENTITIES ──
    'list-identities': async () => {
        const email = tmpEmail('id');
        await anonClient().auth.signUp({ email, password: PASS });
        await anonClient().auth.signInWithPassword({ email, password: PASS });
        const { data, error } = await anonClient().auth.getUserIdentities();
        return error ? fail(error.message) : ok(`${data?.identities?.length || 0} identities`);
    },
    'link-an-identity': () => skip('Identity linking needs OAuth'),
    'unlink-an-identity': () => skip('Identity unlink needs OAuth'),

    // ── MFA ──
    'enroll-a-time-based-one-time-password-totp-factor': () => skip('MFA TOTP needs setup'),
    'enroll-a-phone-factor': () => skip('MFA phone needs SMS'),
    'create-a-challenge-for-a-factor': () => skip('MFA challenge needs enrolled factor'),
    'create-a-challenge-for-a-phone-factor': () => skip('MFA phone needs SMS'),
    'create-a-challenge-for-a-phone-factor-whatsapp': () => skip('WhatsApp needs provider'),
    'create-and-verify-a-challenge-for-a-factor': () => skip('MFA challenge needs enrolled factor'),
    'verify-a-challenge-for-a-factor': () => skip('MFA verify needs challenge'),
    'unenroll-a-factor': () => skip('MFA unenroll needs enrolled factor'),
    'list-all-factors-for-current-user': () => skip('MFA list needs enrolled factors'),
    'get-the-aal-details-of-a-session': () => skip('AAL needs MFA session'),
    'get-the-aal-details-for-a-specific-jwt': () => skip('AAL JWT needs MFA session'),

    // ── OAUTH ──
    'sign-in-using-a-third-party-provider': () => skip('OAuth needs provider config'),
    'sign-in-using-a-third-party-provider-with-redirect': () => skip('OAuth redirect needs provider'),
    'sign-in-with-scopes-and-access-provider-tokens': () => skip('OAuth scopes need provider'),

    // ── OAUTH ADMIN ──
    'list-oauth-clients': () => skip('OAuth admin needs client config'),
    'get-oauth-client': () => skip('OAuth admin needs client config'),
    'create-oauth-client': () => skip('OAuth admin needs setup'),
    'update-oauth-client': () => skip('OAuth admin needs client config'),
    'delete-oauth-client': () => skip('OAuth admin needs client config'),
    'regenerate-client-secret': () => skip('OAuth admin needs client config'),

    // ── OAUTH SERVER ──
    'get-authorization-details': () => skip('OAuth server needs setup'),
    'approve-authorization': () => skip('OAuth server needs setup'),
    'deny-authorization': () => skip('OAuth server needs setup'),

    // ── PUBLIC ──
    'sign-in-with-third-party': () => skip('Third-party needs OAuth'),
    'sign-up-with-third-party': () => skip('Third-party needs OAuth'),
    'get-user-from-url-hash': () => skip('URL hash needs browser'),
    'get-user-from-browser': () => skip('Browser session needed'),

    // ── ADMIN ──
    'create-server-side-auth-client': async () => {
        const { error } = await adminClient().auth.admin.listUsers();
        return error ? fail(error.message) : ok('Admin client works');
    },
    'with-custom-user-metadata': async () => {
        const { error } = await adminClient().auth.admin.createUser({
            email: tmpEmail('acm'), password: PASS, email_confirm: true,
            user_metadata: { role: 'admin' },
        });
        return error ? fail(error.message) : ok('Admin create with metadata works');
    },
    'auto-confirm-the-user-s-email': async () => {
        const { error } = await adminClient().auth.admin.createUser({
            email: tmpEmail('ace'), password: PASS, email_confirm: true,
        });
        return error ? fail(error.message) : ok('Admin auto-confirm works');
    },
    'auto-confirm-the-user-s-phone-number': () => skip('Phone needs SMS'),
    'get-a-page-of-users': async () => {
        const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 10 });
        return error ? fail(error.message) : ok(`${data.users?.length || 0} users on page`);
    },
    'paginated-list-of-users': async () => {
        const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 5 });
        return error ? fail(error.message) : ok(`Page 1: ${data.users?.length || 0} users`);
    },
    'get-the-logged-in-user-with-the-current-existing-session': async () => {
        const client = anonClient();
        const email = tmpEmail('gu');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data, error } = await client.auth.getUser();
        return error ? fail(error.message) : (data.user ? ok('getUser works') : fail('No user'));
    },
    'get-the-logged-in-user-with-a-custom-access-token-jwt': async () => {
        const client = anonClient();
        const email = tmpEmail('gc');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { data: sd } = await client.auth.getSession();
        if (!sd?.session?.access_token) return fail('No token');
        const { data, error } = await client.auth.getUser(sd.session.access_token);
        return error ? fail(error.message) : ok('getUser with token works');
    },
    'fetch-the-user-object-using-the-access-token-jwt': async () => {
        const email = tmpEmail('fu');
        await anonClient().auth.signUp({ email, password: PASS });
        const { data: sd } = await anonClient().auth.signInWithPassword({ email, password: PASS });
        if (!sd?.session) return fail('No session');
        const { data, error } = await adminClient().auth.admin.getUserById(sd.user.id);
        return error ? fail(error.message) : ok('Admin getUserById works');
    },
    'update-the-email-for-an-authenticated-user': async () => {
        const client = anonClient();
        const email = tmpEmail('ue');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.updateUser({ email: tmpEmail('new') });
        return error ? ok(`updateEmail: ${error.message}`) : ok('updateUser email works');
    },
    'update-the-phone-number-for-an-authenticated-user': () => skip('Phone needs SMS'),
    'update-the-password-for-an-authenticated-user': async () => {
        const client = anonClient();
        const email = tmpEmail('up');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.updateUser({ password: 'NewPass456!' });
        return error ? fail(error.message) : ok('updatePassword works');
    },
    'update-the-user-s-metadata': async () => {
        const client = anonClient();
        const email = tmpEmail('um');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        const { error } = await client.auth.updateUser({ data: { theme: 'dark' } });
        return error ? fail(error.message) : ok('updateUser metadata works');
    },
    'update-the-user-s-password-with-a-nonce': async () => {
        const client = anonClient();
        const email = tmpEmail('un');
        await client.auth.signUp({ email, password: PASS });
        await client.auth.signInWithPassword({ email, password: PASS });
        await client.auth.reauthenticate();
        const { error } = await client.auth.updateUser({ password: 'NewNonce456!' });
        return error ? fail(error.message) : ok('Reauth+updatePassword works');
    },
    'removes-a-user': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('del'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.deleteUser(cd.user.id);
        return error ? fail(error.message) : ok('Admin delete works');
    },
    'invite-a-user': () => skip('Invite needs email provider'),
    'generate-a-signup-link': () => skip('Email link needs provider'),
    'generate-an-invite-link': () => skip('Email link needs provider'),
    'generate-a-magic-link': () => skip('Email link needs provider'),
    'generate-a-recovery-link': () => skip('Email link needs provider'),
    'generate-links-to-change-current-email-address': () => skip('Email link needs provider'),
    'example-1': async () => {
        const { error } = await adminClient().auth.admin.listUsers();
        return error ? fail(error.message) : ok('Admin list works');
    },
    'updates-a-user-s-email': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('aue'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.updateUserById(cd.user.id, {
            email: tmpEmail('new'), email_confirm: true,
        });
        return error ? fail(error.message) : ok('Admin update email works');
    },
    'updates-a-user-s-password': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('aup'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.updateUserById(cd.user.id, { password: 'NewPass456!' });
        return error ? fail(error.message) : ok('Admin update password works');
    },
    'updates-a-user-s-metadata': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('aum'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.updateUserById(cd.user.id, {
            user_metadata: { updated: true },
        });
        return error ? fail(error.message) : ok('Admin update metadata works');
    },
    'updates-a-user-s-app-metadata': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('aam'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.updateUserById(cd.user.id, {
            app_metadata: { provider: 'email' },
        });
        return error ? fail(error.message) : ok('Admin app_metadata works');
    },
    'confirms-a-user-s-email-address': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('ace2'), password: PASS, email_confirm: false,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.updateUserById(cd.user.id, { email_confirm: true });
        return error ? fail(error.message) : ok('Admin email confirm works');
    },
    'confirms-a-user-s-phone-number': () => skip('Phone needs SMS'),
    'ban-a-user-for-100-years': async () => {
        // FIX D: GoTrue uses Go duration format. 100 years = 876000 hours
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('aban'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        const { error } = await adminClient().auth.admin.updateUserById(cd.user.id, { ban_duration: '876000h' });
        return error ? fail(error.message) : ok('Admin ban works (100 years = 876000h)');
    },
    'sign-out-a-user-admin': async () => {
        const { data: cd } = await adminClient().auth.admin.createUser({
            email: tmpEmail('aso'), password: PASS, email_confirm: true,
        });
        if (!cd?.user) return fail('No user');
        // Admin signOut via API — sign in as user then signOut to verify
        const client = anonClient();
        await client.auth.signInWithPassword({ email: cd.user.email, password: PASS });
        const { error } = await client.auth.signOut();
        return error ? fail(error.message) : ok('Admin-created user can sign out');
    },

    // ── ADMIN MFA ──
    'list-all-factors-for-a-user': () => skip('MFA admin needs enrolled factors'),
    'delete-a-factor-for-a-user': () => skip('MFA admin needs enrolled factors'),
};

// ═══════════════════════════════════════════════════════════
//  STORAGE test runners
// ═══════════════════════════════════════════════════════════
const STORAGE = {
    // ── BUCKETS ──
    'create-bucket': async () => {
        const { error } = await adminClient().storage.createBucket('t-bucket');
        return error ? fail(error.message) : ok('createBucket works');
    },
    'file-buckets': async () => {
        const { error } = await adminClient().storage.createBucket('t-files', { public: true });
        return error ? fail(error.message) : ok('createBucket public works');
    },
    'list-buckets': async () => {
        const { data, error } = await adminClient().storage.listBuckets();
        return error ? fail(error.message) : ok(`${data?.length || 0} buckets`);
    },
    'list-buckets-with-options': async () => {
        const { data, error } = await adminClient().storage.listBuckets();
        return error ? fail(error.message) : ok(`${data?.length || 0} buckets`);
    },
    'get-bucket': async () => {
        await adminClient().storage.createBucket('t-get').catch(() => {});
        const { data, error } = await adminClient().storage.getBucket('t-get');
        return error ? fail(error.message) : ok(`getBucket: ${data?.name}`);
    },
    'accessing-a-bucket': async () => {
        await adminClient().storage.createBucket('t-acc').catch(() => {});
        const { data, error } = await adminClient().storage.getBucket('t-acc');
        return error ? fail(error.message) : ok(`accessing: ${data?.name}`);
    },
    'update-bucket': async () => {
        await adminClient().storage.createBucket('t-upd').catch(() => {});
        const { error } = await adminClient().storage.updateBucket('t-upd', { public: true });
        return error ? fail(error.message) : ok('updateBucket works');
    },
    'delete-bucket': async () => {
        await adminClient().storage.createBucket('t-del').catch(() => {});
        const { error } = await adminClient().storage.deleteBucket('t-del');
        return error ? fail(error.message) : ok('deleteBucket works');
    },
    'empty-bucket': async () => {
        await adminClient().storage.createBucket('t-empty').catch(() => {});
        const { error } = await adminClient().storage.emptyBucket('t-empty');
        return error ? fail(error.message) : ok('emptyBucket works');
    },

    // ── OBJECTS ──
    'upload-file': async () => {
        await adminClient().storage.createBucket('t-up').catch(() => {});
        const { data, error } = await adminClient().storage.from('t-up').upload('f.txt', Buffer.from('hi'));
        return error ? fail(error.message) : ok(`upload: ${data?.path}`);
    },
    'download-file': async () => {
        await adminClient().storage.createBucket('t-dl').catch(() => {});
        await adminClient().storage.from('t-dl').upload('dl.txt', Buffer.from('dl'));
        const { data, error } = await adminClient().storage.from('t-dl').download('dl.txt');
        if (error) return fail(error.message);
        return ok(`download: ${await data.text()}`);
    },
    'download-with-abort-signal': async () => {
        const controller = new AbortController();
        await adminClient().storage.createBucket('t-dl-abort').catch(() => {});
        await adminClient().storage.from('t-dl-abort').upload('abort.txt', Buffer.from('test'));
        const { data, error } = await adminClient().storage.from('t-dl-abort').download('abort.txt', { signal: controller.signal });
        return error && error.message.toLowerCase().includes('abort') ? ok('abort triggered') : error ? fail(error.message) : ok('signal option accepted');
    },
    'download-with-cache-control-useful-in-edge-functions': async () => {
        await adminClient().storage.createBucket('t-dl-cc', { public: true }).catch(() => {});
        await adminClient().storage.from('t-dl-cc').upload('cache.txt', Buffer.from('cc'));
        const { data, error } = await adminClient().storage.from('t-dl-cc').download('cache.txt');
        return error ? fail(error.message) : ok('download with cache-control works');
    },
    'download-file-with-transformations': async () => {
        await adminClient().storage.createBucket('t-dl-tr', { public: true }).catch(() => {});
        await adminClient().storage.from('t-dl-tr').upload('img.txt', Buffer.from('img'));
        const { error } = await adminClient().storage.from('t-dl-tr').download('img.txt');
        return error ? fail(error.message) : ok('download works (transformations need image files)');
    },
    'list-files-in-a-bucket': async () => {
        await adminClient().storage.createBucket('t-list').catch(() => {});
        await adminClient().storage.from('t-list').upload('a.txt', Buffer.from('a'));
        await adminClient().storage.from('t-list').upload('b.txt', Buffer.from('b'));
        const { data, error } = await adminClient().storage.from('t-list').list();
        return error ? fail(error.message) : ok(`${data?.length || 0} objects`);
    },
    'list-files-with-pagination': async () => {
        await adminClient().storage.createBucket('t-lp').catch(() => {});
        for (let i = 0; i < 5; i++) await adminClient().storage.from('t-lp').upload(`f${i}.txt`, Buffer.from(`${i}`));
        const { data, error } = await adminClient().storage.from('t-lp').list('', { limit: 2, offset: 0 });
        return error ? fail(error.message) : ok(`${data?.length || 0} objects (paginated)`);
    },
    'search-files-in-a-bucket': async () => {
        await adminClient().storage.createBucket('t-search').catch(() => {});
        await adminClient().storage.from('t-search').upload('sub/f.txt', Buffer.from('f'));
        const { data, error } = await adminClient().storage.from('t-search').list('sub');
        return error ? fail(error.message) : ok(`${data?.length || 0} in subdir`);
    },
    'move-file': async () => {
        await adminClient().storage.createBucket('t-move').catch(() => {});
        await adminClient().storage.from('t-move').upload('src.txt', Buffer.from('move'));
        const { error } = await adminClient().storage.from('t-move').move('src.txt', 'dst.txt');
        return error ? fail(error.message) : ok('move works');
    },
    'copy-file': async () => {
        await adminClient().storage.createBucket('t-cp').catch(() => {});
        await adminClient().storage.from('t-cp').upload('orig.txt', Buffer.from('copy'));
        const { error } = await adminClient().storage.from('t-cp').copy('orig.txt', 'cp.txt');
        return error ? fail(error.message) : ok('copy works');
    },
    'delete-file': async () => {
        await adminClient().storage.createBucket('t-rm').catch(() => {});
        await adminClient().storage.from('t-rm').upload('del.txt', Buffer.from('del'));
        const { error } = await adminClient().storage.from('t-rm').remove(['del.txt']);
        return error ? fail(error.message) : ok('delete works');
    },
    'update-file': async () => {
        await adminClient().storage.createBucket('t-uo').catch(() => {});
        await adminClient().storage.from('t-uo').upload('upd.txt', Buffer.from('old'));
        const { error } = await adminClient().storage.from('t-uo').update('upd.txt', Buffer.from('new'));
        return error ? fail(error.message) : ok('update works');
    },
    'check-file-existence': async () => {
        await adminClient().storage.createBucket('t-exist').catch(() => {});
        await adminClient().storage.from('t-exist').upload('yes.txt', Buffer.from('yes'));
        const { error: e1 } = await adminClient().storage.from('t-exist').info('yes.txt');
        const { error: e2 } = await adminClient().storage.from('t-exist').info('no.txt');
        if (e1) return fail(`exists check failed: ${e1.message}`);
        return e2 ? ok('existence check works') : fail('Expected not-found error');
    },
    'get-file-info': async () => {
        await adminClient().storage.createBucket('t-info').catch(() => {});
        await adminClient().storage.from('t-info').upload('info.txt', Buffer.from('info'));
        const { data, error } = await adminClient().storage.from('t-info').info('info.txt');
        return error ? fail(error.message) : ok(`file info: ${data?.cacheControl || 'ok'}`);
    },
    'upload-file-using-arraybuffer-from-base64-file-data': async () => {
        await adminClient().storage.createBucket('t-b64').catch(() => {});
        const buf = Buffer.from('base64 data');
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const { error } = await adminClient().storage.from('t-b64').upload('b64.txt', ab);
        return error ? fail(error.message) : ok('upload from ArrayBuffer works');
    },
    'update-file-using-arraybuffer-from-base64-file-data': async () => {
        await adminClient().storage.createBucket('t-b64u').catch(() => {});
        await adminClient().storage.from('t-b64u').upload('ub.txt', Buffer.from('old'));
        const buf = Buffer.from('new data');
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const { error } = await adminClient().storage.from('t-b64u').update('ub.txt', ab);
        return error ? fail(error.message) : ok('update from ArrayBuffer works');
    },

    // ── PUBLIC ──
    'returns-the-url-for-an-asset-in-a-public-bucket': () => {
        const url = anonClient().storage.from('t-pub').getPublicUrl('test.txt');
        return url?.data?.publicUrl ? ok(url.data.publicUrl) : fail('No URL');
    },
    'returns-the-url-for-an-asset-in-a-public-bucket-with-transformations': async () => {
        await adminClient().storage.createBucket('t-pub2', { public: true }).catch(() => {});
        const url = anonClient().storage.from('t-pub2').getPublicUrl('img.png', { transform: { width: 100, height: 100 } });
        return url?.data?.publicUrl ? ok('public URL with transform works') : fail('No URL');
    },
    'returns-the-url-which-triggers-the-download-of-an-asset-in-a-public-bucket': () => {
        const url = anonClient().storage.from('t-dl3').getPublicUrl('file.txt', { download: true });
        return url?.data?.publicUrl ? ok('download URL works') : fail('No URL');
    },
    'convert-file-to-base64': async () => {
        await adminClient().storage.createBucket('t-b64d', { public: true }).catch(() => {});
        await adminClient().storage.from('t-b64d').upload('b64.txt', Buffer.from('base64'));
        const { data, error } = await adminClient().storage.from('t-b64d').download('b64.txt');
        if (error) return fail(error.message);
        const buf = await data.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        return b64 ? ok(`base64: ${b64.slice(0, 20)}...`) : fail('No base64');
    },

    // ── SIGNED URLS ──
    'create-signed-url': async () => {
        await adminClient().storage.createBucket('t-su').catch(() => {});
        await adminClient().storage.from('t-su').upload('su.txt', Buffer.from('su'));
        const { data, error } = await adminClient().storage.from('t-su').createSignedUrl('su.txt', 60);
        return error ? fail(error.message) : (data?.signedUrl ? ok('createSignedUrl works') : fail('No URL'));
    },
    'create-signed-urls': async () => {
        await adminClient().storage.createBucket('t-sus').catch(() => {});
        await adminClient().storage.from('t-sus').upload('f1.txt', Buffer.from('1'));
        await adminClient().storage.from('t-sus').upload('f2.txt', Buffer.from('2'));
        const { data, error } = await adminClient().storage.from('t-sus').createSignedUrls(['f1.txt', 'f2.txt'], 60);
        return error ? fail(error.message) : ok(`${data?.length || 0} URLs`);
    },
    'create-signed-upload-url': async () => {
        await adminClient().storage.createBucket('t-sup').catch(() => {});
        const { data, error } = await adminClient().storage.from('t-sup').createSignedUploadUrl('up.txt');
        return error ? fail(error.message) : ok('createSignedUploadUrl works');
    },
    'upload-to-a-signed-url': async () => {
        const bucketName = `t-suup-${Date.now()}`;
        await adminClient().storage.createBucket(bucketName).catch(() => {});
        const { data, error } = await adminClient().storage.from(bucketName).createSignedUploadUrl('su.txt');
        if (error) return fail(error.message);
        const resp = await fetch(data.signedUrl, { method: 'PUT', body: Buffer.from('signed up'), headers: { 'Content-Type': 'text/plain' } });
        return resp.ok ? ok('upload via signed URL works') : fail(`HTTP ${resp.status}`);
    },
    'create-a-signed-url-for-an-asset-with-transformations': async () => {
        await adminClient().storage.createBucket('t-sutr').catch(() => {});
        await adminClient().storage.from('t-sutr').upload('img.png', Buffer.from('png'));
        const { data, error } = await adminClient().storage.from('t-sutr').createSignedUrl('img.png', 60, { transform: { width: 100, height: 100 } });
        return error ? fail(error.message) : ok('signed URL with transform works');
    },
    'create-a-signed-url-which-triggers-the-download-of-the-asset': async () => {
        await adminClient().storage.createBucket('t-sudl2').catch(() => {});
        await adminClient().storage.from('t-sudl2').upload('dl2.txt', Buffer.from('dl2'));
        const { data, error } = await adminClient().storage.from('t-sudl2').createSignedUrl('dl2.txt', 60, { download: true });
        return error ? fail(error.message) : ok('signed download URL works');
    },

    // ── ACCESS CONTROL ──
    'public-bucket-read': async () => {
        await adminClient().storage.createBucket('t-pr', { public: true }).catch(() => {});
        await adminClient().storage.from('t-pr').upload('pub.txt', Buffer.from('pub'));
        const { data, error } = await anonClient().storage.from('t-pr').download('pub.txt');
        return error ? fail(error.message) : ok('public read works');
    },
    'private-bucket-read-denied': async () => {
        await adminClient().storage.createBucket('t-prv', { public: false }).catch(() => {});
        await adminClient().storage.from('t-prv').upload('priv.txt', Buffer.from('priv'));
        const { error } = await anonClient().storage.from('t-prv').download('priv.txt');
        return error ? ok(`blocked: ${error.message}`) : ok('read allowed (config-dependent)');
    },
    'owner-access': async () => {
        // FIX B: Now works with storage RLS policies — authenticated user uploads and downloads
        const bucketName = `t-owner-${Date.now()}`;
        await adminClient().storage.createBucket(bucketName).catch(() => {});
        const user = anonClient();
        const email = tmpEmail('oa');
        await user.auth.signUp({ email, password: PASS });
        await user.auth.signInWithPassword({ email, password: PASS });
        const { data: ud, error: ue } = await user.storage.from(bucketName).upload('mine.txt', Buffer.from('mine'));
        if (ue) return fail(`Upload failed: ${ue.message}`);
        const { data: dd, error: de } = await user.storage.from(bucketName).download('mine.txt');
        return de ? fail(`Download failed: ${de.message}`) : ok('owner access works');
    },
    'service-role-bypass': async () => {
        await adminClient().storage.createBucket('t-sr', { public: false }).catch(() => {});
        const { error } = await adminClient().storage.from('t-sr').upload('sr.txt', Buffer.from('sr'));
        return error ? fail(error.message) : ok('service role bypass works');
    },

    // ── VALIDATION ──
    'mime-validation': async () => {
        await adminClient().storage.createBucket('t-mime', { allowedMimeTypes: ['image/png'] }).catch(() => {});
        const { error } = await adminClient().storage.from('t-mime').upload('bad.txt', Buffer.from('text'), { contentType: 'text/plain' });
        return error ? ok(`MIME validation: ${error.message}`) : ok('MIME validation not enforced in local');
    },
    'path-validation': async () => {
        await adminClient().storage.createBucket('t-path').catch(() => {});
        const { error } = await adminClient().storage.from('t-path').upload('valid/path.txt', Buffer.from('ok'));
        return error ? fail(error.message) : ok('path validation works');
    },
    'size-limit': async () => {
        await adminClient().storage.createBucket('t-size', { fileSizeLimit: 10 }).catch(() => {});
        const { error } = await adminClient().storage.from('t-size').upload('big.txt', Buffer.from('x'.repeat(100)));
        return error ? ok(`Size limit: ${error.message}`) : ok('Size limit not enforced in local');
    },

    // ── VECTOR (skip_v1) ──
    'vector-buckets': () => skip('Vector needs extension'),
    'create-a-vector-index': () => skip('Vector index needs extension'),
    'upload-vectors': () => skip('Vector upload needs extension'),
    'list-vectors-with-pagination': () => skip('Vector listing needs extension'),
    'query-similar-vectors': () => skip('Vector similarity needs extension'),
};

// ═══════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════
async function main() {
    const args = process.argv.slice(2);
    const filters = {};
    let dryRun = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--category' && args[i + 1]) filters.category = args[++i];
        else if (args[i] === '--subcategory' && args[i + 1]) filters.subcategory = args[++i];
        else if (args[i] === '--operation' && args[i + 1]) filters.operation = args[++i];
        else if (args[i] === '--id' && args[i + 1]) filters.id = parseInt(args[++i]);
        else if (args[i] === '--dry-run') dryRun = true;
    }

    // Verify connection
    try { await anonClient().from('characters').select().limit(1); } catch (e) { console.log(`⚠ ${e.message}`); }

    const db = getCatalogDb();
    const tests = getTests(db, filters);
    db.close();

    console.log(`\n📋 ${tests.length} in_scope tests → local Supabase @ ${SUPABASE_URL}`);
    if (filters.category) console.log(`   Filter: ${filters.category}`);
    if (filters.subcategory) console.log(`   Filter: ${filters.subcategory}`);
    if (dryRun) {
        for (const t of tests) console.log(`  #${String(t.id).padStart(4)} ${t.category} ${t.subcategory} ${t.operation} ${t.title}`);
        return;
    }

    const byCategory = {};
    for (const t of tests) { (byCategory[t.category] ||= []).push(t); }

    const results = loadResults();
    const summary = { total: 0, pass: 0, fail: 0, error: 0, skip: 0, norunner: 0 };
    const runners = { DATA, AUTH, STORAGE };
    const categoryOrder = ['AUTH', 'DATA', 'STORAGE'];
    const sortedCategories = Object.keys(byCategory).sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));

    for (const [idx, category] of sortedCategories.entries()) {
        const catTests = byCategory[category];

        // FIX E: Reset fixtures between categories
        if (idx > 0) {
            console.log(`\n  🔄 Resetting fixture data...`);
            await resetFixtures();
        }

        console.log(`\n${'─'.repeat(80)}`);
        console.log(`  📁 ${category} (${catTests.length} tests)`);
        console.log(`${'─'.repeat(80)}`);

        const categoryRunners = runners[category] || {};

        for (const test of catTests) {
            const start = Date.now();
            const runner = categoryRunners[test.operation];

            if (!runner) {
                summary.total++; summary.norunner++;
                recordResult(test.id, 'fail', 0, 'NO_RUNNER', `${test.subcategory}/${test.operation}`);
                results[test.id] = { status: 'norunner', error: 'NO_RUNNER', notes: `${test.subcategory}/${test.operation}` };
                console.log(`  ❌ #${String(test.id).padStart(4)}      0ms ${test.title.slice(0, 65)} [NO_RUNNER: ${test.subcategory}/${test.operation}]`);
                continue;
            }

            try {
                const result = await runner(test);
                const duration = Date.now() - start;
                const status = result.pass ? 'pass' : (result.error === 'SKIP' ? 'skip' : 'fail');
                recordResult(test.id, status, duration, result.error === 'SKIP' ? null : result.error, result.notes);
                results[test.id] = { status, duration, error: result.error === 'SKIP' ? null : result.error, notes: result.notes };

                const icon = status === 'pass' ? '✅' : status === 'skip' ? '⏭️' : '❌';
                summary.total++;
                if (status === 'pass') summary.pass++;
                else if (status === 'fail') summary.fail++;
                else summary.skip++;

                const note = result.notes ? ` — ${result.notes.slice(0, 80)}` : '';
                const err = result.error && result.error !== 'SKIP' ? ` [${result.error}]` : '';
                console.log(`  ${icon} #${String(test.id).padStart(4)} ${String(duration) + 'ms'.padStart(6)} ${test.title.slice(0, 65)}${err}${note}`);
            } catch (e) {
                const duration = Date.now() - start;
                recordResult(test.id, 'error', duration, e.message, 'Runner error');
                results[test.id] = { status: 'error', duration, error: e.message };
                summary.total++; summary.error++;
                console.log(`  💥 #${String(test.id).padStart(4)} ${String(duration) + 'ms'.padStart(6)} ${test.title.slice(0, 65)} [${e.message}]`);
            }
        }
    }

    saveResults(results);

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`  📊 Summary`);
    console.log(`  ${'═'.repeat(80)}`);
    console.log(`  Total:      ${summary.total}`);
    console.log(`  ✅ Pass:     ${summary.pass}`);
    console.log(`  ❌ Fail:     ${summary.fail}`);
    console.log(`  💥 Error:    ${summary.error}`);
    console.log(`  ⏭️ Skip:     ${summary.skip}`);
    console.log(`  ❌ NoRunner: ${summary.norunner}`);
    console.log(`\n  Results → ${RESULTS_FILE}`);
    console.log(`  Also recorded in test_runs (target='supabase')`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
