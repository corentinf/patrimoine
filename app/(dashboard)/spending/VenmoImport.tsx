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

export default function VenmoImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);

  async function handleFile(file: File) {
    setPhase('uploading');
    setResult(null);
    setErrorMsg('');
    setShowUnmatched(false);

    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch('/api/venmo-import', { method: 'POST', body });
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
          <img src="/venmo.svg" alt="" className="w-3.5 h-3.5" style={{ filter: 'brightness(0) saturate(100%) invert(60%) sepia(0%) saturate(0%)' }} />
          Import Venmo CSV
        </button>
      </>
    );
  }

  if (phase === 'uploading') {
    return (
      <div className="inline-flex items-center gap-2 text-xs text-ink-500 px-3 py-1.5 rounded-lg border border-sand-200 bg-sand-50">
        <span className="inline-block w-3 h-3 border-2 border-ink-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        Matching transactions…
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
  const allFromBalance = result?.unmatchedDetails.every((d) =>
    d.reason.includes('Venmo balance'),
  );

  return (
    <div className="rounded-lg border border-sand-200 bg-sand-50 p-3 text-xs space-y-2 max-w-sm">
      <p className="font-medium text-ink-700">
        {result?.matched === 0 ? 'No transactions matched' : `${result?.matched} transaction${result?.matched !== 1 ? 's' : ''} labeled`}
      </p>

      <ul className="space-y-0.5 text-ink-500">
        {(result?.matched ?? 0) > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="text-green-500">✓</span>
            {result?.matched} Chase→Venmo transfers labeled
          </li>
        )}
        {(result?.unmatched ?? 0) > 0 && (
          <li className="flex items-center gap-1.5">
            <span className="text-ink-300">–</span>
            {result?.unmatched} couldn't be matched
          </li>
        )}
      </ul>

      {hasUnmatched && allFromBalance && (
        <p className="text-ink-400 text-[11px] leading-relaxed">
          Most unmatched payments came from your <strong>Venmo balance</strong> rather than directly from Chase, so there's no matching bank transaction.
        </p>
      )}

      {hasUnmatched && !allFromBalance && (
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
    </div>
  );
}
