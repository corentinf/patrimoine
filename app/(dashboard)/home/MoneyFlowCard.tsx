'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, Sankey } from 'recharts';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { deepLinkHref } from '@/app/lib/deepLinkUrl';

// "Where your money went": income sources → an Income hub → spending categories, investments and
// what was left over. Follows the global date range (current month by default). The numbers come
// from /api/money-flow, which applies the Spending page's rules (no transfers, personal share of
// split charges, sub-categories rolled up), so this always agrees with the Spending page.
//
// Reading it: money has no "this dollar paid for that" link, so every source feeds one Income hub
// and the hub fans out to everything it paid for. If you spent or invested more than you earned,
// the gap appears as a red "From savings" source so the diagram still balances.

interface FlowItem { id: string; name: string; icon: string | null; color: string | null; amount: number; /** part of `amount` that is still expected rather than already happened */ predicted?: number }
interface PredictedData { until: string; income: FlowItem[]; spending: FlowItem[]; investments: number }
interface FlowData { income: FlowItem[]; spending: FlowItem[]; investments: number; investmentsPredicted?: number; predicted?: PredictedData | null }

type Kind = 'source' | 'draw' | 'hub' | 'spend' | 'invest' | 'save';
interface FlowNode { name: string; kind: Kind; color: string; icon?: string | null; /** category id, for jumping to that category */ catId?: string }
interface FlowLink { source: number; target: number; value: number; /** part of `value` that is predicted */ predicted?: number }

const SHARE_MIN = 0.02; // categories / sources under 2% are grouped as "Other"

const GREEN = 'rgb(var(--accent-green))';
const BLUE = 'rgb(var(--accent-blue))';
const PURPLE = 'rgb(var(--accent-purple))';
const RED = 'rgb(var(--accent-red))';
const NEUTRAL = '#9CA3AF';

// Session cache: reopening a range (or navigating away and back) is instant.
const cache = new Map<string, FlowData>();

