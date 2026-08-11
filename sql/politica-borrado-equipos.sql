-- Permiso de borrado en equipos
-- ------------------------------------------------------------------
-- El mapa de activos puede unir las altas repetidas de una máquina:
-- traslada las solicitudes a la que se queda y borra las sobrantes. El
-- traslado funciona y el borrado no, y encima no da error. PostgREST
-- responde con éxito a un delete que las políticas no permiten: borra
-- cero filas y contesta 200. Por eso la pantalla daba por hecho que los
-- duplicados se habían ido, y volvían a aparecer al recargar.
--
-- La causa es que las políticas de RLS son por operación. La tabla tiene
-- select, insert y update -de ahí que renombrar sí funcione- pero le
-- falta delete.
--
-- Antes de correr nada conviene mirar qué hay:
--
--   select relrowsecurity from pg_class where relname = 'equipos';
--
--   select policyname, cmd, roles, qual
--     from pg_policies
--    where tablename = 'equipos';
--
-- Si relrowsecurity sale false, la RLS está apagada y el problema es
-- otro: mira entonces la consulta de llaves foráneas del final.
--
-- OJO: la aplicación entra con la clave anónima, así que esta política
-- deja borrar equipos a cualquiera que tenga esa clave. Es el mismo
-- criterio con el que ya se borra de refacciones desde el panel, pero
-- conviene decidirlo a conciencia; si se prefiere restringir, cambia el
-- 'to anon, authenticated' por sólo 'authenticated'.
--
-- Ejecutar en el SQL Editor de Supabase.

drop policy if exists "equipos_delete" on public.equipos;

create policy "equipos_delete"
    on public.equipos
    for delete
    to anon, authenticated
    using (true);


-- ------------------------------------------------------------------
-- Consultas de apoyo (no hace falta ejecutarlas)
-- ------------------------------------------------------------------
-- Altas repetidas: la misma máquina dada de alta más de una vez en la
-- misma línea. Es justo lo que el mapa junta en un solo cuadro, con la
-- misma regla: manda el id_interno y, cuando falta, el nombre; los dos
-- normalizados sin espacios y en mayúsculas.
--
--   select linea_id,
--          coalesce(nullif(upper(trim(id_interno)), ''), upper(trim(nombre))) as maquina,
--          count(*) as altas,
--          array_agg(id order by id) as ids
--     from public.equipos
--    group by 1, 2
--   having count(*) > 1
--    order by altas desc;
--
-- Quién apunta a equipos, por si el borrado falla por una llave foránea
-- en lugar de por permisos. Desde el código sólo se ve refacciones.equipo_id.
--
--   select tc.table_name, kcu.column_name
--     from information_schema.table_constraints tc
--     join information_schema.key_column_usage kcu
--       on kcu.constraint_name = tc.constraint_name
--     join information_schema.constraint_column_usage ccu
--       on ccu.constraint_name = tc.constraint_name
--    where tc.constraint_type = 'FOREIGN KEY'
--      and ccu.table_name = 'equipos';
