-- Radar Tinder pre-publish Supabase audit (run in SQL Editor)
--
-- AUTH (Dashboard, not SQL): enable Anonymous sign-in if TrialOffer uses anonymous auth.
-- Authentication → Providers → Anonymous → Enable.
-- If you ran `supabase config push` and disabled anonymous remotely, re-enable there.
-- Project: igtbffnatbbtdghvcvhx

-- 1) External radar counts by source
select source, count(*) as total
from public.external_radars
group by 1
order by 2 desc;

-- 2) San Francisco speed cameras (bay area bbox)
select count(*) as sf_speed_cameras
from public.external_radars
where location && ST_MakeEnvelope(-122.55, 37.70, -122.35, 37.82, 4326)
  and camera_type in ('speed_camera', 'speed_fixed');

-- 3) Istanbul bbox (expect low in Supabase; app uses OSM fallback when enabled)
select count(*) as istanbul_external
from public.external_radars
where location && ST_MakeEnvelope(28.85, 40.95, 29.15, 41.12, 4326);

-- 4) Ingest tile coverage (US-focused today)
select country_code, status, count(*) as tiles
from public.external_ingest_tiles
group by 1, 2
order by 1, 2;

-- 5) Recent ingest runs
select source, status, started_at, finished_at, records_upserted
from public.external_ingest_runs
order by started_at desc
limit 20;
