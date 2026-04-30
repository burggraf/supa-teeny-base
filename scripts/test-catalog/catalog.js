#!/usr/bin/env node
// test-catalog CLI — manage Supaflare test catalog
// Usage: node scripts/test-catalog/catalog.js <command> [args]

import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'test-catalog.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

// ── DB init ──

function getDb() {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    if (!existsSync(DB_PATH) || db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='test_catalog'").get().c === 0) {
        const schema = readFileSync(SCHEMA_PATH, 'utf-8');
        db.exec(schema);
    }
    return db;
}

// ── Commands ──

async function cmdSeed(db) {
    const seedFile = join(__dirname, 'seed-data.js');
    const { default: seedFn } = await import(seedFile);
    seedFn(db);
}

function cmdAdd(db, opts) {
    const { category, subcategory, operation, title, description, source_url, priority, v1_scope, test_procedure, test_code, data_source, expected_response } = opts;
    if (!category || !subcategory || !operation || !title) {
        console.error('Usage: catalog.js add --category DATA --subcategory filters --operation eq --title "..." [--description "..."] [--source-url ""] [--priority P1] [--v1-scope in_scope] [--test-code "..."] [--data-source "..."] [--expected-response "..."]');
        process.exit(1);
    }
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO test_catalog (category, subcategory, operation, title, description, source_url, priority, v1_scope, test_procedure, test_code, data_source, expected_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(category, subcategory, operation, title, description || null, source_url || null, priority || 'P1', v1_scope || 'in_scope', test_procedure || null, test_code || null, data_source || null, expected_response || null);
    if (result.changes === 0) {
        console.log(`Test already exists: ${category}/${subcategory}/${operation}/${title}`);
    } else {
        console.log(`Added test #${result.lastInsertRowid}: ${category}/${subcategory}/${operation}`);
    }
}

function cmdList(db, opts) {
    const { category, subcategory, status, target, format } = opts;
    let where = ['1=1'];
    let params = [];
    if (category) { where.push('tc.category = ?'); params.push(category); }
    if (subcategory) { where.push('tc.subcategory = ?'); params.push(subcategory); }
    if (status) {
        where.push(`tr.status = ?`);
        params.push(status);
    }

    const query = `
        SELECT tc.id, tc.category, tc.subcategory, tc.operation, tc.title, tc.priority, tc.v1_scope,
               tr.status, tr.target, tr.run_at, tr.error_output, tr.notes
        FROM test_catalog tc
        LEFT JOIN test_runs tr ON tr.test_id = tc.id
        WHERE ${where.join(' AND ')}
        ORDER BY tc.category, tc.subcategory, tc.operation, tc.title
    `;

    const rows = db.prepare(query).all(...params);

    if (format === 'json') {
        console.log(JSON.stringify(rows, null, 2));
    } else if (format === 'csv') {
        const header = 'id,category,subcategory,operation,title,priority,v1_scope,status,target,run_at,notes';
        console.log(header);
        for (const r of rows) {
            console.log([r.id, r.category, r.subcategory, r.operation, `"${(r.title||'').replace(/"/g,'""')}"`, r.priority, r.v1_scope, r.status||'pending', r.target||'', r.run_at||'', `"${(r.notes||'').replace(/"/g,'""')}"`].join(','));
        }
    } else {
        // table format
        console.log(`\nFound ${rows.length} test entries\n`);
        console.log(`${'ID'.padStart(4)} ${'Cat'.padEnd(10)} ${'Subcategory'.padEnd(16)} ${'Operation'.padEnd(18)} ${'Pri'.padEnd(4)} ${'Scope'.padEnd(10)} ${'Status'.padEnd(10)} ${'Target'.padEnd(10)} Title`);
        console.log('─'.repeat(120));
        for (const r of rows) {
            console.log(`${String(r.id).padStart(4)} ${r.category.padEnd(10)} ${r.subcategory.padEnd(16)} ${r.operation.padEnd(18)} ${r.priority.padEnd(4)} ${r.v1_scope.padEnd(10)} ${(r.status||'pending').padEnd(10)} ${(r.target||'—').padEnd(10)} ${r.title}`);
        }
    }
}

function cmdRun(db, opts) {
    const { id, category, subcategory, operation, target, status, duration_ms, error_output, notes } = opts;
    if (!target) {
        console.error('Usage: catalog.js run --target supabase|supaflare [--id N | --category DATA --subcategory filters --operation eq] [--status pass|fail|error|skip|blocked] [--duration-ms N] [--error "..."] [--notes "..."]');
        process.exit(1);
    }
    if (!['supabase', 'supaflare'].includes(target)) {
        console.error('Target must be "supabase" or "supaflare"');
        process.exit(1);
    }

    let testId = id;
    if (!testId && category && subcategory && operation) {
        const row = db.prepare('SELECT id FROM test_catalog WHERE category=? AND subcategory=? AND operation=? LIMIT 1').get(category, subcategory, operation);
        if (!row) { console.error(`No test found for ${category}/${subcategory}/${operation}`); process.exit(1); }
        testId = row.id;
    }
    if (!testId) { console.error('Specify --id or --category/--subcategory/--operation'); process.exit(1); }

    const runStatus = status || 'pass';
    const upsert = db.prepare(`
        INSERT INTO test_runs (test_id, target, status, run_at, duration_ms, error_output, notes)
        VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?)
        ON CONFLICT(test_id, target) DO UPDATE SET
            status = excluded.status,
            run_at = excluded.run_at,
            duration_ms = excluded.duration_ms,
            error_output = excluded.error_output,
            notes = excluded.notes
    `);
    const result = upsert.run(testId, target, runStatus, duration_ms || null, error_output || null, notes || null);
    console.log(`Recorded ${runStatus} run for test #${testId} (target: ${target})`);
}

function cmdReport(db, opts) {
    const { format, target } = opts;
    const scopeFilter = opts['v1-scope'] || 'in_scope';

    // Overall summary
    const total = db.prepare(`SELECT count(*) as c FROM test_catalog WHERE v1_scope = ?`).get(scopeFilter).c;
    const byCategory = db.prepare(`
        SELECT tc.category, count(*) as total,
               sum(CASE WHEN tr.status='pass' THEN 1 ELSE 0 END) as pass,
               sum(CASE WHEN tr.status='fail' THEN 1 ELSE 0 END) as fail,
               sum(CASE WHEN tr.status='pending' OR tr.status IS NULL THEN 1 ELSE 0 END) as pending,
               sum(CASE WHEN tr.status='error' THEN 1 ELSE 0 END) as error,
               sum(CASE WHEN tr.status='skip' OR tr.status='blocked' OR tr.status='not_applicable' THEN 1 ELSE 0 END) as other
        FROM test_catalog tc
        LEFT JOIN test_runs tr ON tr.test_id = tc.id AND (? IS NULL OR tr.target = ?)
        WHERE tc.v1_scope = ?
        GROUP BY tc.category
        ORDER BY tc.category
    `).all(target || null, target || null, scopeFilter);

    const bySubcategory = db.prepare(`
        SELECT tc.category, tc.subcategory, count(*) as total,
               sum(CASE WHEN tr.status='pass' THEN 1 ELSE 0 END) as pass,
               sum(CASE WHEN tr.status='fail' THEN 1 ELSE 0 END) as fail,
               sum(CASE WHEN tr.status='pending' OR tr.status IS NULL THEN 1 ELSE 0 END) as pending
        FROM test_catalog tc
        LEFT JOIN test_runs tr ON tr.test_id = tc.id AND (? IS NULL OR tr.target = ?)
        WHERE tc.v1_scope = ?
        GROUP BY tc.category, tc.subcategory
        ORDER BY tc.category, tc.subcategory
    `).all(target || null, target || null, scopeFilter);

    const failingTests = db.prepare(`
        SELECT tc.id, tc.category, tc.subcategory, tc.operation, tc.title, tr.status, tr.target, tr.error_output, tr.run_at
        FROM test_catalog tc
        JOIN test_runs tr ON tr.test_id = tc.id
        WHERE tr.status IN ('fail', 'error') AND (? IS NULL OR tr.target = ?)
        AND tc.v1_scope = ?
        ORDER BY tc.category, tc.subcategory
    `).all(target || null, target || null, scopeFilter);

    if (format === 'json') {
        console.log(JSON.stringify({ total, byCategory, bySubcategory, failingTests }, null, 2));
    } else if (format === 'markdown') {
        generateMarkdownReport({ total, byCategory, bySubcategory, failingTests, target, scopeFilter });
    } else {
        console.log(`\n=== Supaflare Test Report ===`);
        console.log(`Scope: ${scopeFilter} | Target: ${target || 'all'}\n`);
        console.log(`Total tests: ${total}`);

        // Category breakdown
        let totalPass = 0, totalFail = 0, totalPending = 0;
        console.log(`\n${'Category'.padEnd(12)} ${'Total'.padStart(6)} ${'Pass'.padStart(6)} ${'Fail'.padStart(6)} ${'Pending'.padStart(8)} ${'Other'.padStart(6)} ${'Pct'.padStart(6)}`);
        console.log('─'.repeat(60));
        for (const c of byCategory) {
            const pct = c.total > 0 ? Math.round((c.pass / c.total) * 100) : 0;
            console.log(`${c.category.padEnd(12)} ${String(c.total).padStart(6)} ${String(c.pass).padStart(6)} ${String(c.fail).padStart(6)} ${String(c.pending).padStart(8)} ${String(c.other).padStart(6)} ${pct + '%'}`);
            totalPass += c.pass;
            totalFail += c.fail;
            totalPending += c.pending;
        }
        const overallPct = total > 0 ? Math.round((totalPass / total) * 100) : 0;
        console.log(`${'ALL'.padEnd(12)} ${String(total).padStart(6)} ${String(totalPass).padStart(6)} ${String(totalFail).padStart(6)} ${String(totalPending).padStart(8)} ${''} ${overallPct + '%'}`);

        // Subcategory breakdown
        console.log(`\n${'Category'.padEnd(12)} ${'Subcategory'.padEnd(20)} ${'Total'.padStart(6)} ${'Pass'.padStart(6)} ${'Fail'.padStart(6)} ${'Pending'.padStart(8)}`);
        console.log('─'.repeat(60));
        for (const s of bySubcategory) {
            console.log(`${s.category.padEnd(12)} ${s.subcategory.padEnd(20)} ${String(s.total).padStart(6)} ${String(s.pass).padStart(6)} ${String(s.fail).padStart(6)} ${String(s.pending).padStart(8)}`);
        }

        // Failing tests
        if (failingTests.length > 0) {
            console.log(`\n── Failing Tests (${failingTests.length}) ──`);
            for (const t of failingTests) {
                console.log(`  #${t.id} ${t.category}/${t.subcategory}/${t.operation} [${t.target}] — ${t.status}`);
                if (t.error_output) console.log(`    ${t.error_output}`);
            }
        }
    }
}

function generateMarkdownReport({ total, byCategory, bySubcategory, failingTests, target, scopeFilter }) {
    const totalPass = byCategory.reduce((s, c) => s + c.pass, 0);
    const totalFail = byCategory.reduce((s, c) => s + c.fail, 0);
    const overallPct = total > 0 ? Math.round((totalPass / total) * 100) : 0;
    const date = new Date().toISOString().split('T')[0];

    const lines = [
        `# Supaflare Test Report — ${date}`,
        ``,
        `**Scope:** ${scopeFilter} | **Target:** ${target || 'all'} | **Total Tests:** ${total}`,
        `**Pass:** ${totalPass} | **Fail:** ${totalFail} | **Pending:** ${total - totalPass - totalFail}`,
        ``,
        `## Overall Progress`,
        ``,
        `${'█'.repeat(Math.round(overallPct / 2))}${'░'.repeat(50 - Math.round(overallPct / 2))} ${overallPct}%`,
        ``,
        `## By Category`,
        ``,
        `| Category | Total | Pass | Fail | Pending | Other | % |`,
        `|----------|------:|-----:|-----:|--------:|------:|--:|`,
        ...byCategory.map(c => {
            const pct = c.total > 0 ? Math.round((c.pass / c.total) * 100) : 0;
            return `| ${c.category} | ${c.total} | ${c.pass} | ${c.fail} | ${c.pending} | ${c.other} | ${pct}% |`;
        }),
        ``,
        `## By Subcategory`,
        ``,
        `| Category | Subcategory | Total | Pass | Fail | Pending |`,
        `|----------|-------------|------:|-----:|-----:|--------:|`,
        ...bySubcategory.map(s => `| ${s.category} | ${s.subcategory} | ${s.total} | ${s.pass} | ${s.fail} | ${s.pending} |`),
    ];

    if (failingTests.length > 0) {
        lines.push(``, `## Failing Tests`, ``);
        for (const t of failingTests) {
            lines.push(`### #${t.id} — ${t.category}/${t.subcategory}/${t.operation}`);
            lines.push(`- **Title:** ${t.title}`);
            lines.push(`- **Target:** ${t.target}`);
            lines.push(`- **Status:** ${t.status}`);
            if (t.run_at) lines.push(`- **Run at:** ${t.run_at}`);
            if (t.error_output) lines.push(`- **Error:** \`${t.error_output}\``);
            lines.push(``);
        }
    }

    console.log(lines.join('\n'));
}

function cmdStatus(db, opts) {
    const { category, subcategory, operation, target } = opts;
    let where = ['1=1'];
    let params = [];
    if (category) { where.push('tc.category = ?'); params.push(category); }
    if (subcategory) { where.push('tc.subcategory = ?'); params.push(subcategory); }
    if (operation) { where.push('tc.operation = ?'); params.push(operation); }
    if (target) { where.push('tr.target = ?'); params.push(target); }

    const rows = db.prepare(`
        SELECT tc.id, tc.category, tc.subcategory, tc.operation, tc.title,
               tr_s.status as supabase_status, tr_s.run_at as supabase_run,
               tr_f.status as supaflare_status, tr_f.run_at as supaflare_run
        FROM test_catalog tc
        LEFT JOIN test_runs tr_s ON tr_s.test_id = tc.id AND tr_s.target = 'supabase'
        LEFT JOIN test_runs tr_f ON tr_f.test_id = tc.id AND tr_f.target = 'supaflare'
        WHERE ${where.join(' AND ')}
        ORDER BY tc.category, tc.subcategory, tc.operation
    `).all(...params);

    console.log(`\n${'ID'.padStart(4)} ${'Cat'.padEnd(8)} ${'Subcategory'.padEnd(16)} ${'Operation'.padEnd(18)} Supabase    Supaflare    Title`);
    console.log('─'.repeat(110));
    for (const r of rows) {
        const sStatus = (r.supabase_status || 'pending').padEnd(12);
        const fStatus = (r.supaflare_status || 'pending').padEnd(12);
        console.log(`${String(r.id).padStart(4)} ${r.category.padEnd(8)} ${r.subcategory.padEnd(16)} ${r.operation.padEnd(18)} ${sStatus} ${fStatus} ${r.title}`);
    }
    console.log(`\n${rows.length} tests`);
}

function cmdDelete(db, opts) {
    const { id, category, subcategory, operation } = opts;
    if (id) {
        const result = db.prepare('DELETE FROM test_catalog WHERE id = ?').run(id);
        console.log(`Deleted test #${id} (${result.changes} rows)`);
    } else if (category && subcategory && operation) {
        const result = db.prepare('DELETE FROM test_catalog WHERE category=? AND subcategory=? AND operation=?').run(category, subcategory, operation);
        console.log(`Deleted ${result.changes} test(s) matching ${category}/${subcategory}/${operation}`);
    } else {
        console.error('Specify --id or --category/--subcategory/--operation');
        process.exit(1);
    }
}

function cmdExport(db, opts) {
    const { format, category } = opts;
    let where = ['tc.v1_scope = \'in_scope\''];
    let params = [];
    if (category) { where.push('tc.category = ?'); params.push(category); }

    const tests = db.prepare(`
        SELECT tc.*, 
               tr_s.status as supabase_status, tr_s.run_at as supabase_run, tr_s.notes as supabase_notes,
               tr_f.status as supaflare_status, tr_f.run_at as supaflare_run, tr_f.notes as supaflare_notes, tr_f.error_output as supaflare_error
        FROM test_catalog tc
        LEFT JOIN test_runs tr_s ON tr_s.test_id = tc.id AND tr_s.target = 'supabase'
        LEFT JOIN test_runs tr_f ON tr_f.test_id = tc.id AND tr_f.target = 'supaflare'
        WHERE ${where.join(' AND ')}
        ORDER BY tc.category, tc.subcategory, tc.operation
    `).all(...params);

    if (format === 'json') {
        console.log(JSON.stringify(tests, null, 2));
    } else if (format === 'markdown') {
        let currentCat = '', currentSub = '';
        for (const t of tests) {
            if (t.category !== currentCat) {
                currentCat = t.category;
                currentSub = '';
                console.log(`\n# ${t.category}\n`);
            }
            if (t.subcategory !== currentSub) {
                currentSub = t.subcategory;
                console.log(`\n## ${t.subcategory}\n`);
            }
            console.log(`### ${t.operation} — ${t.title}`);
            if (t.description) console.log(t.description);
            console.log(`- **Priority:** ${t.priority}`);
            if (t.source_url) console.log(`- **Source:** ${t.source_url}`);
            if (t.test_code) console.log(`\n**Test Code:**\n\`\`\`js\n${t.test_code}\n\`\`\`\n`);
            if (t.data_source) console.log(`\n**Data Source:**\n\`\`\`sql\n${t.data_source}\n\`\`\`\n`);
            if (t.expected_response) console.log(`\n**Expected Response:**\n\`\`\`json\n${t.expected_response}\n\`\`\`\n`);
            console.log(`| Target | Status | Run Date | Notes |`);
            console.log(`|--------|--------|----------|-------|`);
            console.log(`| Supabase | ${t.supabase_status || 'pending'} | ${t.supabase_run || '—'} | ${t.supabase_notes || ''} |`);
            console.log(`| Supaflare | ${t.supaflare_status || 'pending'} | ${t.supaflare_run || '—'} | ${t.supaflare_notes || ''} |`);
            if (t.supaflare_error) console.log(`\n**Error:** ${t.supaflare_error}`);
            console.log(``);
        }
    } else {
        // CSV
        console.log('id,category,subcategory,operation,title,priority,v1_scope,description,source_url,test_code,data_source,expected_response,supabase_status,supabase_run,supabase_notes,supaflare_status,supaflare_run,supaflare_notes,supaflare_error');
        for (const t of tests) {
            const esc = v => v ? `"${String(v).replace(/"/g, '""')}"` : '';
            console.log([t.id, t.category, t.subcategory, t.operation, esc(t.title), t.priority, t.v1_scope, esc(t.description), esc(t.source_url), esc(t.test_code), esc(t.data_source), esc(t.expected_response), t.supabase_status, t.supabase_run, esc(t.supabase_notes), t.supaflare_status, t.supaflare_run, esc(t.supaflare_notes), esc(t.supaflare_error)].join(','));
        }
    }
}

function cmdInit(db) {
    console.log('Database initialized at:', DB_PATH);
    const count = db.prepare('SELECT count(*) as c FROM test_catalog').get().c;
    console.log(`Tests in catalog: ${count}`);
}

// ── Arg parser ──

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2).replace(/-/g, '_');
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) {
                args[key] = next;
                i++;
            } else {
                args[key] = true;
            }
        } else if (!args._) {
            args._ = a;
        }
    }
    return args;
}

