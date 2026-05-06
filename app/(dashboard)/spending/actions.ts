'use server';

import { revalidatePath } from 'next/cache';
import { createServerComponentClient } from '@/app/lib/supabase-server';

async function getSupabaseAndUser() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, user };
}

export async function createCategory(data: { name: string; icon: string; color: string }) {
  const { supabase, user } = await getSupabaseAndUser();
  const { error } = await supabase.from('categories').insert({
    name: data.name.trim(),
    icon: data.icon.trim(),
    color: data.color,
    user_id: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/spending');
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
  revalidatePath('/spending');
}

export async function updateTransactionPayee(id: string, payee: string) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('transactions')
    .update({ payee: payee.trim() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/spending');
}

export async function toggleTransfer(id: string, value: boolean) {
  const { supabase } = await getSupabaseAndUser();
  const { error } = await supabase
    .from('transactions')
    .update({ is_transfer: value })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/spending');
}

export async function assignTransactionCategory(
  transactionId: string,
  categoryId: string,
) {
  const { supabase } = await getSupabaseAndUser();

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
  revalidatePath('/spending');
}
