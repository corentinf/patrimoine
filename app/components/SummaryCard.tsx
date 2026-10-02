'use client';

import type { ReactNode } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';

// The green gradient "key figures" card shared by every page: a headline number with its
// change and trend, an optional two-way split ("where it sits / where it goes"), and a row
// of supporting stats. Each page feeds it the numbers that matter for that page.

export interface SummaryTile {
  label: string;
  /** A number is formatted as currency; pass a string for anything else (%, counts, names). */
  value: number | string;
  sub?: string;
  /** Share of the split bar this tile represents, 0–100. */
  pct?: number;
}

export interface SummaryStat {
  label: string;
  value: number | string;
  sub?: string;
}

/** Colour family: green = Home (brand), sunset = Spending, teal = Income, indigo = Investment. */
export type SummaryTone = 'green' | 'sunset' | 'teal' | 'indigo';

const TONE_CLASS: Record<SummaryTone, string> = {
  green: 'g-aurora',
  sunset: 'g-sunset',
  teal: 'g-teal',
  indigo: 'g-indigo',
};

export interface SummaryCardProps {
  tone?: SummaryTone;
  eyebrow: string;
  /** Shown faintly next to the eyebrow, e.g. the selected date range. */
  period?: string;
  value: number;
  /** Small line under the value (e.g. "on pace for ~$X", or "Tracking since …"). */
  note?: ReactNode;
  /** Change vs the comparison period. The arrow follows the sign; colour stays neutral. */
  delta?: { amount: number; pct?: number | null } | null;
  sparkline?: number[];
  split?: { title: string; caption?: string; a: SummaryTile; b: SummaryTile } | null;
  stats?: SummaryStat[];
  /** Extra content in a frosted tile at the bottom (e.g. an editable savings rate). */
  footer?: ReactNode;
  className?: string;
}

// Tiny trend line: smoothed stroke over a soft fill, stretched to the card's width. The stroke is
// non-scaling so it stays crisp when the viewBox is stretched.
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 3) return null;
  const W = 300, H = 56, PAD = 6;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ]);
  // Quadratic smoothing through segment midpoints.
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` T ${last[0]} ${last[1]}`;
  const fill = `${d} L ${W} ${H} L 0 ${H} Z`;
  return (
    <div className="relative h-14 w-full" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="summary-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#summary-spark-fill)" />
        <path d={d} fill="none" stroke="#fff" strokeOpacity="0.95" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgb(255_255_255/0.28)]"
        style={{ right: 0, top: `${(last[1] / H) * 100}%` }}
      />
    </div>
  );
}

const fmt = (v: number | string) => (typeof v === 'number' ? formatCurrency(v) : v);

export default function SummaryCard({
  tone = 'green', eyebrow, period, value, note, delta, sparkline, split, stats, footer, className = '',
}: SummaryCardProps) {
  // Re-render when privacy / demo mode flips (formatCurrency reads it).
  usePrivacy();

  const hasLower = !!split || (stats && stats.length > 0) || !!footer;

  return (
    <div className={`gradient-card ${TONE_CLASS[tone]} ${className}`}>
      <div className="sheen" />
      <div className="relative px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
            {eyebrow}{' '}
            {period && <span className="normal-case tracking-normal font-normal text-white/65">· {period}</span>}
          </p>
          {delta && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgb(255_255_255/0.22)] border border-[rgb(255_255_255/0.3)] px-2.5 py-0.5 text-[11px] font-mono text-white"
              data-sensitive
            >
              {delta.amount >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(delta.amount))}
              {delta.pct != null && <> ({delta.pct >= 0 ? '+' : ''}{delta.pct.toFixed(1)}%)</>}
            </span>
          )}
        </div>
        <p className="stat-value mt-2 text-[2.6rem] leading-none" data-sensitive>{formatCurrency(value)}</p>
        {note && <div className="mt-1.5 text-xs text-white/75">{note}</div>}
      </div>

      {sparkline && sparkline.length >= 3 && (
        <div className="relative mt-3">
          <Sparkline values={sparkline} />
        </div>
      )}

      {hasLower && (
        <div className={`relative space-y-4 px-4 pb-4 ${sparkline && sparkline.length >= 3 ? 'pt-1' : 'pt-4'}`}>
          {split && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/70">
                <span>{split.title}</span>
                {split.caption && <span className="font-normal normal-case tracking-normal">{split.caption}</span>}
              </div>
              <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-[rgb(255_255_255/0.18)]">
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, split.a.pct ?? 0)}%` }} />
                <div className="h-full rounded-full bg-[rgb(255_255_255/0.45)]" style={{ width: `${Math.max(0, split.b.pct ?? 0)}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([split.a, split.b] as const).map((tile, i) => (
                  <div
                    key={tile.label}
                    className="min-w-0 rounded-xl border border-[rgb(255_255_255/0.28)] bg-[rgb(255_255_255/0.16)] px-3.5 py-3 backdrop-blur-sm"
                  >
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/80">
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${i === 0 ? 'bg-white' : 'bg-[rgb(255_255_255/0.45)]'}`} />
                      <span className="truncate">{tile.label}</span>
                    </p>
                    <p className="stat-value mt-1.5 text-xl" data-sensitive>{fmt(tile.value)}</p>
                    {tile.sub && <p className="mt-0.5 truncate text-[11px] text-white/70">{tile.sub}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats && stats.length > 0 && (
            <div
              className={`grid grid-cols-2 gap-3 px-0.5 ${split || sparkline ? 'border-t border-[rgb(255_255_255/0.25)] pt-3.5' : ''}`}
            >
              {stats.map((s) => (
                <div key={s.label} className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/75">{s.label}</p>
                  <p className="stat-value mt-1 truncate text-lg" data-sensitive>{fmt(s.value)}</p>
                  {s.sub && <p className="mt-0.5 truncate text-[11px] text-white/70">{s.sub}</p>}
                </div>
              ))}
            </div>
          )}

          {footer && (
            <div className="rounded-xl border border-[rgb(255_255_255/0.28)] bg-[rgb(255_255_255/0.16)] px-3.5 py-3 backdrop-blur-sm">
              {footer}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
