import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      field += ch;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field); field = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
        i += ch === '\r' ? 2 : 1;
        continue;
      }
      field += ch;
    }
    i++;
  }
  if (field || row.length) { row.push(field); if (row.some((c) => c.trim())) rows.push(row); }
  return rows;
}

function parseVenmoAmount(raw: string): number | null {
  const sign = raw.includes('-') ? -1 : 1;
  const val = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(val) ? null : sign * val;
}

function isVenmoTx(tx: { payee: string | null; description: string | null }) {
  const haystack = `${tx.payee ?? ''} ${tx.description ?? ''}`.toLowerCase();
  return haystack.includes('venmo');
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
    r.some((c) => c.trim() === 'ID') && r.some((c) => c.trim() === 'Datetime'),
  );
  if (headerIdx === -1) {
    return NextResponse.json({ error: 'Could not find data in CSV. Make sure you downloaded a Venmo statement.' }, { status: 400 });
  }

  const headers = rows[headerIdx].map((h) => h.trim());
  const col = (name: string) => headers.findIndex((h) => h === name);
  const iDatetime = col('Datetime');
  const iNote     = col('Note');
  const iFrom     = col('From');
  const iTo       = col('To');
  const iAmount   = col('Amount (total)');

  if ([iDatetime, iNote, iAmount].some((idx) => idx === -1)) {
    return NextResponse.json({ error: 'CSV is missing expected columns (Datetime, Note, Amount).' }, { status: 400 });
  }

  const dataRows = rows.slice(headerIdx + 1).filter((r) => r[iDatetime]?.trim());

  // Fetch all transactions for the last 2 years
  const since = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, amount, posted_at, payee, description')
    .eq('user_id', user.id)
    .gte('posted_at', since);

  if (!txs?.length) {
    return NextResponse.json({ matched: 0, unmatched: dataRows.length, skipped: 0, total: dataRows.length, unmatchedDetails: [] });
  }

  let updated = 0;
  let skipped = 0;
  const unmatchedDetails: { note: string; amount: number; date: string; reason: string }[] = [];
  const usedTxIds = new Set<string>();

  for (const row of dataRows) {
    const note      = row[iNote]?.trim();
    const amountRaw = row[iAmount]?.trim();
    const datetimeRaw = row[iDatetime]?.trim();

    if (!note || !amountRaw || !datetimeRaw) { skipped++; continue; }

    const venmoAmount = parseVenmoAmount(amountRaw);
    if (venmoAmount === null) { skipped++; continue; }

    const venmoDate = new Date(datetimeRaw);
    if (isNaN(venmoDate.getTime())) { skipped++; continue; }

    const from   = row[iFrom]?.trim() ?? '';
    const to     = row[iTo]?.trim() ?? '';
    const person = venmoAmount < 0 ? to : from;
    const absVenmo = Math.abs(venmoAmount);

    // Score each transaction: prefer venmo-labeled, penalise date distance
    const scored = txs
      .filter((tx) => !usedTxIds.has(tx.id))
      .map((tx) => {
        const daysDiff = Math.abs(
          new Date(tx.posted_at).getTime() - venmoDate.getTime()
        ) / 86_400_000;
        const amountDiff = Math.abs(Math.abs(Number(tx.amount)) - absVenmo);
        return { tx, daysDiff, amountDiff, isVenmo: isVenmoTx(tx) };
      })
      // within ±7 days, exact amount match (Venmo pulls exact amounts from bank)
      .filter(({ daysDiff, amountDiff }) => daysDiff <= 7 && amountDiff <= 0.01)
      // prefer venmo-labeled transactions, then closest date
      .sort((a, b) => {
        if (a.isVenmo !== b.isVenmo) return a.isVenmo ? -1 : 1;
        return a.daysDiff - b.daysDiff;
      });

    if (scored.length === 0) {
      // Check if amount exists but date is out of range — helps user diagnose
      const anyAmount = txs.filter(
        (tx) => Math.abs(Math.abs(Number(tx.amount)) - absVenmo) <= 0.01
      );
      const reason = anyAmount.length > 0
        ? `Amount $${absVenmo.toFixed(2)} found in your transactions but date doesn't align (Venmo: ${venmoDate.toLocaleDateString()})`
        : `No transaction found for $${absVenmo.toFixed(2)} — this payment may have come from your Venmo balance, not directly from Chase`;
      unmatchedDetails.push({ note, amount: absVenmo, date: venmoDate.toLocaleDateString(), reason });
      continue;
    }

    const { tx } = scored[0];
    usedTxIds.add(tx.id);

    const newPayee = person ? `${note} · ${person}` : note;
    const { error } = await supabase
      .from('transactions')
      .update({ payee: newPayee })
      .eq('id', tx.id)
      .eq('user_id', user.id);

    if (!error) updated++;
    else unmatchedDetails.push({ note, amount: absVenmo, date: venmoDate.toLocaleDateString(), reason: 'DB update failed' });
  }

  return NextResponse.json({
    matched: updated,
    unmatched: unmatchedDetails.length,
    skipped,
    total: dataRows.length,
    unmatchedDetails,
  });
}
