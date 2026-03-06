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
  heading_deg float,
  verified boolean default false,
  reports_count int default 1
);

create index if not exists radars_location_idx on public.radars using gist (location);
alter table public.radars add column if not exists heading_deg float;

create or replace function public.get_nearby_radars(
  lat float,
  long float,
  radius_meters float,
  min_confidence float default 0,
  verified_only boolean default false
)
returns table (
  id uuid,
  type text,
  latitude float,
  longitude float,
  confidence float,
  verified boolean,
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
    r.verified,
    st_distance(r.location, st_point(long, lat)::geography) as dist_meters
  from public.radars r
  where st_dwithin(r.location, st_point(long, lat)::geography, radius_meters)
    and coalesce(r.confidence, 0) >= coalesce(min_confidence, 0)
    and (not coalesce(verified_only, false) or coalesce(r.verified, false) = true)
  order by dist_meters;
end;
$$;

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

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.external_ingest_tiles (
  source text not null,
  tile_key text not null,
  zoom int not null,
  x int not null,
  y int not null,
  min_lat double precision not null,
  min_lng double precision not null,
  max_lat double precision not null,
  max_lng double precision not null,
  country_code text not null,
  priority int not null default 0,
  status text not null default 'pending',
  next_run_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  failure_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source, tile_key)
);

create index if not exists external_ingest_tiles_due_idx
  on public.external_ingest_tiles (source, country_code, status, next_run_at, priority desc);
create index if not exists external_ingest_tiles_priority_idx
  on public.external_ingest_tiles (country_code, priority desc, tile_key);

create or replace function public.normalize_radar_family(p_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_type, 'speed_camera')) in ('fixed', 'speed_camera') then 'speed_camera'
    when lower(coalesce(p_type, 'speed_camera')) = 'red_light' then 'red_light'
    when lower(coalesce(p_type, 'speed_camera')) = 'mobile' then 'mobile'
    when lower(coalesce(p_type, 'speed_camera')) = 'police' then 'police'
    when lower(coalesce(p_type, 'speed_camera')) = 'traffic_enforcement' then 'traffic_enforcement'
    else 'speed_camera'
  end;
$$;

create or replace function public.heading_delta_deg(a float, b float)
returns float
language sql
immutable
as $$
  select abs(mod((a - b + 540)::numeric, 360::numeric)::float - 180);
$$;

create or replace function public.setup_radar_ingest_osm_schedule(
  p_function_url text,
  p_ingest_secret text,
  p_cron text default '*/10 * * * *',
  p_country_code text default 'US',
  p_job_name text default 'radar-ingest-osm-us'
)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, vault, extensions
as $$
declare
  v_job_id bigint;
  v_existing_job_id bigint;
  v_url_secret_name text := p_job_name || '_url';
  v_ingest_secret_name text := p_job_name || '_ingest_secret';
  v_body jsonb := jsonb_build_object(
    'mode', 'schedule',
    'source', 'osm',
    'country_code', upper(coalesce(nullif(trim(p_country_code), ''), 'US'))
  );
  v_command text;
begin
  if coalesce(nullif(trim(p_function_url), ''), '') = '' then
    raise exception 'Function URL is required';
  end if;

  if coalesce(nullif(trim(p_ingest_secret), ''), '') = '' then
    raise exception 'Ingest secret is required';
  end if;

  delete from vault.secrets
  where name in (v_url_secret_name, v_ingest_secret_name);

  perform vault.create_secret(
    trim(p_function_url),
    v_url_secret_name,
    'Radar ingest function URL for ' || p_job_name
  );

  perform vault.create_secret(
    trim(p_ingest_secret),
    v_ingest_secret_name,
    'Radar ingest secret for ' || p_job_name
  );

  select jobid
  into v_existing_job_id
  from cron.job
  where jobname = p_job_name
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  v_command := format(
    $cmd$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = %L),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = %L)
        ),
        body := %L::jsonb
      ) as request_id;
    $cmd$,
    v_url_secret_name,
    v_ingest_secret_name,
    v_body::text
  );

  select cron.schedule(
    p_job_name,
    p_cron,
    v_command
  )
  into v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'job_name', p_job_name,
    'cron', p_cron,
    'country_code', upper(coalesce(nullif(trim(p_country_code), ''), 'US')),
    'function_url_secret', v_url_secret_name,
    'ingest_secret_name', v_ingest_secret_name
  );
