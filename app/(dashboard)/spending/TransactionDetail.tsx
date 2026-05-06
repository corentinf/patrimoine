'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrencyPrecise, formatDate } from '@/app/lib/utils';
import { assignTransactionCategory, updateTransactionPayee } from './actions';
import type { Category } from './CategoryManager';
import VenmoSection from './VenmoSection';

export interface FullTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  is_transfer: boolean;
  account: { name: string; institution: string } | null;
  category: { id: string; name: string; color: string; icon: string; is_income: boolean } | null;
}

interface TransactionDetailProps {
  transaction: FullTransaction;
  allCategories: Category[];
  onClose: () => void;
  onCategoryChange: (txId: string, cat: Category) => void;
  onPayeeChange: (txId: string, payee: string) => void;
}

export default function TransactionDetail({
  transaction: tx,
  allCategories,
  onClose,
  onCategoryChange,
  onPayeeChange,
}: TransactionDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [localCategory, setLocalCategory] = useState<Category | null>(null);
  const [localPayee, setLocalPayee] = useState<string | null>(null);
  const [editingPayee, setEditingPayee] = useState(false);
  const [payeeDraft, setPayeeDraft] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const displayPayee = localPayee ?? tx.payee ?? tx.description ?? 'Unknown';
  const effectiveCategory = localCategory ?? tx.category;

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
    onCategoryChange(tx.id, cat);
    setShowCategoryPicker(false);
    startTransition(async () => {
      await assignTransactionCategory(tx.id, cat.id);
      router.refresh();
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col">

        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-sand-100 flex-shrink-0">
          {editingPayee ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={payeeDraft}
                onChange={(e) => setPayeeDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') savePayee(); if (e.key === 'Escape') setEditingPayee(false); }}
                className="flex-1 text-sm font-semibold text-ink-800 bg-sand-50 border border-sand-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sand-300"
              />
              <button
                onClick={savePayee}
                disabled={isPending}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-ink-800 text-white hover:bg-ink-700 transition-colors flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={() => setEditingPayee(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 transition-colors flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <button
                  onClick={startEditPayee}
                  className="group flex items-center gap-2 text-left"
                >
                  <p className="font-semibold text-ink-800 truncate text-sm leading-tight">
                    {displayPayee}
                  </p>
                  <svg
                    className="w-3.5 h-3.5 text-ink-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                  </svg>
                </button>
                {secondaryLine && (
                  <p className="text-xs text-ink-400 mt-0.5 truncate">{secondaryLine}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Amount + meta */}
          <div className="px-5 py-5 border-b border-sand-100">
            <p className="font-mono text-3xl font-semibold text-ink-800">
              {formatCurrencyPrecise(Math.abs(tx.amount))}
            </p>
            <p className="text-sm text-ink-400 mt-1.5">
              {formatDate(tx.posted_at)}
              {tx.account && (
                <span> · {tx.account.institution || tx.account.name}</span>
              )}
            </p>
          </div>

          {/* Venmo section */}
          <VenmoSection transactionId={tx.id} transactionAmount={tx.amount} />

          {/* Category section */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">
              Category
            </p>

            {/* Current category */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{effectiveCategory?.icon ?? '❓'}</span>
                <div>
                  <p className="text-sm font-medium text-ink-700">
                    {effectiveCategory?.name ?? 'Uncategorized'}
                  </p>
                  {isPending && (
                    <p className="text-xs text-ink-300">Saving…</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowCategoryPicker((v) => !v)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  showCategoryPicker
                    ? 'bg-ink-800 text-white'
                    : 'bg-sand-100 text-ink-500 hover:bg-sand-200'
                }`}
              >
                {showCategoryPicker ? 'Cancel' : 'Change'}
              </button>
            </div>

            {/* Inline picker */}
            {showCategoryPicker && (
              <div className="mt-3 border border-sand-200 rounded-xl overflow-hidden">
                {allCategories.map((cat) => {
                  const isActive = (effectiveCategory?.id === cat.id) || (effectiveCategory?.name === cat.name);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sand-50 border-b border-sand-100 last:border-0 ${
                        isActive ? 'bg-sand-50' : ''
                      }`}
                    >
                      <span className="text-base w-6 text-center flex-shrink-0">{cat.icon}</span>
                      <span className="flex-1 text-sm text-ink-700">{cat.name}</span>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      {isActive && (
                        <svg className="w-3.5 h-3.5 text-ink-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
