begin;

alter table public.radars
  add column if not exists heading_deg float;

alter table public.radar_reports
  add column if not exists heading_deg float;

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
      'seeded_by_migration',
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

grant execute on function public.claim_external_ingest_tiles(text, text, int) to authenticated;
grant execute on function public.report_radar_sighting(float, float, text, float, float) to authenticated;
grant execute on function public.normalize_radar_family(text) to anon, authenticated;
grant execute on function public.heading_delta_deg(float, float) to anon, authenticated;
grant select on table public.external_ingest_tiles to authenticated;

alter table public.external_ingest_tiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'external_ingest_tiles'
      and policyname = 'external_ingest_tiles_read_auth'
  ) then
    execute 'create policy "external_ingest_tiles_read_auth" on public.external_ingest_tiles for select to authenticated using (auth.role() = ''authenticated'')';
  end if;
end $$;

commit;
