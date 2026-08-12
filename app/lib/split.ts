// Shared-expense split math. Two independent sources of "this is split
// 50/50 (or some other %)": a whole account (e.g. the Amex Blue Cash
// Preferred, shared with Jenny) or a single transaction (e.g. one dinner
// on an otherwise-personal card, split with someone one-off). A
// transaction-level override always wins over its account's own default —
// computed live from whichever is currently set, never stored, so editing
// either one retroactively re-derives every affected transaction instead of
// drifting out of sync.

export interface SplitSource {
  is_shared?: boolean | null;
  personal_percentage?: number | null;
}

function effectiveSplit(tx?: SplitSource | null, account?: SplitSource | null): SplitSource | null {
  if (tx?.is_shared) return tx;
  if (account?.is_shared) return account;
  return null;
}

export function getPersonalAmount(amount: number, account?: SplitSource | null, tx?: SplitSource | null): number {
  const split = effectiveSplit(tx, account);
  if (!split) return amount;
  const pct = split.personal_percentage ?? 100;
  return amount * (pct / 100);
}

export function isShared(tx?: SplitSource | null, account?: SplitSource | null): boolean {
  return !!effectiveSplit(tx, account);
}
