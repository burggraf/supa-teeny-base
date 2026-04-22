<div align="center">

  <h1>Teenybase</h1>

  <!-- "A tiny backend for your next app" -->
  <p><strong>A <em>tiny</em> backend for 🫵 next app</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/teenybase"><img src="https://img.shields.io/npm/v/teenybase" alt="npm version" /></a>
    <a href="https://github.com/teenybase/teenybase/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="license" /></a>
  </p>

  <p>
    <a href="https://teenybase.com">Website</a> &nbsp;&bull;&nbsp;
    <a href="docs/getting-started.md">Docs</a> &nbsp;&bull;&nbsp;
    <a href="docs/why-teenybase.md">Why Teenybase</a>
  </p>

</div>

One config file. REST API, auth, row-level security, auto-migrations, OpenAPI docs, admin panel. Serverless on the edge. Free to start.

## Your Entire Backend

```typescript
// teenybase.ts — this is your entire backend
import { DatabaseSettings, TableAuthExtensionData, TableRulesExtensionData, sqlValue } from 'teenybase'
import { baseFields, authFields, createdTrigger, updatedTrigger } from 'teenybase/scaffolds/fields'

export default {
  appUrl: 'http://localhost:8787',
  jwtSecret: '$JWT_SECRET',

  tables: [{
    name: 'users',
    autoSetUid: true,
    fields: [...baseFields, ...authFields],
    triggers: [createdTrigger, updatedTrigger],
    extensions: [
      { name: 'auth', jwtSecret: '$JWT_SECRET_USERS', jwtTokenDuration: 3600, maxTokenRefresh: 5 } as TableAuthExtensionData,
      {
        name: 'rules',
        createRule: 'true',
        viewRule: 'auth.uid == id',
        updateRule: 'auth.uid == id',
        deleteRule: 'auth.uid == id',
      } as TableRulesExtensionData,
    ],
  }, {
    name: 'posts',
    autoSetUid: true,
    fields: [
      ...baseFields,
      { name: 'author_id', type: 'relation', sqlType: 'text', notNull: true,
        foreignKey: { table: 'users', column: 'id' } },
      { name: 'title', type: 'text', sqlType: 'text', notNull: true },
      { name: 'body', type: 'text', sqlType: 'text' },
      { name: 'published', type: 'bool', sqlType: 'boolean', default: sqlValue(false) },
    ],
    triggers: [createdTrigger, updatedTrigger],
    extensions: [{
      name: 'rules',
      listRule: 'published == true | auth.uid == author_id',
      viewRule: 'published == true | auth.uid == author_id',
      createRule: 'auth.uid != null & author_id == auth.uid',
      updateRule: 'auth.uid == author_id',
      deleteRule: 'auth.uid == author_id',
    } as TableRulesExtensionData],
  }],
} satisfies DatabaseSettings
```

That config gives you a full blog API — user auth, JWT login, foreign keys, draft/published visibility rules, auto-migrations, OpenAPI docs, and an admin panel. No backend code, just a typed config object.

> [!NOTE]
> Teenybase is pre-alpha (v0.0.12). Actively developed, API stabilizing. Good enough to ship side projects and MVPs, not yet proven for high-stakes production.

## Quick Start

```bash
npx teeny create my-app
cd my-app
npx teeny deploy --local
npx teeny dev
```

Backend running at `localhost:8787`. Full REST API, auth endpoints, Swagger docs at `/api/v1/doc/ui`, admin panel at `/api/v1/pocket/`.

Deploy to production:

```bash
npx teeny register                # one-time, free, no credit card
npx teeny deploy --remote         # deployed
```

