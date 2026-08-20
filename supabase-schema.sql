-- ============================================================
-- ESQUEMA DE BASE DE DATOS — Panel del Estudiante (SoyAeronautico)
-- Ejecutar una sola vez en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Perfil de cada estudiante (nombre visible en el panel)
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default 'Estudiante',
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create policy "Los usuarios ven su propio perfil"
  on public.perfiles for select
  using (auth.uid() = id);

create policy "Los usuarios crean su propio perfil"
  on public.perfiles for insert
  with check (auth.uid() = id);

create policy "Los usuarios actualizan su propio perfil"
  on public.perfiles for update
  using (auth.uid() = id);

-- Intentos de quiz (progreso del estudiante)
create table if not exists public.intentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null,
  nombre_modulo text not null,
  correctas integer not null,
  total integer not null,
  porcentaje integer not null,
  fecha timestamptz not null default now()
);

alter table public.intentos enable row level security;

create policy "Los usuarios ven sus propios intentos"
  on public.intentos for select
  using (auth.uid() = usuario_id);

create policy "Los usuarios insertan sus propios intentos"
  on public.intentos for insert
  with check (auth.uid() = usuario_id);

create index if not exists intentos_usuario_id_idx on public.intentos (usuario_id);
create index if not exists intentos_fecha_idx on public.intentos (fecha desc);

-- ============================================================
-- MIGRACIÓN — Perfil del estudiante: nombre/apellido separados,
-- rol (preparación para profesores/administradores) y creación
-- automática del perfil al registrarse.
-- Ejecutar una sola vez adicional sobre el esquema anterior.
-- ============================================================

alter table public.perfiles
  add column if not exists apellido text not null default '',
  add column if not exists rol text not null default 'student'
    check (rol in ('student', 'teacher', 'admin'));

-- Un estudiante solo puede crear su propio perfil, y siempre como 'student'.
-- El rol solo podrá cambiarlo un administrador (fuera del alcance de esta fase).
drop policy if exists "Los usuarios crean su propio perfil" on public.perfiles;
create policy "Los usuarios crean su propio perfil"
  on public.perfiles for insert
  with check (auth.uid() = id and rol = 'student');

-- Protección a nivel de columna: aunque la policy de UPDATE permita tocar
-- la fila propia, el motor de la base de datos solo deja escribir
-- nombre/apellido. rol, id y creado_en quedan fuera del alcance del usuario.
revoke update on public.perfiles from authenticated;
grant update (nombre, apellido) on public.perfiles to authenticated;

-- Crea automáticamente la fila en perfiles cuando Supabase Auth crea el
-- usuario (independiente de si el correo ya fue confirmado o no).
-- Nombre y apellido llegan como metadata desde el formulario de registro
-- (options.data en supabase.auth.signUp), sin tocar el flujo de
-- confirmación de correo existente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, apellido, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- MIGRACIÓN — Validación de contenido en "intentos".
-- La policy de INSERT solo comprobaba el dueño de la fila
-- (auth.uid() = usuario_id), no los valores: un usuario autenticado
-- podía insertar directamente vía supabase-js, desde la consola del
-- navegador, correctas/total/porcentaje arbitrarios sin pasar por
-- ningún quiz. Ejecutar una sola vez adicional sobre el esquema anterior.
-- ============================================================

alter table public.intentos drop constraint if exists intentos_valores_coherentes;
alter table public.intentos add constraint intentos_valores_coherentes
  check (correctas >= 0 and total > 0 and correctas <= total and porcentaje = round(correctas * 100.0 / total));

-- Restringe "modulo" a los quizzes/simuladores reales que hoy llaman a
-- guardarIntento(). IMPORTANTE: si se agrega un quiz o simulador nuevo con
-- un id distinto, hay que sumarlo aquí también o sus inserts empezarán a
-- fallar. (2026-08-18: se sumó 'simulador-metar' al conectar su examen final
-- a guardarIntento; simulador-plan-vuelo, Simulador-NALA y
-- simulador-fraseologia siguen sin conectar porque no tienen una nota
-- agregada confiable que mapear.)
alter table public.intentos drop constraint if exists intentos_modulo_valido;
alter table public.intentos add constraint intentos_modulo_valido
  check (modulo in ('quiz-ats', 'quiz-fpl', 'quiz-designadores', 'quiz-fraseologia', 'simulador-metar'));
