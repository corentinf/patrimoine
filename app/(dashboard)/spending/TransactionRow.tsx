'use client';

import { useRef, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrencyPrecise, formatShortDate } from '@/app/lib/utils';
import { assignTransactionCategory } from './actions';
import type { Category } from './CategoryManager';
import type { FullTransaction } from './TransactionDetail';

interface VenmoRequest {
  id: string;
  person_name: string;
  amount: number;
  status: 'pending' | 'requested' | 'settled';
}

const VENMO_STATUS_NEXT: Record<string, VenmoRequest['status']> = {
  pending: 'requested',
  requested: 'settled',
  settled: 'pending',
};

// CSS filters to tint the Venmo SVG (which is black by default)
// Generated via https://isotropic.co/tool/hex-color-to-css-filter/
const VENMO_STATUS_FILTER: Record<string, string> = {
  pending:   'brightness(0) saturate(100%) invert(58%) sepia(93%) saturate(400%) hue-rotate(5deg) brightness(105%)',   // amber
  requested: 'brightness(0) saturate(100%) invert(40%) sepia(90%) saturate(500%) hue-rotate(195deg) brightness(100%)', // blue
  settled:   'brightness(0) saturate(100%) invert(55%) sepia(60%) saturate(400%) hue-rotate(100deg) brightness(95%)',  // green
};

const VENMO_STATUS_LABEL: Record<string, string> = {
  pending: '$ to request',
  requested: '↗ requested',
  settled: '✓ settled',
};

interface TransactionRowProps {
  tx: FullTransaction & { account_id: string };
  allCategories: Category[];
  initialVenmo: VenmoRequest | null;
  knownVenmoNames: string[];
  localCategory: Category | null;
  onCategoryChange: (txId: string, cat: Category) => void;
  onRowClick: () => void;
}

