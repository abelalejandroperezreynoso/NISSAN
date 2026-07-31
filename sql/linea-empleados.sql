-- Líneas (y plantas) del empleado
-- ------------------------------------------------------------------
-- Un empleado puede atender varias líneas de producción, así que se
-- guarda una lista de ids en employees.lineas_ids. La planta NO se
-- guarda en employees: se deduce de cada línea a través de
-- lineas.planta_id, así las dos no pueden contradecirse y una línea que
-- cambie de planta se lleva a su gente sin tocar nada.
--
-- El script se puede correr varias veces sin miedo:
--   * la columna lineas_ids se crea sólo si falta;
--   * si quedó un linea_id de la primera versión de este archivo, se
--     traspasa su contenido a lineas_ids y esa columna se retira;
--   * planta_id en lineas sólo se añade si todavía no existe.
--
-- Revisa después qué líneas quedaron sin planta: las que estén en null
-- salen en la aplicación como "sin planta", y desde la ficha del
-- empleado se les puede asignar una sin salir de la pantalla.
--
-- Ejecutar en el SQL Editor de Supabase.

alter table public.employees
    add column if not exists lineas_ids bigint[] not null default '{}'::bigint[];

comment on column public.employees.lineas_ids is
    'Líneas que atiende el empleado; las plantas se deducen de lineas.planta_id.';

-- Índice GIN para poder preguntar quién atiende una línea sin recorrer la
-- tabla entera: select * from employees where lineas_ids @> array[3]::bigint[];
create index if not exists employees_lineas_ids_idx
    on public.employees using gin (lineas_ids);

-- Traspaso desde la columna de una sola línea, si es que llegó a crearse.
do $$
begin
    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'employees'
           and column_name = 'linea_id'
    ) then
        update public.employees
           set lineas_ids = array[linea_id]::bigint[]
         where linea_id is not null
           and (lineas_ids is null or lineas_ids = '{}'::bigint[]);

        alter table public.employees drop column linea_id;
    end if;
end $$;

-- La planta de cada línea. Si la columna ya existe, esto no la altera.
alter table public.lineas
    add column if not exists planta_id bigint references public.plantas(id) on delete set null;

create index if not exists lineas_planta_id_idx
    on public.lineas (planta_id);

-- Para revisar qué líneas se quedaron sin planta:
-- select id, nombre from public.lineas where planta_id is null order by nombre;
