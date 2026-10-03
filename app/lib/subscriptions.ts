// Recurring-charge ("subscription") detection, shared by the Subscriptions tab and the spending
// forecast so the two can never disagree. A merchant counts as recurring when it has at least two
// charges averaging 20–45 days apart with near-identical amounts (±20%).

export interface SubscriptionTx {
  amount: number;
  payee: string | null;
  description: string;
  posted_at: string;
  is_transfer: boolean;
  category: { is_income: boolean } | null;
}

export interface DetectedSubscription {
  merchantKey: string;
  merchantName: string;
  estimatedMonthlyCost: number;
  lastChargeDate: string;
  occurrences: number;
  /** Average days between charges — used to predict the next one. */
  avgGapDays: number;
}

/** Key used for subscription_overrides ("confirmed" / "dismissed"). Must stay stable. */
export function subscriptionKey(name: string): string {
  return name
    .replace(/\*.*$/, '')            // "Amazon Prime*A1B2C3" → "Amazon Prime"
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|www|com|net|org)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);
}

export function detectSubscriptions(transactions: SubscriptionTx[]): DetectedSubscription[] {
  const expenses = transactions.filter(
    (tx) => Number(tx.amount) < 0 && !tx.is_transfer && !tx.category?.is_income,
  );

  const byMerchant = new Map<string, { displayName: string; txs: typeof expenses }>();
  for (const tx of expenses) {
    const raw = (tx.payee || tx.description || '').trim();
    if (!raw) continue;
    const key = subscriptionKey(raw);
    if (key.length < 3) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, { displayName: raw, txs: [] });
    byMerchant.get(key)!.txs.push(tx);
  }

  const results: DetectedSubscription[] = [];

  byMerchant.forEach(({ txs }, key) => {
    if (txs.length < 2) return;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime(),
    );

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(
        (new Date(sorted[i].posted_at).getTime() - new Date(sorted[i - 1].posted_at).getTime()) /
          86_400_000,
      );
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < 20 || avgGap > 45) return;

    const amounts = sorted.map((tx) => Math.abs(Number(tx.amount)));
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDev = amounts.reduce((m, a) => Math.max(m, Math.abs(a - mean)), 0);
    if (maxDev > Math.max(mean * 0.2, 1)) return;

    // Use the most recent payee as display name
    const recentTx = sorted[sorted.length - 1];
    const merchantName = recentTx.payee || recentTx.description || key;

    results.push({
      merchantKey: key,
      merchantName,
      estimatedMonthlyCost: mean,
      lastChargeDate: recentTx.posted_at,
      occurrences: sorted.length,
      avgGapDays: avgGap,
    });
  });

  return results.sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost);
}
