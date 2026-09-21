-- Quién revisó cada respuesta, y cuándo
-- ------------------------------------------------------------------
-- Una respuesta calificada dice qué sacó y en qué estado quedó, pero no quién
-- dio ese veredicto. Y esa firma hace falta para las tres cosas que se le piden
-- a una revisión:
--
--   - **Responder por ella.** Un «Mal Revisada» acusa a alguien sin decir a
--     quién, y una calificación generosa o injusta no tiene autor.
--   - **Auditar.** Con revisores nombrados y varios jefes, la respuesta la pudo
--     calificar cualquiera de ellos: sin el apunte no hay forma de saber cuál.
--   - **Medir.** «Avance de revisión» dice cuánto falta por calificar, pero no
--     quién lo está calificando.
--
--   reviewed_by   el employee_id de quien pulsó «Guardar Revisión»
--   reviewed_at   cuándo lo pulsó
--
-- **Nulas significan algo, y hay que saber leerlo**: que nadie ha guardado una
-- revisión de esa respuesta. Eso pasa en tres casos que la aplicación distingue
-- sin necesidad de otra columna (`window.selloDeRevision`):
--
--   - la que **se calificó sola** —toda su nota lleva `auto: true`, o no tiene
--     nota porque sólo deja constancia—: ahí no hay revisor que apuntar;
--   - la que **todavía no se ha revisado**, que además lo dice su
--     `review_status`;
--   - y la que **se revisó antes de correr este script**, que es lo que hay
--     guardado hoy. De ésas no se puede saber quién fue, y la pantalla lo dice
--     con esas palabras en vez de inventarse un nombre o dar por hecho que se
--     calificó sola.
--
-- **`reviewed_at` no es lo mismo que `submitted_at`**, y por eso se guarda: el
-- plazo de reintento se cuenta hoy desde el envío precisamente porque la base no
-- guardaba cuándo se calificó (ver CLAUDE.md).
--
-- **Cambiar el estado de una respuesta —anularla, certificarla, marcarla como
-- mal revisada— no toca estas dos columnas**, y es a propósito: «Mal Revisada»
-- significa que quien la calificó lo hizo mal, así que borrar ahí su nombre
-- sería quitar justo el dato que le da sentido al estado.
--
-- `reviewed_by` va en texto y sin llave foránea, como el resto de los apuntes de
-- esta aplicación; quien borra una ficha lo desliga (`window.RASTROS_DEL_EMPLEADO`,
-- en su mitad de `menciones`: la respuesta es de quien la contestó, no de quien
-- la revisó, así que la fila no se borra).
--
-- Ejecutar en el SQL Editor de Supabase; se puede correr las veces que haga
-- falta, que cada columna se crea sólo si no está. Sin correrlo todo se comporta
-- como antes: no se apunta a nadie y la pantalla no dice quién revisó.

alter table public.evaluation_responses
    add column if not exists reviewed_by text;

alter table public.evaluation_responses
    add column if not exists reviewed_at timestamptz;

create index if not exists evaluation_responses_revisor
    on public.evaluation_responses (reviewed_by);

comment on column public.evaluation_responses.reviewed_by is
    'employee_id de quien guardó la revisión. Nula: nadie la ha revisado, se calificó sola, o se revisó antes de que existiera esta columna.';
comment on column public.evaluation_responses.reviewed_at is
    'Cuándo se guardó la revisión. No es submitted_at: eso es cuándo se contestó.';
