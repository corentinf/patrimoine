'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrencyPrecise, formatShortDate, amountColor, groupAndSortCategories, filterCategoryGroups } from '@/app/lib/utils';
import { assignTransactionCategory, toggleTransfer } from './actions';
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
  localIsTransfer: boolean;
  isReimbursable: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onCategoryChange: (txId: string, cat: Category) => void;
  onTransferChange: (txId: string, value: boolean) => void;
  onRowClick: () => void;
}

export default function TransactionRow({
  tx,
  allCategories,
  initialVenmo,
  knownVenmoNames,
  localCategory,
  localIsTransfer,
  isReimbursable,
  selectMode,
  selected,
  onToggleSelect,
  onCategoryChange,
  onTransferChange,
  onRowClick,
}: TransactionRowProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const effectiveCategory = localCategory ?? tx.category;
  const catIcon = effectiveCategory?.icon ?? '❓';
  const catName = effectiveCategory?.name ?? 'Uncategorized';
  const catColor = effectiveCategory?.color ?? '#D1D5DB';
  const displayName = tx.payee ?? tx.description ?? 'Unknown';
  const isTransfer = localIsTransfer;

  // Category picker
  const rowRef = useRef<HTMLDivElement>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [catPickerUp, setCatPickerUp] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const filteredCatGroups = filterCategoryGroups(groupAndSortCategories(allCategories), catSearch);

  function toggleCatPicker(e: React.MouseEvent) {
    e.stopPropagation();
    if (selectMode) return;
    if (!showCatPicker) {
      const rect = rowRef.current?.getBoundingClientRect();
      setCatPickerUp(!!rect && window.innerHeight - rect.bottom < 320);
    }
    setShowCatPicker((v) => !v);
    setCatSearch('');
    setShowVenmoForm(false);
  }

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

  const anyPickerOpen = showCatPicker || showVenmoForm;

  function handleCategorySelect(cat: Category, e: React.MouseEvent) {
    e.stopPropagation();
    onCategoryChange(tx.id, cat);
    setShowCatPicker(false);
    setCatSearch('');
    startTransition(async () => {
      await assignTransactionCategory(tx.id, cat.id);
      router.refresh();
    });
  }

  function handleTransferToggle(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !isTransfer;
    onTransferChange(tx.id, next);
    startTransition(() => toggleTransfer(tx.id, next));
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
      {/* Backdrop — closes any open picker when clicking outside */}
      {anyPickerOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => { setShowCatPicker(false); setCatSearch(''); setShowVenmoForm(false); }}
        />
      )}
      {/* Main row */}
      <div
        className={`flex items-center gap-4 px-5 py-3.5 transition-colors cursor-pointer group ${
          selected ? 'bg-sand-100' : isTransfer ? 'bg-sand-50/60' : 'hover:bg-sand-50'
        }`}
        onClick={selectMode ? onToggleSelect : onRowClick}
      >
        {/* Checkbox — select mode only */}
        {selectMode && (
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="w-4 h-4 rounded accent-ink-800 cursor-pointer"
            />
          </div>
        )}

        {/* Category emoji — click to change */}
        <button
          onClick={toggleCatPicker}
          className="text-lg w-8 text-center flex-shrink-0 hover:scale-110 transition-transform"
          title="Change category"
        >
          {catIcon}
        </button>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <p data-sensitive className={`text-sm font-medium truncate ${isTransfer ? 'text-ink-400' : 'text-ink-700'}`}>
            {displayName}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {isTransfer ? (
              <span className="text-xs text-ink-300">↔ Transfer</span>
            ) : (
              <button
                onClick={toggleCatPicker}
                className="inline-block hover:opacity-70 transition-opacity"
              >
                <span
                  className="inline-block px-1.5 py-px rounded text-[10px] font-medium whitespace-nowrap"
                  style={{ backgroundColor: catColor + '20', color: catColor }}
                >
                  {catName}
                </span>
              </button>
            )}
            {isReimbursable && (
              <span className="text-[10px] font-medium px-1.5 py-px rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                ↩ reimb.
              </span>
            )}
            {tx.account && (
              <span className="text-xs text-ink-300 truncate">
                {tx.account.institution || tx.account.name}
                {tx.account.institution && tx.account.name !== tx.account.institution && (
                  <> · {tx.account.name}</>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Venmo */}
          {venmo ? (
            <div className="relative flex items-center gap-1 group/venmo">
              <button
                onClick={handleVenmoStatusCycle}
                className="w-6 h-6 flex items-center justify-center"
                title="Click to advance status"
              >
                <img src="/venmo.svg" alt="Venmo" className="w-5 h-5"
                  style={{ filter: VENMO_STATUS_FILTER[venmo.status] }} />
              </button>
              <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover/venmo:opacity-100 transition-opacity z-40 w-44">
                <div className="bg-ink-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg space-y-1 relative">
                  <p className="font-medium">{venmo.person_name}</p>
                  <p className="text-white/70">{formatCurrencyPrecise(venmo.amount)}</p>
                  <p className={`font-medium ${venmo.status === 'settled' ? 'text-green-300' : venmo.status === 'requested' ? 'text-blue-300' : 'text-yellow-300'}`}>
                    {venmo.status === 'pending' ? 'Not yet requested' : venmo.status === 'requested' ? 'Request sent' : 'Settled'}
                  </p>
                  <div className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent border-l-ink-800" />
                </div>
              </div>
              <button onClick={handleVenmoDelete} className="text-ink-200 hover:text-red-400 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowVenmoForm((v) => !v); setShowCatPicker(false); setCatSearch(''); }}
              className="w-6 h-6 flex items-center justify-center"
              title="Request via Venmo"
            >
              <img src="/venmo.svg" alt="Venmo" className="w-5 h-5 hover:scale-110 transition-transform"
                style={{ filter: 'brightness(0) saturate(100%) invert(80%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%)' }} />
            </button>
          )}
          {/* Transfer toggle */}
          <button
            onClick={handleTransferToggle}
            title={isTransfer ? 'Mark as expense' : 'Mark as transfer'}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${isTransfer ? 'text-ink-500' : 'text-ink-300 hover:text-ink-600'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>
        </div>

        {/* Date */}
        <span className="text-xs text-ink-300 flex-shrink-0 hidden sm:block w-14 text-right">
          {formatShortDate(tx.posted_at)}
        </span>

        {/* Amount */}
        <span className={`font-mono text-sm font-medium flex-shrink-0 w-20 text-right ${isTransfer ? 'text-ink-300 line-through' : amountColor(tx.amount)}`}>
          {formatCurrencyPrecise(Math.abs(tx.amount))}
        </span>
      </div>

      {/* Category picker dropdown */}
      {showCatPicker && (
        <div
          className={`absolute left-5 right-5 bg-white border border-sand-200 rounded-xl shadow-lg z-30 flex flex-col max-h-72 ${
            catPickerUp ? 'bottom-full' : 'top-full'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-sand-100 flex-shrink-0">
            <input
              autoFocus
              type="text"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Search categories…"
              className="w-full text-sm px-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
            />
          </div>
          <div className="overflow-y-auto">
          {filteredCatGroups.map(({ parent, children }) => {
            const parentActive = effectiveCategory?.id === parent.id;
            return (
              <div key={parent.id} className="border-b border-sand-100 last:border-0">
                <button
                  onClick={(e) => handleCategorySelect(parent, e)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-sand-50 transition-colors ${parentActive ? 'bg-sand-50' : ''}`}
                >
                  <span className="text-base w-6 text-center">{parent.icon}</span>
                  <span className="flex-1 text-sm text-ink-700">{parent.name}</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color as string }} />
                  {parentActive && (
                    <svg className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {children.map((child) => {
                  const childActive = effectiveCategory?.id === child.id;
                  return (
                    <button
                      key={child.id}
                      onClick={(e) => handleCategorySelect(child, e)}
                      className={`w-full flex items-center gap-3 pl-10 pr-4 py-1.5 text-left hover:bg-sand-50 transition-colors border-t border-sand-50 ${childActive ? 'bg-sand-100' : ''}`}
                    >
                      <span className="text-sm w-5 text-center">{child.icon}</span>
                      <span className="flex-1 text-xs text-ink-600">{child.name}</span>
                      {childActive && (
                        <svg className="w-3 h-3 text-ink-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filteredCatGroups.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-300 text-center">No categories found</p>
          )}
          </div>
        </div>
      )}

      {/* Venmo mini-form dropdown */}
      {showVenmoForm && (
        <div
          className="absolute right-5 top-full bg-white border border-sand-200 rounded-xl shadow-lg z-30 p-3 w-64 space-y-2"
          onClick={(e) => e.stopPropagation()}
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
