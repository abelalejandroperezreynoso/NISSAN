-- Qué encuestas hay que certificar, y con qué mínimo
-- ------------------------------------------------------------------
-- Certificar es dar fe de que las respuestas de alguien son verídicas, y no
-- toda encuesta lo necesita: una de clima laboral o una de sugerencias se
-- contesta y ya está. Estas dos columnas lo deciden encuesta por encuesta:
--
--   requires_min_score      si hay que sacar el 80% para darla por buena
--   retry_days              cuántos días hay para reponerla si no lo alcanza
--
-- (`requires_certification` la creó una versión anterior de este script para
--  decidir por encuesta si contaba para certificar. Eso se decide ahora por
--  clasificación —ver `clasificaciones-certificacion.sql`—, así que la columna
--  ya no la lee nadie y se puede borrar.)
--
-- Una encuesta con `false` deja de contar en el avance de certificación de su
-- clasificación: no suma al total, no aparece como pendiente de certificar y
-- no impide que el resto se dé por certificado. Sus respuestas se siguen
-- contestando, calificando y contando en las estadísticas como cualquier otra.
--
-- Nula o `true` significa lo de siempre, así que todo lo que ya existe se
-- comporta igual.
--
-- `requires_min_score` en false deja certificar una respuesta ya calificada
-- con el puntaje que sea, para las encuestas que se contestan para dejar
-- constancia y no para aprobar. Nula o true: hace falta el 80% de siempre.
--
-- `retry_days` en 0 —el valor por defecto— se comporta como hasta ahora: una
-- respuesta por debajo del mínimo se queda como está. Con un número, a quien no
-- lo alcanzó le vuelve a salir la encuesta entre sus pendientes durante esos
-- días, contados desde que la envió.
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr las veces que haga
-- falta: cada columna se crea sólo si no está. La aplicación aguanta mientras
-- no se haya corrido: sin las columnas todas las encuestas se consideran
-- certificables y con mínimo —como hasta ahora— y las casillas de la hoja se
-- quedan marcadas y apagadas, avisando de qué script falta.

do $$
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'requires_certification'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.requires_certification ya existe; no se toca.';
        return;
    end if;

    execute 'alter table public.evaluations add column requires_certification boolean not null default true';

    raise notice 'Columna evaluations.requires_certification creada con default true';
end $$;

do $$
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'requires_min_score'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.requires_min_score ya existe; no se toca.';
        return;
    end if;

    execute 'alter table public.evaluations add column requires_min_score boolean not null default true';

    raise notice 'Columna evaluations.requires_min_score creada con default true';
end $$;

do $$
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'retry_days'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.retry_days ya existe; no se toca.';
        return;
    end if;

    execute 'alter table public.evaluations add column retry_days smallint not null default 0';

    raise notice 'Columna evaluations.retry_days creada con default 0';
end $$;

comment on column public.evaluations.requires_certification is
    'Si es false, esta encuesta no cuenta para certificar su clasificación. Nula o true: cuenta, que es lo de siempre.';

comment on column public.evaluations.requires_min_score is
    'Si es false, una respuesta calificada se puede certificar con cualquier puntaje. Nula o true: hace falta el 80%.';

comment on column public.evaluations.retry_days is
    'Días para volver a contestar la encuesta cuando la respuesta no alcanzó el mínimo. 0: no se pide repetirla.';
