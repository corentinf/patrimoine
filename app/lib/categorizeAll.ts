import { createServiceClient } from './supabase';
import { llmCategorize } from './categorize';

export interface CategorizeResult {
  total: number;
  ruleMatched: number;
  llmCategorized: number;
  newCategories: string[];
  errors: string[];
  noApiKey: boolean;
  debug: string[];
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
    debug: [],
  };

  const log = (msg: string) => result.debug.push(msg);

  try {
    log(`userId=${userId}`);
    log(`ANTHROPIC_API_KEY present=${!!process.env.ANTHROPIC_API_KEY}`);

    const { data: rules, error: rulesErr } = await supabase
      .from('category_rules')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: false });

    if (rulesErr) log(`rules error: ${rulesErr.message}`);
    log(`rules loaded=${rules?.length ?? 0}`);

    const { data: uncatCategory, error: uncatErr } = await supabase
      .from('categories')
      .select('id')
      .eq('name', 'Uncategorized')
      .single();

    if (uncatErr) log(`uncatCategory error: ${uncatErr.message}`);
    log(`uncatCategory id=${uncatCategory?.id ?? 'none'}`);

    const { data: nullCat, error: nullErr } = await supabase
      .from('transactions')
      .select('id, payee, description, memo, amount')
      .eq('user_id', userId)
      .is('category_id', null);

    if (nullErr) log(`nullCat error: ${nullErr.message}`);
    log(`null-category transactions=${nullCat?.length ?? 0}`);

    let uncategorized = nullCat ?? [];

    if (uncatCategory?.id) {
      const { data: explicitUncat, error: explicitErr } = await supabase
        .from('transactions')
        .select('id, payee, description, memo, amount')
        .eq('user_id', userId)
        .eq('category_id', uncatCategory.id);

      if (explicitErr) log(`explicitUncat error: ${explicitErr.message}`);
      log(`explicit-Uncategorized transactions=${explicitUncat?.length ?? 0}`);
      uncategorized = [...uncategorized, ...(explicitUncat ?? [])];
    }

    result.total = uncategorized.length;
    log(`total uncategorized=${result.total}`);
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
    log(`rule matched=${result.ruleMatched}, remaining=${stillUncategorized.size}`);

    // LLM pass
    const remaining = uncategorized.filter((tx) => stillUncategorized.has(tx.id));
    if (!remaining.length) return result;

    if (!process.env.ANTHROPIC_API_KEY) {
      log('skipping LLM: no API key');
      return result;
    }

    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .select('id, name');

    if (catErr) log(`categories error: ${catErr.message}`);
    log(`categories loaded=${categories?.length ?? 0}: ${categories?.map((c) => c.name).join(', ')}`);

    if (!categories?.length) return result;

    const nameToId = new Map(categories.map((c) => [c.name, c.id]));
    const categoryNames = categories.map((c) => c.name).filter((n) => n !== 'Uncategorized');

    log(`sending ${remaining.length} transactions to LLM with ${categoryNames.length} category options`);

    let llmResults: Map<string, string>;
    try {
      llmResults = await llmCategorize(
        remaining.map((tx) => ({
          id: tx.id,
          payee: tx.payee,
          description: tx.description,
          amount: Number(tx.amount),
        })),
        categoryNames,
      );
      log(`LLM returned ${llmResults.size} results`);
      llmResults.forEach((cat, txId) => log(`  tx=${txId.slice(0, 8)} → "${cat}"`));
    } catch (llmErr: any) {
      log(`LLM error: ${llmErr.message}`);
      result.errors.push(`LLM error: ${llmErr.message}`);
      return result;
    }

    // Create new categories Claude invented
    const newCategoryNames = new Set<string>();
    llmResults.forEach((categoryName) => {
      if (!nameToId.has(categoryName)) newCategoryNames.add(categoryName);
    });

    if (newCategoryNames.size > 0) {
      log(`creating ${newCategoryNames.size} new categories: ${Array.from(newCategoryNames).join(', ')}`);
      const toInsert = Array.from(newCategoryNames).map((name) => ({
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
        log(`create categories error: ${createError.message}`);
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
      if (!catId) {
        log(`no catId for "${categoryName}" (tx=${txId.slice(0, 8)})`);
        return;
      }
      if (!byCategory.has(catId)) byCategory.set(catId, []);
      byCategory.get(catId)!.push(txId);
    });

    const catIds = Array.from(byCategory.keys());
    log(`updating transactions across ${catIds.length} categories`);
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
    log(`done — llmCategorized=${result.llmCategorized}`);
  } catch (err: any) {
    result.errors.push(err.message);
    result.debug.push(`uncaught error: ${err.message}`);
  }

  return result;
}
