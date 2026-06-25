'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type SidebarAccount } from './AccountsPanel';

export type { SidebarAccount };

const navItems = [
  { href: '/home', label: 'Home' },
  { href: '/spending', label: 'Spending' },
  { href: '/income', label: 'Income' },
  { href: '/networth', label: 'Investment' },
  { href: '/profile', label: 'Profile' },
];

function shortNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

interface SidebarProps {
  accounts: SidebarAccount[];
  netWorth?: number;
  spending?: number;
  income?: number;
  investmentTotal?: number;
}

export default function Sidebar({ netWorth = 0, spending = 0, income = 0, investmentTotal = 0 }: SidebarProps) {
  const pathname = usePathname();

  const tabStats: Record<string, number | null> = {
    '/home': netWorth,
    '/spending': spending,
    '/income': income,
    '/networth': investmentTotal,
    '/profile': null,
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-sand-200 z-40 flex">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const stat = tabStats[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-4 transition-colors ${
              isActive ? 'text-ink-800' : 'text-ink-400'
            }`}
          >
            <span className={`text-xs font-semibold leading-tight ${isActive ? 'text-ink-800' : 'text-ink-400'}`}>
              {item.label}
            </span>
            {stat !== null ? (
              <span
                className={`text-[10px] font-mono ${isActive ? 'text-ink-500' : 'text-ink-300'}`}
                data-sensitive
              >
                {shortNum(stat)}
              </span>
            ) : (
              <span className="text-[10px] text-transparent select-none">—</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
