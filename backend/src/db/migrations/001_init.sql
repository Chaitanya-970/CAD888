-- RFC-001 schema (verbatim from RFCs/RFC-001-backend-foundation.md).
-- Apply via Supabase SQL editor or: supabase db push

create extension if not exists postgis;

create table road_segments (
  cell_geohash text primary key,          -- precision 7 (~150m)
  center_lat double precision not null,
  center_lng double precision not null,
  lighting int not null default 50,       -- 0..100, seeded from OSM lit= tags
  foot_traffic int not null default 50    -- 0..100, POI-density proxy per time bucket applied at query time
);

create table incident_reports (
  id uuid primary key default gen_random_uuid(),
  cell_geohash text not null references road_segments(cell_geohash),
  severity smallint not null check (severity between 1 and 3),
  light_condition text not null check (light_condition in ('lit','unlit','unknown')),
  note text check (char_length(note) <= 280),
  occurred_at timestamptz not null,
  reporter_hash text not null,            -- salted hash of IP/device, rotating; NEVER raw IP/GPS
  created_at timestamptz not null default now()
);
create index idx_reports_cell_time on incident_reports (cell_geohash, occurred_at desc);

create table segment_safety_scores (
  cell_geohash text not null references road_segments(cell_geohash),
  time_bucket text not null check (time_bucket in ('morning','day','evening','night')),
  score smallint not null check (score between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (cell_geohash, time_bucket)
);
