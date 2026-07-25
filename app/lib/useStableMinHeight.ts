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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setMinHeight((prev) => Math.max(prev, entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, minHeight };
}
