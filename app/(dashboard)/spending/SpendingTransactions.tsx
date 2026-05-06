'use client';

import { useState, useMemo } from 'react';
import { formatCurrencyPrecise, formatShortDate } from '@/app/lib/utils';
import TransactionDetail, { type FullTransaction } from './TransactionDetail';
import type { Category } from './CategoryManager';

interface Transaction extends FullTransaction {
  account_id: string;
}

interface VenmoRequest {
  transaction_id: string;
  person_name: string;
  status: string;
}

interface SpendingTransactionsProps {
  transactions: Transaction[];
  allCategories: Category[];
  venmoRequests?: VenmoRequest[];
}

type SortField = 'date' | 'amount' | 'category';
type SortDir = 'asc' | 'desc';

export default function SpendingTransactions({
  transactions,
  allCategories,
  venmoRequests = [],
}: SpendingTransactionsProps) {
  const venmoByTxId = useMemo(
    () => new Map(venmoRequests.map((r) => [r.transaction_id, r])),
    [venmoRequests],
  );
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [chipsExpanded, setChipsExpanded] = useState(false);

  const CHIPS_COLLAPSED = 8;

  // Optimistic overrides
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Category>>({});
  const [payeeOverrides, setPayeeOverrides] = useState<Record<string, string>>({});

  // Detail panel
  const [detailTxId, setDetailTxId] = useState<string | null>(null);

  function getEffectiveCategory(tx: Transaction): Transaction['category'] {
    return (categoryOverrides[tx.id] as any) ?? tx.category;
  }

  function getEffectivePayee(tx: Transaction): string {
    return payeeOverrides[tx.id] ?? tx.payee ?? tx.description ?? 'Unknown';
  }

  const chipCategories = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; color: string }>();
    for (const tx of transactions) {
      const cat = getEffectiveCategory(tx);
      const name = cat?.name || 'Uncategorized';
      if (!map.has(name)) map.set(name, { name, icon: cat?.icon || '❓', color: cat?.color || '#D1D5DB' });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categoryOverrides]);

  const filtered = useMemo(() => {
    let result = transactions;

    if (filterCategories.length > 0) {
      result = result.filter((tx) =>
        filterCategories.includes(getEffectiveCategory(tx)?.name || 'Uncategorized'),
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((tx) => {
        const name = getEffectivePayee(tx).toLowerCase();
        const cat = (getEffectiveCategory(tx)?.name || 'Uncategorized').toLowerCase();
        const amount = formatCurrencyPrecise(Math.abs(tx.amount)).toLowerCase();
        return name.includes(q) || cat.includes(q) || amount.includes(q);
      });
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime();
      } else if (sortBy === 'amount') {
        cmp = Math.abs(a.amount) - Math.abs(b.amount);
      } else if (sortBy === 'category') {
        cmp = (getEffectiveCategory(a)?.name || 'Uncategorized').localeCompare(
          getEffectiveCategory(b)?.name || 'Uncategorized',
        );
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, filterCategories, search, sortBy, sortDir, categoryOverrides, payeeOverrides]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'category' ? 'asc' : 'desc');
    }
  }

  const hasFilters = filterCategories.length > 0 || !!search.trim();
  const detailTx = detailTxId ? transactions.find((t) => t.id === detailTxId) : null;

  return (
    <>
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, category, or amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-sand-200 rounded-xl text-sm text-ink-700 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-sand-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort + clear */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-400 mr-1">Sort:</span>
            {(['date', 'amount', 'category'] as SortField[]).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  sortBy === field
                    ? 'bg-ink-800 text-white'
                    : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
                }`}
              >
                {field.charAt(0).toUpperCase() + field.slice(1)}
                {sortBy === field && (
                  <svg
                    className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={() => { setFilterCategories([]); setSearch(''); }}
              className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Category filter chips — wrapping, collapsible, multi-select */}
        <div>
          <div className="flex flex-wrap gap-2">
            {/* All chip */}
            <button
              onClick={() => setFilterCategories([])}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterCategories.length === 0
                  ? 'bg-ink-800 text-white'
                  : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
              }`}
            >
              All
            </button>

            {/* Category chips */}
            {(chipsExpanded ? chipCategories : chipCategories.slice(0, CHIPS_COLLAPSED)).map((cat) => {
              const active = filterCategories.includes(cat.name);
              return (
                <button
                  key={cat.name}
                  onClick={() =>
                    setFilterCategories((prev) =>
                      active ? prev.filter((n) => n !== cat.name) : [...prev, cat.name],
                    )
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    active ? 'text-white' : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
                  }`}
                  style={active ? { backgroundColor: cat.color } : {}}
                >
                  <span>{cat.icon}</span>
                  {cat.name}
                </button>
              );
            })}

            {/* Expand / collapse toggle */}
            {chipCategories.length > CHIPS_COLLAPSED && (
              <button
                onClick={() => setChipsExpanded((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-white border border-sand-200 text-ink-500 hover:border-sand-300 transition-colors"
              >
                {chipsExpanded ? (
                  <>
                    Show less
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </>
                ) : (
                  <>
                    +{chipCategories.length - CHIPS_COLLAPSED} more
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Transaction list */}
        <div className="card p-0 divide-y divide-sand-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-ink-400 text-sm">
              No transactions match your search.
            </div>
          ) : (
            filtered.map((tx) => {
              const cat = getEffectiveCategory(tx);
              const displayName = getEffectivePayee(tx);
              const catName = cat?.name || 'Uncategorized';
              const catColor = cat?.color || '#D1D5DB';
              const catIcon = cat?.icon || '❓';

              const venmo = venmoByTxId.get(tx.id);

              return (
                <button
                  key={tx.id}
                  onClick={() => setDetailTxId(tx.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-sand-50 transition-colors focus:outline-none"
                >
                  <span className="text-lg w-8 text-center flex-shrink-0">{catIcon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink-700 truncate">{displayName}</p>
                      {venmo && (
                        <span className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          venmo.status === 'requested' ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {venmo.status === 'requested' ? `↗ ${venmo.person_name}` : `$ ${venmo.person_name}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                      <p className="text-xs text-ink-400 truncate">{catName}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-sm text-ink-700">
                      {formatCurrencyPrecise(Math.abs(tx.amount))}
                    </p>
                    <p className="text-xs text-ink-400 mt-0.5">{formatShortDate(tx.posted_at)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-ink-400 text-center">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
            {hasFilters && ` · filtered from ${transactions.length}`}
          </p>
        )}
      </div>

      {/* Transaction detail panel */}
      {detailTx && (
        <TransactionDetail
          transaction={detailTx}
          allCategories={allCategories}
          onClose={() => setDetailTxId(null)}
          onCategoryChange={(txId, cat) => {
            // Mirror server behaviour: bulk-update all transactions sharing
            // the same original payee (or description when payee is absent).
            const source = transactions.find((t) => t.id === txId);
            setCategoryOverrides((prev) => {
              const next = { ...prev };
              for (const t of transactions) {
                const matches = source?.payee
                  ? t.payee === source.payee
                  : t.description === source?.description;
                if (matches) next[t.id] = cat;
              }
              return next;
            });
          }}
          onPayeeChange={(txId, payee) =>
            setPayeeOverrides((prev) => ({ ...prev, [txId]: payee }))
          }
        />
      )}
    </>
  );
}
