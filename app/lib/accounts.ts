// Locked, tax-advantaged accounts (401k/403b/HSA/"retirement" plans) — not
// accessible without penalty until retirement age. Matched on name/institution
// rather than a fixed list so newly-added accounts are picked up automatically.
// Handles provider spellings like "401(K) PLAN" and "Health Savings Account".
const LOCKED_RETIREMENT_RE = /401\s*\(?k\)?|403\s*\(?b\)?|\bhsa\b|health savings|retirement/i;

type NamedAccount = { name: string; institution?: string | null };

export function isLockedRetirementAccount(a: NamedAccount): boolean {
  return LOCKED_RETIREMENT_RE.test(a.name) || LOCKED_RETIREMENT_RE.test(a.institution || '');
}

export function isIraAccount(a: NamedAccount): boolean {
  return /\bira\b/i.test(a.name) || /\bira\b/i.test(a.institution || '');
}
