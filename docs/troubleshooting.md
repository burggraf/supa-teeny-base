# Troubleshooting

Common issues and solutions when using Teenybase.

---

## Connection & Network

**`Could not connect to https://api.teenybase.work`** — Check internet: `curl https://api.teenybase.work/health`. If behind a VPN or corporate proxy, ask IT to allowlist `*.teenybase.work`. In Docker/CI with broken DNS, set `AUTO_DNS=1` (uses 1.1.1.1/8.8.8.8 — breaks VPNs, only for containers). Debug with `DNS_DEBUG=1`.

**`Request timed out` during login/register** — Retry. If persistent, check connection latency. Disconnect VPN temporarily to test.

**`Warning: credentials point to localhost`** — You previously logged into a local dev server. Run `teeny login` to switch to production.

---

## Authentication

**`Not logged in`** — Run `teeny register` or `teeny login`. Credentials stored at `~/.teenybase/credentials.json`.

**`Session expired`** — Token expired and auto-refresh failed. Run `teeny login`.

**`Invalid or expired token` (401)** — JWT verification failed. Run `teeny login`. Check `teeny whoami` to verify you're on the right server.

**`Credentials missing userId`** — Old CLI version. Run `teeny login` to refresh credentials.

**`account_id "tb-..." requires credentials`** — Your wrangler.jsonc has a Teenybase Cloud account ID but no saved credentials. Run `teeny login`.

---

## Email Verification

**`Email not verified` (403)** — Check inbox (and spam) for verification email. Click the link, then retry deploy. If email missing, run `teeny login` and press `R` to resend.

**Verification link expired** — Run `teeny login`, press `R` to resend a fresh link.

**Verification email not received** — Check spam. Wait a few minutes. Press `R` to resend. Try a different email (Gmail works reliably). Corporate email may block external senders.

---

## Registration & Login

**Email already exists** — Run `teeny login` instead of `teeny register`.

**Username taken** — Choose a different username.

**Password too short** — Use 8+ characters.

**Passwords don't match** — Re-enter the same password in both fields.

**`Auth failed (401)`** — Wrong email/password. Note: email normalization applies (`User+tag@Gmail.com` → `user@gmail.com`).

**`Server returned invalid response`** — Server may be down. Check `curl https://api.teenybase.work/health`. Verify server URL with `teeny whoami`.

---

## Deploy Failures

**`No wrangler config file found`** — Run `teeny init` to scaffold, or create `wrangler.jsonc` manually.

**`No config file found`** — Run `teeny init` to generate `teenybase.ts`.

**`No databases found in wrangler config`** — Add a D1 binding to wrangler.jsonc:
```jsonc
"d1_databases": [{ "binding": "PRIMARY_DB", "database_name": "my-db", "database_id": "TEENY_AUTO_CREATE" }]
```

**`Database binding PRIMARY_DB not found`** — Rename your binding to `PRIMARY_DB`, or pass `--db YOUR_NAME` to all commands.

**`No worker name found`** — Add `"name": "my-app"` to wrangler.jsonc.

**`bucket_not_found [code: 10085]`** — Create the R2 bucket: `wrangler r2 bucket create BUCKET_NAME` or use `TEENY_AUTO_CREATE`.

**`Resource already exists`** — Change the `database_name` or bucket name to something unique.

**`Unable to deploy worker`** — Read the wrangler error output above this message. Run `teeny build` for detailed build errors.

**`Failed to set up database` after deploy** — First deploys need time for secret/DNS propagation. The CLI retries automatically. If all retries fail, wait a minute and run `teeny deploy --remote` again.

**`Unable to deploy secrets`** — Ensure the worker exists first. Check `wrangler login` (self-hosted) or `teeny login` (managed).

**`Admin token not found in secrets file`** — Add `ADMIN_SERVICE_TOKEN=value` to `.dev.vars` or `.prod.vars`.

**`Migrations folder has been modified`** — Run with `--clean` to reset: `teeny deploy --local --clean`.

