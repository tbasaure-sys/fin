create table if not exists app_user (
  id text primary key,
  email text not null unique,
  display_name text not null,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists invite (
  id text primary key,
  email text not null,
  token text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists workspace (
  id text primary key,
  owner_user_id text not null references app_user(id),
  name text not null,
  mode text not null default 'invite-only',
  created_at timestamptz not null default now()
);

create table if not exists portfolio_account (
  id text primary key,
  workspace_id text not null references workspace(id),
  name text not null,
  broker_name text,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists portfolio_position (
  id text primary key,
  portfolio_account_id text not null references portfolio_account(id),
  ticker text not null,
  quantity numeric not null default 0,
  average_cost numeric,
  market_value numeric,
  updated_at timestamptz not null default now()
);

create table if not exists watchlist_item (
  id text primary key,
  workspace_id text not null references workspace(id),
  ticker text not null,
  label text,
  conviction text,
  created_at timestamptz not null default now()
);

create table if not exists saved_view (
  id text primary key,
  workspace_id text not null references workspace(id),
  name text not null,
  layout jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists alert_rule (
  id text primary key,
  workspace_id text not null references workspace(id),
  rule_type text not null,
  rule_config jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists alert_event (
  id text primary key,
  workspace_id text not null references workspace(id),
  severity text not null,
  title text not null,
  body text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists command_history (
  id text primary key,
  workspace_id text not null references workspace(id),
  command_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists module_snapshot (
  id text primary key,
  workspace_id text not null references workspace(id),
  module_name text not null,
  artifact_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

