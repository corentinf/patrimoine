'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { formatCurrency } from '@/app/lib/utils';
import { isLockedRetirementAccount } from '@/app/lib/accounts';
import SummaryCard from '@/app/components/SummaryCard';
import { useDeepLink } from '@/app/lib/deepLink';
import StickyRail from '@/app/components/StickyRail';
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
  /** Rendered under the key-figures card in the right rail (the AI portfolio insights). */
  children?: ReactNode;
}

export default function InvestmentClient({
  dates,
  accounts,
  liveHoldings,
  totalHoldingsValue,
  totalInvestmentValue,
  priceDates,
  priceSeries,
  children,
}: InvestmentClientProps) {
  // Not otherwise used here — but subscribing is what makes this component
  // re-render (and every formatCurrency() call below re-check demo mode)
  // when the toggle in Header/Profile changes it.
  usePrivacy();
  const { activePreset, resolvedRange, rangeLabel, setRange: setFilterRange } = useGlobalFilter();

  // Opened from the Home money-flow (Investments): show the same period. (HoldingsTable reads the
  // same link for ?symbol=; each hook parses the URL on its own, so they don't interfere.)
  const { link: deepLink } = useDeepLink();
  useEffect(() => {
    if (deepLink?.from && deepLink?.to) setFilterRange(deepLink.from, deepLink.to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink]);
  const range = activePreset ?? 'custom';
  const customFrom = activePreset ? undefined : resolvedRange.start;
  const customTo = activePreset ? undefined : resolvedRange.end;

  const { change, pct, endValue, sparkline } = useMemo(() => {
    const todayIso = isoDate(new Date());
    const series = buildCombinedSeries(dates, accounts, todayIso, totalInvestmentValue);
    const c = seriesChange(series, resolvedRange.start, resolvedRange.end, totalInvestmentValue);
    return {
      ...c,
      sparkline: series
        .filter((p) => p.date >= resolvedRange.start && p.date <= resolvedRange.end)
        .map((p) => p.value),
    };
  }, [dates, accounts, totalInvestmentValue, resolvedRange.start, resolvedRange.end]);

  // Where the money sits: locked retirement plans (401k/HSA) vs everything you can sell.
  const retirementValue = accounts
    .filter((a) => isLockedRetirementAccount(a))
    .reduce((sum, a) => sum + a.currentValue, 0);
  const brokerageValue = totalInvestmentValue - retirementValue;
  const sharePct = (n: number) => (totalInvestmentValue > 0 ? (n / totalInvestmentValue) * 100 : 0);

  // Gain vs what was paid, for the holdings that report a cost basis.
  const costBasis = liveHoldings.reduce((sum, h) => sum + Number(h.cost_basis ?? 0), 0);
  const gain = costBasis > 0 ? totalHoldingsValue - costBasis : null;
  const gainPct = gain !== null && costBasis > 0 ? (gain / costBasis) * 100 : null;

  return (
    <>
      {/* Right rail from xl: key figures with the insights directly underneath, one column so the
          spacing between them is the normal 20px (separate grid rows would inherit the chart's
          height). Below xl the wrapper dissolves (`contents`) and `order` interleaves the pieces:
          figures, chart, holdings, insights. */}
      <StickyRail fit className="contents min-w-0 xl:block xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:space-y-5">
        <div className="order-1 min-w-0 xl:flex-none">
        <SummaryCard
          tone="indigo"
          eyebrow="Portfolio value"
          period={rangeLabel}
          value={endValue}
          delta={{ amount: change, pct }}
          sparkline={sparkline}
          split={retirementValue > 0 && brokerageValue > 0 ? {
            title: 'Where it sits',
            caption: 'today',
            a: { label: 'Brokerage', value: brokerageValue, sub: `Sellable · ${Math.round(sharePct(brokerageValue))}%`, pct: sharePct(brokerageValue) },
            b: { label: 'Retirement', value: retirementValue, sub: `401(k), HSA · ${Math.round(sharePct(retirementValue))}%`, pct: sharePct(retirementValue) },
          } : null}
          stats={[
            {
              label: 'Total gain',
              value: gain !== null ? `${gain >= 0 ? '+' : '−'}${formatCurrency(Math.abs(gain))}` : '—',
              sub: gainPct !== null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% vs cost` : 'No cost basis',
            },
            { label: 'Positions', value: String(liveHoldings.length), sub: 'individual holdings' },
          ]}
        />
        </div>
        {children && <div className="order-4 min-w-0 xl:flex xl:min-h-0 xl:flex-col">{children}</div>}
      </StickyRail>

      <div className="order-2 min-w-0 xl:order-none xl:col-start-1 xl:row-start-1">
        <InvestmentProgress
          dates={dates}
          accounts={accounts}
          rangeStart={resolvedRange.start}
          rangeEnd={resolvedRange.end}
        />
      </div>

      {liveHoldings.length > 0 && (
        <div className="order-3 space-y-2 min-w-0 xl:order-none xl:col-start-1 xl:row-start-2">
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
