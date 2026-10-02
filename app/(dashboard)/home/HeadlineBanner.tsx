'use client';

import Link from 'next/link';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import type { Insight, InsightPart } from '@/app/lib/insights';

// "What happened lately" banner: the most newsworthy event as a big headline on a
// gradient card (green→blue when it's good news, orange→pink for spending alerts,
// blue→violet when neutral), with the next few events as frosted-glass chips.

const WHEN_LABEL: Record<Insight['when'], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this week': 'This week',
};

// A small dot in the eyebrow carries the tone now that the card has no background.
const TONE_DOT: Record<Insight['tone'], string> = {
  positive: 'bg-accent-money',
  alert: 'bg-accent-gold',
  neutral: 'bg-ink-300',
};

function Parts({ parts }: { parts: InsightPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.amount !== undefined ? (
          <span key={i} data-sensitive className="whitespace-nowrap">
            {p.prefix}
            {formatCurrency(p.amount)}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

export default function HeadlineBanner({
  insights,
  dateLabel,
}: {
  insights: Insight[];
  dateLabel: string;
}) {
  // Subscribing re-renders this when privacy / demo mode flips (formatCurrency reads it).
  usePrivacy();
  const { setRange } = useGlobalFilter();

  // Links that point back at Home ("net worth this week") can't rely on a page mount to apply
  // their params, so apply the range directly and skip the navigation.
  const onLinkClick = (e: React.MouseEvent, insight: Insight) => {
    const l = insight.link;
    if (l?.path === '/home' && l.from && l.to) {
      e.preventDefault();
      setRange(l.from, l.to);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const [lead, ...rest] = insights;
  if (!lead) return null;
  const others = rest.slice(0, 3);

  const headline = (
    <>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[lead.tone]}`} />
        {dateLabel} · {WHEN_LABEL[lead.when]}
      </p>
      <h2 className="mt-2.5 text-2xl md:text-[1.9rem] leading-[1.15] font-semibold tracking-tight text-ink-800">
        <span className="mr-2.5" aria-hidden>{lead.icon}</span>
        <Parts parts={lead.parts} />
      </h2>
      {lead.detail && <p className="mt-2 text-sm text-ink-500">{lead.detail}</p>}
    </>
  );

  return (
    <section className="px-1 py-1">
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          {lead.href ? (
            <Link href={lead.href} onClick={(e) => onLinkClick(e, lead)} className="block rounded-xl -m-2 p-2 transition-colors hover:bg-sand-200/50">
              {headline}
            </Link>
          ) : (
            headline
          )}
        </div>

        {others.length > 0 && (
          <ul className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-[23rem] lg:flex-col">
            {others.map((i) => {
              const body = (
                <>
                  <span className="text-base leading-none" aria-hidden>{i.icon}</span>
                  <span className="min-w-0 text-[13px] leading-snug text-ink-700">
                    <Parts parts={i.parts} />
                  </span>
                </>
              );
              const cls = 'pill !justify-start gap-2.5 px-4 py-2 !whitespace-normal';
              return (
                <li key={i.id} className="sm:flex-1 lg:flex-none">
                  {i.href ? <Link href={i.href} onClick={(e) => onLinkClick(e, i)} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
