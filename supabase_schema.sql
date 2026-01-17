-- Radar Tinder: core schema + leaderboard points (safe to re-run)

create extension if not exists postgis;
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Radars (community + external sources)
create table if not exists public.radars (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  location geography(Point, 4326) not null,
  confidence float default 0.5,
  reported_by uuid,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  verified boolean default false,
  reports_count int default 1
);

create index if not exists radars_location_idx on public.radars using gist (location);

create or replace function public.get_nearby_radars(lat float, long float, radius_meters float)
returns table (
  id uuid,
  type text,
  latitude float,
  longitude float,
  confidence float,
  dist_meters float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    r.id,
    r.type,
    st_y(r.location::geometry) as latitude,
    st_x(r.location::geometry) as longitude,
    r.confidence,
    st_distance(r.location, st_point(long, lat)::geography) as dist_meters
  from public.radars r
  where st_dwithin(r.location, st_point(long, lat)::geography, radius_meters)
  order by dist_meters;
end;
$$;

-- Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  username citext,
  display_name text,
  full_name text,
  avatar_url text,
  subscription_type text default 'free',
  points int default 0,
  rank text default 'Rookie',
  xp int default 0,
  level int default 1,
  unit_system text default 'metric',
  stats jsonb default jsonb_build_object('reports', 0, 'confirmations', 0, 'distanceDriven', 0),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.profiles add column if not exists username citext;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists stats jsonb default jsonb_build_object('reports', 0, 'confirmations', 0, 'distanceDriven', 0);
alter table public.profiles add column if not exists updated_at timestamptz default now();
alter table public.profiles add column if not exists subscription_type text default 'free';

create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

-- Reports + confirmations + points ledger
create table if not exists public.radar_reports (
  id uuid primary key default gen_random_uuid(),
  radar_id uuid references public.radars(id) on delete set null,
  reporter_id uuid references auth.users(id) on delete cascade,
  type text not null,
  location geography(Point, 4326) not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending'
);

create table if not exists public.report_confirmations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.radar_reports(id) on delete cascade,
  confirmer_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (report_id, confirmer_id)
);

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  points int not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.rank_from_points(p_points int)
returns text language sql as $$
  select case
    when p_points >= 10000 then 'Legend'
    when p_points >= 5000 then 'Commander'
    when p_points >= 2000 then 'Ranger'
    when p_points >= 500 then 'Scout'
    else 'Rookie'
  end;
$$;

create or replace function public.increment_profile_stats(
  p_user uuid,
  p_reports int,
  p_confirmations int,
  p_distance numeric
)
returns void language plpgsql as $$
begin
  update public.profiles
  set
    stats = jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(stats, '{}'::jsonb), '{reports}',
          to_jsonb(coalesce((stats->>'reports')::int,0) + p_reports), true),
        '{confirmations}',
          to_jsonb(coalesce((stats->>'confirmations')::int,0) + p_confirmations), true),
      '{distanceDriven}',
          to_jsonb(coalesce((stats->>'distanceDriven')::numeric,0) + p_distance), true),
    updated_at = now()
  where id = p_user;
end;
$$;

create or replace function public.apply_report_points()
returns trigger 
language plpgsql
security definer
as $$
declare
  award int := 25;
begin
  insert into public.points_ledger (user_id, event_type, points, metadata)
  values (new.reporter_id, 'report', award, jsonb_build_object('report_id', new.id));

  update public.profiles
  set points = coalesce(points,0) + award,
      xp = coalesce(xp,0) + award,
      rank = public.rank_from_points(coalesce(points,0) + award),
      updated_at = now()
  where id = new.reporter_id;

  perform public.increment_profile_stats(new.reporter_id, 1, 0, 0);
  return new;
end;
$$;

create or replace function public.apply_confirmation_points()
returns trigger 
language plpgsql
security definer
as $$
declare
  confirmer_award int := 10;
  reporter_award int := 5;
  reporter uuid;
begin
  insert into public.points_ledger (user_id, event_type, points, metadata)
  values (new.confirmer_id, 'confirm', confirmer_award, jsonb_build_object('report_id', new.report_id));

  update public.profiles
  set points = coalesce(points,0) + confirmer_award,
      xp = coalesce(xp,0) + confirmer_award,
      rank = public.rank_from_points(coalesce(points,0) + confirmer_award),
      updated_at = now()
  where id = new.confirmer_id;

  perform public.increment_profile_stats(new.confirmer_id, 0, 1, 0);

  select reporter_id into reporter from public.radar_reports where id = new.report_id;
  if reporter is not null then
    update public.profiles
    set points = coalesce(points,0) + reporter_award,
        xp = coalesce(xp,0) + reporter_award,
        rank = public.rank_from_points(coalesce(points,0) + reporter_award),
        updated_at = now()
    where id = reporter;
  end if;

  return new;
end;
$$;

drop trigger if exists radar_report_points on public.radar_reports;
create trigger radar_report_points
after insert on public.radar_reports
for each row execute function public.apply_report_points();

drop trigger if exists radar_confirm_points on public.report_confirmations;
create trigger radar_confirm_points
after insert on public.report_confirmations
for each row execute function public.apply_confirmation_points();

