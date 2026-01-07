-- Enable PostGIS extension for geospatial queries
create extension if not exists postgis;

-- Create Radars table
create table if not exists radars (
  id uuid default gen_random_uuid() primary key,
  type text not null, -- 'speed_camera', 'police', 'mobile', 'red_light'
  location geography(POINT) not null,
  confidence float default 0.5,
  reported_by uuid, -- references auth.users(id)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  verified boolean default false,
  reports_count int default 1
);

-- Create spatial index for fast location queries
create index if not exists radars_location_idx on radars using GIST (location);

-- Function to find nearby radars
create or replace function get_nearby_radars(lat float, long float, radius_meters float)
returns table (
  id uuid,
  type text,
  latitude float,
  longitude float,
  confidence float,
  dist_meters float
)
language plpgsql
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
  from
    radars r
  where
    st_dwithin(r.location, st_point(long, lat)::geography, radius_meters)
  order by
    dist_meters;
end;
$$;

-- Create Users Profile table (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  points int default 0,
  rank text default 'Rookie',
  xp int default 0,
  level int default 1,
  unit_system text default 'metric',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Leaderboard RPC (safe read of public fields)
create or replace function get_leaderboard(limit_count int default 20)
returns table (
  id uuid,
  full_name text,
  points int,
  rank text,
  avatar_url text
)
language sql
security definer
set search_path = public
as $$
  select id, full_name, points, rank, avatar_url
  from profiles
  order by points desc
  limit limit_count;
$$;

grant execute on function get_leaderboard(int) to anon, authenticated;

-- RLS Policies (Row Level Security)
alter table radars enable row level security;
alter table profiles enable row level security;

-- Allow anyone to read radars
create policy "Public radars are viewable by everyone"
  on radars for select
  using ( true );

-- Allow authenticated users to insert radars
create policy "Users can insert radars"
  on radars for insert
  with check ( auth.role() = 'authenticated' );

-- Allow users to read their own profile
create policy "Users can view own profile"
  on profiles for select
  using ( auth.uid() = id );

-- Allow users to update their own profile
create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );
