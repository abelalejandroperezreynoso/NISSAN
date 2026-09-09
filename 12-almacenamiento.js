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
// **Lo que se mide es lo que cobra Supabase**, y eso obliga a preguntárselo a
// la base: las cuatro funciones de `sql/consumo-almacenamiento.sql`.
//
// La primera versión medía los archivos desde el cliente y la base sumando las
// tablas de `public`, y las dos cifras discrepaban de la página de uso de
// Supabase: decía 58 MB de base donde Supabase decía 366. No era un fallo de la
// cuenta, eran dos cosas distintas —Supabase cobra el archivo de base entero,
// con los esquemas de sistema y el espacio que las filas borradas dejan sin
// devolver—, así que hoy se pregunta `pg_database_size` y el desglose por
// esquema enseña de dónde sale.
//
// Los archivos se cuentan igual, desde `storage.objects`: es la misma fila de
// la que sale el `metadata.size` que devuelve la API, una consulta en lugar de
// nueve vueltas de listado, y si las dos cifras no cuadran manda ésta.
//
// **Sin el script todo sigue en pie**: los archivos se listan desde el cliente
// como antes y la mitad de la base dice qué falta.

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

// Una llamada a una función de `sql/consumo-almacenamiento.sql`, que puede no
// existir todavía. Devuelve null en vez de reventar, que es lo que deja la
// pantalla en pie sin el script corrido.
//
// **Y se queda con el porqué.** «No se pudo, corre el script» es la respuesta
// correcta cuando el script no se ha corrido y una mentira cuando sí: pasó con
// `tamano_buckets`, que existía y fallaba por otra cosa, y la pantalla mandaba a
// correr un script ya corrido mientras las otras tres funciones respondían al
// lado. El motivo lo dice la base —falta la función, la política no deja leer la
// tabla, un valor no convierte— y no cuesta nada guardarlo.
window.falloDeLaBase = {};

window.pedirALaBase = async (funcion) => {
    const { data, error } = await sb.rpc(funcion);
    if (error) {
        window.falloDeLaBase[funcion] = error.message || String(error);
        console.warn(`Consumo: ${funcion}() no respondió →`, error);
        return null;
    }
    delete window.falloDeLaBase[funcion];
    return data;
};

// Lo que se le dice a quien mira cuando una de esas funciones no respondió.
// PostgREST distingue el «no existe» de todo lo demás con su propio código, y
// son dos consejos distintos: uno se arregla corriendo el script y el otro no.
window.notaDeFallo = (funcion) => {
    const msg = window.falloDeLaBase[funcion];
    if (!msg) return `Corre <b>sql/consumo-almacenamiento.sql</b> en Supabase para que la cuente la base.`;
    if (/could not find|does not exist|schema cache/i.test(msg))
        return `Falta la función <b>${funcion}()</b>: corre <b>sql/consumo-almacenamiento.sql</b> en Supabase.`;
    // Un tiempo agotado no es un permiso ni un script que falte: la consulta
    // empezó y no acabó a tiempo. En `tamano_buckets` eso apunta a una sola
    // cosa —recorrer `storage.objects` cuesta más de lo que dura la paciencia
    // de PostgREST— y lo que hay que mirar es cuánto pesa ese esquema en el
    // desglose de la base, no volver a correr nada.
    if (/timeout|canceling statement/i.test(msg))
        return `<b>${funcion}()</b> tardó más de lo que Supabase deja y se canceló. Mira lo que pesa el esquema <b>storage</b> en el desglose de la base: si se ha hinchado, recorrerlo entero no cabe en el plazo.`;
    return `La base rechazó <b>${funcion}()</b>: «${window.sanitizeForHTML(msg)}». La función existe, así que volver a correr el script no lo arregla.`;
};

