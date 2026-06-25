'use client';

import { useState } from 'react';
import IncomeView from './IncomeView';
import { DateNav, type DateFilter } from '../spending/SpendingView';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  posted_at: string;
  account_id: string;
  is_transfer: boolean;
  account: { id: string; name: string; institution: string } | null;
  category: { id: string; name: string; color: string; icon: string; is_income: boolean } | null;
}

interface IncomeCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_income: boolean;
  parent_id: string | null;
}

export default function IncomePageClient({
  transactions,
  categories,
  dailyIncome = [],
}: {
  transactions: RawTransaction[];
  categories: IncomeCategory[];
  dailyIncome?: { date: string; amount: number }[];
}) {
  const now = new Date();
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-400">Where your money comes from</p>
        <DateNav filter={dateFilter} onChange={setDateFilter} />
      </div>
      <IncomeView transactions={transactions} categories={categories} dateFilter={dateFilter} onDateFilterChange={setDateFilter} dailyIncome={dailyIncome} />
    </div>
  );
}