create or replace function public.get_email_for_username(p_username text)
returns text
language plpgsql
security definer
as $$
declare
  result text;
begin
  select email into result from public.profiles where lower(username) = lower(p_username) limit 1;
  return result;
end;
$$;

drop function if exists public.get_leaderboard(integer);
create or replace function public.get_leaderboard(limit_count int default 20)
returns table (
  id uuid,
  display_name text,
  username text,
  points int,
  rank text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select id, display_name, username, points, rank, avatar_url
  from public.profiles
  order by points desc
  limit limit_count;
$$;

create or replace function public.confirm_nearby_report(
  p_lat float,
  p_long float,
  p_radius_meters float,
  p_type text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_report_id uuid;
begin
  select r.id into v_report_id
  from public.radar_reports r
  where (p_type is null or r.type = p_type)
    and r.reporter_id <> auth.uid()
    and st_dwithin(r.location, st_point(p_long, p_lat)::geography, p_radius_meters)
    and not exists (
      select 1 from public.report_confirmations c
      where c.report_id = r.id and c.confirmer_id = auth.uid()
    )
  order by r.created_at desc
  limit 1;

  if v_report_id is null then
    return null;
  end if;

  insert into public.report_confirmations (report_id, confirmer_id)
  values (v_report_id, auth.uid());

  return v_report_id;
end;
$$;

grant execute on function public.get_leaderboard(int) to anon, authenticated;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
grant execute on function public.get_nearby_radars(float, float, float) to anon, authenticated;
grant execute on function public.confirm_nearby_report(float, float, float, text) to authenticated;

-- Grant select on tables for direct queries and RPC functions
grant select on table public.radars to anon, authenticated;
grant select on table public.radar_reports to anon, authenticated;
grant select on table public.report_confirmations to anon, authenticated;
grant select on table public.profiles to anon, authenticated;

-- RLS
alter table public.radars enable row level security;
alter table public.profiles enable row level security;
alter table public.radar_reports enable row level security;
alter table public.report_confirmations enable row level security;
alter table public.points_ledger enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'radars' and policyname = 'radars_public_read'
  ) then
    execute 'create policy "radars_public_read" on public.radars for select using (true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'radars' and policyname = 'radars_insert_auth'
  ) then
    execute 'create policy "radars_insert_auth" on public.radars for insert to authenticated with check (auth.role() = ''authenticated'')';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_public_read'
  ) then
    execute 'create policy "profiles_public_read" on public.profiles for select using (true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    execute 'create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own'
  ) then
    execute 'create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'radar_reports' and policyname = 'reports_insert_auth'
  ) then
    execute 'create policy "reports_insert_auth" on public.radar_reports for insert to authenticated with check (auth.uid() = reporter_id)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'radar_reports' and policyname = 'reports_read_all'
  ) then
    execute 'create policy "reports_read_all" on public.radar_reports for select using (true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'report_confirmations' and policyname = 'confirm_insert_auth'
  ) then
    execute 'create policy "confirm_insert_auth" on public.report_confirmations for insert to authenticated with check (auth.uid() = confirmer_id)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'report_confirmations' and policyname = 'confirm_read_all'
  ) then
    execute 'create policy "confirm_read_all" on public.report_confirmations for select using (true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'points_ledger' and policyname = 'points_read_owner'
  ) then
    execute 'create policy "points_read_owner" on public.points_ledger for select using (auth.uid() = user_id)';
  end if;

  -- Allow system/trigger functions to insert points
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'points_ledger' and policyname = 'points_insert_system'
  ) then
    execute 'create policy "points_insert_system" on public.points_ledger for insert with check (true)';
  end if;
end $$;

-- ==========================================
-- FIREBASE WRAPPER SETUP (Optional)
-- ==========================================
/*
  To enable Firebase connectivity, run these commands in the SQL Editor.
  You will need your Firebase Service Account JSON key.

  1. Enable Wrappers:
     create extension if not exists wrappers with schema extensions;

  2. Enable Firebase FDW:
     create foreign data wrapper firebase_wrapper
       handler firebase_fdw_handler
       validator firebase_fdw_validator;

  3. Create Secret in Vault (Replace the JSON with your Service Account Key JSON):
     select vault.create_secret(
       '{
         "type": "service_account",
         "project_id": "radar-tinder",
         "private_key_id": "your_private_key_id",
         "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
         "client_email": "firebase-adminsdk-xxx@radar-tinder.iam.gserviceaccount.com",
         "client_id": "xxx",
         "auth_uri": "https://accounts.google.com/o/oauth2/auth",
         "token_uri": "https://oauth2.googleapis.com/token",
         "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
         "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
       }',
       'firebase_secret'
     );

  4. Create Server:
     create server firebase_server
       foreign data wrapper firebase_wrapper
       options (
         sa_key_id (select id from vault.secrets where name = 'firebase_secret' limit 1),
         project_id 'radar-tinder'
       );

  5. Create Schema and Foreign Table for Users:
     create schema if not exists firebase;
     
     create foreign table firebase.users (
       uid text,
       email text,
       created_at timestamp,
       attrs jsonb
     )
     server firebase_server
     options (
       object 'auth/users'
     );
*/
