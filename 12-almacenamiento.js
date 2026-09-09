// ==========================================
// CONSUMO DE ALMACENAMIENTO
// ==========================================
// La cuenta de Supabase es gratuita y tiene un tope: 1 GB de archivos y 500 MB
// de base. Hasta ahora no había manera de saber por dónde iba —había que entrar
// al panel de Supabase— y eso es justo lo que no se hace hasta que algo deja de
// subir. Esta pantalla lo dice desde la propia aplicación.
//
// Se entra por «💾 Consumo» del panel de administración y es **de consulta**,
// con una sola excepción: los archivos huérfanos del material de encuestas, que
// se pueden retirar de aquí porque no los reclama nadie (más abajo).
//
// Los archivos se miden desde el cliente, listando cada bucket y sumando el
// `metadata.size` que devuelve Storage. El peso de la base no se puede
// preguntar así: hace falta la función `tamano_tablas()` de
// `sql/consumo-almacenamiento.sql`, y sin ella esa mitad de la pantalla dice qué
// script falta.

// Lo que se está mirando. Lo llena `window.medirAlmacenamiento` y lo leen las
// dos pantallas de la hoja, que dibujan desde aquí sin volver a consultar.
window.consumoAlmacenamiento = null;
window.bucketAbierto = null;

// Todos los archivos de un bucket, entrando en sus carpetas.
//
// Dos cosas que `list()` no hace solo: **pagina de mil en mil** —el tope de
// PostgREST, y `materiales-evaluaciones` puede pasarlo— y **no baja a las
// subcarpetas**, que llegan como entradas sin `id` y sin metadata. El material
// vive bajo el id de su encuesta, así que sin recorrerlas el bucket parecería
// vacío.
window.archivosDelBucket = async (bucket, tope = 5000) => {
    const archivos = [];
    const carpetas = [''];

    while (carpetas.length > 0 && archivos.length < tope) {
        const carpeta = carpetas.shift();
        let desde = 0;

        for (;;) {
            const { data, error } = await sb.storage.from(bucket)
                .list(carpeta, { limit: 1000, offset: desde });
            if (error || !data || data.length === 0) break;

            data.forEach(o => {
                // El marcador que Supabase deja en una carpeta vacía no es un
                // archivo de nadie y no debe contarse.
                if (o.name === '.emptyFolderPlaceholder') return;
                const ruta = carpeta ? `${carpeta}/${o.name}` : o.name;
                if (!o.id) { carpetas.push(ruta); return; }
                archivos.push({
                    ruta: ruta,
                    nombre: o.name,
                    bytes: (o.metadata && Number(o.metadata.size)) || 0,
                    cuando: o.created_at || o.updated_at || null
                });
            });

            if (data.length < 1000) break;
            desde += data.length;
        }
    }

    return archivos;
};

// Los archivos de todos los buckets y el peso de la base. Va bucket por bucket
// y no en paralelo a propósito: son seis listados que pueden traer miles de
// filas cada uno, y desde un teléfono en 4G lanzarlos a la vez es la manera de
// que alguno se caiga por tiempo.
//
// Un bucket que no exista, o cuya política no deje leerlo, devuelve una lista
// vacía sin dar error, así que sale con 0 archivos y no rompe el total.
window.medirAlmacenamiento = async () => {
    const buckets = [];
    for (const b of window.BUCKETS_DE_LA_APP) {
        const archivos = await window.archivosDelBucket(b.id);
        archivos.sort((x, y) => y.bytes - x.bytes);
        buckets.push({ ...b, archivos: archivos, bytes: archivos.reduce((s, a) => s + a.bytes, 0) });
    }
    buckets.sort((a, b) => b.bytes - a.bytes);

    // El peso de la base necesita la función de `sql/`. Sin ella se queda en
    // null y la pantalla lo dice, como cualquier otra columna o tabla que añade
    // un script que se corre a mano.
    let tablas = null;
    const { data, error } = await sb.rpc('tamano_tablas');
    if (!error && Array.isArray(data)) {
        tablas = data.map(t => ({ tabla: t.tabla, bytes: Number(t.bytes) || 0 }))
            .filter(t => t.bytes > 0);
    }

    // Los huérfanos del material: archivos que están en el bucket y que ninguna
    // fila de `materiales_encuesta` nombra. Los deja el camino de error de la
    // subida —el archivo sube y la ficha no—, y son los únicos que se pueden
    // retirar desde aquí sin romperle nada a nadie.
    let huerfanos = null;
    const material = buckets.find(b => b.id === window.BUCKET_MATERIALES);
    if (material) {
        const { data: fichas, error: errFichas } = await sb.from('materiales_encuesta').select('archivo');
        if (!errFichas && Array.isArray(fichas)) {
            const usados = new Set(fichas.map(f => String(f.archivo)));
            huerfanos = material.archivos.filter(a => !usados.has(a.ruta));
        }
    }

    window.consumoAlmacenamiento = {
        buckets: buckets,
        archivos: buckets.reduce((s, b) => s + b.bytes, 0),
        cuantos: buckets.reduce((s, b) => s + b.archivos.length, 0),
        tablas: tablas,
        base: tablas ? tablas.reduce((s, t) => s + t.bytes, 0) : null,
        huerfanos: huerfanos,
        medidoEn: new Date()
    };
    return window.consumoAlmacenamiento;
};

