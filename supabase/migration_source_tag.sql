-- Lightweight secondary tag for a transaction's source/provenance (e.g. "Amazon"),
-- separate from its spending category. Unlike category_id, this never
-- participates in spending totals/budgets/pie-chart math — it's purely an
-- extra badge so an Amazon-imported transaction can keep its real category
-- (Motorcycle, Groceries, etc.) while still being identifiable/filterable
-- as having come from Amazon.
alter table transactions add column if not exists source_tag text;
