# Supaflare Demo App

A client-side React + Vite app demonstrating Supaflare's **DATA** and **AUTH** compatibility features.

## What It Demonstrates

| Feature | Endpoint | Page |
|---------|----------|------|
| **User Registration** | `POST /auth/v1/signup` | Auth → "Sign up" |
| **Login** | `POST /auth/v1/token?grant_type=password` | Auth → "Sign in" |
| **Password Recovery** | `POST /auth/v1/recover` | Auth → "Forgot password" |
| **Create Tasks** | `POST /rest/v1/tasks` | Dashboard → "New Task" |
| **List Tasks** | `GET /rest/v1/tasks?order=created_at.desc` | Dashboard (auto-load) |
| **Update Tasks** | `PATCH /rest/v1/tasks?id=eq.{id}` | Task row → Edit button |
| **Delete Tasks** | `DELETE /rest/v1/tasks?id=eq.{id}` | Task row → Delete button |
| **Search (ilike)** | `GET /rest/v1/tasks?title.ilike=%search%` | Search bar |
| **Filter (eq)** | `GET /rest/v1/tasks?status.eq=todo` | Status / Priority dropdowns |
| **Sort** | `GET /rest/v1/tasks?order=column.desc` | Click column headers |
| **RLS** | `user_id == auth.uid()` — each user sees only their own tasks | All operations |
| **Auth State** | `onAuthStateChange` | Session management (auto) |
| **Get User** | `GET /auth/v1/user` | Dashboard header |
| **Sign Out** | `POST /auth/v1/logout` | Dashboard → "Sign Out" |

## Quick Start

### 1. Install

```bash
cd demo-app
npm install
```

### 2. Start Backend + Frontend

```bash
./scripts/start-local.sh
```

This starts:
- **Supaflare backend** at `http://127.0.0.1:8787` (wrangler dev)
- **React frontend** at `http://localhost:5173` (Vite, proxied to backend)

Open http://localhost:5173 in your browser.

### Manual Start (two terminals)

**Terminal 1 — Backend:**
```bash
cd backend
npx wrangler dev --config wrangler.json --persist-to .wrangler/state
```

**Terminal 2 — Frontend:**
```bash
cd demo-app
npm run dev
```

### Seed Data

The backend auto-seeds on first request with 6 demo tasks. To reseed:

```bash
./scripts/seed-db.sh
```

## Deploy

### Frontend to Cloudflare Pages

```bash
./scripts/deploy.sh           # preview
./scripts/deploy.sh --prod    # production
```

### Backend to Cloudflare Workers

```bash
cd ../backend
./deploy.sh
```

### Pages Environment Variables

After deploying, set in Cloudflare Pages Dashboard → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `VITE_SUPAFLARE_URL` | Your worker URL (e.g., `https://supaflare-backend.your-subdomain.workers.dev`) |
| `VITE_SUPAFLARE_ANON_KEY` | Your production anon key (must match `SUPAFLARE_ANON_KEY` on the worker) |

## Architecture

```
┌─────────────────────┐      /rest/v1/*       ┌──────────────────┐
│  React + Vite       │ ─────────────────────▶ │  Cloudflare       │
│  localhost:5173     │      /auth/v1/*        │  Worker :8787     │
│                     │ ◀───────────────────── │                   │
│  @supabase/supabase-js                      │  teenybase        │
│                                             │  + Supabase compat │
└─────────────────────┘                       └────────┬───────────┘
                                                       │
                                            ┌──────────┴──────────┐
                                            │  D1 (SQLite)        │
                                            │  - tasks            │
                                            │  - auth_users       │
                                            │  - auth_sessions    │
                                            │  - auth_otps        │
                                            │  - auth_rate_limits │
                                            └─────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 6 |
| Styling | Tailwind CSS 3, shadcn/ui-style components |
| Backend | Teenybase + Hono (Cloudflare Workers) |
| Database | D1 (SQLite) |
| Storage | R2 (reserved for Phase 3) |
| Client | `@supabase/supabase-js` |

## Environment Variables

### Frontend (`.env`)

| Variable | Dev Default | Purpose |
|----------|-------------|---------|
| `VITE_SUPAFLARE_URL` | `""` | Backend URL (empty = Vite proxy) |
| `VITE_SUPAFLARE_ANON_KEY` | `sb-anon-test-key` | Anon API key |

### Backend (`backend/wrangler.json` vars)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SUPAFLARE_JWT_SECRET` | `test-jwt-secret-at-least-32-chars!` | JWT signing key |
| `SUPAFLARE_ANON_KEY` | `sb-anon-test-key` | Public anon key |
| `SUPAFLARE_SERVICE_KEY` | `sb-service-test-key` | Service role key |
| `SUPAFLARE_JWT_EXPIRY` | `3600` | Token lifetime (seconds) |
| `SUPAFLARE_SIGNED_URL_EXPIRY` | `600` | Signed URL lifetime (seconds) |

## PostgREST Features Used

| Client Call | Server Translation | DATA.md Phase |
|-------------|-------------------|---------------|
| `.select("*")` | `GET /rest/v1/tasks` | 1B.1 Basic SELECT |
| `.insert(data)` | `POST /rest/v1/tasks` | 1D.1 INSERT |
| `.update(d).eq("id", n)` | `PATCH /rest/v1/tasks?id=eq.{n}` | 1D.2 UPDATE |
| `.delete().eq("id", n)` | `DELETE /rest/v1/tasks?id=eq.{n}` | 1D.4 DELETE |
| `.order("col", {asc: false})` | `?order=col.desc` | 1G.1 Order |
| `.ilike("title", "%x%")` | `?title.ilike=%25x%25` | 1C.2 Pattern |
| `.eq("status", "todo")` | `?status.eq=todo` | 1C.1 Comparison |
| `.match({col: val})` | `?col.eq=val` | 1C.6 Match |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "relation not found" | Tasks table missing — backend auto-seeds on first request |
| "JWT expired" | Default 1h expiry — sign out and back in |
| "Invalid credentials" | User created on different backend — each D1 has its own users |
| Backend won't start | Run `cd ../packages/teenybase && npm install && npm run build-ts` first |
| CORS errors in prod | Set `VITE_SUPAFLARE_URL` to your worker URL |
