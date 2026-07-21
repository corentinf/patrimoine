'use client';

import { useGlobalFilter } from '@/app/lib/globalFilter';
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
  const { activePreset, resolvedRange } = useGlobalFilter();
  const range = activePreset ?? 'custom';
  const customFrom = activePreset ? undefined : resolvedRange.start;
  const customTo = activePreset ? undefined : resolvedRange.end;

  return (
    <>
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
              <span data-sensitive>{totalHoldingsValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>. The remaining{' '}
              <span data-sensitive>{(totalInvestmentValue - totalHoldingsValue).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>{' '}
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
