# CLI Reference

Teenybase ships a CLI called `teeny` (alias: `teenybase`).

```bash
npx teeny <command> [options]
```

---

## Global Options

These apply to most commands (generate, deploy, secrets, backup, build, exec). `--local`/`--remote` only apply to commands that accept a target. `dev` always runs locally.

| Option | Description |
|--------|-------------|
| `-c, --config <file>` | Use a specific teenybase config file |
| `-w, --wrangler <file>` | Use a specific wrangler config file |
| `--db <name>` | D1 database binding name (default: `PRIMARY_DB`) |
| `--local` | Use local database |
| `--remote` | Use remote (production) database |
| `-l, --logLevel <level>` | `info`, `warn`, `error`, or `silent` |
| `-d, --debug [feat]` | Show debug logs |
| `-f, --filter <filter>` | Filter debug logs |
| `--root <root>` | Project root directory (default: current directory) |

---

## Project Setup

### `create <name>`

Create a new teenybase project.

```bash
teeny create my-app
teeny create my-app --template blank --yes
```

| Option | Default | Description |
|--------|---------|-------------|
| `-t, --template <template>` | `with-auth` | `with-auth` or `blank` |
| `-y, --yes` | false | Skip prompts, use defaults |

Creates a directory, scaffolds the project, and runs `npm install`.

### `init`

Initialize teenybase in the current directory. Only creates files that don't already exist — never overwrites.

```bash
teeny init
teeny init --template blank
```

| Option | Default | Description |
|--------|---------|-------------|
| `-t, --template <template>` | `with-auth` | `with-auth` or `blank` |
| `-y, --yes` | false | Skip prompts, use defaults |

**Generated files:** `package.json`, `wrangler.jsonc`, `tsconfig.json`, `teenybase.ts`, `src/index.ts`, `worker-configuration.d.ts`, `.dev.vars`, `.gitignore`, `migrations/`

**Templates:**
- **`with-auth`** — Users table with auth (sign-up, login, JWT) and row-level security. Includes common fields (id, created, updated, username, email, password).
- **`blank`** — Empty tables. Good for starting from scratch or adding teenybase to an existing project.

---

## Development Workflow

### `deploy`

Apply migrations and deploy. This is the main command for both local development and production.

```bash
teeny deploy --local              # apply migrations locally
teeny deploy --local --yes        # skip confirmation
teeny deploy --remote             # deploy + migrate to production
teeny deploy --remote --no-migrate  # deploy worker only, skip migrations
```

| Option | Default | Description |
|--------|---------|-------------|
| `--deploy` | true | Deploy the worker (skipped in local mode) |
| `--migrate` | true | Apply new migrations |
| `--clean` | true | Re-download migrations before generating |
| `-y, --yes` | false | Skip confirmation prompts |

**First-time remote deploy** automatically:
1. Deploys a minimal config to capture the worker URL
2. Uploads secrets
3. Applies migrations
4. Deploys full config

> **Note:** `teeny migrate` is a deprecated alias for `teeny deploy`. If you have it in old scripts, update them.

### `generate`

Generate migration SQL files from config changes without deploying.

```bash
teeny generate --local
teeny generate --remote
```

| Option | Default | Description |
|--------|---------|-------------|
| `--clean` | true | Re-download migrations before generating |

Usually you don't need this separately — `deploy` runs generate automatically.

### `dev`

Start the local dev server.

```bash
teeny dev
```

**Prerequisite:** Run `teeny deploy --local` first to set up the local database.

**Environment variables:**
- `TEENY_DEV_PORT` — override dev server port (default: 8787)
- `TEENY_INSPECTOR_PORT` — override inspector port (default: 9229, useful for multiple dev servers)

> `dev` always runs locally. Passing `--remote` will error.

### `build`

Build the worker for production (dry-run deploy with minification).

```bash
teeny build --local
teeny build --remote --outDir ./output
```

| Option | Default | Description |
|--------|---------|-------------|
| `--outDir <dir>` | `dist` | Output directory |

### `exec <route>`

Execute an API route with the admin service token.

```bash
teeny exec users/select --local
teeny exec users/insert --local -m POST -d '{"values":{"name":"test"}}'
teeny exec users/select --local --explain
```

| Option | Default | Description |
|--------|---------|-------------|
| `-m, --method <method>` | GET | HTTP method |
| `-d, -b, --data, --body <body>` | — | Request body (JSON) |
| `-y, --yes` | false | Skip confirmation for non-GET requests |
| `-r, --raw` | false | Output raw response |
| `--explain` | false | Dry run — show SQL queries without executing |

The route is prefixed with `/api/v1/table/` (or `/api/v1/explain/table/` with `--explain`).

### `backup`

Backup the database.

```bash
teeny backup --local
teeny backup --remote
```

Creates a timestamped directory at `db_backups/{local|remote}/{db-binding}/{timestamp}/` containing the schema, data, config, and migration history.

> **Note:** Remote backup with FTS5 tables can lock the database for a long time. Consider backing up locally or during low-traffic periods.

### `secrets`

Manage worker secrets.

```bash
teeny secrets --remote              # list keys from .prod.vars
teeny secrets --remote --upload     # upload secrets from .prod.vars
```

