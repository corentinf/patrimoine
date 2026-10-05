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
interface BudgetItem { id: string; name: string; icon: string | null; color: string | null; amount: number }
interface FlowData { budgets?: BudgetItem[]; income: FlowItem[]; spending: FlowItem[]; investments: number; investmentsPredicted?: number; predicted?: PredictedData | null }

type Kind = 'source' | 'draw' | 'hub' | 'spend' | 'invest' | 'save';
type BudgetState = 'ok' | 'near' | 'pace' | 'over';
interface NodeBudget { limit: number; /** spent so far */ actual: number; /** spent + still expected */ total: number; state: BudgetState }
interface FlowNode { name: string; kind: Kind; color: string; icon?: string | null; /** category id, for jumping to that category */ catId?: string; budget?: NodeBudget; group?: string }
type Budgets = Record<string, number>

type SortMode = 'size' | 'budget' | 'group' | 'expected' | 'name'
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'size', label: 'Largest first' },
  { id: 'budget', label: 'Budget status' },
  { id: 'group', label: 'Fixed · Everyday · Investing' },
  { id: 'expected', label: 'Still to come' },
  { id: 'name', label: 'A → Z' },
]
const GROUPS = ['Fixed costs', 'Everyday spending', 'Saving & investing']
const FIXED = /rent|hous|mortgage|utilit|insur|subscri|member|health|medic|transport|phone|internet|loan|tax|child|educat/i
const groupOf = (n: FlowNode) => (n.kind === 'invest' || n.kind === 'save' ? GROUPS[2] : FIXED.test(n.name) ? GROUPS[0] : GROUPS[1])
interface FlowLink { source: number; target: number; value: number; /** part of `value` that is predicted */ predicted?: number }

const SHARE_MIN = 0.02; // categories / sources under 2% are grouped as "Other"

const GREEN = 'rgb(var(--accent-green))';
const BLUE = 'rgb(var(--accent-blue))';
const PURPLE = 'rgb(var(--accent-purple))';
const RED = 'rgb(var(--accent-red))';
const NEUTRAL = '#9CA3AF';

// Session cache: reopening a range (or navigating away and back) is instant.
const cache = new Map<string, FlowData>();
// Budgets live outside the per-range cache so an edit shows up in every range straight away.
let sharedBudgets: Budgets | null = null;
const toBudgets = (list: BudgetItem[] | undefined): Budgets => Object.fromEntries((list ?? []).map((b) => [b.id, b.amount]));

const budgetState = (limit: number, actual: number, total: number): BudgetState =>
  actual > limit ? 'over' : total > limit ? 'pace' : total >= limit * 0.85 ? 'near' : 'ok';

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