// ------------------------------------------------------------------
// LA HOJA
// ------------------------------------------------------------------
window.abrirConsumoAlmacenamiento = async () => {
    const hoja = document.getElementById('modal-almacenamiento');
    if (!hoja) return;

    window.bucketAbierto = null;
    hoja.style.display = 'flex';
    window.pintarConsumo(`<div class="consumo-cargando"><div class="spinner"></div>Midiendo los archivos…</div>`);

    try {
        await window.medirAlmacenamiento();
    } catch (e) {
        console.error(e);
        window.pintarConsumo(`<div class="consumo-cargando">No se pudo medir: ${window.sanitizeForHTML(e.message || String(e))}</div>`);
        return;
    }
    window.pintarConsumo();
};

window.cerrarConsumoAlmacenamiento = () => {
    const hoja = document.getElementById('modal-almacenamiento');
    if (hoja) hoja.style.display = 'none';
    const cuerpo = document.getElementById('cuerpo-almacenamiento');
    if (cuerpo) cuerpo.innerHTML = '';
    window.bucketAbierto = null;
};

// El encabezado dice en qué pantalla se está, como el de la hoja de
// evaluaciones y por lo mismo: aquí se dibujan dos —el resumen y los archivos
// de un bucket— dentro del mismo contenedor.
window.pintarConsumo = (html) => {
    const cuerpo = document.getElementById('cuerpo-almacenamiento');
    const subtitulo = document.getElementById('subtitulo-almacenamiento');
    const volver = document.getElementById('btn-volver-almacenamiento');
    if (!cuerpo) return;

    if (html !== undefined) {
        if (volver) volver.hidden = true;
        if (subtitulo) subtitulo.innerText = '';
        cuerpo.innerHTML = html;
        return;
    }

    const c = window.consumoAlmacenamiento;
    if (!c) return;

    if (volver) volver.hidden = !window.bucketAbierto;
    cuerpo.innerHTML = window.bucketAbierto
        ? window.pantallaDeBucket(window.bucketAbierto)
        : window.pantallaDeConsumo(c);
};

// La barra de una proporción, con su color: verde hasta el 70%, ámbar hasta el
// 90 y rojo de ahí. Aquí sí hay umbrales que poner —la cuota es un tope de
// verdad, al revés que la asistencia, donde pintar de rojo un 60% sería
// inventárselo—.
window.barraDeCuota = (bytes, cuota) => {
    const parte = cuota > 0 ? Math.min(1, bytes / cuota) : 0;
    const color = parte >= 0.9 ? '#dc2626' : (parte >= 0.7 ? '#d97706' : '#16a34a');
    return `<div class="consumo-barra"><div class="consumo-barra-relleno"
                 style="width:${Math.max(parte * 100, bytes > 0 ? 1.5 : 0)}%; background:${color};"></div></div>`;
};

