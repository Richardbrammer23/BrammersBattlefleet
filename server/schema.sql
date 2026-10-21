-- Brammers BattleFleet AI schema. Idempotent: safe to run repeatedly.
create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 15),
  avatar jsonb,
  session_hash text not null unique,
  recovery_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One captain per name, ignoring case. The server stores names trimmed and NFKC-normalised.
alter table players add column if not exists name_key text generated always as (lower(btrim(display_name))) stored;
create unique index if not exists players_name_key_idx on players (name_key);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  mode text not null check (mode in ('devin', 'codeassist', 'traditional')),
  phase text not null check (phase in ('briefing', 'playing', 'won', 'lost', 'abandoned')),
  state jsonb not null,
  assistance_status text not null,
  human_turns int not null default 0,
  duration_ms int,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists games_leaderboard_idx on games (human_turns, duration_ms, ended_at) where phase = 'won';
create index if not exists games_player_idx on games (player_id, created_at desc);

create table if not exists achievements (
  player_id uuid not null references players(id) on delete cascade,
  code text not null,
  game_id uuid references games(id) on delete set null,
  earned_at timestamptz not null default now(),
  primary key (player_id, code)
);

create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- All access goes through the server (which connects as the table owner).
-- RLS with no policies denies everything to Supabase's public API roles.
alter table players enable row level security;
alter table games enable row level security;
alter table achievements enable row level security;
alter table rate_limits enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on players, games, achievements, rate_limits from anon, authenticated;
  end if;
end $$;

-- Least-privilege runtime role (created by scripts/create-app-role.ts in production).
-- It gets DML on the game tables only, through explicit RLS policies.
do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'battlefleet_app') then
    grant usage on schema public to battlefleet_app;
    grant select, insert, update, delete on players, games, achievements, rate_limits to battlefleet_app;
    foreach t in array array['players', 'games', 'achievements', 'rate_limits'] loop
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'battlefleet_app_all') then
        execute format('create policy battlefleet_app_all on %I for all to battlefleet_app using (true) with check (true)', t);
      end if;
    end loop;
  end if;
end $$;
