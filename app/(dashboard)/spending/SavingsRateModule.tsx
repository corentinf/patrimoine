'use client';

import { useState } from 'react';
import { formatCurrency } from '@/app/lib/utils';

interface Props {
  currentSpending: number;
  prevSpending: number;
  monthlyIncome: number;
  periodDays: number; // days in current period, for pro-rating income
}

function savingsRate(spending: number, income: number): number | null {
  if (income <= 0) return null;
  return ((income - spending) / income) * 100;
}

export default function SavingsRateModule({ currentSpending, prevSpending, monthlyIncome, periodDays }: Props) {
  const [income, setIncome] = useState(monthlyIncome);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(monthlyIncome || ''));
  const [saving, setSaving] = useState(false);

  // Pro-rate income to the period length
  const periodIncome = income > 0 ? income * (periodDays / 30) : 0;
  const prevPeriodIncome = income > 0 ? income * (periodDays / 30) : 0;

  const currentRate = savingsRate(currentSpending, periodIncome);
  const prevRate = savingsRate(prevSpending, prevPeriodIncome);
  const delta = currentRate !== null && prevRate !== null ? currentRate - prevRate : null;

  const handleSave = async () => {
    const val = parseFloat(draft);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_income: val }),
      });
      setIncome(val);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const rateColor =
    currentRate === null ? 'text-ink-300'
    : currentRate >= 20 ? 'text-accent-green'
    : currentRate >= 0 ? 'text-ink-700'
    : 'text-accent-red';

  return (
    <div className="card flex flex-wrap items-center gap-x-8 gap-y-3">
      {/* Rate display */}
      <div className="flex items-baseline gap-3">
        <span className={`font-display text-3xl font-semibold tabular-nums ${rateColor}`}>
          {currentRate === null ? '—' : `${currentRate.toFixed(1)}%`}
        </span>

        {delta !== null && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${
            delta > 0 ? 'text-accent-green' : delta < 0 ? 'text-accent-red' : 'text-ink-300'
          }`}>
            {delta > 0 ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              </svg>
            ) : delta < 0 ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            ) : null}
            {Math.abs(delta).toFixed(1)}pp
          </span>
        )}
      </div>

      {/* Label + income editor */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1">Savings rate</p>

        {editing ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                autoFocus
                className="pl-6 pr-3 py-1 text-xs border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700 w-28"
              />
            </div>
            <span className="text-xs text-ink-400">/mo</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 text-white hover:bg-ink-700 transition-colors disabled:opacity-40"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-ink-300 hover:text-ink-500">
              Cancel
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-400">
            {income > 0 ? (
              <>
                {formatCurrency(income)}/mo income ·{' '}
                {currentRate !== null && currentSpending > 0 && (
                  <>{formatCurrency(Math.max(0, periodIncome - currentSpending))} saved · </>
                )}
              </>
            ) : (
              'Set your monthly income to calculate · '
            )}
            <button
              onClick={() => { setDraft(income > 0 ? String(income) : ''); setEditing(true); }}
              className="text-ink-500 hover:text-ink-700 underline underline-offset-2 transition-colors"
            >
              {income > 0 ? 'Edit' : 'Set income'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
