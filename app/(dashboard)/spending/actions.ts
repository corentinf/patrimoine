'use server';

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase';

export async function createCategory(data: { name: string; icon: string; color: string }) {
  const supabase = createServiceClient();
  const { error } = await supabase.from('categories').insert({
    name: data.name.trim(),
    icon: data.icon.trim(),
    color: data.color,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/spending');
}

export async function updateCategory(
  id: string,
  data: { name: string; icon: string; color: string },
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('categories')
    .update({ name: data.name.trim(), icon: data.icon.trim(), color: data.color })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/spending');
}

export async function updateTransactionPayee(id: string, payee: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('transactions')
    .update({ payee: payee.trim() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/spending');
}

export async function assignTransactionCategory(
  transactionId: string,
  categoryId: string,
) {
  const supabase = createServiceClient();

  // Look up the transaction's payee/description so we can bulk-update all
  // transactions from the same seller in one shot.
  const { data: tx, error: lookupError } = await supabase
    .from('transactions')
    .select('payee, description')
    .eq('id', transactionId)
    .single();

  if (lookupError) throw new Error(lookupError.message);

  // Match on payee when present, fall back to description.
  const query = supabase.from('transactions').update({ category_id: categoryId });
  const { error } = tx.payee
    ? await query.eq('payee', tx.payee)
    : await query.eq('description', tx.description);

  if (error) throw new Error(error.message);
  revalidatePath('/spending');
}
