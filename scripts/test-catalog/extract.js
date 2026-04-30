// Automated test catalog extractor — extracts ALL tabs from the Supabase JS reference mega-page.
// The Supabase docs use a single mega-page with all API methods; different URLs just scroll to sections.
// This extracts every section+tab, categorizes it, and creates catalog entries.
//
// Usage: node extract.js [--dry-run] [--category DATA] [--click-tabs]
//   --click-tabs: click each tab to extract code/data/response content

import Database from 'better-sqlite3';
import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'test-catalog.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

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

// ============================================================
// Section → Category + Subcategory mapping
// Only sections listed here are extracted; others are skipped.
// ============================================================
const SECTION_MAP = {
    // DATA — Fetch data
    'Fetch data':                { cat: 'DATA', sub: 'select', pri: 'P0' },
    'Insert data':               { cat: 'DATA', sub: 'crud', pri: 'P0' },
    'Update data':               { cat: 'DATA', sub: 'crud', pri: 'P0' },
    'Upsert data':               { cat: 'DATA', sub: 'crud', pri: 'P0' },
    'Delete data':               { cat: 'DATA', sub: 'crud', pri: 'P0' },
    'Call a Postgres function':  { cat: 'DATA', sub: 'rpc', pri: 'P2', scope: 'skip_v1' },
    'Using filters':             { cat: 'DATA', sub: 'filters', pri: 'P0' },
    'Column is equal to a value':        { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'eq' },
    'Column is not equal to a value':    { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'neq' },
    'Column is greater than a value':    { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'gt' },
    'Column is greater than or equal to a value': { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'gte' },
    'Column is less than a value':       { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'lt' },
    'Column is less than or equal to a value': { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'lte' },
    'Column matches a pattern':          { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'like' },
    'Column matches a case-insensitive pattern': { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'ilike' },
    'Column is a value':                { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'is' },
    'Column is in an array':            { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'in' },
    'Column contains every element in a value': { cat: 'DATA', sub: 'filters', pri: 'P1', op: 'contains' },
    'Contained by value':               { cat: 'DATA', sub: 'filters', pri: 'P1', op: 'containedby' },
    'Greater than a range':             { cat: 'DATA', sub: 'filters', pri: 'P1', scope: 'skip_v1', op: 'rangeGt' },
    'Greater than or equal to a range': { cat: 'DATA', sub: 'filters', pri: 'P1', scope: 'skip_v1', op: 'rangeGte' },
    'Less than a range':               { cat: 'DATA', sub: 'filters', pri: 'P1', scope: 'skip_v1', op: 'rangeLt' },
    'Less than or equal to a range':   { cat: 'DATA', sub: 'filters', pri: 'P1', scope: 'skip_v1', op: 'rangeLte' },
    'Mutually exclusive to a range':   { cat: 'DATA', sub: 'filters', pri: 'P1', scope: 'skip_v1', op: 'rangeAdjacent' },
    'With a common element':            { cat: 'DATA', sub: 'filters', pri: 'P1', op: 'overlaps' },
    'Match a string':                   { cat: 'DATA', sub: 'filters', pri: 'P1', op: 'textSearch' },
    'Match an associated value':        { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'match' },
    "Don't match the filter":           { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'not' },
    'Match at least one filter':        { cat: 'DATA', sub: 'filters', pri: 'P0', op: 'or' },
    'Match the filter':                 { cat: 'DATA', sub: 'filters', pri: 'P2', op: 'filter' },
    'Return data after inserting':      { cat: 'DATA', sub: 'modifiers', pri: 'P0' },
    'Order the results':               { cat: 'DATA', sub: 'modifiers', pri: 'P0' },
    'Limit the number of rows returned': { cat: 'DATA', sub: 'modifiers', pri: 'P0' },
    'Limit the query to a range':       { cat: 'DATA', sub: 'modifiers', pri: 'P0' },
    'Set an abort signal':             { cat: 'DATA', sub: 'modifiers', pri: 'P2' },
    'Retrieve one row of data':         { cat: 'DATA', sub: 'modifiers', pri: 'P0' },
    'Retrieve zero or one row of data': { cat: 'DATA', sub: 'modifiers', pri: 'P0' },
    'Retrieve as a CSV':                { cat: 'DATA', sub: 'modifiers', pri: 'P1' },
    'Strip null values':               { cat: 'DATA', sub: 'modifiers', pri: 'P2' },
    'Override type of successful response': { cat: 'DATA', sub: 'modifiers', pri: 'P2' },
    'Partially override or replace type of successful response': { cat: 'DATA', sub: 'modifiers', pri: 'P2' },
    'Using explain':                   { cat: 'DATA', sub: 'modifiers', pri: 'P2' },

    // AUTH — Auth section
    'Overview':                    { cat: 'AUTH', sub: 'overview', pri: 'P1' },
    'Create a new user':           { cat: 'AUTH', sub: 'signup', pri: 'P0' },
    'Listen to auth events':       { cat: 'AUTH', sub: 'events', pri: 'P0' },
    'Create an anonymous user':    { cat: 'AUTH', sub: 'signin', pri: 'P1' },
    'Sign in a user':              { cat: 'AUTH', sub: 'signin', pri: 'P0' },
    'Sign in with ID token (native sign-in)': { cat: 'AUTH', sub: 'signin', pri: 'P2', scope: 'v2' },
    'Sign in a user through OTP':  { cat: 'AUTH', sub: 'otp', pri: 'P0' },
    'Sign in a user through OAuth': { cat: 'AUTH', sub: 'oauth', pri: 'P2', scope: 'v2' },
    'Sign in a user through SSO':  { cat: 'AUTH', sub: 'sso', pri: 'P2', scope: 'v2' },
    'Sign in a user through Web3 (Solana, Ethereum)': { cat: 'AUTH', sub: 'web3', pri: 'P2', scope: 'v2' },
    'Sign in with a passkey':      { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1' },
    'Register a passkey':          { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1' },
    'Get user claims from verified JWT': { cat: 'AUTH', sub: 'jwt', pri: 'P1' },
    'Sign out a user':             { cat: 'AUTH', sub: 'user', pri: 'P0' },
    'Send a password reset request': { cat: 'AUTH', sub: 'recovery', pri: 'P0' },
    'Verify and log in through OTP': { cat: 'AUTH', sub: 'otp', pri: 'P0' },
    'Retrieve a session':          { cat: 'AUTH', sub: 'session', pri: 'P0' },
    'Retrieve a new session':      { cat: 'AUTH', sub: 'session', pri: 'P0' },
    'Retrieve a user':             { cat: 'AUTH', sub: 'user', pri: 'P0' },
    'Update a user':               { cat: 'AUTH', sub: 'user', pri: 'P0' },
    'Retrieve identities linked to a user': { cat: 'AUTH', sub: 'identities', pri: 'P2', scope: 'v2' },
    'Link an identity to a user':  { cat: 'AUTH', sub: 'identities', pri: 'P2', scope: 'v2' },
    'Unlink an identity from a user': { cat: 'AUTH', sub: 'identities', pri: 'P2', scope: 'v2' },
    'Send a password reauthentication nonce': { cat: 'AUTH', sub: 'user', pri: 'P1' },
    'Resend an OTP':               { cat: 'AUTH', sub: 'otp', pri: 'P1' },
    'Set the session data':        { cat: 'AUTH', sub: 'session', pri: 'P0' },
    'Exchange an auth code for a session': { cat: 'AUTH', sub: 'pkce', pri: 'P0' },
    'Start auto-refresh session (non-browser)': { cat: 'AUTH', sub: 'session', pri: 'P2' },
    'Stop auto-refresh session (non-browser)': { cat: 'AUTH', sub: 'session', pri: 'P2' },
    'Initialize client session':   { cat: 'AUTH', sub: 'session', pri: 'P2' },

    // AUTH — MFA (skip_v1)
    'Enroll a factor':             { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },
    'Create a challenge':          { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },
    'Verify a challenge':          { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },
    'Create and verify a challenge': { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },
    'Unenroll a factor':           { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },
    'Get Authenticator Assurance Level': { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },
    'List all factors for current user': { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1' },

    // AUTH — Passkey Admin (skip_v1)
    'List passkeys':               { cat: 'AUTH', sub: 'passkey-admin', pri: 'P2', scope: 'skip_v1' },
    'Update a passkey':            { cat: 'AUTH', sub: 'passkey-admin', pri: 'P2', scope: 'skip_v1' },
    'Delete a passkey':            { cat: 'AUTH', sub: 'passkey-admin', pri: 'P2', scope: 'skip_v1' },
    'Start passkey registration':  { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1' },
    'Verify passkey registration': { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1' },
    'Start passkey authentication': { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1' },
    'Verify passkey authentication': { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1' },

    // OAuth Server (skip_v1)
    'Get authorization details':   { cat: 'AUTH', sub: 'oauth-server', pri: 'P2', scope: 'skip_v1' },
    'Approve authorization':       { cat: 'AUTH', sub: 'oauth-server', pri: 'P2', scope: 'skip_v1' },
    'Deny authorization':          { cat: 'AUTH', sub: 'oauth-server', pri: 'P2', scope: 'skip_v1' },
    'List grants':                 { cat: 'AUTH', sub: 'oauth-server', pri: 'P2', scope: 'skip_v1' },
    'Revoke grant':                { cat: 'AUTH', sub: 'oauth-server', pri: 'P2', scope: 'skip_v1' },

    // Section groupings (no tabs, just headings)
    'Auth':                        { cat: 'AUTH', sub: 'overview', pri: 'P1', group: true },
    'Auth Admin':                  { cat: 'AUTH', sub: 'admin', pri: 'P0', group: true },
    'Auth MFA':                    { cat: 'AUTH', sub: 'mfa', pri: 'P2', scope: 'skip_v1', group: true },
    'Auth Passkey':                { cat: 'AUTH', sub: 'passkey', pri: 'P2', scope: 'skip_v1', group: true },
    'Passkey Admin':               { cat: 'AUTH', sub: 'passkey-admin', pri: 'P2', scope: 'skip_v1', group: true },
    'OAuth Server':                { cat: 'AUTH', sub: 'oauth-server', pri: 'P2', scope: 'skip_v1', group: true },
    'OAuth Admin':                 { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1', group: true },
    'Edge Functions':              { cat: 'DATA', sub: 'edge-functions', pri: 'P2', scope: 'skip_v1', group: true },
    'Realtime':                    { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1', group: true },
    'Storage':                     { cat: 'STORAGE', sub: 'buckets', pri: 'P1', group: true },
    'Analytics Buckets':           { cat: 'STORAGE', sub: 'analytics', pri: 'P2', scope: 'skip_v1', group: true },
    'Vector Buckets':              { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1', group: true },
    'Using modifiers':             { cat: 'DATA', sub: 'modifiers', pri: 'P0', group: true },

    // AUTH — Admin (subsections under "Auth Admin" grouping)
    'Retrieve a user':             { cat: 'AUTH', sub: 'admin', pri: 'P0', suffix: '-admin' },
    'List all users':              { cat: 'AUTH', sub: 'admin', pri: 'P0' },
    'Create a user':               { cat: 'AUTH', sub: 'admin', pri: 'P0' },
    'Delete a user':               { cat: 'AUTH', sub: 'admin', pri: 'P0' },
    'Send an email invite link':   { cat: 'AUTH', sub: 'admin', pri: 'P0' },
    'Generate an email link':      { cat: 'AUTH', sub: 'admin', pri: 'P0' },
    'Update a user':               { cat: 'AUTH', sub: 'admin', pri: 'P0', suffix: '-admin' },
    'Sign out a user (admin)':     { cat: 'AUTH', sub: 'admin', pri: 'P1' },
    'Delete a factor for a user':  { cat: 'AUTH', sub: 'admin-mfa', pri: 'P2', scope: 'skip_v1' },
    'List all factors for a user (admin)': { cat: 'AUTH', sub: 'admin-mfa', pri: 'P2', scope: 'skip_v1' },

    // Passkey Admin
    'List passkeys for a user':    { cat: 'AUTH', sub: 'passkey-admin', pri: 'P2', scope: 'skip_v1' },
    'Delete a passkey':            { cat: 'AUTH', sub: 'passkey-admin', pri: 'P2', scope: 'skip_v1' },

    // OAuth Admin (skip_v1)
    'List OAuth clients':          { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1' },
    'Get OAuth client':            { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1' },
    'Create OAuth client':         { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1' },
    'Update OAuth client':         { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1' },
    'Delete OAuth client':         { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1' },
    'Regenerate client secret':    { cat: 'AUTH', sub: 'oauth-admin', pri: 'P2', scope: 'skip_v1' },

    // Edge Functions (skip_v1)
    'Invokes a Supabase Edge Function.': { cat: 'DATA', sub: 'edge-functions', pri: 'P2', scope: 'skip_v1' },
    'CORS headers for Edge Functions': { cat: 'DATA', sub: 'edge-functions', pri: 'P2', scope: 'skip_v1' },
    'Update authorization token':  { cat: 'DATA', sub: 'edge-functions', pri: 'P2', scope: 'skip_v1' },

    // Realtime (skip_v1)
    'Subscribe to channel':        { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1' },
    'Unsubscribe from a channel':  { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1' },
    'Unsubscribe from all channels': { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1' },
    'Retrieve all channels':       { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1' },
    'Broadcast a message':         { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1' },
    'Set authentication token':    { cat: 'DATA', sub: 'realtime', pri: 'P2', scope: 'skip_v1' },

    // STORAGE
    'File Buckets':                { cat: 'STORAGE', sub: 'buckets', pri: 'P1' },
    'Access a storage bucket':     { cat: 'STORAGE', sub: 'buckets', pri: 'P1' },
    'List all buckets':            { cat: 'STORAGE', sub: 'buckets', pri: 'P0' },
    'Retrieve a bucket':           { cat: 'STORAGE', sub: 'buckets', pri: 'P0' },
    'Create a bucket':             { cat: 'STORAGE', sub: 'buckets', pri: 'P0' },
    'Empty a bucket':              { cat: 'STORAGE', sub: 'buckets', pri: 'P0' },
    'Update a bucket':             { cat: 'STORAGE', sub: 'buckets', pri: 'P0' },
    'Delete a bucket':             { cat: 'STORAGE', sub: 'buckets', pri: 'P0' },
    'Upload a file':               { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Replace an existing file':    { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Move an existing file':       { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Copy an existing file':       { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Create a signed URL':         { cat: 'STORAGE', sub: 'signed-urls', pri: 'P0' },
    'Create signed URLs':          { cat: 'STORAGE', sub: 'signed-urls', pri: 'P0' },
    'Create signed upload URL':    { cat: 'STORAGE', sub: 'signed-urls', pri: 'P0' },
    'Upload to a signed URL':      { cat: 'STORAGE', sub: 'signed-urls', pri: 'P0' },
    'Retrieve public URL':         { cat: 'STORAGE', sub: 'public', pri: 'P1' },
    'Download a file':             { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Delete files in a bucket':    { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'List all files in a bucket':  { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Check if file exists':        { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Get file metadata':           { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'List files (v2)':             { cat: 'STORAGE', sub: 'objects', pri: 'P0' },
    'Convert file to base64':      { cat: 'STORAGE', sub: 'public', pri: 'P2' },

    // Analytics/Vector buckets (skip_v1 — newer features)
    'Access an analytics bucket':  { cat: 'STORAGE', sub: 'analytics', pri: 'P2', scope: 'skip_v1' },
    'Create a new analytics bucket': { cat: 'STORAGE', sub: 'analytics', pri: 'P2', scope: 'skip_v1' },
    'List analytics buckets':      { cat: 'STORAGE', sub: 'analytics', pri: 'P2', scope: 'skip_v1' },
    'Delete an analytics bucket':  { cat: 'STORAGE', sub: 'analytics', pri: 'P2', scope: 'skip_v1' },
    'Access a vector bucket':      { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Create a vector bucket':      { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Delete a vector bucket':      { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Retrieve a vector bucket':    { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'List all vector buckets':     { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Create a vector index':       { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Delete a vector index':       { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Retrieve a vector index':     { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'List all vector indexes':     { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Access a vector index':       { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Delete vectors from index':   { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Retrieve vectors from index': { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'List vectors in index':       { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Add vectors to index':        { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
    'Search vectors in index':     { cat: 'STORAGE', sub: 'vector', pri: 'P2', scope: 'skip_v1' },
};

function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const clickTabs = args.includes('--click-tabs');
    const categoryFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];

    const db = getDb();
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('→ Loading Supabase JS reference mega-page...');
    await page.goto('https://supabase.com/docs/reference/javascript/select', { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // Extract all h2 headings and their tabs
    const sections = await page.evaluate(() => {
        const results = [];
        const h2s = document.querySelectorAll('h2');
        for (const h2 of h2s) {
            const heading = h2.textContent.trim().replace(/#+$/, '').trim();
            if (!heading) continue;

            const tabs = [];
            let el = h2.nextElementSibling;
            while (el && el.tagName !== 'H2') {
                const tabEls = el.querySelectorAll('[role="tab"]');
                for (const tab of tabEls) {
                    const name = tab.textContent.trim();
                    if (name && !tabs.includes(name)) tabs.push(name);
                }
                el = el.nextElementSibling;
            }
            results.push({ heading, tabs });
        }
        return results;
    });

    console.log(`  Found ${sections.length} h2 sections`);

    const insert = db.prepare(`
        INSERT OR IGNORE INTO test_catalog 
            (category, subcategory, operation, title, description, source_url, priority, v1_scope, test_code, data_source, expected_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let totalAdded = 0;
    let totalSkipped = 0;
    let unknownSections = new Set();

    for (const section of sections) {
        const mapping = SECTION_MAP[section.heading];
        if (!mapping) {
            unknownSections.add(section.heading);
            continue;
        }
        if (categoryFilter && mapping.cat !== categoryFilter) continue;

        const scope = mapping.scope || 'in_scope';
        const priority = mapping.pri || 'P1';

        if (section.tabs.length === 0) {
            const slug = slugify(section.heading);
            const opSlug = mapping.op ? slugify(mapping.op) : slug;
            const result = insert.run(mapping.cat, mapping.sub, opSlug, section.heading, null,
                'https://supabase.com/docs/reference/javascript/select', priority, scope, null, null, null);
            if (result.changes > 0) {
                console.log(`  + [${mapping.cat}/${mapping.sub}] "${section.heading}" (no tabs)`);
                totalAdded++;
            }
        } else {
            for (const tab of section.tabs) {
                const opSuffix = mapping.op ? `-${mapping.op}` : '';
                const opSlug = slugify(`${tab}${opSuffix}`);
                const title = mapping.suffix ? `${section.heading} (${mapping.suffix}): ${tab}` :
                              tab === section.heading ? tab : `${section.heading}: ${tab}`;

                // If section has an explicit op and only 1 tab, use the op as operation name
                const finalOp = (mapping.op && section.tabs.length === 1) ? slugify(mapping.op) : opSlug;

                const result = insert.run(mapping.cat, mapping.sub, finalOp, title, tab,
                    'https://supabase.com/docs/reference/javascript/select', priority, scope, null, null, null);
                if (result.changes > 0) {
                    console.log(`  + [${mapping.cat}/${mapping.sub}] "${section.heading}" → "${tab}"`);
                    totalAdded++;
                } else {
                    totalSkipped++;
                }
            }
        }
    }

    await browser.close();

    // Summary
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  EXTRACTION COMPLETE`);
    console.log(`${'═'.repeat(70)}`);

    const total = db.prepare('SELECT count(*) as c FROM test_catalog').get().c;
    const inScope = db.prepare("SELECT count(*) as c FROM test_catalog WHERE v1_scope='in_scope'").get().c;
    const skipV1 = db.prepare("SELECT count(*) as c FROM test_catalog WHERE v1_scope='skip_v1'").get().c;
    const v2 = db.prepare("SELECT count(*) as c FROM test_catalog WHERE v1_scope='v2'").get().c;

    console.log(`  Total: ${total}  |  in_scope: ${inScope}  |  skip_v1: ${skipV1}  |  v2: ${v2}`);
    console.log(`  Newly added: ${totalAdded}  |  Already existed: ${totalSkipped}`);

    if (unknownSections.size > 0) {
        console.log(`\n  Unknown sections (not mapped, skipped):`);
        for (const s of [...unknownSections].sort()) {
            console.log(`    - "${s}"`);
        }
    }

    console.log('');
    const breakdown = db.prepare(`
        SELECT category, subcategory, count(*) as total,
               sum(CASE WHEN v1_scope='in_scope' THEN 1 ELSE 0 END) as in_scope,
               sum(CASE WHEN v1_scope='skip_v1' THEN 1 ELSE 0 END) as skip_v1,
               sum(CASE WHEN v1_scope='v2' THEN 1 ELSE 0 END) as v2
        FROM test_catalog GROUP BY category, subcategory ORDER BY category, subcategory
    `).all();
    let lastCat = '';
    for (const row of breakdown) {
        if (row.category !== lastCat) { console.log(`  ${row.category}:`); lastCat = row.category; }
        console.log(`    ${row.subcategory}: ${row.total} (${row.in_scope} in_scope, ${row.skip_v1} skip, ${row.v2} v2)`);
    }

    db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
