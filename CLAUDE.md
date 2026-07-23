# Patrimoine — Claude Code Context

Personal finance dashboard built by Corentin Fabry.
Live at finance.corentinfabry.com. Single-user app, no multi-tenancy needed.

## Stack

- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — Postgres + Auth + RLS (enabled on all public tables)
- **Plaid** — bank sync, cursor-based to minimize API costs (~4 connected items)
- **Recharts** — charts and visualizations
- **Vercel** — hosting + daily cron job
- **Prisma** — ORM

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Net worth overview, milestones, account breakdown sidebar |
| Spending | `/spending` | Monthly spending, savings rate, categories, subscriptions, transactions |
| Income | `/income` | Salary detection, income by category, monthly income chart |
| Investment | `/investment` | Holdings, progress over time chart, grouped by ETF type |

## Connected Accounts

| Institution | Type | Notes |
|------------|------|-------|
| Chase | Checking + 3 credit cards | Main checking + credit |
| Webster Bank | Savings | BrioDirect, ~$7.5k |
| Fidelity | HSA | ~$6.9k, manual entry |
| Fidelity | 401k | ~$213k, manual entry, no individual holdings reported |
| Robinhood | Brokerage | Individual stocks |
| Vanguard | Brokerage ****3955 | ETFs + individual stocks |

Manual accounts (401k, HSA) don't report individual holdings — disclosed in Investment page UI.

## Key Business Logic

**Spending**
- Transfers excluded from spending totals automatically
- Large purchases (>$500) excluded from end-of-month pace calculation
- Pace shown as: "on pace for ~$X (excl. $Y in large purchases)"
- Reimbursable expense flag exists — excludes from spending + savings rate
- Savings rate = (manual income - spending) / manual income * 100
- Manual income figure: $6,469/mo (bi-monthly Capgemini payroll)

**Income**
- Salary detected via merchant rule: "CAPGEMINI AMERIC PAYROLL PPD ID: 9111111101"
- Bi-monthly deposits (~$3,234 and ~$3,958 depending on pay period)
- Cash Rewards from American Express = income, not spending

**Investment**
- Holdings grouped into: Broad Market ETFs, Sector/Specialty ETFs, Bonds, Individual Stocks
- Progress over time chart with time range selector (Today / 7d / 30d / 3m / YTD / All)
- Gain/loss shown vs cost basis per holding

**Sync**
- Manual sync via "Sync now" button
- Auto-sync on page load if last sync > 24 hours ago
- Cursor-based Plaid sync — only fetches new/modified transactions
- Plaid free tier exhausted — now on paid (~$1.50/mo for 4–5 items)

## Database Tables (Supabase)

- `public.accounts`
- `public.transactions`
- `public.categories`
- `public.category_rules`
- `public.holdings`
- `public.networth_snapshots`

RLS enabled on all tables. Single-user policy: full access for authenticated user only.

## Known Issues / Open Work

- Income subcategories not yet split (still showing "Income - Other" instead of "Salary", "Interest", etc.)
- Net worth over time chart needs more monthly snapshots before trend line appears (tracking since May 6, 2026)
- Supermarket → Groceries category merge pending
- MBOT is a known speculative position (~-79%), expected
- Two VBR rows exist (different accounts) — merge or account column needed
- Income chart mid-month savings rate uses fixed income figure, not prorated

## Milestones

- $250k ✓ Reached
- $300k ✓ Reached
- $400k → ~Dec 2028
- $500k → ~Nov 2031

Current net worth: ~$316k (as of June 2026)

## Preferences

- Keep responses concise and direct
- Provide complete, copy-paste ready code
- Flag data integrity issues proactively
- User is Corentin — French, based in San Francisco, works at frog/Capgemini
