'use client';

import { useEffect, type RefObject } from 'react';

// Publishes an element's rendered height to a CSS custom property on
// <html>, so sticky elements further down the page can offset by
// `var(--name)` instead of a hardcoded pixel guess. Several elements can
// share one var name (e.g. the desktop vs. mobile header) — a hidden
// (display:none) element reports height 0, which is ignored here so it
// never clobbers the real value written by whichever one is actually visible.
export function useMeasureCssVar(ref: RefObject<HTMLElement | null>, name: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const h = el.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty(name, `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, name]);
}
