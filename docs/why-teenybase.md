# Why Teenybase

## The Problem

Building a backend for a new project means setting up a database, writing an API layer, adding authentication, implementing access control, creating migrations, generating API docs, and deploying it somewhere. That's before you write a single line of your actual app.

Most developers solve this by picking a BaaS (Supabase, Firebase) or cobbling together an ORM + auth library + migration tool + API framework. Either way: vendor lock-in, monthly bills, or a week of plumbing.

## The Idea

What if your entire backend was a single config file?

Not a dashboard. Not a vendor portal. A TypeScript file in your repo that defines your tables, fields, auth, and access rules. You push it, and you have a production backend — API, auth, security, docs, admin panel — running on the edge for free.

That's teenybase. Every line is written and reviewed by hand, tested against real infrastructure, and built to handle edge cases — not generated and hoped for the best.

## What It Replaces

| You no longer need | Teenybase gives you |
|--------------------|---------------------|
| Separate auth service (Clerk, Auth0) | Built-in email/password + OAuth + JWT |
| ORM (Prisma, Drizzle) | Config-driven schema, auto-generated SQL |
| Migration tool | `teeny generate` diffs your config, writes SQL |
| API framework | REST endpoints auto-generated for every table |
| Row-level security setup | Rule expressions compiled to SQL WHERE clauses |
| File storage integration | R2 uploads with per-field handling |
| API documentation | OpenAPI 3.1.0 spec + Swagger UI, automatic |
| Admin panel | PocketUI — browse tables, view/edit records, role-based access |
| Deployment pipeline | `teeny deploy` — one command |

## Who It's For

**Frontend developers** who need a backend and don't want to become backend engineers. Build a SaaS MVP, a personal tool, or a side project — teenybase gives you the backend so you can focus on your app.

**Solo developers and small teams** shipping MVPs, prototypes, side projects, or SaaS products — anyone who'd rather spend time on their app than on infrastructure. Habit trackers, link shorteners, blogs, booking systems, e-commerce catalogs, school management apps — if it needs a REST API with auth, this is the fast path.

**Freelancers and agencies** building client projects. One config file per client, deploy for \$0, hand off the repo. The config is the documentation.

**Hackathon teams** who need a backend in 5 minutes, not 5 hours. Four commands to a running API with auth, docs, and an admin panel.

**AI agents and tools** that need to spin up backends programmatically. The config file is structured, typed, and machine-readable. Paste it into any LLM and it understands your entire backend.

**Discord / Telegram bot developers** who need a database and a REST API for their bot's web dashboard. SQLite for storage, REST for the frontend, same data from both.

**Anyone with a \$0 budget.** The free tier gives you 100k requests/day, 500 MB database, and 10 GB file storage. That's a real production backend for free.

## When NOT to Use Teenybase

Honesty builds trust. Teenybase is not the right choice for everything:

- **You need complex server-side logic.** Teenybase gives you actions for server-side SQL, but if your backend is mostly custom business logic, you want a full framework (Hono, Express, etc.). Teenybase works great alongside them though — [see the integration guide](existing-hono-project.md).
- **You need a relational database beyond SQLite.** D1 is SQLite. If you need Postgres features (complex joins, stored procedures, advanced indexing), look at Supabase or host your own.
- **You need real-time subscriptions.** Teenybase is REST-only today. WebSocket/SSE support is not on the roadmap yet.
- **You're at massive scale.** D1 is single-region. If you need multi-region writes or handle millions of concurrent users, you'll outgrow this. But you can get surprisingly far on D1 — and by then, you'll know exactly what you need.

## How It Compares

### vs Supabase

Supabase is a great product. But real pain points exist:

- **Dashboard-first workflow.** Your schema lives in a web UI. Want to code review a table change? You're exporting SQL and hoping it matches. Teenybase: your schema is a TypeScript file in your repo. `git diff` shows exactly what changed.
- **Pricing surprises.** Supabase's free tier is limited (500MB database, 1GB storage). Paid plans start at \$25/mo and scale with usage. Teenybase's underlying infrastructure gives you 100k requests/day, 500 MB database, and 10 GB file storage on the free tier — enough for most projects, indefinitely.
- **Complexity.** Supabase is Postgres + PostgREST + GoTrue + Realtime + Storage + Edge Functions. Powerful, but that's a lot of moving parts. Teenybase is one config file and one deploy command.
- **Where Supabase wins:** Real-time subscriptions, Postgres power (advanced queries, extensions), larger ecosystem, more auth providers, dedicated dashboard for non-technical team members.

### vs Firebase

Firebase pioneered the BaaS category. The pain points are well-known:

- **Vendor lock-in.** Firebase is deeply tied to Google Cloud. Migrating off is a project in itself. Teenybase is open source and self-hostable — your data lives in a SQLite database you can export anytime.
- **Pricing model.** Firebase charges per read/write/delete operation. A popular app can run up bills fast. Teenybase's infrastructure charges per request (100k/day free), with generous included database operations.
- **NoSQL constraints.** Firestore is document-based. Relational queries are painful. Teenybase uses SQLite — proper relational data with joins, indexes, and full-text search.
- **Where Firebase wins:** Real-time sync (best in class), mobile SDKs, Google ecosystem integration, massive scale, mature tooling.

### vs PocketBase

PocketBase is the closest in philosophy — simple, self-contained, developer-friendly. Different trade-offs:

- **Config as code.** PocketBase schema lives in its admin UI. Changes aren't in version control by default. Teenybase schema is a TypeScript file — code review, branching, CI/CD all work naturally.
- **Serverless.** PocketBase is a Go binary you host yourself — you need a server. Teenybase deploys serverless to the edge with zero infrastructure to manage.
- **TypeScript-native.** Your config is typed. Your IDE autocompletes field names, extension options, and rule expressions.
- **Where PocketBase wins:** Single binary runs anywhere (no vendor dependency), built-in real-time, Go performance, more mature and battle-tested, larger community.

