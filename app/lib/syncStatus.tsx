'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error';
export type SyncStep = 'accounts' | 'transactions' | 'categorize' | 'snapshot';

// Balances data freshness vs Plaid API costs — at ~4 connected items this
// caps auto-sync at 4/day even if the app is opened repeatedly.
const STALE_MS = 6 * 60 * 60 * 1000;
const STORAGE_KEY = 'patrimoine:lastSyncedAt';

interface SyncStatusValue {
  phase: SyncPhase;
  doneSteps: Set<SyncStep>;
  result: any;
  errorMsg: string;
  lastSyncedAt: Date | null;
  justSynced: boolean;
  runSync: () => Promise<void>;
}

const SyncStatusContext = createContext<SyncStatusValue>({
  phase: 'idle',
  doneSteps: new Set(),
  result: null,
  errorMsg: '',
  lastSyncedAt: null,
  justSynced: false,
  runSync: async () => {},
});

function readCachedLastSyncedAt(): Date | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedLastSyncedAt(date: Date) {
  try { localStorage.setItem(STORAGE_KEY, date.toISOString()); } catch {}
}

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [doneSteps, setDoneSteps] = useState<Set<SyncStep>>(new Set());
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [justSynced, setJustSynced] = useState(false);
  const phaseRef = useRef<SyncPhase>('idle');
  const router = useRouter();

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const runSync = async () => {
    if (phaseRef.current === 'syncing') return;
    setPhase('syncing');
    setResult(null);
    setErrorMsg('');
    setDoneSteps(new Set());
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try { msg = JSON.parse(text).error || msg; } catch {}
        setErrorMsg(msg); setPhase('error'); return;
      }
      if (!res.body) { setErrorMsg('No response body'); setPhase('error'); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: any;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'progress') {
            setDoneSteps((prev) => { const next = new Set(prev); next.add(event.step); return next; });
          } else if (event.done) {
            if (event.ok) {
              setResult(event);
              setPhase('done');
              const now = new Date();
              setLastSyncedAt(now);
              writeCachedLastSyncedAt(now);
              setJustSynced(true);
              router.refresh();
              setTimeout(() => { setJustSynced(false); setPhase('idle'); }, 3000);
            } else {
              setErrorMsg(event.error || 'Sync failed');
              setPhase('error');
            }
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Sync failed');
      setPhase('error');
    }
  };

  // Runs once per app load (this provider wraps both the desktop Header and
  // MobileTopBar, which are both always mounted — doing this check inside
  // either of them directly would fire it twice).
  useEffect(() => {
    const cached = readCachedLastSyncedAt();
    if (cached) setLastSyncedAt(cached);

    let cancelled = false;
    (async () => {
      let resolved = cached;
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          resolved = data.last_synced_at ? new Date(data.last_synced_at) : null;
          if (resolved) writeCachedLastSyncedAt(resolved);
          if (!cancelled) setLastSyncedAt(resolved);
        }
      } catch {
        // Network error — fall back to whatever localStorage gave us.
      }
      if (cancelled) return;
      if (!resolved || Date.now() - resolved.getTime() > STALE_MS) {
        runSync();
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SyncStatusContext.Provider value={{ phase, doneSteps, result, errorMsg, lastSyncedAt, justSynced, runSync }}>
      {children}
    </SyncStatusContext.Provider>
  );
}

export function useSyncStatus() {
  return useContext(SyncStatusContext);
}

export function formatLastSynced(date: Date): string {
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
}
