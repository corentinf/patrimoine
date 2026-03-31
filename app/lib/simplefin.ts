// SimpleFIN Bridge API client
// Docs: https://www.simplefin.org/protocol.html

export interface SimpleFINAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'available-balance': string;
  'balance-date': number;
  transactions: SimpleFINTransaction[];
  holdings?: SimpleFINHolding[];
  org: {
    domain: string;
    name: string;
    'sfin-url': string;
    url: string;
    id: string;
  };
}

export interface SimpleFINTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  payee: string;
  memo: string;
  transacted_at: number;
}

export interface SimpleFINHolding {
  id: string;
  created: number;
  currency: string;
  cost_basis: string;
  description: string;
  market_value: string;
  purchase_price: string;
  shares: string;
  symbol: string;
}

export interface SimpleFINResponse {
  errors: string[];
  accounts: SimpleFINAccount[];
}

/**
 * Claim an access URL from a setup token.
 * This should only be called ONCE — the setup token is single-use.
 * Store the returned access URL securely in your env vars.
 */
export async function claimAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = Buffer.from(setupToken, 'base64').toString('utf-8');
  const response = await fetch(claimUrl, { method: 'POST' });
  
  if (!response.ok) {
    throw new Error(`Failed to claim access URL: ${response.status}`);
  }
  
  return response.text();
}

/**
 * Fetch all accounts and transactions from SimpleFIN.
 * Uses the access URL stored in SIMPLEFIN_ACCESS_URL env var.
 * 
 * @param startDate - optional start date for transactions (unix timestamp)
 */
export async function fetchAccounts(startDate?: number): Promise<SimpleFINResponse> {
  const accessUrl = process.env.SIMPLEFIN_ACCESS_URL;
  
  if (!accessUrl) {
    throw new Error('SIMPLEFIN_ACCESS_URL is not configured');
  }
  
  // Parse the access URL to extract credentials
  const parsed = new URL(accessUrl + '/accounts');
  const auth = Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64');
  parsed.username = '';
  parsed.password = '';
  
  // Add query params
  if (startDate) {
    parsed.searchParams.set('start-date', startDate.toString());
  }
  
  const response = await fetch(parsed.toString(), {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`SimpleFIN API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Infer account type from SimpleFIN data.
 */
export function inferAccountType(account: SimpleFINAccount): string {
  const name = account.name.toLowerCase();
  const domain = account.org.domain.toLowerCase();
  
  // Investment accounts
  if (
    domain.includes('vanguard') ||
    domain.includes('fidelity') ||
    name.includes('brokerage') ||
    name.includes('401k') ||
    name.includes('ira') ||
    name.includes('investment') ||
    (account.holdings && account.holdings.length > 0)
  ) {
    return 'investment';
  }
  
  // Credit cards
  if (
    domain.includes('americanexpress') ||
    name.includes('credit') ||
    name.includes('sapphire') ||
    name.includes('platinum') ||
    name.includes('gold card') ||
    name.includes('cash preferred') ||
    name.includes('prime') ||
    parseFloat(account.balance) < 0  // credit cards typically show negative
  ) {
    return 'credit';
  }
  
  // Savings
  if (name.includes('saving')) {
    return 'savings';
  }
  
  return 'checking';
}

/**
 * Determine the institution name from SimpleFIN org data.
 */
export function getInstitutionName(account: SimpleFINAccount): string {
  const domain = account.org.domain.toLowerCase();
  
  const institutionMap: Record<string, string> = {
    'chase.com': 'Chase',
    'vanguard.com': 'Vanguard',
    'fidelity.com': 'Fidelity',
    'americanexpress.com': 'American Express',
  };
  
  for (const [key, name] of Object.entries(institutionMap)) {
    if (domain.includes(key)) return name;
  }
  
  // Fallback to the org name from SimpleFIN
  return account.org.name;
}
