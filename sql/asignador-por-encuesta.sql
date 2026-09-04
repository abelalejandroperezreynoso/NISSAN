-- Quién dirigió la encuesta a cada persona
-- ------------------------------------------------------------------
-- Una encuesta puede nombrar a sus propios revisores
-- (`sql/revisores-por-encuesta.sql`), y esos revisores pueden además corregir
-- a quién va dirigida: son los instructores que la imparten y son quienes
-- saben a quién le falta tomarla.
--
-- Hasta ahora, la respuesta de cualquiera de esos destinatarios le aparecía
-- como pendiente de calificar a TODOS los revisores a la vez. Esta columna
-- apunta quién dirigió la encuesta a cada persona, y con eso la revisión de
-- esa respuesta es suya y de nadie más: a los demás revisores deja de salirles
-- el pendiente.
--
-- Guarda un objeto `{ "<employees.id>": "<employees.id del revisor>" }`. Vacío
-- o nulo significa lo de antes: la respuesta la puede calificar cualquiera de
-- los revisores. Un apunte deja de valer solo —sin tener que limpiar nada— en
-- cuanto quien asignó ya no es revisor de la encuesta.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. La aplicación aguanta
-- mientras no se haya corrido: sin la columna, todo se comporta como antes
-- —el pendiente se reparte entre todos los revisores— y la hoja de la encuesta
-- avisa de que falta este script.

do $$
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'assigned_by'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.assigned_by ya existe; no se toca.';
        return;
    end if;

    alter table public.evaluations add column assigned_by jsonb;

    raise notice 'Columna evaluations.assigned_by creada.';
end $$;

comment on column public.evaluations.assigned_by is
    'Objeto {idEmpleado: idRevisor} con quién dirigió la encuesta a cada persona. La respuesta de esa persona la califica quien la asignó; vacío o nulo, la califica cualquiera de los revisores de reviewer_employees.';
