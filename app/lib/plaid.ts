import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';

const env = (process.env.PLAID_ENV ?? 'development') as keyof typeof PlaidEnvironments;

const configuration = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
      'PLAID-SECRET': process.env.PLAID_SECRET!,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

export const PLAID_PRODUCTS: Products[] = [Products.Transactions, Products.Investments];
export const PLAID_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];

export function mapAccountType(type: string, subtype: string | null | undefined): string {
  if (type === 'investment') return 'investment';
  if (type === 'credit') return 'credit';
  if (subtype === 'savings') return 'savings';
  return 'checking';
}
