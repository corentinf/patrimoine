'use client';

import { formatCurrency } from '@/app/lib/utils';
import type { ProjectionRow, ScenarioKey } from '@/app/lib/projection';

const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  optimistic: 'Optimistic',
  regular: 'Regular',
  pessimistic: 'Pessimistic',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

interface ProjectionCardProps {
  projection: ProjectionRow | null;
  selectedScenario: ScenarioKey;
  onSelectScenario: (key: ScenarioKey) => void;
  onRegenerate: () => void;
  loading: boolean;
  error: string;
}

export default function ProjectionCard({
  projection, selectedScenario, onSelectScenario, onRegenerate, loading, error,
}: ProjectionCardProps) {
  const scenario = projection?.scenarios[selectedScenario];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">Projection</h3>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading}
          title={projection ? 'Regenerate projection' : 'Generate projection'}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 hover:text-ink-600 transition-colors disabled:opacity-40"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <div className="card px-5 py-4 space-y-4">
        {!projection ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-ink-400 max-w-sm mx-auto">
              Generate a smarter projection based on your real income, spending, and investment growth — optimistic, regular, and pessimistic scenarios, each with recommendations.
            </p>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-ink-800 text-white hover:bg-ink-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate projection'}
            </button>
            {error && <p className="text-xs text-accent-red">{error}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 flex-wrap">
              {(Object.keys(SCENARIO_LABELS) as ScenarioKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectScenario(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    selectedScenario === key
                      ? 'bg-ink-800 text-white'
                      : 'bg-sand-50 border border-sand-200 text-ink-500 hover:border-sand-300'
                  }`}
                >
                  {SCENARIO_LABELS[key]}
                </button>
              ))}
            </div>
            {scenario && (
              <div className="space-y-3">
                <p className="text-sm text-ink-600 leading-relaxed">{scenario.summary}</p>
                <ul className="space-y-1.5">
                  {scenario.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink-500">
                      <span className="text-ink-300 mt-0.5">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] text-ink-300 pt-1 border-t border-sand-100">
              <span>Updated {timeAgo(projection.generated_at)}</span>
              {error && <span className="text-accent-red">{error}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
