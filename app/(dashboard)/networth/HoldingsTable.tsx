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
type Group = 'Broad Market ETFs' | 'Sector/Specialty ETFs' | 'Bonds' | 'Individual Stocks';

const GROUPS: Group[] = ['Broad Market ETFs', 'Sector/Specialty ETFs', 'Bonds', 'Individual Stocks'];

function classifyHolding(symbol: string | null, description: string | null): Group {
  const sym = (symbol || '').toUpperCase();
  const desc = (description || '').toLowerCase();

  // Bonds — keyword or known tickers
  const BOND_SYMS = new Set(['AGG', 'BND', 'TLT', 'IEF', 'SHY', 'LQD', 'VCIT', 'VCSH', 'BNDX', 'VTIP', 'VGSH', 'VGIT', 'VGLT', 'BSV', 'BIV', 'BLV', 'FBND', 'FXNAX', 'VBTLX', 'VBMFX']);
  if (BOND_SYMS.has(sym) || desc.includes('bond') || desc.includes('fixed income') || desc.includes('treasury') || desc.includes('tips')) {
    return 'Bonds';
  }

  // Broad Market — total/broad market index covering entire equity market or S&P 500
  const BROAD_SYMS = new Set(['VTI', 'VTSAX', 'VOO', 'SPY', 'IVV', 'VT', 'ITOT', 'SCHB', 'SWTSX', 'FZROX', 'FSKAX', 'FXAIX', 'VXUS', 'VEA', 'VWO', 'VTSMX', 'VGTSX', 'VFIAX']);
  const BROAD_KEYWORDS = ['total stock', 'total market', 's&p 500', '500 index', 'total world', 'total international', 'broad market', 'russell 3000'];
  if (BROAD_SYMS.has(sym) || BROAD_KEYWORDS.some((k) => desc.includes(k))) {
    return 'Broad Market ETFs';
  }

  // Sector/Specialty — any other fund or ETF (provider name, fund/etf keyword, or mutual fund ticker pattern)
  const isFund =
    desc.includes('vanguard') || desc.includes('ishares') || desc.includes('fidelity') ||
    desc.includes('schwab') || desc.includes('spdr') || desc.includes('invesco') ||
    desc.includes('wisdomtree') || desc.includes(' etf') || desc.includes('index fund') ||
    desc.includes(' fund') || (sym.length === 5 && sym.endsWith('X'));

  return isFund ? 'Sector/Specialty ETFs' : 'Individual Stocks';
}

interface HoldingsTableProps {
  holdings: Holding[];
  totalHoldingsValue: number;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group/tip inline-flex items-center ml-1">
      <svg className="w-3 h-3 text-ink-300 group-hover/tip:text-ink-500 transition-colors cursor-default flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4M12 8h.01" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-ink-800 text-white text-xs rounded-lg px-3 py-2 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink-800" />
      </span>
    </span>
  );
}