window.pantallaDeConsumo = (c) => {
    const subtitulo = document.getElementById('subtitulo-almacenamiento');
    if (subtitulo) subtitulo.innerText = `Medido a las ${window.horaLegible(c.medidoEn)}`;

    const resumen = (rotulo, bytes, cuota, pie) => `
        <div class="consumo-tarjeta">
            <div class="consumo-rotulo">${rotulo}</div>
            <div class="consumo-cifra">
                <span class="consumo-cifra-numero">${window.pesoLegible(bytes) || '0 KB'}</span>
                <span class="consumo-cifra-pct">${window.pctTexto(bytes, cuota)}% de ${window.pesoLegible(cuota)}</span>
            </div>
            ${window.barraDeCuota(bytes, cuota)}
            <div class="consumo-pie">${pie}</div>
        </div>`;

    const filaBucket = (b, i) => `
        <button type="button" class="consumo-fila" onclick="window.abrirBucket(${i})">
            <span class="consumo-fila-texto">
                <span class="consumo-fila-nombre">${window.sanitizeForHTML(b.nombre)}</span>
                <span class="consumo-fila-detalle">${b.archivos.length} archivo${b.archivos.length === 1 ? '' : 's'} · ${window.sanitizeForHTML(b.id)}</span>
            </span>
            <span class="consumo-fila-peso">${window.pesoLegible(b.bytes) || '—'}</span>
            <span class="consumo-flecha" aria-hidden="true">&rsaquo;</span>
        </button>`;

    // Un huérfano es un archivo que subió bien y cuya ficha no llegó a
    // guardarse: no lo enseña ninguna encuesta y sólo ocupa sitio.
    const h = c.huerfanos;
    const bytesHuerfanos = (h || []).reduce((s, a) => s + a.bytes, 0);
    const uno = h && h.length === 1;
    const huerfanosHtml = (h && h.length > 0) ? `
        <div class="consumo-aviso">
            <div class="consumo-aviso-titulo">${h.length} archivo${uno ? '' : 's'} sin dueño · ${window.pesoLegible(bytesHuerfanos)}</div>
            <div class="consumo-aviso-texto">${uno
                ? 'Está en el bucket del material pero ninguna encuesta lo nombra: es una subida cuya ficha no llegó a guardarse. Quitarlo no le cambia nada a nadie.'
                : 'Están en el bucket del material pero ninguna encuesta los nombra: son subidas cuya ficha no llegó a guardarse. Quitarlos no le cambia nada a nadie.'}</div>
            <button type="button" class="consumo-aviso-boton" onclick="window.limpiarHuerfanos()">Quitar ${uno ? 'el huérfano' : 'los huérfanos'}</button>
        </div>` : '';

    const baseHtml = c.tablas === null
        ? `<div class="consumo-tarjeta">
               <div class="consumo-rotulo">Base de datos</div>
               <div class="consumo-pie">No se puede medir: falta correr <b>sql/consumo-almacenamiento.sql</b> en Supabase. Los archivos de arriba se miden igual.</div>
           </div>`
        : resumen('Base de datos', c.base, window.CUOTA_BASE,
              `${c.tablas.length} tabla${c.tablas.length === 1 ? '' : 's'}`) +
          `<div class="consumo-lista">${c.tablas.slice(0, 12).map(t => `
              <div class="consumo-fila consumo-fila--quieta">
                  <span class="consumo-fila-texto">
                      <span class="consumo-fila-nombre">${window.sanitizeForHTML(t.tabla)}</span>
                  </span>
                  <span class="consumo-fila-peso">${window.pesoLegible(t.bytes) || '—'}</span>
              </div>`).join('')}</div>`;

    return resumen('Archivos', c.archivos, window.CUOTA_ARCHIVOS,
               `${c.cuantos} archivo${c.cuantos === 1 ? '' : 's'} en ${c.buckets.length} buckets`) +
           huerfanosHtml +
           `<div class="consumo-lista">${c.buckets.map(filaBucket).join('')}</div>` +
           baseHtml;
};

window.abrirBucket = (i) => {
    const c = window.consumoAlmacenamiento;
    if (!c || !c.buckets[i]) return;
    window.bucketAbierto = c.buckets[i];
    const cuerpo = document.getElementById('cuerpo-almacenamiento');
    if (cuerpo) cuerpo.scrollTop = 0;
    window.pintarConsumo();
};

window.volverAConsumo = () => {
    window.bucketAbierto = null;
    const cuerpo = document.getElementById('cuerpo-almacenamiento');
    if (cuerpo) cuerpo.scrollTop = 0;
    window.pintarConsumo();
};

