-- Unir de una vez todas las altas repetidas
-- ------------------------------------------------------------------
-- El mapa de activos permite unir las altas repetidas de una máquina
-- una por una. Este script hace lo mismo de golpe para toda la base,
-- que es lo práctico cuando el catálogo lleva tiempo acumulándolas.
--
-- Agrupa con la misma regla que el mapa: la misma línea y la misma
-- identidad, que es el id_interno y, cuando falta, el nombre, ambos
-- normalizados sin espacios y en mayúsculas. De cada grupo sobrevive el
-- alta con más solicitudes y, si empatan, la más antigua.
--
-- Corriendo desde el SQL Editor no hace falta la política de borrado:
-- el editor entra como propietario y la RLS no le aplica.
--
-- MIRA PRIMERO lo que va a tocar con la consulta del paso 1. El paso 2
-- va en una transacción, así que o se hace entero o no se hace nada,
-- pero una vez confirmado no se deshace.

-- ------------------------------------------------------------------
-- Paso 1: qué altas se van a unir (no cambia nada)
-- ------------------------------------------------------------------
with identidad as (
    select id,
           linea_id,
           nombre,
           id_interno,
           coalesce(nullif(upper(trim(id_interno)), ''), upper(trim(nombre))) as maquina
      from public.equipos
),
carga as (
    select i.*,
           (select count(*) from public.refacciones r where r.equipo_id = i.id) as solicitudes
      from identidad i
),
elegidas as (
    select c.*,
           row_number() over (partition by linea_id, maquina
                              order by solicitudes desc, id asc) as puesto,
           first_value(id) over (partition by linea_id, maquina
                                 order by solicitudes desc, id asc) as se_queda
      from carga c
)
select linea_id,
       maquina,
       id        as alta_que_se_borra,
       nombre,
       id_interno,
       solicitudes as solicitudes_que_se_mueven,
       se_queda  as alta_que_sobrevive
  from elegidas
 where puesto > 1
 order by linea_id, maquina;


-- ------------------------------------------------------------------
-- Paso 2: hacerlo. Descomenta el bloque entero y ejecútalo.
-- ------------------------------------------------------------------
-- begin;
--
-- create temporary table altas_a_unir on commit drop as
-- with identidad as (
--     select id,
--            linea_id,
--            coalesce(nullif(upper(trim(id_interno)), ''), upper(trim(nombre))) as maquina
--       from public.equipos
-- ),
-- carga as (
--     select i.*,
--            (select count(*) from public.refacciones r where r.equipo_id = i.id) as solicitudes
--       from identidad i
-- ),
-- elegidas as (
--     select c.*,
--            row_number() over (partition by linea_id, maquina
--                               order by solicitudes desc, id asc) as puesto,
--            first_value(id) over (partition by linea_id, maquina
--                                  order by solicitudes desc, id asc) as se_queda
--       from carga c
-- )
-- select id as sobrante, se_queda
--   from elegidas
--  where puesto > 1;
--
-- -- Las solicitudes cambian de dueño ANTES de borrar nada.
-- update public.refacciones r
--    set equipo_id = u.se_queda
--   from altas_a_unir u
--  where r.equipo_id = u.sobrante;
--
-- -- Y sólo entonces se van las filas sobrantes.
-- delete from public.equipos e
--  using altas_a_unir u
--  where e.id = u.sobrante;
--
-- commit;


-- ------------------------------------------------------------------
-- Paso 3: comprobar que no quedó ninguna repetida
-- ------------------------------------------------------------------
-- select linea_id,
--        coalesce(nullif(upper(trim(id_interno)), ''), upper(trim(nombre))) as maquina,
--        count(*) as altas
--   from public.equipos
--  group by 1, 2
-- having count(*) > 1;