**Cannot export with FTS5 (remote)** — Known Cloudflare bug ([workers-sdk#9519](https://github.com/cloudflare/workers-sdk/issues/9519)). Remote export with FTS5 locks the DB for hours. Workaround: drop FTS, export, re-add FTS. Local export works fine.

---

## Local Development

**`No local persist config found`** — Run `teeny deploy --local` before `teeny dev`.

**Port in use** — Stop other processes on port 8787, or set `TEENY_DEV_PORT=9090`.

**Build failure** — Run `teeny build` to see detailed errors. Check TypeScript for issues.

**`Unable to resolve virtual:teenybase`** — Run `teeny init` to add the path alias, or add manually to tsconfig.json: `"paths": { "virtual:teenybase": ["./teenybase"] }`.

**`Remote dev server not supported`** — Always use `teeny dev` (it runs locally automatically).

---

## Version & Compatibility

**Node.js** — Requires 18+. Check with `node --version`.

**Wrangler** — Requires v4+. Update: `npm install wrangler@latest`.

**Native binary mismatch** — After switching between macOS/Linux, run `npm install` to get correct platform binaries.

**Alpine/musl** — workerd needs glibc. Run `bash scripts/fix-alpine-workerd.sh` to patch. Re-run after `npm install`.

---

## Config Errors

**`Config must export or return an object`** — Your `teenybase.ts` needs `export default { ... } satisfies DatabaseSettings`.

**`Failed to load config`** — Syntax error or missing import in teenybase.ts. Run `npx tsc --noEmit` to check.

**Invalid project name** — Use lowercase alphanumeric + hyphens/dots/underscores only.

**Unknown template** — Use `--template with-auth` or `--template blank`.

---

## CRUD & API Errors

**Insert returns empty `[]`** — Three possible causes:
1. Missing `values` wrapper: send `{"values": {"title": "x"}}` not `{"title": "x"}`
2. `createRule` rejected the insert (silently filtered by CTE WHERE clause)
3. Missing `"returning": "*"` — without it, inserts don't return data

**`Cannot insert {field} field` (403)** — Field has `noInsert: true`. Remove it from request body — it's auto-managed.

**UNIQUE constraint failed** — A record with that value already exists. Use a different value.

**NOT NULL constraint failed** — Required field missing. Include it with a non-null value.

**`Error parsing INSERT/SELECT data`** — Invalid query syntax. Check `data.error` in response. Common: `&&` should be `&`, `===` should be `==`, `||` (OR) should be `|`.

**Edit endpoint format** — `/edit/:id` takes bare fields `{"title": "x"}`, NOT `{"setValues": {...}}`. Use `returning` and `or` as query params.

---

## Rule & Access Errors

**`Forbidden` (403)** — The rule is `null` (the default = admin only). Set it to `"true"` for public, or an expression like `"auth.uid == id"`.

**Insert silently returns `[]`** — `createRule` filtered the insert. Ensure data satisfies the rule. For sign-up tables, use `createRule: "true"`.

**`Not Found` (404) on existing record** — `viewRule`/`listRule` filtered it out. The user's `auth.uid` doesn't match the rule condition.

---

## Auth Runtime Errors

**`Invalid username or password`** — Wrong credentials. Email normalization applies: `User+tag@Gmail.com` → `user@gmail.com`.

**`Invalid session` on refresh** — Refresh token expired (7 days), already used (single-use), or password changed (invalidates all sessions). Log in again.

**`Invalid Configuration` (500)** — Missing required field usages. Auth table needs at minimum: `record_uid`, `auth_username`, `auth_password`. Use `baseFields` + `authFields` scaffolds.

**`Invalid email domain`** — Disposable email provider blocked (mailinator, yopmail, etc.). Use a real email.

**OAuth `CSRF token mismatch`** — Cookie expired (10 min) or blocked. Retry the OAuth flow with cookies enabled.

**`Email not configured` (500)** — No `email` section in teenybase.ts. Add Resend or Mailgun config.

**`Verification/reset email already sent`** — Rate limited (2 min cooldown). Wait and retry.

---

## Query & Expression Errors

**Expression syntax mistakes:**
- `&&` → use `&` (AND)
- `||` for OR → use `|` (`||` is string concatenation)
- `===` → use `==`
- `=` vs `==`: `=` is SQL `=` (not null-safe), `==` is SQL `IS` (null-safe). Use `==` when comparing with `null` or when null values are possible
- Unquoted strings: `status == published` → `status == 'published'`

**FTS errors** — `@@` operator requires `fullTextSearch` configured on the table. Run migrations after adding it.

---

## Cloudflare Platform Limits

| Resource | Free | Paid ($5/mo) |
|---|---|---|
| Requests/day | 100,000 | 10M+ |
| Worker size (compressed) | 3 MB | 10 MB |
| CPU time/request | 10 ms | 30 s (up to 5 min) |
| D1 database size | 500 MB | 10 GB (hard cap) |
| D1 queries/request | 50 | 1,000 |
| D1 row reads/day | 5M | 50B |
| D1 row writes/day | 100K | 50M |
| R2 storage | 10 GB | $0.015/GB |
| R2 Class A ops/mo | 1M | $4.50/M |
| R2 Class B ops/mo | 10M | $0.36/M |
| Subrequests/request | 50 | 1,000 |

**Worker bundle too large** — Reduce dependencies. Check for accidentally bundled large packages. Use `teeny build` to see the output size.

**D1 size limit (10 GB)** — Hard cap, cannot be increased. Archive old data or use R2 for large blobs.

**D1 query timeout (30s)** — Optimize queries. Add indexes for filtered columns. Reduce result set size with `limit`.

---

## D1 Known Issues

**FTS5 export bug** — Remote D1 export with FTS5 virtual tables locks the database for hours. Teenybase blocks this automatically. Workaround: drop FTS, export, re-add. Tracked: [workers-sdk#9519](https://github.com/cloudflare/workers-sdk/issues/9519).

**Read replication lag** — D1 read replicas may return stale data. For consistency-critical reads, use the Sessions API or write+read in the same request.

**Single-writer bottleneck** — D1 has one write region. High write throughput may hit `D1_ERROR: database is locked`. Batch writes and avoid concurrent mutations.

---

## Logs & Observability

**No logs appearing** — Cloudflare has a ~1-2 minute ingestion delay. Make requests to your worker, wait 1-2 minutes, then check again. Ensure `observability.enabled` is `true` in wrangler.jsonc (generated by default with `teeny init`).

**`No Cloudflare credentials found`** — Self-hosted mode requires `CLOUDFLARE_API_TOKEN` env var. Create an API token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with Workers:Read permission.

**`Not logged in`** — Managed mode requires `teeny login` first.

**`Worker not found` (404)** — The worker name doesn't match any deployed worker. Check `teeny list` or pass the correct name: `teeny logs my-app`.

**`Session expired`** — The logs session token expires after 1 hour. Run `teeny logs` again to reconnect.

**`Authentication failed`** — API token may be invalid or missing Workers:Read scope. Regenerate at Cloudflare dashboard.

**Logs appear out of order** — Events within the same request are grouped and sorted, but events across requests may arrive out of order due to distributed ingestion. This is normal.

---

## Docker & CI

**workerd on Alpine** — Needs glibc. Run `bash scripts/fix-alpine-workerd.sh`. Re-run after `npm install`.

**GitHub Actions** — Use `ubuntu-latest` + Node 20+. Alpine runners need the workerd fix.

**Miniflare in CI** — Set `NODE_ENV=test`. Local D1 state is ephemeral per test run.

---

## Self-Hosted vs Teenybase Cloud

| | Teenybase Cloud | Self-Hosted |
|---|---|---|
| Setup | `teeny register` + `teeny deploy` | `wrangler login` + create D1 + configure |
| Cost | Free tier, no credit card | Cloudflare Workers paid plan ($5/mo) |
| Control | Managed by us | Full control, your CF account |
| Custom domains | Not yet (planned) | Yes, via wrangler config |

**Switching between them** — Zero code changes. Only wrangler.jsonc `account_id` differs (`tb-{userId}` for managed, your CF account ID for self-hosted).

---

**See also:** [Getting Started](getting-started.md) | [CLI Reference](cli.md) | [Configuration Reference](config-reference.md) | [Cost Breakdown](cost-breakdown.md)
