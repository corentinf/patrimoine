'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { setFakeModeActive } from './demoMode';

export type PrivacyMode = 'off' | 'blur' | 'fake';

interface PrivacyContextValue {
  blurred: boolean;
  fake: boolean;
  mode: PrivacyMode;
  toggle: () => void;
  toggleFake: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  blurred: false,
  fake: false,
  mode: 'off',
  toggle: () => {},
  toggleFake: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<PrivacyMode>('off');

  useEffect(() => {
    const stored = localStorage.getItem('privacy-mode');
    // '1' is the old boolean-only format from before "fake" existed.
    let resolved: PrivacyMode = 'off';
    if (stored === 'fake') resolved = 'fake';
    else if (stored === 'blur' || stored === '1') resolved = 'blur';
    // Set the flag synchronously before setMode below schedules a re-render,
    // so every formatCurrency() call in that render already sees the right
    // value instead of lagging a render behind.
    setFakeModeActive(resolved === 'fake');
    setMode(resolved);
  }, []);

  // Blur and fake numbers don't make sense together — turning one on turns
  // the other off, so this is one three-way switch rather than two independent ones.
  const toggle = () => {
    setMode((v) => {
      const next = v === 'blur' ? 'off' : 'blur';
      localStorage.setItem('privacy-mode', next);
      setFakeModeActive(false);
      return next;
    });
  };

  const toggleFake = () => {
    setMode((v) => {
      const next = v === 'fake' ? 'off' : 'fake';
      localStorage.setItem('privacy-mode', next);
      setFakeModeActive(next === 'fake');
      return next;
    });
  };

  return (
    <PrivacyContext.Provider value={{ blurred: mode === 'blur', fake: mode === 'fake', mode, toggle, toggleFake }}>
      <div className={mode === 'blur' ? 'privacy-mode' : ''}>
        {children}
      </div>
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
