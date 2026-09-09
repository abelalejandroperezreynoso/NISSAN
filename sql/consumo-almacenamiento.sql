-- Cuánto ocupa el proyecto en Supabase
-- ------------------------------------------------------------------
-- La pantalla de «Consumo» necesita cuatro cosas que no se pueden preguntar
-- desde el cliente, porque viven en el catálogo de Postgres o en un esquema que
-- `anon` no alcanza. Todas son `security definer`, con el `search_path` fijado
-- —que es lo que hay que hacer siempre en una función así— y **sólo leen**.
--
-- Se puede correr las veces que haga falta: todas son `create or replace`.
--
--   tamano_base()       el peso del proyecto entero, que es lo que cobra
--                       Supabase y lo que enseña su página de uso
--   tamano_esquemas()   dónde está ese peso: public, storage, auth, realtime…
--   tamano_tablas()     las tablas de `public`, una por una
--   tamano_buckets()    los archivos, contados por la propia base
--
-- **Por qué `tamano_base` y no la suma de las tablas.** La primera versión de
-- esta pantalla sumaba `pg_total_relation_size` de las tablas de `public` y
-- decía 58 MB mientras la página de uso de Supabase decía 366. No era un fallo
-- de la cuenta: son dos cosas distintas. Supabase cobra el **tamaño del
-- archivo de base de datos entero**, que incluye los esquemas de sistema
-- —`storage`, `auth`, `realtime`, `extensions`…—, los catálogos y el espacio
-- que las filas borradas dejan sin devolver (el *bloat*), que en un proyecto
-- con mucha escritura es la mayor parte. `pg_database_size` es exactamente esa
-- cifra, así que ahora la pantalla dice lo mismo que Supabase y el desglose por
-- esquema enseña de dónde sale.
--
-- **Y por qué `tamano_buckets`.** Los archivos se pueden listar desde el
-- cliente —es lo que hacía la pantalla—, pero son miles de filas en varias
-- vueltas, y el `metadata.size` que devuelve la API es una copia de lo que hay
-- en `storage.objects`. Preguntárselo a la base es una consulta en lugar de
-- nueve, y es la misma cifra que Supabase suma para su página de uso: si las
-- dos no cuadran, la que manda es ésta.
--
-- Lo que exponen son nombres de esquema y de tabla y sus tamaños. En esta
-- aplicación eso no añade nada que no se supiera ya: la sesión vive en
-- localStorage y todas sus peticiones van con la clave `anon`, así que el
-- esquema público es legible de todos modos.

create or replace function public.tamano_base()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select pg_database_size(current_database())::bigint
$$;

comment on function public.tamano_base() is
    'El peso del proyecto entero, que es lo que enseña la página de uso de Supabase.';


-- **Sólo tablas: `r`, `p` y `m`.** `pg_total_relation_size` de una tabla ya
-- incluye sus índices y su tabla TOAST, así que darle además su propio renglón
-- a cada índice (`i`) y a cada toast (`t`) los cuenta dos veces. La primera
-- versión lo hacía y la suma de los esquemas daba 527 MB dentro de una base de
-- 334.8: un desglose cuya suma pasa del total no es un desglose. Por lo mismo
-- desaparece el esquema `pg_toast`, que nunca fue un sitio aparte donde se
-- guarde nada: es el desván de las tablas que ya están contadas.
create or replace function public.tamano_esquemas()
returns table (esquema text, bytes bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select n.nspname::text,
           sum(pg_total_relation_size(c.oid))::bigint
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p', 'm')
     group by n.nspname
    having sum(pg_total_relation_size(c.oid)) > 0
     order by 2 desc
$$;

comment on function public.tamano_esquemas() is
    'Dónde está el peso de la base: public, storage, auth, realtime, los catálogos…';


create or replace function public.tamano_tablas()
returns table (tabla text, bytes bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select c.relname::text,
           pg_total_relation_size(c.oid)::bigint
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by 2 desc
$$;

comment on function public.tamano_tablas() is
    'El peso de cada tabla pública con sus índices, para el desglose de la pantalla.';


-- `metadata->>'size'` es lo que Storage guarda de cada objeto y lo que devuelve
-- la API al listar. Un objeto sin ese dato cuenta como cero y se dice aparte,
-- que no es lo mismo que un archivo vacío.
--
-- **El valor se comprueba antes de convertirlo.** `metadata` es un jsonb libre y
-- un `size` que no sea un número entero —una cadena vacía, un decimal, lo que
-- dejara una versión vieja de Storage— hace fallar el `::bigint`, y eso no se
-- lleva por delante esa fila sino **la consulta entera**: la pantalla se queda
-- sin la cifra de todos los buckets por culpa de un archivo. Lo que no sea un
-- entero cuenta como sin medida, que es lo que de verdad es.
create or replace function public.tamano_buckets()
returns table (bucket text, archivos bigint, bytes bigint, sin_medida bigint)
language sql
stable
security definer
set search_path = pg_catalog, public, storage
as $$
    select o.bucket_id::text,
           count(*)::bigint,
           coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$'
                             then (o.metadata->>'size')::bigint end), 0)::bigint,
           count(*) filter (where coalesce(o.metadata->>'size', '') !~ '^[0-9]+$')::bigint
      from storage.objects o
     where o.name <> '.emptyFolderPlaceholder'
     group by o.bucket_id
     order by 3 desc
$$;

comment on function public.tamano_buckets() is
    'Los archivos de cada bucket contados por la base, que es la misma cifra que suma Supabase.';


revoke all on function public.tamano_base() from public;
revoke all on function public.tamano_esquemas() from public;
revoke all on function public.tamano_tablas() from public;
revoke all on function public.tamano_buckets() from public;

grant execute on function public.tamano_base() to anon, authenticated;
grant execute on function public.tamano_esquemas() to anon, authenticated;
grant execute on function public.tamano_tablas() to anon, authenticated;
grant execute on function public.tamano_buckets() to anon, authenticated;
