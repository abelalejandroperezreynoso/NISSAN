-- Qué encuestas hay que certificar
-- ------------------------------------------------------------------
-- Certificar es dar fe de que las respuestas de alguien son verídicas, y no
-- toda encuesta lo necesita: una de clima laboral o una de sugerencias se
-- contesta y ya está. Esta columna permite apagarlo encuesta por encuesta.
--
-- Una encuesta con `false` deja de contar en el avance de certificación de su
-- clasificación: no suma al total, no aparece como pendiente de certificar y
-- no impide que el resto se dé por certificado. Sus respuestas se siguen
-- contestando, calificando y contando en las estadísticas como cualquier otra.
--
-- Nula o `true` significa lo de siempre, así que todo lo que ya existe se
-- comporta igual.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. La aplicación aguanta
-- mientras no se haya corrido: sin la columna todas las encuestas se
-- consideran certificables —como hasta ahora— y la casilla de la hoja se queda
-- marcada y apagada, avisando de qué script falta.

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

comment on column public.evaluations.requires_certification is
    'Si es false, esta encuesta no cuenta para certificar su clasificación. Nula o true: cuenta, que es lo de siempre.';
