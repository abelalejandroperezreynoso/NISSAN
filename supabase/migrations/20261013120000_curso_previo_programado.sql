-- Curso previo: cuando alguien no lo ha tomado, el pendiente pasa a su jefe
-- ------------------------------------------------------------------
-- Una encuesta puede exigir un curso antes de contestarla (la pregunta «🎓
-- Curso previo requerido»). Hasta aquí, quien contestaba «Todavía no» se
-- quedaba con un pendiente que no dependía de él: nadie le había impartido el
-- curso, y la encuesta seguía saliéndole en rojo sin manera de quitársela.
--
-- Con esta tabla ese «no» se guarda y el pendiente cambia de dueño:
--
--   esperando   contestó que no lo ha tomado. A él no le sale como pendiente;
--               a su **jefe inmediato** le sale «Programar curso».
--   programado  su jefe le puso fecha y hora. La encuesta le vuelve a salir,
--               diciendo cuándo es el curso.
--   tomado      contestó la encuesta diciendo que sí lo tomó. La fila ya no
--               decide nada; se queda como registro.
--
-- Si al volver a abrirla dice otra vez que no, la fila vuelve a «esperando» y
-- `fecha_fallida` guarda el curso que se le había programado, para que su jefe
-- vea que no lo tomó.
--
-- **Es por encuesta, no por curso**: dos encuestas que pidan el mismo curso se
-- programan cada una por su lado.
--
-- **No cambia el padrón**: quien espera el curso sigue contando como asignado y
-- sin contestar en las estadísticas de la encuesta, que es lo que mide el
-- avance de todos los asignados.
--
-- Ejecutar en el SQL Editor de Supabase; se puede correr las veces que haga
-- falta. Sin correrlo todo se comporta como antes: el «Todavía no» no se guarda
-- y la encuesta le sigue saliendo a quien no tiene el curso.

create table if not exists public.cursos_previos (
    evaluation_id     text not null,
    employee_id       text not null,
    estado            text not null default 'esperando'
                      check (estado in ('esperando', 'programado', 'tomado')),
    fecha_programada  timestamptz,
    instructor        text,
    programado_por    text,
    fecha_fallida     timestamptz,
    actualizado_en    timestamptz not null default now(),
    primary key (evaluation_id, employee_id)
);

create index if not exists cursos_previos_encuesta
    on public.cursos_previos (evaluation_id);

comment on table public.cursos_previos is
    'Quién dijo que no ha tomado el curso que exige una encuesta, y cuándo se lo programó su jefe.';
comment on column public.cursos_previos.estado is
    'esperando: su jefe tiene que programarle el curso. programado: ya tiene fecha. tomado: contestó la encuesta con el curso.';
comment on column public.cursos_previos.fecha_fallida is
    'El curso que se le había programado y no tomó: lo pone un segundo «Todavía no».';

alter table public.cursos_previos enable row level security;

-- Todo va con la clave `anon`, como el resto de las tablas: la sesión de la
-- aplicación vive en localStorage y no en el login de Supabase. Escriben dos
-- personas distintas —quien dice que no lo ha tomado y su jefe, que lo
-- programa—, así que hacen falta alta y cambio.
drop policy if exists "cursos_previos_lectura" on public.cursos_previos;
create policy "cursos_previos_lectura"
    on public.cursos_previos for select
    to anon, authenticated
    using (true);

drop policy if exists "cursos_previos_alta" on public.cursos_previos;
create policy "cursos_previos_alta"
    on public.cursos_previos for insert
    to anon, authenticated
    with check (true);

drop policy if exists "cursos_previos_cambio" on public.cursos_previos;
create policy "cursos_previos_cambio"
    on public.cursos_previos for update
    to anon, authenticated
    using (true)
    with check (true);

-- El borrado hace falta para barrer el historial de un empleado que se elimina
-- (`window.RASTROS_DEL_EMPLEADO`).
drop policy if exists "cursos_previos_borrado" on public.cursos_previos;
create policy "cursos_previos_borrado"
    on public.cursos_previos for delete
    to anon, authenticated
    using (true);
