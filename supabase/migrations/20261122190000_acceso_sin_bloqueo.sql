-- Sin bloqueo por intentos fallidos: un PIN equivocado sólo dice que no es.
-- Ya no cuenta intentos ni pone `bloqueado_hasta`, así que nadie vuelve a
-- quedarse bloqueado. Idempotente: reemplaza la función con la misma firma.
create or replace function acceso_fallo(p_emp text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
    return jsonb_build_object('ok', false, 'motivo', p_motivo);
end $$;

revoke execute on function acceso_fallo(text, text) from public, anon, authenticated;
