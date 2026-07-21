'use client';

import IncomeView from './IncomeView';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  account_id: string;
  is_transfer: boolean;
  is_reimbursable: boolean;
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
  return (
    <div className="space-y-5">
      <IncomeView transactions={transactions} categories={categories} dailyIncome={dailyIncome} />
    </div>
  );
}
