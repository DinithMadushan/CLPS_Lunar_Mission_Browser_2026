-- CLPS mission tables for Supabase / PostgreSQL. Run in the Supabase SQL editor.
create table if not exists clps_missions (
  id text primary key,
  name text not null,
  provider text,
  task_order text,
  lander text,
  launch_vehicle text,
  launch_actual timestamptz,              -- ONLY actual, documented launch time
  landing_actual timestamptz,             -- ONLY actual, documented landing time
  ops_end_documented boolean not null default false,
  launch_target_text text,                -- planned / unconfirmed timing, free text
  landing_target_text text,
  lifecycle text not null check (lifecycle in ('planned','launched','landed','completed','cancelled')),
  outcome text not null check (outcome in ('pending','success','partial','failure','none')),
  outcome_note text,
  target_site_name text,
  landing_region text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 360),
  coordinate_kind text not null default 'unavailable' check (coordinate_kind in ('reported_actual','estimated_region','unavailable')),
  coordinate_note text,
  payload_count integer check (payload_count >= 0),
  payload_scope text,
  payloads_listed_complete boolean not null default false,
  source_url text,
  source_label text,
  last_checked date,
  confidence text check (confidence in ('high','medium','low'))
);
create table if not exists clps_payloads (
  id bigserial primary key,
  mission_id text not null references clps_missions(id) on delete cascade,
  name text not null,
  category text,
  description text
);
-- Read-only public access with the publishable key; writes need the service role (run seed locally only).
alter table clps_missions enable row level security;
alter table clps_payloads enable row level security;
drop policy if exists "public read missions" on clps_missions;
drop policy if exists "public read payloads" on clps_payloads;
create policy "public read missions" on clps_missions for select using (true);
create policy "public read payloads" on clps_payloads for select using (true);