function Kpi({ label, tooltip, value, sub, valueColor = 'text-ink-800' }: {
  label: string; tooltip: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div className="bg-white border border-sand-100 rounded-xl px-4 py-3.5 flex flex-col gap-1">
      <div className="flex items-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
        <InfoTooltip text={tooltip} />
      </div>
      <p className={`font-mono text-lg font-semibold leading-tight ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-ink-400 font-mono">{sub}</p>}
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return (
    <svg className="w-3 h-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
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
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  }

  // Enrich and classify all holdings
  const enriched = holdings.map((h) => {
    const marketValue = Number(h.market_value || 0);
    const costBasis = Number(h.cost_basis || 0);
    const gain = marketValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const portfolioPct = totalHoldingsValue > 0 ? (marketValue / totalHoldingsValue) * 100 : 0;
    const group = classifyHolding(h.symbol, h.description);
    return { ...h, _market_value: marketValue, _cost_basis: costBasis, _gain: gain, _gain_pct: gainPct, _portfolio_pct: portfolioPct, _group: group };
  });

  // Group summary — always computed from all holdings
  const groupSummary = GROUPS.map((group) => {
    const items = enriched.filter((h) => h._group === group);
    if (items.length === 0) return null;
    const mv = items.reduce((s, h) => s + h._market_value, 0);
    const cost = items.reduce((s, h) => s + h._cost_basis, 0);
    const gain = mv - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    const portfolioPct = totalHoldingsValue > 0 ? (mv / totalHoldingsValue) * 100 : 0;
    return { group, count: items.length, mv, cost, gain, gainPct, portfolioPct };
  }).filter(Boolean) as { group: Group; count: number; mv: number; cost: number; gain: number; gainPct: number; portfolioPct: number }[];

  // KPI totals — always the full portfolio, unaffected by group filter
  const kpiValue = enriched.reduce((s, h) => s + h._market_value, 0);
  const kpiCost = enriched.reduce((s, h) => s + h._cost_basis, 0);
  const kpiGain = kpiValue - kpiCost;
  const kpiGainPct = kpiCost > 0 ? (kpiGain / kpiCost) * 100 : 0;
  const winners = enriched.filter((h) => h._cost_basis > 0);
  const bestPerformer = winners.length > 0 ? winners.reduce((b, h) => h._gain_pct > b._gain_pct ? h : b) : null;
  const worstPerformer = winners.length > 0 ? winners.reduce((w, h) => h._gain_pct < w._gain_pct ? h : w) : null;

  // Active holdings (filtered by group when selected) — used for table + total row
  const activeHoldings = selectedGroup
    ? enriched.filter((h) => h._group === selectedGroup)
    : enriched;
  const activeValue = activeHoldings.reduce((s, h) => s + h._market_value, 0);
  const activeCost = activeHoldings.reduce((s, h) => s + h._cost_basis, 0);
  const activeGain = activeValue - activeCost;
  const activeGainPct = activeCost > 0 ? (activeGain / activeCost) * 100 : 0;
  const activePortfolioPct = totalHoldingsValue > 0 ? (activeValue / totalHoldingsValue) * 100 : 100;
  const activeWinners = activeHoldings.filter((h) => h._cost_basis > 0);
  const activeBest = activeWinners.length > 0 ? activeWinners.reduce((b, h) => h._gain_pct > b._gain_pct ? h : b) : null;
  const activeWorst = activeWinners.length > 0 ? activeWinners.reduce((w, h) => h._gain_pct < w._gain_pct ? h : w) : null;

  // Sorted table rows
  const sorted = [...activeHoldings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'symbol':      cmp = (a.symbol || a.description || '').localeCompare(b.symbol || b.description || ''); break;
      case 'shares':      cmp = Number(a.shares) - Number(b.shares); break;
      case 'cost_basis':  cmp = a._cost_basis - b._cost_basis; break;
      case 'market_value':cmp = a._market_value - b._market_value; break;
      case 'gain':        cmp = a._gain - b._gain; break;
      case 'gain_pct':    cmp = a._gain_pct - b._gain_pct; break;
      case 'portfolio_pct': cmp = a._portfolio_pct - b._portfolio_pct; break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function ColHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors ${active ? 'text-ink-600' : 'text-ink-400 hover:text-ink-500'}`}
      >
        {label}<SortIcon active={active} dir={sortDir} />
      </button>
    );
  }

  return (
    <div className="space-y-4">

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          label="Market Value"
          tooltip="Current total market value of all your investment positions at today's prices."
          value={formatCurrency(kpiValue)}
        />
        <Kpi
          label="Total Return"
          tooltip="Total unrealized gain or loss across all positions — the difference between current market value and what you originally paid (cost basis)."
          value={`${kpiGain >= 0 ? '+' : ''}${formatCurrency(kpiGain)}`}
          sub={`${kpiGainPct >= 0 ? '+' : ''}${kpiGainPct.toFixed(1)}% overall`}
          valueColor={kpiGain >= 0 ? 'text-accent-green' : 'text-accent-red'}
        />
        <Kpi
          label="Cost Basis"
          tooltip="Total amount paid to acquire all positions, used as the baseline for calculating unrealized gains and losses."
          value={formatCurrency(kpiCost)}
        />
        <Kpi
          label="Avg Return"
          tooltip="Weighted average return across selected positions, weighted by cost basis."
          value={`${kpiGainPct >= 0 ? '+' : ''}${kpiGainPct.toFixed(1)}%`}
          valueColor={kpiGainPct >= 0 ? 'text-accent-green' : 'text-accent-red'}
        />
        {bestPerformer && (
          <Kpi
            label="Best Performer"
            tooltip="Highest-returning position in the current selection, by percentage gain since purchase."
            value={bestPerformer.symbol || bestPerformer.description || '—'}
            sub={`+${bestPerformer._gain_pct.toFixed(1)}%`}
            valueColor="text-accent-green"
          />
        )}
        {worstPerformer && (
          <Kpi
            label="Worst Performer"
            tooltip="Lowest-returning position in the current selection, by percentage gain since purchase."
            value={worstPerformer.symbol || worstPerformer.description || '—'}
            sub={`${worstPerformer._gain_pct >= 0 ? '+' : ''}${worstPerformer._gain_pct.toFixed(1)}%`}
            valueColor={worstPerformer._gain_pct >= 0 ? 'text-ink-800' : 'text-accent-red'}
          />
        )}
      </div>

      {/* Group filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedGroup(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedGroup === null
              ? 'bg-ink-800 text-white'
              : 'bg-sand-100 text-ink-500 hover:bg-sand-200'
          }`}
        >
          All
        </button>
        {GROUPS.filter((g) => groupSummary.some((s) => s.group === g)).map((g) => (
          <button
            key={g}
            onClick={() => setSelectedGroup(selectedGroup === g ? null : g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              selectedGroup === g
                ? 'bg-ink-800 text-white'
                : 'bg-sand-100 text-ink-500 hover:bg-sand-200'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Group KPIs — shown only when a filter is active */}
      {selectedGroup && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            label="Market Value"
            tooltip={`Current total market value of ${selectedGroup} positions.`}
            value={formatCurrency(activeValue)}
            sub={`${activePortfolioPct.toFixed(1)}% of portfolio`}
          />
          <Kpi
            label="Total Return"
            tooltip={`Total unrealized gain or loss across ${selectedGroup} positions.`}
            value={`${activeGain >= 0 ? '+' : ''}${formatCurrency(activeGain)}`}
            sub={`${activeGainPct >= 0 ? '+' : ''}${activeGainPct.toFixed(1)}% overall`}
            valueColor={activeGain >= 0 ? 'text-accent-green' : 'text-accent-red'}
          />
          <Kpi
            label="Cost Basis"
            tooltip={`Total amount paid to acquire ${selectedGroup} positions.`}
            value={formatCurrency(activeCost)}
          />
          <Kpi
            label="Avg Return"
            tooltip={`Weighted average return across ${selectedGroup} positions.`}
            value={`${activeGainPct >= 0 ? '+' : ''}${activeGainPct.toFixed(1)}%`}
            valueColor={activeGainPct >= 0 ? 'text-accent-green' : 'text-accent-red'}
          />
          {activeBest && (
            <Kpi
              label="Best Performer"
              tooltip={`Highest-returning ${selectedGroup} position by % gain.`}
              value={activeBest.symbol || activeBest.description || '—'}
              sub={`+${activeBest._gain_pct.toFixed(1)}%`}
              valueColor="text-accent-green"
            />
          )}
          {activeWorst && (
            <Kpi
              label="Worst Performer"
              tooltip={`Lowest-returning ${selectedGroup} position by % gain.`}
              value={activeWorst.symbol || activeWorst.description || '—'}
              sub={`${activeWorst._gain_pct >= 0 ? '+' : ''}${activeWorst._gain_pct.toFixed(1)}%`}
              valueColor={activeWorst._gain_pct >= 0 ? 'text-ink-800' : 'text-accent-red'}
            />
          )}
        </div>
      )}

      {/* Group breakdown — only in All view */}
      {!selectedGroup && groupSummary.length > 1 && (
        <div className="card p-0 overflow-hidden">
          {groupSummary.map((g, i) => (
              <div
                key={g.group}
                className={`grid grid-cols-12 gap-2 px-5 py-3 items-center ${i > 0 ? 'border-t border-sand-100' : ''}`}
              >
                <div className="col-span-4 sm:col-span-3">
                  <p className="text-xs font-medium text-ink-700">{g.group}</p>
                  <p className="text-[10px] text-ink-400">{g.count} holding{g.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="col-span-4 sm:col-span-3 text-right">
                  <p className="font-mono text-xs font-medium text-ink-700">{formatCurrency(g.mv)}</p>
                  <p className="text-[10px] text-ink-400">{g.portfolioPct.toFixed(1)}% of portfolio</p>
                </div>
                <div className={`col-span-4 sm:col-span-3 text-right font-mono text-xs font-medium ${g.gain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {g.gain >= 0 ? '+' : ''}{formatCurrency(g.gain)}
                  <span className="ml-1 opacity-70">({g.gainPct >= 0 ? '+' : ''}{g.gainPct.toFixed(1)}%)</span>
                </div>
                <div className="hidden sm:block col-span-3">
                  <div className="flex-1 h-1.5 bg-sand-100 rounded-full overflow-hidden">
                    <div className="h-full bg-ink-300 rounded-full" style={{ width: `${g.portfolioPct}%` }} />
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Holdings table */}
      <div className="card p-0">
        {/* Desktop header */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2.5 border-b border-sand-100">
          <div className="col-span-3"><ColHeader label="Holding" col="symbol" /></div>
          <div className="col-span-1 flex justify-end"><ColHeader label="Shares" col="shares" /></div>
          <div className="col-span-2 flex justify-end"><ColHeader label="Cost basis" col="cost_basis" /></div>
          <div className="col-span-2 flex justify-end"><ColHeader label="Market value" col="market_value" /></div>
          <div className="col-span-2 flex justify-end items-center gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-400">Gain/Loss</span>
            <button
              onClick={() => handleSort('gain')}
              className={`flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors px-1 py-0.5 rounded ${sortKey === 'gain' ? 'text-ink-600 bg-sand-100' : 'text-ink-400 hover:text-ink-500'}`}
            >
              $<SortIcon active={sortKey === 'gain'} dir={sortDir} />
            </button>
            <button
              onClick={() => handleSort('gain_pct')}
              className={`flex items-center gap-0.5 text-xs font-medium uppercase tracking-wider transition-colors px-1 py-0.5 rounded ${sortKey === 'gain_pct' ? 'text-ink-600 bg-sand-100' : 'text-ink-400 hover:text-ink-500'}`}
            >
              %<SortIcon active={sortKey === 'gain_pct'} dir={sortDir} />
            </button>
          </div>
          <div className="col-span-2 flex justify-end"><ColHeader label="Portfolio" col="portfolio_pct" /></div>
        </div>

        {sorted.map((h) => (
          <div key={h.id} className="border-b border-sand-50 last:border-0 hover:bg-sand-50 transition-colors">
            {/* Desktop row */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 items-center">
              <div className="col-span-3">
                <p className="text-sm font-medium text-ink-700">{h.symbol || h.description}</p>
                <p className="text-xs text-ink-300 truncate">{h.description}</p>
              </div>
              <div className="col-span-1 text-right font-mono text-sm text-ink-600">{Number(h.shares).toFixed(2)}</div>
              <div className="col-span-2 text-right font-mono text-sm text-ink-600">{formatCurrency(h._cost_basis)}</div>
              <div className="col-span-2 text-right font-mono text-sm font-medium text-ink-700">{formatCurrency(h._market_value)}</div>
              <div className={`col-span-2 text-right font-mono text-sm font-medium ${h._gain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {h._gain >= 0 ? '+' : ''}{formatCurrency(h._gain)}
                <span className="text-xs ml-1 opacity-70">({h._gain_pct >= 0 ? '+' : ''}{h._gain_pct.toFixed(1)}%)</span>
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
                <p className="text-xs text-ink-400">{Number(h.shares).toFixed(2)} shares · {h._portfolio_pct.toFixed(1)}% of portfolio</p>
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
          <div className="col-span-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">
            {selectedGroup ?? 'Total'}
          </div>
          <div className="col-span-1" />
          <div className="col-span-2 text-right font-mono text-sm text-ink-600">{formatCurrency(activeCost)}</div>
          <div className="col-span-2 text-right font-mono text-sm font-semibold text-ink-800">{formatCurrency(activeValue)}</div>
          <div className={`col-span-2 text-right font-mono text-sm font-semibold ${activeGain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {activeGain >= 0 ? '+' : ''}{formatCurrency(activeGain)}
            <span className="text-xs ml-1 opacity-70">({activeGainPct >= 0 ? '+' : ''}{activeGainPct.toFixed(1)}%)</span>
          </div>
          <div className="col-span-2 text-right font-mono text-xs text-ink-400">
            {selectedGroup ? `${activePortfolioPct.toFixed(1)}%` : '100%'}
          </div>
        </div>
      </div>
    </div>
  );
}
