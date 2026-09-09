-- Cuánto ocupa la base de datos, tabla por tabla
-- ------------------------------------------------------------------
-- La pantalla de «Consumo de almacenamiento» mide los archivos de los buckets
-- ella sola —los lista y suma su `metadata.size`—, pero el peso de la base no
-- se puede preguntar desde el cliente: hace falta `pg_total_relation_size`, y
-- eso vive en el catálogo de Postgres.
--
-- Esta función lo devuelve por tabla, incluyendo sus índices y su TOAST, que es
-- lo que de verdad ocupa. Va como `security definer` porque el catálogo no está
-- al alcance de `anon`, con el `search_path` fijado —que es lo que hay que hacer
-- siempre en una función así— y **sólo lee**: no hay nada que pueda escribir.
--
-- Lo que expone son los nombres de las tablas públicas y su tamaño. En esta
-- aplicación eso no añade nada que no se supiera ya: la sesión vive en
-- localStorage y todas sus peticiones van con la clave `anon`, así que el
-- esquema público es legible de todos modos.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Sin correrlo, la pantalla
-- enseña igual el consumo de los archivos y dice que falta este script para
-- poder medir la base.

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
    'El peso de cada tabla pública con sus índices, para la pantalla de consumo de almacenamiento.';

revoke all on function public.tamano_tablas() from public;
grant execute on function public.tamano_tablas() to anon, authenticated;
