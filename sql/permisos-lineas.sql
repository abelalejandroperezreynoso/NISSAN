-- Permiso para actualizar la planta de una línea
-- ------------------------------------------------------------------
-- La aplicación lee y da de alta líneas sin problema, pero el botón
-- "Asignar" de la ficha del empleado necesita ACTUALIZAR la fila de la
-- línea para grabarle su planta. Si la tabla tiene RLS activo y no hay
-- política de update, PostgREST responde que todo salió bien pero no
-- modifica nada: el cambio se pierde en silencio.
--
-- Ejecutar en el SQL Editor de Supabase.

-- ------------------------------------------------------------------
-- 1. Diagnóstico: ¿está activo RLS y qué políticas hay?
-- ------------------------------------------------------------------

select relname as tabla, relrowsecurity as rls_activo
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('lineas', 'plantas', 'employees');

select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('lineas', 'plantas', 'employees')
 order by tablename, cmd;

-- ------------------------------------------------------------------
-- 2. Permiso de actualización sobre lineas
-- ------------------------------------------------------------------
-- La aplicación entra siempre con la clave anónima (el inicio de sesión
-- se resuelve contra la tabla employees, no con Auth de Supabase), así
-- que el permiso tiene que dárselo al rol anon.

grant update on public.lineas to anon, authenticated;

drop policy if exists "lineas_actualizar" on public.lineas;

create policy "lineas_actualizar" on public.lineas
    for update
    to anon, authenticated
    using (true)
    with check (true);

-- ------------------------------------------------------------------
-- 3. Comprobación
-- ------------------------------------------------------------------
-- Cambia el 1 por el id de una línea sin planta y el 1 de planta_id por
-- el de una planta real. Debe devolver la fila ya modificada; si no
-- devuelve nada, el permiso sigue faltando.
--
-- update public.lineas set planta_id = 1 where id = 1 returning id, nombre, planta_id;

-- Qué líneas siguen sin planta:
-- select id, nombre from public.lineas where planta_id is null order by nombre;
