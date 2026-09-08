-- Quién revisa las encuestas de una clasificación
-- ------------------------------------------------------------------
-- Nombrar revisores encuesta por encuesta obliga a repetir la misma lista en
-- cada una de las de «Seguridad», y a acordarse de ponerla en la siguiente que
-- se cree. Quien imparte una clasificación la imparte entera, así que aquí se
-- dice una sola vez y todas sus encuestas lo heredan.
--
-- La precedencia es la que ya suponía el código: una encuesta que nombra a sus
-- propios revisores en `evaluations.reviewer_employees` se queda con ellos; la
-- que no nombra a nadie hereda los de su clasificación; y sin unos ni otros la
-- califica el jefe inmediato, que es lo de siempre.
--
-- La clasificación es texto libre —cada encuesta escribe la suya, no hay
-- catálogo—, así que la llave es el nombre normalizado
-- (`window.normalizarClasificacion`: sin espacios de sobra y en mayúsculas).
-- `nombre` guarda cómo se escribió la última vez, sólo para enseñarlo.
--
-- Una clasificación sin fila aquí —o con la lista vacía— no nombra a nadie, y
-- sus encuestas vuelven al jefe inmediato.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. La aplicación aguanta
-- mientras no se haya corrido: sin la tabla los revisores siguen siendo cosa
-- de cada encuesta y la pantalla avisa de qué script falta.

create table if not exists public.clasificaciones_revisores (
    clave           text primary key,
    nombre          text not null,
    revisores       jsonb not null default '[]'::jsonb,
    actualizado_en  timestamptz not null default now()
);

comment on table public.clasificaciones_revisores is
    'Quién revisa las encuestas de cada clasificación. La encuesta que nombra revisores propios manda sobre esto.';
comment on column public.clasificaciones_revisores.clave is
    'Nombre de la clasificación normalizado: sin espacios de sobra y en mayúsculas.';
comment on column public.clasificaciones_revisores.revisores is
    'Arreglo de ids de empleado, como `evaluations.reviewer_employees`.';

alter table public.clasificaciones_revisores enable row level security;

-- La aplicación no usa el login de Supabase —la sesión vive en localStorage—,
-- así que todo va con la clave `anon`; es el mismo trato que el resto de las
-- tablas. Quién puede tocarlo lo decide el modo administrador en la pantalla.
drop policy if exists "clasificaciones_revisores_lectura" on public.clasificaciones_revisores;
create policy "clasificaciones_revisores_lectura"
    on public.clasificaciones_revisores for select
    to anon, authenticated
    using (true);

drop policy if exists "clasificaciones_revisores_alta" on public.clasificaciones_revisores;
create policy "clasificaciones_revisores_alta"
    on public.clasificaciones_revisores for insert
    to anon, authenticated
    with check (true);

drop policy if exists "clasificaciones_revisores_cambio" on public.clasificaciones_revisores;
create policy "clasificaciones_revisores_cambio"
    on public.clasificaciones_revisores for update
    to anon, authenticated
    using (true)
    with check (true);
