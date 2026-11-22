-- Acceso con número de empleado y PIN
-- ----------------------------------
-- Hasta ahora se entraba con el nombre y el número de empleado, y la
-- comparación la hacía el navegador sobre la plantilla entera, que se bajaba
-- antes de iniciar sesión: cualquiera con la consola abierta tenía el «usuario»
-- y la «contraseña» de todo el mundo. Desde aquí:
--
--   · el usuario es el número de empleado y la contraseña un PIN de 4 dígitos;
--   · el PIN se guarda sólo como huella bcrypt, en una tabla que la aplicación
--     no puede leer, y se comprueba aquí dentro, en funciones `security definer`;
--   · cinco fallos seguidos bloquean la cuenta 15 minutos, y cada bloqueo
--     siguiente dura el doble (hasta 24 h), que es lo que hace aguantable un
--     PIN de cuatro cifras;
--   · al acertar se emite un token de sesión (se guarda sólo su sha256): es lo
--     que identifica ante la base a quien restablece el PIN de otro;
--   · la migración: quien todavía no tiene PIN entra una vez con su número —la
--     contraseña de antes— y ahí crea su PIN y deja su correo. El
--     administrador cierra ese camino con `acceso_ajustar` cuando quiera.
--
-- El correo vive en `credenciales.correo` y no en `employees`, que la clave de
-- la aplicación lee entera: así no queda a la vista de cualquiera.
--
-- Se puede correr las veces que haga falta.

-- ------------------------------------------------------------------ tablas

create table if not exists credenciales (
    employee_id     text primary key,
    pin_hash        text,
    pin_temporal    boolean not null default false,
    correo          text,
    intentos        integer not null default 0,
    bloqueos        integer not null default 0,
    bloqueado_hasta timestamptz,
    ultimo_acceso   timestamptz,
    creado_en       timestamptz not null default now(),
    actualizado_en  timestamptz not null default now()
);

create table if not exists sesiones (
    token_hash  text primary key,
    employee_id text not null,
    creada_en   timestamptz not null default now(),
    usada_en    timestamptz not null default now(),
    expira_en   timestamptz not null
);
create index if not exists sesiones_empleado on sesiones (employee_id);

create table if not exists credenciales_registro (
    id          bigserial primary key,
    employee_id text not null,
    accion      text not null,
    por         text,
    en          timestamptz not null default now()
);

-- Quién es administrador para la base. El modo administrador de la aplicación
-- es una contraseña escrita en el JavaScript, así que no puede ser lo que
-- autorice a restablecer el PIN de cualquiera.
create table if not exists administradores_acceso (
    employee_id text primary key,
    agregado_en timestamptz not null default now()
);
insert into administradores_acceso (employee_id) values ('163798') on conflict do nothing;

create table if not exists acceso_ajustes (
    id                integer primary key default 1 check (id = 1),
    acceso_por_numero boolean not null default true
);
insert into acceso_ajustes (id) values (1) on conflict do nothing;

alter table credenciales          enable row level security;
alter table sesiones              enable row level security;
alter table credenciales_registro enable row level security;
alter table administradores_acceso enable row level security;
alter table acceso_ajustes        enable row level security;

revoke all on credenciales, sesiones, credenciales_registro, administradores_acceso, acceso_ajustes
    from anon, authenticated;
revoke all on sequence credenciales_registro_id_seq from anon, authenticated;

-- ---------------------------------------------------------- ayudantes

-- El nombre con el que se compara: sin acentos, sin signos y con las palabras
-- ordenadas, que el orden de apellidos y nombres no es el mismo en todas partes.
create or replace function acceso_nombre_normal(p text) returns text
language sql immutable set search_path = public as $$
    select coalesce(string_agg(w, ' ' order by w), '')
    from unnest(regexp_split_to_array(
        trim(regexp_replace(
            translate(lower(coalesce(p, '')), 'áéíóúüñàèìòùäëïö', 'aeiouunaeiouaeio'),
            '[^a-z]+', ' ', 'g')),
        '\s+')) as w
    where w <> ''
