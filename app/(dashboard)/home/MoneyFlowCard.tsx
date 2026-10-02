'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, Sankey } from 'recharts';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';

// "Where your money went": income sources → an Income hub → spending categories, investments and
// what was left over. Follows the global date range (current month by default). The numbers come
// from /api/money-flow, which applies the Spending page's rules (no transfers, personal share of
// split charges, sub-categories rolled up), so this always agrees with the Spending page.
//
// Reading it: money has no "this dollar paid for that" link, so every source feeds one Income hub
// and the hub fans out to everything it paid for. If you spent or invested more than you earned,
// the gap appears as a red "From savings" source so the diagram still balances.

interface FlowItem { id: string; name: string; icon: string | null; color: string | null; amount: number }
interface FlowData { income: FlowItem[]; spending: FlowItem[]; investments: number }

type Kind = 'source' | 'draw' | 'hub' | 'spend' | 'invest' | 'save';
interface FlowNode { name: string; kind: Kind; color: string; icon?: string | null }
interface FlowLink { source: number; target: number; value: number }

const SHARE_MIN = 0.02; // categories / sources under 2% are grouped as "Other"

const GREEN = 'rgb(var(--accent-green))';
const BLUE = 'rgb(var(--accent-blue))';
const PURPLE = 'rgb(var(--accent-purple))';
const RED = 'rgb(var(--accent-red))';
const NEUTRAL = '#9CA3AF';

// Session cache: reopening a range (or navigating away and back) is instant.
const cache = new Map<string, FlowData>();

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
  const sources: { node: FlowNode; value: number }[] = [];
  let otherIncome = 0;
  for (const i of data.income) {
    if (/^other$/i.test(clean(i.name)) || (incomeTotal > 0 && i.amount / incomeTotal < SHARE_MIN)) otherIncome += i.amount;
    else sources.push({ node: { name: clean(i.name), kind: 'source', color: GREEN, icon: i.icon }, value: i.amount });
  }
  if (otherIncome > 0) sources.push({ node: { name: 'Other income', kind: 'source', color: GREEN }, value: otherIncome });
  if (draw > 0) sources.push({ node: { name: 'From savings', kind: 'draw', color: RED }, value: draw });

  const hub = add({ name: 'Income', kind: 'hub', color: GREEN });
  for (const s of sources) links.push({ source: add(s.node), target: hub, value: s.value });

  // Right: spending categories, investments, savings
  let otherSpend = 0;
  for (const c of data.spending) {
    if (c.amount / base < SHARE_MIN) otherSpend += c.amount;
    else links.push({ source: hub, target: add({ name: c.name, kind: 'spend', color: c.color ?? NEUTRAL, icon: c.icon }), value: c.amount });
  }
  if (otherSpend > 0) links.push({ source: hub, target: add({ name: 'Other', kind: 'spend', color: NEUTRAL }), value: otherSpend });
  if (invested > 0) links.push({ source: hub, target: add({ name: 'Investments', kind: 'invest', color: BLUE }), value: invested });
  if (saved > 0) links.push({ source: hub, target: add({ name: 'Savings', kind: 'save', color: PURPLE }), value: saved });

  const rightCount = nodes.filter((n) => n.kind === 'spend' || n.kind === 'invest' || n.kind === 'save').length;
  return { nodes, links, incomeTotal, spendTotal, invested, saved, draw, base, rightCount };
}

type Hover = { kind: 'node' | 'link'; index: number } | null;
interface Tip { x: number; y: number; title: string; lines: string[] }

