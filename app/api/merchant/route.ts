import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase';
import { getPersonalAmount } from '@/app/lib/split';
import { buildMerchantInsights, merchantDisplayName, normalizeMerchant, rulePatternFor } from '@/app/lib/merchant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Merchant intelligence for the drawer. Computed on demand (when a merchant name is clicked), not
// preloaded; the client caches the result for the session.
//
//   GET  ?name=<descriptor>             → stats, trend, recent transactions, insights, category + rule
//   POST { name, categoryId }           → recategorise every transaction from this merchant and
//                                          save an "always categorise as" rule for future ones
//
// "Same merchant" = same normalizeMerchant() key, so "Trader Joe's #123 SF" and "Trader Joe's #456
// Oak" are one merchant. Spending uses YOUR share of split charges and ignores transfers.

const PAGE = 1000;
const LA = 'America/Los_Angeles';
const todayInLA = () => new Intl.DateTimeFormat('en-CA', { timeZone: LA }).format(new Date());

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

const rawOf = (tx: any): string => (tx.payee && String(tx.payee).trim()) || String(tx.description ?? '').trim();

/** Every visible-account transaction whose descriptor normalises to the same key. */
async function loadMatches(supabase: ReturnType<typeof createServiceClient>, name: string) {
  const key = normalizeMerchant(name);
  if (!key) return { key, rows: [] as any[] };

  const { data: visible } = await supabase.from('accounts').select('id').eq('is_hidden', false);
  const visibleIds = (visible ?? []).map((a) => a.id);
  if (visibleIds.length === 0) return { key, rows: [] as any[] };

  // Narrow in SQL on the first word of the key (cheap), then match exactly in JS on the full key.
  const words = key.split(' ').filter(Boolean);
  const first = (words[0].length >= 3 ? words[0] : words.slice(0, 2).join(' ')).replace(/[^a-z0-9 ]/g, '');

  const rows: any[] = [];
  for (let from = 0; from < 10 * PAGE; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id, amount, posted_at, payee, description, is_transfer, is_shared, personal_percentage,
        account:accounts(institution, name, is_shared, personal_percentage),
        category:categories(id, name, icon, color)
      `)
      .in('account_id', visibleIds)
      .or(`payee.ilike.%${first}%,description.ilike.%${first}%`)
      .order('posted_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { key, rows: rows.filter((tx) => normalizeMerchant(rawOf(tx)) === key) };
}

const monthKey = (iso: string) => iso.slice(0, 7);

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const name = req.nextUrl.searchParams.get('name') ?? '';
  if (!name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const { key, rows } = await loadMatches(supabase, name);
    const today = todayInLA();

    const [{ data: categories }, { data: rules }] = await Promise.all([
      supabase.from('categories').select('id, name, icon, color, parent_id').eq('is_income', false).order('name'),
      supabase.from('category_rules').select('match_field, match_pattern, priority, category:categories(name, icon)').eq('user_id', user.id),
    ]);

    // ── spending (money out, not transfers, personal share) ──
    const outflows = rows
      .filter((tx) => Number(tx.amount) < 0 && !tx.is_transfer)
      .map((tx) => ({
        id: tx.id as string,
        date: String(tx.posted_at).slice(0, 10),
        amount: Math.abs(getPersonalAmount(Number(tx.amount), tx.account, tx)),
        account: (tx.account?.institution ?? tx.account?.name ?? '') as string,
        description: rawOf(tx),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Most common raw descriptor → display name and the rule pattern.
    const rawCounts = new Map<string, number>();
    for (const tx of rows) rawCounts.set(rawOf(tx), (rawCounts.get(rawOf(tx)) ?? 0) + 1);
    const topRaw = Array.from(rawCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? name;

    // Category: the most used one; flag when the merchant is split across several.
    const catCounts = new Map<string, { n: number; cat: any }>();
    for (const tx of rows) {
      if (!tx.category) continue;
      const cur = catCounts.get(tx.category.id) ?? { n: 0, cat: tx.category };
      cur.n += 1;
      catCounts.set(tx.category.id, cur);
    }
    const catList = Array.from(catCounts.values()).sort((a, b) => b.n - a.n);
    const category = catList[0]?.cat ?? null;

    // Existing "always categorise as" rule that matches this merchant.
    const lowered = Array.from(rawCounts.keys()).map((r) => r.toLowerCase());
    const rule = (rules ?? [])
      .filter((r: any) => r.match_pattern && lowered.some((s) => s.includes(String(r.match_pattern).toLowerCase())))
      .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((r: any) => ({
        pattern: r.match_pattern as string,
        categoryName: (r.category?.name ?? null) as string | null,
        categoryIcon: (r.category?.icon ?? null) as string | null,
      }))[0] ?? null;

    const total = outflows.reduce((s, v) => s + v.amount, 0);
    const first = outflows.length ? outflows[outflows.length - 1].date : null;
    const last = outflows.length ? outflows[0].date : null;
    const monthsSince = first
      ? (Number(today.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(today.slice(5, 7)) - Number(first.slice(5, 7))) + 1
      : 0;

    // Last 12 calendar months, zero-filled, ending with the current month.
    const byMonth = new Map<string, { total: number; count: number }>();
    for (const v of outflows) {
      const m = monthKey(v.date);
      const cur = byMonth.get(m) ?? { total: 0, count: 0 };
      cur.total += v.amount;
      cur.count += 1;
      byMonth.set(m, cur);
    }
    const monthly: { month: string; total: number; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
      const m = d.toISOString().slice(0, 7);
      const cur = byMonth.get(m);
      monthly.push({ month: m, total: Math.round((cur?.total ?? 0) * 100) / 100, count: cur?.count ?? 0 });
    }

    const largest = outflows.reduce<(typeof outflows)[number] | null>((m, v) => (!m || v.amount > m.amount ? v : m), null);

    return NextResponse.json({
      key,
      name: merchantDisplayName(topRaw),
      matchPattern: rulePatternFor(topRaw),
      today,
      visits: outflows.length,
      total: Math.round(total * 100) / 100,
      avgTransaction: outflows.length ? Math.round((total / outflows.length) * 100) / 100 : 0,
      avgMonthly: monthsSince ? Math.round((total / monthsSince) * 100) / 100 : 0,
      monthsSince,
      firstDate: first,
      lastDate: last,
      largest: largest ? { amount: largest.amount, date: largest.date } : null,
      monthly,
      // With only 1–2 months of history a bar chart is mostly empty — the UI plots each visit instead.
      dots: new Set(outflows.map((v) => monthKey(v.date))).size <= 2
        ? outflows.map((v) => ({ date: v.date, amount: Math.round(v.amount * 100) / 100 })).reverse()
        : [],
      recent: outflows.slice(0, 5).map((v) => ({ id: v.id, date: v.date, amount: Math.round(v.amount * 100) / 100, account: v.account })),
      insights: buildMerchantInsights({ visits: outflows.map((v) => ({ date: v.date, amount: v.amount })), todayIso: today }),
      category,
      otherCategories: Math.max(0, catList.length - 1),
      rule,
      categories: categories ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to load merchant' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, categoryId } = await req.json().catch(() => ({}));
  if (!name || !categoryId) return NextResponse.json({ error: 'name and categoryId are required' }, { status: 400 });

  try {
    const supabase = createServiceClient();
    const { rows } = await loadMatches(supabase, String(name));
    if (rows.length === 0) return NextResponse.json({ error: 'No transactions found for this merchant' }, { status: 404 });

    // 1) recategorise every matching transaction
    const ids: string[] = rows.map((tx) => tx.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('transactions').update({ category_id: categoryId }).in('id', ids.slice(i, i + 200));
      if (error) throw error;
    }

    // 2) save a rule so future syncs file this merchant the same way (substring match, so it
    //    covers every branch / store number)
    const counts = new Map<string, number>();
    for (const tx of rows) counts.set(rawOf(tx), (counts.get(rawOf(tx)) ?? 0) + 1);
    const topRaw = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    const pattern = rulePatternFor(topRaw);
    const matchField = rows.find((tx) => rawOf(tx) === topRaw)?.payee ? 'payee' : 'description';

    if (pattern) {
      const escaped = pattern.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: existing, error: lookupErr } = await supabase
        .from('category_rules')
        .select('id')
        .eq('user_id', user.id)
        .eq('match_field', matchField)
        .ilike('match_pattern', escaped);
      if (lookupErr) throw lookupErr;
      if (existing?.length) {
        const { error } = await supabase.from('category_rules').update({ category_id: categoryId, priority: 50 }).in('id', existing.map((r) => r.id));
        if (error) throw error;
      } else {
        const { error } = await supabase.from('category_rules').insert({
          user_id: user.id,
          category_id: categoryId,
          match_field: matchField,
          match_pattern: pattern,
          priority: 50,
        });
        if (error) throw error;
      }
    }

    revalidatePath('/spending');
    revalidatePath('/income');
    return NextResponse.json({ ok: true, updated: ids.length, pattern });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to update category' }, { status: 500 });
  }
}
