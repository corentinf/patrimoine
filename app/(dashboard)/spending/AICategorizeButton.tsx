'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'running' | 'done' | 'error';

interface CategorizeResult {
  total: number;
  ruleMatched: number;
  llmCategorized: number;
  newCategories: string[];
  errors: string[];
  noApiKey: boolean;
}

export default function AICategorizeButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CategorizeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleRun() {
    setPhase('running');
    setResult(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/categorize', { method: 'POST' });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        setErrorMsg(`Server error (${res.status}):\n${text.slice(0, 400)}`);
        setPhase('error');
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error || 'Categorization failed');
        setPhase('error');
        return;
      }
      setResult(data);
      setPhase('done');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Request failed');
      setPhase('error');
    }
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={handleRun}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-sand-200 text-ink-500 hover:border-ink-300 hover:text-ink-700 transition-colors"
      >
        <span>✦</span> Categorize with AI
      </button>
    );
  }

  if (phase === 'running') {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-ink-500 px-3 py-1.5 rounded-lg border border-sand-200 bg-sand-50">
        <span className="inline-block w-3 h-3 border-2 border-ink-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Analyzing transactions…
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs space-y-1.5 max-w-xs">
        <p className="font-medium text-red-600">Categorization failed</p>
        <pre className="text-red-400 whitespace-pre-wrap break-all">{errorMsg}</pre>
        <button onClick={() => setPhase('idle')} className="text-ink-400 hover:text-ink-600">Try again</button>
      </div>
    );
  }

  // done
  const total = (result?.ruleMatched ?? 0) + (result?.llmCategorized ?? 0);
  return (
    <div className="rounded-lg border border-sand-200 bg-sand-50 p-3 text-xs space-y-2 max-w-xs">
      <p className="font-medium text-ink-700">
        {total === 0 ? 'All transactions already categorized' : `${total} transaction${total !== 1 ? 's' : ''} categorized`}
      </p>

      {result && total > 0 && (
        <ul className="space-y-1 text-ink-500">
          {result.ruleMatched > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="text-green-500">✓</span>
              {result.ruleMatched} matched by rules
            </li>
          )}
          {result.llmCategorized > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="text-green-500">✦</span>
              {result.llmCategorized} categorized by Claude
            </li>
          )}
          {result.newCategories.length > 0 && (
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">+</span>
              <span>New categories created: {result.newCategories.join(', ')}</span>
            </li>
          )}
        </ul>
      )}

      {result?.noApiKey && (
        <p className="text-amber-600">⚠ ANTHROPIC_API_KEY not set — only rule-based categorization ran.</p>
      )}

      {result?.errors.map((e, i) => (
        <p key={i} className="text-red-400">⚠ {e}</p>
      ))}

      <button onClick={() => setPhase('idle')} className="text-ink-400 hover:text-ink-600">Run again</button>
    </div>
  );
}
