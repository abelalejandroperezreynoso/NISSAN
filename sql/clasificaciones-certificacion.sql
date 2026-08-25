-- Qué clasificaciones se certifican
-- ------------------------------------------------------------------
-- Certificar es de una clasificación entera, no de una encuesta suelta: se da
-- fe de que lo que contestó alguien en «Seguridad» durante el periodo es
-- verídico. Por eso lo que se decide aquí es la clasificación.
--
-- La clasificación es texto libre —cada encuesta escribe la suya, no hay
-- catálogo—, así que la llave es el nombre normalizado
-- (`window.normalizarClasificacion`: sin espacios de sobra y en mayúsculas).
-- `nombre` guarda cómo se escribió la última vez, sólo para enseñarlo.
--
-- Una clasificación que no está en esta tabla se certifica, que es lo de
-- siempre: aquí sólo hacen falta filas para las que se apaguen.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. La aplicación aguanta
-- mientras no se haya corrido: sin la tabla todas las clasificaciones se
-- certifican y el conmutador de la pantalla avisa de qué script falta.

create table if not exists public.clasificaciones_certificacion (
    clave           text primary key,
    nombre          text not null,
    requiere        boolean not null default true,
    actualizado_en  timestamptz not null default now()
);

comment on table public.clasificaciones_certificacion is
    'Qué clasificaciones de encuestas se certifican. La que no tiene fila aquí se certifica.';
comment on column public.clasificaciones_certificacion.clave is
    'Nombre de la clasificación normalizado: sin espacios de sobra y en mayúsculas.';

alter table public.clasificaciones_certificacion enable row level security;

-- La aplicación no usa el login de Supabase —la sesión vive en localStorage—,
-- así que todo va con la clave `anon`; es el mismo trato que el resto de las
-- tablas. Quién puede tocarlo lo decide el modo administrador en la pantalla.
drop policy if exists "clasificaciones_certificacion_lectura" on public.clasificaciones_certificacion;
create policy "clasificaciones_certificacion_lectura"
    on public.clasificaciones_certificacion for select
    to anon, authenticated
    using (true);

drop policy if exists "clasificaciones_certificacion_alta" on public.clasificaciones_certificacion;
create policy "clasificaciones_certificacion_alta"
    on public.clasificaciones_certificacion for insert
    to anon, authenticated
    with check (true);

drop policy if exists "clasificaciones_certificacion_cambio" on public.clasificaciones_certificacion;
create policy "clasificaciones_certificacion_cambio"
    on public.clasificaciones_certificacion for update
    to anon, authenticated
    using (true)
    with check (true);
