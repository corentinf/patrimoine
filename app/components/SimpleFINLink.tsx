'use client';

import { useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function SimpleFINLinkButton() {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError('');

    try {
      const res = await fetch('/api/simplefin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_token: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');

      setStatus('success');
      await fetch('/api/plaid/sync', { method: 'POST' });
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      setStatus('error');
      setError(err.message);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full btn-secondary text-xs justify-center"
      >
        + Connect SimpleFIN
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-600">SimpleFIN setup token</p>
        <button
          type="button"
          onClick={() => { setExpanded(false); setError(''); setToken(''); setStatus('idle'); }}
          className="text-xs text-ink-400 hover:text-ink-600"
        >
          ✕
        </button>
      </div>
      <input
        type="text"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Paste token from simplefin.org"
        className="w-full text-xs px-2.5 py-1.5 border border-sand-200 rounded-lg bg-white focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
        autoFocus
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={!token || status === 'loading' || status === 'success'}
        className="w-full btn-secondary text-xs justify-center disabled:opacity-50"
      >
        {status === 'loading' ? 'Connecting…' : status === 'success' ? '✓ Connected' : 'Connect'}
      </button>
    </form>
  );
}
