-- Objetivos por clasificación
-- ------------------------------------------------------------------
-- Cada clasificación de encuestas puede llevar un objetivo, que es lo que se
-- le pide en el periodo. Hay tres tipos, y una clasificación lleva uno o
-- ninguno:
--
--   participacion   qué parte de la gente a la que le toca la contestó
--                   (meta: el porcentaje, p. ej. 100)
--   resultado       el resultado de la clasificación, con lo no contestado
--                   en cero (meta: el mínimo, p. ej. 80)
--   grupos          en cada grupo de jefe inmediato, al menos una persona
--                   llega al resultado mínimo (meta: ese mínimo, p. ej. 80)
--
-- La clasificación es texto libre, así que la llave es su nombre normalizado
-- (`window.normalizarClasificacion`), como en `clasificaciones_certificacion`
-- y `clasificaciones_revisores`. `nombre` guarda cómo se escribió la última
-- vez, sólo para enseñarlo.
--
-- Ejecutar en el SQL Editor de Supabase; se puede correr las veces que haga
-- falta. Sin la tabla la aplicación sigue igual: ninguna clasificación tiene
-- objetivo y la hoja de definirlo dice qué script falta.

create table if not exists public.clasificaciones_objetivo (
    clave           text primary key,
    nombre          text not null,
    tipo            text not null check (tipo in ('participacion', 'resultado', 'grupos')),
    meta            numeric not null check (meta > 0 and meta <= 100),
    actualizado_en  timestamptz not null default now()
);

comment on table public.clasificaciones_objetivo is
    'El objetivo de cada clasificación de encuestas. La que no tiene fila no tiene objetivo.';

alter table public.clasificaciones_objetivo enable row level security;

-- Todo va con la clave `anon`, como el resto de las tablas: quién lo puede
-- tocar lo decide el modo administrador en la pantalla.
drop policy if exists "clasificaciones_objetivo_lectura" on public.clasificaciones_objetivo;
create policy "clasificaciones_objetivo_lectura"
    on public.clasificaciones_objetivo for select
    to anon, authenticated using (true);

drop policy if exists "clasificaciones_objetivo_alta" on public.clasificaciones_objetivo;
create policy "clasificaciones_objetivo_alta"
    on public.clasificaciones_objetivo for insert
    to anon, authenticated with check (true);

drop policy if exists "clasificaciones_objetivo_cambio" on public.clasificaciones_objetivo;
create policy "clasificaciones_objetivo_cambio"
    on public.clasificaciones_objetivo for update
    to anon, authenticated using (true) with check (true);

drop policy if exists "clasificaciones_objetivo_baja" on public.clasificaciones_objetivo;
create policy "clasificaciones_objetivo_baja"
    on public.clasificaciones_objetivo for delete
    to anon, authenticated using (true);
