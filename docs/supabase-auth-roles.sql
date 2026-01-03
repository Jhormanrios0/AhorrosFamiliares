-- Supabase SQL Editor
-- Roles (admin/member) + vínculo persona<->usuario + RLS:
-- - Admin: acceso total
-- - Member: solo puede ver su persona y sus aportes
-- - SOLO el admin puede crear/editar/eliminar aportes
-- - Nadie puede auto-asignarse admin desde la app

-- 0) UUID extension (normalmente ya viene)
create extension if not exists pgcrypto;

-- 1) Tabla de roles
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')) default 'member',
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Puede ver su propio rol
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

-- Puede crear SU rol solo como member (evita que alguien se ponga admin)
drop policy if exists "user_roles_insert_own" on public.user_roles;
create policy "user_roles_insert_own" on public.user_roles
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'member');

-- Nota: NO creamos policies de update/delete para user_roles.

-- 2) Helper: ¿soy admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- 3) Vincular persona con usuario
alter table public.personas
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Plan ahorro fijo (Ene-Nov): meta 1.100.000 y frecuencia mensual/quincenal
alter table public.personas
  add column if not exists frecuencia text not null default 'mensual' check (frecuencia in ('mensual','quincenal'));

alter table public.personas
  alter column meta_anual set default 1100000;

create unique index if not exists personas_user_id_unique
  on public.personas(user_id)
  where user_id is not null;

-- 4) RLS Personas (admin o propia)
alter table public.personas enable row level security;

drop policy if exists "personas_select_auth" on public.personas;
drop policy if exists "personas_insert_auth" on public.personas;
drop policy if exists "personas_update_auth" on public.personas;
drop policy if exists "personas_delete_auth" on public.personas;

drop policy if exists "personas_select_admin_or_own" on public.personas;
drop policy if exists "personas_insert_admin_or_own" on public.personas;
drop policy if exists "personas_update_admin_or_own" on public.personas;
drop policy if exists "personas_delete_admin_or_own" on public.personas;

create policy "personas_select_admin_or_own" on public.personas
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

create policy "personas_insert_admin_or_own" on public.personas
  for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());

create policy "personas_update_admin_or_own" on public.personas
  for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

create policy "personas_delete_admin_or_own" on public.personas
  for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- 5) RLS Aportes
alter table public.aportes enable row level security;

drop policy if exists "aportes_select_auth" on public.aportes;
drop policy if exists "aportes_insert_auth" on public.aportes;
drop policy if exists "aportes_update_auth" on public.aportes;
drop policy if exists "aportes_delete_auth" on public.aportes;

-- por si existían policies anteriores
drop policy if exists "aportes_select_admin_or_own" on public.aportes;
drop policy if exists "aportes_insert_admin_or_own" on public.aportes;
drop policy if exists "aportes_update_admin_or_own" on public.aportes;
drop policy if exists "aportes_delete_admin_or_own" on public.aportes;

drop policy if exists "aportes_insert_admin_only" on public.aportes;
drop policy if exists "aportes_update_admin_only" on public.aportes;
drop policy if exists "aportes_delete_admin_only" on public.aportes;

-- SELECT: admin o aportes de mi persona
create policy "aportes_select_admin_or_own" on public.aportes
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.personas p
      where p.id = aportes.persona_id
        and p.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: SOLO admin
create policy "aportes_insert_admin_only" on public.aportes
  for insert to authenticated
  with check (public.is_admin());

create policy "aportes_update_admin_only" on public.aportes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "aportes_delete_admin_only" on public.aportes
  for delete to authenticated
  using (public.is_admin());

-- 6) UNA VEZ: marcar tu usuario como admin (reemplaza el UUID)
-- insert into public.user_roles(user_id, role)
-- values ('<ADMIN_USER_UUID>', 'admin')
-- on conflict (user_id) do update set role = 'admin';