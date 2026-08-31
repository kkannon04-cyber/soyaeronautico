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

-- ============================================================
-- MIGRACIÓN — Progreso de módulos de aprendizaje (contenido teórico)
-- e insignias por temática. Ejecutar una sola vez adicional sobre el
-- esquema anterior.
-- ============================================================

-- Corrección de un bug: simulador-plan-vuelo y simulador-fraseologia ya
-- llaman a guardarIntento() desde el 2026-08-24, pero nunca se sumaron a
-- este check, así que sus inserts venían fallando en silencio para
-- cualquier usuario con sesión iniciada (en modo invitado no pasan por
-- esta tabla, por eso no se notaba).
alter table public.intentos drop constraint if exists intentos_modulo_valido;
alter table public.intentos add constraint intentos_modulo_valido
  check (modulo in ('quiz-ats', 'quiz-fpl', 'quiz-designadores', 'quiz-fraseologia',
                     'simulador-metar', 'simulador-plan-vuelo', 'simulador-fraseologia'));

-- Una fila por cada página de contenido (módulo de aprendizaje) que el
-- estudiante terminó, es decir, respondió todos los "chequeos rápidos"
-- de esa página. "pagina" está restringido a las páginas reales que hoy
-- llaman a marcarModuloCompletado() (ver progreso.js) — igual que con
-- "intentos", si se agrega una página nueva con chequeos hay que sumar
-- su id aquí también.
create table if not exists public.modulos_completados (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  pagina text not null check (pagina in (
    'ats', 'plan-de-vuelo',
    'meteorologia-generalidades', 'meteorologia-nubosidad', 'meteorologia-variables',
    'fraseologia-fundamentos', 'fraseologia-oaci', 'fraseologia-fases',
    'fraseologia-tierra', 'fraseologia-emergencias'
  )),
  fecha timestamptz not null default now(),
  unique (usuario_id, pagina)
);

alter table public.modulos_completados enable row level security;

create policy "Los usuarios ven sus propios módulos completados"
  on public.modulos_completados for select
  using (auth.uid() = usuario_id);

create policy "Los usuarios insertan sus propios módulos completados"
  on public.modulos_completados for insert
  with check (auth.uid() = usuario_id);

create index if not exists modulos_completados_usuario_id_idx on public.modulos_completados (usuario_id);

-- ============================================================
-- MIGRACIÓN — Módulo de aprendizaje "Navegación Aérea" (6 páginas:
-- fundamentos, tiempo, velocidad, altimetría, radioayudas, viento y
-- unidades). Ejecutar una sola vez adicional sobre el esquema anterior.
-- ============================================================

alter table public.modulos_completados drop constraint if exists modulos_completados_pagina_check;
alter table public.modulos_completados add constraint modulos_completados_pagina_check
  check (pagina in (
    'ats', 'plan-de-vuelo',
    'meteorologia-generalidades', 'meteorologia-nubosidad', 'meteorologia-variables',
    'fraseologia-fundamentos', 'fraseologia-oaci', 'fraseologia-fases',
    'fraseologia-tierra', 'fraseologia-emergencias',
    'navegacion-fundamentos', 'navegacion-tiempo', 'navegacion-velocidad',
    'navegacion-altimetria', 'navegacion-radioayudas', 'navegacion-viento-unidades'
  ));

-- ============================================================
-- MIGRACIÓN — Corrección de bug: los 2 quizzes avanzados de Navegación
-- (quiz-navegacion-tiempo-altimetria.html y
-- quiz-navegacion-radioayudas-viento.html) llaman a guardarIntento() con
-- los ids 'navegacion-quiz-tiempo-altimetria' y
-- 'navegacion-quiz-radioayudas-viento', pero nunca se sumaron a este
-- check — mismo bug que ya había pasado antes con
-- simulador-plan-vuelo/simulador-fraseologia (ver arriba). Cualquier
-- estudiante con sesión iniciada que completaba uno de estos 2 quizzes
-- veía "Resultado guardado" pero el insert fallaba en silencio.
-- Detectado y corregido en producción el 2026-08-29.
--
-- Además, intentos_valores_coherentes (declarado más arriba en este
-- archivo) nunca se había ejecutado realmente contra la base de datos en
-- producción — se re-declara aquí para dejar constancia de que este es
-- el bloque que sí se aplicó.
-- ============================================================

