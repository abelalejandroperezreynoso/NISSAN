-- Relanzar una encuesta
-- ------------------------------------------------------------------
-- Relanzar es volver a pedir una encuesta que la gente ya contestó: la
-- clasificación se repite, la capacitación se vuelve a dar, el evento se
-- celebra otra vez. Lo hace quien la revisa —el instructor que la imparte, que
-- es quien sabe cuándo toca repetirla— desde el panel de detalles de la
-- encuesta.
--
-- Y es **un instante, no un interruptor**, igual que `cierre_sesion_global` en
-- `system_config`: `relaunched_at` sella la hora en que se dio la orden, y toda
-- respuesta anterior a esa hora deja de contar como contestada, así que la
-- encuesta vuelve a salir entre los pendientes de todo el mundo. En cuanto cada
-- quien la contesta de nuevo, su respuesta es posterior al instante y el
-- pendiente se le cierra solo. Un interruptor encendido y olvidado dejaría a la
-- plantilla entera pidiendo la encuesta para siempre; un instante se agota
-- solo, y volver a relanzarla es adelantarlo.
--
-- Las respuestas anteriores **no se tocan**: siguen en el historial, en las
-- estadísticas y en lo que ya estuviera certificado. Lo único que cambia es que
-- ya no cierran el pendiente.
--
-- Nula —que es lo que hay en todas las encuestas que ya existen— significa que
-- nunca se relanzó, y todo se comporta como hasta ahora.
--
-- Ejecutar en el SQL Editor de Supabase. Se puede correr las veces que haga
-- falta: la columna se crea sólo si no está. La aplicación aguanta mientras no
-- se haya corrido: sin la columna, ninguna encuesta está relanzada y el botón
-- del panel de detalles avisa de qué script falta.

do $$
begin
    if exists (
        select 1
          from pg_attribute
         where attrelid = 'public.evaluations'::regclass
           and attname  = 'relaunched_at'
           and not attisdropped
    ) then
        raise notice 'La columna evaluations.relaunched_at ya existe; no se toca.';
        return;
    end if;

    execute 'alter table public.evaluations add column relaunched_at timestamptz';

    raise notice 'Columna evaluations.relaunched_at creada';
end $$;

comment on column public.evaluations.relaunched_at is
    'Instante en que se relanzó la encuesta. Las respuestas anteriores dejan de cerrar el pendiente. Nula: nunca se relanzó.';