/** `budgets` is only passed when the range is a single month (budgets are monthly). */
function buildGraph(data: FlowData, budgets: Budgets = {}, sort: SortMode = 'size') {
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

  // Right: spending categories, investments, savings — ordered by the chosen sort
  let otherSpend = 0;
  let otherSpendPred = 0;
  const right: { node: FlowNode; value: number; predicted: number }[] = [];
  for (const c of data.spending) {
    const limit = budgets[c.id];
    if (c.amount / base < SHARE_MIN && !limit) { otherSpend += c.amount; otherSpendPred += c.predicted ?? 0; }
    else {
      const actual = c.amount - (c.predicted ?? 0);
      const budget = limit ? { limit, actual, total: c.amount, state: budgetState(limit, actual, c.amount) } : undefined;
      right.push({ node: { name: c.name, kind: 'spend', color: c.color ?? NEUTRAL, icon: c.icon, catId: c.id, budget }, value: c.amount, predicted: c.predicted ?? 0 });
    }
  }
  if (otherSpend > 0) right.push({ node: { name: 'Other', kind: 'spend', color: NEUTRAL }, value: otherSpend, predicted: otherSpendPred });
  if (invested > 0) right.push({ node: { name: 'Investments', kind: 'invest', color: BLUE }, value: invested, predicted: data.investmentsPredicted ?? 0 });
  if (saved > 0) right.push({ node: { name: 'Savings', kind: 'save', color: PURPLE }, value: saved, predicted: 0 });
  for (const r of right) r.node.group = groupOf(r.node);

  const isSaving = (n: FlowNode) => n.kind === 'invest' || n.kind === 'save';
  const usage = (r: { node: FlowNode; value: number }) => (r.node.budget ? r.value / r.node.budget.limit : -1);
  const bySize = (x: { value: number }, y: { value: number }) => y.value - x.value;
  const comparators: Record<SortMode, (x: typeof right[number], y: typeof right[number]) => number> = {
    size: bySize,
    // most over budget first, then budgeted categories by usage, then the rest by size; saving last
    budget: (x, y) => Number(isSaving(x.node)) - Number(isSaving(y.node)) || usage(y) - usage(x) || bySize(x, y),
    group: (x, y) => GROUPS.indexOf(x.node.group!) - GROUPS.indexOf(y.node.group!) || bySize(x, y),
    expected: (x, y) => y.predicted - x.predicted || bySize(x, y),
    name: (x, y) => Number(isSaving(x.node)) - Number(isSaving(y.node)) || x.node.name.localeCompare(y.node.name),
  };
  right.sort(comparators[sort]);
  for (const r of right) links.push({ source: hub, target: add(r.node), value: r.value, predicted: r.predicted });

  const rightCount = nodes.filter((n) => n.kind === 'spend' || n.kind === 'invest' || n.kind === 'save').length;
  const predOf = (f: (l: FlowLink) => boolean) => links.filter(f).reduce((sum, l) => sum + (l.predicted ?? 0), 0);
  const incomePred = predOf((l) => nodes[l.target].kind === 'hub');
  const spendPred = predOf((l) => nodes[l.source].kind === 'hub' && nodes[l.target].kind === 'spend');
  const investPred = predOf((l) => nodes[l.target].kind === 'invest');
  const predictedTotal = spendPred + investPred;
  const hasBudgets = nodes.some((n) => n.budget);
  const overBudget = nodes.filter((n) => n.budget && (n.budget.state === 'over' || n.budget.state === 'pace'));
  return { hasBudgets, overBudget, nodes, links, incomeTotal, spendTotal, invested, saved, draw, base, rightCount, predictedTotal, incomePred, spendPred, investPred };
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

  const [budgets, setBudgets] = useState<Budgets>(sharedBudgets ?? {});
  const [editingBudgets, setEditingBudgets] = useState(false);
  const [sort, setSort] = useState<SortMode>('size');
  useEffect(() => {
    if (data && !sharedBudgets) { sharedBudgets = toBudgets(data.budgets); setBudgets(sharedBudgets); }
  }, [data]);
  const singleMonth = start.slice(0, 7) === end.slice(0, 7);

  async function saveBudget(id: string, amount: number | null) {
    const prev = budgets;
    const next = { ...budgets };
    if (amount && amount > 0) next[id] = amount; else delete next[id];
    sharedBudgets = next; setBudgets(next);
    try {
      const res = await fetch('/api/budgets', {
        method: amount && amount > 0 ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(amount && amount > 0 ? { category_id: id, monthly_amount: amount } : { category_id: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      sharedBudgets = prev; setBudgets(prev);
    }
  }

  const [showPredictions, setShowPredictions] = useState(true);
  const hasPredictions = !!data?.predicted;
  const effective = useMemo(() => (data ? (showPredictions ? withPredictions(data) : { ...data, predicted: null }) : null), [data, showPredictions]);
  const graph = useMemo(() => (effective ? buildGraph(effective, singleMonth ? budgets : {}, sort) : null), [effective, budgets, singleMonth, sort]);
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
      const b = graph.nodes[h.index].budget;
      const g = graph.nodes[h.index].group;
      if (g) lines.push(g);
      if (b) lines.push(`Budget ${formatCurrency(b.limit)}/mo · ${b.total > b.limit ? `${formatCurrency(b.total - b.limit)} over` : `${formatCurrency(b.limit - b.total)} left`}`);
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
    const bud = node.budget;
    const over = !!bud && (bud.state === 'over' || bud.state === 'pace') && total > 0;
    const excess = over && bud ? Math.min(1, (total - bud.limit) / total) : 0;
    const budgetLine = bud
      ? bud.state === 'over'
        ? `▲ ${compactMoney(bud.actual - bud.limit)} over ${compactMoney(bud.limit)} budget`
        : bud.state === 'pace'
          ? `▲ on pace ${compactMoney(bud.total - bud.limit)} over ${compactMoney(bud.limit)} budget`
          : `${compactMoney(bud.limit - bud.total)} left of ${compactMoney(bud.limit)} budget`
      : null;
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
        {over && (
          // the part of the bar beyond the budget, in red, with a tick where the budget ends
          <>
            <rect x={p.x} y={p.y + p.height * (1 - excess)} width={p.width} height={Math.max(p.height * excess, 2)} rx={3} fill={RED} />
            <rect x={p.x - 3} y={p.y + p.height * (1 - excess) - 1} width={p.width + 6} height={2} fill={RED} />
          </>
        )}
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
            y={cy - (compact ? 0 : (pred > 0 ? 6 : 0) + (budgetLine ? 6 : 0))}
            textAnchor={left ? 'end' : 'start'}
            fontSize={compact ? 10.5 : 12}
            fill="rgb(var(--ink-700))"
          >
            <tspan x={left ? p.x - (compact ? 5 : 8) : p.x + p.width + (compact ? 5 : 8)} dy="-0.35em" fontWeight={500} fill={over ? 'rgb(var(--accent-red))' : undefined}>{over ? '▲ ' : ''}{compact ? clip(node.name, 11) : node.name}</tspan>
            <tspan data-sensitive x={left ? p.x - (compact ? 5 : 8) : p.x + p.width + (compact ? 5 : 8)} dy="1.35em" fontSize={compact ? 9.5 : 11} fill="rgb(var(--ink-300))">
              {compact ? compactMoney(total) : `${formatCurrency(total)} · ${pctInc}%`}
            </tspan>
            {!compact && pred > 0 && (
              <tspan data-sensitive x={left ? p.x - 8 : p.x + p.width + 8} dy="1.3em" fontSize={10} fill="rgb(var(--ink-300))" fillOpacity={0.85}>
                {compactMoney(total - pred)} so far · +{compactMoney(pred)} expected
              </tspan>
            )}
            {!compact && budgetLine && (
              <tspan
                data-sensitive x={left ? p.x - 8 : p.x + p.width + 8} dy="1.3em" fontSize={10}
                fontWeight={over ? 600 : 400}
                fill={over ? 'rgb(var(--accent-red))' : 'rgb(var(--ink-300))'}
              >
                {budgetLine}
              </tspan>
            )}
          </text>
        )}
      </g>
    );
  };

  const withPred = !!graph && (graph.predictedTotal > 0 || graph.hasBudgets);
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
          <label className="flex items-center gap-1 text-[11px] text-ink-400">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="rounded-full border border-sand-200 bg-white px-2 py-0.5 text-[11px] text-ink-700 focus:outline-none"
            >
              {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setEditingBudgets((v) => !v)}
            title="Set a monthly budget per category"
            className={`pill px-2.5 py-0.5 text-[11px] ${editingBudgets ? 'pill-active' : ''}`}
          >
            Budgets
          </button>
        </div>
      </div>

      {graph && singleMonth && graph.overBudget.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          <span className="font-semibold">▲ {graph.overBudget.length} {graph.overBudget.length === 1 ? 'category' : 'categories'} over budget</span>
          {graph.overBudget.map((n) => (
            <span key={n.catId} data-sensitive>
              {n.name} <span className="font-semibold">+{formatCurrency((n.budget!.state === 'over' ? n.budget!.actual : n.budget!.total) - n.budget!.limit)}</span>
              {n.budget!.state === 'pace' && ' (projected)'}
            </span>
          ))}
        </div>
      )}

      {graph && editingBudgets && effective && (
        <BudgetEditor
          items={effective.spending}
          saved={data?.budgets ?? []}
          budgets={budgets}
          singleMonth={singleMonth}
          onSave={saveBudget}
        />
      )}

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
                  sort={false}
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

