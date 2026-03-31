const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://zaobewlswaywpcegzlvo.supabase.co',
  process.env.SB_KEY
);
s.from('transactions')
  .select('payee, description, amount')
  .order('posted_at', { ascending: false })
  .limit(100)
  .then(({ data }) => {
    const payees = {};
    data.forEach(t => {
      const key = (t.payee || t.description || 'unknown').substring(0, 40);
      if (!payees[key]) payees[key] = { count: 0, total: 0 };
      payees[key].count++;
      payees[key].total += Math.abs(Number(t.amount));
    });
    Object.entries(payees)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([k, v]) => {
        console.log(v.count + 'x  $' + v.total.toFixed(0) + '  ' + k);
      });
  });