export default function TransactionRow({
  tx,
  allCategories,
  initialVenmo,
  knownVenmoNames,
  localCategory,
  onCategoryChange,
  onRowClick,
}: TransactionRowProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const rowRef = useRef<HTMLDivElement>(null);

  const effectiveCategory = localCategory ?? tx.category;
  const catIcon = effectiveCategory?.icon ?? '❓';
  const catName = effectiveCategory?.name ?? 'Uncategorized';
  const catColor = effectiveCategory?.color ?? '#D1D5DB';
  const displayName = tx.payee ?? tx.description ?? 'Unknown';

  // Category picker
  const [showCatPicker, setShowCatPicker] = useState(false);

  // Venmo
  const [venmo, setVenmo] = useState<VenmoRequest | null>(initialVenmo);
  const [showVenmoForm, setShowVenmoForm] = useState(false);
  const [personInput, setPersonInput] = useState('');
  const [amountInput, setAmountInput] = useState(
    String((Math.abs(tx.amount) / 2).toFixed(2)),
  );
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [savingVenmo, setSavingVenmo] = useState(false);
  const [venmoError, setVenmoError] = useState('');

  const filteredNames = knownVenmoNames.filter((n) =>
    n.toLowerCase().includes(personInput.toLowerCase()),
  );

  // Close pickers on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setShowCatPicker(false);
        setShowVenmoForm(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleCategorySelect(cat: Category, e: React.MouseEvent) {
    e.stopPropagation();
    onCategoryChange(tx.id, cat);
    setShowCatPicker(false);
    startTransition(async () => {
      await assignTransactionCategory(tx.id, cat.id);
      router.refresh();
    });
  }

  async function handleVenmoSave(e: React.MouseEvent) {
    e.stopPropagation();
    if (!personInput.trim()) return;
    setSavingVenmo(true);
    setVenmoError('');
    try {
      const res = await fetch('/api/venmo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: tx.id,
          person_name: personInput.trim(),
          amount: parseFloat(amountInput) || Math.abs(tx.amount),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setVenmo(data.request);
        setShowVenmoForm(false);
        setPersonInput('');
      } else {
        setVenmoError(data.error || 'Failed to save');
      }
    } catch (err: any) {
      setVenmoError(err.message || 'Failed to save');
    } finally {
      setSavingVenmo(false);
    }
  }

  async function handleVenmoStatusCycle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!venmo) return;
    const next = VENMO_STATUS_NEXT[venmo.status];
    setVenmo((v) => v ? { ...v, status: next } : v);
    await fetch('/api/venmo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: venmo.id, status: next }),
    });
  }

  async function handleVenmoDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!venmo) return;
    await fetch('/api/venmo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: venmo.id }),
    });
    setVenmo(null);
    setShowVenmoForm(false);
  }

  return (
    <div ref={rowRef} className="relative border-b border-sand-100 last:border-0">
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 hover:bg-sand-50 transition-colors cursor-pointer group"
        onClick={onRowClick}
      >
        {/* Category icon — click to change */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowCatPicker((v) => !v); setShowVenmoForm(false); }}
          className="text-lg w-8 text-center flex-shrink-0 hover:scale-110 transition-transform"
          title="Change category"
        >
          {catIcon}
        </button>

        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-700 truncate">{displayName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setShowCatPicker((v) => !v); setShowVenmoForm(false); }}
              className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
              <span className="text-xs text-ink-400">{catName}</span>
            </button>
          </div>
        </div>

        {/* Venmo controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {venmo ? (
            <div className="relative flex items-center gap-1 group/venmo">
              {/* Venmo icon */}
              <button
                onClick={handleVenmoStatusCycle}
                className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                title="Click to advance status"
              >
                <img
                  src="/venmo.svg"
                  alt="Venmo"
                  className="w-5 h-5 transition-all duration-200"
                  style={{ filter: VENMO_STATUS_FILTER[venmo.status] }}
                />
              </button>

              {/* Hover tooltip */}
              <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover/venmo:opacity-100 transition-opacity z-40 w-44">
                <div className="bg-ink-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg space-y-1 relative">
                  <p className="font-medium">{venmo.person_name}</p>
                  <p className="text-white/70">{formatCurrencyPrecise(venmo.amount)}</p>
                  <p className={`font-medium ${
                    venmo.status === 'settled' ? 'text-green-300' :
                    venmo.status === 'requested' ? 'text-blue-300' : 'text-yellow-300'
                  }`}>
                    {venmo.status === 'pending' ? 'Not yet requested' :
                     venmo.status === 'requested' ? 'Request sent' : 'Settled'}
                  </p>
                  <p className="text-white/40 text-xs">Click to advance · hover ✕ to remove</p>
                  {/* Arrow */}
                  <div className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-ink-800" />
                </div>
              </div>

              {/* Delete button */}
              <button
                onClick={handleVenmoDelete}
                className="text-ink-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowVenmoForm((v) => !v); setShowCatPicker(false); }}
              className="w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Request via Venmo"
            >
              <img
                src="/venmo.svg"
                alt="Venmo"
                className="w-5 h-5 transition-all duration-200 hover:scale-110"
                style={{ filter: 'brightness(0) saturate(100%) invert(80%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%)' }}
              />
            </button>
          )}
        </div>

        {/* Amount + date */}
        <div className="text-right flex-shrink-0">
          <p className="font-mono text-sm text-ink-700">{formatCurrencyPrecise(Math.abs(tx.amount))}</p>
          <p className="text-xs text-ink-400 mt-0.5">{formatShortDate(tx.posted_at)}</p>
        </div>
      </div>

      {/* Category picker dropdown */}
      {showCatPicker && (
        <div
          className="absolute left-5 right-5 top-full bg-white border border-sand-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {allCategories.map((cat) => {
            const active = effectiveCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={(e) => handleCategorySelect(cat, e)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-sand-50 transition-colors border-b border-sand-100 last:border-0 ${active ? 'bg-sand-50' : ''}`}
              >
                <span className="text-base w-6 text-center">{cat.icon}</span>
                <span className="flex-1 text-sm text-ink-700">{cat.name}</span>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                {active && (
                  <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Venmo mini-form dropdown */}
      {showVenmoForm && (
        <div
          className="absolute right-5 top-full bg-white border border-sand-200 rounded-xl shadow-lg z-30 p-3 w-64 space-y-2"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold text-ink-500">Request via Venmo</p>
          <div className="relative">
            <input
              autoFocus
              type="text"
              placeholder="Person's name"
              value={personInput}
              onChange={(e) => { setPersonInput(e.target.value); setShowNameDropdown(true); }}
              onFocus={() => setShowNameDropdown(true)}
              onBlur={() => setTimeout(() => setShowNameDropdown(false), 150)}
              className="w-full text-sm px-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
            />
            {showNameDropdown && filteredNames.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-sand-200 rounded-lg shadow-md z-40 max-h-28 overflow-y-auto">
                {filteredNames.map((name) => (
                  <button
                    key={name}
                    onMouseDown={(e) => { e.preventDefault(); setPersonInput(name); setShowNameDropdown(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-ink-700 hover:bg-sand-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full text-sm pl-7 pr-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700"
            />
          </div>
          {venmoError && (
            <p className="text-xs text-red-500 break-all">{venmoError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleVenmoSave}
              disabled={savingVenmo || !personInput.trim()}
              className="flex-1 text-xs font-medium py-1.5 bg-ink-800 text-white rounded-lg hover:bg-ink-700 disabled:opacity-50 transition-colors"
            >
              {savingVenmo ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowVenmoForm(false); }}
              className="text-xs text-ink-400 hover:text-ink-600 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
