'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePageFilterSlotContent } from '@/app/lib/pageFilterSlot';
import { SyncDropdown, FilterBar } from './Header';
import MobileFilterSheet from './MobileFilterSheet';

const PAGE_LABELS: Record<string, string> = {
  '/home': 'Home',
  '/spending': 'Spending',
  '/income': 'Income',
  '/networth': 'Investment',
  '/profile': 'Profile',
};

export default function MobileTopBar() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pageFilterContent = usePageFilterSlotContent();

  const pageLabel = Object.entries(PAGE_LABELS).find(([href]) => pathname.startsWith(href))?.[1] ?? 'Patrimoine';

  return (
    <>
      <header
        className="md:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-sand-200"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="h-14 px-4 flex items-center gap-3">
          <h1 className="font-display text-base text-ink-800 tracking-tight flex-1 min-w-0 truncate">
            {pageLabel}
          </h1>
          <SyncDropdown />
          {!!pageFilterContent && (
            <button
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 px-3 py-1.5 rounded-lg hover:bg-sand-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6M11 16h2" />
              </svg>
              Filters
            </button>
          )}
        </div>
        <div className="px-4">
          <FilterBar />
        </div>
      </header>

      {sheetOpen && <MobileFilterSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
}
