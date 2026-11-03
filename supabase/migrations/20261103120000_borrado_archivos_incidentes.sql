-- Permiso de borrado en los buckets de los registros de incidentes.
-- ------------------------------------------------------------------
-- Eliminar un registro (incidente, difusión o capacitación) borra también las
-- imágenes de sus firmas (bucket `signatures`) y sus fotos (`incident-images`),
-- que es donde está el espacio: cerca de 1 MB de firmas por registro.
-- `window.eliminarIncidenteCompleto` (3-incidentes.js) prueba antes si Storage
-- deja borrar en cada bucket y, si no, no borra nada y lo dice: este script es
-- lo que hay que correr cuando lo diga.
--
-- Se puede correr las veces que haga falta. Sólo añade el borrado: la lectura y
-- el alta de esos buckets se quedan como estén.
--
-- Igual que en `fotos-evaluaciones`, el permiso es para la clave de la
-- aplicación: lo que protege a una firma con dueño no es la política sino la
-- aplicación, que sólo borra la carpeta del registro que se está eliminando.

drop policy if exists "firmas_incidentes_borrado" on storage.objects;
create policy "firmas_incidentes_borrado"
    on storage.objects for delete
    to anon, authenticated
    using (bucket_id = 'signatures');

drop policy if exists "imagenes_incidentes_borrado" on storage.objects;
create policy "imagenes_incidentes_borrado"
    on storage.objects for delete
    to anon, authenticated
    using (bucket_id = 'incident-images');