alter table public.intentos drop constraint if exists intentos_modulo_valido;
alter table public.intentos add constraint intentos_modulo_valido
  check (modulo in ('quiz-ats', 'quiz-fpl', 'quiz-designadores', 'quiz-fraseologia',
                     'simulador-metar', 'simulador-plan-vuelo', 'simulador-fraseologia',
                     'navegacion-quiz-tiempo-altimetria', 'navegacion-quiz-radioayudas-viento'));

alter table public.intentos drop constraint if exists intentos_valores_coherentes;
alter table public.intentos add constraint intentos_valores_coherentes
  check (correctas >= 0 and total > 0 and correctas <= total and porcentaje = round(correctas * 100.0 / total));

-- ============================================================
-- MIGRACIÓN — SISTEMA DE PROFESORES (2026-08-30)
--
-- Grupos con código de acceso, banco de preguntas del profesor,
-- actividades (examen o texto con pregunta de comprensión) y
-- resultados. Ejecutar una sola vez adicional sobre el esquema
-- anterior. No modifica intentos ni modulos_completados.
--
-- Orden del bloque: primero las tablas, después las funciones
-- auxiliares y al final las policies (las policies usan las
-- funciones, y las funciones necesitan que las tablas existan).
--
-- DOS DECISIONES DE DISEÑO IMPORTANTES:
--
-- 1) Los resultados apuntan a "actividades" con una clave foránea real,
--    no con una lista blanca de texto como intentos.modulo (esa lista ya
--    causó 2 pérdidas silenciosas de datos por olvidar actualizarla).
--    Una actividad nueva nunca hay que registrarla a mano en ningún lado.
--
-- 2) El estudiante NO tiene permiso de INSERT sobre resultados_actividad
--    ni de SELECT sobre preguntas: recibe las preguntas sin la respuesta
--    correcta y la calificación la hace el servidor (obtener_actividad /
--    calificar_actividad). Ni el puntaje ni las respuestas se pueden
--    manipular desde la consola del navegador.
--
-- NOTA SOBRE RLS: las policies de estas tablas se apoyan en funciones
-- "security definer" (mi_grupo_actual, es_profesor, etc.) en vez de
-- consultarse entre sí. Si "grupos" preguntara por "inscripciones" y
-- "inscripciones" por "grupos", Postgres abortaría con "infinite
-- recursion detected in policy". Las funciones cortan ese ciclo.
-- ============================================================

-- ------------------------------------------------------------
-- TABLAS
-- ------------------------------------------------------------

-- GRUPOS (clases) de un profesor. El código se genera solo y es lo
-- único que el estudiante necesita para vincularse a la clase.
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  codigo text not null unique
    default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  creado_en timestamptz not null default now()
);
alter table public.grupos enable row level security;
create index if not exists grupos_profesor_id_idx on public.grupos (profesor_id);

-- El código no se puede reescribir desde el cliente: si cambiara, los
-- estudiantes ya inscritos se quedarían con un código inexistente.
-- Mismo patrón de protección por columna que se usa con perfiles.rol.
revoke update on public.grupos from authenticated;
grant update (nombre) on public.grupos to authenticated;

-- INSCRIPCIONES (estudiante ↔ grupo). estudiante_id es UNIQUE: un
-- estudiante pertenece a un solo grupo a la vez, y unirse con otro
-- código reemplaza la fila en vez de acumular.
create table if not exists public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null unique references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  fecha timestamptz not null default now()
);
alter table public.inscripciones enable row level security;
create index if not exists inscripciones_grupo_id_idx on public.inscripciones (grupo_id);

-- BANCO DE PREGUNTAS del profesor (opción múltiple, mismo formato que
-- los quizzes del sitio: enunciado + 4 opciones + índice de la correcta).
create table if not exists public.preguntas (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.perfiles(id) on delete cascade,
  enunciado text not null check (length(trim(enunciado)) > 0),
  opciones text[] not null check (cardinality(opciones) = 4),
  correcta smallint not null check (correcta between 0 and 3),
  tema text,
  creado_en timestamptz not null default now()
);
alter table public.preguntas enable row level security;
create index if not exists preguntas_profesor_id_idx on public.preguntas (profesor_id);

