-- Add custom_url to accounts so users can override the link per card
alter table accounts add column if not exists custom_url text;
