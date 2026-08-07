import { differenceInCalendarDays, format } from 'date-fns';

// Vertical divider markers for daily-granularity time-series charts — the
// x-axis itself only labels a handful of ticks (interval="preserveStartEnd"),
// so a chart spanning several weeks or months otherwise gives no visual sense
// of where one period ends and the next begins. Month dividers always show
// once the span is wide enough to make them meaningful; week dividers
// (Monday-start, matching SpendingProgress's own bucketing) additionally show
// as long as the span isn't so wide that weekly lines would just clutter the
// chart. A point that starts both a new week and a new month only gets the
// (more prominent) month marker, never both stacked at the same x.

export interface BoundaryPoint {
  /** ISO yyyy-mm-dd */
  date: string;
  /** Must match the chart's XAxis dataKey value for this point exactly. */
  label: string;
}

export interface PeriodBoundary {
  x: string;
  text: string;
  kind: 'week' | 'month';
}

// Shared visual treatment so week/month dividers look identical across every
// chart that uses them (Spending, Income, Net worth, Investment progress).
// Months are the more prominent marker — darker, heavier, bolder label — so
// they read clearly even next to the (deliberately subtler) week dividers.
export const BOUNDARY_STYLE: Record<PeriodBoundary['kind'], {
  stroke: string; strokeWidth: number; dash: string;
  fill: string; fontSize: number; fontWeight: number;
}> = {
  week:  { stroke: '#B8B3AB', strokeWidth: 1,   dash: '2 3', fill: '#6B645A', fontSize: 9,  fontWeight: 500 },
  month: { stroke: '#6B645A', strokeWidth: 1.5, dash: '4 2', fill: '#2B2724', fontSize: 11, fontWeight: 700 },
};

const MIN_SPAN_DAYS = 10;
const WEEK_MAX_SPAN_DAYS = 75;

export function periodBoundaries(points: BoundaryPoint[]): PeriodBoundary[] {
  if (points.length < 3) return [];
  const spanDays = differenceInCalendarDays(
    new Date(points[points.length - 1].date + 'T12:00:00'),
    new Date(points[0].date + 'T12:00:00'),
  );
  if (spanDays < MIN_SPAN_DAYS) return [];
  const showWeeks = spanDays <= WEEK_MAX_SPAN_DAYS;

  const boundaries: PeriodBoundary[] = [];
  let lastMonthKey: string | null = null;
  let lastWeekKey: string | null = null;

  points.forEach((p, i) => {
    const d = new Date(p.date + 'T12:00:00');
    const monthKey = p.date.slice(0, 7);
    const monday = new Date(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weekKey = format(monday, 'yyyy-MM-dd');

    // Skip the chart's own first point — a divider right at the left edge
    // has nothing to separate.
    if (i > 0 && monthKey !== lastMonthKey) {
      boundaries.push({ x: p.label, text: format(d, 'MMM'), kind: 'month' });
    } else if (showWeeks && i > 0 && weekKey !== lastWeekKey) {
      boundaries.push({ x: p.label, text: format(d, 'MMM d'), kind: 'week' });
    }

    lastMonthKey = monthKey;
    lastWeekKey = weekKey;
  });
  return boundaries;
}
