import { createServiceClient } from './supabase';
import { llmCategorize } from './categorize';

export interface CategorizeResult {
  total: number;          // total uncategorized found
  ruleMatched: number;    // categorized by rules
  llmCategorized: number; // categorized by Claude
  newCategories: string[]; // new category names Claude invented
  errors: string[];
  noApiKey: boolean;
}

export async function categorizeAll(userId: string): Promise<CategorizeResult> {
  const supabase = createServiceClient();
  const result: CategorizeResult = {
    total: 0,
    ruleMatched: 0,
    llmCategorized: 0,
    newCategories: [],
    errors: [],
    noApiKey: !process.env.ANTHROPIC_API_KEY,
  };

  try {
    const { data: rules } = await supabase
      .from('category_rules')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: false });

    const { data: uncatCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'Uncategorized')
      .single();

    const { data: nullCat } = await supabase
      .from('transactions')
      .select('id, payee, description, memo, amount')
      .eq('user_id', userId)
      .is('category_id', null);

    let uncategorized = nullCat ?? [];

    if (uncatCategory?.id) {
      const { data: explicitUncat } = await supabase
        .from('transactions')
        .select('id, payee, description, memo, amount')
        .eq('user_id', userId)
        .eq('category_id', uncatCategory.id);
      uncategorized = [...uncategorized, ...(explicitUncat ?? [])];
    }

    result.total = uncategorized.length;
    if (!uncategorized.length) return result;

    // Rule-based pass
    const stillUncategorized = new Set(uncategorized.map((tx) => tx.id));
    if (rules?.length) {
      for (const tx of uncategorized) {
        for (const rule of rules) {
          const field = tx[rule.match_field as keyof typeof tx] as string;
          if (field && field.toLowerCase().includes(rule.match_pattern.toLowerCase())) {
            const { error } = await supabase
              .from('transactions')
              .update({ category_id: rule.category_id })
              .eq('id', tx.id)
              .eq('user_id', userId);
            if (!error) {
              stillUncategorized.delete(tx.id);
              result.ruleMatched++;
            }
            break;
          }
        }
      }
    }

    // LLM pass
    const remaining = uncategorized.filter((tx) => stillUncategorized.has(tx.id));
    if (!remaining.length) return result;

    if (!process.env.ANTHROPIC_API_KEY) return result;

    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('user_id', userId);

    if (!categories?.length) return result;

    const nameToId = new Map(categories.map((c) => [c.name, c.id]));
    const categoryNames = categories.map((c) => c.name).filter((n) => n !== 'Uncategorized');

    const llmResults = await llmCategorize(
      remaining.map((tx) => ({
        id: tx.id,
        payee: tx.payee,
        description: tx.description,
        amount: Number(tx.amount),
      })),
      categoryNames,
    );

    // Create new categories Claude invented
    const newCategoryNames = new Set<string>();
    llmResults.forEach((categoryName) => {
      if (!nameToId.has(categoryName)) newCategoryNames.add(categoryName);
    });

    if (newCategoryNames.size > 0) {
      const toInsert = Array.from(newCategoryNames).map((name) => ({
        user_id: userId,
        name,
        color: '#6B7280',
        is_income: false,
        sort_order: 99,
      }));
      const { data: created, error: createError } = await supabase
        .from('categories')
        .insert(toInsert)
        .select('id, name');
      if (createError) {
        result.errors.push(`Failed to create categories: ${createError.message}`);
      } else {
        for (const c of created ?? []) {
          nameToId.set(c.name, c.id);
          result.newCategories.push(c.name);
        }
      }
    }

    // Batch update transactions
    const byCategory = new Map<string, string[]>();
    llmResults.forEach((categoryName, txId) => {
      const catId = nameToId.get(categoryName);
      if (!catId) return;
      if (!byCategory.has(catId)) byCategory.set(catId, []);
      byCategory.get(catId)!.push(txId);
    });

    const catIds = Array.from(byCategory.keys());
    await Promise.all(
      catIds.map((catId) =>
        supabase
          .from('transactions')
          .update({ category_id: catId })
          .in('id', byCategory.get(catId)!)
          .eq('user_id', userId),
      ),
    );

    result.llmCategorized = llmResults.size;
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}