function BudgetEditor({ items, saved, budgets, singleMonth, onSave }: {
  items: FlowItem[];
  saved: BudgetItem[];
  budgets: Budgets;
  singleMonth: boolean;
  onSave: (id: string, amount: number | null) => void;
}) {
  // Every spending category in the range, plus any budgeted category with no spending yet.
  const rows = new Map<string, { id: string; name: string; icon: string | null; total: number }>();
  for (const i of items) rows.set(i.id, { id: i.id, name: i.name, icon: i.icon, total: i.amount });
  for (const b of saved) if (budgets[b.id] && !rows.has(b.id)) rows.set(b.id, { id: b.id, name: b.name, icon: b.icon, total: 0 });
  const list = Array.from(rows.values())
    .filter((r) => r.id !== '__uncategorized__')
    .sort((a, b) => {
      const ra = budgets[a.id] ? a.total / budgets[a.id] : -1;
      const rb = budgets[b.id] ? b.total / budgets[b.id] : -1;
      return rb - ra || b.total - a.total;
    });

  return (
    <div className="mt-3 rounded-xl border border-sand-200/70 bg-sand-100/40 px-3 py-2.5">
      <p className="text-[11px] text-ink-400">
        Monthly budget per category. Press Enter to save; clear the box to remove it.
        {!singleMonth && ' Pick a single month to compare spending against these.'}
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {list.map((r) => {
          const limit = budgets[r.id];
          const ratio = limit ? r.total / limit : 0;
          const bar = !limit ? '' : ratio > 1 ? 'bg-accent-red' : ratio >= 0.85 ? 'bg-yellow-400' : 'bg-accent-green';
          return (
            <li key={r.id} className="flex items-center gap-2">
              <span aria-hidden className="w-5 text-center text-sm">{r.icon ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-ink-700">{r.name}</span>
                  <span data-sensitive className={`shrink-0 tabular-nums ${ratio > 1 ? 'font-semibold text-accent-red' : 'text-ink-300'}`}>
                    {formatCurrency(r.total)}{limit ? ` · ${ratio > 1 ? `${formatCurrency(r.total - limit)} over` : `${Math.round(ratio * 100)}%`}` : ''}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand-200">
                  {limit ? <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} /> : null}
                </div>
              </div>
              <BudgetInput key={`${r.id}-${limit ?? ''}`} value={limit} onSave={(v) => onSave(r.id, v)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BudgetInput({ value, onSave }: { value?: number; onSave: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  const commit = () => {
    const n = parseFloat(draft);
    const next = Number.isFinite(n) && n > 0 ? n : null;
    if ((next ?? undefined) !== value) onSave(next);
  };
  return (
    <label className="flex w-24 shrink-0 items-center rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs text-ink-500 focus-within:border-ink-400">
      $
      <input
        type="number" inputMode="decimal" min="0" step="10" placeholder="Budget"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="ml-1 w-full min-w-0 bg-transparent text-ink-700 placeholder:text-ink-300 focus:outline-none"
        data-sensitive
      />
    </label>
  );
}
