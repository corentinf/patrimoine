'use client';

import { useState } from 'react';
import { formatCurrency } from '@/app/lib/utils';

export interface Holding {
  id: string;
  symbol: string | null;
  description: string | null;
  shares: number | string;
  cost_basis: number | string | null;
  market_value: number | string | null;
  account: { name: string; institution: string } | null;
}

type SortKey = 'symbol' | 'shares' | 'cost_basis' | 'market_value' | 'gain' | 'gain_pct' | 'portfolio_pct';

interface HoldingsTableProps {
  holdings: Holding[];
  totalHoldingsValue: number;
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return dir === 'asc' ? (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function HoldingsTable({ holdings, totalHoldingsValue }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('market_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Symbol sorts asc by default; numeric columns sort desc
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  }

  const enriched = holdings.map((h) => {
    const marketValue = Number(h.market_value || 0);
    const costBasis = Number(h.cost_basis || 0);
    const gain = marketValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const portfolioPct = totalHoldingsValue > 0 ? (marketValue / totalHoldingsValue) * 100 : 0;
    return { ...h, _market_value: marketValue, _cost_basis: costBasis, _gain: gain, _gain_pct: gainPct, _portfolio_pct: portfolioPct };
  });

  const sorted = [...enriched].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'symbol':
        cmp = (a.symbol || a.description || '').localeCompare(b.symbol || b.description || '');
        break;
      case 'shares':
        cmp = Number(a.shares) - Number(b.shares);
        break;
      case 'cost_basis':
        cmp = a._cost_basis - b._cost_basis;
        break;
      case 'market_value':
        cmp = a._market_value - b._market_value;
        break;
      case 'gain':
        cmp = a._gain - b._gain;
        break;
      case 'gain_pct':
        cmp = a._gain_pct - b._gain_pct;
        break;
      case 'portfolio_pct':
        cmp = a._portfolio_pct - b._portfolio_pct;
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalCost = enriched.reduce((s, h) => s + h._cost_basis, 0);
  const totalGain = totalHoldingsValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  function ColHeader({
    label,
    col,
    className = '',
  }: {
    label: string;
    col: SortKey;
    className?: string;
  }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors ${
          active ? 'text-ink-600' : 'text-ink-400 hover:text-ink-500'
        } ${className}`}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    );
  }

  return (
    <div className="card p-0">
      {/* Desktop header */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2.5 border-b border-sand-100">
        <div className="col-span-3">
          <ColHeader label="Holding" col="symbol" />
        </div>
        <div className="col-span-1 flex justify-end">
          <ColHeader label="Shares" col="shares" />
        </div>
        <div className="col-span-2 flex justify-end">
          <ColHeader label="Cost basis" col="cost_basis" />
        </div>
        <div className="col-span-2 flex justify-end">
          <ColHeader label="Market value" col="market_value" />
        </div>
        <div className="col-span-2 flex justify-end">
          <ColHeader label="Gain/Loss" col="gain" />
        </div>
        <div className="col-span-2 flex justify-end">
          <ColHeader label="Portfolio" col="portfolio_pct" />
        </div>
      </div>

      {sorted.map((h) => (
        <div key={h.id} className="border-b border-sand-50 last:border-0 hover:bg-sand-50 transition-colors">
          {/* Desktop row */}
          <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 items-center">
            <div className="col-span-3">
              <p className="text-sm font-medium text-ink-700">{h.symbol || h.description}</p>
              <p className="text-xs text-ink-300 truncate">{h.description}</p>
            </div>
            <div className="col-span-1 text-right font-mono text-sm text-ink-600">
              {Number(h.shares).toFixed(2)}
            </div>
            <div className="col-span-2 text-right font-mono text-sm text-ink-600">
              {formatCurrency(h._cost_basis)}
            </div>
            <div className="col-span-2 text-right font-mono text-sm font-medium text-ink-700">
              {formatCurrency(h._market_value)}
            </div>
            <div className={`col-span-2 text-right font-mono text-sm font-medium ${h._gain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {h._gain >= 0 ? '+' : ''}{formatCurrency(h._gain)}
              <span className="text-xs ml-1 opacity-70">
                ({h._gain_pct >= 0 ? '+' : ''}{h._gain_pct.toFixed(1)}%)
              </span>
            </div>
            <div className="col-span-2 flex flex-col items-end gap-1">
              <span className="font-mono text-xs text-ink-600">{h._portfolio_pct.toFixed(1)}%</span>
              <div className="w-full h-1 bg-sand-100 rounded-full overflow-hidden">
                <div className="h-full bg-ink-400 rounded-full" style={{ width: `${h._portfolio_pct}%` }} />
              </div>
            </div>
          </div>
          {/* Mobile card */}
          <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-700">{h.symbol || h.description}</p>
              <p className="text-xs text-ink-400">
                {Number(h.shares).toFixed(2)} shares · {h._portfolio_pct.toFixed(1)}% of portfolio
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-sm font-medium text-ink-700">{formatCurrency(h._market_value)}</p>
              <p className={`font-mono text-xs font-medium ${h._gain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {h._gain >= 0 ? '+' : ''}{formatCurrency(h._gain)} ({h._gain_pct >= 0 ? '+' : ''}{h._gain_pct.toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Total row */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 border-t border-sand-200 bg-sand-50 rounded-b-xl items-center">
        <div className="col-span-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Total</div>
        <div className="col-span-1" />
        <div className="col-span-2 text-right font-mono text-sm text-ink-600">{formatCurrency(totalCost)}</div>
        <div className="col-span-2 text-right font-mono text-sm font-semibold text-ink-800">{formatCurrency(totalHoldingsValue)}</div>
        <div className={`col-span-2 text-right font-mono text-sm font-semibold ${totalGain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
          {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)}
          <span className="text-xs ml-1 opacity-70">({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)</span>
        </div>
        <div className="col-span-2 text-right font-mono text-xs text-ink-400">100%</div>
      </div>
    </div>
  );
}
