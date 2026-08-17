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
-- certificar en lote y el badge siguen funcionando.

create table if not exists public.certificaciones_clasificacion (
    id              uuid primary key default gen_random_uuid(),

    -- El nombre de la clasificación, normalizado (sin espacios de sobra y en
    -- mayúsculas). `evaluations.category` es texto libre con un datalist, así
    -- que sin normalizar «Seguridad» y «SEGURIDAD » serían dos grupos.
    clasificacion   text not null,

    employee_id     uuid not null references public.employees(id) on delete cascade,

    -- El periodo que cubre el acta. Una clasificación puede mezclar
    -- frecuencias, así que se guarda el periodo de la encuesta más frecuente,
    -- que es la que marca el ritmo con el que se revisa.
    periodo_inicio  date not null,
    periodo_fin     date,            -- nulo en las de una sola vez
    periodo_nombre  text,            -- «este mes», «este año»… tal como se vio

    certificado_por uuid references public.employees(id),
    certificado_en  timestamptz not null default now(),

    -- Cuántas respuestas cubrió el acta. Sirve para ver de un vistazo si una
    -- certificación vieja se quedó corta respecto a lo que hay hoy.
    respuestas_cubiertas int not null default 0,
    nota            text,

    -- Volver a certificar el mismo periodo actualiza el acta en lugar de
    -- apilar otra.
    unique (clasificacion, employee_id, periodo_inicio)
);

comment on table public.certificaciones_clasificacion is
    'Acta de certificación de una clasificación de encuestas para un empleado en un periodo.';

-- El panel del administrador consulta por clasificación y periodo; el del
-- usuario, por empleado.
create index if not exists certificaciones_clasificacion_empleado_idx
    on public.certificaciones_clasificacion (employee_id, clasificacion);

create index if not exists certificaciones_clasificacion_periodo_idx
    on public.certificaciones_clasificacion (clasificacion, periodo_inicio);

-- Ojo con RLS: PostgREST responde con éxito a un insert o un update que las
-- políticas rechazan, simplemente sin afectar filas. El código encadena
-- `.select()` y cuenta lo que vuelve, pero la tabla necesita sus políticas o
-- no se guardará nada y nadie se enterará.
alter table public.certificaciones_clasificacion enable row level security;

drop policy if exists certificaciones_lectura on public.certificaciones_clasificacion;
create policy certificaciones_lectura
    on public.certificaciones_clasificacion for select
    using (true);

drop policy if exists certificaciones_escritura on public.certificaciones_clasificacion;
create policy certificaciones_escritura
    on public.certificaciones_clasificacion for all
    using (true) with check (true);
