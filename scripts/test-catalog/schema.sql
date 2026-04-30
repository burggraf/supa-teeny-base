-- Supaflare Test Catalog Schema
-- Tracks all tests from DATA, AUTH, STORAGE categories
-- with results against real Supabase (reference) and Supaflare (our impl)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Master test catalog: one row per unique test case
CREATE TABLE IF NOT EXISTS test_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Classification
    category TEXT NOT NULL CHECK (category IN ('DATA', 'AUTH', 'STORAGE')),
    subcategory TEXT NOT NULL,          -- e.g. select, insert, filters, signup, signin, buckets, objects
    operation TEXT NOT NULL,             -- "sub-subcategory": specific op like eq, neq, createSignedUrl, upload

    -- Metadata
    title TEXT NOT NULL,                 -- human-readable: "Filter: column equals value (eq)"
    description TEXT,                    -- what this test verifies
    source_url TEXT,                     -- Supabase docs URL this was extracted from
    priority TEXT DEFAULT 'P1' CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
    v1_scope TEXT DEFAULT 'in_scope' CHECK (v1_scope IN ('in_scope', 'skip_v1', 'v2')),

    -- Test definition
    test_procedure TEXT,                 -- step-by-step procedure (markdown). NULL = inherit from subcategory default
    test_code TEXT,                      -- supabase-js call template
    data_source TEXT,                    -- SQL fixture ref or inline DDL/DML
    expected_response TEXT,              -- expected JSON response shape

    -- Timestamps
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    -- Uniqueness: same category/subcategory/operation/title = same test
    UNIQUE(category, subcategory, operation, title)
);

-- Test execution results: multiple runs per test (supabase reference + supaflare impl)
CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES test_catalog(id) ON DELETE CASCADE,
    target TEXT NOT NULL CHECK (target IN ('supabase', 'supaflare')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'pass', 'fail', 'error', 'skip', 'blocked', 'not_applicable')) DEFAULT 'pending',
    run_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    duration_ms INTEGER,
    error_output TEXT,                   -- failure/error details
    notes TEXT,                          -- run-specific notes

    UNIQUE(test_id, target)              -- one latest run per target (updated in place)
);

-- Shared test procedure templates (optional, referenced by test_catalog.test_procedure)
CREATE TABLE IF NOT EXISTS test_procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK (category IN ('DATA', 'AUTH', 'STORAGE')),
    subcategory TEXT NOT NULL,
    name TEXT NOT NULL,                  -- descriptive name: "integration-filter-test"
    description TEXT,                    -- what procedure does
    procedure_text TEXT NOT NULL,        -- markdown step-by-step
    UNIQUE(category, subcategory, name)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_catalog_category ON test_catalog(category);
CREATE INDEX IF NOT EXISTS idx_catalog_subcategory ON test_catalog(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_catalog_operation ON test_catalog(category, subcategory, operation);
CREATE INDEX IF NOT EXISTS idx_catalog_scope ON test_catalog(v1_scope);
CREATE INDEX IF NOT EXISTS idx_catalog_priority ON test_catalog(priority);
CREATE INDEX IF NOT EXISTS idx_runs_test ON test_runs(test_id);
CREATE INDEX IF NOT EXISTS idx_runs_target ON test_runs(target);
CREATE INDEX IF NOT EXISTS idx_runs_status ON test_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_status_target ON test_runs(status, target);
CREATE INDEX IF NOT EXISTS idx_procedures_category ON test_procedures(category, subcategory);
