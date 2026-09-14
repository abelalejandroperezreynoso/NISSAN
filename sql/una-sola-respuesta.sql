-- Una sola respuesta por periodo
-- ------------------------------------------------------------------
-- Hay encuestas que se contestan **una vez y ya**: una firma de enterado de un
-- incidente, un pase de lista, un acta de capacitación. Ahí volver a
-- contestarla no añade nada y estropea lo que hay —quedan dos respuestas de la
-- misma persona y la que cuenta es la última, así que una segunda vuelta
-- descuidada tapa la buena—. La aplicación, en cambio, siempre le ofreció
-- «Volver a Responder» a quien ya había contestado, sin manera de impedirlo.
--
-- Con la casilla «Una sola respuesta» del grupo «Opciones» de la hoja de crear
-- y editar, a quien ya contestó deja de salirle el botón: en su lugar se le
-- dice que ya está contestada y se le lleva a su respuesta.
--
-- **Se cuenta por periodo, no por vida de la encuesta.** Una mensual con esto
-- puesto se contesta una vez al mes; una de «única vez» no tiene periodo
-- siguiente, así que ahí una es una y se acabó, que es el caso para el que se
-- hizo. Eso lo decide el código (`window.respuestaQueYaCuenta`), no la base.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase; se puede correr las veces
-- que haga falta, que la columna se crea sólo si no está. Sin correrlo todo se
-- comporta como antes —se puede volver a contestar siempre— y la casilla se
-- queda apagada diciendo qué falta.

alter table public.evaluations
    add column if not exists una_sola_respuesta boolean not null default false;

comment on column public.evaluations.una_sola_respuesta is
    'Si es true, a quien ya contestó en el periodo vigente no se le ofrece volver a contestarla.';
