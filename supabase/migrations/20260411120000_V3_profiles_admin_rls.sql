-- profiles RLS: admins full read/update/delete; others read/update own only.
-- Replaces V1/V2 profile policies with a single permissive policy per command
-- so WITH CHECK cannot be bypassed by stacking policies.

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Prior / experimental policy names
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: update own (no role change)" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_delete" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update any profile" on public.profiles;
drop policy if exists "Admins can delete profiles" on public.profiles;

drop policy if exists "profiles: select" on public.profiles;
drop policy if exists "profiles: update" on public.profiles;
drop policy if exists "profiles: delete" on public.profiles;
drop policy if exists "profiles: insert" on public.profiles;

create policy "profiles: select"
  on public.profiles
  for select
  using (
    id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "profiles: update"
  on public.profiles
  for update
  using (
    id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  )
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or (
      id = auth.uid()
      and role = (select role from public.profiles where id = auth.uid())
    )
  );

create policy "profiles: delete"
  on public.profiles
  for delete
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "profiles: insert"
  on public.profiles
  for insert
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Allow role changes when the updater is an admin (still blocks clinician self-escalation).
create or replace function public.enforce_profile_role_immutable_for_clients()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if auth.role() is null then
      return new;
    end if;
    if (select role from public.profiles where id = auth.uid()) = 'admin' then
      return new;
    end if;
    raise exception 'Profile role cannot be changed from this session';
  end if;
  return new;
end;
$$;
