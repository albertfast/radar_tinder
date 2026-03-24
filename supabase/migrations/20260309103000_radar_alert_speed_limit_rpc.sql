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
  speed_limit float,
  metadata jsonb,
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
      null::float as speed_limit,
      null::jsonb as metadata,
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
      case
        when jsonb_typeof(er.metadata -> 'speed_limit') = 'number'
          then (er.metadata ->> 'speed_limit')::float
        when coalesce(er.metadata ->> 'speed_limit', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (er.metadata ->> 'speed_limit')::float
        else null::float
      end as speed_limit,
      er.metadata,
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
