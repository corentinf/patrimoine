'use client';

import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navItems } from './Sidebar';

const EDGE_GUARD = 24; // px reserved along the left edge for the browser's back-swipe gesture
const MIN_DISTANCE = 60; // px of horizontal travel required to count as a swipe
const MAX_VERTICAL_RATIO = 0.5; // vertical drift allowed, as a fraction of horizontal distance

// Elements with their own horizontal scroll (tab strips, tables) should keep
// their native drag-to-scroll behavior instead of triggering a tab switch.
function hasHorizontalScrollAncestor(node: EventTarget | null): boolean {
  let el = node as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflowX = window.getComputedStyle(el).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

export default function SwipeNavigator({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const skip = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    if (window.innerWidth >= 768) { start.current = null; return; }
    const t = e.touches[0];
    if (t.clientX < EDGE_GUARD) { start.current = null; return; }
    skip.current = hasHorizontalScrollAncestor(e.target);
    start.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const origin = start.current;
    start.current = null;
    if (!origin || skip.current) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;
    if (Math.abs(dx) < MIN_DISTANCE) return;
    if (Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_RATIO) return;

    const currentIndex = navItems.findIndex((item) => pathname.startsWith(item.href));
    if (currentIndex === -1) return;
    const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= navItems.length) return;
    router.push(navItems[nextIndex].href);
  }

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => { start.current = null; }}
    >
      {children}
    </div>
  );
}
