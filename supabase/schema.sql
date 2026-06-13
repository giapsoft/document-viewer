-- Document Viewer — Supabase setup (open access, no auth)
-- Run in Supabase Dashboard → SQL Editor

do $$ begin
  create type publish_mode as enum ('public', 'protected', 'private');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.documents (
  id text primary key,
  title text not null,
  updated_at timestamptz not null default now(),
  password_protected boolean not null default false,
  publish_mode publish_mode not null default 'public'
);

-- Migration for existing databases (uuid ids become text; app supplies friendly ids for new docs):
alter table public.documents alter column id drop default;
alter table public.documents alter column id type text using id::text;

do $$ begin
  create type publish_mode as enum ('public', 'protected', 'private');
exception
  when duplicate_object then null;
end $$;

alter table public.documents add column if not exists publish_mode publish_mode;

-- Migrate legacy is_published boolean → publish_mode enum
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'is_published'
  ) then
    update public.documents
    set publish_mode = case
      when is_published = false then 'protected'::publish_mode
      else 'public'::publish_mode
    end
    where publish_mode is null;
  else
    update public.documents
    set publish_mode = 'public'::publish_mode
    where publish_mode is null;
  end if;
end $$;

alter table public.documents alter column publish_mode set default 'public';
update public.documents set publish_mode = 'public' where publish_mode is null;
alter table public.documents alter column publish_mode set not null;

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
