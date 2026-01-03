-- Ejecuta esto en Supabase: SQL Editor
-- Objetivo: tablas + defaults + RLS para que SOLO usuarios autenticados (admin) puedan leer/escribir.

-- 1) Tablas
create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  meta_anual integer not null default 1100000,
  frecuencia text not null default 'mensual' check (frecuencia in ('mensual','quincenal')),
  fecha_registro timestamptz not null default now()
);

create table if not exists public.aportes (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas(id) on delete cascade,
  valor integer not null check (valor > 0),
  fecha date not null default (now()::date)
);

create index if not exists idx_aportes_persona_fecha on public.aportes(persona_id, fecha desc);

-- 2) Row Level Security
alter table public.personas enable row level security;
alter table public.aportes enable row level security;

-- 3) Políticas: SOLO autenticados
-- Personas
drop policy if exists "personas_select_auth" on public.personas;
create policy "personas_select_auth" on public.personas for select to authenticated using (true);

drop policy if exists "personas_insert_auth" on public.personas;
create policy "personas_insert_auth" on public.personas for insert to authenticated with check (true);

drop policy if exists "personas_update_auth" on public.personas;
create policy "personas_update_auth" on public.personas for update to authenticated using (true) with check (true);

drop policy if exists "personas_delete_auth" on public.personas;
create policy "personas_delete_auth" on public.personas for delete to authenticated using (true);

-- Aportes
drop policy if exists "aportes_select_auth" on public.aportes;
create policy "aportes_select_auth" on public.aportes for select to authenticated using (true);

drop policy if exists "aportes_insert_auth" on public.aportes;
create policy "aportes_insert_auth" on public.aportes for insert to authenticated with check (true);

drop policy if exists "aportes_update_auth" on public.aportes;
create policy "aportes_update_auth" on public.aportes for update to authenticated using (true) with check (true);

drop policy if exists "aportes_delete_auth" on public.aportes;
create policy "aportes_delete_auth" on public.aportes for delete to authenticated using (true);
