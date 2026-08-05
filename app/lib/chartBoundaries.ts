import { differenceInCalendarDays, format } from 'date-fns';

// Vertical divider markers for daily-granularity time-series charts — the
// x-axis itself only labels a handful of ticks (interval="preserveStartEnd"),
// so a chart spanning several weeks or months otherwise gives no visual sense
// of where one period ends and the next begins. Month dividers over a long
// span, week dividers (Monday-start, matching SpendingProgress's own bucketing)
// over a shorter one.

export interface BoundaryPoint {
  /** ISO yyyy-mm-dd */
  date: string;
  /** Must match the chart's XAxis dataKey value for this point exactly. */
  label: string;
}

export interface PeriodBoundary {
  x: string;
  text: string;
}

const WEEK_MIN_SPAN_DAYS = 10;
const MONTH_MIN_SPAN_DAYS = 75;

export function periodBoundaries(points: BoundaryPoint[]): PeriodBoundary[] {
  if (points.length < 3) return [];
  const spanDays = differenceInCalendarDays(
    new Date(points[points.length - 1].date + 'T12:00:00'),
    new Date(points[0].date + 'T12:00:00'),
  );
  if (spanDays < WEEK_MIN_SPAN_DAYS) return [];
  const granularity: 'week' | 'month' = spanDays >= MONTH_MIN_SPAN_DAYS ? 'month' : 'week';

  const boundaries: PeriodBoundary[] = [];
  let lastKey: string | null = null;
  points.forEach((p, i) => {
    const d = new Date(p.date + 'T12:00:00');
    let key: string;
    if (granularity === 'month') {
      key = p.date.slice(0, 7);
    } else {
      const monday = new Date(d);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      key = format(monday, 'yyyy-MM-dd');
    }
    // Skip the chart's own first point — a divider right at the left edge
    // has nothing to separate.
    if (i > 0 && key !== lastKey) {
      boundaries.push({
        x: p.label,
        text: granularity === 'month' ? format(d, 'MMM') : format(d, 'MMM d'),
      });
    }
    lastKey = key;
  });
  return boundaries;
}
