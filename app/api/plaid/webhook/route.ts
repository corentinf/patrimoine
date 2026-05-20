import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createHash } from 'crypto';
import { jwtVerify, importJWK, decodeProtectedHeader } from 'jose';
import { plaidClient } from '@/app/lib/plaid';
import { createServiceClient } from '@/app/lib/supabase';
import { syncAll } from '@/app/lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SYNC_TRIGGERING_CODES = new Set([
  'SYNC_UPDATES_AVAILABLE',
  'DEFAULT_UPDATE',
  'INITIAL_UPDATE',
  'HISTORICAL_UPDATE',
  'TRANSACTIONS_REMOVED',
]);

async function verifyPlaidWebhook(rawBody: string, jwtToken: string) {
  const { kid, alg } = decodeProtectedHeader(jwtToken);
  if (alg !== 'ES256' || !kid) throw new Error('Unexpected JWT header');

  const keyRes = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk = keyRes.data.key;
  if (jwk.expired_at) throw new Error('Verification key expired');

  const publicKey = await importJWK(jwk as any, 'ES256');
  const { payload } = await jwtVerify(jwtToken, publicKey, { maxTokenAge: '5m' });

  const expectedHash = createHash('sha256').update(rawBody).digest('hex');
  if (payload.request_body_sha256 !== expectedHash) {
    throw new Error('Body hash mismatch');
  }
}

export async function POST(request: NextRequest) {
  const jwtToken = request.headers.get('plaid-verification');
  const rawBody = await request.text();

  if (!jwtToken) {
    return NextResponse.json({ error: 'Missing Plaid-Verification header' }, { status: 401 });
  }

  try {
    await verifyPlaidWebhook(rawBody, jwtToken);
  } catch (err: any) {
    console.error('[plaid-webhook] verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as {
    webhook_type?: string;
    webhook_code?: string;
    item_id?: string;
  };

  console.log(
    `[plaid-webhook] ${event.webhook_type}/${event.webhook_code} item=${event.item_id}`,
  );

  if (!event.item_id || !event.webhook_code) {
    return NextResponse.json({ ok: true });
  }

  if (!SYNC_TRIGGERING_CODES.has(event.webhook_code)) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from('plaid_items')
    .select('user_id')
    .eq('item_id', event.item_id)
    .single();

  if (!item) {
    console.warn(`[plaid-webhook] no plaid_items row for ${event.item_id}`);
    return NextResponse.json({ ok: true });
  }

  waitUntil(
    syncAll(item.user_id)
      .then((result) => {
        console.log(
          `[plaid-webhook] sync done user=${item.user_id} added=${result.transactionsAdded} errors=${result.errors.length}`,
        );
      })
      .catch((err: any) => {
        console.error(`[plaid-webhook] sync failed user=${item.user_id}:`, err.message);
      }),
  );

  return NextResponse.json({ ok: true });
}
