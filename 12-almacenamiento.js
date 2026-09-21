// ==========================================
// CONSUMO DE ALMACENAMIENTO
// ==========================================
// La cuenta de Supabase es gratuita y tiene un tope: 1 GB de archivos y 500 MB
// de base. Hasta ahora no había manera de saber por dónde iba —había que entrar
// al panel de Supabase— y eso es justo lo que no se hace hasta que algo deja de
// subir. Esta pantalla lo dice desde la propia aplicación.
//
// Se entra por «💾 Consumo» del panel de administración y es **de consulta**,
// con una sola excepción: los archivos **huérfanos**, que se pueden retirar de
// aquí porque no los reclama nadie (más abajo).
//
// Eso vale para dos buckets —el material de las encuestas y las fotos y firmas
// de las respuestas— y es lo único que impide que crezcan para siempre: al
// borrar una respuesta, una encuesta entera o el historial de una persona, la
// fila se va y el archivo se queda dentro sin que nadie lo nombre. Los otros
// cuatro buckets no dan permiso de borrado en su script y ahí no se toca nada.
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
//
// **Y sobrevive a cerrar la hoja.** Medir es lo más caro que hace esta pantalla
// —cuatro funciones de la base y, sin ellas, seis listados de miles de archivos
// cada uno—, y volver a abrirla lo repetía entero: quien entra a un bucket, sale
// y vuelve a entrar pagaba dos veces la misma medida para leer el mismo número.
// Lo que se viene a mirar aquí es un total que no cambia de un minuto para otro,
// así que la segunda vez se dibuja lo ya medido y **cuándo se midió lo dice el
// subtítulo**. Volver a preguntar es el botón de «Volver a medir» del
// encabezado, que es exactamente lo que promete su nombre y lo único que lo
// hace.
//
// Dura lo que la pantalla: recargar el documento la tira, que es lo que tiene
// que pasar con una medida —es un dato de un instante, no un ajuste—.
window.consumoAlmacenamiento = null;
window.bucketAbierto = null;

// La medición de camino, si la hay. Se guarda **la promesa y no el resultado**,
// como las demás cachés de la aplicación: cerrar la hoja y volver a abrirla
// mientras se está midiendo se engancha a la que ya va en vez de lanzar una
// segunda en paralelo, que serían las mismas consultas y los mismos listados
// otra vez —y desde un teléfono en 4G, la manera de que se caigan las dos—.
window.medicionDeConsumo = null;

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

// ------------------------------------------------------------------
// QUIÉN RECLAMA CADA ARCHIVO
// ------------------------------------------------------------------
// Un huérfano es un archivo que está en un bucket y que **ninguna fila de la
// base nombra**: no lo enseña ninguna pantalla, no lo reclama nadie y sólo
// ocupa sitio. Los deja el camino de error de una subida —el archivo sube y la
// fila no llega a guardarse— y, sobre todo, **todo lo que se borra**: una
// respuesta eliminada, una encuesta borrada con las suyas o el barrido del
// historial de una persona se llevan la fila y dejan el archivo dentro.
//
// **Cuánto tiene que llevar subido para poder darlo por huérfano.** El archivo
// se sube *antes* de que se guarde la fila que lo nombra —a propósito: al
// revés, cada arrepentimiento dejaría una fila apuntando a un archivo que no
// está—, así que durante unos segundos un archivo legítimo es indistinguible de
// uno sin dueño. Sin esta espera, limpiar justo mientras alguien envía una
// encuesta le borraría la firma que acaba de trazar. Un día es de sobra y no
// cuesta nada: lo que se viene a recuperar lleva meses ahí.
window.GRACIA_HUERFANOS_MS = 24 * 60 * 60 * 1000;

// Cuántas páginas de mil respuestas se admite recorrer. No es un tope de lo que
// se limpia sino de lo que se puede **comprobar**: si se llega a él no se ha
// leído todo y entonces no se ofrece limpiar nada, que es la regla de abajo.
window.MAX_PAGINAS_COMPROBACION = 40;

// La ruta dentro del bucket de una URL pública suya, que es lo que se guarda en
// `answers_json`. Devuelve '' si esa URL no es de este bucket.
window.rutaDeUrlDeBucket = (url, bucket) => {
    const texto = String(url || '');
    const marca = `/${bucket}/`;
    const corte = texto.indexOf(marca);
    if (corte < 0) return '';
    let ruta = texto.slice(corte + marca.length).split('?')[0].split('#')[0];
    try { ruta = decodeURIComponent(ruta); } catch (e) { /* se queda como vino */ }
    return ruta;
};

// Recoge las rutas de este bucket que aparezcan dentro de un `answers_json`.
// Se recorre en profundidad porque ahí dentro no todo son cadenas sueltas:
// `__comentarios` es un objeto, y lo que venga mañana puede serlo también.
window.rutasDeFotosEnRespuesta = (valor, bucket, donde, hondura = 0) => {
    if (typeof valor === 'string') {
        const ruta = window.rutaDeUrlDeBucket(valor, bucket);
        if (ruta) donde.add(ruta);
        return;
    }
    if (!valor || typeof valor !== 'object' || hondura > 3) return;
    Object.values(valor).forEach(v =>
        window.rutasDeFotosEnRespuesta(v, bucket, donde, hondura + 1));
};

