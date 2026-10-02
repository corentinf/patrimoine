'use client';

import { useEffect, useRef, useState } from 'react';

// Tracks the tallest height an element has ever reached and returns a ref +
// minHeight to pin the element (and therefore the page) at that floor. Used
// for containers whose content can shrink a lot when a filter narrows (e.g.
// hovering a chart bar cuts a transaction list down to one day) — without
// this, the page can get shorter than the current scroll position, snapping
// the viewport upward mid-interaction. The floor only ever grows, so
// genuinely longer content (a bigger month, a wider date range) still
// expands it normally.
export function useStableMinHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [minHeight, setMinHeight] = useState(0);
  const lastWidth = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      // Content that wraps (pills, chips) legitimately changes height when the
      // available width changes — drop the floor so it re-measures at the new
      // width instead of staying pinned at a height from the old one.
      if (lastWidth.current !== null && Math.abs(entry.contentRect.width - lastWidth.current) > 1) {
        lastWidth.current = entry.contentRect.width;
        setMinHeight(0);
        return;
      }
      lastWidth.current = entry.contentRect.width;
      setMinHeight((prev) => Math.max(prev, entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, minHeight };
}
