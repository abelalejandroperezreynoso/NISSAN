-- Bucket para las fotografías de las encuestas
-- ------------------------------------------------------------------
-- Una pregunta de evidencia fotográfica se contesta con una foto: su enunciado
-- dice qué hay que fotografiar y su respuesta es la URL de lo que se subió.
-- La aplicación la encoge a 600px de lado y la comprime antes de subirla, así
-- que cada una pesa unas decenas de KB: la cuenta es gratuita y una foto de
-- teléfono sin tocar son varios MB.
--
-- La URL se guarda dentro de `answers_json`, bajo el id de su pregunta, así
-- que aquí no hay ninguna columna que crear. Lo único que hace falta es el
-- bucket y sus permisos.
--
-- Aquí vivieron también las fotos del área de las encuestas «por área», bajo
-- la llave `__foto_area`. Ese campo se quitó —lo que haya que fotografiar se
-- pide con una pregunta de evidencia, que sirve en cualquier encuesta— y las
-- que ya se subieron siguen en este bucket: la pantalla de calificar las
-- enseña al abrir esas respuestas.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Sin correrlo, la
-- fotografía se toma y se encoge igual pero al enviar avisa de que falta el
-- bucket, y el resto de la aplicación sigue funcionando.
--
-- Ojo con los permisos: esta aplicación no usa el login de Supabase —la sesión
-- vive en localStorage—, así que todas sus peticiones van con la clave `anon`.
-- Por eso las políticas nombran a `anon`; es el mismo trato que ya tiene el
-- bucket `fotos-refacciones`.

insert into storage.buckets (id, name, public)
values ('fotos-evaluaciones', 'fotos-evaluaciones', true)
on conflict (id) do nothing;

-- Lectura pública: la foto se enseña con su `publicUrl` al calificar.
drop policy if exists "fotos_evaluaciones_lectura" on storage.objects;
create policy "fotos_evaluaciones_lectura"
    on storage.objects for select
    using (bucket_id = 'fotos-evaluaciones');

-- Alta desde la aplicación.
drop policy if exists "fotos_evaluaciones_alta" on storage.objects;
create policy "fotos_evaluaciones_alta"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'fotos-evaluaciones');

-- Reemplazo: la subida va con upsert, que necesita poder actualizar.
drop policy if exists "fotos_evaluaciones_reemplazo" on storage.objects;
create policy "fotos_evaluaciones_reemplazo"
    on storage.objects for update
    to anon, authenticated
    using (bucket_id = 'fotos-evaluaciones')
    with check (bucket_id = 'fotos-evaluaciones');

-- A propósito no se da permiso de borrado: una foto es la constancia de cómo
-- estaba el área ese día y nadie debería poder quitarla desde la aplicación.
