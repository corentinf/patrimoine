'use client';

import { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

export default function PlaidLinkButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution: metadata.institution,
        }),
      });
      // Trigger a sync immediately so new accounts appear
      await fetch('/api/plaid/sync', { method: 'POST' });
      window.location.reload();
    },
  });

  useEffect(() => {
    if (ready && linkToken) open();
  }, [ready, linkToken, open]);

  const handleClick = async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' });
      const { link_token, error } = await res.json();
      if (error) throw new Error(error);
      setLinkToken(link_token);
    } catch (err) {
      console.error('Failed to create link token:', err);
    } finally {
      setFetching(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={fetching}
      className="w-full btn-secondary text-xs justify-center"
    >
      {fetching ? 'Loading…' : '+ Connect bank'}
    </button>
  );
}
