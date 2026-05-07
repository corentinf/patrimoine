'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface PrivacyContextValue {
  blurred: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({ blurred: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [blurred, setBlurred] = useState(false);

  useEffect(() => {
    setBlurred(localStorage.getItem('privacy-mode') === '1');
  }, []);

  const toggle = () => {
    setBlurred((v) => {
      const next = !v;
      localStorage.setItem('privacy-mode', next ? '1' : '0');
      return next;
    });
  };

  return (
    <PrivacyContext.Provider value={{ blurred, toggle }}>
      <div className={blurred ? 'privacy-mode' : ''}>
        {children}
      </div>
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