export default function MoneyFlowCard() {
  usePrivacy(); // re-render when privacy / demo mode flips (amounts are formatted at render)
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
    fetch(`/api/money-flow?start=${start}&end=${end}`, { signal: ctrl.signal })
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

  const graph = useMemo(() => (data ? buildGraph(data) : null), [data]);
  const [hover, setHover] = useState<Hover>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const pctOfIncome = (v: number) => (graph && graph.base > 0 ? Math.round((v / graph.base) * 100) : 0);

  const showTip = (e: React.MouseEvent, h: NonNullable<Hover>) => {
    if (!graph || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    let title = '';
    let lines: string[] = [];
    if (h.kind === 'link') {
      const l = graph.links[h.index];
      title = `${graph.nodes[l.source].name} → ${graph.nodes[l.target].name}`;
      lines = [formatCurrency(l.value), `${pctOfIncome(l.value)}% of income`];
    } else {
      const inSum = graph.links.filter((l) => l.target === h.index).reduce((s, l) => s + l.value, 0);
      const outSum = graph.links.filter((l) => l.source === h.index).reduce((s, l) => s + l.value, 0);
      title = graph.nodes[h.index].name;
      lines = [
        ...(inSum > 0 ? [`In: ${formatCurrency(inSum)}`] : []),
        ...(outSum > 0 ? [`Out: ${formatCurrency(outSum)}`] : []),
        `${pctOfIncome(Math.max(inSum, outSum))}% of income`,
      ];
    }
    setHover(h);
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, lines });
  };
  const hideTip = () => { setHover(null); setTip(null); };

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
    const d = `M${p.sourceX},${p.sourceY} C${p.sourceControlX},${p.sourceY} ${p.targetControlX},${p.targetY} ${p.targetX},${p.targetY}`;
    return (
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(p.linkWidth, 1.5)}
        strokeOpacity={hover ? (active ? 0.6 : 0.07) : 0.34}
        style={{ transition: 'stroke-opacity 120ms', cursor: 'default' }}
        onMouseEnter={(e) => showTip(e, { kind: 'link', index: p.index })}
        onMouseMove={(e) => showTip(e, { kind: 'link', index: p.index })}
        onMouseLeave={hideTip}
      />
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
      <g style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 120ms' }} {...handlers}>
        <rect x={p.x} y={p.y} width={p.width} height={Math.max(p.height, 2)} rx={3} fill={node.color} />
        {/* wider invisible hit area so thin nodes are easy to hover */}
        <rect x={p.x - 6} y={p.y} width={p.width + 12} height={Math.max(p.height, 8)} fill="transparent" />
        {mid ? (
          <g>
            <text x={p.x + p.width / 2} y={p.y - 24} textAnchor="middle" fontSize={12} fontWeight={600} fill="rgb(var(--ink-700))">
              Income
            </text>
            <text data-sensitive x={p.x + p.width / 2} y={p.y - 9} textAnchor="middle" fontSize={11} fill="rgb(var(--ink-300))">
              {formatCurrency(total)}
            </text>
          </g>
        ) : (
          <text
            x={left ? p.x - 8 : p.x + p.width + 8}
            y={cy}
            textAnchor={left ? 'end' : 'start'}
            fontSize={12}
            fill="rgb(var(--ink-700))"
          >
            <tspan x={left ? p.x - 8 : p.x + p.width + 8} dy="-0.35em" fontWeight={500}>{node.name}</tspan>
            <tspan data-sensitive x={left ? p.x - 8 : p.x + p.width + 8} dy="1.35em" fontSize={11} fill="rgb(var(--ink-300))">
              {formatCurrency(total)}
            </tspan>
          </text>
        )}
      </g>
    );
  };

  const height = graph ? Math.max(320, graph.rightCount * 54 + 56) : 320;

  return (
    <div className="card px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="stat-label">Where your money went <span className="normal-case tracking-normal font-normal text-ink-300">· {rangeLabel}</span></h3>
        {graph && (
          <p className="text-xs text-ink-400" data-sensitive>
            <span className="text-ink-500">{formatCurrency(graph.incomeTotal)}</span> in ·{' '}
            <span className="text-ink-500">{formatCurrency(graph.spendTotal)}</span> spent
            {graph.invested > 0 && <> · <span className="text-ink-500">{formatCurrency(graph.invested)}</span> invested</>}
            {graph.saved > 0 && <> · <span className="text-ink-500">{formatCurrency(graph.saved)}</span> saved</>}
            {graph.draw > 0 && <> · <span className="text-accent-red">{formatCurrency(graph.draw)}</span> from savings</>}
          </p>
        )}
      </div>

      <div ref={boxRef} className="relative mt-3" style={{ minHeight: 300 }}>
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
                  nodeWidth={10}
                  nodePadding={30}
                  linkCurvature={0.5}
                  iterations={64}
                  margin={{ top: 44, right: 190, bottom: 26, left: 130 }}
                  node={renderNode}
                  link={renderLink}
                />
              </ResponsiveContainer>
            </div>

            {tip && (
              <div
                className="pointer-events-none absolute z-20 min-w-[9rem] rounded-xl bg-ink-800 px-3 py-2 text-xs text-white shadow-lg"
                style={{ left: Math.min(tip.x + 14, (boxRef.current?.clientWidth ?? 600) - 180), top: Math.max(tip.y - 8, 0), transform: 'translateY(-100%)' }}
              >
                <p className="font-semibold">{tip.title}</p>
                {tip.lines.map((l, i) => (
                  <p key={i} className={i === 0 ? 'mt-0.5 font-mono' : 'text-white/70'}>{l}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