-- ACTIVIDADES: examen (N preguntas) o texto (lectura + pregunta de
-- comprensión). "activa" permite prepararlas sin que el grupo las vea.
create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.perfiles(id) on delete cascade,
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  tipo text not null check (tipo in ('examen', 'texto')),
  titulo text not null check (length(trim(titulo)) > 0),
  descripcion text,
  texto_lectura text,
  activa boolean not null default true,
  fecha_limite timestamptz,
  intentos_max integer check (intentos_max is null or intentos_max > 0),
  barajar boolean not null default false,
  creado_en timestamptz not null default now(),
  constraint actividades_texto_requiere_lectura check (
    tipo = 'examen' or (tipo = 'texto' and length(trim(coalesce(texto_lectura, ''))) > 0)
  )
);
alter table public.actividades enable row level security;
create index if not exists actividades_grupo_id_idx on public.actividades (grupo_id);

-- Qué preguntas del banco componen cada actividad, y en qué orden.
create table if not exists public.actividad_preguntas (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  pregunta_id uuid not null references public.preguntas(id) on delete cascade,
  orden integer not null default 0,
  unique (actividad_id, pregunta_id)
);
alter table public.actividad_preguntas enable row level security;
create index if not exists actividad_preguntas_actividad_id_idx on public.actividad_preguntas (actividad_id);

-- RESULTADOS. "detalle" guarda la respuesta elegida en cada pregunta,
-- lo que permite al profesor ver qué preguntas falla más el grupo y no
-- solo el puntaje final.
create table if not exists public.resultados_actividad (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  estudiante_id uuid not null references public.perfiles(id) on delete cascade,
  correctas integer not null,
  total integer not null,
  porcentaje integer not null,
  leido boolean not null default false,
  detalle jsonb,
  fecha timestamptz not null default now(),
  constraint resultados_actividad_valores_coherentes
    check (correctas >= 0 and total > 0 and correctas <= total
           and porcentaje = round(correctas * 100.0 / total))
);
alter table public.resultados_actividad enable row level security;
create index if not exists resultados_actividad_actividad_id_idx on public.resultados_actividad (actividad_id);
create index if not exists resultados_actividad_estudiante_id_idx on public.resultados_actividad (estudiante_id);

-- ------------------------------------------------------------
-- FUNCIONES AUXILIARES PARA LAS POLICIES
-- Son "security definer" a propósito: al no estar sujetas a RLS,
-- rompen los ciclos entre policies (ver nota de arriba). Solo
-- devuelven un booleano o un id derivado de auth.uid(), así que no
-- exponen ningún dato ajeno.
-- ------------------------------------------------------------

create or replace function public.es_profesor()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'teacher');
$$;

create or replace function public.mi_grupo_actual()
returns uuid language sql security definer stable set search_path = public as $$
  select grupo_id from public.inscripciones where estudiante_id = auth.uid();
$$;

create or replace function public.es_mi_grupo_como_profesor(p_grupo_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.grupos g
    where g.id = p_grupo_id and g.profesor_id = auth.uid()
  );
$$;

create or replace function public.es_estudiante_de_mis_grupos(p_estudiante_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.inscripciones i
    join public.grupos g on g.id = i.grupo_id
    where i.estudiante_id = p_estudiante_id and g.profesor_id = auth.uid()
  );
$$;

grant execute on function public.es_profesor() to authenticated;
grant execute on function public.mi_grupo_actual() to authenticated;
grant execute on function public.es_mi_grupo_como_profesor(uuid) to authenticated;
grant execute on function public.es_estudiante_de_mis_grupos(uuid) to authenticated;

-- ------------------------------------------------------------
-- POLICIES
-- ------------------------------------------------------------

-- GRUPOS
drop policy if exists "El profesor ve sus propios grupos" on public.grupos;
create policy "El profesor ve sus propios grupos"
  on public.grupos for select
  using (auth.uid() = profesor_id);

-- El estudiante solo ve el grupo en el que ya está inscrito: el código
-- funciona como clave de acceso y no debe poder listarse.
drop policy if exists "El estudiante ve el grupo al que pertenece" on public.grupos;
create policy "El estudiante ve el grupo al que pertenece"
  on public.grupos for select
  using (id = public.mi_grupo_actual());

drop policy if exists "Solo un profesor crea grupos propios" on public.grupos;
create policy "Solo un profesor crea grupos propios"
  on public.grupos for insert
  with check (auth.uid() = profesor_id and public.es_profesor());

drop policy if exists "El profesor actualiza sus propios grupos" on public.grupos;
create policy "El profesor actualiza sus propios grupos"
  on public.grupos for update
  using (auth.uid() = profesor_id);

drop policy if exists "El profesor borra sus propios grupos" on public.grupos;
create policy "El profesor borra sus propios grupos"
  on public.grupos for delete
  using (auth.uid() = profesor_id);

