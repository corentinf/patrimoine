# Patrimoine

A personal finance dashboard. Built with Next.js, Supabase, SimpleFIN, and Recharts.

## Stack

- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — Postgres database + auth
- **SimpleFIN Bridge** — automatic bank sync ($15/year)
- **Recharts** — charts and visualizations
- **Vercel** — hosting (free tier)

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Run the SQL migration in `supabase/schema.sql` via the SQL editor
3. Copy your project URL and anon key

### 2. SimpleFIN

1. Sign up at [beta-bridge.simplefin.org](https://beta-bridge.simplefin.org)
2. Connect your bank accounts (Chase, Vanguard, Fidelity, Amex, etc.)
3. Generate a setup token under Apps > New Connection
4. The app will exchange this for an access URL on first use

### 3. Environment variables

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SIMPLEFIN_ACCESS_URL=your_simplefin_access_url
CRON_SECRET=a_random_secret_string
```

### 4. Run locally

```bash
npm install
npm run dev
```

### 5. Deploy to Vercel

```bash
vercel deploy
```

Add your env variables in Vercel project settings. The daily cron job is configured in `vercel.json`.

## Architecture

```
app/
  (dashboard)/       → main UI pages
    accounts/        → all accounts overview (priority 1)
    spending/        → category breakdown (priority 2)
    networth/        → net worth over time (priority 3)
  api/
    simplefin/       → SimpleFIN data fetching
    cron/            → daily sync endpoint
  components/        → shared UI components
  lib/               → supabase client, simplefin client, utils
```
