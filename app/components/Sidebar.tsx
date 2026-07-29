'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isFakeModeActive } from '@/app/lib/demoMode';
import { fakeifyAmount } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';

export const navItems = [
  { href: '/home', label: 'Home' },
  { href: '/spending', label: 'Spending' },
  { href: '/income', label: 'Income' },
  { href: '/networth', label: 'Investment' },
  { href: '/profile', label: 'Profile' },
];

function shortNum(rawN: number): string {
  const n = isFakeModeActive() ? fakeifyAmount(rawN) : rawN;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

interface SidebarProps {
  netWorth?: number;
  spending?: number;
  income?: number;
  investmentTotal?: number;
}

export default function Sidebar({ netWorth = 0, spending = 0, income = 0, investmentTotal = 0 }: SidebarProps) {
  const pathname = usePathname();
  // Not otherwise used here — but subscribing is what makes this component
  // re-render (and shortNum() below re-check demo mode) when the toggle in
  // Profile changes it, since shortNum reads a plain flag outside React state.
  usePrivacy();

  const tabStats: Record<string, number | null> = {
    '/home': netWorth,
    '/spending': spending,
    '/income': income,
    '/networth': investmentTotal,
    '/profile': null,
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 w-screen bg-white/95 backdrop-blur border-t border-sand-200 z-50 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const stat = tabStats[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-3 transition-colors ${
              isActive ? 'text-ink-800' : 'text-ink-400'
            }`}
          >
            <span className={`text-xs font-semibold leading-tight ${isActive ? 'text-ink-800' : 'text-ink-400'}`}>
              {item.label}
            </span>
            <span
              className={`text-[10px] font-mono ${isActive ? 'text-ink-500' : 'text-ink-300'}`}
              data-sensitive
            >
              {stat !== null ? shortNum(stat) : ''}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
