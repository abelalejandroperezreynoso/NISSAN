-- Cambio de asignación: cuándo cambió el puesto o el departamento de alguien
-- ------------------------------------------------------------------
-- A quién le toca una encuesta lo deciden su puesto y su departamento de hoy,
-- y la base no guardaba desde cuándo los tiene. Al cambiar a alguien de puesto
-- le caían de golpe las encuestas del puesto nuevo, y la presentación
-- automática se las cobraba como si las hubiera tenido siempre: en los periodos
-- de atrás salía en 0% —«N meses seguidos en 0%»— por una encuesta que nunca
-- tuvo en su mano.
--
-- Esta columna guarda el último cambio: cuándo fue y qué puesto y qué
-- departamento tenía antes. Con eso la aplicación sabe si una encuesta ya le
-- tocaba con lo de antes —y entonces se le cobra como siempre— o si le llegó con
-- el cambio, y en ese caso no le cuenta en los periodos anteriores ni durante
-- el primer mes.
--
-- La escribe un disparador y no la aplicación: el puesto se cambia desde dos
-- pantallas y también desde el panel de Supabase, y el disparador alcanza a las
-- tres. Sólo guarda el último cambio; uno nuevo pisa al anterior.
--
-- Renombrar un puesto o un departamento desde «Gestionar información» cambia
-- la ficha de toda su gente, así que también cuenta como cambio.
--
-- Ejecutar en el SQL Editor de Supabase; se puede correr las veces que haga
-- falta. Sin correrlo todo se comporta como antes.

alter table public.employees
    add column if not exists cambio_de_asignacion jsonb;

comment on column public.employees.cambio_de_asignacion is
    'El último cambio de puesto o departamento: { fecha, puesto, departamento } con lo que tenía antes. Lo escribe un disparador.';

create or replace function public.apuntar_cambio_de_asignacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if new.puesto is distinct from old.puesto
       or new.department is distinct from old.department then
        new.cambio_de_asignacion := jsonb_build_object(
            'fecha', now(),
            'puesto', old.puesto,
            'departamento', old.department
        );
    end if;
    return new;
end;
$$;

drop trigger if exists apuntar_cambio_de_asignacion on public.employees;
create trigger apuntar_cambio_de_asignacion
    before update of puesto, department on public.employees
    for each row
    execute function public.apuntar_cambio_de_asignacion();