-- INSCRIPCIONES: sin policy de INSERT a propósito — las altas solo
-- ocurren vía unirse_a_grupo(), que valida el código.
drop policy if exists "Estudiante y profesor ven la inscripción" on public.inscripciones;
create policy "Estudiante y profesor ven la inscripción"
  on public.inscripciones for select
  using (auth.uid() = estudiante_id or public.es_mi_grupo_como_profesor(grupo_id));

drop policy if exists "Estudiante y profesor pueden retirar la inscripción" on public.inscripciones;
create policy "Estudiante y profesor pueden retirar la inscripción"
  on public.inscripciones for delete
  using (auth.uid() = estudiante_id or public.es_mi_grupo_como_profesor(grupo_id));

-- PERFILES: el profesor necesita el nombre de sus estudiantes para el
-- listado y los resultados. Se apila con la policy ya existente "Los
-- usuarios ven su propio perfil" (en SELECT las policies se combinan
-- con OR). Solo lectura, y solo de estudiantes de un grupo propio.
drop policy if exists "El profesor ve el perfil de sus estudiantes" on public.perfiles;
create policy "El profesor ve el perfil de sus estudiantes"
  on public.perfiles for select
  using (public.es_estudiante_de_mis_grupos(id));

-- PREGUNTAS: solo el profesor dueño. El estudiante nunca lee esta tabla
-- (vería la respuesta correcta); las recibe vía obtener_actividad().
drop policy if exists "El profesor gestiona su propio banco de preguntas" on public.preguntas;
create policy "El profesor gestiona su propio banco de preguntas"
  on public.preguntas for all
  using (auth.uid() = profesor_id)
  with check (auth.uid() = profesor_id and public.es_profesor());

-- ACTIVIDADES
drop policy if exists "El profesor gestiona sus propias actividades" on public.actividades;
create policy "El profesor gestiona sus propias actividades"
  on public.actividades for all
  using (auth.uid() = profesor_id)
  with check (
    auth.uid() = profesor_id
    and public.es_mi_grupo_como_profesor(grupo_id)
    and public.es_profesor()
  );

drop policy if exists "El estudiante ve las actividades publicadas de su grupo" on public.actividades;
create policy "El estudiante ve las actividades publicadas de su grupo"
  on public.actividades for select
  using (activa and grupo_id = public.mi_grupo_actual());

-- ACTIVIDAD_PREGUNTAS: solo el profesor. El estudiante recibe la
-- composición de la actividad a través de obtener_actividad().
drop policy if exists "El profesor arma sus propias actividades" on public.actividad_preguntas;
create policy "El profesor arma sus propias actividades"
  on public.actividad_preguntas for all
  using (exists (
    select 1 from public.actividades a
    where a.id = actividad_id and a.profesor_id = auth.uid()
  ))
  with check (
    exists (select 1 from public.actividades a where a.id = actividad_id and a.profesor_id = auth.uid())
    and exists (select 1 from public.preguntas p where p.id = pregunta_id and p.profesor_id = auth.uid())
  );

-- RESULTADOS: sin policy de INSERT a propósito — la única vía para
-- registrar un resultado es calificar_actividad(), que califica en el
-- servidor. Así el puntaje no se puede falsificar desde el navegador.
drop policy if exists "El estudiante ve sus propios resultados" on public.resultados_actividad;
create policy "El estudiante ve sus propios resultados"
  on public.resultados_actividad for select
  using (auth.uid() = estudiante_id);

drop policy if exists "El profesor ve los resultados de sus actividades" on public.resultados_actividad;
create policy "El profesor ve los resultados de sus actividades"
  on public.resultados_actividad for select
  using (exists (
    select 1 from public.actividades a
    where a.id = actividad_id and a.profesor_id = auth.uid()
  ));