window.medirAlmacenamiento = async () => {
    // Los archivos, contados por la base: una consulta en lugar de nueve vueltas
    // de listado, y es la cifra que suma Supabase para su página de uso.
    const porBucket = await window.pedirALaBase('tamano_buckets');
    let buckets;
    let desdeLaBase = Array.isArray(porBucket);

    if (desdeLaBase) {
        const cuenta = {};
        porBucket.forEach(b => { cuenta[String(b.bucket)] = b; });
        // Se listan los de la aplicación y además cualquier otro que la base
        // conozca: un bucket que nadie agregó a `BUCKETS_DE_LA_APP` seguiría
        // ocupando sitio y quedándose fuera del total.
        const conocidos = new Set(window.BUCKETS_DE_LA_APP.map(b => b.id));
        const otros = Object.keys(cuenta).filter(id => !conocidos.has(id))
            .map(id => ({ id: id, nombre: id, borrable: false }));

        buckets = window.BUCKETS_DE_LA_APP.concat(otros).map(b => {
            const c = cuenta[b.id];
            return { ...b,
                archivos: null,                       // se listan al entrar
                cuantos: c ? Number(c.archivos) || 0 : 0,
                bytes: c ? Number(c.bytes) || 0 : 0,
                sinMedida: c ? Number(c.sin_medida) || 0 : 0 };
        });
    } else {
        // Sin la función, como antes: listando cada bucket desde el cliente.
        // Va bucket por bucket y no en paralelo a propósito: son seis listados
        // que pueden traer miles de filas cada uno, y desde un teléfono en 4G
        // lanzarlos a la vez es la manera de que alguno se caiga por tiempo. Un
        // bucket que no exista, o cuya política no deje leerlo, devuelve una
        // lista vacía sin dar error, así que sale con 0 y no rompe el total.
        buckets = [];
        for (const b of window.BUCKETS_DE_LA_APP) {
            const archivos = await window.archivosDelBucket(b.id);
            archivos.sort((x, y) => y.bytes - x.bytes);
            buckets.push({ ...b, archivos: archivos, cuantos: archivos.length,
                bytes: archivos.reduce((s, a) => s + a.bytes, 0), sinMedida: 0 });
        }
    }
    buckets.sort((a, b) => b.bytes - a.bytes);

    // El peso de la base es el del proyecto entero —lo que cobra Supabase—, y
    // el desglose por esquema es lo que explica la diferencia con la suma de
    // las tablas de `public`.
    const base = await window.pedirALaBase('tamano_base');
    const esquemas = await window.pedirALaBase('tamano_esquemas');
    const tablasRpc = await window.pedirALaBase('tamano_tablas');

    const limpiar = (filas, campo) => Array.isArray(filas)
        ? filas.map(f => ({ nombre: String(f[campo]), bytes: Number(f.bytes) || 0 }))
               .filter(f => f.bytes > 0)
        : null;

    // Las tablas traen además de qué esquema son y sus filas vivas y muertas,
    // que es lo que separa una tabla grande de una hinchada.
    const tablas = Array.isArray(tablasRpc)
        ? tablasRpc.map(f => ({
              nombre: String(f.tabla),
              esquema: String(f.esquema || ''),
              bytes: Number(f.bytes) || 0,
              vivas: Number(f.filas_vivas) || 0,
              muertas: Number(f.filas_muertas) || 0
          })).filter(f => f.bytes > 0)
        : null;

    // Los huérfanos del material: archivos que están en el bucket y que ninguna
    // fila de `materiales_encuesta` nombra. Los deja el camino de error de la
    // subida —el archivo sube y la ficha no—, y son los únicos que se pueden
    // retirar desde aquí sin romperle nada a nadie.
    let huerfanos = null;
    const material = buckets.find(b => b.id === window.BUCKET_MATERIALES);
    if (material && material.cuantos > 0) {
        const { data: fichas, error: errFichas } = await sb.from('materiales_encuesta').select('archivo');
        if (!errFichas && Array.isArray(fichas)) {
            // Aquí sí hace falta la lista: para saber cuáles sobran hay que
            // tener los nombres. Se lista sólo este bucket, que es el pequeño.
            if (!material.archivos) material.archivos = await window.archivosDelBucket(material.id);
            const usados = new Set(fichas.map(f => String(f.archivo)));
            huerfanos = material.archivos.filter(a => !usados.has(a.ruta));
        }
    }

    window.consumoAlmacenamiento = {
        buckets: buckets,
        desdeLaBase: desdeLaBase,
        archivos: buckets.reduce((s, b) => s + b.bytes, 0),
        cuantos: buckets.reduce((s, b) => s + b.cuantos, 0),
        sinMedida: buckets.reduce((s, b) => s + (b.sinMedida || 0), 0),
        esquemas: limpiar(esquemas, 'esquema'),
        tablas: tablas,
        base: typeof base === 'number' ? base : null,
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

// **Una tabla hinchada es la que tiene más filas muertas que vivas.** Una fila
// borrada o actualizada no devuelve su sitio hasta que alguien lo recoge, y el
// archivo de la tabla no encoge solo: se puede acabar con cientos de MB para
// describir unos miles de registros.
//
// El umbral es deliberadamente conservador —tiene que pesar de verdad y las
// muertas tienen que ser muchas y ganarle a las vivas— porque **este aviso no
// puede equivocarse**: manda a alguien a correr un `VACUUM FULL`, que bloquea
// la tabla mientras corre. Una tabla pequeña con churn no es un problema, y una
// tabla grande de filas gordas —una firma en base64 pesa lo suyo— tampoco: por
// eso se compara con las vivas y no con el peso por fila.
window.MIN_BYTES_HINCHAZON = 4 * 1024 * 1024;
window.MIN_MUERTAS = 1000;

window.estaHinchada = (f) => !!f && f.bytes >= window.MIN_BYTES_HINCHAZON
    && f.muertas >= window.MIN_MUERTAS && f.muertas > f.vivas;

// Sale sólo si hay alguna, y dice lo que hay que saber: que ese peso no son
// datos y que recuperarlo no se hace desde aquí.
window.avisoDeHinchazon = (tablas) => {
    const malas = (tablas || []).filter(window.estaHinchada);
    if (malas.length === 0) return '';
    const bytes = malas.reduce((s, f) => s + f.bytes, 0);
    const una = malas.length === 1;
    return `
        <div class="consumo-aviso">
            <div class="consumo-aviso-titulo">${una ? 'Una tabla hinchada' : `${malas.length} tablas hinchadas`} · ${window.pesoLegible(bytes)}</div>
            <div class="consumo-aviso-texto">${una
                ? `<b>${window.sanitizeForHTML(malas[0].nombre)}</b> tiene más filas muertas que vivas: buena parte de ese peso es espacio que las filas borradas dejaron sin devolver, no datos.`
                : `Tienen más filas muertas que vivas: buena parte de ese peso es espacio que las filas borradas dejaron sin devolver, no datos.`}
                Recuperarlo es un <b>VACUUM FULL</b>, que bloquea la tabla mientras corre, así que no se hace desde aquí.</div>
        </div>`;
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
                <span class="consumo-fila-detalle">${b.cuantos} archivo${b.cuantos === 1 ? '' : 's'} · ${window.sanitizeForHTML(b.id)}</span>
            </span>
            <span class="consumo-fila-peso">${window.pesoLegible(b.bytes) || '—'}</span>
            <span class="consumo-flecha" aria-hidden="true">&rsaquo;</span>
        </button>`;

    const filaPeso = (f) => `
        <div class="consumo-fila consumo-fila--quieta">
            <span class="consumo-fila-texto">
                <span class="consumo-fila-nombre">${window.sanitizeForHTML(f.nombre)}</span>
            </span>
            <span class="consumo-fila-peso">${window.pesoLegible(f.bytes) || '—'}</span>
        </div>`;

    // Una tabla dice **de qué esquema es y cuántas filas tiene**, y las dos cosas
    // hacen falta: sin el esquema no se sabe que `objects` es de Supabase y no
    // de esta aplicación, y sin las filas un número grande no dice si es mucho.
    // 264 MB para 1735 filas se ve solo en cuanto están las dos al lado.
    const filaTabla = (f) => {
        const trozos = [];
        if (f.esquema && f.esquema !== 'public') trozos.push(f.esquema);
        if (f.vivas > 0) trozos.push(`${f.vivas.toLocaleString('es-MX')} fila${f.vivas === 1 ? '' : 's'}`);
        if (window.estaHinchada(f)) trozos.push(`${f.muertas.toLocaleString('es-MX')} muertas`);
        return `
        <div class="consumo-fila consumo-fila--quieta">
            <span class="consumo-fila-texto">
                <span class="consumo-fila-nombre">${window.sanitizeForHTML(f.nombre)}</span>
                ${trozos.length ? `<span class="consumo-fila-detalle">${window.sanitizeForHTML(trozos.join(' · '))}</span>` : ''}
            </span>
            <span class="consumo-fila-peso">${window.pesoLegible(f.bytes) || '—'}</span>
        </div>`;
    };

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

    // El peso del proyecto entero, que es lo que cobra Supabase. Debajo, por
    // esquema: es lo que explica que `public` sea una parte y no el total —el
    // resto son los esquemas de sistema y el espacio que las filas borradas
    // dejan sin devolver—.
    const baseHtml = c.base === null
        ? `<div class="consumo-tarjeta">
               <div class="consumo-rotulo">Base de datos</div>
               <div class="consumo-pie">No se puede medir. ${window.notaDeFallo('tamano_base')} Los archivos de arriba se miden igual.</div>
           </div>`
        : resumen('Base de datos', c.base, window.CUOTA_BASE,
              'El proyecto entero, que es lo que cuenta Supabase: los esquemas de sistema y el espacio de las filas borradas van dentro.') +
          (c.esquemas ? `<div class="consumo-lista">${c.esquemas.slice(0, 8).map(filaPeso).join('')}</div>` : '') +
          (c.tablas && c.tablas.length > 0 ? `
              <div class="consumo-rotulo" style="padding:0 2px 6px;">Las tablas que más pesan</div>
              <div class="consumo-lista">${c.tablas.slice(0, 12).map(filaTabla).join('')}</div>
              ${window.avisoDeHinchazon(c.tablas)}` : '');

    // De dónde salió la cifra de los archivos. No es un detalle: listándolos
    // desde el cliente, un bucket cuya política no deje leerlo sale en cero y
    // el total se queda corto sin decirlo.
    const origen = c.desdeLaBase
        ? `Contados por la base, que es la misma cifra que suma Supabase.`
        : `Contados listando cada bucket desde la aplicación, así que un bucket que no se deje listar sale aquí en cero. ${window.notaDeFallo('tamano_buckets')}`;
    const sinMedida = c.sinMedida > 0
        ? ` ${c.sinMedida} sin tamaño registrado, que cuentan como cero.` : '';

    return resumen('Archivos', c.archivos, window.CUOTA_ARCHIVOS,
               `${c.cuantos} archivo${c.cuantos === 1 ? '' : 's'} en ${c.buckets.length} buckets. ${origen}${sinMedida}`) +
           huerfanosHtml +
           `<div class="consumo-lista">${c.buckets.map(filaBucket).join('')}</div>` +
           baseHtml;
};

// Los archivos de un bucket se listan **al entrar y no al medir**: con la
// cuenta ya hecha por la base, traerse mil setecientos nombres para dibujar
// cincuenta es cobrarle a todo el mundo lo que mira uno. Una vez listados se
// quedan en el nodo, así que volver a entrar no vuelve a pedirlos.
window.abrirBucket = async (i) => {
    const c = window.consumoAlmacenamiento;
    if (!c || !c.buckets[i]) return;

    const b = c.buckets[i];
    window.bucketAbierto = b;
    const cuerpo = document.getElementById('cuerpo-almacenamiento');
    if (cuerpo) cuerpo.scrollTop = 0;

    if (b.archivos === null) {
        window.pintarConsumo(`<div class="consumo-cargando"><div class="spinner"></div>Listando los archivos…</div>`);
        b.archivos = await window.archivosDelBucket(b.id);
        b.archivos.sort((x, y) => y.bytes - x.bytes);
        // La hoja pudo cerrarse, o abrirse otro bucket, mientras el listado
        // venía de camino.
        if (window.bucketAbierto !== b) return;
    }
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
    if (subtitulo) subtitulo.innerText = `${window.pesoLegible(b.bytes) || '0 KB'} · ${b.cuantos} archivo${b.cuantos === 1 ? '' : 's'}`;

    const listados = b.archivos || [];
    if (listados.length === 0) {
        // Que la base diga que hay archivos y el listado no los vea significa
        // una cosa: la política de lectura del bucket no deja listarlo desde la
        // aplicación. Decirlo es más útil que enseñar una lista vacía.
        const nota = b.cuantos > 0
            ? `La base dice que este bucket tiene ${b.cuantos} archivo${b.cuantos === 1 ? '' : 's'} y ${window.pesoLegible(b.bytes)}, pero su política de lectura no deja listarlos desde la aplicación. El peso del total de arriba sí los cuenta.`
            : `Sin archivos.`;
        return `<div class="consumo-tarjeta">
                    <div class="consumo-rotulo">${window.sanitizeForHTML(b.nombre)}</div>
                    <div class="consumo-pie">${nota}</div>
                </div>`;
    }

    const filas = listados.slice(0, 50).map(a => {
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

    const resto = listados.length > 50
        ? `<div class="consumo-pie" style="padding:10px 2px;">Y ${listados.length - 50} más, todos por debajo de ${window.pesoLegible(listados[49].bytes)}.</div>`
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
