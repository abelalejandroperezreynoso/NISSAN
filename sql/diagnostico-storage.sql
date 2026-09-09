-- ¿Por qué el esquema `storage` pesa lo que pesa?
-- ------------------------------------------------------------------
-- La pantalla de «Consumo» enseñó dos cosas que van juntas: el esquema
-- `storage` se lleva 264.6 MB de una base de 334.8 —el 79%— y `tamano_buckets()`
-- se cancela por tiempo agotado. Las dos son el mismo síntoma: `storage.objects`
-- describe 1735 archivos y pesa 156 KB por fila, así que recorrerlo entero no
-- cabe en el plazo que PostgREST le da a una consulta.
--
-- Una tabla de metadatos no pesa eso por sus datos. Lo que pesa es el espacio
-- que las filas borradas y actualizadas dejaron sin devolver —el *bloat*—: cada
-- archivo subido y quitado deja su fila muerta ocupando sitio hasta que alguien
-- la recoge, y el archivo de la tabla no encoge solo.
--
-- **Esto sólo mira, no cambia nada.** Antes de recuperar espacio hay que saber
-- si hay espacio que recuperar.

-- 1) Filas vivas contra filas muertas, y lo que ocupa la tabla.
--    `n_dead_tup` muy por encima de `n_live_tup` es exactamente el bloat.
select relname                                   as tabla,
       n_live_tup                                as filas_vivas,
       n_dead_tup                                as filas_muertas,
       pg_size_pretty(pg_table_size(relid))      as datos,
       pg_size_pretty(pg_indexes_size(relid))    as indices,
       pg_size_pretty(pg_total_relation_size(relid)) as total,
       last_vacuum, last_autovacuum
  from pg_stat_all_tables
 where schemaname = 'storage'
 order by pg_total_relation_size(relid) desc;

-- 2) Los archivos de verdad, por bucket. Es lo mismo que hace
--    `tamano_buckets()`, pero aquí no hay plazo que agotar: si tarda,
--    ya sabemos por qué se cancelaba desde la aplicación.
select bucket_id                                        as bucket,
       count(*)                                         as archivos,
       pg_size_pretty(coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$'
                                        then (metadata->>'size')::bigint end), 0)) as peso
  from storage.objects
 where name <> '.emptyFolderPlaceholder'
 group by bucket_id
 order by 2 desc;
