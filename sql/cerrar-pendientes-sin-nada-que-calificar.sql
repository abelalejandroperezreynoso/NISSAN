-- Cerrar los pendientes de revisión que ya no tienen nada que calificar
-- ------------------------------------------------------------------
-- La evidencia fotográfica, la firma y el registro de asistencia dejan
-- constancia y no puntúan: no se aciertan ni se fallan, así que nadie tiene que
-- revisarlas. Desde ese cambio, una respuesta cuyas preguntas se califican
-- solas —una escala, unas opciones marcadas— y que además lleva una evidencia
-- se guarda ya `'Revisado'` al enviarse, y a su jefe inmediato no le aparece
-- ningún pendiente.
--
-- Pero `review_status` es una columna, no un cálculo: se escribe **al enviar la
-- respuesta** y nada la recalcula después. Las respuestas que se enviaron antes
-- del cambio se quedaron en `'Pendiente'` porque entonces la evidencia no
-- contaba como resuelta, y ahí siguen —pidiéndole a alguien que califique una
-- fotografía, que es justo lo que se vino a quitar—. Este script las cierra.
--
-- **Qué cierra, exactamente.** Sólo las respuestas en `'Pendiente'` a las que no
-- les queda ni una pregunta por calificar: se mira el cuestionario de su
-- encuesta y, de todo lo que NO es evidencia, firma ni asistencia, se comprueba
-- que ya tenga su nota dentro de `grades_json`. Si queda una sin nota —un texto,
-- una lista de memoria, unas opciones sin marcar— la respuesta no se toca: ahí
-- sí hay algo que decidir y su pendiente es legítimo.
--
-- **Lo que no toca, y a propósito:**
--
--   - **`'Mal Revisada'`.** Es el veredicto de una persona que miró la respuesta
--     y dijo que estaba mal revisada. Cerrarlo por lo alto se llevaría por
--     delante esa decisión, así que esas respuestas se quedan como están y se
--     resuelven a mano.
--   - **`grades_json`.** Lo que ya está calificado sigue calificado, incluidas
--     las notas que en su día se les escribieron a las evidencias y el
--     «correcto» automático de las asistencias. Borrarlas cambiaría puntajes
--     pasados —y podría tumbar una certificación ya dada—, y el historial de
--     esta aplicación no se reescribe. Lo que cambió es que no se escriben más.
--   - **Nada que no esté en `'Pendiente'`.** Lo certificado, lo anulado y lo ya
--     revisado se quedan igual.
--
-- Ejecutar en el SQL Editor de Supabase. **Se puede correr las veces que haga
-- falta**: la segunda vez no encuentra nada que cambiar. Y no hace falta
-- correrlo para que la aplicación funcione: sin él todo sigue en pie y el
-- rezago se va cerrando a mano, abriendo cada respuesta y pulsando «Guardar
-- Revisión» una vez.

-- ------------------------------------------------------------------
-- PASO 1 — Mirar primero qué se va a cerrar.
-- ------------------------------------------------------------------
-- Esto no cambia nada: lista las respuestas que el paso 2 pondría en
-- 'Revisado', con de quién son y de qué encuesta. Conviene leerlo antes: es la
-- única forma de ver que no se va a cerrar algo que sí había que calificar.

select r.id,
       e.title                as encuesta,
       r.employee_id,
       r.submitted_at,
       r.review_status
from   evaluation_responses r
join   evaluations e on e.id = r.evaluation_id
where  r.review_status = 'Pendiente'
and    not exists (
           select 1
           from   evaluation_questions q
           where  q.evaluation_id = r.evaluation_id
           and    coalesce(q.question_type, '') not in ('photo', 'signature', 'attendance', 'prerequisite')
           and    not jsonb_exists(coalesce(r.grades_json::jsonb, '{}'::jsonb), q.id::text)
       )
order  by r.submitted_at;

-- ------------------------------------------------------------------
-- PASO 2 — Cerrarlas.
-- ------------------------------------------------------------------
-- Es el mismo filtro del paso 1, palabra por palabra. Devuelve las filas que
-- cambió, así que la cuenta tiene que coincidir con la de arriba: si sale otra,
-- es que alguien contestó o calificó algo entre un paso y el otro, y conviene
-- volver a mirar el paso 1 antes que seguir.

update evaluation_responses r
set    review_status = 'Revisado'
where  r.review_status = 'Pendiente'
and    not exists (
           select 1
           from   evaluation_questions q
           where  q.evaluation_id = r.evaluation_id
           and    coalesce(q.question_type, '') not in ('photo', 'signature', 'attendance', 'prerequisite')
           and    not jsonb_exists(coalesce(r.grades_json::jsonb, '{}'::jsonb), q.id::text)
       )
returning r.id, r.evaluation_id, r.employee_id, r.submitted_at;