Or [self-host on your own cloudflare infrastructure](docs/getting-started.md#option-b-self-hosted-your-cloudflare-account) for full control.

## What You Get

Stop building these from scratch. They're included:

- **REST API** — CRUD endpoints for every table, automatically
- **Authentication** — email/password, JWT, OAuth (Google, GitHub, Discord, LinkedIn)
- **Row-level security** — rules like `auth.uid == owner_id`, compiled to SQL WHERE clauses
- **Auto-migrations** — change config, run one command, done
- **Actions** — server-side logic with typed params, callable via API
- **Full-text search** — SQLite FTS5, built in
- **File uploads** — object storage, per-field handling
- **OpenAPI docs** — auto-generated 3.1.0 spec + Swagger UI
- **Admin panel** — browse tables, view/edit records, role-based access (viewer/editor/superadmin), at `/api/v1/pocket/`. Passwords in `.dev.vars` / `.prod.vars`
- **Teenybase Cloud** — deploy with a free account, no infrastructure setup needed
- **Local dev** — full stack runs locally, zero cloud calls

## How It Works

Your schema is your backend. Define tables, fields, auth, and access rules in `teenybase.ts`. Teenybase generates migrations, builds the API, handles auth, enforces security rules, and serves docs. You deploy with one command.

Add a table. Run `teeny generate`. Run `teeny deploy`. It's live.

The config file is TypeScript with full IDE autocomplete and type checking. Paste it into any LLM and it knows your entire backend.

## Teenybase vs Others

| | Teenybase | Supabase | Firebase | PocketBase |
|---|---|---|---|---|
| **Defined in** | TypeScript config file | Dashboard + SQL | Dashboard + console | Admin UI |
| **Auth included** | Built in | Built in | Built in | Built in |
| **Row-level security** | API rules | SQL policies | Security rules | API rules |
| **Admin panel** | Built in | Dashboard | Console | Built in |
| **Runs on** | Edge (Cloudflare Workers) | AWS (single region) | Google Cloud | Self-hosted binary |
| **Open source** | Yes (Apache-2.0) | Yes (Apache-2.0) | No | Yes (MIT) |
| **Free tier** | 100k req/day, 500MB DB, 10GB files | 500MB DB, 1GB storage | Spark plan limits | Free (self-host) |
| **Self-hosting** | Yes (own Cloudflare account, no VPS) | Yes (complex) | No | Yes (single binary, needs a VPS) |
| **Deploy from CLI** | `teeny deploy` | Dashboard or CLI | Dashboard or CLI | Manual |
| **Config as code** | Everything in repo | Partial (migrations) | Partial | No |

Supabase and Firebase are full platforms with more features, bigger ecosystems, larger teams. PocketBase is beautifully simple. Teenybase sits in a specific spot: **everything defined in code, serverless on the edge, free to start, and you own it all.**

[Full comparison with trade-offs](docs/why-teenybase.md)

## What It Costs

Teenybase is free and open source. Infrastructure costs go to the hosting provider, not us.

**\$0/month:** The underlying infrastructure has a free plan with 100,000 requests/day, 500 MB database, and 10 GB file storage. No trial, no credit card. Prototypes and side projects run free, indefinitely.

**Under \$1/month per app:** On the Cloudflare Workers Paid plan (\$5/month base for your account), each app's incremental usage cost is pennies. No egress fees, no bandwidth charges.

| What you're building | What you get | Cost |
|----------------------|--------------|------|
| Prototype / side project | 3M requests/month, 500 MB DB, 10 GB files | **\$0** |
| App with real users (~1k DAU) | 500k requests/month, 5M row reads, 500 MB DB | **< \$1/month**\* |
| Production SaaS (~10k DAU) | 5M requests/month, 50M row reads, 5 GB DB\*\*, 50 GB files | **\$5-10/month**\* |

*\*Per-app incremental cost on the Cloudflare Workers Paid plan (\$5/month base for your account). [See the math](docs/cost-breakdown.md).*
*\*\*D1 max database size is 10 GB (hard limit). For most apps, 10 GB of SQLite holds millions of records. [Full limits](docs/why-teenybase.md#limits)*

> Teenybase Cloud (`teeny register`) is free during pre-alpha. Self-hosted deployments pay only infrastructure costs.

[Full cost breakdown with working](docs/cost-breakdown.md) | [Full pricing comparison](docs/why-teenybase.md#what-it-costs) | [Infrastructure pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Documentation

- [Getting Started](docs/getting-started.md) — full setup walkthrough
- [Connecting Your Frontend](docs/frontend-guide.md) — fetch examples, auth flow, CRUD
- [Configuration Reference](docs/config-reference.md) — every option in teenybase.ts
- [Actions Guide](docs/actions-guide.md) — server-side logic
- [Recipes & Patterns](docs/recipes.md) — copy-paste examples for common use cases
- [Recipes & Patterns](docs/recipe-full-app.md) — full app example

- [CLI Reference](docs/cli.md) — all 17 commands
- [API Endpoints](docs/api-endpoints.md) — endpoint reference
- [OAuth Guide](docs/oauth-guide.md) — provider setup
- [Existing Hono Projects](docs/existing-hono-project.md) — add teenybase to your app
- [Why Teenybase](docs/why-teenybase.md) — the full story
- [Security](docs/security.md) — what's protected, what's not, and how to report issues

## Requirements

- Node.js >= 18.14.1
- For self-hosted: Cloudflare account (Workers + D1)

## License

Apache-2.0
