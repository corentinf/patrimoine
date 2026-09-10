// Shared between the server-computed fallback (page.tsx, before any AI
// projection has been generated) and the client-side scenario switcher
// (HomeView.tsx, once one has) — same milestone-ETA math either way, just a
// different source for the monthly growth rate.

export const MILESTONE_TARGETS = [100_000, 250_000, 300_000, 400_000, 500_000, 750_000, 1_000_000];

export interface Milestone {
  target: number;
  passed: boolean;
  pct: number;
  eta: string | null;
}

export function buildMilestones(currentValue: number, growthRate: number | null): Milestone[] {
  const targets = MILESTONE_TARGETS.filter((t) => t > currentValue);
  return targets.map((target) => {
    const passed = currentValue >= target;
    const pct = passed ? 100 : Math.min((currentValue / target) * 100, 100);
    let eta: string | null = null;
    if (!passed && growthRate !== null && growthRate > 0) {
      const monthsNeeded = (target - currentValue) / growthRate;
      const etaDate = new Date();
      etaDate.setMonth(etaDate.getMonth() + Math.ceil(monthsNeeded));
      eta = etaDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return { target, passed, pct, eta };
  });
}

export interface Scenario {
  monthlyNetWorthDelta: number;
  monthlyAssetsDelta: number;
  monthlyLiabilitiesDelta: number;
  summary: string;
  recommendations: string[];
}

export interface ScenarioSet {
  optimistic: Scenario;
  regular: Scenario;
  pessimistic: Scenario;
}

export type ScenarioKey = keyof ScenarioSet;

export interface ProjectionRow {
  id: string;
  generated_at: string;
  model: string;
  scenarios: ScenarioSet;
}
