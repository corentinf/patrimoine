// Shared-card split math (e.g. the Amex Blue Cash Preferred, split 50/50 with Jenny).
// Computed live from the account's current setting rather than stored on the
// transaction, so changing the split percentage retroactively re-derives
// every past transaction instead of drifting out of sync.

export interface SplitAccount {
  is_shared?: boolean | null;
  personal_percentage?: number | null;
}

export function getPersonalAmount(amount: number, account?: SplitAccount | null): number {
  if (!account?.is_shared) return amount;
  const pct = account.personal_percentage ?? 100;
  return amount * (pct / 100);
}

export function isSharedAccount(account?: SplitAccount | null): boolean {
  return !!account?.is_shared;
}
