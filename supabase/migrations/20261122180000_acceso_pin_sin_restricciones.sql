-- El PIN sólo tiene que ser de 4 números: ya no se rechazan los repetidos,
-- las escaleras ni los que coinciden con el número de empleado.
-- Idempotente: reemplaza la función con la misma firma.
create or replace function acceso_pin_debil(p_pin text, p_numero text) returns text
language plpgsql immutable set search_path = public as $$
begin
    if p_pin is null or p_pin !~ '^[0-9]{4}$' then return 'El PIN debe ser de 4 números.'; end if;
    return null;
end $$;

revoke execute on function acceso_pin_debil(text, text) from public, anon, authenticated;
