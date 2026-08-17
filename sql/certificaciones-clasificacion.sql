-- Certificaciones por clasificación
-- ------------------------------------------------------------------
-- Guarda el *acta* de una certificación: quién dio fe de que las respuestas
-- de una persona en una clasificación son verídicas, de qué periodo y cuándo.
--
-- Lo que NO hace es sustituir a `evaluation_responses.review_status`. Esa
-- columna sigue siendo la verdad de si una respuesta está certificada, y es la
-- que leen las estadísticas, los pendientes y el panel principal. Certificar
-- una clasificación sella esas respuestas una por una, igual que si se
-- hubieran marcado a mano; esta tabla sólo añade lo que antes no quedaba en
-- ningún lado: quién lo hizo, cuándo y con qué nota.
--
-- Por eso el badge que ve el usuario se sigue calculando de las respuestas: si
-- después se anula una, la clasificación deja de estar certificada aunque el
-- acta siga aquí, que es lo correcto para una auditoría.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. La aplicación aguanta
-- mientras no se haya corrido: sin la tabla no se guarda el acta, pero
-- certificar en lote y el badge siguen funcionando, y la pantalla avisa de que
-- no hubo constancia.

-- La tabla se crea dentro de un bloque porque `employee_id` tiene que ser del
-- mismo tipo que `employees.id`, y ese tipo se lee de la propia tabla en vez de
-- darlo por supuesto: si fuera `bigint` y aquí dijera `uuid`, la clave foránea
-- reventaría al ejecutar.
do $$
declare
    tipo_id text;
begin
    select format_type(a.atttypid, a.atttypmod)
      into tipo_id
      from pg_attribute a
     where a.attrelid = 'public.employees'::regclass
       and a.attname  = 'id'
       and a.attnum   > 0
       and not a.attisdropped;

    if tipo_id is null then
        raise exception 'No se encontró la columna public.employees.id';
    end if;

    execute format($f$
        create table if not exists public.certificaciones_clasificacion (
            id              uuid primary key default gen_random_uuid(),

            -- El nombre de la clasificación, normalizado (sin espacios de sobra
            -- y en mayúsculas). `evaluations.category` es texto libre con un
            -- datalist, así que sin normalizar «Seguridad» y «SEGURIDAD » serían
            -- dos grupos. Lo normaliza la aplicación antes de escribir.
            clasificacion   text not null,

            employee_id     %1$s not null references public.employees(id) on delete cascade,

            -- El periodo que cubre el acta. Una clasificación puede mezclar
            -- frecuencias, así que se guarda el de la encuesta más frecuente,
            -- que es la que marca el ritmo con el que se revisa. En las de una
            -- sola vez el inicio es 1970-01-01 y el fin queda nulo.
            periodo_inicio  date not null,
            periodo_fin     date,
            periodo_nombre  text,

            certificado_por %1$s references public.employees(id),
            certificado_en  timestamptz not null default now(),

            -- Cuántas respuestas cubrió el acta. Sirve para ver de un vistazo
            -- si una certificación vieja se quedó corta respecto a lo que hay.
            respuestas_cubiertas int not null default 0,
            nota            text,

            -- Volver a certificar el mismo periodo actualiza el acta en lugar
            -- de apilar otra. Es la clave que usa el `upsert` de la aplicación.
            unique (clasificacion, employee_id, periodo_inicio)
        )$f$, tipo_id);
end $$;

comment on table public.certificaciones_clasificacion is
    'Acta de certificación de una clasificación de encuestas para un empleado en un periodo.';

-- El panel del administrador consulta por clasificación y periodo; el del
-- usuario, por empleado.
create index if not exists certificaciones_clasificacion_empleado_idx
    on public.certificaciones_clasificacion (employee_id, clasificacion);

create index if not exists certificaciones_clasificacion_periodo_idx
    on public.certificaciones_clasificacion (clasificacion, periodo_inicio);

-- Ojo con RLS: PostgREST responde con éxito a un insert o un update que las
-- políticas rechazan, simplemente sin afectar filas. La aplicación encadena
-- `.select()` y cuenta lo que vuelve —así que te avisará—, pero la tabla
-- necesita sus políticas o no se guardará nada.
--
-- Estas dos son abiertas, como el resto de las tablas de la aplicación, que no
-- usa cuentas de Supabase Auth: la sesión se guarda en localStorage y quien
-- llega a esta pantalla ya pasó por el modo administrador. Si algún día se
-- ata a Auth, aquí es donde hay que apretar.
alter table public.certificaciones_clasificacion enable row level security;

drop policy if exists certificaciones_lectura on public.certificaciones_clasificacion;
create policy certificaciones_lectura
    on public.certificaciones_clasificacion for select
    using (true);

drop policy if exists certificaciones_escritura on public.certificaciones_clasificacion;
create policy certificaciones_escritura
    on public.certificaciones_clasificacion for all
    using (true) with check (true);

-- Comprobación: si todo fue bien, esto devuelve las columnas con sus tipos.
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'certificaciones_clasificacion'
--  order by ordinal_position;
