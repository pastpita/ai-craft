-- AI CRAFT shared world. The server also runs these statements on boot (idempotent).
create table if not exists world_docs (
  key        text primary key,          -- 'world/meta', 'world/core', 'agents/s0', 'edits/e2', 'history/h0', ...
  body       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists world_history (
  id         bigserial primary key,
  world_id   text not null,
  day        int not null,
  t          double precision not null,
  kind       text,
  village    text,
  text       text not null,
  created_at timestamptz not null default now()
);
create table if not exists world_events (
  id         bigserial primary key,
  world_id   text not null,
  ev_id      bigint not null,
  day        int not null,
  t          double precision not null,
  type       text not null,
  village    text,
  actor      text,
  text       text,
  truth      text,
  created_at timestamptz not null default now(),
  unique (world_id, ev_id)
);
create index if not exists world_events_day on world_events (world_id, day);
create index if not exists world_history_day on world_history (world_id, day);
