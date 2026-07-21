'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Split into two contexts so a page registering content (which only needs the
// stable setter) never re-renders when the content itself changes — only the
// header (which reads the content) does. A single combined context would create
// a feedback loop: setting new content re-renders the provider, which re-renders
// every consumer of the combined value — including the page that just set it,
// producing a fresh JSX reference, re-triggering the effect that sets it, forever.
const NodeContext = createContext<ReactNode>(null);
const SetNodeContext = createContext<((node: ReactNode) => void) | null>(null);

export function PageFilterSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return (
    <SetNodeContext.Provider value={setNode}>
      <NodeContext.Provider value={node}>
        {children}
      </NodeContext.Provider>
    </SetNodeContext.Provider>
  );
}

// For the header: reads whatever the active page has registered.
export function usePageFilterSlotContent() {
  return useContext(NodeContext);
}

// For a page: registers content to render in the header's filter slot.
// Automatically clears on unmount (e.g. navigating to another page).
export function useSetPageFilterSlot(node: ReactNode) {
  const setNode = useContext(SetNodeContext);
  if (!setNode) throw new Error('useSetPageFilterSlot must be used within a PageFilterSlotProvider');

  // Sync on every render (node is a fresh JSX reference each time, so no dep array).
  useEffect(() => {
    setNode(node);
  });

  // Clear only on true unmount (e.g. navigating away from the page).
  useEffect(() => {
    return () => setNode(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