// Todas las rutas de `fotos-evaluaciones` que alguna respuesta nombra, o
// **null** si no se pudo leer entero: ahí lo correcto es no ofrecer limpiar
// nada, porque un archivo que no se llegó a mirar parecería no tener dueño.
//
// No se recorren todas las respuestas de la empresa: sólo las de las encuestas
// que pueden guardar una URL aquí —las que llevan alguna pregunta de evidencia
// o de firma, más las «por área», que es donde vivió la vieja `__foto_area`—.
// En un proyecto con trece encuestas eso deja fuera casi todo.
window.fotosUsadasEnRespuestas = async () => {
    const bucket = window.BUCKET_FOTOS_EVAL;

    const { data: preguntas, error: errPreg } = await sb.from('evaluation_questions')
        .select('evaluation_id')
        .in('question_type', [window.TIPO_PREGUNTA_FOTO, window.TIPO_PREGUNTA_FIRMA]);
    if (errPreg) { console.error(errPreg); return null; }

    const { data: porArea, error: errArea } = await sb.from('evaluations')
        .select('id').eq('evaluates_area', true);
    if (errArea) { console.error(errArea); return null; }

    const ids = Array.from(new Set(
        (preguntas || []).map(p => String(p.evaluation_id))
            .concat((porArea || []).map(e => String(e.id)))
    )).filter(Boolean);

    const usados = new Set();
    if (ids.length === 0) return usados;   // no hay ninguna que pueda nombrar nada

    for (let pagina = 0; pagina < window.MAX_PAGINAS_COMPROBACION; pagina++) {
        const desde = pagina * 1000;
        const { data, error } = await sb.from('evaluation_responses')
            .select('answers_json')
            .in('evaluation_id', ids)
            .order('id', { ascending: true })
            .range(desde, desde + 999);
        if (error) { console.error(error); return null; }
        (data || []).forEach(r =>
            window.rutasDeFotosEnRespuesta(r.answers_json, bucket, usados));
        if (!data || data.length < 1000) return usados;
    }

    // Se agotaron las páginas: hay respuestas sin mirar, así que no se sabe.
    return null;
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

window.pedirALaBase = async (funcion, argumentos) => {
    const { data, error } = argumentos ? await sb.rpc(funcion, argumentos) : await sb.rpc(funcion);
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
// **De qué script es cada función**, que ya no son todas del mismo. Mandar a
// correr el que no es se parece demasiado a lo que esta nota vino a evitar: una
// vuelta perdida al editor SQL de Supabase. Lo que no esté aquí es del de
// siempre, que es donde nacieron las cuatro primeras.
window.SCRIPT_DE_FUNCION = {
    consumo_por_dia: 'sql/consumo-datos.sql',
    sumar_consumo: 'sql/consumo-datos.sql'
};

window.notaDeFallo = (funcion) => {
    const msg = window.falloDeLaBase[funcion];
    const script = window.SCRIPT_DE_FUNCION[funcion] || 'sql/consumo-almacenamiento.sql';
    if (!msg) return `Corre <b>${script}</b> en Supabase para que la cuente la base.`;
    if (/could not find|does not exist|schema cache/i.test(msg))
        return `Falta la función <b>${funcion}()</b>: corre <b>${script}</b> en Supabase.`;
    // Un tiempo agotado no es un permiso ni un script que falte: la consulta
    // empezó y no acabó a tiempo. En `tamano_buckets` eso significa que
    // `storage.objects` tiene demasiadas filas para recorrerlas dentro del plazo
    // de PostgREST, y **cuántas son lo dice esta misma pantalla**, en la lista de
    // tablas de abajo. Aquí no se aventura por qué: la primera versión de este
    // mensaje culpaba al hinchado y la tabla no estaba hinchada —tenía 150 mil
    // filas de verdad—, así que mandaba a buscar un problema que no existía.
    if (/timeout|canceling statement/i.test(msg))
        return `<b>${funcion}()</b> tardó más de lo que Supabase deja y se canceló: hay demasiadas filas que recorrer. Mira <b>objects</b> en las tablas de abajo para ver cuántas son.`;
    return `La base rechazó <b>${funcion}()</b>: «${window.sanitizeForHTML(msg)}». La función existe, así que volver a correr el script no lo arregla.`;
};

// La medida entera: los archivos, la base, sus tablas y los huérfanos. Devuelve
// la ficha **sin guardarla en ningún lado**: quien la guarda —y quien decide si
// hay que tomarla siquiera— es `window.medirAlmacenamiento`, que es la puerta.
window.tomarMedidaDeConsumo = async () => {
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

    // Los huérfanos, bucket a bucket. Cada uno dice quién reclama sus archivos:
    // el material, una fila de `materiales_encuesta`; las fotos y las firmas de
    // una encuesta, un `answers_json` que las nombre.
    //
    // **Tres cosas hacen falta para retirar un archivo**, y las tres se deciden
    // aquí: haber podido leer entero lo que podría nombrarlo, que no lo nombre
    // nadie, y que lleve subido más de `GRACIA_HUERFANOS_MS`.
    const huerfanos = [];
    const sinComprobar = [];

    const revisarBucket = async (bucketId, leerUsados) => {
        const b = buckets.find(x => x.id === bucketId);
        if (!b || b.cuantos === 0) return;

        const usados = await leerUsados();
        // Sin la lista entera no se puede decir que a nadie le falte: callar es
        // lo único correcto, y la pantalla lo dice en vez de ofrecer limpiar.
        if (!usados) { sinComprobar.push(b.nombre); return; }

        // Aquí sí hace falta la lista de archivos: para saber cuáles sobran hay
        // que tener sus nombres.
        if (!b.archivos) b.archivos = await window.archivosDelBucket(b.id);

        const limite = Date.now() - window.GRACIA_HUERFANOS_MS;
        b.archivos.forEach(a => {
            if (usados.has(a.ruta)) return;
            // Un archivo sin fecha no se toca: `cuando` llega NaN y la
            // comparación es falsa, que es lo que hay que hacer ante la duda.
            const cuando = a.cuando ? new Date(a.cuando).getTime() : NaN;
            if (!(cuando < limite)) return;
            huerfanos.push({ ruta: a.ruta, nombre: a.nombre, bytes: a.bytes,
                             bucket: b.id, deNombre: b.nombre });
        });
    };

    await revisarBucket(window.BUCKET_MATERIALES, async () => {
        const { data, error } = await sb.from('materiales_encuesta').select('archivo');
        if (error || !Array.isArray(data)) return null;
        return new Set(data.map(f => String(f.archivo)));
    });

    await revisarBucket(window.BUCKET_FOTOS_EVAL, window.fotosUsadasEnRespuestas);

    // Lo que la aplicación se ha bajado en este ciclo, que es la tercera cuota
    // y la única que se gasta sola. Se pide ya sumado por día: con ochenta
    // aparatos el mes son miles de filas, y traérselas para dibujar treinta
    // puntos sería gastar en la consulta justo lo que se está midiendo.
    const ciclo = window.cicloDeConsumo();
    const porDia = await window.pedirALaBase('consumo_por_dia', {
        p_desde: window.diaLocal(ciclo.inicio),
        p_hasta: window.diaLocal(ciclo.fin)
    });

    return {
        ciclo: ciclo,
        egreso: Array.isArray(porDia)
            ? porDia.map(f => ({ dia: String(f.dia).split('T')[0],
                                 bytes: Number(f.bytes) || 0,
                                 dispositivos: Number(f.dispositivos) || 0 }))
            : null,
        buckets: buckets,
        desdeLaBase: desdeLaBase,
        archivos: buckets.reduce((s, b) => s + b.bytes, 0),
        cuantos: buckets.reduce((s, b) => s + b.cuantos, 0),
        sinMedida: buckets.reduce((s, b) => s + (b.sinMedida || 0), 0),
        esquemas: limpiar(esquemas, 'esquema'),
        tablas: tablas,
        base: typeof base === 'number' ? base : null,
        huerfanos: huerfanos,
        sinComprobar: sinComprobar,
        medidoEn: new Date()
    };
};

// La puerta: mide una vez y se queda con lo medido.
//
// `forzar` es lo que pasa el botón de «Volver a medir», y es el único camino que
// vuelve a preguntarle a la base. Sin él, una medida ya tomada se devuelve tal
// cual: abrir la hoja no es pedir una medición, es querer ver la última.
//
// **Una medición de camino se comparte pase lo que pase**, también al forzar: la
// que ya va es tan fresca como la que se lanzaría, y dos a la vez son dos veces
// las mismas consultas para acabar guardando una sola.
window.medirAlmacenamiento = (forzar) => {
    if (window.medicionDeConsumo) return window.medicionDeConsumo;
    if (!forzar && window.consumoAlmacenamiento) return Promise.resolve(window.consumoAlmacenamiento);

    window.medicionDeConsumo = (async () => {
        try {
            const medida = await window.tomarMedidaDeConsumo();
            window.consumoAlmacenamiento = medida;
            return medida;
        } finally {
            // Se suelta pase lo que pase. Soltándola sólo por el camino bueno,
            // un fallo de red dejaría la pantalla devolviendo para siempre la
            // promesa rota de aquella vez y no habría manera de volver a medir.
            window.medicionDeConsumo = null;
        }
    })();
    return window.medicionDeConsumo;
};

// ------------------------------------------------------------------
// LA HOJA
// ------------------------------------------------------------------
// Abrir la hoja **no es pedir una medición**: es querer ver la última. Con una
// ya tomada, la pantalla sale entera en el primer fotograma y el spinner se
// queda para lo que de verdad hace esperar —la primera vez y el botón de volver
// a medir—.
window.abrirConsumoAlmacenamiento = async (forzar) => {
    const hoja = document.getElementById('modal-almacenamiento');
    if (!hoja) return;

    window.bucketAbierto = null;
    hoja.style.display = 'flex';

    if (!forzar && window.consumoAlmacenamiento && !window.medicionDeConsumo) {
        window.pintarConsumo();
        return;
    }

    window.pintarConsumo(`<div class="consumo-cargando"><div class="spinner"></div>Midiendo los archivos…</div>`);

    try {
        await window.medirAlmacenamiento(forzar);
    } catch (e) {
        console.error(e);
        window.pintarConsumo(`<div class="consumo-cargando">No se pudo medir: ${window.sanitizeForHTML(e.message || String(e))}</div>`);
        return;
    }
    // La hoja pudo cerrarse mientras la medida venía de camino: lo medido queda
    // guardado igual, y lo pinta la próxima vez que se abra.
    if (hoja.style.display === 'none') return;
    window.pintarConsumo();
};

// El botón de «Volver a medir» del encabezado, que desde que abrir la hoja no
// mide es el único camino que vuelve a preguntarle a la base.
//
// Mientras lo hace tiene que decirlo: gira con `esta-actualizando` y se apaga,
// igual que el botón de recargar del panel y por lo mismo —un botón de icono no
// tiene texto que atenuar, así que sin eso se ve igual que antes de pulsarlo,
// que es lo que lleva a pulsarlo otra vez—. El estado va en el giro y en el
// cuerpo de la hoja, nunca con `innerText`: eso le borraría el `<svg>`.
window.remedirConsumo = async () => {
    const btn = document.getElementById('btn-remedir-almacenamiento');
    if (btn) { btn.disabled = true; btn.classList.add('esta-actualizando'); }
    try {
        await window.abrirConsumoAlmacenamiento(true);
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('esta-actualizando'); }
    }
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

// Cuánto hace que se midió, y sale **sólo cuando ya no es de ahora mismo**.
// Desde que la medida sobrevive a cerrar la hoja, la que se está leyendo puede
// ser de hace media hora, y la hora sola obliga a restarla mentalmente contra el
// reloj de arriba para darse cuenta. Recién medido no se dice nada: un «hace 0
// min» sería ruido justo donde no hay ninguna duda.
window.antiguedadDeLaMedida = (fecha) => {
    if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
    const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
    if (minutos < 1) return '';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    return `hace ${horas} h`;
};

// ------------------------------------------------------------------
// LO QUE SE BAJA CADA MES
// ------------------------------------------------------------------
// Es la tercera cuota y **la única con reloj**: los archivos y la base crecen
// despacio y se quedan donde estén, mientras que el tráfico se reinicia cada
// ciclo y se gasta solo, a razón de lo que la plantilla abra la aplicación. Por
// eso su tarjeta va la primera: es la que puede reventar este mes.
//
// Y por eso lleva gráfica y las otras dos no. Un total a mitad de mes no dice
// nada —2 GB el día 5 es un problema y el día 28 no lo es—, así que lo que hay
// que ver es **cómo se va acumulando contra la cuota** y a qué ritmo: eso es lo
// que avisa con tiempo de tomar contramedidas, que es a lo que se vino.

// El ritmo del ciclo llevado hasta el final. Se divide por los días **corridos
// de verdad**, con su fracción: contando hoy como un día entero cuando van tres
// horas, la proyección sale optimista justo el día en que hay que reaccionar.
//
// Los primeros días no se proyecta: con medio día corrido, una foto de más
// multiplica por sesenta y el número diría cualquier cosa. Ahí lo que se lee es
// la línea.
window.MINIMO_PARA_PROYECTAR = 1.5;   // días corridos

window.proyeccionDeConsumo = (total, ciclo, ahora) => {
    if (!ciclo || !(total > 0)) return null;
    const dia = 24 * 60 * 60 * 1000;
    const corridos = ((ahora instanceof Date ? ahora : new Date()) - ciclo.inicio) / dia;
    if (!(corridos >= window.MINIMO_PARA_PROYECTAR)) return null;
    return total * (ciclo.dias / corridos);
};

// El color de una cifra contra su cuota, que es el de `barraDeCuota`: verde
// hasta el 70%, ámbar hasta el 90 y rojo de ahí. Vive aparte porque la
// proyección lo necesita sin barra que pintar.
window.colorDeCuota = (bytes, cuota) => {
    const parte = cuota > 0 ? bytes / cuota : 0;
    return parte >= 0.9 ? '#dc2626' : (parte >= 0.7 ? '#d97706' : '#16a34a');
};

// Un día del ciclo en corto: «12 sep».
window.diaCortoDeCiclo = (iso) => {
    const f = window.fechaDeRegistro(iso);
    if (!f) return String(iso || '');
    return `${f.getDate()} ${window.MESES_CORTOS[f.getMonth()]}`;
};

// La acumulación del ciclo: un punto por día corrido, cada uno con lo suyo y
// con lo que se lleva sumado.
//
// **Sólo hasta hoy.** Dibujar los días que faltan con el acumulado de hoy
// trazaría una línea plana hasta fin de mes, que se lee como que la aplicación
// dejó de bajar datos; lo que va del otro lado es la proyección, y ésa va a
// trazos porque no ha pasado.
window.acumuladoDelCiclo = (egreso, ciclo) => {
    if (!ciclo) return [];
    const porDia = {};
    (egreso || []).forEach(f => { porDia[f.dia] = f; });

    const puntos = [];
    let suma = 0;
    for (let i = 0; i < ciclo.transcurridos; i++) {
        const f = new Date(ciclo.inicio.getFullYear(), ciclo.inicio.getMonth(), ciclo.inicio.getDate() + i);
        const iso = window.diaLocal(f);
        const fila = porDia[iso] || { bytes: 0, dispositivos: 0 };
        suma += fila.bytes;
        puntos.push({ dia: iso, fecha: f, bytes: fila.bytes,
                      dispositivos: fila.dispositivos, acumulado: suma });
    }
    return puntos;
};

// La gráfica: el área que sube, la cuota a trazos y la proyección desde hoy
// hasta el cierre del ciclo.
//
// **Se dibuja a mano en SVG**, como la de una clasificación y por lo mismo:
// Chart mide el lienzo al dibujarlo y aquí la hoja está en `display:none` hasta
// el instante anterior. Lo que no hace falta es la maquinaria de medir y
// redibujar de `graficaDeLinea`: aquella vive en la tarjeta del panel, que en
// una laptop se estira hasta 890px; ésta va dentro de una hoja topada a 560, así
// que con el `max-width` de `.consumo-grafica` el trazo no crece más de lo que
// crecía allí y no hay nada que volver a medir.
window.ALTO_GRAFICA_CONSUMO = 150;

window.graficaDeConsumo = (puntos, ciclo, cuota) => {
    if (!ciclo || !puntos || puntos.length < 2) return '';

    const A = 320, H = window.ALTO_GRAFICA_CONSUMO;
    const izq = 40, der = 8, arriba = 12, abajo = 20;
    const ancho = A - izq - der, alto = H - arriba - abajo;

    const total = puntos[puntos.length - 1].acumulado;
    const proyeccion = window.proyeccionDeConsumo(total, ciclo);
    const techo = Math.max(cuota, total, proyeccion || 0) * 1.04;

    // Un día por paso: el primero pegado al eje y el último en el borde, que es
    // el cierre del ciclo y donde va a parar la proyección.
    const x = (i) => izq + (ciclo.dias <= 1 ? 0 : (i / (ciclo.dias - 1)) * ancho);
    const y = (b) => arriba + alto - (techo > 0 ? Math.min(1, b / techo) : 0) * alto;

    const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.acumulado).toFixed(1)}`).join(' ');
    const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${(arriba + alto).toFixed(1)} L${x(0).toFixed(1)},${(arriba + alto).toFixed(1)} Z`;

    // Las referencias: 0, la mitad de la cuota y la cuota. La de la cuota va
    // con su color y su rótulo, que es contra lo que se lee todo lo demás.
    const refs = [0, cuota / 2, cuota].map(v => {
        const yy = y(v);
        if (yy < arriba - 1 || yy > arriba + alto + 1) return '';
        const esCuota = v === cuota;
        return `<line x1="${izq}" y1="${yy.toFixed(1)}" x2="${A - der}" y2="${yy.toFixed(1)}"
                      stroke="${esCuota ? '#dc2626' : '#e2e8f0'}" stroke-width="1"
                      ${esCuota ? 'stroke-dasharray="4 3"' : ''} />
                <text x="${izq - 5}" y="${(yy + 3).toFixed(1)}" text-anchor="end"
                      font-size="8" fill="${esCuota ? '#dc2626' : '#94a3b8'}">${window.pesoLegible(v) || '0'}</text>`;
    }).join('');

    // El eje de abajo: el día 1, el último y uno de cada cinco. Rotular los
    // treinta deja una tira ilegible en un teléfono.
    const paso = ciclo.dias > 20 ? 5 : (ciclo.dias > 10 ? 3 : 2);
    let ejeX = '';
    for (let i = 0; i < ciclo.dias; i++) {
        if (i !== 0 && i !== ciclo.dias - 1 && (i + 1) % paso !== 0) continue;
        const f = new Date(ciclo.inicio.getFullYear(), ciclo.inicio.getMonth(), ciclo.inicio.getDate() + i);
        ejeX += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle"
                       font-size="8" fill="#94a3b8">${f.getDate()}</text>`;
    }

    // La proyección: de donde se está hasta el cierre. A trazos porque no ha
    // pasado, y del color que le toque a donde va a parar —es lo único de la
    // tarjeta que puede salir en rojo antes de que el problema ocurra, que es
    // para lo que está—.
    const iHoy = puntos.length - 1;
    const proy = proyeccion && ciclo.transcurridos < ciclo.dias
        ? `<line x1="${x(iHoy).toFixed(1)}" y1="${y(total).toFixed(1)}"
                 x2="${x(ciclo.dias - 1).toFixed(1)}" y2="${y(proyeccion).toFixed(1)}"
                 stroke="${window.colorDeCuota(proyeccion, cuota)}" stroke-width="2"
                 stroke-dasharray="5 4" stroke-linecap="round" opacity="0.85" />
           <circle cx="${x(ciclo.dias - 1).toFixed(1)}" cy="${y(proyeccion).toFixed(1)}" r="3"
                   fill="${window.colorDeCuota(proyeccion, cuota)}" opacity="0.85" />`
        : '';

    // Un globo por día, en un rectángulo transparente que sí se puede señalar:
    // la línea es de dos píxeles y el punto de tres, y ninguno de los dos se
    // acierta con el ratón. Es un `<title>`, como el resto de los globos de la
    // aplicación, así que no hace falta ninguna función colgada de `window`.
    const mitad = ciclo.dias > 1 ? (ancho / (ciclo.dias - 1)) / 2 : ancho;
    const globos = puntos.map((p, i) => `
        <rect x="${(x(i) - mitad).toFixed(1)}" y="${arriba}" width="${(mitad * 2).toFixed(1)}" height="${alto}"
              fill="transparent"><title>${window.sanitizeForHTML(
                  `${window.diaCortoDeCiclo(p.dia)} · ${window.pesoLegible(p.bytes) || '0 KB'}`
                  + ` · acumulado ${window.pesoLegible(p.acumulado) || '0 KB'}`
                  + (p.dispositivos ? ` · ${p.dispositivos} aparato${p.dispositivos === 1 ? '' : 's'}` : ''))}</title></rect>`).join('');

    return `
        <div class="consumo-grafica">
            <svg viewBox="0 0 ${A} ${H}" role="img"
                 aria-label="Datos bajados acumulados en el ciclo, contra la cuota mensual">
                ${refs}
                <path d="${area}" fill="#0891b2" opacity="0.12" />
                <path d="${linea}" fill="none" stroke="#0891b2" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round" />
                ${proy}
                <circle cx="${x(iHoy).toFixed(1)}" cy="${y(total).toFixed(1)}" r="3" fill="#0891b2" />
                ${ejeX}
                ${globos}
            </svg>
        </div>`;
};

// La tarjeta entera. Sin la función en la base no se dibuja ninguna cifra —un
// «0 GB» diría que no se ha bajado nada, que es lo contrario de la verdad— y se
// dice qué script falta, como hacen las otras dos.
window.tarjetaDeEgreso = (c) => {
    const ciclo = c.ciclo || window.cicloDeConsumo();
    const desde = window.diaCortoDeCiclo(window.diaLocal(ciclo.inicio));
    const hasta = window.diaCortoDeCiclo(window.diaLocal(new Date(ciclo.fin.getTime() - 86400000)));

    if (!c.egreso) {
        return `<div class="consumo-tarjeta">
                    <div class="consumo-rotulo">Datos descargados</div>
                    <div class="consumo-pie">No se puede medir todavía. ${window.notaDeFallo('consumo_por_dia')}
                        Mientras tanto cada teléfono sigue apuntando lo suyo, así que en cuanto exista la función
                        llegará también lo de estos días.</div>
                </div>`;
    }

    const puntos = window.acumuladoDelCiclo(c.egreso, ciclo);
    const total = puntos.length ? puntos[puntos.length - 1].acumulado : 0;

    // **Cero no es lo mismo que «todavía es pronto».** Con el script corrido y
    // sin un solo byte apuntado, lo que pasa es que ningún teléfono ha
    // reportado aún —acaba de correrse, o ninguno ha abierto la aplicación
    // desde entonces—, y decir «a este ritmo» de un ritmo que no existe, o
    // dibujar una línea plana en el suelo, se lee como que no se está gastando
    // nada. Se dice lo que de verdad ocurre.
    if (!(total > 0)) {
        return `<div class="consumo-tarjeta">
                    <div class="consumo-rotulo">Datos descargados</div>
                    <div class="consumo-pie">Del ${desde} al ${hasta}: todavía no ha reportado ningún aparato.
                        Cada teléfono manda lo suyo mientras se usa la aplicación, así que la cifra aparece
                        en cuanto alguien la abra.</div>
                </div>`;
    }

    const proyeccion = window.proyeccionDeConsumo(total, ciclo);
    const aparatos = Math.max(0, ...(c.egreso.map(f => f.dispositivos) || [0]));

    // El pie dice las tres cosas que hacen falta para decidir: entre qué fechas
    // va el ciclo, cuántos aparatos lo llenaron y a dónde va a parar el mes. Lo
    // último, con todas las letras cuando se va a pasar: es el aviso.
    const cierre = proyeccion === null
        ? 'Todavía es pronto para proyectar el cierre del ciclo.'
        : (proyeccion > window.CUOTA_EGRESO
            ? `<b style="color:#dc2626;">A este ritmo el ciclo cierra en ${window.pesoLegible(proyeccion)}, por encima de la cuota.</b>`
            : `A este ritmo el ciclo cierra en ${window.pesoLegible(proyeccion)}.`);

    return `
        <div class="consumo-tarjeta">
            <div class="consumo-rotulo">Datos descargados</div>
            <div class="consumo-cifra">
                <span class="consumo-cifra-numero">${window.pesoLegible(total) || '0 KB'}</span>
                <span class="consumo-cifra-pct">${window.pctTexto(total, window.CUOTA_EGRESO)}% de ${window.pesoLegible(window.CUOTA_EGRESO)}</span>
            </div>
            ${window.barraDeCuota(total, window.CUOTA_EGRESO)}
            ${window.graficaDeConsumo(puntos, ciclo, window.CUOTA_EGRESO)}
            <div class="consumo-pie">Del ${desde} al ${hasta}, día ${ciclo.transcurridos} de ${ciclo.dias}${
                aparatos > 0 ? ` · ${aparatos} aparato${aparatos === 1 ? '' : 's'}` : ''}. ${cierre}</div>
        </div>`;
};

window.pantallaDeConsumo = (c) => {
    const subtitulo = document.getElementById('subtitulo-almacenamiento');
    if (subtitulo) subtitulo.innerText = [
        `Medido a las ${window.horaLegible(c.medidoEn)}`,
        window.antiguedadDeLaMedida(c.medidoEn)
    ].filter(Boolean).join(' · ');

    // **Un total que puede quedarse corto no se dibuja como una cifra cerrada.**
    // Contando desde el cliente, un bucket cuya política no deje listarlo sale en
    // cero sin dar error, así que el total es un **suelo** y no una medida: aquí
    // decía «425.1 MB · 42% de 1.00 GB» mientras el bucket de las firmas
    // escondía 343 MB y la cuota real iba por el 75%. El aviso estaba en el pie
    // y no sirvió de nada — lo que se lee es el número gordo—, así que la duda
    // tiene que ir **pegada a la cifra**: un «Al menos» encima, en su renglón.
    // Probé antes a meterle un «≥» al número y un «al menos» al porcentaje, y en
    // un iPhone de 375 los partía a los dos en dos renglones: en esa fila no
    // sobra ancho. En su propio renglón no cuesta nada y además se lee antes.
    const resumen = (rotulo, bytes, cuota, pie, incierto) => `
        <div class="consumo-tarjeta">
            <div class="consumo-rotulo">${rotulo}</div>
            ${incierto ? '<div class="consumo-incierto">Al menos</div>' : ''}
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

    // Un huérfano es un archivo que ninguna fila de la base nombra: o su ficha
    // no llegó a guardarse, o la fila que lo nombraba se borró y él se quedó.
    // No lo enseña ninguna pantalla y sólo ocupa sitio.
    const h = c.huerfanos;
    const bytesHuerfanos = (h || []).reduce((s, a) => s + a.bytes, 0);
    const uno = h && h.length === 1;

    // De qué bucket es cada uno: son dos y no dicen lo mismo, así que el aviso
    // los reparte en vez de dar un total que no se sabe de dónde sale.
    const porBucket = {};
    (h || []).forEach(a => {
        if (!porBucket[a.deNombre]) porBucket[a.deNombre] = { cuantos: 0, bytes: 0 };
        porBucket[a.deNombre].cuantos++;
        porBucket[a.deNombre].bytes += a.bytes;
    });
    const reparto = Object.keys(porBucket).length > 1
        ? `<div class="consumo-aviso-texto">${Object.entries(porBucket)
              .map(([n, d]) => `${window.sanitizeForHTML(n)}: ${d.cuantos} · ${window.pesoLegible(d.bytes)}`)
              .join('<br>')}</div>`
        : '';

    // Lo que no se pudo comprobar se dice igual, y se dice **aunque no haya
    // ningún huérfano que ofrecer**: callarlo dejaría creer que ahí está todo
    // revisado y que no sobra nada.
    const sc = c.sinComprobar || [];
    const sinComprobarHtml = sc.length > 0 ? `
        <div class="consumo-aviso">
            <div class="consumo-aviso-titulo">Sin comprobar: ${window.sanitizeForHTML(sc.join(', '))}</div>
            <div class="consumo-aviso-texto">No se pudo leer entero lo que podría nombrar esos archivos, así que no se sabe cuáles sobran y no se ofrece quitar ninguno. Vuelve a abrir esta pantalla con mejor conexión.</div>
        </div>` : '';

    const huerfanosHtml = ((h && h.length > 0) ? `
        <div class="consumo-aviso">
            <div class="consumo-aviso-titulo">${h.length} archivo${uno ? '' : 's'} sin dueño · ${window.pesoLegible(bytesHuerfanos)}</div>
            ${reparto}
            <div class="consumo-aviso-texto">${uno
                ? 'Ninguna fila de la base lo nombra: o su ficha no llegó a guardarse, o se borró lo que lo nombraba. No lo enseña ninguna pantalla, así que quitarlo no le cambia nada a nadie.'
                : 'Ninguna fila de la base los nombra: o su ficha no llegó a guardarse, o se borró lo que los nombraba. No los enseña ninguna pantalla, así que quitarlos no le cambia nada a nadie.'}</div>
            <button type="button" class="consumo-aviso-boton" onclick="window.limpiarHuerfanos()">Quitar ${uno ? 'el huérfano' : 'los huérfanos'}</button>
        </div>` : '') + sinComprobarHtml;

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
        : `Contados listando cada bucket desde la aplicación, y <b>eso no ve los buckets cuya política no deje listarlos</b>: salen en cero y su peso falta de este total. ${window.notaDeFallo('tamano_buckets')}`;
    const sinMedida = c.sinMedida > 0
        ? ` ${c.sinMedida} sin tamaño registrado, que cuentan como cero.` : '';

    return window.tarjetaDeEgreso(c) +
           resumen('Archivos', c.archivos, window.CUOTA_ARCHIVOS,
               `${c.cuantos} archivo${c.cuantos === 1 ? '' : 's'} en ${c.buckets.length} buckets. ${origen}${sinMedida}`,
               !c.desdeLaBase) +
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

    // De consulta: lo que tiene dueño se quita desde donde vive, que es lo que
    // se lleva también su fila. Lo único que sale de aquí son los huérfanos, y
    // ésos no los reclama nadie.
    const notaPorBucket = {
        [window.BUCKET_MATERIALES]: 'Para quitar un material, hazlo desde su encuesta: así se va también su ficha. De aquí sólo salen los archivos que ya no nombra ninguna fila.',
        [window.BUCKET_FOTOS_EVAL]: 'Una foto o una firma son constancia y no se quitan de aquí: se van con la respuesta que las nombra. De aquí sólo salen las que ya no nombra ninguna.'
    };
    const nota = b.borrable
        ? `<div class="consumo-pie" style="padding:0 2px 12px;">${notaPorBucket[b.id] || 'De este bucket sólo salen los archivos que ya no nombra ninguna fila.'}</div>`
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
        ? `Se quitará 1 archivo (${window.pesoLegible(bytes)}).\n\nNinguna fila de la base lo nombra, así que no se pierde nada de lo que se ve en la aplicación.`
        : `Se quitarán ${cuantos} archivos (${window.pesoLegible(bytes)}).\n\nNinguna fila de la base los nombra, así que no se pierde nada de lo que se ve en la aplicación.`;
    if (!confirm(`${aviso}\n\n¿Continuar?`)) return;

    // Cada bucket se borra por su cuenta: `remove` es de uno solo. Las
    // políticas van por bucket y por operación, así que uno puede dejar borrar
    // y el otro no —y eso es exactamente lo que pasa mientras no se haya
    // corrido el script que abre el borrado de las fotos—.
    const porBucket = {};
    c.huerfanos.forEach(a => {
        if (!porBucket[a.bucket]) porBucket[a.bucket] = { nombre: a.deNombre, rutas: [] };
        porBucket[a.bucket].rutas.push(a.ruta);
    });

    let quitados = 0;
    const seResistieron = [];
    for (const [bucket, datos] of Object.entries(porBucket)) {
        let deEste = 0;
        for (let i = 0; i < datos.rutas.length; i += 100) {
            const { data, error } = await sb.storage.from(bucket).remove(datos.rutas.slice(i, i + 100));
            if (error) { console.error(error); break; }
            deEste += (data || []).length;
        }
        quitados += deEste;
        // Cuenta las filas que devuelve `remove`: una política que lo rechace
        // no da error, simplemente no borra nada.
        if (deEste === 0) seResistieron.push(datos.nombre);
    }

    if (quitados === 0) {
        alert(`No se quitó ningún archivo. Puede que la política del bucket no deje borrar:\n\n· Material de encuestas → sql/materiales-encuesta.sql\n· Fotos de evaluaciones → sql/fotos-evaluaciones.sql\n\nRevisa que se hayan corrido en el editor SQL de Supabase.`);
        return;
    }

    const resto = seResistieron.length > 0
        ? `\n\nNo se pudo con los de: ${seResistieron.join(', ')}. Su bucket no deja borrar todavía; corre su script de sql/.`
        : '';
    alert((quitados === 1 ? "Se quitó 1 archivo." : `Se quitaron ${quitados} archivos.`) + resto);
    // Aquí sí hay que volver a medir, y forzando: la medida que hay guardada
    // cuenta los archivos que se acaban de quitar, así que dibujarla otra vez
    // enseñaría el mismo total y los mismos huérfanos que ya no están.
    await window.remedirConsumo();
};
