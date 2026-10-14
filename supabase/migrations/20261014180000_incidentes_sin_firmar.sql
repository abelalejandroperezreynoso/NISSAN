-- Los registros que a cada persona le faltan por firmar, ya contados en la base.
--
-- El badge de pendientes del panel (`calcularPendientesBatch`) se traía, persona
-- por persona, la lista entera de lo que había firmado —unos trescientos ids— para
-- restarla en el navegador: en el panel de un jefe eso era la mitad de lo que
-- bajaba. Esta función devuelve sólo lo que falta, que casi siempre es nada.
--
-- La regla de quién firma sigue en la aplicación (`leTocaFirmar`): las bajas y los
-- puestos exentos no se le preguntan, y la fecha de alta de cada persona la manda
-- el cliente (`p_desdes`), que es la medianoche local con la que compara el resto
-- de la aplicación. Las capacitaciones no se firman y no salen.
--
-- Sin `security definer`: corre con los permisos de quien llama, que ya puede leer
-- las dos tablas. Los `materialized` no son adorno: con un `not exists` el plan
-- tardaba 3 s para un equipo de once; así, 20 ms.
--
-- Corrido en producción el 14 de octubre de 2026. Se puede correr las veces que
-- haga falta.

create or replace function public.incidentes_sin_firmar(p_empleados text[], p_desdes date[])
returns table (employee_id text, incident_id uuid, tipo text)
language sql stable
set search_path = public
as $$
  with e as materialized (
    select u.emp, u.desde from unnest(p_empleados, p_desdes) as u(emp, desde)
  ),
  s as materialized (
    select f.incident_id, f.employee_id from incident_signatures f
    where f.employee_id in (select emp from e)
  )
  select e.emp, i.id, i.tipo
  from e
  join incidents i on i.date >= e.desde
  left join s on s.incident_id = i.id and s.employee_id = e.emp
  where s.incident_id is null
    and coalesce(i.tipo, '') <> 'Capacitación';
$$;

grant execute on function public.incidentes_sin_firmar(text[], date[]) to anon, authenticated;
