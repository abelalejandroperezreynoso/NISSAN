-- Acceso con PIN: la primera vez se dice de quién es el número.
-- --------------------------------------------------------------
-- La pantalla de entrar pide primero sólo el número de empleado. Si esa
-- persona todavía no tiene PIN, `acceso_iniciar` devuelve ahora su nombre, su
-- puesto y su departamento, para que confirme «¿Eres tú?» antes de crearlo.
--
-- Sólo mientras la entrada por número esté abierta, y nunca de quien ya tiene
-- PIN: a ése sólo se le pide el PIN, sin decir de quién es el número.
--
-- Se puede correr las veces que haga falta.

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
