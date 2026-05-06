import Anthropic from '@anthropic-ai/sdk';

interface TxRow {
  id: string;
  payee: string | null;
  description: string | null;
  amount: number;
}

const MODEL = 'claude-haiku-4-5';
const BATCH_SIZE = 75;

export async function llmCategorize(
  transactions: TxRow[],
  categoryNames: string[],
): Promise<Map<string, string>> {
  if (!transactions.length || !categoryNames.length) return new Map();
  if (!process.env.ANTHROPIC_API_KEY) return new Map();

  const client = new Anthropic();
  const results = new Map<string, string>();

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const lines = batch
      .map((tx) => {
        const label = tx.payee || tx.description || 'Unknown';
        return `${tx.id}\t${label}\t${Math.abs(tx.amount).toFixed(2)}`;
      })
      .join('\n');

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [
          {
            type: 'text' as const,
            text: `You are a financial transaction categorizer.
Existing categories: ${categoryNames.join(', ')}

Return ONLY a JSON array: [{"id":"...","category":"..."}]

Rules:
- Use an exact existing category name whenever it fits.
- If no existing category fits, invent a concise new category name (2-3 words, title case, e.g. "Pet Care", "Tax & Legal").
- Never use "Uncategorized" — always pick or create a meaningful category.`,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user', content: `Categorize (id\tpayee\tamount):\n${lines}` }],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) continue;
      const parsed: Array<{ id: string; category: string }> = JSON.parse(match[0]);
      for (const item of parsed) {
        if (item.id && item.category) results.set(item.id, item.category);
      }
    } catch {
      // skip batch on error
    }
  }

  return results;
}
