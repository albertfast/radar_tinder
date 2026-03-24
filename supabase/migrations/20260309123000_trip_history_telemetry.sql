alter table if exists public.trips
  add column if not exists avg_speed_kph numeric,
  add column if not exists top_speed_kph numeric,
  add column if not exists moving_duration int default 0,
  add column if not exists speed_samples_count int default 0,
  add column if not exists start_latitude double precision,
  add column if not exists start_longitude double precision,
  add column if not exists end_latitude double precision,
  add column if not exists end_longitude double precision;
