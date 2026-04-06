-- External radar layer + v2 nearby RPC (idempotent)

begin;

create table if not exists public.external_radars (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  type text not null,
  location geography(Point, 4326) not null,
  confidence float default 0.85,
  verified boolean default true,
  last_seen_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source, source_id)
);

create index if not exists external_radars_location_idx
  on public.external_radars using gist (location);
create index if not exists external_radars_source_idx
  on public.external_radars (source, source_id);
create index if not exists external_radars_last_seen_idx
  on public.external_radars (last_seen_at desc);

create table if not exists public.external_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  run_scope text,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count int default 0,
  upserted_count int default 0,
  dropped_count int default 0,
  error_log text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists external_ingest_runs_source_idx
  on public.external_ingest_runs (source, started_at desc);

drop function if exists public.get_nearby_radars_v2(float, float, float, float, boolean);

create or replace function public.get_nearby_radars_v2(
  lat float,
  long float,
  radius_meters float,
  min_confidence float default 0,
  verified_only boolean default false
)
returns table (
  id text,
  type text,
  latitude float,
  longitude float,
  confidence float,
  verified boolean,
  source text,
  dist_meters float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with nearby_community as (
    select
      r.id::text as id,
      r.type,
      st_y(r.location::geometry) as latitude,
      st_x(r.location::geometry) as longitude,
      r.confidence,
      coalesce(r.verified, false) as verified,
      'community'::text as source,
      st_distance(r.location, st_point(long, lat)::geography) as dist_meters
    from public.radars r
    where st_dwithin(r.location, st_point(long, lat)::geography, radius_meters)
      and coalesce(r.confidence, 0) >= coalesce(min_confidence, 0)
      and (not coalesce(verified_only, false) or coalesce(r.verified, false) = true)
  ),
  nearby_external as (
    select
      ('external:' || coalesce(er.source, 'osm') || ':' || er.source_id)::text as id,
      er.type,
      st_y(er.location::geometry) as latitude,
      st_x(er.location::geometry) as longitude,
      er.confidence,
      coalesce(er.verified, true) as verified,
      'external_osm'::text as source,
      st_distance(er.location, st_point(long, lat)::geography) as dist_meters
    from public.external_radars er
    where st_dwithin(er.location, st_point(long, lat)::geography, radius_meters)
      and coalesce(er.confidence, 0) >= coalesce(min_confidence, 0)
      and (not coalesce(verified_only, false) or coalesce(er.verified, true) = true)
  )
  select *
  from (
    select * from nearby_community
    union all
    select * from nearby_external
  ) combined
  order by combined.dist_meters;
end;
$$;

grant execute on function public.get_nearby_radars_v2(float, float, float, float, boolean)
  to anon, authenticated;
grant select on table public.external_radars to anon, authenticated;
grant select on table public.external_ingest_runs to authenticated;

alter table public.external_radars enable row level security;
alter table public.external_ingest_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'external_radars'
      and policyname = 'external_radars_public_read'
  ) then
    execute 'create policy "external_radars_public_read" on public.external_radars for select using (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'external_ingest_runs'
      and policyname = 'external_ingest_runs_read_auth'
  ) then
    execute 'create policy "external_ingest_runs_read_auth" on public.external_ingest_runs for select to authenticated using (auth.role() = ''authenticated'')';
  end if;
end $$;

commit;
