// Plain module (no 'use client', no React) so both the privacy context and
// the currency formatters in utils.ts — which run from plenty of places that
// aren't necessarily under a component using the hook — can check this flag
// without pulling client-only hooks into files that might get imported
// server-side.
//
// Stored on `window` rather than a module-level variable: Next.js/webpack can
// give the same source file separate module instances across different
// bundle chunks, so a plain `let` set from one chunk (e.g. the Profile page
// toggling it) silently wouldn't be visible from another (e.g. Header.tsx's
// nav totals) — `window` is a single, real global regardless of chunking.
//
// Only ever set from a useEffect (see privacy.tsx), never during render —
// that's what keeps the client's first render match the server's (both see
// `undefined`/off), so toggling doesn't trigger a hydration mismatch; it just
// flips to "fake" in a normal post-mount re-render.
declare global {
  interface Window {
    __patrimoineFakeMode?: boolean;
  }
}

export function setFakeModeActive(value: boolean) {
  if (typeof window !== 'undefined') window.__patrimoineFakeMode = value;
}

export function isFakeModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__patrimoineFakeMode === true;
}
