-- =====================================================================
--  Cross Core Ops Suite v8 — live database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
-- =====================================================================

-- ---------- 1. Staff directory (who may sign in, and their portal role) ----------
create table if not exists public.cc_people (
  email           text primary key,
  person_key      text not null unique,          -- matches the portal's person id (e.g. 'kiara', 'ja')
  role            text not null default 'staff' check (role in ('head','hr','pm','staff')),
  active          boolean not null default true,
  must_change_pw  boolean not null default true,  -- forces a new password on first login
  user_id         uuid unique references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Current Cross Core team (from Ops Suite v7.2). HR can add more from the portal.
insert into public.cc_people (email, person_key, role) values
  ('paul.crosscore@gmail.com', 'paul', 'head'),
  ('ja.crosscore@gmail.com', 'ja', 'head'),
  ('norms.crosscore@gmail.com', 'norman', 'head'),
  ('tricia.crosscore@gmail.com', 'tricia', 'pm'),
  ('yamille.crosscore@gmail.com', 'yam', 'pm'),
  ('charis.crosscore@gmail.com', 'charisse', 'staff'),
  ('luane.crosscore@gmail.com', 'luane', 'hr'),
  ('kiaravianela.crosscore@gmail.com', 'kiara', 'staff'),
  ('podcastbackstageaccess@gmail.com', 'maryrose', 'staff'),
  ('cherrylou.o.devera@gmail.com', 'cherry', 'staff'),
  ('jczaragosaa@gmail.com', 'janile', 'staff'),
  ('teresacrosscore@gmail.com', 'teresa', 'staff'),
  ('katepoulinecrosscore@gmail.com', 'kate', 'staff'),
  ('kristiapaulah.crosscore@gmail.com', 'kristia', 'staff'),
  ('colette.crosscore@gmail.com', 'colette', 'staff'),
  ('neilbryan.crosscore@gmail.com', 'neil', 'staff'),
  ('sam.crosscore@gmail.com', 'sam', 'staff'),
  ('fernandoyuwen@gmail.com', 'yuwen', 'staff'),
  ('russel.crosscore@gmail.com', 'russel', 'staff'),
  ('alexis.crosscore@gmail.com', 'alexis', 'staff'),
  ('erica.crosscore@gmail.com', 'erica', 'staff'),
  ('nikko.crosscore@gmail.com', 'nikko', 'staff'),
  ('eynjsd.crosscore@gmail.com', 'angelica', 'staff'),
  ('christian.crosscore@gmail.com', 'christian', 'staff'),
  ('nica.crosscore2@gmail.com', 'pj', 'staff'),
  ('joemar.crosscore@gmail.com', 'joemar', 'staff')
on conflict (email) do nothing;

-- Link a login to the directory whenever an auth user is created (portal or dashboard).
create or replace function public.cc_link_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.cc_people set user_id = new.id where lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists cc_link_user on auth.users;
create trigger cc_link_user after insert on auth.users
  for each row execute function public.cc_link_user();
-- Link any users that already exist.
update public.cc_people p set user_id = u.id from auth.users u
  where lower(u.email) = lower(p.email) and p.user_id is null;

-- ---------- 2. Helper functions used by the security rules ----------
create or replace function public.cc_me() returns text
language sql stable security definer set search_path = public as $$
  select person_key from public.cc_people where user_id = auth.uid() and active limit 1
$$;
create or replace function public.cc_my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.cc_people where user_id = auth.uid() and active limit 1
$$;
create or replace function public.cc_password_changed() returns void
language sql security definer set search_path = public as $$
  update public.cc_people set must_change_pw = false where user_id = auth.uid()
$$;

alter table public.cc_people enable row level security;
drop policy if exists cc_people_read on public.cc_people;
create policy cc_people_read on public.cc_people for select to authenticated
  using (user_id = auth.uid() or public.cc_my_role() in ('head','hr'));
-- Changes to the directory go through the cc-admin Edge Function (service role) only.

-- ---------- 3. All portal records (clients, tasks, chats, HR documents, …) ----------
create table if not exists public.cc_records (
  collection  text not null,
  id          text not null,
  data        jsonb not null,
  audience    text[],              -- null = every active staff member; otherwise the person keys allowed
  scope       text,                -- chat id for messages: visible to that chat's members
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists cc_records_scope_idx on public.cc_records (scope);
create index if not exists cc_records_updated_idx on public.cc_records (updated_at);

create or replace function public.cc_can_see(aud text[], scp text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.cc_me() is not null and (
    case
      when scp is not null then exists (
        select 1 from public.cc_records c
        where c.collection = 'chats' and c.id = scp and public.cc_me() = any(c.audience))
      when aud is null then true
      else public.cc_me() = any(aud)
    end)
$$;

create or replace function public.cc_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(public.cc_me(), new.updated_by);
  return new;
end $$;
drop trigger if exists cc_touch on public.cc_records;
create trigger cc_touch before insert or update on public.cc_records
  for each row execute function public.cc_touch();

alter table public.cc_records enable row level security;
drop policy if exists cc_rec_select on public.cc_records;
drop policy if exists cc_rec_insert on public.cc_records;
drop policy if exists cc_rec_update on public.cc_records;
drop policy if exists cc_rec_delete on public.cc_records;
create policy cc_rec_select on public.cc_records for select to authenticated
  using (public.cc_can_see(audience, scope)
         or (collection = 'chats' and coalesce(data->>'kind','') <> 'dm' and public.cc_my_role() in ('head','hr','pm')));
create policy cc_rec_insert on public.cc_records for insert to authenticated
  with check (public.cc_can_see(audience, scope)
              or collection = 'notifs'                                   -- anyone may notify a colleague
              or (collection = 'chats' and public.cc_my_role() in ('head','hr','pm')));
create policy cc_rec_update on public.cc_records for update to authenticated
  using (public.cc_can_see(audience, scope)
         or (collection = 'chats' and public.cc_my_role() in ('head','hr','pm')))
  with check (public.cc_can_see(audience, scope)
              or collection = 'notifs'
              or (collection = 'chats' and public.cc_my_role() in ('head','hr','pm')));
create policy cc_rec_delete on public.cc_records for delete to authenticated
  using (public.cc_can_see(audience, scope)
         and (collection not in ('employees','clients','hrdocs','evals','qreports')
              or public.cc_my_role() in ('head','hr')));

-- ---------- Server-only settings (automatic lead search key) ----------
-- No policies on purpose: only the cc-admin function (service role) can read or write this table.
create table if not exists public.cc_secrets (
  k          text primary key,
  v          text,
  updated_at timestamptz default now()
);
alter table public.cc_secrets enable row level security;
revoke all on public.cc_secrets from anon, authenticated;

-- Real-time updates
alter table public.cc_records replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'cc_records') then
    alter publication supabase_realtime add table public.cc_records;
  end if;
end $$;

-- ---------- 4. File storage (logos, brand kits, contracts, lead lists, outputs) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('cc-files', 'cc-files', false, 52428800)   -- 50 MB per file
on conflict (id) do nothing;

drop policy if exists cc_files_read on storage.objects;
drop policy if exists cc_files_write on storage.objects;
create policy cc_files_read on storage.objects for select to authenticated
  using (bucket_id = 'cc-files' and public.cc_me() is not null);
create policy cc_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'cc-files' and public.cc_me() is not null);

-- ---------- 5. Directory helpers for HR (work even before the Edge Function is deployed) ----------
create or replace function public.cc_register(p_email text, p_key text, p_role text default 'staff')
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.cc_my_role() not in ('hr','head') then raise exception 'Only HR and company heads can register accounts'; end if;
  if p_role = 'head' and public.cc_my_role() <> 'head' then raise exception 'Only company heads can register head accounts'; end if;
  insert into public.cc_people (email, person_key, role) values (lower(trim(p_email)), p_key, coalesce(p_role,'staff'))
  on conflict (email) do update set person_key = excluded.person_key, role = excluded.role, active = true;
  update public.cc_people p set user_id = u.id from auth.users u
    where lower(u.email) = lower(p.email) and p.email = lower(trim(p_email)) and p.user_id is null;
end $$;
create or replace function public.cc_set_active(p_email text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.cc_my_role() not in ('hr','head') then raise exception 'Only HR and company heads can change account access'; end if;
  update public.cc_people set active = p_active where email = lower(trim(p_email))
    and (role <> 'head' or public.cc_my_role() = 'head');
end $$;