end;
$$;

create or replace function public.claim_external_ingest_tiles(
  p_source text,
  p_country_code text default 'US',
  p_limit int default 4
)
returns table (
  source text,
  tile_key text,
  zoom int,
  x int,
  y int,
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  country_code text,
  priority int,
  status text,
  next_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  failure_count int,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select t.source, t.tile_key
    from public.external_ingest_tiles t
    where t.source = p_source
      and (p_country_code is null or t.country_code = p_country_code)
      and t.status <> 'running'
      and t.next_run_at <= now()
    order by t.priority desc, t.next_run_at asc, t.tile_key asc
    limit greatest(1, least(coalesce(p_limit, 4), 20))
    for update skip locked
  ),
  updated as (
    update public.external_ingest_tiles t
    set
      status = 'running',
      updated_at = now(),
      metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
        'claimed_at',
        now(),
        'claim_source',
        p_source
      )
    from due
    where t.source = due.source
      and t.tile_key = due.tile_key
    returning
      t.source,
      t.tile_key,
      t.zoom,
      t.x,
      t.y,
      t.min_lat,
      t.min_lng,
      t.max_lat,
      t.max_lng,
      t.country_code,
      t.priority,
      t.status,
      t.next_run_at,
      t.last_success_at,
      t.last_error_at,
      t.failure_count,
      t.metadata
  )
  select * from updated;
end;
$$;

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
      ('external:' || coalesce(nullif(er.source, ''), 'osm') || ':' || er.source_id)::text as id,
      er.type,
      st_y(er.location::geometry) as latitude,
      st_x(er.location::geometry) as longitude,
      er.confidence,
      coalesce(er.verified, true) as verified,
      coalesce(nullif(er.source, ''), 'osm')::text as source,
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

-- Profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  username citext,
  display_name text,
  full_name text,
  avatar_url text,
  car_image_url text,
  subscription_type text default 'free',
  ads_removed boolean default false,
  subscription_expires_at timestamptz,
  rc_customer_id text,
  account_link_required_until timestamptz,
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
alter table public.profiles add column if not exists car_image_url text;
alter table public.profiles add column if not exists subscription_type text default 'free';
alter table public.profiles add column if not exists ads_removed boolean default false;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists rc_customer_id text;
alter table public.profiles add column if not exists account_link_required_until timestamptz;

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
  heading_deg float,
  created_at timestamptz not null default now(),
  status text not null default 'pending'
);
alter table public.radar_reports add column if not exists heading_deg float;

