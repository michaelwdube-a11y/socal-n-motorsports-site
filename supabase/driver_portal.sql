create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.portal_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_submissions (
  id uuid primary key default gen_random_uuid(),
  driver_key text not null,
  driver_name text not null,
  submitter_id uuid not null references auth.users(id),
  submitter_email text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected')),
  payload jsonb not null default '{}'::jsonb,
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submission_assets (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.driver_submissions(id) on delete cascade,
  category text not null check (category in ('headshot', 'car', 'evidence', 'media')),
  object_path text not null unique,
  original_name text not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  created_at timestamptz not null default now()
);

create index if not exists submissions_owner_created
  on public.driver_submissions (submitter_id, created_at desc);
create index if not exists submissions_status_created
  on public.driver_submissions (status, created_at desc);
create index if not exists submission_assets_submission
  on public.submission_assets (submission_id);

create or replace function private.sync_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.portal_users (id, email, is_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    lower(coalesce(new.email, '')) = 'michael.w.dube@gmail.com'
  )
  on conflict (id) do update
  set email = excluded.email,
      is_admin = public.portal_users.is_admin or excluded.is_admin;
  return new;
end;
$$;
revoke all on function private.sync_portal_user() from public, anon, authenticated;

drop trigger if exists auth_user_to_portal on auth.users;
create trigger auth_user_to_portal
after insert or update of email on auth.users
for each row execute function private.sync_portal_user();

-- Include accounts that existed before this portal schema was installed.
insert into public.portal_users (id, email, is_admin)
select
  id,
  coalesce(email, ''),
  lower(coalesce(email, '')) = 'michael.w.dube@gmail.com'
from auth.users
on conflict (id) do update
set email = excluded.email,
    is_admin = public.portal_users.is_admin or excluded.is_admin;

alter table public.portal_users enable row level security;
alter table public.driver_submissions enable row level security;
alter table public.submission_assets enable row level security;

revoke all on public.portal_users from anon, authenticated;
revoke all on public.driver_submissions from anon, authenticated;
revoke all on public.submission_assets from anon, authenticated;

grant select on public.portal_users to authenticated;
grant select, insert on public.driver_submissions to authenticated;
grant update (status, review_note, reviewed_by, reviewed_at, updated_at)
  on public.driver_submissions to authenticated;
grant select, insert on public.submission_assets to authenticated;

drop policy if exists "read own portal identity" on public.portal_users;
create policy "read own portal identity"
on public.portal_users for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "submit own profile" on public.driver_submissions;
create policy "submit own profile"
on public.driver_submissions for insert to authenticated
with check (
  submitter_id = (select auth.uid())
  and submitter_email = coalesce((select auth.jwt()) ->> 'email', '')
  and status = 'pending_review'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "read own or admin submissions" on public.driver_submissions;
create policy "read own or admin submissions"
on public.driver_submissions for select to authenticated
using (
  submitter_id = (select auth.uid())
  or exists (
    select 1 from public.portal_users u
    where u.id = (select auth.uid()) and u.is_admin
  )
);

drop policy if exists "admin review submissions" on public.driver_submissions;
create policy "admin review submissions"
on public.driver_submissions for update to authenticated
using (
  exists (
    select 1 from public.portal_users u
    where u.id = (select auth.uid()) and u.is_admin
  )
)
with check (
  exists (
    select 1 from public.portal_users u
    where u.id = (select auth.uid()) and u.is_admin
  )
  and status in ('approved', 'rejected')
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
);

drop policy if exists "insert own submission assets" on public.submission_assets;
create policy "insert own submission assets"
on public.submission_assets for insert to authenticated
with check (
  exists (
    select 1 from public.driver_submissions s
    where s.id = submission_id and s.submitter_id = (select auth.uid())
  )
);

drop policy if exists "read own or admin assets" on public.submission_assets;
create policy "read own or admin assets"
on public.submission_assets for select to authenticated
using (
  exists (
    select 1 from public.driver_submissions s
    where s.id = submission_id
      and (
        s.submitter_id = (select auth.uid())
        or exists (
          select 1 from public.portal_users u
          where u.id = (select auth.uid()) and u.is_admin
        )
      )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-submissions',
  'driver-submissions',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own driver files" on storage.objects;
create policy "upload own driver files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'driver-submissions'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "read own or admin driver files" on storage.objects;
create policy "read own or admin driver files"
on storage.objects for select to authenticated
using (
  bucket_id = 'driver-submissions'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.portal_users u
      where u.id = (select auth.uid()) and u.is_admin
    )
  )
);
