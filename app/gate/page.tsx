'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GatePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch('/api/gate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.replace('/accounts');
    } else {
      setError('Incorrect password');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-ink-800 tracking-tight">
            Patrimoine
          </h1>
          <p className="text-sm text-ink-400 mt-1">personal finance</p>
        </div>

        <form onSubmit={handleSubmit} className="card px-8 py-8 space-y-5">
          <div>
            <h2 className="font-semibold text-ink-800 text-lg">Enter passcode</h2>
            <p className="text-sm text-ink-400 mt-0.5">
              required to access your dashboard
            </p>
          </div>

          {error && (
            <p className="text-sm text-accent-red bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 border border-sand-300 rounded-xl text-sm text-ink-700 focus:outline-none focus:border-ink-400"
            placeholder="••••"
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full px-4 py-2.5 bg-ink-800 text-white rounded-xl text-sm font-medium hover:bg-ink-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
