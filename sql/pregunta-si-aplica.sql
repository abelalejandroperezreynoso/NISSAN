-- «¿Te aplica esta encuesta?»: que cada quien diga si le toca
-- ------------------------------------------------------------------
-- A una encuesta se dirige por puesto, por departamento o por nombre, y hay
-- casos donde ninguna de esas tres cosas lo sabe: quién trabaja en alturas,
-- quién maneja montacargas, quién opera una prensa. Esa lista no la tiene el
-- catálogo y sí la tiene cada persona, así que hasta aquí había que
-- preguntárselo por fuera —por WhatsApp, o recorriendo la planta— y escribirla
-- a mano en «A quién va dirigida», encuesta por encuesta y cada vez que alguien
-- cambia de trabajo.
--
-- Con la casilla «Pregunta si le aplica» del grupo «Opciones», la encuesta se
-- dirige como siempre —a toda la plantilla, a un puesto, a un departamento— y
-- eso pasa a ser la lista de **candidatos**: a cada uno le sale en sus
-- pendientes la pregunta, y su respuesta decide.
--
--   Sí  →  queda asignado y la encuesta se comporta como cualquier otra.
--   No  →  se le quita el pendiente y deja de contar como suya: no entra en su
--          panel, ni en el padrón de la encuesta, ni en sus estadísticas.
--
-- Son dos cosas y por eso hay dos piezas:
--
--   evaluations.pregunta_si_aplica   la casilla: esta encuesta pregunta.
--   evaluaciones_aplica              lo que contestó cada quien.
--
-- **La decisión va en su propia tabla y no en `target_employees`.** Escribir
-- ahí a quien dice que sí parecería lo natural —es la columna de a quién va
-- dirigida— y rompería la encuesta: una lista de nombres **manda sobre el
-- puesto y el departamento**, así que el primer «sí» de una encuesta dirigida a
-- «todo PRODUCCION» la congelaría en esa sola persona y nadie más volvería a
-- verla. Además aquí escribe cada empleado la suya, y una columna de la fila de
-- la encuesta la escriben todos a la vez: el último en guardar se llevaría por
-- delante lo que contestaron los demás. Una fila por persona no se pisa.
--
-- **No se pregunta por periodo, sino una vez.** Que la encuesta de alturas te
-- aplique es cosa de en qué trabajas, no del mes que corre: volver a
-- preguntarlo cada periodo sería un pendiente nuevo para repetir la misma
-- respuesta. Quien se equivoque —o cambie de trabajo— lo corrige desde la
-- pantalla de la encuesta, que le sigue saliendo en su lista.
--
-- Ejecutar en el SQL Editor de Supabase; se puede correr las veces que haga
-- falta, que la columna y la tabla se crean sólo si no están. Sin correrlo todo
-- se comporta como antes —la encuesta le toca a todos sus candidatos, sin
-- preguntar nada— y la casilla se queda apagada diciendo qué falta.

alter table public.evaluations
    add column if not exists pregunta_si_aplica boolean not null default false;

comment on column public.evaluations.pregunta_si_aplica is
    'Si es true, a quien la encuesta le podría tocar se le pregunta antes si le aplica, y sólo queda asignado quien diga que sí.';

-- Una fila por persona y encuesta. `employee_id` va en texto y sin llave
-- foránea, como el resto de los apuntes de esta aplicación; quien borra una
-- ficha barre también esto (`window.RASTROS_DEL_EMPLEADO`).
create table if not exists public.evaluaciones_aplica (
    evaluation_id   text not null,
    employee_id     text not null,
    aplica          boolean not null,
    decidido_en     timestamptz not null default now(),
    primary key (evaluation_id, employee_id)
);

create index if not exists evaluaciones_aplica_encuesta
    on public.evaluaciones_aplica (evaluation_id);

comment on table public.evaluaciones_aplica is
    'Quién dijo que una encuesta le aplica y quién dijo que no. Sólo la miran las encuestas con pregunta_si_aplica en true.';
comment on column public.evaluaciones_aplica.aplica is
    'true: queda asignado. false: deja de contar como suya. Sin fila: todavía no lo ha dicho, y ése es su pendiente.';

alter table public.evaluaciones_aplica enable row level security;

-- La aplicación no usa el login de Supabase —la sesión vive en localStorage—,
-- así que todo va con la clave `anon`, que es el mismo trato que el resto de
-- las tablas. La lectura es de todos porque el padrón de una encuesta hay que
-- poder calcularlo desde cualquier pantalla: las estadísticas, la
-- certificación y el pase de lista preguntan por la plantilla entera.
drop policy if exists "evaluaciones_aplica_lectura" on public.evaluaciones_aplica;
create policy "evaluaciones_aplica_lectura"
    on public.evaluaciones_aplica for select
    to anon, authenticated
    using (true);

drop policy if exists "evaluaciones_aplica_alta" on public.evaluaciones_aplica;
create policy "evaluaciones_aplica_alta"
    on public.evaluaciones_aplica for insert
    to anon, authenticated
    with check (true);

drop policy if exists "evaluaciones_aplica_cambio" on public.evaluaciones_aplica;
create policy "evaluaciones_aplica_cambio"
    on public.evaluaciones_aplica for update
    to anon, authenticated
    using (true)
    with check (true);

-- El borrado hace falta para dos cosas: barrer el historial de un empleado que
-- se elimina y devolver a alguien a «sin decidir» si hizo falta.
drop policy if exists "evaluaciones_aplica_borrado" on public.evaluaciones_aplica;
create policy "evaluaciones_aplica_borrado"
    on public.evaluaciones_aplica for delete
    to anon, authenticated
    using (true);
