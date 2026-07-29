import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { parseCSV } from '@/app/lib/csv';

export const runtime = 'nodejs';

// Amazon order history exports come in a few different shapes depending on
// where they came from — Amazon's own "Request my order history" report
// (Total Owed/Item Total per line, sometimes with its own Shipment Date) vs.
// third-party order-history export tools (one row per item, an order-level
// Total Amount repeated on every row of that order, no shipment date). Column
// lookup is tolerant of either; which columns are present decides how rows
// get aggregated into charges (see "order-level total" vs. "line-item total"
// below).
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
  const iProduct    = findCol(headers, ['Item Title', 'Product Name', 'Title']);
  const iCurrency   = findCol(headers, ['Currency']);
  const iStatus     = findCol(headers, ['Status', 'Order Status']);
  // Order-level total: the same figure is repeated on every item row of a
  // multi-item order, so it must be read once per order, never summed.
  const iOrderTotal = findCol(headers, ['Total Amount']);
  // Per-line-item figures (Amazon's own export formats): these DO need
  // summing across the rows of a shipment to reconstruct the actual charge.
  const iTotalOwed  = findCol(headers, ['Total Owed']);
  const iItemTotal  = findCol(headers, ['Item Total']);
  const iItemSub    = findCol(headers, ['Item Subtotal', 'Shipment Item Subtotal']);
  const iItemSubTax = findCol(headers, ['Item Subtotal Tax', 'Shipment Item Subtotal Tax']);
  const iUnitPrice  = findCol(headers, ['Purchase Price Per Unit', 'Unit Price']);
  const iQuantity   = findCol(headers, ['Quantity', 'Item Quantity']);

  if (iOrderId === -1 || iOrderDate === -1 || iProduct === -1) {
    return NextResponse.json(
      { error: 'CSV is missing expected columns (Order ID, Order Date, Item Title/Product Name).' },
      { status: 400 },
    );
  }

  function lineItemAmount(row: string[]): number | null {
    if (iTotalOwed !== -1) { const v = parseMoney(row[iTotalOwed]); if (v !== null) return v; }
    if (iItemTotal !== -1) { const v = parseMoney(row[iItemTotal]); if (v !== null) return v; }
    if (iItemSub !== -1 && row[iItemSub]?.trim()) {
      const sub = parseMoney(row[iItemSub]) ?? 0;
      const tax = iItemSubTax !== -1 ? parseMoney(row[iItemSubTax]) ?? 0 : 0;
      return sub + tax;
    }
    if (iUnitPrice !== -1) {
      const unit = parseMoney(row[iUnitPrice]);
      const qty = iQuantity !== -1 ? parseFloat(row[iQuantity]) || 1 : 1;
      if (unit !== null) return unit * qty;
    }
    return null;
  }

  const dataRows = rows.slice(headerIdx + 1).filter((r) => r[iOrderId]?.trim());

  interface OrderGroup { date: string; amount: number; items: string[] }
  const groups = new Map<string, OrderGroup>();
  let skippedRows = 0;

  if (iOrderTotal !== -1) {
    // One row per item, order-level total repeated across every row of that
    // order — group strictly by Order ID and take the total once.
    for (const row of dataRows) {
      const orderId = row[iOrderId]?.trim();
      const dateRaw = row[iOrderDate]?.trim();
      const product = row[iProduct]?.trim();
      if (!orderId || !dateRaw || !product) { skippedRows++; continue; }

      const currency = iCurrency !== -1 ? row[iCurrency]?.trim() : undefined;
      if (currency && currency.toUpperCase() !== 'USD') { skippedRows++; continue; }

      const status = iStatus !== -1 ? row[iStatus]?.trim().toLowerCase() : undefined;
      if (status && (status.includes('cancel') || status.includes('refund'))) { skippedRows++; continue; }

      const amount = parseMoney(row[iOrderTotal]);
      if (amount === null || amount === 0) { skippedRows++; continue; }

      const date = new Date(dateRaw);
      if (isNaN(date.getTime())) { skippedRows++; continue; }

      const existing = groups.get(orderId);
      if (existing) {
        if (!existing.items.includes(product)) existing.items.push(product);
      } else {
        groups.set(orderId, { date: date.toISOString().slice(0, 10), amount, items: [product] });
      }
    }
  } else {
    // Amazon's own export: a card is charged once per shipment, not once per
    // order or per item — a multi-item order can ship (and charge) across
    // several days. Group by order + ship/order date and sum the line items.
    for (const row of dataRows) {
      const orderId = row[iOrderId]?.trim();
      const dateRaw = (iShipDate !== -1 && row[iShipDate]?.trim()) || row[iOrderDate]?.trim();
      const product = row[iProduct]?.trim();
      const amount = lineItemAmount(row);
      if (!orderId || !dateRaw || !product || amount === null) { skippedRows++; continue; }

      const date = new Date(dateRaw);
      if (isNaN(date.getTime())) { skippedRows++; continue; }

      const key = `${orderId}|${date.toISOString().slice(0, 10)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.amount += amount;
        if (!existing.items.includes(product)) existing.items.push(product);
      } else {
        groups.set(key, { date: date.toISOString().slice(0, 10), amount, items: [product] });
      }
    }
  }

  if (groups.size === 0) {
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
    return NextResponse.json({ matched: 0, unmatched: groups.size, skipped: skippedRows, total: groups.size, unmatchedDetails: [] });
  }

  let updated = 0;
  const unmatchedDetails: { note: string; amount: number; date: string; reason: string }[] = [];
  const usedTxIds = new Set<string>();

  function labelFor(items: string[]): string {
    const first = items[0].length > 60 ? `${items[0].slice(0, 57)}…` : items[0];
    return items.length > 1 ? `${first} (+${items.length - 1} more)` : first;
  }

  for (const { date, amount, items } of Array.from(groups.values())) {
    const orderDate = new Date(date);
    const absAmount = Math.abs(amount);

    const scored = txs
      .filter((tx) => !usedTxIds.has(tx.id))
      .map((tx) => {
        const daysDiff = Math.abs(new Date(tx.posted_at).getTime() - orderDate.getTime()) / 86_400_000;
        const amountDiff = Math.abs(Math.abs(Number(tx.amount)) - absAmount);
        return { tx, daysDiff, amountDiff, isAmazon: isAmazonTx(tx) };
      })
      // Amazon can charge a few days to a couple weeks after the order date
      .filter(({ daysDiff, amountDiff }) => daysDiff <= 14 && amountDiff <= 0.02)
      .sort((a, b) => {
        if (a.isAmazon !== b.isAmazon) return a.isAmazon ? -1 : 1;
        return a.daysDiff - b.daysDiff;
      });

    const note = labelFor(items);

    if (scored.length === 0) {
      const anyAmount = txs.some((tx) => Math.abs(Math.abs(Number(tx.amount)) - absAmount) <= 0.02);
      const reason = anyAmount
        ? `Amount $${absAmount.toFixed(2)} found in your transactions but date doesn't align (order: ${orderDate.toLocaleDateString()})`
        : `No transaction found for $${absAmount.toFixed(2)} around ${orderDate.toLocaleDateString()} — it may have been paid with a different card or already refunded`;
      unmatchedDetails.push({ note, amount: absAmount, date: orderDate.toLocaleDateString(), reason });
      continue;
    }

    const { tx } = scored[0];
    usedTxIds.add(tx.id);

    const { error } = await supabase
      .from('transactions')
      .update({ payee: note, source_tag: 'Amazon' })
      .eq('id', tx.id)
      .eq('user_id', user.id);

    if (!error) updated++;
    else unmatchedDetails.push({ note, amount: absAmount, date: orderDate.toLocaleDateString(), reason: 'DB update failed' });
  }

  return NextResponse.json({
    matched: updated,
    unmatched: unmatchedDetails.length,
    skipped: skippedRows,
    total: groups.size,
    unmatchedDetails,
  });
}
