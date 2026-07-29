'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'uploading' | 'done' | 'error';

interface UnmatchedDetail {
  note: string;
  amount: number;
  date: string;
  reason: string;
}

interface ImportResult {
  matched: number;
  unmatched: number;
  skipped: number;
  total: number;
  unmatchedDetails: UnmatchedDetail[];
}

export default function AmazonImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  async function handleFile(file: File) {
    setPhase('uploading');
    setResult(null);
    setErrorMsg('');
    setShowUnmatched(false);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/amazon-import', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Import failed');
        setPhase('error');
        return;
      }
      setResult(data);
      setPhase('done');
      if (data.matched > 0) router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Request failed');
      setPhase('error');
    }
  }

  if (phase === 'idle') {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          Import Amazon Orders CSV
        </button>
      </>
    );
  }

  if (phase === 'uploading') {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-ink-500 px-3 py-1.5 rounded-lg border border-sand-200 bg-sand-50">
        <span className="inline-block w-3 h-3 border-2 border-ink-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Matching orders…
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs space-y-1.5 max-w-sm">
        <p className="font-medium text-red-600">Import failed</p>
        <p className="text-red-400">{errorMsg}</p>
        <button onClick={() => setPhase('idle')} className="text-ink-400 hover:text-ink-600">Try again</button>
      </div>
    );
  }

  const hasUnmatched = (result?.unmatchedDetails?.length ?? 0) > 0;

  return (
    <div className="relative group/amzn inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setSummaryOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 text-xs text-ink-500"
      >
        <span className="text-green-500">✓</span>
        {result?.matched === 0
          ? 'No transactions matched'
          : `${result?.matched} transaction${result?.matched !== 1 ? 's' : ''} labeled`}
      </button>

      {/* Tooltip */}
      <div
        className={`absolute bottom-full left-0 mb-2 w-64 bg-white border border-sand-200 rounded-lg shadow-lg p-3 text-xs space-y-2 transition-opacity z-50 md:group-hover/amzn:opacity-100 md:group-hover/amzn:pointer-events-auto ${
          summaryOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ul className="space-y-0.5 text-ink-500">
          {(result?.matched ?? 0) > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="text-green-500">✓</span>
              {result?.matched} order{result?.matched !== 1 ? 's' : ''} labeled with their item names
            </li>
          )}
          {(result?.unmatched ?? 0) > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="text-ink-300">–</span>
              {result?.unmatched} couldn't be matched
            </li>
          )}
        </ul>

        {hasUnmatched && (
          <button
            onClick={() => setShowUnmatched((v) => !v)}
            className="text-ink-400 hover:text-ink-600"
          >
            {showUnmatched ? 'Hide' : 'Show'} unmatched ({result?.unmatched})
          </button>
        )}

        {showUnmatched && result?.unmatchedDetails && (
          <div className="space-y-1.5 max-h-48 overflow-y-auto border-t border-sand-200 pt-2">
            {result.unmatchedDetails.map((d, i) => (
              <div key={i} className="space-y-0.5">
                <p className="font-medium text-ink-600">{d.note} · ${d.amount.toFixed(2)} · {d.date}</p>
                <p className="text-ink-400 text-[11px] leading-relaxed">{d.reason}</p>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setPhase('idle')} className="text-ink-400 hover:text-ink-600">Import another</button>

        <span className="absolute top-full left-4 -translate-x-1/2 border-4 border-transparent border-t-sand-200" />
      </div>
    </div>
  );
}
