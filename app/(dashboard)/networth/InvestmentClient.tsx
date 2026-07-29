'use client';

import { useMemo } from 'react';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { formatCurrency, amountColor } from '@/app/lib/utils';
import { isoDate, buildCombinedSeries, seriesChange } from '@/app/lib/investmentRange';
import { usePrivacy } from '@/app/lib/privacy';
import InvestmentProgress from './InvestmentProgress';
import HoldingsTable, { type Holding } from './HoldingsTable';
import type { InvestmentAccountSeries } from './page';

interface InvestmentClientProps {
  dates: string[];
  accounts: InvestmentAccountSeries[];
  liveHoldings: Holding[];
  totalHoldingsValue: number;
  totalInvestmentValue: number;
  priceDates: string[];
  priceSeries: Record<string, (number | null)[]>;
}

export default function InvestmentClient({
  dates,
  accounts,
  liveHoldings,
  totalHoldingsValue,
  totalInvestmentValue,
  priceDates,
  priceSeries,
}: InvestmentClientProps) {
  // Not otherwise used here — but subscribing is what makes this component
  // re-render (and every formatCurrency() call below re-check demo mode)
  // when the toggle in Header/Profile changes it.
  usePrivacy();
  const { activePreset, resolvedRange } = useGlobalFilter();
  const range = activePreset ?? 'custom';
  const customFrom = activePreset ? undefined : resolvedRange.start;
  const customTo = activePreset ? undefined : resolvedRange.end;

  const { change, pct } = useMemo(() => {
    const todayIso = isoDate(new Date());
    const series = buildCombinedSeries(dates, accounts, todayIso, totalInvestmentValue);
    return seriesChange(series, resolvedRange.start, resolvedRange.end, totalInvestmentValue);
  }, [dates, accounts, totalInvestmentValue, resolvedRange.start, resolvedRange.end]);

  return (
    <>
      <div className="card px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-lg text-ink-800">Investment holdings</h2>
          <span className="stat-label">Total value</span>
          <span className="stat-value text-xl" data-sensitive>{formatCurrency(totalInvestmentValue)}</span>
        </div>
        <p className={`text-xs font-mono mt-1 ${amountColor(change)}`} data-sensitive>
          {change >= 0 ? '+' : ''}{formatCurrency(change)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%) over period
        </p>
      </div>

      <InvestmentProgress
        dates={dates}
        accounts={accounts}
        rangeStart={resolvedRange.start}
        rangeEnd={resolvedRange.end}
      />

      {liveHoldings.length > 0 && (
        <div className="space-y-2">
          {totalInvestmentValue - totalHoldingsValue > 1 && (
            <p className="text-xs text-ink-400">
              Line items below cover{' '}
              <span data-sensitive>{formatCurrency(totalHoldingsValue)}</span>. The remaining{' '}
              <span data-sensitive>{formatCurrency(totalInvestmentValue - totalHoldingsValue)}</span>{' '}
              is in accounts that don&apos;t report individual holdings (e.g. 401k, HSA).
            </p>
          )}
          <HoldingsTable
            holdings={liveHoldings}
            totalHoldingsValue={totalHoldingsValue}
            priceDates={priceDates}
            priceSeries={priceSeries}
            externalRange={range}
            externalCustomFrom={customFrom}
            externalCustomTo={customTo}
          />
        </div>
      )}
    </>
  );
}
