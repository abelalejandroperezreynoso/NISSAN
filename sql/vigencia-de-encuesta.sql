-- Desde cuándo aplica una encuesta
-- ------------------------------------------------------------------
-- Hasta aquí, una encuesta empezaba a contar el día que se dio de alta, y eso
-- no siempre es verdad.
--
-- La auditoría de septiembre se crea **copiando** la de agosto, así que su
-- `created_at` es de hoy aunque la auditoría lleve un año haciéndose: la
-- gráfica del panel la desvanece en todos los periodos de atrás —«todavía no
-- existía»— y el resumen la deja fuera, cuando lo que pasó es que se dio de
-- alta tarde. Al revés pasa lo mismo: una encuesta que se prepara en septiembre
-- para empezar en octubre ya se está pidiendo el día que se guarda.
--
--   vigente_desde     el instante a partir del cual cuenta la encuesta
--
-- Nula —el valor por defecto, y el de todo lo que ya existe— significa lo de
-- siempre: manda `created_at`. Con una fecha puesta, ésa manda sobre el alta en
-- los cuatro sitios donde la aplicación pregunta desde cuándo cuenta:
--
--   - si un periodo anterior le cobra su padrón o la desvanece, que es lo que
--     dibujan la gráfica y el resumen de la tarjeta del panel;
--   - la racha de «N periodos sin contestar» de un pendiente nunca contestado;
--   - los días que se tardó en contestarla, en las estadísticas;
--   - la fecha con la que sale su tarjeta en el panel de pendientes.
--
-- Y una fecha **en el futuro** hace además lo que dice: hasta que llegue, la
-- encuesta no le sale a nadie como pendiente. Sólo puede pasar poniéndola a
-- mano, porque un `created_at` nunca está por delante.
--
-- Es `timestamptz` y no `date` a propósito: la hoja guarda la medianoche local
-- de quien la escribe, así que el teléfono de quien la mire lee el mismo
-- instante aunque esté en otro huso.
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr las veces que haga
-- falta: la columna se crea sólo si no está. La aplicación aguanta mientras no
-- se haya corrido —sin la columna manda `created_at`, que es lo de siempre— y
-- el campo de la hoja se queda vacío y apagado, avisando de qué script falta.

do $$
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'vigente_desde'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.vigente_desde ya existe; no se toca.';
        return;
    end if;

    execute 'alter table public.evaluations add column vigente_desde timestamptz';

    raise notice 'Columna evaluations.vigente_desde creada (nula: manda created_at)';
end $$;

comment on column public.evaluations.vigente_desde is
    'Desde cuándo cuenta la encuesta. Nula: manda created_at, que es lo de siempre. Con fecha por delante, la encuesta todavía no sale como pendiente.';