$$;

-- null si el PIN vale; si no, por qué no. Sólo se pide que sea de 4 números.
create or replace function acceso_pin_debil(p_pin text, p_numero text) returns text
language plpgsql immutable set search_path = public as $$
begin
    if p_pin is null or p_pin !~ '^[0-9]{4}$' then return 'El PIN debe ser de 4 números.'; end if;
    return null;
end $$;

-- De quién es el token, o null. Alarga su uso.
create or replace function acceso_quien(p_token text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
    if p_token is null or length(p_token) < 32 then return null; end if;
    update sesiones set usada_en = now()
     where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expira_en > now()
     returning employee_id into v;
    return v;
end $$;

create or replace function acceso_es_admin(p_emp text) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from administradores_acceso where employee_id = p_emp)
$$;

-- Un intento fallido: cuenta y, al quinto, bloquea.
create or replace function acceso_fallo(p_emp text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v credenciales%rowtype;
begin
    insert into credenciales (employee_id) values (p_emp) on conflict do nothing;
    update credenciales set intentos = intentos + 1, actualizado_en = now()
     where employee_id = p_emp returning * into v;
    if v.intentos >= 5 then
        update credenciales
           set intentos = 0, bloqueos = bloqueos + 1,
               bloqueado_hasta = now() + least(interval '15 minutes' * power(2, bloqueos), interval '24 hours')
         where employee_id = p_emp returning * into v;
        insert into credenciales_registro (employee_id, accion) values (p_emp, 'bloqueo');
        return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'hasta', v.bloqueado_hasta);
    end if;
    return jsonb_build_object('ok', false, 'motivo', p_motivo, 'restantes', 5 - v.intentos);
end $$;

-- Emite la sesión y devuelve la ficha con la forma de `usuarioLogueado`.
create or replace function acceso_emitir(p_emp text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_token text := encode(gen_random_bytes(32), 'hex');
    v_cred  credenciales%rowtype;
    v_ficha jsonb;
begin
    delete from sesiones where expira_en < now();
    insert into sesiones (token_hash, employee_id, expira_en)
    values (encode(digest(v_token, 'sha256'), 'hex'), p_emp, now() + interval '30 days');
    select * into v_cred from credenciales where employee_id = p_emp;
    select jsonb_build_object(
        'name', e.name, 'id', e.employee_id, 'dept', e.department,
        'area', coalesce(a.nombre, 'Sin Área'), 'puesto', e.puesto,
        'supId', e.supervisor_id, 'sup', 'Sin Supervisor')
      into v_ficha
      from employees e left join areas a on a.id = e.area_id
     where e.employee_id = p_emp limit 1;
    return jsonb_build_object('ok', true, 'token', v_token, 'ficha', v_ficha,
        'temporal', coalesce(v_cred.pin_temporal, false),
        'sin_correo', v_cred.correo is null);
end $$;

-- ---------------------------------------------------------- las puertas

-- Entrar con número y PIN.
-- → { ok, token, ficha, temporal, sin_correo }
-- → { ok:false, motivo: 'incorrecto' | 'bloqueado' | 'sin_pin', … }
create or replace function acceso_iniciar(p_numero text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_num  text := trim(coalesce(p_numero, ''));
    v_act  boolean;
    v_cred credenciales%rowtype;
    v_abierto boolean;
begin
    select coalesce(is_active, true) into v_act from employees where employee_id = v_num limit 1;
    if not found or not v_act then return jsonb_build_object('ok', false, 'motivo', 'incorrecto'); end if;

    select * into v_cred from credenciales where employee_id = v_num;
    if v_cred.bloqueado_hasta is not null and v_cred.bloqueado_hasta > now() then
        return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'hasta', v_cred.bloqueado_hasta);
    end if;
    if v_cred.pin_hash is null then
        -- La primera vez se le enseña quién es ese número para que confirme
        -- que es él; sólo mientras la entrada por número esté abierta, y
        -- nunca de quien ya tiene PIN.
        v_abierto := coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true);
        return jsonb_build_object('ok', false, 'motivo', 'sin_pin', 'acceso_por_numero', v_abierto,
            'persona', case when v_abierto then (
                select jsonb_build_object('nombre', e.name, 'puesto', e.puesto, 'departamento', e.department)
                  from employees e where e.employee_id = v_num limit 1) end);
    end if;
    if trim(coalesce(p_pin, '')) = '' then
        return jsonb_build_object('ok', false, 'motivo', 'falta_pin');
    end if;
    if crypt(coalesce(p_pin, ''), v_cred.pin_hash) <> v_cred.pin_hash then
        return acceso_fallo(v_num, 'incorrecto');
    end if;

    update credenciales set intentos = 0, bloqueos = 0, bloqueado_hasta = null, ultimo_acceso = now()
     where employee_id = v_num;
    return acceso_emitir(v_num);
