'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@/app/lib/supabase';

const navItems = [
  { href: '/accounts', label: 'Accounts', icon: '◉' },
  { href: '/spending', label: 'Spending', icon: '◧' },
  { href: '/networth', label: 'Net worth', icon: '◆' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-white border-r border-sand-200 flex flex-col z-10">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-sand-100">
        <h1 className="font-display text-xl text-ink-800 tracking-tight">
          Patrimoine
        </h1>
        <p className="text-xs text-ink-300 mt-0.5 font-body">
          personal finance
        </p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150
                ${isActive
                  ? 'bg-sand-100 text-ink-800'
                  : 'text-ink-400 hover:text-ink-600 hover:bg-sand-50'
                }
              `}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-sand-100 space-y-2">
        <SyncButton />
        <SignOutButton />
      </div>
    </aside>
  );
}

function SyncButton() {
  const handleSync = async () => {
    const btn = document.getElementById('sync-btn');
    if (btn) btn.textContent = 'Syncing…';

    try {
      const res = await fetch('/api/simplefin/sync', { method: 'POST' });
      const data = await res.json();

      if (data.ok) {
        if (btn) btn.textContent = '✓ Synced';
        // Refresh the page to show new data
        setTimeout(() => window.location.reload(), 800);
      } else {
        if (btn) btn.textContent = 'Sync failed';
        console.error(data.error);
      }
    } catch (err) {
      if (btn) btn.textContent = 'Sync failed';
      console.error(err);
    }

    setTimeout(() => {
      if (btn) btn.textContent = '↻ Sync now';
    }, 3000);
  };

  return (
    <button
      id="sync-btn"
      onClick={handleSync}
      className="w-full btn-secondary text-xs justify-center"
    >
      ↻ Sync now
    </button>
  );
}

function SignOutButton() {
  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full text-xs text-ink-400 hover:text-ink-600 transition-colors py-1.5 text-center"
    >
      Sign out
    </button>
  );
}
