-- La clave de la API de Anthropic del asistente, guardada en la base para
-- usarla desde cualquier aparato del administrador.
--
-- **Nadie lee la tabla directamente.** La clave `anon` está escrita en
-- 1-config.js —la ve cualquiera que abra la aplicación—, y la contraseña de
-- administrador también vive en el código, así que ninguna de las dos protege
-- nada. Por eso la tabla lleva RLS sin ninguna política y sin permisos para
-- `anon` ni `authenticated`, y sólo se entra por cuatro funciones
-- `security definer`:
--
--   estado_clave_asistente()                 si la hay, su huella y desde cuándo
--   guardar_clave_asistente(clave, frase, frase_actual)
--   obtener_clave_asistente(frase)           la clave, sólo con la frase buena
--   borrar_clave_asistente()                 la quita de la base
--
-- La frase de acceso no está en el código ni en la base: se guarda su hash
-- bcrypt (pgcrypto). Una frase equivocada espera un segundo antes de
-- contestar, que es lo que frena a quien la intente adivinar a ciegas.
--
-- **Borrar no pide la frase**, a propósito: quitar la clave es el sentido
-- seguro —es lo que se hace cuando se sospecha que se filtró— y no puede
-- quedarse bloqueado por haber olvidado la frase. Reemplazarla sí la pide: si
-- no, cualquiera podría poner su propia clave y recibir las consultas.
--
-- Se puede correr las veces que haga falta.

create table if not exists public.asistente_clave (
    id smallint primary key default 1 check (id = 1),
    clave text not null,
    hash_frase text not null,
    huella text not null,
    guardada_en timestamptz not null default now()
);

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
create function public.guardar_clave_asistente(p_clave text, p_frase text, p_frase_actual text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_hash text;
    v_huella text;
begin
    if p_clave is null or p_clave !~ '^sk-ant-' or length(p_clave) < 20 then
        raise exception 'clave_invalida';
    end if;
    if p_frase is null or length(p_frase) < 8 then
        raise exception 'frase_corta';
    end if;

    select hash_frase into v_hash from public.asistente_clave where id = 1;
    if v_hash is not null and (p_frase_actual is null or crypt(p_frase_actual, v_hash) <> v_hash) then
        perform pg_sleep(1);
        raise exception 'frase_incorrecta';
    end if;

    v_huella := left(encode(digest(p_clave, 'sha256'), 'hex'), 12);

    insert into public.asistente_clave (id, clave, hash_frase, huella, guardada_en)
    values (1, p_clave, crypt(p_frase, gen_salt('bf', 10)), v_huella, now())
    on conflict (id) do update
        set clave = excluded.clave, hash_frase = excluded.hash_frase,
            huella = excluded.huella, guardada_en = excluded.guardada_en;

    return v_huella;
end;
$$;

drop function if exists public.obtener_clave_asistente(text);
create function public.obtener_clave_asistente(p_frase text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_fila public.asistente_clave%rowtype;
begin
    select * into v_fila from public.asistente_clave where id = 1;
    if not found then
        raise exception 'sin_clave';
    end if;
    if p_frase is null or crypt(p_frase, v_fila.hash_frase) <> v_fila.hash_frase then
        perform pg_sleep(1);
        raise exception 'frase_incorrecta';
    end if;
    return v_fila.clave;
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
revoke all on function public.guardar_clave_asistente(text, text, text) from public;
revoke all on function public.obtener_clave_asistente(text) from public;
revoke all on function public.borrar_clave_asistente() from public;
grant execute on function public.estado_clave_asistente() to anon, authenticated;
grant execute on function public.guardar_clave_asistente(text, text, text) to anon, authenticated;
grant execute on function public.obtener_clave_asistente(text) to anon, authenticated;
grant execute on function public.borrar_clave_asistente() to anon, authenticated;
