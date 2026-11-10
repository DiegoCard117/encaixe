create table if not exists public.fact_banks (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  bank jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fact_banks enable row level security;
create policy "cada pessoa vê e altera só o próprio banco" on public.fact_banks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
