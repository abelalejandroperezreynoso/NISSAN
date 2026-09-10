-- El material de una encuesta: las páginas de lo que hay que leer antes
-- ------------------------------------------------------------------
-- Una encuesta que imparte una capacitación —un dojo de mantenimiento, una
-- junta de seguridad— no se entiende sola: quien la contesta necesita antes la
-- presentación que se dio o el procedimiento en PDF. Hasta ahora eso viajaba
-- por WhatsApp y no quedaba pegado a la encuesta, así que quien la abría un mes
-- después no tenía de dónde sacarlo.
--
-- Es de la encuesta entera y no de una pregunta, y son varios archivos, así que
-- va en su propia tabla en lugar de en una columna: quitar uno no tiene que
-- reescribir los demás, y cada uno guarda de dónde salió y quién lo subió.
--
-- **Una fila es una PÁGINA, no un archivo.** Nada se guarda como PDF ni como
-- presentación: la aplicación los convierte en el teléfono, página a página, y
-- sube imágenes comprimidas —el bucket es de 1 GB para toda la aplicación y una
-- sola presentación con fotos se lleva decenas de MB—. Las páginas de un mismo
-- documento comparten el `nombre` original y viven en una carpeta suya dentro
-- del bucket (`<encuesta>/<documento>/001.webp`), y de ahí sale la agrupación
-- de la pantalla: **por eso no hizo falta ninguna columna nueva** cuando el
-- material pasó a convertirse. Lo que se subió antes de eso son archivos
-- sueltos, sin carpeta, y se siguen enseñando como el enlace que eran.
--
-- `evaluation_id` es texto y NO es llave foránea, como el resto de las columnas
-- que esta aplicación usa para apuntar a otra fila: así el script no depende
-- del tipo que tenga `evaluations.id`. Las encuestas no se borran —se apagan
-- con `active`—, así que no hay cascada que echar de menos.
--
-- `archivo` es la ruta dentro del bucket y es lo que hace falta para borrarlo;
-- `url` es su `publicUrl`, que es lo que abre el enlace. Se guardan las dos
-- porque de la URL pública no se puede volver a la ruta con seguridad.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Sin correrlo, la
-- aplicación no enseña el recuadro del material y avisa de qué falta a quien
-- intente subir algo; todo lo demás sigue igual.
--
-- Ojo con los permisos: esta aplicación no usa el login de Supabase —la sesión
-- vive en localStorage—, así que todas sus peticiones van con la clave `anon`.
-- Por eso las políticas nombran a `anon`. Quién puede subir y quitar lo decide
-- la pantalla: sólo el administrador y quien revisa la encuesta.

create table if not exists public.materiales_encuesta (
    id              bigserial primary key,
    evaluation_id   text not null,
    nombre          text not null,
    archivo         text not null,
    url             text not null,
    tipo            text,
    bytes           bigint,
    subido_por      text,
    subido_en       timestamptz not null default now()
);

create index if not exists materiales_encuesta_evaluacion
    on public.materiales_encuesta (evaluation_id);

comment on table public.materiales_encuesta is
    'El material de apoyo de una encuesta, una fila por página: las imágenes en que se convierten el PDF o la presentación que se leen antes de contestarla.';
comment on column public.materiales_encuesta.evaluation_id is
    'El id de la encuesta, en texto. No es llave foránea, como el resto de los apuntes de esta aplicación.';
comment on column public.materiales_encuesta.archivo is
    'La ruta dentro del bucket materiales-evaluaciones, con la forma <encuesta>/<documento>/<pagina>. La carpeta es lo que agrupa las paginas de un mismo documento, y la ruta entera es lo que hace falta para borrar el archivo.';
comment on column public.materiales_encuesta.url is
    'El publicUrl del archivo, que es lo que enseña el visor de imagenes.';
comment on column public.materiales_encuesta.subido_por is
    'El id del empleado que lo subió, para decirlo en la ficha del archivo.';

alter table public.materiales_encuesta enable row level security;

drop policy if exists "materiales_encuesta_lectura" on public.materiales_encuesta;
create policy "materiales_encuesta_lectura"
    on public.materiales_encuesta for select
    to anon, authenticated
    using (true);

drop policy if exists "materiales_encuesta_alta" on public.materiales_encuesta;
create policy "materiales_encuesta_alta"
    on public.materiales_encuesta for insert
    to anon, authenticated
    with check (true);

-- Las políticas van por operación, así que el borrado se da aparte: aquí sí
-- hace falta —a diferencia de las fotos de evaluación, que son constancia de
-- cómo estaba un área— porque quien imparte la encuesta tiene que poder
-- retirar una versión vieja de la presentación. Se borra el documento entero,
-- o sea todas las filas de su carpeta.
drop policy if exists "materiales_encuesta_baja" on public.materiales_encuesta;
create policy "materiales_encuesta_baja"
    on public.materiales_encuesta for delete
    to anon, authenticated
    using (true);


-- El bucket donde viven los archivos
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('materiales-evaluaciones', 'materiales-evaluaciones', true)
on conflict (id) do nothing;

-- Lectura pública: el enlace del recuadro es el `publicUrl` del archivo.
drop policy if exists "materiales_evaluaciones_lectura" on storage.objects;
create policy "materiales_evaluaciones_lectura"
    on storage.objects for select
    using (bucket_id = 'materiales-evaluaciones');

drop policy if exists "materiales_evaluaciones_alta" on storage.objects;
create policy "materiales_evaluaciones_alta"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'materiales-evaluaciones');

drop policy if exists "materiales_evaluaciones_reemplazo" on storage.objects;
create policy "materiales_evaluaciones_reemplazo"
    on storage.objects for update
    to anon, authenticated
    using (bucket_id = 'materiales-evaluaciones')
    with check (bucket_id = 'materiales-evaluaciones');

-- Y el borrado, por lo mismo que en la tabla: retirar una presentación vieja
-- tiene que llevarse también el archivo, o el bucket se llena de huérfanos.
drop policy if exists "materiales_evaluaciones_baja" on storage.objects;
create policy "materiales_evaluaciones_baja"
    on storage.objects for delete
    to anon, authenticated
    using (bucket_id = 'materiales-evaluaciones');