end $$;

-- La primera vez: número, PIN nuevo y correo.
create or replace function acceso_activar(p_numero text, p_nombre text, p_pin text, p_correo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_num    text := trim(coalesce(p_numero, ''));
    v_correo text := lower(trim(coalesce(p_correo, '')));
    v_emp    record;
    v_cred   credenciales%rowtype;
    v_debil  text;
begin
    select name, coalesce(is_active, true) as activo into v_emp from employees where employee_id = v_num limit 1;
    if not found or not v_emp.activo then return jsonb_build_object('ok', false, 'motivo', 'incorrecto'); end if;

    select * into v_cred from credenciales where employee_id = v_num;
    if v_cred.bloqueado_hasta is not null and v_cred.bloqueado_hasta > now() then
        return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'hasta', v_cred.bloqueado_hasta);
    end if;
    if v_cred.pin_hash is not null then return jsonb_build_object('ok', false, 'motivo', 'ya_tiene_pin'); end if;
    if not coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true) then
        return jsonb_build_object('ok', false, 'motivo', 'cerrado');
    end if;

    -- El nombre ya no se pide: el número era la contraseña de antes y el
    -- nombre, el usuario a la vista. Si llega —un teléfono con la versión
    -- anterior— se sigue comprobando.
    if acceso_nombre_normal(p_nombre) <> '' and acceso_nombre_normal(p_nombre) <> acceso_nombre_normal(v_emp.name) then
        return acceso_fallo(v_num, 'nombre');
    end if;

    v_debil := acceso_pin_debil(p_pin, v_num);
    if v_debil is not null then return jsonb_build_object('ok', false, 'motivo', 'pin_debil', 'mensaje', v_debil); end if;
    if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'motivo', 'correo'); end if;

    insert into credenciales (employee_id) values (v_num) on conflict do nothing;
    update credenciales
       set pin_hash = crypt(p_pin, gen_salt('bf', 8)), pin_temporal = false, correo = v_correo,
           intentos = 0, bloqueos = 0, bloqueado_hasta = null, ultimo_acceso = now(), actualizado_en = now()
     where employee_id = v_num;
    insert into credenciales_registro (employee_id, accion, por) values (v_num, 'activó', v_num);
    return acceso_emitir(v_num);
end $$;

-- Si la entrada por número sigue abierta: la pantalla de entrar enseña el
-- aviso de «¿Primera vez con PIN?» sólo entonces.
create or replace function acceso_estado() returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object('ok', true,
        'acceso_por_numero', coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true))
$$;

