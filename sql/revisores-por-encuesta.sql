-- Revisores propios de una encuesta
-- ------------------------------------------------------------------
-- Por defecto, una respuesta la califica el jefe inmediato de quien la
-- contestó: no hay ninguna columna que lo diga, la regla la sostiene el
-- código. Esta columna permite que una encuesta concreta nombre a sus propios
-- revisores; cuando los tiene, deja de ser cosa del jefe inmediato.
--
-- Guarda una lista de `employees.id`. Vacía o nula significa lo de siempre: el
-- jefe inmediato. Es la misma forma que ya tiene `target_employees`, y por eso
-- se crea con su mismo tipo en vez de darlo por supuesto: en unas bases es
-- `jsonb` y en otras `text[]`, y el código lee las dos.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. La aplicación aguanta
-- mientras no se haya corrido: sin la columna, todo se comporta como antes
-- —revisa el jefe inmediato— y la hoja de la encuesta avisa de que la opción
-- todavía no está disponible.

do $$
declare
    tipo_destinatarios text;
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'reviewer_employees'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.reviewer_employees ya existe; no se toca.';
        return;
    end if;

    select format_type(a.atttypid, a.atttypmod)
      into tipo_destinatarios
      from pg_attribute a
     where a.attrelid = 'public.evaluations'::regclass
       and a.attname  = 'target_employees'
       and a.attnum   > 0
       and not a.attisdropped;

    -- Si la base no tuviera `target_employees` —no debería pasar—, jsonb es lo
    -- que el código escribe cuando le dejan elegir.
    if tipo_destinatarios is null then
        tipo_destinatarios := 'jsonb';
    end if;

    execute format(
        'alter table public.evaluations add column reviewer_employees %s',
        tipo_destinatarios
    );

    raise notice 'Columna evaluations.reviewer_employees creada como %', tipo_destinatarios;
end $$;

comment on column public.evaluations.reviewer_employees is
    'Lista de employees.id que califican las respuestas de esta encuesta. Vacía o nula: la califica el jefe inmediato de quien contestó.';
