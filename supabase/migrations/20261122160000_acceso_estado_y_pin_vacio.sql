-- Acceso con PIN: el aviso de «primera vez», el PIN vacío y sin nombre.
-- ----------------------------------------------------------------------
-- · `acceso_estado()` dice si la entrada por número sigue abierta, que es lo
--   único que necesita la pantalla de entrar para enseñar o no el aviso de
--   «¿Primera vez con PIN?». No dice nada de nadie.
-- · `acceso_iniciar` ya no cuenta como intento fallido un PIN vacío de quien
--   sí tiene PIN: el aviso pide dejarlo vacío la primera vez, y quien ya lo
--   creó y lo sigue haciendo no debería acercarse al bloqueo por eso.
-- · `acceso_activar` ya no exige el nombre completo: el número de empleado
--   era la contraseña de antes y el nombre el usuario, que estaba a la vista,
--   así que pedirlo no protegía nada. Si llega, se sigue comprobando.
--
-- Se puede correr las veces que haga falta.

create or replace function acceso_estado() returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object('ok', true,
        'acceso_por_numero', coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true))
$$;

create or replace function acceso_iniciar(p_numero text, p_pin text) returns jsonb
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
        return jsonb_build_object('ok', false, 'motivo', 'sin_pin',
            'acceso_por_numero', coalesce((select acceso_por_numero from acceso_ajustes where id = 1), true));
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

revoke execute on function acceso_estado() from public;
grant execute on function acceso_estado() to anon, authenticated;