-- Cambiar el propio PIN (y dejar el correo si falta). Lo usa quien entró con
-- un PIN temporal y quien lo quiere cambiar.
create or replace function acceso_cambiar_pin(p_token text, p_pin text, p_correo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_emp    text := acceso_quien(p_token);
    v_correo text := lower(trim(coalesce(p_correo, '')));
    v_actual text;
    v_debil  text;
begin
    if v_emp is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
    v_debil := acceso_pin_debil(p_pin, v_emp);
    if v_debil is not null then return jsonb_build_object('ok', false, 'motivo', 'pin_debil', 'mensaje', v_debil); end if;

    select correo into v_actual from credenciales where employee_id = v_emp;
    if v_correo <> '' and v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('ok', false, 'motivo', 'correo');
    end if;
    if v_correo = '' and v_actual is null then return jsonb_build_object('ok', false, 'motivo', 'correo'); end if;

    insert into credenciales (employee_id) values (v_emp) on conflict do nothing;
    update credenciales
       set pin_hash = crypt(p_pin, gen_salt('bf', 8)), pin_temporal = false,
           correo = case when v_correo <> '' then v_correo else correo end,
           intentos = 0, bloqueado_hasta = null, actualizado_en = now()
     where employee_id = v_emp;
    insert into credenciales_registro (employee_id, accion, por) values (v_emp, 'cambió', v_emp);
    return jsonb_build_object('ok', true);
end $$;

-- Restablecer el PIN de otra persona: el administrador a cualquiera, y cada
-- jefe a la gente que tiene por debajo en la cadena de mando. Devuelve un PIN
-- temporal, que se le pide cambiar al entrar. Sirve también para quien
-- todavía no tenía PIN.
create or replace function acceso_restablecer(p_token text, p_objetivo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_quien  text := acceso_quien(p_token);
    v_obj    text := trim(coalesce(p_objetivo, ''));
    v_emp    record;
    v_puede  boolean;
    v_pin    text;
begin
    if v_quien is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
    select name, coalesce(is_active, true) as activo into v_emp from employees where employee_id = v_obj limit 1;
    if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
    if not v_emp.activo then return jsonb_build_object('ok', false, 'motivo', 'inactivo'); end if;
    if v_obj = v_quien then return jsonb_build_object('ok', false, 'motivo', 'propio'); end if;

    v_puede := acceso_es_admin(v_quien);
    if not v_puede then
        with recursive cadena as (
            select employee_id from employees where supervisor_id = v_quien
            union
            select e.employee_id from employees e join cadena c on e.supervisor_id = c.employee_id
        )
        select exists (select 1 from cadena where employee_id = v_obj) into v_puede;
    end if;
    if not v_puede then return jsonb_build_object('ok', false, 'motivo', 'sin_permiso'); end if;

    loop
        v_pin := lpad(((('x' || encode(gen_random_bytes(2), 'hex'))::bit(16)::int) % 10000)::text, 4, '0');
        exit when acceso_pin_debil(v_pin, v_obj) is null;
    end loop;

    insert into credenciales (employee_id) values (v_obj) on conflict do nothing;
    update credenciales
       set pin_hash = crypt(v_pin, gen_salt('bf', 8)), pin_temporal = true,
           intentos = 0, bloqueos = 0, bloqueado_hasta = null, actualizado_en = now()
     where employee_id = v_obj;
    delete from sesiones where employee_id = v_obj;
    insert into credenciales_registro (employee_id, accion, por) values (v_obj, 'restableció', v_quien);
    return jsonb_build_object('ok', true, 'pin', v_pin, 'nombre', v_emp.name);
end $$;

-- Comprobar el PIN de alguien sin abrirle sesión: es la hoja que pide la
-- contraseña a quien contesta su encuesta desde el teléfono de su jefe.
-- Mientras la migración siga abierta, quien no tiene PIN usa su número.
create or replace function acceso_verificar_pin(p_numero text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_num  text := trim(coalesce(p_numero, ''));
    v_act  boolean;
    v_cred credenciales%rowtype;
begin
    select coalesce(is_active, true) into v_act from employees where employee_id = v_num limit 1;
    if not found or not v_act then return jsonb_build_object('ok', false, 'motivo', 'incorrecto'); end if;
    select * into v_cred from credenciales where employee_id = v_num;
    if v_cred.bloqueado_hasta is not null and v_cred.bloqueado_hasta > now() then
        return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'hasta', v_cred.bloqueado_hasta);
    end if;
    if v_cred.pin_hash is null then
        if coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true) and trim(coalesce(p_pin, '')) = v_num then
            return jsonb_build_object('ok', true, 'por_numero', true);
        end if;
        return acceso_fallo(v_num, 'incorrecto');
    end if;
    if crypt(coalesce(p_pin, ''), v_cred.pin_hash) <> v_cred.pin_hash then
        return acceso_fallo(v_num, 'incorrecto');
    end if;
    update credenciales set intentos = 0, bloqueos = 0, bloqueado_hasta = null where employee_id = v_num;
    return jsonb_build_object('ok', true);
end $$;

create or replace function acceso_cerrar_sesion(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
    delete from sesiones where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- Cómo va la migración, para el administrador: quién ya tiene PIN, quién lo
-- tiene temporal, los correos recogidos y quién falta.
create or replace function acceso_resumen(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_quien text := acceso_quien(p_token);
begin
    if v_quien is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
    if not acceso_es_admin(v_quien) then return jsonb_build_object('ok', false, 'motivo', 'sin_permiso'); end if;
    return jsonb_build_object(
        'ok', true,
        'acceso_por_numero', coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true),
        'personas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', e.employee_id,
                'pin', c.pin_hash is not null,
                'temporal', coalesce(c.pin_temporal, false),
                'correo', c.correo,
                'bloqueado', c.bloqueado_hasta is not null and c.bloqueado_hasta > now(),
                'ultimo', c.ultimo_acceso))
            from employees e left join credenciales c on c.employee_id = e.employee_id
            where coalesce(e.is_active, true)), '[]'::jsonb));
