'use client';

import { useEffect } from 'react';
import { PageFiltersRow } from './Header';

interface MobileFilterSheetProps {
  onClose: () => void;
}

export default function MobileFilterSheet({ onClose }: MobileFilterSheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[59]" onClick={onClose} />

      {/* Sheet — above the fixed bottom tab bar (also z-50, mounted later in the DOM) */}
      <div
        className="fixed inset-x-0 bottom-0 z-[60] bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-sand-200" />
        </div>

        <div className="flex items-center justify-between px-4 pb-1 flex-shrink-0">
          <h3 className="font-display text-base text-ink-800">Filters</h3>
          <button
            onClick={onClose}
            className="text-sm font-medium text-ink-600 px-3 py-1.5 rounded-lg hover:bg-sand-50 transition-colors"
          >
            Done
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4">
          <PageFiltersRow />
        </div>
      </div>
    </div>
  );
}