create or replace function public.report_radar_sighting(
  p_lat float,
  p_long float,
  p_type text,
  p_confidence float,
  p_heading_deg float default null
)
returns table (
  radar_id uuid,
  report_id uuid,
  matched_existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_radar_id uuid;
  v_report_id uuid;
  v_matched boolean := false;
  v_type text := lower(coalesce(nullif(trim(p_type), ''), 'speed_camera'));
  v_confidence float := greatest(0, least(coalesce(p_confidence, 0.5), 1.0));
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  select r.id
  into v_radar_id
  from public.radars r
  where public.normalize_radar_family(r.type) = public.normalize_radar_family(v_type)
    and st_dwithin(r.location, st_point(p_long, p_lat)::geography, 20)
    and (
      p_heading_deg is null
      or r.heading_deg is null
      or public.heading_delta_deg(r.heading_deg, p_heading_deg) <= 45
    )
  order by
    st_distance(r.location, st_point(p_long, p_lat)::geography) asc,
    r.created_at desc
  limit 1;

  if v_radar_id is not null then
    v_matched := true;

    update public.radars
    set
      reports_count = coalesce(reports_count, 1) + 1,
      confidence = least(1.0, greatest(coalesce(confidence, 0.5), v_confidence) + 0.05),
      heading_deg = coalesce(heading_deg, p_heading_deg)
    where id = v_radar_id;
  else
    insert into public.radars (
      type,
      location,
      confidence,
      reported_by,
      verified,
      reports_count,
      heading_deg
    )
    values (
      v_type,
      st_point(p_long, p_lat)::geography,
      v_confidence,
      v_user_id,
      false,
      1,
      p_heading_deg
    )
    returning id into v_radar_id;
  end if;

  insert into public.radar_reports (
    radar_id,
    reporter_id,
    type,
    location,
    heading_deg,
    status
  )
  values (
    v_radar_id,
    v_user_id,
    v_type,
    st_point(p_long, p_lat)::geography,
    p_heading_deg,
    'pending'
  )
  returning id into v_report_id;

  return query
  select v_radar_id, v_report_id, v_matched;
end;
$$;

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

with regions as (
  select 'conus'::text as region, 'US'::text as country_code, 24.0::double precision as min_lat, -125.0::double precision as min_lng, 50.0::double precision as max_lat, -66.0::double precision as max_lng
  union all
  select 'alaska', 'US', 51.0, -180.0, 72.0, -129.0
  union all
  select 'hawaii', 'US', 18.0, -161.0, 23.0, -154.0
),
metros as (
  select 'bay_area'::text as metro, 37.05::double precision as min_lat, -123.10::double precision as min_lng, 38.55::double precision as max_lat, -121.55::double precision as max_lng, 100::int as priority
  union all
  select 'los_angeles', 33.55, -118.95, 34.45, -117.55, 95
  union all
  select 'new_york', 40.20, -74.55, 41.10, -73.10, 95
  union all
  select 'chicago', 41.45, -88.25, 42.25, -87.20, 90
  union all
  select 'seattle', 47.10, -122.60, 47.90, -121.90, 88
  union all
  select 'dc', 38.60, -77.25, 39.10, -76.65, 86
  union all
  select 'houston', 29.35, -95.95, 30.20, -94.85, 84
  union all
  select 'boston', 42.00, -71.40, 42.65, -70.75, 82
),
tile_ranges as (
  select
    r.region,
    r.country_code,
    8 as zoom,
    floor(((r.min_lng + 180.0) / 360.0) * power(2.0, 8))::int as x_min,
    floor(((r.max_lng + 180.0) / 360.0) * power(2.0, 8))::int as x_max,
    floor(((1.0 - ln(tan(radians(r.max_lat)) + (1.0 / cos(radians(r.max_lat)))) / pi()) / 2.0) * power(2.0, 8))::int as y_min,
    floor(((1.0 - ln(tan(radians(r.min_lat)) + (1.0 / cos(radians(r.min_lat)))) / pi()) / 2.0) * power(2.0, 8))::int as y_max
  from regions r
),
tiles as (
  select
    tr.region,
    tr.country_code,
    tr.zoom,
    x,
    y
  from tile_ranges tr
  cross join lateral generate_series(tr.x_min, tr.x_max) as x
  cross join lateral generate_series(tr.y_min, tr.y_max) as y
),
tile_bounds as (
  select
    'osm'::text as source,
    format('z%s-x%s-y%s', t.zoom, t.x, t.y) as tile_key,
    t.zoom,
    t.x,
    t.y,
    degrees(atan(sinh(pi() * (1.0 - (2.0 * (t.y + 1)::double precision) / power(2.0, t.zoom)))))::double precision as min_lat,
    (((t.x)::double precision / power(2.0, t.zoom)) * 360.0 - 180.0)::double precision as min_lng,
    degrees(atan(sinh(pi() * (1.0 - (2.0 * t.y::double precision) / power(2.0, t.zoom)))))::double precision as max_lat,
    ((((t.x + 1)::double precision / power(2.0, t.zoom)) * 360.0) - 180.0)::double precision as max_lng,
    t.country_code,
    t.region
  from tiles t
),
prioritized as (
  select
    tb.source,
    tb.tile_key,
    tb.zoom,
    tb.x,
    tb.y,
    tb.min_lat,
    tb.min_lng,
    tb.max_lat,
    tb.max_lng,
    tb.country_code,
    coalesce(max(m.priority), case tb.region when 'conus' then 40 when 'hawaii' then 35 else 30 end) as priority,
    jsonb_build_object(
      'seed_region',
      tb.region,
      'seeded_by_schema',
      true,
      'seeded_at',
      now()
    ) as metadata
  from tile_bounds tb
  left join metros m
    on tb.max_lat >= m.min_lat
   and tb.min_lat <= m.max_lat
   and tb.max_lng >= m.min_lng
   and tb.min_lng <= m.max_lng
  group by
    tb.source,
    tb.tile_key,
    tb.zoom,
    tb.x,
    tb.y,
    tb.min_lat,
    tb.min_lng,
    tb.max_lat,
    tb.max_lng,
    tb.country_code,
    tb.region
)
insert into public.external_ingest_tiles (
  source,
  tile_key,
  zoom,
  x,
  y,
  min_lat,
  min_lng,
  max_lat,
  max_lng,
  country_code,
  priority,
  status,
  next_run_at,
  metadata
)
select
  p.source,
  p.tile_key,
  p.zoom,
  p.x,
  p.y,
  p.min_lat,
  p.min_lng,
  p.max_lat,
  p.max_lng,
  p.country_code,
  p.priority,
  'pending',
  now(),
  p.metadata
from prioritized p
on conflict (source, tile_key) do update
set
  country_code = excluded.country_code,
  priority = greatest(public.external_ingest_tiles.priority, excluded.priority),
  metadata = coalesce(public.external_ingest_tiles.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();

grant execute on function public.get_leaderboard(int) to anon, authenticated;
grant execute on function public.get_email_for_username(text) to anon, authenticated;
grant execute on function public.get_nearby_radars(float, float, float, float, boolean) to anon, authenticated;
grant execute on function public.get_nearby_radars_v2(float, float, float, float, boolean) to anon, authenticated;
grant execute on function public.confirm_nearby_report(float, float, float, text) to authenticated;
grant execute on function public.setup_radar_ingest_osm_schedule(text, text, text, text, text) to service_role;
grant execute on function public.claim_external_ingest_tiles(text, text, int) to authenticated;
grant execute on function public.report_radar_sighting(float, float, text, float, float) to authenticated;
grant execute on function public.normalize_radar_family(text) to anon, authenticated;
grant execute on function public.heading_delta_deg(float, float) to anon, authenticated;

-- Grant select on tables for direct queries and RPC functions
grant select on table public.radars to anon, authenticated;
grant select on table public.external_radars to anon, authenticated;
grant select on table public.external_ingest_tiles to authenticated;
grant select on table public.radar_reports to anon, authenticated;
grant select on table public.report_confirmations to anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant select on table public.external_ingest_runs to authenticated;

-- RLS
alter table public.radars enable row level security;
alter table public.external_radars enable row level security;
alter table public.external_ingest_tiles enable row level security;
alter table public.profiles enable row level security;
alter table public.radar_reports enable row level security;
alter table public.report_confirmations enable row level security;
alter table public.points_ledger enable row level security;
alter table public.subscription_events enable row level security;
alter table public.external_ingest_runs enable row level security;

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "profile_media_public_read" on storage.objects;
create policy "profile_media_public_read"
on storage.objects
for select
using (bucket_id = 'profile-media');

drop policy if exists "profile_media_insert_own" on storage.objects;
create policy "profile_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_media_update_own" on storage.objects;
create policy "profile_media_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_media_delete_own" on storage.objects;
create policy "profile_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

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
    select 1 from pg_policies where schemaname = 'public' and tablename = 'external_radars' and policyname = 'external_radars_public_read'
  ) then
    execute 'create policy "external_radars_public_read" on public.external_radars for select using (true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'external_ingest_tiles' and policyname = 'external_ingest_tiles_read_auth'
  ) then
    execute 'create policy "external_ingest_tiles_read_auth" on public.external_ingest_tiles for select to authenticated using (auth.role() = ''authenticated'')';
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

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'external_ingest_runs' and policyname = 'external_ingest_runs_read_auth'
  ) then
    execute 'create policy "external_ingest_runs_read_auth" on public.external_ingest_runs for select to authenticated using (auth.role() = ''authenticated'')';
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
-- Trips/Driving Sessions
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  start_location text,
  end_location text,
  distance numeric default 0,
  duration int default 0,
  score int default 0,
  start_time timestamptz,
  end_time timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists trips_user_id_idx on public.trips (user_id);
create index if not exists trips_created_at_idx on public.trips (created_at);

-- RLS for trips
alter table public.trips enable row level security;

create policy "trips_select_own" on public.trips
  for select using (auth.uid() = user_id);

create policy "trips_insert_own" on public.trips
  for insert with check (auth.uid() = user_id);

create policy "trips_update_own" on public.trips
  for update using (auth.uid() = user_id);
