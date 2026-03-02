-- Subscription/profile compatibility patch (idempotent)
-- Apply in Supabase SQL editor or via CLI migration.

begin;

alter table public.profiles add column if not exists subscription_type text default 'free';
alter table public.profiles add column if not exists ads_removed boolean default false;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists rc_customer_id text;
alter table public.profiles add column if not exists account_link_required_until timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz default now();

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  app_user_id text,
  product_id text,
  entitlement_ids text[],
  event_type text not null,
  event_timestamp timestamptz,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists subscription_events_user_idx
  on public.subscription_events (app_user_id);

commit;