drop policy if exists "El profesor borra resultados de sus actividades" on public.resultados_actividad;
create policy "El profesor borra resultados de sus actividades"
  on public.resultados_actividad for delete
  using (exists (
    select 1 from public.actividades a
    where a.id = actividad_id and a.profesor_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- FUNCIONES QUE USA EL FRONTEND
-- ------------------------------------------------------------

-- Unirse a un grupo con el código. security definer para validar el
-- código sin darle al estudiante permiso de SELECT sobre toda la tabla
-- grupos (que expondría todos los códigos). El upsert sobre la clave
-- única estudiante_id garantiza un solo grupo activo por estudiante.
create or replace function public.unirse_a_grupo(p_codigo text)
returns table (grupo_id uuid, grupo_nombre text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para unirte a un grupo.';
  end if;

  select g.id, g.nombre into v_id, v_nombre
  from public.grupos g
  where g.codigo = upper(trim(p_codigo));

  if not found then
    raise exception 'Código de grupo no válido.';
  end if;

  insert into public.inscripciones (estudiante_id, grupo_id)
  values (auth.uid(), v_id)
  on conflict (estudiante_id) do update
    set grupo_id = excluded.grupo_id, fecha = now();

  return query select v_id, v_nombre;
end;
$$;

grant execute on function public.unirse_a_grupo(text) to authenticated;

-- Entrega la actividad y sus preguntas SIN la respuesta correcta, y
-- solo si el estudiante pertenece al grupo y la actividad está publicada.
create or replace function public.obtener_actividad(p_actividad_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_act public.actividades%rowtype;
  v_preguntas jsonb;
  v_intentos integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select a.* into v_act
  from public.actividades a
  join public.inscripciones i on i.grupo_id = a.grupo_id
  where a.id = p_actividad_id and i.estudiante_id = auth.uid() and a.activa;

  if not found then
    raise exception 'Esta actividad no está disponible para tu cuenta.';
  end if;

  select count(*)::integer into v_intentos
  from public.resultados_actividad
  where actividad_id = p_actividad_id and estudiante_id = auth.uid();

  select coalesce(jsonb_agg(
           jsonb_build_object('id', p.id, 'enunciado', p.enunciado, 'opciones', p.opciones)
           order by ap.orden, p.creado_en
         ), '[]'::jsonb)
    into v_preguntas
  from public.actividad_preguntas ap
  join public.preguntas p on p.id = ap.pregunta_id
  where ap.actividad_id = p_actividad_id;

  return jsonb_build_object(
    'id', v_act.id,
    'titulo', v_act.titulo,
    'descripcion', v_act.descripcion,
    'tipo', v_act.tipo,
    'texto_lectura', v_act.texto_lectura,
    'barajar', v_act.barajar,
    'fecha_limite', v_act.fecha_limite,
    'intentos_max', v_act.intentos_max,
    'intentos_usados', v_intentos,
    'cerrada', (v_act.fecha_limite is not null and now() > v_act.fecha_limite),
    'sin_intentos', (v_act.intentos_max is not null and v_intentos >= v_act.intentos_max),
    'preguntas', v_preguntas
  );
end;
$$;

grant execute on function public.obtener_actividad(uuid) to authenticated;

-- Califica y registra el resultado. p_respuestas es un objeto
-- { "<pregunta_id>": <índice elegido 0-3> }. La calificación ocurre
-- aquí, no en el navegador, así que el puntaje no se puede falsificar.
create or replace function public.calificar_actividad(p_actividad_id uuid, p_respuestas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_act public.actividades%rowtype;
  v_intentos integer;
  v_total integer := 0;
  v_correctas integer := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_porcentaje integer;
  r record;
  v_elegida integer;
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select a.* into v_act
  from public.actividades a
  join public.inscripciones i on i.grupo_id = a.grupo_id
  where a.id = p_actividad_id and i.estudiante_id = auth.uid() and a.activa;

  if not found then
    raise exception 'Esta actividad no está disponible para tu cuenta.';
  end if;

  if v_act.fecha_limite is not null and now() > v_act.fecha_limite then
    raise exception 'La fecha límite de esta actividad ya pasó.';
  end if;

  select count(*)::integer into v_intentos
  from public.resultados_actividad
  where actividad_id = p_actividad_id and estudiante_id = auth.uid();

  if v_act.intentos_max is not null and v_intentos >= v_act.intentos_max then
    raise exception 'Ya usaste todos los intentos permitidos para esta actividad.';
  end if;

  for r in
    select p.id, p.correcta
    from public.actividad_preguntas ap
    join public.preguntas p on p.id = ap.pregunta_id
    where ap.actividad_id = p_actividad_id
    order by ap.orden, p.creado_en
  loop
    begin
      v_elegida := nullif(p_respuestas ->> r.id::text, '')::integer;
    exception when others then
      v_elegida := null;
    end;
    v_ok := (v_elegida is not null and v_elegida = r.correcta);
    if v_ok then v_correctas := v_correctas + 1; end if;
    v_total := v_total + 1;
    v_detalle := v_detalle || jsonb_build_object(
      'pregunta_id', r.id, 'elegida', v_elegida, 'correcta', r.correcta, 'ok', v_ok
    );
  end loop;

  if v_total = 0 then
    raise exception 'Esta actividad todavía no tiene preguntas.';
  end if;

  v_porcentaje := round(v_correctas * 100.0 / v_total);

  insert into public.resultados_actividad
    (actividad_id, estudiante_id, correctas, total, porcentaje, leido, detalle)
  values
    (p_actividad_id, auth.uid(), v_correctas, v_total, v_porcentaje, true, v_detalle);

  return jsonb_build_object(
    'correctas', v_correctas,
    'total', v_total,
    'porcentaje', v_porcentaje,
    'detalle', v_detalle
  );
end;
$$;

grant execute on function public.calificar_actividad(uuid, jsonb) to authenticated;

-- Endurecimiento: las 7 funciones de arriba ya rechazan a quien no tiene
-- sesión (auth.uid() is null), pero PostgreSQL concede EXECUTE a PUBLIC
-- por defecto, lo que las deja expuestas en /rest/v1/rpc para el rol
-- anon (lo reporta el linter de seguridad de Supabase). Se retira ese
-- permiso y queda solo el de usuarios autenticados.
revoke execute on function public.es_profesor() from public, anon;
revoke execute on function public.mi_grupo_actual() from public, anon;
revoke execute on function public.es_mi_grupo_como_profesor(uuid) from public, anon;
revoke execute on function public.es_estudiante_de_mis_grupos(uuid) from public, anon;
revoke execute on function public.unirse_a_grupo(text) from public, anon;
revoke execute on function public.obtener_actividad(uuid) from public, anon;
revoke execute on function public.calificar_actividad(uuid, jsonb) from public, anon;

-- ============================================================
-- MIGRACIÓN — VARIOS BANCOS DE PREGUNTAS POR PROFESOR (2026-08-31)
--
-- Antes cada profesor tenía un único banco plano. Ahora puede crear
-- tantos bancos como quiera ("ATS básico", "Meteorología parcial 1",
-- "Simulacro final"…) y, al armar un examen, elegir de qué bancos
-- salen las preguntas y cómo se seleccionan: el banco completo,
-- preguntas escogidas a mano, o N preguntas al azar.
--
-- El sorteo al azar ocurre en el momento de crear la actividad y queda
-- congelado en actividad_preguntas: el examen es el mismo para todo el
-- grupo y el profesor puede verlo con "Vista previa" antes de publicar.
-- ============================================================

create table if not exists public.bancos (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  creado_en timestamptz not null default now()
);

alter table public.bancos enable row level security;
create index if not exists bancos_profesor_id_idx on public.bancos (profesor_id);

drop policy if exists "El profesor gestiona sus propios bancos" on public.bancos;
create policy "El profesor gestiona sus propios bancos"
  on public.bancos for all
  using (auth.uid() = profesor_id)
  with check (auth.uid() = profesor_id and public.es_profesor());

-- Cada pregunta pertenece a un banco. Se agrega primero como columna
-- opcional para poder reubicar las preguntas que ya existieran.
alter table public.preguntas
  add column if not exists banco_id uuid references public.bancos(id) on delete cascade;

-- Si algún profesor ya tenía preguntas sueltas, se le crea un
-- "Banco general" y se le asignan todas, para no perder nada.
do $$
declare
  r record;
  v_banco uuid;
begin
  for r in select distinct profesor_id from public.preguntas where banco_id is null loop
    insert into public.bancos (profesor_id, nombre, descripcion)
    values (r.profesor_id, 'Banco general',
            'Preguntas creadas antes de poder dividir el banco en varios.')
    returning id into v_banco;

    update public.preguntas
       set banco_id = v_banco
     where profesor_id = r.profesor_id and banco_id is null;
  end loop;
end $$;

alter table public.preguntas alter column banco_id set not null;
create index if not exists preguntas_banco_id_idx on public.preguntas (banco_id);

-- La policy del banco de preguntas ahora exige además que el banco de
-- destino sea del propio profesor (evita colgar una pregunta de un
-- banco ajeno). Leer "bancos" aquí no genera recursión: la policy de
-- bancos no consulta preguntas.
drop policy if exists "El profesor gestiona su propio banco de preguntas" on public.preguntas;
create policy "El profesor gestiona su propio banco de preguntas"
  on public.preguntas for all
  using (auth.uid() = profesor_id)
  with check (
    auth.uid() = profesor_id
    and public.es_profesor()
    and exists (select 1 from public.bancos b where b.id = banco_id and b.profesor_id = auth.uid())
  );