/** Actual + expected-for-the-rest-of-the-month, keeping track of which part is predicted. */
function withPredictions(data: FlowData): FlowData {
  const p = data.predicted;
  if (!p) return data;
  const merge = (actual: FlowItem[], extra: FlowItem[]) => {
    const map = new Map<string, FlowItem>(actual.map((i) => [i.id, { ...i, predicted: 0 }]));
    for (const e of extra) {
      const cur = map.get(e.id);
      if (cur) { cur.amount += e.amount; cur.predicted = (cur.predicted ?? 0) + e.amount; }
      else map.set(e.id, { ...e, predicted: e.amount });
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  };
  return {
    ...data,
    income: merge(data.income, p.income),
    spending: merge(data.spending, p.spending),
    investments: data.investments + p.investments,
    investmentsPredicted: p.investments,
  };
}

function buildGraph(data: FlowData) {
  const incomeTotal = data.income.reduce((s, i) => s + i.amount, 0);
  const spendTotal = data.spending.reduce((s, i) => s + i.amount, 0);
  const invested = data.investments;
  if (incomeTotal + spendTotal + invested <= 0) return null;

  // Any shortfall is covered by savings; any surplus is "saved".
  const draw = Math.max(spendTotal + invested - incomeTotal, 0);
  const saved = Math.max(incomeTotal - spendTotal - invested, 0);
  const base = incomeTotal > 0 ? incomeTotal : spendTotal + invested;

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const add = (n: FlowNode) => nodes.push(n) - 1;

  // Left: income sources (+ a red "From savings" when spending outran income)
  const clean = (name: string) => name.replace(/^income\s*[-–:]\s*/i, '');
  const sources: { node: FlowNode; value: number; predicted?: number }[] = [];
  let otherIncome = 0;
  let otherIncomePred = 0;
  for (const i of data.income) {
    if (/^other$/i.test(clean(i.name)) || (incomeTotal > 0 && i.amount / incomeTotal < SHARE_MIN)) { otherIncome += i.amount; otherIncomePred += i.predicted ?? 0; }
    else sources.push({ node: { name: clean(i.name), kind: 'source', color: GREEN, icon: i.icon, catId: i.id }, value: i.amount, predicted: i.predicted ?? 0 });
  }
  if (otherIncome > 0) sources.push({ node: { name: 'Other income', kind: 'source', color: GREEN }, value: otherIncome, predicted: otherIncomePred });
  if (draw > 0) sources.push({ node: { name: 'From savings', kind: 'draw', color: RED }, value: draw });

  const hub = add({ name: 'Income', kind: 'hub', color: GREEN });
  for (const s of sources) links.push({ source: add(s.node), target: hub, value: s.value, predicted: s.predicted ?? 0 });

  // Right: spending categories, investments, savings
  let otherSpend = 0;
  let otherSpendPred = 0;
  for (const c of data.spending) {
    if (c.amount / base < SHARE_MIN) { otherSpend += c.amount; otherSpendPred += c.predicted ?? 0; }
    else links.push({ source: hub, target: add({ name: c.name, kind: 'spend', color: c.color ?? NEUTRAL, icon: c.icon, catId: c.id }), value: c.amount, predicted: c.predicted ?? 0 });
  }
  if (otherSpend > 0) links.push({ source: hub, target: add({ name: 'Other', kind: 'spend', color: NEUTRAL }), value: otherSpend, predicted: otherSpendPred });
  if (invested > 0) links.push({ source: hub, target: add({ name: 'Investments', kind: 'invest', color: BLUE }), value: invested, predicted: data.investmentsPredicted ?? 0 });
  if (saved > 0) links.push({ source: hub, target: add({ name: 'Savings', kind: 'save', color: PURPLE }), value: saved });

  const rightCount = nodes.filter((n) => n.kind === 'spend' || n.kind === 'invest' || n.kind === 'save').length;
  const predOf = (f: (l: FlowLink) => boolean) => links.filter(f).reduce((sum, l) => sum + (l.predicted ?? 0), 0);
  const incomePred = predOf((l) => nodes[l.target].kind === 'hub');
  const spendPred = predOf((l) => nodes[l.source].kind === 'hub' && nodes[l.target].kind === 'spend');
  const investPred = predOf((l) => nodes[l.target].kind === 'invest');
  const predictedTotal = spendPred + investPred;
  return { nodes, links, incomeTotal, spendTotal, invested, saved, draw, base, rightCount, predictedTotal, incomePred, spendPred, investPred };
}

const clip = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

/** "$6.7k" for tight spaces; goes through formatCurrency first so demo/fake mode still applies. */
function compactMoney(n: number): string {
  const probe = formatCurrency(n);
  const v = Number(probe.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(v)) return probe;
  if (v >= 10000) return `$${Math.round(v / 1000)}k`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return probe;
}

type Hover = { kind: 'node' | 'link'; index: number } | null;
interface Tip { x: number; y: number; title: string; lines: string[]; hint?: string }

export default function MoneyFlowCard() {
  usePrivacy(); // re-render when privacy / demo mode flips (amounts are formatted at render)
  const router = useRouter();
  const { resolvedRange, rangeLabel } = useGlobalFilter();
  const { start, end } = resolvedRange;

  const [data, setData] = useState<FlowData | null>(() => cache.get(`${start}|${end}`) ?? null);
  const [loading, setLoading] = useState(!cache.has(`${start}|${end}`));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = `${start}|${end}`;
    const hit = cache.get(key);
    if (hit) { setData(hit); setLoading(false); setError(null); return; }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/money-flow?start=${start}&end=${end}&predict=1`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Could not load money flow');
        cache.set(key, body);
        setData(body);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [start, end]);

  const [showPredictions, setShowPredictions] = useState(true);
  const hasPredictions = !!data?.predicted;
  const effective = useMemo(() => (data ? (showPredictions ? withPredictions(data) : { ...data, predicted: null }) : null), [data, showPredictions]);
  const graph = useMemo(() => (effective ? buildGraph(effective) : null), [effective]);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // On a phone there is no room for 320px of label margins: measure the card and switch to a
  // compact layout (short labels, abbreviated amounts, narrow margins) below 560px.
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = boxW > 0 && boxW < 560;

  // Touch: a tap fires hover then click in the same instant, so without care every tap would
  // navigate before the tooltip could be read. On touch devices the first tap on a node/flow shows
  // its tooltip; tapping the same one again opens it.
  const [armed, setArmed] = useState<Hover>(null);
  const isCoarse = () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  const destination = (n: FlowNode): { href: string; label: string } | null => {
    switch (n.kind) {
      case 'spend':
        return { href: deepLinkHref('/spending', { from: start, to: end, ...(n.catId ? { cat: n.catId } : {}) }), label: n.catId ? `Open ${n.name} in Spending` : 'Open Spending for this period' };
      case 'source':
        return { href: deepLinkHref('/income', { from: start, to: end, ...(n.catId ? { cat: n.catId } : {}) }), label: n.catId ? `Open ${n.name} in Income` : 'Open Income for this period' };
      case 'hub':
        return { href: deepLinkHref('/income', { from: start, to: end }), label: 'Open Income for this period' };
      case 'invest':
        return { href: deepLinkHref('/networth', { from: start, to: end }), label: 'Open Investment for this period' };
      default:
        return null;
    }
  };
  // A flow leads where its far end does: into the hub = the income source, out of it = the target.
  const linkDestination = (l: FlowLink) => {
    if (!graph) return null;
    return destination(graph.nodes[l.target].kind === 'hub' ? graph.nodes[l.source] : graph.nodes[l.target]);
  };

  const pctOfIncome = (v: number) => (graph && graph.base > 0 ? Math.round((v / graph.base) * 100) : 0);

  const showTip = (e: React.MouseEvent, h: NonNullable<Hover>) => {
    if (!graph || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    let title = '';
    let lines: string[] = [];
    let hint: string | undefined;
    if (h.kind === 'link') {
      const l = graph.links[h.index];
      title = `${graph.nodes[l.source].name} → ${graph.nodes[l.target].name}`;
      lines = [formatCurrency(l.value), `${pctOfIncome(l.value)}% of income`];
      if (l.predicted && l.predicted > 0) lines.push(`${formatCurrency(l.value - l.predicted)} so far + ~${formatCurrency(l.predicted)} expected`);
      hint = linkDestination(l)?.label;
    } else {
      const inSum = graph.links.filter((l) => l.target === h.index).reduce((s, l) => s + l.value, 0);
      const outSum = graph.links.filter((l) => l.source === h.index).reduce((s, l) => s + l.value, 0);
      title = graph.nodes[h.index].name;
      lines = [
        ...(inSum > 0 ? [`In: ${formatCurrency(inSum)}`] : []),
        ...(outSum > 0 ? [`Out: ${formatCurrency(outSum)}`] : []),
        `${pctOfIncome(Math.max(inSum, outSum))}% of income`,
      ];
      hint = destination(graph.nodes[h.index])?.label;
    }
    setHover(h);
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, lines, hint });
  };
  const hideTip = () => { setHover(null); setTip(null); };

  const activate = (e: React.MouseEvent, h: NonNullable<Hover>, dest: { href: string } | null) => {
    if (isCoarse()) {
      const alreadyArmed = !!armed && armed.kind === h.kind && armed.index === h.index;
      if (!alreadyArmed || !dest) { showTip(e, h); setArmed(h); return; }
    }
    if (dest) router.push(dest.href);
  };

  const isLinked = (nodeIdx: number, l: FlowLink) => l.source === nodeIdx || l.target === nodeIdx;

  const renderLink = (p: any) => {
    if (!graph) return <g />;
    const l = graph.links[p.index];
    if (!l) return <g />;
    const src = graph.nodes[l.source];
    const tgt = graph.nodes[l.target];
    // Income flows carry their source colour; everything leaving the hub carries its target's.
    const color = tgt.kind === 'hub' ? src.color : tgt.color;
    const active = !hover
      || (hover.kind === 'link' && hover.index === p.index)
      || (hover.kind === 'node' && isLinked(hover.index, l));
    const W = Math.max(p.linkWidth, 1.5);
    const ps = l.predicted && l.value > 0 ? Math.min(1, l.predicted / l.value) : 0;
    const pathAt = (off: number) =>
      `M${p.sourceX},${p.sourceY + off} C${p.sourceControlX},${p.sourceY + off} ${p.targetControlX},${p.targetY + off} ${p.targetX},${p.targetY + off}`;
    const opacity = hover ? (active ? 0.6 : 0.07) : 0.34;
    const events = {
      style: { transition: 'stroke-opacity 120ms', cursor: linkDestination(l) ? 'pointer' : 'default' } as React.CSSProperties,
      onClick: (e: React.MouseEvent) => activate(e, { kind: 'link', index: p.index }, linkDestination(l)),
      'data-flow-hit': true,
      onMouseEnter: (e: React.MouseEvent) => showTip(e, { kind: 'link', index: p.index }),
      onMouseMove: (e: React.MouseEvent) => showTip(e, { kind: 'link', index: p.index }),
      onMouseLeave: hideTip,
    };
    if (ps <= 0) {
      return <path d={pathAt(0)} fill="none" stroke={color} strokeWidth={W} strokeOpacity={opacity} {...events} />;
    }
    // Two parallel bands: what has happened (solid, on top) and what is still expected (hatched).
    const actualW = W * (1 - ps);
    const predW = W * ps;
    const patternId = `flow-hatch-${p.index}`;
    return (
      <g>
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" fill={color} fillOpacity={0.1} />
            <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeOpacity={0.55} strokeWidth="2.2" />
          </pattern>
        </defs>
        {actualW > 0.4 && <path d={pathAt(-W * ps / 2)} fill="none" stroke={color} strokeWidth={actualW} strokeOpacity={opacity} {...events} />}
        <path d={pathAt(W * (1 - ps) / 2)} fill="none" stroke={`url(#${patternId})`} strokeWidth={predW} strokeOpacity={hover ? (active ? 1 : 0.2) : 0.9} {...events} />
      </g>
    );
  };

  const renderNode = (p: any) => {
    if (!graph) return <g />;
    const node = graph.nodes[p.index];
    if (!node) return <g />;
    const total = Math.max(
      graph.links.filter((l) => l.target === p.index).reduce((s, l) => s + l.value, 0),
      graph.links.filter((l) => l.source === p.index).reduce((s, l) => s + l.value, 0),
    );
    // How much of this node is still expected (flows touching it that carry a predicted part)
    const predIn = graph.links.filter((l) => l.target === p.index).reduce((s2, l) => s2 + (l.predicted ?? 0), 0);
    const predOut = graph.links.filter((l) => l.source === p.index).reduce((s2, l) => s2 + (l.predicted ?? 0), 0);
    const pred = Math.max(predIn, predOut);
    const pctInc = graph.base > 0 ? Math.round((total / graph.base) * 100) : 0;
    const left = node.kind === 'source' || node.kind === 'draw';
    const mid = node.kind === 'hub';
    const cy = p.y + p.height / 2;
    const dim = hover && !(hover.kind === 'node' && hover.index === p.index)
      && !(hover.kind === 'link' && (graph.links[hover.index].source === p.index || graph.links[hover.index].target === p.index));
    const handlers = {
      onMouseEnter: (e: React.MouseEvent) => showTip(e, { kind: 'node', index: p.index }),
      onMouseMove: (e: React.MouseEvent) => showTip(e, { kind: 'node', index: p.index }),
      onMouseLeave: hideTip,
    };
    return (
      <g
        style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 120ms', cursor: destination(node) ? 'pointer' : 'default' }}
        onClick={(e: React.MouseEvent) => activate(e, { kind: 'node', index: p.index }, destination(node))}
        data-flow-hit
        {...handlers}
      >
        <rect x={p.x} y={p.y} width={p.width} height={Math.max(p.height, 2)} rx={3} fill={node.color} />
        {/* wider invisible hit area so thin nodes are easy to hover */}
        <rect x={p.x - (compact ? 12 : 6)} y={p.y - (compact ? 4 : 0)} width={p.width + (compact ? 24 : 12)} height={Math.max(p.height, compact ? 16 : 8) + (compact ? 8 : 0)} fill="transparent" />
        {mid ? (
          <g>
            <text x={p.x + p.width / 2} y={p.y - 24} textAnchor="middle" fontSize={compact ? 11 : 12} fontWeight={600} fill="rgb(var(--ink-700))">
              Income
            </text>
            <text data-sensitive x={p.x + p.width / 2} y={p.y - 9} textAnchor="middle" fontSize={compact ? 10 : 11} fill="rgb(var(--ink-300))">
              {compact ? compactMoney(total) : formatCurrency(total)}
            </text>
          </g>
        ) : (
          <text
            x={left ? p.x - (compact ? 5 : 8) : p.x + p.width + (compact ? 5 : 8)}
            y={cy - (!compact && pred > 0 ? 6 : 0)}
            textAnchor={left ? 'end' : 'start'}
            fontSize={compact ? 10.5 : 12}
            fill="rgb(var(--ink-700))"
          >
            <tspan x={left ? p.x - (compact ? 5 : 8) : p.x + p.width + (compact ? 5 : 8)} dy="-0.35em" fontWeight={500}>{compact ? clip(node.name, 11) : node.name}</tspan>
            <tspan data-sensitive x={left ? p.x - (compact ? 5 : 8) : p.x + p.width + (compact ? 5 : 8)} dy="1.35em" fontSize={compact ? 9.5 : 11} fill="rgb(var(--ink-300))">
              {compact ? compactMoney(total) : `${formatCurrency(total)} · ${pctInc}%`}
            </tspan>
            {!compact && pred > 0 && (
              <tspan data-sensitive x={left ? p.x - 8 : p.x + p.width + 8} dy="1.3em" fontSize={10} fill="rgb(var(--ink-300))" fillOpacity={0.85}>
                {compactMoney(total - pred)} so far · +{compactMoney(pred)} expected
              </tspan>
            )}
          </text>
        )}
      </g>
    );
  };

  const withPred = !!graph && graph.predictedTotal > 0;
  const height = graph ? Math.max(320, graph.rightCount * (compact ? 44 : withPred ? 64 : 54) + 56) : 320;

  return (
    <div className="card px-3 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 sm:px-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="stat-label">Where your money {hasPredictions && showPredictions ? 'is going' : 'went'} <span className="normal-case tracking-normal font-normal text-ink-300">· {rangeLabel}{hasPredictions && showPredictions && data?.predicted ? ` → ${data.predicted.until.slice(5).replace('-', '/')}` : ''}</span></h3>
          {hasPredictions && (
            <button
              type="button"
              onClick={() => setShowPredictions((v) => !v)}
              title="Include what's still expected this month: upcoming subscriptions, usual spending, regular income and investing"
              className={`pill px-2.5 py-0.5 text-[11px] ${showPredictions ? 'pill-active' : ''}`}
            >
              Include predictions
            </button>
          )}
        </div>
      </div>

      {graph && (() => {
        const projected = hasPredictions && showPredictions;
        const pct = (v: number) => (graph.base > 0 ? `${Math.round((v / graph.base) * 100)}% of income` : '');
        const split = (total: number, pred: number) =>
          projected && pred > 0 ? `${formatCurrency(total - pred)} so far + ~${formatCurrency(pred)} expected` : null;
        const tiles = [
          { label: 'Income', total: graph.incomeTotal, sub: split(graph.incomeTotal, graph.incomePred), color: 'text-ink-800' },
          { label: 'Spent', total: graph.spendTotal, sub: split(graph.spendTotal, graph.spendPred), extra: pct(graph.spendTotal), color: 'text-ink-800' },
          { label: 'Invested', total: graph.invested, sub: split(graph.invested, graph.investPred), extra: pct(graph.invested), color: 'text-ink-800' },
          graph.draw > 0
            ? { label: 'From savings', total: graph.draw, sub: projected ? 'projected shortfall' : null, extra: pct(graph.draw), color: 'text-accent-red' }
            : { label: projected ? 'Saved (projected)' : 'Saved', total: graph.saved, sub: null, extra: pct(graph.saved), color: 'text-accent-green' },
        ];
        return (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-xl border border-sand-200/70 bg-sand-100/50 px-3 py-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">{t.label}</p>
                <p className={`stat-value mt-0.5 text-lg ${t.color}`} data-sensitive>{formatCurrency(t.total)}</p>
                {t.sub && <p className="mt-0.5 text-[11px] leading-snug text-ink-400" data-sensitive>{t.sub}</p>}
                {t.extra && <p className="text-[11px] text-ink-300">{t.extra}</p>}
              </div>
            ))}
          </div>
        );
      })()}

      <div
        ref={boxRef}
        className="relative mt-3"
        style={{ minHeight: 300 }}
        onClick={(e) => {
          if (!isCoarse() || (e.target as Element).closest?.('[data-flow-hit]')) return;
          hideTip();
          setArmed(null);
        }}
      >
        {loading && !data ? (
          <div className="h-[300px] animate-pulse rounded-xl bg-sand-100" aria-label="Loading money flow" />
        ) : error ? (
          <p className="flex h-[300px] items-center justify-center text-sm text-ink-400">{error}</p>
        ) : !graph ? (
          <p className="flex h-[300px] items-center justify-center text-sm text-ink-400">No income or spending in this period.</p>
        ) : (
          <>
            <div style={{ height, opacity: loading ? 0.5 : 1, transition: 'opacity 150ms' }}>
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={{ nodes: graph.nodes, links: graph.links }}
                  nodeWidth={compact ? 8 : 10}
                  nodePadding={compact ? 22 : withPred ? 38 : 30}
                  linkCurvature={0.5}
                  iterations={64}
                  margin={compact ? { top: 44, right: 88, bottom: 22, left: 62 } : { top: 44, right: withPred ? 220 : 190, bottom: 26, left: withPred ? 175 : 130 }}
                  node={renderNode}
                  link={renderLink}
                />
              </ResponsiveContainer>
            </div>

            {tip && (
              <div
                className="pointer-events-none absolute z-20 min-w-[9rem] rounded-xl bg-ink-800 px-3 py-2 text-xs text-white shadow-lg"
                style={compact
                  ? { left: Math.max(0, Math.min(tip.x - 90, boxW - 190)), top: Math.max(tip.y - 14, 0), transform: 'translateY(-100%)' }
                  : { left: Math.min(tip.x + 14, (boxRef.current?.clientWidth ?? 600) - 180), top: Math.max(tip.y - 8, 0), transform: 'translateY(-100%)' }}
              >
                <p className="font-semibold">{tip.title}</p>
                {tip.lines.map((l, i) => (
                  <p key={i} className={i === 0 ? 'mt-0.5 font-mono' : 'text-white/70'}>{l}</p>
                ))}
                {tip.hint && <p className="mt-1 border-t border-white/20 pt-1 text-[11px] text-white/90">{tip.hint} →</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
