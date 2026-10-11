-- Persistent failed-attempt storage for the server-side admin PIN Edge Function.
-- This table is not intended to be accessed by browser clients.
create table if not exists public.admin_pin_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists admin_pin_attempts_ip_time_idx
  on public.admin_pin_attempts (ip_hash, attempted_at desc);

alter table public.admin_pin_attempts enable row level security;
revoke all on table public.admin_pin_attempts from anon, authenticated;
