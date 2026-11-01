-- La clave de la API de Anthropic del asistente, guardada en la base para
-- usarla desde cualquier aparato del administrador.
--
-- Basta con haber entrado como administrador: la clave no lleva frase de
-- acceso. Hay que saber lo que eso significa: la clave `anon` y la contraseña
-- de administrador viven en el JavaScript de la aplicación, así que quien sepa
-- leer el código puede pedirle la clave a la base. Lo que sí se impide es leer
-- la tabla a pelo: lleva RLS sin ninguna política y sin permisos para `anon`
-- ni `authenticated`, y sólo se entra por cuatro funciones `security definer`:
--
--   estado_clave_asistente()           si la hay, su huella y desde cuándo
--   guardar_clave_asistente(clave)     la pone o la reemplaza; devuelve la huella
--   obtener_clave_asistente()          la clave
--   borrar_clave_asistente()           la quita de la base
--
-- Una clave que se sospeche filtrada se elimina desde el asistente y se revoca
-- además en console.anthropic.com.
--
-- La primera versión pedía una frase de acceso (columna `hash_frase` y
-- funciones con `p_frase`); este script la quita. Se puede correr las veces
-- que haga falta, haya pasado o no por aquella versión.

create table if not exists public.asistente_clave (
    id smallint primary key default 1 check (id = 1),
    clave text not null,
    huella text not null,
    guardada_en timestamptz not null default now()
);

alter table public.asistente_clave drop column if exists hash_frase;
alter table public.asistente_clave enable row level security;
revoke all on public.asistente_clave from anon, authenticated;

drop function if exists public.estado_clave_asistente();
create function public.estado_clave_asistente()
returns table (guardada boolean, huella text, guardada_en timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
    select true, c.huella, c.guardada_en from public.asistente_clave c where c.id = 1
    union all
    select false, null, null where not exists (select 1 from public.asistente_clave where id = 1);
$$;

drop function if exists public.guardar_clave_asistente(text, text, text);
drop function if exists public.guardar_clave_asistente(text);
create function public.guardar_clave_asistente(p_clave text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_huella text;
begin
    if p_clave is null or p_clave !~ '^sk-ant-' or length(p_clave) < 20 then
        raise exception 'clave_invalida';
    end if;

    v_huella := left(encode(digest(p_clave, 'sha256'), 'hex'), 12);

    insert into public.asistente_clave (id, clave, huella, guardada_en)
    values (1, p_clave, v_huella, now())
    on conflict (id) do update
        set clave = excluded.clave, huella = excluded.huella, guardada_en = excluded.guardada_en;

    return v_huella;
end;
$$;

drop function if exists public.obtener_clave_asistente(text);
drop function if exists public.obtener_clave_asistente();
create function public.obtener_clave_asistente()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_clave text;
begin
    select clave into v_clave from public.asistente_clave where id = 1;
    if not found then
        raise exception 'sin_clave';
    end if;
    return v_clave;
end;
$$;

drop function if exists public.borrar_clave_asistente();
create function public.borrar_clave_asistente()
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    delete from public.asistente_clave where id = 1;
    return found;
end;
$$;

revoke all on function public.estado_clave_asistente() from public;
revoke all on function public.guardar_clave_asistente(text) from public;
revoke all on function public.obtener_clave_asistente() from public;
revoke all on function public.borrar_clave_asistente() from public;
grant execute on function public.estado_clave_asistente() to anon, authenticated;
grant execute on function public.guardar_clave_asistente(text) to anon, authenticated;
grant execute on function public.obtener_clave_asistente() to anon, authenticated;
grant execute on function public.borrar_clave_asistente() to anon, authenticated;