// ── Main ──

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const db = getDb();

const helpText = `
Supaflare Test Catalog CLI

Usage: node scripts/test-catalog/catalog.js <command> [options]

Commands:
  init                Initialize database
  add                 Add a test to the catalog
  list                List tests (filter by --category, --subcategory, --status, --target)
  run                 Record a test run result
  report              Generate summary report (--format text|json|markdown) (--target supabase|supaflare)
  status              Show side-by-side supabase vs supaflare status
  seed                Seed catalog from DATA.md, AUTH.md, STORAGE.md
  delete              Remove a test (--id N or --category/--subcategory/--operation)
  export              Export catalog (--format json|csv|markdown) (--category DATA)
  help                Show this help

Add options:
  --category DATA|AUTH|STORAGE    (required)
  --subcategory <name>            (required) e.g. filters, crud, signup
  --operation <name>              (required) e.g. eq, insert, signup-password
  --title <text>                  (required) human-readable title
  --description <text>            test description
  --source-url <url>              Supabase docs URL
  --priority P0|P1|P2|P3          default: P1
  --v1-scope in_scope|skip_v1|v2  default: in_scope
  --test-code <js>                supabase-js test code
  --data-source <sql>             SQL fixture
  --expected-response <json>      expected response JSON

Run options:
  --target supabase|supaflare     (required)
  --id N                          test ID
  --category/subcategory/operation  alternative to --id
  --status pass|fail|error|skip|blocked|pending  default: pass
  --duration-ms N                 execution time
  --error <text>                  error output
  --notes <text>                  notes

Report options:
  --format text|json|markdown     default: text
  --target supabase|supaflare     filter by target
  --v1-scope in_scope|skip_v1|all default: in_scope

List options:
  --category DATA|AUTH|STORAGE
  --subcategory <name>
  --status pass|fail|pending|...
  --target supabase|supaflare
  --format text|json|csv          default: text
`;

const commands = {
    init: () => cmdInit(db),
    add: () => cmdAdd(db, args),
    list: () => cmdList(db, args),
    run: () => cmdRun(db, args),
    report: () => cmdReport(db, args),
    status: () => cmdStatus(db, args),
    seed: () => cmdSeed(db),
    delete: () => cmdDelete(db, args),
    export: () => cmdExport(db, args),
    help: () => console.log(helpText),
};

const cmd = args._ || 'help';
if (commands[cmd]) {
    await commands[cmd]();
} else {
    console.log(`Unknown command: ${cmd}`);
    console.log(helpText);
}

db.close();


