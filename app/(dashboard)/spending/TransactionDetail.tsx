'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrencyPrecise, formatDate, groupAndSortCategories, filterCategoryGroups } from '@/app/lib/utils';
import { getPersonalAmount, isShared } from '@/app/lib/split';
import { assignTransactionCategory, updateTransactionPayee, toggleTransfer, toggleTransactionShared, markReimbursable } from './actions';
import type { Category } from './CategoryManager';
import VenmoSection from './VenmoSection';
import { getMerchantData, useMerchantDrawer, type MerchantData } from '@/app/components/MerchantDrawer';
import { usePrivacy } from '@/app/lib/privacy';

export interface FullTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  is_transfer: boolean;
  is_reimbursable: boolean;
  /** Secondary provenance badge (e.g. "Amazon") — separate from category,
   *  never counted in spending totals/budgets. */
  source_tag?: string | null;
  /** Per-transaction split override — independent of the account's own
   *  setting, for a one-off shared expense. */
  is_shared?: boolean | null;
  personal_percentage?: number | null;
  account: { name: string; institution: string; is_shared?: boolean | null; personal_percentage?: number | null } | null;
  category: { id: string; name: string; color: string; icon: string; is_income: boolean } | null;
}

interface TransactionDetailProps {
  transaction: FullTransaction;
  allCategories: Category[];
  onClose: () => void;
  onCategoryChange: (txId: string, cat: Category, applyToAll: boolean) => void;
  onPayeeChange: (txId: string, payee: string) => void;
  /** Hide the Venmo request section — Venmo requests don't apply to money coming in. */
  hideVenmo?: boolean;
}

