'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { formatCurrency, amountColor, accountTypeConfig, getAccountLinkUrl } from '@/app/lib/utils';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { idxAtOrBefore, isoDate } from '@/app/lib/investmentRange';
import NetWorthChart from '../networth/NetWorthChart';
import { AccountModal, InstitutionLogo, type SidebarAccount } from '../../components/AccountsPanel';

const ACCOUNT_TYPE_ORDER = ['checking', 'savings', 'investment', 'credit'];

function InfoTooltip({ text, align = 'center' }: { text: string; align?: 'center' | 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const translateX = align === 'left' ? 'left-0 -translate-x-0' : align === 'right' ? 'right-0 translate-x-0' : 'left-1/2 -translate-x-1/2';
  const arrowX = align === 'left' ? 'left-4' : align === 'right' ? 'right-4' : 'left-1/2 -translate-x-1/2';
  return (
    <span className="relative group/tip inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center"
      >
        <svg className="w-3 h-3 text-ink-300 group-hover/tip:text-ink-500 transition-colors cursor-default flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      <span className={`pointer-events-none absolute bottom-full ${translateX} mb-2 w-56 bg-ink-800 text-white text-xs rounded-lg px-3 py-2 leading-relaxed transition-opacity z-50 shadow-lg ${open ? 'opacity-100' : 'opacity-0'} md:group-hover/tip:opacity-100`}>
        {text}
        <span className={`absolute top-full ${arrowX} border-4 border-transparent border-t-ink-800`} />
      </span>
    </span>
  );
}

interface Snapshot {
  snapshot_date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
}

interface Milestone {
  target: number;
  passed: boolean;
  pct: number;
  eta: string | null;
}

interface HomeViewProps {
  history: Snapshot[]; // ascending by snapshot_date
  currentNetWorth: number;
  trackingStartDate: string | null;
  totalAssets: number;
  totalLiabilities: number;
  assetsCount: number;
  liabilitiesCount: number;
  milestones: Milestone[];
  accounts: SidebarAccount[];
}

export default function HomeView({
  history,
  currentNetWorth,
  trackingStartDate,
  totalAssets,
  totalLiabilities,
  assetsCount,
  liabilitiesCount,
  milestones,
  accounts,
}: HomeViewProps) {
  const { resolvedRange, rangeLabel } = useGlobalFilter();
  const todayIso = isoDate(new Date());
  const router = useRouter();
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);

  const groupedAccounts = useMemo(() => {
    const byType: Record<string, SidebarAccount[]> = {};
    for (const a of accounts) {
      const t = a.account_type || 'checking';
      (byType[t] ||= []).push(a);
    }
    return ACCOUNT_TYPE_ORDER
      .map((type) => ({ type, accounts: byType[type] ?? [] }))
      .filter((g) => g.accounts.length > 0);
  }, [accounts]);

  const { chartData, startValue, endValue, hasChange } = useMemo(() => {
    const dates = history.map((h) => h.snapshot_date);
    const startIdx = idxAtOrBefore(dates, resolvedRange.start);
    const endIdx = idxAtOrBefore(dates, resolvedRange.end);
    const includesToday = resolvedRange.end >= todayIso;

    const filtered = endIdx >= 0 ? history.slice(Math.max(startIdx, 0), endIdx + 1) : [];
    const longRange = (new Date(resolvedRange.end).getTime() - new Date(resolvedRange.start).getTime()) / 86_400_000 > 120;

    // Over a long window, plot one point per month (the last snapshot in
    // each) — daily granularity just repeats the same month/year label.
    let plotted = filtered;
    if (longRange) {
      const lastByMonth = new Map<string, Snapshot>();
      for (const s of filtered) lastByMonth.set(s.snapshot_date.slice(0, 7), s);
      plotted = Array.from(lastByMonth.values());
    }

    const points = plotted.map((s) => ({
      month: format(new Date(s.snapshot_date + 'T12:00:00'), longRange ? 'MMM yy' : 'MMM d'),
      netWorth: Math.round(Number(s.net_worth)),
      assets: Math.round(Number(s.total_assets)),
      liabilities: Math.round(Number(s.total_liabilities)),
    }));

    // Reflect the live balance (not the last daily snapshot) whenever the
    // selected window reaches today, so the chart's endpoint matches the
    // headline figure exactly.
    if (includesToday && points.length > 0) {
      points[points.length - 1] = { ...points[points.length - 1], netWorth: Math.round(currentNetWorth) };
    }

    const end = includesToday ? currentNetWorth : (endIdx >= 0 ? Number(history[endIdx].net_worth) : currentNetWorth);
    const start = startIdx >= 0 ? Number(history[startIdx].net_worth) : (filtered[0] ? Number(filtered[0].net_worth) : end);

    return {
      chartData: points,
      startValue: start,
      endValue: end,
      hasChange: startIdx >= 0 && (startIdx !== endIdx || includesToday),
    };
  }, [history, resolvedRange, todayIso, currentNetWorth]);

  const change = endValue - startValue;
  const pct = startValue !== 0 ? (change / startValue) * 100 : 0;

  return (
    <div className="space-y-5">
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={() => setModalAccount(undefined)}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Hero */}
      <div className="card px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-lg text-ink-800">Net worth</h2>
          <span className="stat-label">{rangeLabel}</span>
          <span className="stat-value text-xl" data-sensitive>{formatCurrency(endValue)}</span>
        </div>
        {hasChange ? (
          <p className={`text-xs font-mono mt-1 ${amountColor(change)}`} data-sensitive>
            {change >= 0 ? '+' : ''}{formatCurrency(change)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%) over period
          </p>
        ) : trackingStartDate ? (
          <p className="text-xs text-ink-300 mt-1">Tracking since {trackingStartDate}</p>
        ) : null}
      </div>

      {/* Chart */}
      <NetWorthChart
        data={chartData}
        trackingStartDate={trackingStartDate}
        currentNetWorth={currentNetWorth}
      />

      {/* Account summary — always current, not scoped to the selected period */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card px-5 py-4">
          <p className="stat-label">Assets</p>
          <p className="stat-value text-xl mt-1" data-sensitive>{formatCurrency(totalAssets)}</p>
          <p className="text-xs text-ink-300 mt-0.5">{assetsCount} account{assetsCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="stat-label">Liabilities</p>
          <p className="stat-value text-xl mt-1 text-accent-red" data-sensitive>
            {totalLiabilities > 0 ? formatCurrency(totalLiabilities) : '—'}
          </p>
          <p className="text-xs text-ink-300 mt-0.5">
            {liabilitiesCount > 0 ? `${liabilitiesCount} account${liabilitiesCount !== 1 ? 's' : ''}` : 'None'}
          </p>
        </div>
        <div className="card px-5 py-4 col-span-2 sm:col-span-1">
          <p className="stat-label">Net worth</p>
          <p className="stat-value text-xl mt-1" data-sensitive>{formatCurrency(currentNetWorth)}</p>
        </div>
      </div>

      {/* Accounts — always current, not scoped to the selected period */}
      {groupedAccounts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">Accounts</h3>
            <button
              onClick={() => setModalAccount(null)}
              className="text-xs text-ink-400 hover:text-ink-700 transition-colors"
            >
              + Add account
            </button>
          </div>
          <div className="space-y-4">
            {groupedAccounts.map(({ type, accounts: group }) => {
              const cfg = accountTypeConfig[type] ?? { label: type, icon: '💰' };
              const subtotal = group.reduce(
                (s, a) => s + (type === 'credit' ? Math.abs(Number(a.balance)) : Number(a.balance)),
                0,
              );
              return (
                <div key={type} className="card p-0 divide-y divide-sand-100 overflow-hidden">
                  <div className="px-5 py-2.5 flex items-center justify-between bg-sand-50/60">
                    <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>{cfg.icon}</span>
                      {cfg.label}
                    </span>
                    <span
                      className={`text-xs font-mono ${type === 'credit' ? 'text-accent-red' : 'text-ink-500'}`}
                      data-sensitive
                    >
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  {group.map((a) => {
                    const subtitleParts: string[] = [];
                    if (a.name && a.name !== a.institution) subtitleParts.push(a.name);
                    if (a.mask) subtitleParts.push(`•••• ${a.mask}`);
                    const subtitle = subtitleParts.join(' · ');
                    const linkUrl = getAccountLinkUrl(a.institution || a.name, a.institution_domain, a.custom_url);

                    const openAccount = () => {
                      if (linkUrl) window.open(linkUrl, '_blank', 'noopener,noreferrer');
                      else setModalAccount(a);
                    };

                    return (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={openAccount}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          openAccount();
                        }}
                        title={linkUrl ? `Open ${a.institution || a.name}` : undefined}
                        className="group w-full px-5 py-3 flex items-center justify-between gap-4 hover:bg-sand-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <InstitutionLogo
                            institution={a.institution || a.name}
                            institutionDomain={a.institution_domain}
                            size={32}
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-ink-700 truncate">{a.institution || a.name}</p>
                            {subtitle && <p className="text-xs text-ink-300 truncate">{subtitle}</p>}
                          </div>
                        </div>
                        {/* relative + md:absolute on the button so the edit affordance overlays
                            the value on hover instead of pushing it left of the row's true
                            right edge — the value's own right alignment stays fixed either way. */}
                        <div className="relative flex items-center gap-1.5 md:gap-0 shrink-0">
                          <span
                            className={`text-sm font-mono text-right whitespace-nowrap transition-[mask-image] duration-150 md:[mask-image:none] md:[-webkit-mask-image:none] md:group-hover:[mask-image:linear-gradient(to_right,black,black_calc(100%_-_30px),transparent_calc(100%_-_8px))] md:group-hover:[-webkit-mask-image:linear-gradient(to_right,black,black_calc(100%_-_30px),transparent_calc(100%_-_8px))] ${type === 'credit' ? 'text-accent-red' : 'text-ink-700'}`}
                            data-sensitive
                          >
                            {formatCurrency(Number(a.balance))}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setModalAccount(a); }}
                            title="Edit account"
                            className="w-6 h-6 flex items-center justify-center text-ink-300 hover:text-ink-700 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity rounded-md hover:bg-sand-100 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones — projected from current trajectory, not scoped to the selected period */}
      {milestones.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3">Milestones</h3>
          <div className="card p-0 divide-y divide-sand-100">
            {milestones.map(({ target, passed, pct: milestonePct, eta }) => (
              <div key={target} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium ${passed ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                      {formatCurrency(target)}
                    </span>
                    <span className="text-xs text-ink-300 font-mono">{milestonePct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-sand-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${passed ? 'bg-accent-green' : 'bg-ink-400'}`}
                      style={{ width: `${milestonePct}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right w-28">
                  {passed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent-green font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Reached
                    </span>
                  ) : eta ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                      ~{eta}
                      <InfoTooltip
                        align="right"
                        text="Projected from your average net worth growth over the last few months — not scoped to whatever period you've selected up top."
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-ink-300">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
