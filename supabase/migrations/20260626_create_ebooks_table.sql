create table if not exists public.ebooks (
  id text primary key,
  user_id text not null,
  title text not null,
  normalized_title text not null,
  blocks jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ebooks_user_id_normalized_title_key
  on public.ebooks (user_id, normalized_title);

create index if not exists ebooks_user_id_idx
  on public.ebooks (user_id);

create index if not exists ebooks_updated_at_idx
  on public.ebooks (updated_at desc);

alter table public.ebooks enable row level security;

create policy "Authenticated users can read their own ebooks"
  on public.ebooks
  for select
  to authenticated
  using (user_id = auth.uid()::text);

create policy "Authenticated users can insert their own ebooks"
  on public.ebooks
  for insert
  to authenticated
  with check (user_id = auth.uid()::text);

create policy "Authenticated users can update their own ebooks"
  on public.ebooks
  for update
  to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

create policy "Authenticated users can delete their own ebooks"
  on public.ebooks
  for delete
  to authenticated
  using (user_id = auth.uid()::text);