// Los archivos de un bucket, del más pesado al más ligero: es el orden en el
// que se busca qué está ocupando el sitio. Se enseñan los cincuenta primeros —a
// partir de ahí lo que queda no mueve la aguja— y cada uno abre su archivo.
window.pantallaDeBucket = (b) => {
    const subtitulo = document.getElementById('subtitulo-almacenamiento');
    if (subtitulo) subtitulo.innerText = `${window.pesoLegible(b.bytes) || '0 KB'} · ${b.archivos.length} archivo${b.archivos.length === 1 ? '' : 's'}`;

    if (b.archivos.length === 0) {
        return `<div class="consumo-tarjeta">
                    <div class="consumo-rotulo">${window.sanitizeForHTML(b.nombre)}</div>
                    <div class="consumo-pie">Sin archivos. Si esperabas alguno, puede que la política de lectura del bucket no deje listarlo desde la aplicación.</div>
                </div>`;
    }

    const filas = b.archivos.slice(0, 50).map(a => {
        const { data } = sb.storage.from(b.id).getPublicUrl(a.ruta);
        const fecha = a.cuando ? new Date(a.cuando).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
        const detalle = [window.pesoLegible(a.bytes), fecha].filter(Boolean).join(' · ');
        return `
            <a class="consumo-fila" href="${window.sanitizeForHTML((data && data.publicUrl) || '#')}" target="_blank" rel="noopener">
                <span class="consumo-fila-texto">
                    <span class="consumo-fila-nombre">${window.sanitizeForHTML(a.nombre)}</span>
                    <span class="consumo-fila-detalle">${window.sanitizeForHTML(detalle)}</span>
                </span>
                <span class="consumo-flecha" aria-hidden="true">&rsaquo;</span>
            </a>`;
    }).join('');

    const resto = b.archivos.length > 50
        ? `<div class="consumo-pie" style="padding:10px 2px;">Y ${b.archivos.length - 50} más, todos por debajo de ${window.pesoLegible(b.archivos[49].bytes)}.</div>`
        : '';

    // De consulta: lo que se borra se borra desde donde vive. Una foto de
    // evaluación es constancia y su bucket ni siquiera da permiso; un material
    // se quita desde su encuesta, que además se lleva su ficha.
    const nota = b.borrable
        ? `<div class="consumo-pie" style="padding:0 2px 12px;">Para quitar un material, hazlo desde su encuesta: así se va también su ficha.</div>`
        : `<div class="consumo-pie" style="padding:0 2px 12px;">Este bucket no admite borrado desde la aplicación: lo que hay aquí es constancia de algo.</div>`;

    return nota + `<div class="consumo-lista">${filas}</div>` + resto;
};

// Retirar los huérfanos es lo único que esta pantalla escribe. Se borran del
// bucket de mil en mil —`remove` acepta varias rutas— y se cuenta lo que
// devuelve: una política que lo rechace no da error, sólo no borra nada.
window.limpiarHuerfanos = async () => {
    const c = window.consumoAlmacenamiento;
    if (!c || !c.huerfanos || c.huerfanos.length === 0) return;

    const bytes = c.huerfanos.reduce((s, a) => s + a.bytes, 0);
    const cuantos = c.huerfanos.length;
    const aviso = cuantos === 1
        ? `Se quitará 1 archivo del bucket del material (${window.pesoLegible(bytes)}).\n\nNinguna encuesta lo nombra, así que no se pierde nada de lo que se ve en la aplicación.`
        : `Se quitarán ${cuantos} archivos del bucket del material (${window.pesoLegible(bytes)}).\n\nNinguna encuesta los nombra, así que no se pierde nada de lo que se ve en la aplicación.`;
    if (!confirm(`${aviso}\n\n¿Continuar?`)) return;

    const rutas = c.huerfanos.map(a => a.ruta);
    let quitados = 0;
    for (let i = 0; i < rutas.length; i += 100) {
        const { data, error } = await sb.storage.from(window.BUCKET_MATERIALES).remove(rutas.slice(i, i + 100));
        if (error) { console.error(error); break; }
        quitados += (data || []).length;
    }

    if (quitados === 0) {
        alert("No se quitó ningún archivo. Puede que la política del bucket no deje borrar; revisa que se haya corrido sql/materiales-encuesta.sql.");
        return;
    }

    alert(quitados === 1 ? "Se quitó 1 archivo." : `Se quitaron ${quitados} archivos.`);
    await window.abrirConsumoAlmacenamiento();
};
