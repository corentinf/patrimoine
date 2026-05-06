import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Minimal RFC-4180 CSV parser — handles quoted fields with commas/newlines inside.
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
  // Venmo amounts look like: "+ $25.00", "- $12.50", "$25.00"
  const cleaned = raw.replace(/[+$, ]/g, '');
  const sign = raw.includes('-') ? -1 : 1;
  const val = parseFloat(cleaned.replace('-', ''));
  return isNaN(val) ? null : sign * val;
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

  // Find the header row — Venmo CSVs have metadata rows at the top before the data
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

  if ([iDatetime, iNote, iAmount].some((i) => i === -1)) {
    return NextResponse.json({ error: 'CSV is missing expected columns (Datetime, Note, Amount).' }, { status: 400 });
  }

  const dataRows = rows.slice(headerIdx + 1).filter((r) => r[iDatetime]?.trim());

  // Fetch all Venmo-related transactions for this user (last 2 years)
  const since = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, amount, posted_at, payee, description')
    .eq('user_id', user.id)
    .gte('posted_at', since)
    .or('payee.ilike.%venmo%,description.ilike.%venmo%');

  if (!txs?.length) {
    return NextResponse.json({ matched: 0, updated: 0, unmatched: dataRows.length, skipped: 0 });
  }

  let updated = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const note = row[iNote]?.trim();
    const amountRaw = row[iAmount]?.trim();
    const datetimeRaw = row[iDatetime]?.trim();

    if (!note || !amountRaw || !datetimeRaw) { skipped++; continue; }

    const venmoAmount = parseVenmoAmount(amountRaw);
    if (venmoAmount === null) { skipped++; continue; }

    const venmoDate = new Date(datetimeRaw);
    if (isNaN(venmoDate.getTime())) { skipped++; continue; }

    const from = row[iFrom]?.trim() ?? '';
    const to   = row[iTo]?.trim() ?? '';
    const person = venmoAmount < 0 ? to : from;

    // Find the best matching transaction: same sign, same amount (±$0.50), within ±3 days
    const candidates = txs.filter((tx) => {
      const dbAmt = Number(tx.amount);
      if (Math.sign(dbAmt) !== Math.sign(venmoAmount)) return false;
      if (Math.abs(Math.abs(dbAmt) - Math.abs(venmoAmount)) > 0.50) return false;
      const daysDiff = Math.abs(new Date(tx.posted_at).getTime() - venmoDate.getTime()) / 86_400_000;
      return daysDiff <= 3;
    });

    if (candidates.length !== 1) { unmatched++; continue; }

    const tx = candidates[0];
    // Build a richer payee: "Note · Person" if person is known
    const newPayee = person ? `${note} · ${person}` : note;

    const { error } = await supabase
      .from('transactions')
      .update({ payee: newPayee })
      .eq('id', tx.id)
      .eq('user_id', user.id);

    if (!error) updated++;
    else unmatched++;
  }

  return NextResponse.json({
    matched: updated,
    updated,
    unmatched,
    skipped,
    total: dataRows.length,
  });
}
