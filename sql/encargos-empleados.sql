-- Encargos extra de los empleados
-- ------------------------------------------------------------------
-- Añade a employees una columna para las responsabilidades adicionales
-- al puesto (Capacitación, Refaccionamiento, Seguridad…). Un empleado
-- puede tener varios, por eso es un arreglo de texto y no una columna
-- simple. No hay catálogo aparte: el panel de refacciones arma la lista
-- de encargos disponibles con los valores que ya existen en esta tabla,
-- igual que hace con puesto y departamento.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.

alter table public.employees
    add column if not exists encargos text[] not null default '{}'::text[];

comment on column public.employees.encargos is
    'Encargos extra al puesto: Capacitación, Refaccionamiento, Seguridad, etc.';

-- Índice GIN para poder filtrar por encargo sin recorrer la tabla entera,
-- por ejemplo: select * from employees where encargos @> array['Seguridad'];
create index if not exists employees_encargos_idx
    on public.employees using gin (encargos);
