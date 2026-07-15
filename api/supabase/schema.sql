-- Slack React API schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).

-- Pending OAuth handshakes (read/write key pairs for Figma plugin polling)
create table if not exists oauth_pending (
  read_key text primary key,
  write_key text not null unique,
  payload jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_pending_write_key_idx on oauth_pending (write_key);
create index if not exists oauth_pending_expires_at_idx on oauth_pending (expires_at);

-- Connected Slack workspaces
create table if not exists slack_connections (
  team_id text primary key,
  team_name text not null default '',
  access_token text not null,
  session_token_hash text not null unique,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists slack_connections_session_token_hash_idx
  on slack_connections (session_token_hash);
