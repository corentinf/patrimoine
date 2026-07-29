'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { usePrivacy } from '@/app/lib/privacy';

const TAB_PATHS = ['/home', '/spending', '/income', '/networth'];

interface ShortcutGroup {
  title: string;
  items: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { keys: '1 – 4', description: 'Jump to Home / Spending / Income / Investment' },
      { keys: '← →', description: 'Step the time period back / forward' },
      { keys: 'R', description: 'Reset the time period to the current month' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: 'P', description: 'Toggle privacy mode (blur amounts)' },
      { keys: 'D', description: 'Toggle demo mode (fake amounts)' },
    ],
  },
  {
    title: 'Help',
    items: [
      { keys: '?', description: 'Open or close this shortcuts list' },
      { keys: 'Esc', description: 'Close this shortcuts list' },
    ],
  },
];

interface ShortcutsContextValue {
  openHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function useShortcutsHelp() {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) throw new Error('useShortcutsHelp must be used within a KeyboardShortcutsProvider');
  return ctx;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl p-6 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-ink-800">Keyboard shortcuts</h3>
          <button onClick={onClose} className="p-1 text-ink-300 hover:text-ink-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">{group.title}</p>
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <div key={item.keys} className="flex items-center justify-between gap-4">
                  <span className="text-xs text-ink-600">{item.description}</span>
                  <kbd className="flex-shrink-0 px-2 py-1 rounded-md bg-sand-100 border border-sand-200 text-xs font-mono text-ink-700 whitespace-nowrap">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-ink-300">
          Shortcuts are disabled while typing in a text field.
        </p>
      </div>
    </div>
  );
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const { stepPeriod, resetFilter, canStepBackward, canStepForward } = useGlobalFilter();
  const { toggle: togglePrivacy, toggleFake } = usePrivacy();

  const openHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (helpOpen) return;

      if (e.key === 'ArrowLeft') {
        if (canStepBackward) stepPeriod(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        if (canStepForward) stepPeriod(1);
        return;
      }
      if (e.key >= '1' && e.key <= '4') {
        const path = TAB_PATHS[Number(e.key) - 1];
        if (path) router.push(path);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        resetFilter();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        togglePrivacy();
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        toggleFake();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [helpOpen, canStepBackward, canStepForward, stepPeriod, resetFilter, togglePrivacy, toggleFake, router]);

  return (
    <ShortcutsContext.Provider value={{ openHelp }}>
      {children}
      {helpOpen && <ShortcutsModal onClose={() => setHelpOpen(false)} />}
    </ShortcutsContext.Provider>
  );
}
