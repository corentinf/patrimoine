'use client';

import { useCallback, useEffect, useState } from 'react';
import { readDeepLink, type DeepLink } from './deepLinkUrl';

// Hooks that apply a deep link from the Home headline. The target travels in the URL
// (`/spending?day=2026-09-30&tx=abc`), the destination page applies it (set the date range, pin
// the day on the chart, pick the category) and then removes the params so a refresh doesn't
// re-apply it. In the URL because the app clears drill-down state (pinned day, category chip)
// on navigation, so state set before navigating is lost.

export { deepLinkHref, readDeepLink, monthAround, type DeepLink } from './deepLinkUrl';

/**
 * Reads deep-link params once when the page mounts. Delivered on a later tick on purpose:
 * the global filter clears drill-down state in an effect on route change, and that effect
 * runs after a child's mount effect — handing the link over a tick later guarantees what the
 * page applies isn't immediately wiped.
 */
export function useDeepLink() {
  const [link, setLink] = useState<DeepLink | null>(null);

  useEffect(() => {
    const parsed = readDeepLink(window.location.search);
    if (!parsed) return;
    const t = window.setTimeout(() => setLink(parsed), 0);
    return () => window.clearTimeout(t);
  }, []);

  // A link to the page you're already on (query-only) doesn't remount it, so components can hand
  // the target over directly: window.dispatchEvent(new CustomEvent('patrimoine:deeplink', { detail })).
  useEffect(() => {
    const onEvent = (e: Event) => setLink({ ...((e as CustomEvent<DeepLink>).detail ?? {}) });
    window.addEventListener('patrimoine:deeplink', onEvent);
    return () => window.removeEventListener('patrimoine:deeplink', onEvent);
  }, []);

  /** Mark the link as handled and drop the params from the address bar. */
  const consume = useCallback(() => {
    setLink(null);
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  return { link, consume };
}

/**
 * Scrolls to the element with `[attr="value"]` once it exists (the list may still be
 * filtering/rendering) and flashes it. Gives up after ~3s.
 */
export function useFlashTarget(attr: 'data-tx-id' | 'data-symbol', value: string | null, onDone: () => void) {
  useEffect(() => {
    if (!value) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[${attr}="${value.replace(/"/g, '\\"')}"]`);
      if (el) {
        window.clearInterval(id);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('deeplink-flash');
        // restart the animation if it was already applied
        void el.offsetWidth;
        el.classList.add('deeplink-flash');
        window.setTimeout(() => el.classList.remove('deeplink-flash'), 2200);
        onDone();
      } else if (++tries > 20) {
        window.clearInterval(id);
        onDone();
      }
    }, 150);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attr, value]);
}