export default function TransactionDetail({
  transaction: tx,
  allCategories,
  onClose,
  onCategoryChange,
  onPayeeChange,
  hideVenmo = false,
}: TransactionDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [localCategory, setLocalCategory] = useState<Category | null>(null);
  const [localPayee, setLocalPayee] = useState<string | null>(null);
  const [editingPayee, setEditingPayee] = useState(false);
  const [payeeDraft, setPayeeDraft] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  // Default on: picking a category applies it to every past transaction from
  // this merchant and remembers it for future syncs too. Uncheck to make this
  // a one-off — just this transaction, no rule created/updated.
  const [applyToAll, setApplyToAll] = useState(true);

  const [enrichment, setEnrichment] = useState<{
    businessName: string;
    description: string;
    category: string;
    website: string | null;
  } | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState('');

  const displayPayee = localPayee ?? tx.payee ?? tx.description ?? 'Unknown';
  const effectiveCategory = localCategory ?? tx.category;
  const filteredCatGroups = filterCategoryGroups(groupAndSortCategories(allCategories), catSearch);

  usePrivacy(); // amounts are formatted at render — keep privacy / demo mode in sync
  const { openMerchant } = useMerchantDrawer();

  // Quick flags (saved straight away; the lists refresh behind the panel)
  const [isTransferLocal, setIsTransferLocal] = useState(tx.is_transfer);
  const [reimbLocal, setReimbLocal] = useState(tx.is_reimbursable);
  const [sharedLocal, setSharedLocal] = useState(!!tx.is_shared);

  // How this compares with your usual at the merchant (cached for the session)
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [merchantLoading, setMerchantLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setMerchantLoading(true);
    getMerchantData(localPayee ?? tx.payee ?? tx.description ?? '')
      .then((d) => { if (alive) setMerchant(d); })
      .catch(() => { if (alive) setMerchant(null); })
      .finally(() => { if (alive) setMerchantLoading(false); });
    return () => { alive = false; };
  }, [localPayee, tx.payee, tx.description]);

  // ESC closes the panel (unless a text field is being edited)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editingPayee) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, editingPayee]);

  const [copied, setCopied] = useState<string | null>(null);
  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    });
  }

  function saveFlag(run: () => Promise<unknown>) {
    startTransition(async () => { await run(); router.refresh(); });
  }

  const kind: 'transfer' | 'income' | 'spending' = isTransferLocal ? 'transfer' : tx.amount > 0 ? 'income' : 'spending';
  const TONE = { transfer: 'g-indigo', income: 'g-teal', spending: 'g-sunset' }[kind];
  const KIND_LABEL = { transfer: 'Transferred', income: 'Received', spending: 'Spent' }[kind];
  const sharedEffective = isShared({ ...tx, is_shared: sharedLocal }, tx.account);
  const personalAmount = Math.abs(getPersonalAmount(tx.amount, tx.account, { ...tx, is_shared: sharedLocal }));

  // "Today" / "Yesterday" / "5 days ago" from the bank's posting date
  const relativeDay = (() => {
    const day = Date.parse(`${tx.posted_at.slice(0, 10)}T12:00:00Z`);
    const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const n = Math.round((today - day) / 86_400_000);
    if (n === 0) return 'Today';
    if (n === 1) return 'Yesterday';
    return n > 1 && n < 60 ? `${n} days ago` : null;
  })();

  const versusUsual = (() => {
    if (kind !== 'spending' || !merchant || merchant.visits < 3 || merchant.avgTransaction <= 0) return null;
    const ratio = personalAmount / merchant.avgTransaction;
    if (ratio >= 1.8) return `${ratio.toFixed(1)}× your usual at ${merchant.name}`;
    if (ratio <= 0.55) return `Smaller than your usual at ${merchant.name}`;
    return `In line with your usual at ${merchant.name}`;
  })();


  // Secondary line: show description only if it differs from the displayed payee
  const secondaryLine = (() => {
    const desc = tx.description;
    if (!desc || desc === displayPayee) return null;
    const memo = tx.memo;
    if (memo && memo !== desc) return `${desc} · ${memo}`;
    return desc;
  })();

  function startEditPayee() {
    setPayeeDraft(displayPayee);
    setEditingPayee(true);
    setShowCategoryPicker(false);
  }

  function savePayee() {
    const trimmed = payeeDraft.trim();
    if (!trimmed || trimmed === displayPayee) { setEditingPayee(false); return; }
    setLocalPayee(trimmed);
    onPayeeChange(tx.id, trimmed);
    setEditingPayee(false);
    startTransition(async () => {
      await updateTransactionPayee(tx.id, trimmed);
      router.refresh();
    });
  }

  function handleCategorySelect(cat: Category) {
    setLocalCategory(cat);
    onCategoryChange(tx.id, cat, applyToAll);
    setShowCategoryPicker(false);
    setCatSearch('');
    startTransition(async () => {
      await assignTransactionCategory(tx.id, cat.id, applyToAll);
      router.refresh();
    });
  }

  async function handleEnrich() {
    setEnriching(true);
    setEnrichError('');
    try {
      const res = await fetch('/api/transactions/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: tx.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnrichment(data.enrichment);
      } else {
        setEnrichError(data.error || 'Lookup failed');
      }
    } catch (err: any) {
      setEnrichError(err.message || 'Lookup failed');
    } finally {
      setEnriching(false);
    }
  }

  const catColor = effectiveCategory?.color ?? '#9CA3AF';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div
        className="panel-in glass bg-sand-50/95 fixed inset-y-0 right-0 z-[60] flex w-full max-w-sm flex-col border-l shadow-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >

        {/* Top bar */}
        <div className="flex flex-none items-center justify-between px-5 pb-3 pt-4">
          <p className="stat-label">Transaction</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleEnrich}
              disabled={enriching}
              title="Look up this merchant with AI"
              className="pill gap-1.5 px-3 py-1 text-xs disabled:opacity-50"
            >
              <span aria-hidden>{enriching ? '…' : '✦'}</span> {enriching ? 'Looking up' : 'AI lookup'}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition-colors hover:bg-sand-200/60 hover:text-ink-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-6">

          {/* ── Hero: who, how much, when — tinted by type (spending / income / transfer) ── */}
          <div className={`gradient-card ${TONE} px-5 pb-5 pt-4`}>
            <div className="sheen" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[rgb(255_255_255/0.35)] bg-[rgb(255_255_255/0.22)] text-lg"
                >
                  {effectiveCategory?.icon ?? displayPayee.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  {editingPayee ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={payeeDraft}
                        onChange={(e) => setPayeeDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') savePayee(); if (e.key === 'Escape') setEditingPayee(false); }}
                        className="min-w-0 flex-1 rounded-lg border border-[rgb(255_255_255/0.45)] bg-[rgb(255_255_255/0.2)] px-2.5 py-1 text-sm font-semibold text-white placeholder:text-white/60 focus:outline-none"
                      />
                      <button onClick={savePayee} disabled={isPending} aria-label="Save name" className="grid h-7 w-7 place-items-center rounded-full bg-white text-ink-800">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button onClick={startEditPayee} title="Rename" className="group flex max-w-full items-center gap-1.5 text-left">
                      <span data-sensitive className="truncate text-[15px] font-semibold leading-tight">{displayPayee}</span>
                      <svg className="h-3.5 w-3.5 shrink-0 text-white/70 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" /></svg>
                    </button>
                  )}
                  <p className="mt-0.5 truncate text-xs text-white/75">{effectiveCategory?.name ?? 'Uncategorized'}</p>
                </div>
              </div>

              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">{KIND_LABEL}</p>
              <p className="stat-value mt-1 text-[2.4rem] leading-none" data-sensitive>
                {kind === 'spending' ? '−' : kind === 'income' ? '+' : ''}{formatCurrencyPrecise(Math.abs(tx.amount))}
              </p>
              {sharedEffective && (
                <p className="mt-1.5 text-sm text-white/85" data-sensitive>
                  ½ shared · your share {formatCurrencyPrecise(personalAmount)}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/85">
                <span>{formatDate(tx.posted_at)}</span>
                {relativeDay && <span className="rounded-full bg-[rgb(255_255_255/0.22)] px-2 py-px text-[11px]">{relativeDay}</span>}
                {tx.account && <span className="text-white/60">·</span>}
                {tx.account && <span>{tx.account.institution || tx.account.name}</span>}
              </div>
            </div>
          </div>

          {/* ── At this merchant ── */}
          {(merchantLoading || (merchant && merchant.visits > 0)) && (
            <div className="card space-y-3 px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="stat-label">At this merchant</p>
                <button
                  onClick={() => { onClose(); openMerchant(displayPayee); }}
                  className="text-xs font-medium text-accent-green hover:underline underline-offset-2"
                >
                  Full history →
                </button>
              </div>
              {merchantLoading || !merchant ? (
                <div className="h-12 animate-pulse rounded-lg bg-sand-100" />
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Visits', value: String(merchant.visits), sensitive: false },
                      { label: 'Average', value: formatCurrencyPrecise(merchant.avgTransaction), sensitive: true },
                      { label: 'All-time', value: formatCurrencyPrecise(merchant.total), sensitive: true },
                    ].map((m) => (
                      <div key={m.label} className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-300">{m.label}</p>
                        <p className="mt-0.5 truncate font-mono text-[13px] font-medium text-ink-700" {...(m.sensitive ? { 'data-sensitive': true } : {})}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  {versusUsual && (
                    <p className="flex items-start gap-2 rounded-lg bg-sand-100/70 px-2.5 py-2 text-xs leading-snug text-ink-600">
                      <span aria-hidden className="text-accent-green">✦</span>
                      <span data-sensitive>{versusUsual}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Category ── */}
          <div className="card px-4 py-3.5">
            <p className="stat-label mb-3">Category</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg" style={{ backgroundColor: `${catColor}22` }}>
                  {effectiveCategory?.icon ?? '❓'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-700">{effectiveCategory?.name ?? 'Uncategorized'}</p>
                  <p className="text-xs text-ink-300">{isPending ? 'Saving…' : applyToAll ? 'Changes apply to every matching transaction' : 'Changes apply to this one only'}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowCategoryPicker((v) => !v); setCatSearch(''); }}
                className={`pill shrink-0 px-3.5 py-1.5 text-xs ${showCategoryPicker ? 'pill-active' : ''}`}
              >
                {showCategoryPicker ? 'Cancel' : 'Change'}
              </button>
            </div>

            {/* Inline picker — grouped by parent, sorted A→Z */}
            {showCategoryPicker && (
              <div className="mt-3 flex max-h-80 flex-col overflow-hidden rounded-xl border border-sand-200">
                <div className="flex-shrink-0 border-b border-sand-100 p-2">
                  <input
                    autoFocus
                    type="text"
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    placeholder="Search categories…"
                    className="w-full rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-sm text-ink-700 placeholder:text-ink-300 focus:border-ink-400 focus:outline-none"
                  />
                </div>
                <div className="overflow-y-auto">
                  {filteredCatGroups.map(({ parent, children }) => {
                    const isParentActive = effectiveCategory?.id === parent.id;
                    return (
                      <div key={parent.id} className="border-b border-sand-100 last:border-0">
                        <button
                          onClick={() => handleCategorySelect(parent)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sand-100/60 ${isParentActive ? 'bg-sand-100/60' : ''}`}
                        >
                          <span className="w-6 flex-shrink-0 text-center text-base">{parent.icon}</span>
                          <span className="flex-1 text-sm font-medium text-ink-700">{parent.name}</span>
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: parent.color }} />
                          {isParentActive && <span aria-hidden className="text-accent-green">✓</span>}
                        </button>
                        {children.map((child) => {
                          const isChildActive = effectiveCategory?.id === child.id;
                          return (
                            <button
                              key={child.id}
                              onClick={() => handleCategorySelect(child)}
                              className={`flex w-full items-center gap-3 border-t border-sand-100/60 py-2 pl-10 pr-4 text-left transition-colors hover:bg-sand-100/60 ${isChildActive ? 'bg-sand-100/60' : ''}`}
                            >
                              <span className="w-5 flex-shrink-0 text-center text-sm">{child.icon}</span>
                              <span className="flex-1 text-xs text-ink-600">{child.name}</span>
                              {isChildActive && <span aria-hidden className="text-accent-green">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {filteredCatGroups.length === 0 && (
                    <p className="px-4 py-3 text-center text-sm text-ink-300">No categories found</p>
                  )}
                </div>
                <label className="flex flex-shrink-0 cursor-pointer items-center gap-2 border-t border-sand-100 px-3 py-2 text-xs text-ink-500 hover:bg-sand-100/50">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer rounded accent-ink-800"
                  />
                  Apply to all &quot;{displayPayee}&quot; transactions (past &amp; future)
                </label>
              </div>
            )}
          </div>

          {/* ── Flags ── */}
          <div className="card divide-y divide-sand-100 p-0">
            <FlagRow
              title="Transfer"
              hint="Moves money between your own accounts — left out of spending and income"
              checked={isTransferLocal}
              onChange={(v) => { setIsTransferLocal(v); saveFlag(() => toggleTransfer(tx.id, v)); }}
            />
            <FlagRow
              title="Shared expense"
              hint={tx.account?.is_shared ? 'Already split through this shared account' : 'Count only your share of this charge'}
              checked={sharedEffective}
              disabled={!!tx.account?.is_shared}
              onChange={(v) => { setSharedLocal(v); saveFlag(() => toggleTransactionShared(tx.id, v)); }}
            />
            <FlagRow
              title="Reimbursable"
              hint="Someone will pay this back — excluded from spending"
              checked={reimbLocal}
              onChange={(v) => { setReimbLocal(v); saveFlag(() => markReimbursable([tx.id], v)); }}
            />
          </div>

          {/* ── Venmo ── */}
          {!hideVenmo && (
            <div className="card overflow-hidden p-0 [&>*]:border-b-0">
              <VenmoSection transactionId={tx.id} transactionAmount={tx.amount} />
            </div>
          )}

          {/* ── AI lookup result ── */}
          {(enrichment || enrichError) && (
            <div className="card space-y-2 px-4 py-3.5">
              {enrichError ? (
                <p className="text-xs text-accent-red">{enrichError}</p>
              ) : enrichment && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="stat-label">AI lookup</p>
                    <button onClick={() => setEnrichment(null)} aria-label="Dismiss" className="text-ink-300 transition-colors hover:text-ink-500">✕</button>
                  </div>
                  <p className="text-sm font-medium text-ink-800">{enrichment.businessName}</p>
                  <p className="text-xs leading-relaxed text-ink-500">{enrichment.description}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="rounded-full border border-sand-200 bg-white px-2 py-0.5 text-[10px] font-medium text-ink-500">{enrichment.category}</span>
                    {enrichment.website && (
                      <a
                        href={`https://${enrichment.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-accent-green underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {enrichment.website}
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Details ── */}
          <div className="card px-4 py-3.5">
            <p className="stat-label mb-2">Details</p>
            <dl className="divide-y divide-sand-100 text-sm">
              <DetailRow label="Posted">{formatDate(tx.posted_at)}</DetailRow>
              <DetailRow label="Account">
                {tx.account ? `${tx.account.institution || ''}${tx.account.institution && tx.account.name ? ' · ' : ''}${tx.account.name || ''}` : '—'}
              </DetailRow>
              <DetailRow label="Type">{kind === 'transfer' ? 'Transfer' : kind === 'income' ? 'Income / money in' : 'Spending'}</DetailRow>
              {tx.description && (
                <DetailRow label="Bank text" onCopy={() => copy(tx.description, 'desc')} copied={copied === 'desc'}>
                  <span className="break-words font-mono text-[12px] leading-snug">{tx.description}</span>
                </DetailRow>
              )}
              {tx.memo && tx.memo !== tx.description && <DetailRow label="Memo">{tx.memo}</DetailRow>}
              {tx.source_tag && <DetailRow label="Source">{tx.source_tag}</DetailRow>}
              <DetailRow label="ID" onCopy={() => copy(tx.id, 'id')} copied={copied === 'id'}>
                <span className="break-all font-mono text-[11px] text-ink-400">{tx.id}</span>
              </DetailRow>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

// ── small building blocks ────────────────────────────────────────────────────

function DetailRow({ label, children, onCopy, copied }: { label: string; children: ReactNode; onCopy?: () => void; copied?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="w-16 shrink-0 pt-px text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-300">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-ink-700" data-sensitive>{children}</dd>
      {onCopy && (
        <button onClick={onCopy} aria-label={`Copy ${label}`} className="shrink-0 text-[11px] text-ink-300 transition-colors hover:text-ink-600">
          {copied ? '✓' : 'Copy'}
        </button>
      )}
    </div>
  );
}

function FlagRow({ title, hint, checked, onChange, disabled = false }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-700">{title}</p>
        <p className="text-xs leading-snug text-ink-300">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent-green' : 'bg-sand-300'} ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
