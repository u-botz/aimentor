-- Milestone cards — the "look how far I've come" wall + reveal payoff.
-- Safe to run repeatedly: every statement is IF NOT EXISTS.
--
-- The cron detector (app/api/cron/milestones/route.ts) upserts with
-- onConflict: 'user_id,kind,fired_date' and ignoreDuplicates, which REQUIRES a
-- matching unique constraint/index. If you already created the table, you only
-- need the unique index below.

create table if not exists public.milestone_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  evidence    jsonb not null default '{}'::jsonb,
  fired_date  date not null,
  seen_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Race-safety + at-most-one-card-per-user-per-kind-per-day. The cron upsert
-- depends on this exact tuple.
create unique index if not exists milestone_cards_user_kind_fired_date_key
  on public.milestone_cards (user_id, kind, fired_date);

-- Fast lookups for the "don't stack an unseen card" guard and the library list.
create index if not exists milestone_cards_user_seen_idx
  on public.milestone_cards (user_id, seen_at);

create index if not exists milestone_cards_user_created_idx
  on public.milestone_cards (user_id, created_at desc);
