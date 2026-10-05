import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase';
import { getPersonalAmount } from '@/app/lib/split';
import { forecastSpending, type SpendTx } from '@/app/lib/forecast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Money flow for a date range, for the Sankey on Home: where income came from, where it went
// (spending by category) and how much was moved into investments.
//
// Spending follows the Spending page's own rules (so the two always agree):
//   • visible accounts only, money out only
//   • excludes transfers, income-category rows and the "Transfer" category
//   • counts only YOUR share of split charges (shared accounts / per-transaction splits)
//   • sub-categories roll up to their parent category
// Income = positive amounts in income categories (as on the Income page).
// Investments = money leaving a checking/savings account toward a brokerage. Those are
// transfers, so they are excluded from spending above and counted here instead.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const BROKERAGE = /vanguard|robinhood|fidelity|schwab|e\*?trade|wealthfront|betterment|merrill|brokerage|ira contribution/i;
const PAGE = 1000; // PostgREST returns at most 1000 rows per request

interface FlowItem { id: string; name: string; icon: string | null; color: string | null; amount: number }

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start = req.nextUrl.searchParams.get('start') ?? '';
  const end = req.nextUrl.searchParams.get('end') ?? '';
  if (!ISO_DAY.test(start) || !ISO_DAY.test(end) || start > end) {
    return NextResponse.json({ error: 'start and end must be YYYY-MM-DD, start <= end' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    const { data: visible } = await supabase.from('accounts').select('id').eq('is_hidden', false);
    const visibleIds = (visible ?? []).map((a) => a.id);
    const { data: cats } = await supabase.from('categories').select('id, name, color, icon, is_income, parent_id');
    const catById = new Map((cats ?? []).map((c) => [c.id, c]));

    // Page through a date range (PostgREST caps a single response at 1000 rows).
    const fetchRows = async (fromDay: string, toDay: string) => {
      const out: any[] = [];
      for (let from = 0; visibleIds.length && from < 20 * PAGE; from += PAGE) {
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            amount, posted_at, description, payee, is_transfer, is_shared, personal_percentage,
            account:accounts(account_type, is_shared, personal_percentage),
            category:categories(id, name, is_income)
          `)
          .in('account_id', visibleIds)
          .gte('posted_at', fromDay)
          .lte('posted_at', `${toDay}T23:59:59.999Z`)
          .order('posted_at', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return out;
    };
    const rows = await fetchRows(start, end);

    const income = new Map<string, FlowItem>();
    const spending = new Map<string, FlowItem>();
    let investments = 0;

    for (const tx of rows) {
      const day = String(tx.posted_at).slice(0, 10);
      if (day < start || day > end) continue;
      const amount = Number(tx.amount);
      const cat = tx.category ? catById.get(tx.category.id) ?? tx.category : null;

      if (amount > 0) {
        if (tx.is_transfer || !cat?.is_income) continue;
        const key = cat.id;
        const cur = income.get(key) ?? { id: key, name: cat.name, icon: cat.icon ?? null, color: cat.color ?? null, amount: 0 };
        cur.amount += amount;
        income.set(key, cur);
        continue;
      }
      if (amount >= 0) continue;

      const isTransferLike = tx.is_transfer || cat?.name === 'Transfer';
      const accountType = tx.account?.account_type;
      if (isTransferLike && (accountType === 'checking' || accountType === 'savings')
        && BROKERAGE.test(`${tx.payee ?? ''} ${tx.description ?? ''}`)) {
        investments += Math.abs(amount);
        continue;
      }
      if (isTransferLike || cat?.is_income) continue;

      // Roll up to the parent category, like the Spending page does.
      const parent = cat?.parent_id ? catById.get(cat.parent_id) ?? cat : cat;
      const key = parent?.id ?? '__uncategorized__';
      const personal = Math.abs(getPersonalAmount(amount, tx.account, tx));
      const cur = spending.get(key) ?? {
        id: key,
        name: parent?.name ?? 'Uncategorized',
        icon: parent?.icon ?? '❓',
        color: parent?.color ?? '#D1D5DB',
        amount: 0,
      };
      cur.amount += personal;
      spending.set(key, cur);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const list = (m: Map<string, FlowItem>) =>
      Array.from(m.values()).map((i) => ({ ...i, amount: round(i.amount) })).sort((a, b) => b.amount - a.amount);

    // ── Prediction for the rest of the current month (only if the range reaches today) ──
    let predicted: {
      until: string;
      income: FlowItem[];
      spending: FlowItem[];
      investments: number;
    } | null = null;

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
    if (req.nextUrl.searchParams.get('predict') === '1' && start <= today && end >= today) {
      const [ty, tm] = today.split('-').map(Number);
      const monthEnd = `${ty}-${String(tm).padStart(2, '0')}-${String(new Date(ty, tm, 0).getDate()).padStart(2, '0')}`;
      if (monthEnd > today) {
        const month = today.slice(0, 7);
        const histStart = new Date(Date.UTC(ty, tm - 1 - 3, 1)).toISOString().slice(0, 10);
        const previous = [1, 2, 3].map((i) => new Date(Date.UTC(ty, tm - 1 - i, 1)).toISOString().slice(0, 7));
        const hist = await fetchRows(histStart, today);

        const spendTx: SpendTx[] = [];
        const monthlyIncome = new Map<string, Record<string, number>>(); // category -> month -> total
        const monthlyInvest: Record<string, number> = {};
        for (const tx of hist) {
          const day = String(tx.posted_at).slice(0, 10);
          const m = day.slice(0, 7);
          const amount = Number(tx.amount);
          const cat = tx.category ? catById.get(tx.category.id) ?? tx.category : null;
          if (amount > 0) {
            if (tx.is_transfer || !cat?.is_income) continue;
            const byMonth = monthlyIncome.get(cat.id) ?? {};
            byMonth[m] = (byMonth[m] ?? 0) + amount;
            monthlyIncome.set(cat.id, byMonth);
            continue;
          }
          if (amount >= 0) continue;
          const transferLike = tx.is_transfer || cat?.name === 'Transfer';
          const accountType = tx.account?.account_type;
          if (transferLike && (accountType === 'checking' || accountType === 'savings')
            && BROKERAGE.test(`${tx.payee ?? ''} ${tx.description ?? ''}`)) {
            monthlyInvest[m] = (monthlyInvest[m] ?? 0) + Math.abs(amount);
            continue;
          }
          if (transferLike || cat?.is_income) continue;
          const parent = cat?.parent_id ? catById.get(cat.parent_id) ?? cat : cat;
          spendTx.push({
            date: day,
            amount: Math.abs(getPersonalAmount(amount, tx.account, tx)),
            categoryKey: parent?.id ?? '__uncategorized__',
            categoryName: parent?.name ?? 'Uncategorized',
            categoryIcon: parent?.icon ?? '❓',
            payee: tx.payee ?? null,
            description: String(tx.description ?? ''),
          });
        }

        const [{ data: budgetRows }, { data: overrideRows }] = await Promise.all([
          supabase.from('category_budgets').select('category_id, monthly_amount'),
          supabase.from('subscription_overrides').select('merchant_key, status').eq('user_id', user.id),
        ]);
        const budgets: Record<string, number> = {};
        for (const b of budgetRows ?? []) budgets[b.category_id] = Number(b.monthly_amount);
        const dismissed = new Set((overrideRows ?? []).filter((o) => o.status === 'dismissed').map((o) => o.merchant_key as string));

        const fc = forecastSpending({ spend: spendTx, today, monthEnd, budgets, dismissed });
        const median = (xs: number[]) => {
          if (!xs.length) return 0;
          const sorted = [...xs].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        // Expected income: categories paid in at least 2 of the last 3 months, minus what's already in.
        const predIncome: FlowItem[] = [];
        monthlyIncome.forEach((byMonth, id) => {
          if (previous.filter((m) => (byMonth[m] ?? 0) > 0).length < 2) return;
          const rest = median(previous.map((m) => byMonth[m] ?? 0)) - (byMonth[month] ?? 0);
          const c = catById.get(id);
          if (rest >= 1) predIncome.push({ id, name: c?.name ?? 'Income', icon: c?.icon ?? null, color: c?.color ?? null, amount: round(rest) });
        });

        // Expected investing: your usual monthly transfer to brokerages, minus what's already gone.
        const investHist = previous.map((m) => monthlyInvest[m] ?? 0);
        const predInvest = investHist.filter((v) => v > 0).length >= 2
          ? Math.max(0, median(investHist) - (monthlyInvest[month] ?? 0))
          : 0;

        const predSpending: FlowItem[] = [];
        if (fc) {
          for (const [id, c] of Object.entries(fc.byCategory)) {
            const amount = c.subscriptions + c.usual;
            if (amount < 1) continue;
            const cat = catById.get(id);
            predSpending.push({ id, name: c.name, icon: c.icon, color: cat?.color ?? null, amount: round(amount) });
          }
        }
        if (predIncome.length || predSpending.length || predInvest > 0) {
          predicted = {
            until: monthEnd,
            income: predIncome.sort((a, b) => b.amount - a.amount),
            spending: predSpending.sort((a, b) => b.amount - a.amount),
            investments: round(predInvest),
          };
        }
      }
    }

    // Monthly budgets, so the chart can flag categories that are over (or heading over) their limit.
    const { data: budgetRows } = await supabase.from('category_budgets').select('category_id, monthly_amount').eq('user_id', user.id);
    const budgets = (budgetRows ?? []).map((b) => {
      const c = catById.get(b.category_id);
      return { id: b.category_id as string, name: c?.name ?? 'Category', icon: c?.icon ?? null, color: c?.color ?? null, amount: Number(b.monthly_amount) };
    });

    return NextResponse.json({
      start,
      end,
      budgets,
      income: list(income),
      spending: list(spending),
      investments: round(investments),
      predicted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to compute money flow' }, { status: 500 });
  }
}