end $$;

-- Abrir o cerrar la entrada por número de quien todavía no tiene PIN.
create or replace function acceso_ajustar(p_token text, p_acceso_por_numero boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_quien text := acceso_quien(p_token);
begin
    if v_quien is null then return jsonb_build_object('ok', false, 'motivo', 'sesion'); end if;
    if not acceso_es_admin(v_quien) then return jsonb_build_object('ok', false, 'motivo', 'sin_permiso'); end if;
    update acceso_ajustes set acceso_por_numero = coalesce(p_acceso_por_numero, true) where id = 1;
    insert into credenciales_registro (employee_id, accion, por)
    values (v_quien, case when p_acceso_por_numero then 'abrió el acceso por número' else 'cerró el acceso por número' end, v_quien);
    return jsonb_build_object('ok', true, 'acceso_por_numero', coalesce(p_acceso_por_numero, true));
end $$;

-- ---------------------------------------------------------- permisos

revoke execute on function acceso_nombre_normal(text), acceso_pin_debil(text, text), acceso_quien(text),
    acceso_es_admin(text), acceso_fallo(text, text), acceso_emitir(text)
    from public, anon, authenticated;

revoke execute on function acceso_estado() from public;
grant execute on function acceso_estado() to anon, authenticated;

revoke execute on function acceso_iniciar(text, text), acceso_activar(text, text, text, text),
    acceso_cambiar_pin(text, text, text), acceso_restablecer(text, text), acceso_verificar_pin(text, text),
    acceso_cerrar_sesion(text), acceso_resumen(text), acceso_ajustar(text, boolean)
    from public;
grant execute on function acceso_iniciar(text, text), acceso_activar(text, text, text, text),
    acceso_cambiar_pin(text, text, text), acceso_restablecer(text, text), acceso_verificar_pin(text, text),
    acceso_cerrar_sesion(text), acceso_resumen(text), acceso_ajustar(text, boolean)
    to anon, authenticated;
