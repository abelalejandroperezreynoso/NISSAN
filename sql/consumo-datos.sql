-- Cuántos datos se baja la aplicación cada mes
-- ------------------------------------------------------------------
-- La píldora de la esquina dice lo que lleva bajado **esta pantalla**, y se
-- apaga al recargar. Con eso no se puede contestar la única pregunta que
-- importa de esa cuota: si la aplicación entera va a pasarse de los 5 GB del
-- mes, que es la suma de lo que bajan todos los teléfonos y que cada uno, por
-- separado, no puede saber.
--
-- Esta tabla es esa suma. Cada aparato apunta lo suyo y lo manda cada tanto;
-- la pantalla de «Consumo» pide el ciclo ya sumado por día y dibuja cómo se va
-- acumulando contra la cuota, que es lo que avisa **antes** de llegar.
--
-- **Se puede correr las veces que haga falta**: la tabla se crea sólo si no
-- está y cada función se borra antes de crearse. `create or replace` sólo sirve
-- mientras la función no cambie de forma —en cuanto se le toca el `returns
-- table`, Postgres responde «42P13: cannot change return type of existing
-- function» y el script entero se queda sin correr, porque el editor de
-- Supabase lo envuelve en una transacción—. Los `grant` van al final, que un
-- `drop` se lleva los permisos por delante.
--
-- **Lo que se guarda es un aparato, no una persona.** `dispositivo` es un
-- identificador al azar que el navegador se inventa la primera vez y deja en
-- `localStorage`: no dice quién es, y por eso esta tabla **no entra en
-- `RASTROS_DEL_EMPLEADO`** ni hay que barrerla al eliminar a alguien. La
-- pregunta que contesta es cuánto gasta la aplicación, no quién.
--
-- Sin correr esto, todo sigue en pie: los teléfonos apuntan lo suyo igual —y lo
-- mandarán entero el día que exista la función—, la píldora funciona como
-- siempre y la tarjeta de la pantalla dice qué script falta.

create table if not exists public.consumo_datos (
    dispositivo     text        not null,
    dia             date        not null,
    bytes           bigint      not null default 0,
    actualizado_en  timestamptz not null default now(),
    primary key (dispositivo, dia)
);

comment on table public.consumo_datos is
    'Bytes bajados de Supabase, por aparato y día. Los escribe sumar_consumo().';

-- Por día, que es como se lee y como se pide.
create index if not exists consumo_datos_dia_idx on public.consumo_datos (dia);

alter table public.consumo_datos enable row level security;

-- **Nadie escribe la tabla directamente, ni siquiera para sumar.** Se entra por
-- `sumar_consumo`, que es `security definer` y lo único que sabe hacer es
-- sumarle a una fila: sin eso, cualquiera con la clave `anon` podría poner el
-- consumo del mes a cero y la pantalla diría que vamos sobrados.
drop policy if exists "consumo_datos lectura" on public.consumo_datos;
create policy "consumo_datos lectura" on public.consumo_datos
    for select using (true);

-- ------------------------------------------------------------------
-- SUMAR LO QUE UN APARATO SE BAJÓ
-- ------------------------------------------------------------------
-- Suma, nunca escribe un total: dos pestañas del mismo teléfono mandando a la
-- vez tienen que acabar sumadas, y un `update` con el total leído antes se
-- pisaría con el de la otra. El `on conflict` lo resuelve la base.
--
-- **El tope por llamada es una salvaguarda, no una medida**: 2 GB de una vez no
-- los baja ningún teléfono en un día, así que un número así sólo puede venir de
-- algo roto, y dejarlo entrar arruinaría la cifra del mes sin manera de saber
-- de dónde salió.
drop function if exists public.sumar_consumo(text, date, bigint);

create or replace function public.sumar_consumo(
    p_dispositivo text,
    p_dia         date,
    p_bytes       bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    if p_dispositivo is null or p_dispositivo = '' then return; end if;
    if p_bytes is null or p_bytes <= 0 or p_bytes > 2147483648 then return; end if;
    -- Ni el futuro ni hace un mes: lo que se reintenta lleva días, no meses.
    if p_dia is null or p_dia > current_date + 1 or p_dia < current_date - 60 then return; end if;

    -- Con alias: en un `on conflict do update`, la fila que ya estaba se nombra
    -- por el nombre con el que entró el `insert`, y calificarla con el esquema
    -- ahí es pedir problemas. `c` no deja lugar a dudas.
    insert into public.consumo_datos as c (dispositivo, dia, bytes)
    values (left(p_dispositivo, 64), p_dia, p_bytes)
    on conflict (dispositivo, dia) do update
        set bytes = c.bytes + excluded.bytes,
            actualizado_en = now();
end;
$$;

comment on function public.sumar_consumo(text, date, bigint) is
    'Le suma bytes a la fila de un aparato y un día, creándola si no está.';

-- ------------------------------------------------------------------
-- EL CICLO, YA SUMADO POR DÍA
-- ------------------------------------------------------------------
-- Una fila por día y no una por aparato y día: con ochenta teléfonos, el mes
-- son dos mil cuatrocientas filas, y traérselas al navegador para dibujar
-- treinta puntos es gastar en la consulta justo lo que se está midiendo. Aquí
-- son treinta filas.
--
-- `hasta` es **exclusivo**, como el fin del ciclo que calcula la aplicación.
drop function if exists public.consumo_por_dia(date, date);

create or replace function public.consumo_por_dia(p_desde date, p_hasta date)
returns table (dia date, bytes bigint, dispositivos integer)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select c.dia,
           sum(c.bytes)::bigint            as bytes,
           count(distinct c.dispositivo)::integer as dispositivos
      from public.consumo_datos c
     where c.dia >= p_desde
       and c.dia <  p_hasta
     group by c.dia
     order by c.dia
$$;

comment on function public.consumo_por_dia(date, date) is
    'Los bytes bajados por día en un rango, con cuántos aparatos los bajaron.';

grant execute on function public.sumar_consumo(text, date, bigint) to anon, authenticated;
grant execute on function public.consumo_por_dia(date, date)       to anon, authenticated;
