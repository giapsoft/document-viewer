-- Document Viewer — Supabase setup (open access, no auth)
-- Run in Supabase Dashboard → SQL Editor

create table if not exists public.documents (
  id text primary key,
  title text not null,
  updated_at timestamptz not null default now(),
  password_protected boolean not null default false,
  is_published boolean not null default true
);

-- Migration for existing databases (uuid ids become text; app supplies friendly ids for new docs):
alter table public.documents alter column id drop default;
alter table public.documents alter column id type text using id::text;

alter table public.documents add column if not exists is_published boolean not null default true;
alter table public.documents alter column is_published set default true;
update public.documents set is_published = true where is_published = false;

create or replace function public.set_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.set_documents_updated_at();

alter table public.documents enable row level security;

drop policy if exists "documents public read" on public.documents;
create policy "documents public read"
  on public.documents for select
  using (true);

drop policy if exists "documents public insert" on public.documents;
create policy "documents public insert"
  on public.documents for insert
  with check (true);

drop policy if exists "documents public update" on public.documents;
create policy "documents public update"
  on public.documents for update
  using (true);

drop policy if exists "documents public delete" on public.documents;
create policy "documents public delete"
  on public.documents for delete
  using (true);

insert into storage.buckets (id, name, public)
values ('docs', 'docs', true)
on conflict (id) do update set public = true;

drop policy if exists "docs storage public read" on storage.objects;
create policy "docs storage public read"
  on storage.objects for select
  using (bucket_id = 'docs');

drop policy if exists "docs storage public insert" on storage.objects;
create policy "docs storage public insert"
  on storage.objects for insert
  with check (bucket_id = 'docs');

drop policy if exists "docs storage public update" on storage.objects;
create policy "docs storage public update"
  on storage.objects for update
  using (bucket_id = 'docs');

drop policy if exists "docs storage public delete" on storage.objects;
create policy "docs storage public delete"
  on storage.objects for delete
  using (bucket_id = 'docs');
