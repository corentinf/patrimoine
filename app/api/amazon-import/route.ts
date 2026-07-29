import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { parseCSV } from '@/app/lib/csv';

export const runtime = 'nodejs';

// Amazon's "Request my order history" export has shipped a couple of
// different column sets over the years (the modern "Retail.OrderHistory.1"
// report vs. the older self-service "Order History Reports" template) —
// resolve each field from whichever candidate name is actually present.
function findCol(headers: string[], candidates: string[]): number {
  for (const name of candidates) {
    const idx = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const sign = raw.includes('-') ? -1 : 1;
  const val = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(val) ? null : sign * val;
}

function isAmazonTx(tx: { payee: string | null; description: string | null }) {
  const haystack = `${tx.payee ?? ''} ${tx.description ?? ''}`.toLowerCase();
  return haystack.includes('amazon') || haystack.includes('amzn');
}

export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);

  const headerIdx = rows.findIndex((r) =>
    r.some((c) => c.trim().toLowerCase() === 'order date') &&
    r.some((c) => c.trim().toLowerCase() === 'order id'),
  );
  if (headerIdx === -1) {
    return NextResponse.json(
      { error: 'Could not find order data in this CSV. Make sure you downloaded an Amazon order history export.' },
      { status: 400 },
    );
  }

  const headers = rows[headerIdx].map((h) => h.trim());
  const iOrderId    = findCol(headers, ['Order ID']);
  const iOrderDate  = findCol(headers, ['Order Date']);
  const iShipDate   = findCol(headers, ['Shipment Date']);
  const iProduct    = findCol(headers, ['Product Name', 'Title']);
  const iTotalOwed  = findCol(headers, ['Total Owed']);
  const iItemTotal  = findCol(headers, ['Item Total']);
  const iItemSub    = findCol(headers, ['Item Subtotal', 'Shipment Item Subtotal']);
  const iItemSubTax = findCol(headers, ['Item Subtotal Tax', 'Shipment Item Subtotal Tax']);
  const iUnitPrice  = findCol(headers, ['Purchase Price Per Unit', 'Unit Price']);
  const iQuantity   = findCol(headers, ['Quantity']);

  if (iOrderId === -1 || iOrderDate === -1 || iProduct === -1) {
    return NextResponse.json(
      { error: 'CSV is missing expected columns (Order ID, Order Date, Product Name/Title).' },
      { status: 400 },
    );
  }

  function rowAmount(row: string[]): number | null {
    // Prefer whatever most directly represents what was actually charged.
    if (iTotalOwed !== -1) { const v = parseMoney(row[iTotalOwed]); if (v !== null) return v; }
    if (iItemTotal !== -1) { const v = parseMoney(row[iItemTotal]); if (v !== null) return v; }
    if (iItemSub !== -1) {
      const sub = parseMoney(row[iItemSub]) ?? 0;
      const tax = iItemSubTax !== -1 ? parseMoney(row[iItemSubTax]) ?? 0 : 0;
      if (row[iItemSub]?.trim()) return sub + tax;
    }
    if (iUnitPrice !== -1) {
      const unit = parseMoney(row[iUnitPrice]);
      const qty = iQuantity !== -1 ? parseFloat(row[iQuantity]) || 1 : 1;
      if (unit !== null) return unit * qty;
    }
    return null;
  }

  const dataRows = rows.slice(headerIdx + 1).filter((r) => r[iOrderId]?.trim());

  // Amazon charges a card once per shipment, not once per order or per item —
  // a multi-item order can arrive (and be charged) across several shipments
  // on different days. Group item rows into shipments by order + date so the
  // summed amount lines up with an actual card charge, and collect the item
  // names in each shipment for the label.
  interface Shipment { orderId: string; date: string; amount: number; items: string[] }
  const shipments = new Map<string, Shipment>();

  for (const row of dataRows) {
    const orderId = row[iOrderId]?.trim();
    const dateRaw = (iShipDate !== -1 && row[iShipDate]?.trim()) || row[iOrderDate]?.trim();
    const product = row[iProduct]?.trim();
    const amount = rowAmount(row);
    if (!orderId || !dateRaw || !product || amount === null) continue;

    const date = new Date(dateRaw);
    if (isNaN(date.getTime())) continue;

    const key = `${orderId}|${date.toISOString().slice(0, 10)}`;
    const existing = shipments.get(key);
    if (existing) {
      existing.amount += amount;
      if (!existing.items.includes(product)) existing.items.push(product);
    } else {
      shipments.set(key, { orderId, date: date.toISOString().slice(0, 10), amount, items: [product] });
    }
  }

  if (shipments.size === 0) {
    return NextResponse.json({ matched: 0, unmatched: 0, skipped: dataRows.length, total: dataRows.length, unmatchedDetails: [] });
  }

  // Fetch all transactions for the last 2 years
  const since = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, amount, posted_at, payee, description')
    .eq('user_id', user.id)
    .gte('posted_at', since);

  if (!txs?.length) {
    return NextResponse.json({ matched: 0, unmatched: shipments.size, skipped: dataRows.length - shipments.size, total: dataRows.length, unmatchedDetails: [] });
  }

  let updated = 0;
  const unmatchedDetails: { note: string; amount: number; date: string; reason: string }[] = [];
  const usedTxIds = new Set<string>();

  function labelFor(items: string[]): string {
    const first = items[0].length > 60 ? `${items[0].slice(0, 57)}…` : items[0];
    return items.length > 1 ? `${first} (+${items.length - 1} more)` : first;
  }

  for (const { date, amount, items } of Array.from(shipments.values())) {
    const shipDate = new Date(date);
    const absAmount = Math.abs(amount);

    const scored = txs
      .filter((tx) => !usedTxIds.has(tx.id))
      .map((tx) => {
        const daysDiff = Math.abs(new Date(tx.posted_at).getTime() - shipDate.getTime()) / 86_400_000;
        const amountDiff = Math.abs(Math.abs(Number(tx.amount)) - absAmount);
        return { tx, daysDiff, amountDiff, isAmazon: isAmazonTx(tx) };
      })
      // Amazon can charge a few days on either side of the order/ship date on the export
      .filter(({ daysDiff, amountDiff }) => daysDiff <= 10 && amountDiff <= 0.02)
      .sort((a, b) => {
        if (a.isAmazon !== b.isAmazon) return a.isAmazon ? -1 : 1;
        return a.daysDiff - b.daysDiff;
      });

    const note = labelFor(items);

    if (scored.length === 0) {
      const anyAmount = txs.some((tx) => Math.abs(Math.abs(Number(tx.amount)) - absAmount) <= 0.02);
      const reason = anyAmount
        ? `Amount $${absAmount.toFixed(2)} found in your transactions but date doesn't align (order: ${shipDate.toLocaleDateString()})`
        : `No transaction found for $${absAmount.toFixed(2)} around ${shipDate.toLocaleDateString()} — it may have been paid with a different card or already refunded`;
      unmatchedDetails.push({ note, amount: absAmount, date: shipDate.toLocaleDateString(), reason });
      continue;
    }

    const { tx } = scored[0];
    usedTxIds.add(tx.id);

    const { error } = await supabase
      .from('transactions')
      .update({ payee: note })
      .eq('id', tx.id)
      .eq('user_id', user.id);

    if (!error) updated++;
    else unmatchedDetails.push({ note, amount: absAmount, date: shipDate.toLocaleDateString(), reason: 'DB update failed' });
  }

  return NextResponse.json({
    matched: updated,
    unmatched: unmatchedDetails.length,
    skipped: dataRows.length - shipments.size,
    total: shipments.size,
    unmatchedDetails,
  });
}
