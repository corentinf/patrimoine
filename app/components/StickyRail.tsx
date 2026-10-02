'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// A right-hand rail that follows the page scroll on wide screens (xl and up).
//
// A plain `sticky top-N` rail has a well-known flaw: if it is taller than the window, its bottom
// is cut off until the very end of the page. So the stick offset is measured:
//   • rail fits in the window     → pin it just under the header
//   • rail is taller than window  → pin it by its BOTTOM edge instead: it scrolls with the page
//     until its last card is fully in view, then stays put (nothing is ever unreachable, and
//     there is no inner scrollbar).
//   • `fit` mode (Investment): the rail is capped at the window height instead, and its last card
//     scrolls internally — so the first card (the colour summary) is always in view.

const GAP = 24; // px of breathing room from the header / window bottom

export default function StickyRail({
  children,
  className = '',
  fit = false,
}: {
  children: ReactNode;
  className?: string;
  /** Cap the rail at the window height (flex column) and pin it under the header. The last child
   *  is expected to scroll internally — use when one card in the rail can be arbitrarily tall. */
  fit?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 96;
      const height = el.offsetHeight;
      const fits = fit || header + GAP + height + GAP <= window.innerHeight;
      setTop(fits ? header + GAP : window.innerHeight - height - GAP);
    };

    update();
    const resize = new ResizeObserver(update);
    resize.observe(el); // cards inside change height (insights load, filters, tabs…)
    window.addEventListener('resize', update);
    // The measured header height lives in a CSS variable on <html>; it changes when the filter
    // rows wrap or collapse.
    const vars = new MutationObserver(update);
    vars.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

    return () => {
      resize.disconnect();
      vars.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fit]);

  return (
    <div
      ref={ref}
      className={`xl:sticky ${fit ? 'xl:flex xl:flex-col xl:max-h-[calc(100vh_-_var(--header-h,96px)_-_3rem)]' : ''} ${className}`}
      style={{ top }}
    >
      {children}
    </div>
  );
}
