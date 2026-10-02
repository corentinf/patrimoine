'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncStatus, formatLastSynced } from '@/app/lib/syncStatus';
import { useShortcutsHelp } from './KeyboardShortcuts';
import { ThemeToggle } from '@/app/lib/theme';

// Marks the end of every dashboard page: where things live, how fresh the data is, and the
// few outside places this app depends on (the bank connectors).

const PAGES = [
  { href: '/home', label: 'Home' },
  { href: '/spending', label: 'Spending' },
  { href: '/income', label: 'Income' },
  { href: '/networth', label: 'Investment' },
];

const EXTERNAL = [
  { href: 'https://dashboard.plaid.com', label: 'Plaid dashboard' },
  { href: 'https://bridge.simplefin.org/my-account', label: 'SimpleFIN Bridge' },
];

const linkCls = 'text-sm text-ink-500 hover:text-ink-800 transition-colors';

export default function Footer() {
  const pathname = usePathname();
  const { phase, lastSyncedAt, runSync } = useSyncStatus();
  const { openHelp } = useShortcutsHelp();
  const syncing = phase === 'syncing';

  return (
    <footer className="mt-12 border-t border-sand-200/70 pt-8 pb-4">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr]">
        {/* Brand */}
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink-800">
            <span aria-hidden className="gradient-card g-aurora inline-block h-4 w-4 !rounded-full" />
            Patrimoine
          </p>
          <p className="max-w-xs text-sm leading-relaxed text-ink-400">
            Your accounts, spending and investments in one place — built for one person, kept private.
          </p>
        </div>

        {/* Pages */}
        <nav aria-label="Pages" className="space-y-2.5">
          <p className="stat-label">Pages</p>
          <ul className="space-y-2">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className={`${linkCls} ${pathname.startsWith(p.href) ? '!text-ink-800 font-medium' : ''}`}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Data */}
        <div className="space-y-2.5">
          <p className="stat-label">Your data</p>
          <ul className="space-y-2 text-sm text-ink-500">
            <li>
              {lastSyncedAt ? `Last synced ${formatLastSynced(lastSyncedAt)}` : 'Not synced yet'}
              {' · '}
              <button
                type="button"
                onClick={() => runSync()}
                disabled={syncing}
                className="text-accent-green hover:underline underline-offset-2 disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </li>
            <li className="text-ink-400">
              Banks connect through Plaid and SimpleFIN. Balances can lag the bank by a few hours — check
              your bank for the exact figure.
            </li>
          </ul>
        </div>

        {/* Help */}
        <div className="space-y-2.5">
          <p className="stat-label">Help</p>
          <ul className="space-y-2">
            <li>
              <button type="button" onClick={openHelp} className={linkCls}>
                Keyboard shortcuts <kbd className="ml-1 rounded border border-sand-300 px-1.5 text-[11px] text-ink-400">?</kbd>
              </button>
            </li>
            {EXTERNAL.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {l.label} <span aria-hidden className="text-ink-300">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-sand-200/60 pt-4 text-xs text-ink-300">
        <p>© {new Date().getFullYear()} Patrimoine · Figures are for personal tracking, not financial advice.</p>
        <ThemeToggle className="!h-8 !w-8" />
      </div>
    </footer>
  );
}
