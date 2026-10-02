import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase';
import { getPersonalAmount } from '@/app/lib/split';

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

    // Page through the range (PostgREST caps a single response at 1000 rows).
    const rows: any[] = [];
    for (let from = 0; visibleIds.length && from < 20 * PAGE; from += PAGE) {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          amount, posted_at, description, payee, is_transfer, is_shared, personal_percentage,
          account:accounts(account_type, is_shared, personal_percentage),
          category:categories(id, name, is_income)
        `)
        .in('account_id', visibleIds)
        .gte('posted_at', start)
        .lte('posted_at', `${end}T23:59:59.999Z`)
        .order('posted_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

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

    return NextResponse.json({
      start,
      end,
      income: list(income),
      spending: list(spending),
      investments: round(investments),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to compute money flow' }, { status: 500 });
  }
}
