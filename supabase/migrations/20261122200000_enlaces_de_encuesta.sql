-- Enlaces de una encuesta: documentos de SharePoint u otros sitios que se leen
-- antes de contestarla. La aplicación sólo guarda el enlace —{ titulo, url }—;
-- el contenido se queda donde está, y SharePoint decide si se abre según el
-- aparato. Se puede correr las veces que haga falta.
alter table evaluations add column if not exists enlaces jsonb not null default '[]'::jsonb;