| Option | Default | Description |
|--------|---------|-------------|
| `--upload` | false | Upload secrets from `.prod.vars` to the worker |
| `-y, --yes` | false | Skip confirmation |

Local mode doesn't need secret uploads — `.dev.vars` is read automatically by the dev server.

---

## Teenybase Cloud

Deploy without your own Cloudflare account. Run `register` or `login`, then use `deploy --remote` as usual.

### `register`

```bash
teeny register
teeny register --email user@example.com --password mypass
```

| Option | Default | Description |
|--------|---------|-------------|
| `--server <url>` | `https://api.teenybase.work` | Server URL |
| `--email <email>` | — | Email (skips prompt) |
| `--username <username>` | — | Username (default: derived from email) |
| `--password <pass>` | — | Password (skips prompt) |

### `login`

```bash
teeny login
teeny login --email user@example.com --password mypass
```

| Option | Default | Description |
|--------|---------|-------------|
| `--server <url>` | `https://api.teenybase.work` | Server URL |
| `--email <email>` | — | Email (skips prompt) |
| `--password <pass>` | — | Password (skips prompt) |

### `logout`

```bash
teeny logout
```

### `whoami`

Show the currently logged-in user.

```bash
teeny whoami
```

### `list`

List all your deployed workers.

```bash
teeny list
```

| Option | Default | Description |
|--------|---------|-------------|
| `--server <url>` | — | Server URL |

### `status [name]`

Show status of a deployed worker (URL, databases, last deploy time).

```bash
teeny status
teeny status my-app
```

| Option | Default | Description |
|--------|---------|-------------|
| `--server <url>` | — | Server URL |

If name is omitted, reads from `wrangler.jsonc` in the current directory.

### `delete [name]`

Delete a deployed worker and its databases.

```bash
teeny delete my-app
teeny delete my-app --yes
```

| Option | Default | Description |
|--------|---------|-------------|
| `--server <url>` | — | Server URL |
| `-y, --yes` | false | Skip confirmation |

---

## Observability

### `logs [name]`

Stream live logs from a deployed worker.

```bash
teeny logs                            # stream logs for current project
teeny logs my-app                     # stream logs for a specific worker
teeny logs --json                     # output raw JSON (newline-delimited)
teeny logs --since 1m --interval 5s   # look back 1 min, poll every 5s
teeny logs --limit 50                 # stop after 50 events (for CI)
```

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | false | Output raw JSON per event (NDJSON) |
| `--since <duration>` | `5m` | How far back to start (e.g. `30s`, `5m`, `1h`) |
| `--interval <duration>` | `8s` | Polling interval |
| `--overlap <duration>` | `1m` | Overlap window to catch delayed events |
| `--limit <n>` | — | Stop after N events (for CI/scripting) |
| `--server <url>` | — | Platform server URL (managed mode) |

**Self-hosted:** Requires `CLOUDFLARE_API_TOKEN` environment variable with Workers:Read permission. Create one at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).

**Teenybase Cloud:** Authenticates automatically using your login credentials.

> **Note:** Cloudflare has a ~1-2 minute ingestion delay. Logs from recent requests may take a moment to appear.

---

## Common Workflows

**New project — local development:**
```bash
teeny create my-app
cd my-app
teeny deploy --local --yes
teeny dev
```

**Schema change:**
```bash
# Edit teenybase.ts, then:
teeny deploy --local
# Test locally, then:
teeny deploy --remote
```

**First production deploy (Teenybase Cloud):**
```bash
teeny register
# Verify your email
teeny deploy --remote
```

**First production deploy (own Cloudflare account):**
```bash
# Ensure wrangler is logged in: npx wrangler login
teeny deploy --remote
```

**Reset local database:**
```bash
rm -rf .local-persist migrations
teeny deploy --local --yes
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "No local persist config found" | Run `teeny deploy --local` before `teeny dev` |
| "Remote dev server not supported" | `dev` runs locally automatically. Passing `--remote` is rejected. |
| "Email not verified" | Check your inbox after `teeny register` |
| "No config found to build" | Run `teeny deploy` before `teeny build` |
| Migrations won't generate | Check your `teenybase.ts` for syntax errors |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TEENY_DEV_PORT` | Override dev server port (default: 8787) |
| `TEENY_INSPECTOR_PORT` | Override inspector port (default: 9229) |
| `TEENYBASE_URL` | Override Teenybase Cloud server URL |
| `TEENYBASE_CREDENTIALS` | Custom credentials file path (useful for CI) |

---

## Key Files

| File | Purpose |
|------|---------|
| `teenybase.ts` | Your backend config — schema, auth, rules, actions |
| `.dev.vars` | Local development secrets (auto-generated) |
| `.prod.vars` | Production secrets (for `teeny secrets --upload`) |
| `wrangler.jsonc` | Cloudflare Workers config |
| `infra.jsonc` | CLI project config (API route, project settings) |
| `migrations/` | Auto-generated SQL files — don't edit manually |

---

**See also:** [Getting Started](getting-started.md) | [Configuration Reference](config-reference.md) | [API Endpoints](api-endpoints.md) | [Troubleshooting](troubleshooting.md)
