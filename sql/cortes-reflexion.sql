-- El corte de las reflexiones de la junta
-- ------------------------------------------------------------------
-- La presentación de la junta se calcula al vuelo con el padrón de hoy, así que
-- la lista de quién presenta su reflexión podría cambiar entre la junta en que
-- se anunció y la junta en que se presenta. Esta tabla la deja fija: una fila
-- por periodo con los departamentos elegidos, quién presenta y por qué temas,
-- con las cifras que tenían en el corte.
--
-- El corte de un periodo se toma al terminar el martes siguiente —la junta es
-- lunes o martes—, y lo escribe la aplicación: el primer administrador que
-- abre la presentación desde ese momento y durante una semana. **No se
-- reescribe**: la política sólo deja leer e insertar, y la llave es el periodo.
-- Para rehacer un corte hay que borrar su fila desde el editor SQL.
--
--   modo      'semanal' o 'mensual', el corte de la presentación.
--   periodo   el día en que empieza el periodo evaluado (su lunes, o el día 1).
--   datos     { version, evaluado: { inicio, fin }, presentan: [{ nombre,
--             planta, promedio, responsable: { id, nombre }, temas: [{ clave,
--             nombre, cifra }] }] }
--
-- Ejecutar en el SQL Editor de Supabase; se puede correr las veces que haga
-- falta. Sin correrlo la minuta se calcula al vuelo y lo dice.

create table if not exists public.cortes_reflexion (
    modo       text not null check (modo in ('semanal', 'mensual')),
    periodo    date not null,
    datos      jsonb not null,
    tomado_en  timestamptz not null default now(),
    primary key (modo, periodo)
);

comment on table public.cortes_reflexion is
    'Quién presenta su reflexión en la junta, fijado al terminar el martes. No se reescribe.';

alter table public.cortes_reflexion enable row level security;

-- La aplicación no usa el login de Supabase: todo va con la clave `anon`.
drop policy if exists "cortes_reflexion_lectura" on public.cortes_reflexion;
create policy "cortes_reflexion_lectura"
    on public.cortes_reflexion for select
    to anon, authenticated
    using (true);

drop policy if exists "cortes_reflexion_alta" on public.cortes_reflexion;
create policy "cortes_reflexion_alta"
    on public.cortes_reflexion for insert
    to anon, authenticated
    with check (true);

-- Sin política de cambio ni de borrado, a propósito: un corte no se mueve.

grant select, insert on public.cortes_reflexion to anon, authenticated;