### vs Clerk / Auth0

These are auth-only services. Teenybase includes auth but is a complete backend:

- **All-in-one.** Clerk gives you auth. You still need a database, API, file storage, and access control separately. Teenybase gives you everything from one config file.
- **Cost.** Clerk's free tier covers 10k monthly active users, then \$0.02/user. Auth0 free covers 25k users. Teenybase auth has no per-user pricing — it's part of the backend.
- **Where they win:** Pre-built UI components, more auth providers and enterprise SSO (SAML/SCIM), dedicated auth expertise, session management features.

### vs Building It Yourself

You could wire up Hono + Drizzle + Lucia + your own migration scripts + OpenAPI generation. It would take a week, and you'd maintain it forever.

Or: write a config file, run two commands, done.

## Architecture

```
teeny.config.ts (your schema)
       |
       v
  teeny generate (diffs config, writes SQL migrations)
       |
       v
  teeny deploy
       |
       v
  Serverless Workers (Hono app)
    ├── REST API (auto-generated CRUD)
    ├── Auth (JWT, OAuth, email/password)
    ├── Rules (row-level security via WHERE injection)
    ├── Files (R2 object storage)
    ├── Search (FTS5)
    ├── Actions (server-side logic)
    ├── OpenAPI (auto-generated docs)
    ├── Admin Panel (PocketUI)
    └── Logs (stream live worker logs via `teeny logs`)
```

Your config is the single source of truth. Everything else is derived from it.

## Deployment Options

### Managed Platform (recommended for getting started)

Create a free teenybase account, deploy, done. No infrastructure account needed.

```bash
npx teeny register              # free account
npx teeny deploy --remote       # deployed
```

Your backend is live on our infrastructure. If you outgrow it or want full control, eject to self-hosted — zero code changes.

### Self-Hosted

Full control. Your own account, your Workers, your databases.

```bash
npx wrangler login
npx wrangler d1 create my-db
npx teeny deploy --remote
```

## What It Costs

Teenybase is free and open source. Infrastructure costs go to the hosting provider, not us.

### \$0 — a real backend, genuinely free

The underlying infrastructure has a generous free plan. No trial, no credit card:

- **100,000 requests/day** (~3M/month)
- **500 MB** database, **5M reads/day**, 100k writes/day
- **10 GB** file storage (R2)

That's enough to run prototypes, side projects, personal tools, and early-stage products — free, indefinitely.

### Under \$1/month per app — a real backend

On the Cloudflare Workers Paid plan (\$5/month base for your account), a typical app with ~1,000 daily active users costs under \$1/month in incremental usage. [See the full cost breakdown with working](cost-breakdown.md).

The \$5/month base plan includes generous shared limits across all your apps:

- 10 million requests/month (then \$0.30/million)
- 25 billion database row reads/month (then \$0.001/million)
- 50 million database row writes/month (then \$1.00/million)
- 5 GB database storage (then \$0.75/GB-month)
- 10 GB file storage (R2 free tier, then \$0.015/GB-month)
- Auth, row-level security, API docs, admin panel — all included

### \$5-10/month per app — production SaaS

At ~10,000 daily active users, a production app costs \$5-10/month in incremental usage: 5M requests, 50M row reads, 5 GB database, 50 GB files. Costs scale linearly and predictably. No egress fees, no bandwidth charges, no surprises.

### How that compares

Most backend platforms start at \$25/month for their paid tier. Teenybase on Cloudflare's paid plan (\$5/month base) delivers a comparable backend for a fraction of that — the difference comes from Cloudflare's usage-based pricing with generous included amounts (25 billion reads and 50 million writes per month before overages) and zero egress fees. The trade-off: some platforms include more file storage (Supabase Pro includes 100 GB vs R2's 10 GB free), and offer features teenybase doesn't have yet (real-time, edge functions marketplace).

### Teenybase Cloud

The Teenybase Cloud (`teeny register`) is **free during pre-alpha**. Pricing will be announced before general availability. Self-hosted deployments will always remain free — you pay infrastructure costs directly.

## Limits

Current infrastructure limits (Cloudflare D1/R2/Workers). Teenybase inherits all of them.

| Resource | Free | Paid |
|----------|------|------|
| Max database size | 500 MB | 10 GB (hard limit) |
| Databases per account | 10 | 50,000 |
| Max row/blob size | 2 MB | 2 MB |
| Max columns per table | 100 | 100 |
| Queries per request | 50 | 1,000 |
| SQL query timeout | 30 seconds | 30 seconds |
| CPU time per request | 10 ms | 30 ms (up to 5 min) |
| R2 max object size | 5 GB | 5 GB |
| Account storage (D1) | 5 GB | 1 TB |

**The big one:** D1 databases max out at **10 GB** on the paid plan. This is a hard limit that can't be increased. For most apps, 10 GB of SQLite holds millions of records. If you need more, you'll want Postgres (Supabase, Neon, etc.).

D1 is also **single-region** — your database lives in one location. Reads from the other side of the world add latency (~100-300ms). Compute runs globally at the edge, but database queries go back to the database region.

For full, up-to-date limits: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Roadmap

Teenybase is pre-alpha (v0.0.12). Here's where it's heading:

- **Frontend SDK** — typed client library for calling your API
- **Rate limiting** — per-route, per-user request throttling
- **Custom domains** — bring your own domain to the Teenybase Cloud
- **Dashboard** — web UI for managing your projects
- **Cache control** — edge cache integration

---

[Back to README](../README.md) | [Getting Started](getting-started.md) | [CLI Reference](cli.md)
