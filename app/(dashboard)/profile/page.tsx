import { createServiceClient } from '@/app/lib/supabase';
import ProfileClient from './ProfileClient';

export const revalidate = 300;

async function getAccounts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('accounts')
    .select('id, name, institution, account_type, balance')
    .eq('is_hidden', false)
    .order('account_type')
    .order('institution');
  return data ?? [];
}

export default async function ProfilePage() {
  const accounts = await getAccounts();
  const netWorth = accounts.reduce(
    (s, a) => s + (a.account_type === 'credit' ? -Math.abs(Number(a.balance)) : Number(a.balance)),
    0,
  );
  return <ProfileClient accounts={accounts as any} netWorth={netWorth} />;
}
