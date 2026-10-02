'use client';

import { useState } from 'react';
import { formatCurrency } from '@/app/lib/utils';

interface Props {
  currentSpending: number;
  prevSpending: number;
  monthlyIncome: number;
  periodDays: number;
  /** 'onGradient' = white text for use on the green SummaryCard. */
  tone?: 'default' | 'onGradient';
}

function savingsRate(spending: number, income: number): number | null {
  if (income <= 0) return null;
  return ((income - spending) / income) * 100;
}

export default function SavingsRateModule({ currentSpending, prevSpending, monthlyIncome, periodDays, tone = 'default' }: Props) {
  const onGradient = tone === 'onGradient';
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

  const rateColor = onGradient ? 'text-white'
    : currentRate === null ? 'text-ink-300'
    : currentRate >= 20 ? 'text-accent-green'
    : currentRate >= 0 ? 'text-ink-700'
    : 'text-accent-red';

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={onGradient ? 'text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/80' : 'stat-label'}>Savings rate</span>
        <span className={`stat-value text-xl ${rateColor}`}>
          {currentRate === null ? '—' : `${currentRate.toFixed(1)}%`}
        </span>
        {delta !== null && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${
            onGradient ? 'text-white/90' : delta > 0 ? 'text-accent-green' : delta < 0 ? 'text-accent-red' : 'text-ink-300'
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

      {editing ? (
        <div className="flex items-center gap-2 mt-1">
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
          <span className={`text-xs ${onGradient ? 'text-white/75' : 'text-ink-400'}`}>/mo</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-2.5 py-1 rounded-lg bg-ink-800 text-white hover:bg-ink-700 transition-colors disabled:opacity-40"
          >
            {saving ? '…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className={`text-xs ${onGradient ? 'text-white/75 hover:text-white' : 'text-ink-300 hover:text-ink-500'}`}>
            Cancel
          </button>
        </div>
      ) : (
        <p className={`text-xs mt-1 ${onGradient ? 'text-white/75' : 'text-ink-400'}`}>
          {income > 0 ? (
            <>
              <span data-sensitive>{formatCurrency(income)}</span>/mo income ·{' '}
              {currentRate !== null && currentSpending > 0 && (
                <><span data-sensitive>{formatCurrency(Math.max(0, periodIncome - currentSpending))}</span> saved · </>
              )}
            </>
          ) : (
            'Set your monthly income to calculate · '
          )}
          <button
            onClick={() => { setDraft(income > 0 ? String(income) : ''); setEditing(true); }}
            className={`underline underline-offset-2 transition-colors ${onGradient ? 'text-white hover:text-white/80' : 'text-ink-500 hover:text-ink-700'}`}
          >
            {income > 0 ? 'Edit' : 'Set income'}
          </button>
        </p>
      )}
    </div>
  );
}
