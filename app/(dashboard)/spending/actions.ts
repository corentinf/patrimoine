'use server';

import { revalidatePath } from 'next/cache';
import { createServerComponentClient } from '@/app/lib/supabase-server';

async function getSupabaseAndUser() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, user };
}

// Categories and transactions are shared between Spending and Income, so any
// edit needs to invalidate both pages' cached data.
function revalidateTransactionPages() {
  revalidatePath('/spending');
  revalidatePath('/income');
}

export async function createCategory(data: { name: string; icon: string; color: string; parent_id?: string | null }) {
  const { supabase, user } = await getSupabaseAndUser();
  const { error } = await supabase.from('categories').insert({
    name: data.name.trim(),
    icon: data.icon.trim(),
    color: data.color,
    user_id: user.id,
    ...(data.parent_id ? { parent_id: data.parent_id } : {}),
  });
  if (error) throw new Error(error.message);
  revalidateTransactionPages();
}

export async function updateCategory(
  id: string,
  data: { name: string; icon: string; color: string },
) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('categories')
    .update({ name: data.name.trim(), icon: data.icon.trim(), color: data.color })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidateTransactionPages();
}

export async function updateTransactionPayee(id: string, payee: string) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('transactions')
    .update({ payee: payee.trim() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidateTransactionPages();
}

export async function toggleTransfer(id: string, value: boolean) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('transactions')
    .update({ is_transfer: value })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidateTransactionPages();
}

export async function markReimbursable(ids: string[], value: boolean) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('transactions')
    .update({ is_reimbursable: value })
    .in('id', ids);
  if (error) throw new Error(error.message);
  revalidateTransactionPages();
}

// Confirms a Venmo/personal payment against the running "awaiting
// reimbursement" total: marks every unsettled shared-card transaction (across
// all is_shared accounts, e.g. the Amex Blue Cash Preferred) as paid back.
export async function settleSharedSplits() {
  const { supabase } = await getSupabaseAndUser();
  const { data: sharedAccounts, error: acctError } = await supabase
    .from('accounts')
    .select('id')
    .eq('is_shared', true);
  if (acctError) throw new Error(acctError.message);

  const accountIds = (sharedAccounts ?? []).map((a) => a.id);
  if (accountIds.length) {
    const { error } = await supabase
      .from('transactions')
      .update({ split_settled_at: new Date().toISOString() })
      .in('account_id', accountIds)
      .is('split_settled_at', null);
    if (error) throw new Error(error.message);
  }
  revalidateTransactionPages();
}

// Dismisses a false-positive match suggestion so it stops being offered.
export async function dismissSplitMatch(transactionId: string) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('transactions')
    .update({ split_match_dismissed: true })
    .eq('id', transactionId);
  if (error) throw new Error(error.message);
  revalidateTransactionPages();
}

export async function assignTransactionCategory(
  transactionId: string,
  categoryId: string,
) {
  const { supabase, user } = await getSupabaseAndUser();

  // Look up this transaction's payee/description to bulk-update matching rows
  const { data: tx, error: lookupError } = await supabase
    .from('transactions')
    .select('payee, description')
    .eq('id', transactionId)
    .single();

  if (lookupError) throw new Error(lookupError.message);

  const query = supabase.from('transactions').update({ category_id: categoryId });
  const { error } = tx.payee
    ? await query.eq('payee', tx.payee)
    : await query.eq('description', tx.description);

  if (error) throw new Error(error.message);

  // Persist a rule so future transactions from this merchant (Plaid syncs,
  // the categorizeAll rule/LLM pass) get the same category automatically.
  const matchField = tx.payee ? 'payee' : 'description';
  const matchPattern = (tx.payee || tx.description || '').trim();

  if (matchPattern) {
    const { data: existingRules } = await supabase
      .from('category_rules')
      .select('id')
      .eq('user_id', user.id)
      .eq('match_field', matchField)
      .ilike('match_pattern', matchPattern);

    if (existingRules?.length) {
      await supabase
        .from('category_rules')
        .update({ category_id: categoryId, priority: 50 })
        .in('id', existingRules.map((r) => r.id));
    } else {
      await supabase.from('category_rules').insert({
        user_id: user.id,
        category_id: categoryId,
        match_field: matchField,
        match_pattern: matchPattern,
        priority: 50,
      });
    }
  }

  revalidateTransactionPages();
}
