'use client';

import { useState } from 'react';

const ACCOUNT_TYPES = [
  { value: 'checking',   label: 'Checking' },
  { value: 'savings',    label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'credit',     label: 'Credit card' },
];

export default function AddManualAccount() {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    institution: '',
    account_type: 'investment',
    balance: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const balance = form.account_type === 'credit'
      ? -Math.abs(parseFloat(form.balance))
      : parseFloat(form.balance);

    const res = await fetch('/api/accounts/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, balance }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error || 'Failed'); return; }

    setForm({ name: '', institution: '', account_type: 'investment', balance: '' });
    setExpanded(false);
    window.location.reload();
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-ink-400 hover:text-ink-600 transition-colors flex items-center gap-1.5"
      >
        <span className="text-base leading-none">+</span> Add manual account
      </button>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-ink-700">Add manual account</p>
        <button
          onClick={() => { setExpanded(false); setError(''); }}
          className="text-xs text-ink-400 hover:text-ink-600"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-400 block mb-1">Account name</label>
            <input
              type="text"
              required
              placeholder="Brokerage Account"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
            />
          </div>
          <div>
            <label className="text-xs text-ink-400 block mb-1">Institution</label>
            <input
              type="text"
              required
              placeholder="Fidelity"
              value={form.institution}
              onChange={(e) => set('institution', e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-ink-400 block mb-1">Type</label>
            <select
              value={form.account_type}
              onChange={(e) => set('account_type', e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 bg-white"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-ink-400 block mb-1">
              Balance {form.account_type === 'credit' ? '(amount owed)' : ''}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={form.balance}
                onChange={(e) => set('balance', e.target.value)}
                className="w-full text-sm pl-7 pr-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="btn-secondary text-xs w-full justify-center disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add account'}
        </button>
      </form>
    </div>
  );
}
