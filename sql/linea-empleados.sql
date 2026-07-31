-- Línea (y planta) del empleado
-- ------------------------------------------------------------------
-- Liga cada empleado a una línea de producción. La planta NO se guarda
-- en employees: se deduce de la línea a través de lineas.planta_id, así
-- las dos no pueden contradecirse. Si una línea cambia de planta, sus
-- empleados la siguen sin tocar nada.
--
-- La segunda parte (planta_id en lineas) sólo hace algo si esa columna
-- todavía no existe; si ya la tienes, no la altera. Revisa después que
-- todas las líneas apunten a su planta: las que estén en null salen en
-- la aplicación como "sin planta asignada".
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

alter table public.employees
    add column if not exists linea_id bigint references public.lineas(id) on delete set null;

comment on column public.employees.linea_id is
    'Línea a la que está asignado el empleado; la planta se deduce de lineas.planta_id.';

create index if not exists employees_linea_id_idx
    on public.employees (linea_id);

alter table public.lineas
    add column if not exists planta_id bigint references public.plantas(id) on delete set null;

create index if not exists lineas_planta_id_idx
    on public.lineas (planta_id);

-- Para revisar qué líneas se quedaron sin planta:
-- select id, nombre from public.lineas where planta_id is null order by nombre;
