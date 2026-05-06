'use client';

import { useEffect, useState } from 'react';
import { formatCurrencyPrecise } from '@/app/lib/utils';

interface VenmoRequest {
  id: string;
  person_name: string;
  amount: number;
  status: 'pending' | 'requested' | 'settled';
}

const STATUS_LABELS: Record<VenmoRequest['status'], string> = {
  pending: 'To request',
  requested: 'Requested',
  settled: 'Settled',
};

const STATUS_COLORS: Record<VenmoRequest['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  requested: 'bg-blue-100 text-blue-700',
  settled: 'bg-green-100 text-green-700',
};

const NEXT_STATUS: Record<VenmoRequest['status'], VenmoRequest['status']> = {
  pending: 'requested',
  requested: 'settled',
  settled: 'pending',
};

interface VenmoSectionProps {
  transactionId: string;
  transactionAmount: number;
}

export default function VenmoSection({ transactionId, transactionAmount }: VenmoSectionProps) {
  const [request, setRequest] = useState<VenmoRequest | null>(null);
  const [knownNames, setKnownNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [personInput, setPersonInput] = useState('');
  const [amountInput, setAmountInput] = useState(String((Math.abs(transactionAmount) / 2).toFixed(2)));
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/venmo?transaction_id=${transactionId}`).then((r) => r.json()),
      fetch(`/api/venmo?names=1`).then((r) => r.json()),
    ]).then(([txData, namesData]) => {
      setRequest(txData.request);
      setKnownNames(namesData.names ?? []);
      setLoading(false);
    });
  }, [transactionId]);

  const filteredNames = knownNames.filter((n) =>
    n.toLowerCase().includes(personInput.toLowerCase()),
  );

  async function handleAdd() {
    if (!personInput.trim()) return;
    setSaving(true);
    const res = await fetch('/api/venmo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: transactionId,
        person_name: personInput.trim(),
        amount: parseFloat(amountInput) || Math.abs(transactionAmount),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setRequest(data.request);
      setAdding(false);
      if (!knownNames.includes(personInput.trim())) {
        setKnownNames((prev) => [...prev, personInput.trim()].sort());
      }
    }
  }

  async function handleStatusCycle() {
    if (!request) return;
    const next = NEXT_STATUS[request.status];
    setRequest((r) => r ? { ...r, status: next } : r);
    await fetch('/api/venmo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: request.id, status: next }),
    });
  }

  async function handleDelete() {
    if (!request) return;
    await fetch('/api/venmo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: request.id }),
    });
    setRequest(null);
  }

  if (loading) return null;

  return (
    <div className="px-5 py-4 border-t border-sand-100">
      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">
        Venmo Request
      </p>

      {request ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-700">{request.person_name}</p>
            <p className="text-xs text-ink-400 mt-0.5">{formatCurrencyPrecise(request.amount)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStatusCycle}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${STATUS_COLORS[request.status]}`}
            >
              {STATUS_LABELS[request.status]}
            </button>
            <button
              onClick={handleDelete}
              className="text-ink-300 hover:text-red-400 transition-colors"
              title="Remove"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : adding ? (
        <div className="space-y-2.5">
          {/* Person name */}
          <div className="relative">
            <input
              autoFocus
              type="text"
              placeholder="Person's name"
              value={personInput}
              onChange={(e) => { setPersonInput(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="w-full text-sm px-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
            />
            {showDropdown && filteredNames.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-sand-200 rounded-lg shadow-md z-10 max-h-32 overflow-y-auto">
                {filteredNames.map((name) => (
                  <button
                    key={name}
                    onMouseDown={() => { setPersonInput(name); setShowDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-ink-700 hover:bg-sand-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full text-sm pl-7 pr-3 py-1.5 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !personInput.trim()}
              className="flex-1 text-xs font-medium py-1.5 bg-ink-800 text-white rounded-lg hover:bg-ink-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-ink-400 hover:text-ink-600 px-3"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-ink-400 hover:text-ink-600 transition-colors flex items-center gap-1.5"
        >
          <span className="text-base leading-none">+</span> Request via Venmo
        </button>
      )}
    </div>
  );
}
