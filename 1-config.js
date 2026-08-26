// ==========================================
// 1-config.js (V3 FINAL: CONTROL GLOBAL + MONITOR)
// ==========================================

// --- CREDENCIALES SUPABASE ---
const SUPABASE_URL = 'https://gyoyubhftsbihzpivzrf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5b3l1YmhmdHNiaWh6cGl2enJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMTIxODEsImV4cCI6MjA4Mzg4ODE4MX0.bccD9hulGvQo1A367regqLUronJYQPLdnQ9KnIII5XU';

// Inicializamos el cliente
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIABLES GLOBALES DEL SISTEMA ---
window.PASSWORD_ADMIN = "ensamble";
window.TAMANO_PAGINA = 5;

// --- CONFIGURACIÓN DE CONSUMO DE DATOS (GLOBAL) ---
// Valor inicial (se actualiza automáticamente al conectar con la BD)
window.MODO_AHORRO_DATOS = false;

// Función para descargar la orden del Administrador desde la Nube
window.cargarConfiguracionGlobal = async () => {
    try {
        const { data, error } = await sb
            .from('system_config')
            .select('value')
            .eq('key', 'ahorro_datos')
            .single();
            
        if (data) {
            window.MODO_AHORRO_DATOS = data.value;
            console.log("☁️ Configuración sincronizada. Ahorro Activo:", window.MODO_AHORRO_DATOS);
            
            // Si el botón de admin ya existe en la pantalla, actualizamos su color
            const btn = document.getElementById('btn-toggle-ahorro');
            if(btn && window.actualizarBotonAhorroVisual) {
                window.actualizarBotonAhorroVisual(btn);
            }
        }
    } catch (e) {
        console.warn("No se pudo cargar config global (usando default):", e.message);
    }
};

// Ejecutamos la carga inmediatamente
window.cargarConfiguracionGlobal();

// Función Global para interceptar URLs de imágenes
window.procesarUrlImagen = (urlOriginal) => {
    if (!urlOriginal) return 'assets/no-image.png'; // Imagen local por defecto
    
    if (window.MODO_AHORRO_DATOS) {
        // Retorna un pixel transparente para NO gastar ancho de banda
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }
    
    return urlOriginal;
};

// =========================================================
// --- TEXTO DE UN BOTÓN QUE CAMBIA DESDE EL CÓDIGO ---
// =========================================================
//
// `btn.innerText = 'Guardando…'` borra todo lo que hubiera dentro del botón:
// el `<svg>` de un icono, un `<span>` con el emoji, cualquier marcado. Por eso
// los botones que anuncian su estado —el del modo ahorro, el de respaldar—
// tenían que ser de texto pelado, y la primera vez que alguien les metiera un
// icono se lo llevaba el primer toque.
//
// Con esto el botón puede llevar dentro lo que quiera: la escritura va al
// `<span data-texto>` si existe, y sólo cae sobre el botón entero cuando no lo
// hay, que es como se comportaba antes. Devuelve siempre el texto que había,
// para poder restaurarlo al terminar:
//
//     const anterior = window.textoBoton(btn, '⏳…');
//     …
//     window.textoBoton(btn, anterior);
//
// Sin segundo argumento sólo lee. Se usa `textContent` y no `innerText`
// porque leer `innerText` obliga al navegador a recalcular el diseño.
window.textoBoton = (btn, nuevoTexto) => {
    if (!btn) return '';
    const destino = btn.querySelector('[data-texto]') || btn;
    const anterior = destino.textContent.trim();
    if (nuevoTexto !== undefined) destino.textContent = nuevoTexto;
    return anterior;
};

// =========================================================
// --- QUIÉN DEBE FIRMAR UN REGISTRO ---
// =========================================================
// Firma todo empleado activo dado de alta en o antes de la fecha del registro,
// salvo los puestos exentos. Las capacitaciones no se firman y quedan fuera de
// cualquier conteo de avance.
//
// La regla vivía copiada en los badges del panel (2b-core-dashboard.js), en los
// incidentes (3-incidentes.js), en los pendientes (7-pendientes.js) y en las
// estadísticas (9-estadisticas.js), y se había separado: la tarjeta del
// incidente no descontaba a los puestos exentos y ninguna miraba las bajas.
// Ahora las cuatro llaman aquí para que den el mismo número.

window.PUESTOS_EXENTOS_DE_FIRMAR = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"];

window.esPuestoExentoDeFirmar = (puesto) =>
    window.PUESTOS_EXENTOS_DE_FIRMAR.includes(String(puesto === null || puesto === undefined ? "" : puesto).trim().toUpperCase());

// Un empleado dado de baja no puede firmar: no cuenta como pendiente ni engorda
// el denominador del avance. Vale cualquiera de las dos formas del campo
// —`isActive` en las cachés del navegador, `is_active` tal como viene de la
// base— y ante la duda se le da por activo, que es como estaban las cosas antes
// de que la columna existiera.
window.empleadoActivo = (emp) => {
    if (!emp) return true;
    return emp.isActive !== false && emp.is_active !== false;
};

// Las fechas de los registros llegan como 'YYYY-MM-DD' y hay que armarlas a
// mano: `new Date('2026-01-31')` se lee en UTC y la zona horaria la corre un
// día hacia atrás.
window.fechaDeRegistro = (texto) => {
    if (texto instanceof Date) return texto;
    const partes = String(texto === null || texto === undefined ? "" : texto).split('T')[0].split('-');
    if (partes.length !== 3 || !partes[0] || !partes[1] || !partes[2]) return null;
    return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
};

// La fecha de alta sí viene como timestamp completo; se recorta a medianoche
// para poder compararla con la del registro.
window.fechaDeAltaEmpleado = (emp) => {
    const alta = (emp && emp.date) ? new Date(emp.date) : new Date(0);
    alta.setHours(0, 0, 0, 0);
    return alta;
};

window.leTocaFirmar = (emp, fechaRegistro) => {
    if (!emp || !fechaRegistro) return false;
    if (!window.empleadoActivo(emp)) return false;
    if (window.esPuestoExentoDeFirmar(emp.puesto)) return false;
    return window.fechaDeAltaEmpleado(emp) <= fechaRegistro;
};

// =========================================================
// --- ENCUESTAS INACTIVAS ---
// =========================================================
// Una encuesta inactiva sigue en la base con todas sus respuestas, pero deja
// de existir para el usuario: no aparece en la lista de encuestas, no genera
// pendientes ni la cuentan como atrasada, y queda fuera de las estadísticas.
// Sólo la ve —y la puede volver a encender— quien esté en modo administrador.
//
// La columna `active` ya venía en la tabla y todas las consultas que arman
// pendientes filtran por ella (`2b-core-dashboard.js`, `7-pendientes.js`,
// `6-calendario.js`), así que apagarla basta para que dejen de contar. Lo que
// faltaba era poder apagarla desde la aplicación y no dar por activa a la que
// no lo dice.
//
// Si el campo no viene en la consulta se da por activa, que es como estaban
// las cosas cuando nadie lo apagaba.
window.encuestaActiva = (ev) => {
    if (!ev) return false;
    if (ev.active === undefined || ev.active === null) return true;
    return ev.active !== false && String(ev.active).toLowerCase() !== 'false';
};

// =========================================================
// --- CERTIFICACIÓN POR CLASIFICACIÓN ---
// =========================================================
// Certificar es dar fe de que las respuestas de alguien son verídicas, así que
// una certificación es siempre **de una persona y de un periodo**. Sin el
// periodo, el sello de enero seguiría valiendo en diciembre.
//
// Una clasificación puede mezclar frecuencias —una encuesta mensual y una anual
// bajo el mismo rótulo—, así que no hay un periodo de la clasificación: cada
// encuesta se mira en **su** periodo vigente, el mismo con el que
// `7-pendientes.js` decide qué te toca contestar. Las de una sola vez (`once`)
// no tienen periodo que cerrar y cuentan «alguna vez».
//
// La regla vive aquí porque la usan el panel del usuario
// (`4-evaluaciones-base.js`) y las pantallas del administrador
// (`4-evaluaciones-admin.js`): ninguna vuelve a escribir la comparación de
// estados ni la de fechas.

// Escapa un texto que va a meterse en el marcado. Vivía en
// `4b-evaluaciones-stats.js`, pero lo usan también las pantallas del
// administrador, que se cargan antes que ese archivo: un ayudante de escapado
// no puede depender del orden de carga, así que vive aquí, en el primero.
window.sanitizeForHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

// A quién le toca contestar una encuesta. Estaba escrito dentro del filtro de
// la lista de `4-evaluaciones-base.js`, atado al usuario de la sesión. La
// pantalla que certifica por clasificación tiene que preguntar lo mismo de
// otras personas, y si cada una escribiera su versión el administrador podría
// certificar un juego de encuestas distinto del que ve el interesado.
//
// `tieneEquipo` es si esa persona tiene subordinados directos: las encuestas de
// modo `boss` sólo le tocan a quien tenga a quién evaluar.
//
// Ojo: esta regla **no** mira `target_departments`, que sí usa la pantalla de
// estadísticas para contar asignadas. Es una discrepancia que ya existía; se
// respeta tal cual porque es la que decide lo que la gente ve en su panel, y
// cambiarla movería las encuestas de sitio a todo el mundo.
window.leTocaEstaEncuesta = (ev, empleado, tieneEquipo) => {
    if (!ev || !empleado) return false;
    if (ev.mode === 'boss' && !tieneEquipo) return false;

    const comoLista = (valor) => {
        let v = valor;
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch (e) { v = ['ALL']; }
        }
        return Array.isArray(v) ? v : ['ALL'];
    };

    // Dirigida a personas concretas: manda sobre todo lo demás.
    const destinatarios = comoLista(ev.target_employees);
    if (destinatarios.length > 0 && !destinatarios.includes('ALL')) {
        return destinatarios.includes(String(empleado.id));
    }

    // Una lista vacía o con 'ALL' no acota nada; si acota, hay que estar en ella.
    const acota = (valor, valorDelEmpleado, siFalta) => {
        const lista = comoLista(valor);
        if (lista.length === 0 || lista.includes('ALL')) return true;
        const mio = String(valorDelEmpleado === null || valorDelEmpleado === undefined ? '' : valorDelEmpleado)
            .trim().toUpperCase() || siFalta;
        return lista.map(t => String(t).toUpperCase().trim()).includes(mio);
    };

    // Aquí estaba `if (ev.is_obligatory !== false) return true;`, que salía
    // antes de mirar el puesto: una encuesta obligatoria dirigida a ciertos
    // puestos se le contaba a todo el mundo, y por eso el avance de una
    // clasificación decía «6 de 7» a quien sólo tenía seis. Obligatoria
    // significa que no se puede dejar sin contestar —así lo dice la casilla del
    // formulario, «Si se desactiva, será opcional»—, no que sea para todos, y
    // el resto de la aplicación (dashboard, pendientes, estadísticas) siempre
    // respetó el puesto. Ésta era la única regla que no.
    if (!acota(ev.target_positions, empleado.puesto, 'SIN PUESTO')) return false;

    // El departamento se mira igual, que es lo que ya hacían el dashboard y los
    // pendientes; esta regla era también la única que lo ignoraba.
    const deptoDelEmpleado = empleado.dept !== undefined ? empleado.dept
        : (empleado.department !== undefined ? empleado.department : empleado.departamento);
    if (!acota(ev.target_departments, deptoDelEmpleado, 'SIN DEPARTAMENTO')) return false;

    return true;
};

// Si esa persona tiene subordinados directos, que es lo que decide si le tocan
// las encuestas de modo `boss`.
window.tieneEquipoDirecto = (empleadoId) =>
    (window.todosLosEmpleadosData || []).some(e => String(e.supId) === String(empleadoId));

// Quién es jefe inmediato de quién. `esSupervisorDirecto` de
// `4-evaluaciones-admin.js` es esto mismo dando por hecho que el revisor es el
// usuario de la sesión; el panel principal recorre a mucha gente y necesita
// preguntarlo de cualquiera.
window.esSupervisorDirectoDe = (empleadoId, supervisorId) => {
    if (!empleadoId || !supervisorId) return false;
    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(empleadoId));
    return !!emp && String(emp.supId) === String(supervisorId);
};

// ==========================================
// FOTOGRAFÍAS: ENCOGER ANTES DE SUBIR
// ==========================================
// La cuenta de Supabase es gratuita y una foto de teléfono pesa varios MB, así
// que ninguna se sube tal cual: se reescala por su lado más largo y se comprime
// hasta caber en el tope de bytes. Vive aquí porque la usan el panel de
// refacciones y el de evaluaciones, que son documentos distintos y no comparten
// más JavaScript que este archivo.
//
//     await window.optimizarImagen(file)                       // 800px, 1 MB
//     await window.optimizarImagen(file, { maxLado: 600, maxBytes: 300 * 1024 })
//
// WebP primero, que pesa la mitad; si el navegador no lo da —iOS viejo— cae a
// JPEG. Si aun a calidad mínima no cabe, falla en vez de subir un archivo
// enorme a espaldas de quien lo mandó.
window.optimizarImagen = async (file, opciones) => {
    const { maxLado = 800, maxBytes = 1048576 } = opciones || {};

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Se limita el lado más largo, sea el ancho o el alto.
                let escala = 1;
                if (img.width > maxLado || img.height > maxLado) {
                    escala = maxLado / Math.max(img.width, img.height);
                }

                let ancho = img.width * escala;
                let alto = img.height * escala;

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let calidad = 0.7;

                const intentarCompresion = (w, h, q, formato) => new Promise(res => {
                    canvas.width = w;
                    canvas.height = h;
                    ctx.clearRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob(b => res(b), formato, q);
                });

                const procesar = async () => {
                    let formato = 'image/webp';
                    let blob = await intentarCompresion(ancho, alto, calidad, formato);

                    // Fallback a JPEG si WebP falla en iOS
                    if (!blob) {
                        formato = 'image/jpeg';
                        blob = await intentarCompresion(ancho, alto, calidad, formato);
                    }

                    if (!blob) return reject(new Error("Tu navegador no permitió procesar la imagen."));

                    // Si no cabe, se baja calidad y medidas a la vez.
                    while (blob.size > maxBytes && calidad > 0.1) {
                        calidad = Math.max(0.1, calidad - 0.15);
                        ancho *= 0.8;
                        alto *= 0.8;
                        blob = await intentarCompresion(ancho, alto, calidad, formato);
                    }

                    if (blob.size > maxBytes) {
                        return reject(new Error(`No se pudo comprimir lo suficiente. Tamaño final: ${(blob.size / 1024).toFixed(0)} KB.`));
                    }

                    resolve(blob);
                };

                procesar();
            };
            img.onerror = () => reject(new Error("El formato del archivo no es soportado."));
            img.src = e.target.result;
        };

        reader.onerror = () => reject(new Error("Hubo un problema al leer el archivo en tu dispositivo."));
        reader.readAsDataURL(file);
    });
};

// La foto del área que se evalúa. Viaja donde los motivos, dentro de
// `answers_json` y bajo su propia llave reservada, para no obligar a correr
// otro script en la base; lo que sí hace falta es el bucket.
window.LLAVE_FOTO_AREA = '__foto_area';
window.BUCKET_FOTOS_EVAL = 'fotos-evaluaciones';
window.MAX_LADO_FOTO_EVAL = 600;

// Una pregunta de evidencia se contesta con una fotografía en vez de con
// texto: su enunciado dice qué hay que fotografiar y su respuesta es la URL de
// lo que se subió. Es un tipo de pregunta más, de modo que se ordena, se
// edita, se borra y se califica como las demás, y pedir varias evidencias es
// añadir varias preguntas.
window.TIPO_PREGUNTA_FOTO = 'photo';
window.esPreguntaDeFoto = (pregunta) =>
    !!pregunta && pregunta.question_type === window.TIPO_PREGUNTA_FOTO;

// Lo que admite una encuesta de modo `boss`. Esa encuesta se guarda ya
// calificada al enviarla —la contesta el jefe y su palabra es el veredicto—,
// así que sólo caben las preguntas que se puntúan solas y las evidencias, que
// no puntúan: quedan como constancia de lo que vio mientras evaluaba. Un texto
// o unas opciones se quedarían sin calificar y sin nadie que los revisara.
window.TIPOS_EN_MODO_JEFE = ['range', window.TIPO_PREGUNTA_FOTO];

// ==========================================
// PLAZO PARA VOLVER A CONTESTAR
// ==========================================
// Una respuesta que no llegó al mínimo no sirve de nada si nadie vuelve a
// hacerla. `retry_days` da un plazo para reponerla: mientras corre, la encuesta
// vuelve a salir en los pendientes de quien la contestó. En 0 —o sin la
// columna— no pasa nada y todo se comporta como antes.
window.diasDeReintento = (ev) => {
    const n = ev ? parseInt(ev.retry_days, 10) : 0;
    return (Number.isFinite(n) && n > 0) ? n : 0;
};

// Si esta respuesta abre un plazo para repetirla. Devuelve null cuando no hay
// nada que reponer.
//
// El plazo se cuenta desde que se envió y no desde que se calificó: la base no
// guarda cuándo se calificó. Si la revisión tarda más que el plazo, el
// pendiente sale igual pero ya vencido, que es visible y accionable —lo que no
// puede pasar es que no salga—.
window.reintentoDeRespuesta = (ev, resp, fecha) => {
    const dias = window.diasDeReintento(ev);
    if (dias <= 0 || !resp) return null;

    // Sin mínimo que alcanzar no hay reprobado que reponer.
    if (!window.exigeMinimo(ev)) return null;

    // Sólo lo ya calificado y todavía no dado por bueno: lo que está sin
    // calificar aún no se sabe, y lo certificado ya pasó.
    if (resp.review_status !== 'Revisado') return null;

    const puntaje = typeof window.calcularScoreRespuesta === 'function'
        ? window.calcularScoreRespuesta(resp) : 0;
    if (puntaje >= window.UMBRAL_CERTIFICACION) return null;

    const ahora = fecha ? new Date(fecha) : new Date();
    const vence = new Date(new Date(resp.submitted_at).getTime() + dias * 86400000);
    const diasFaltantes = Math.ceil((vence - ahora) / 86400000);

    return { dias, puntaje, vence, diasFaltantes, vencida: diasFaltantes < 0,
             fechaRespuesta: resp.submitted_at };
};

// El nombre del área es texto libre: la respuesta guarda el que tenía el
// empleado ese día y la pantalla de estadísticas agrupa por el de su ficha. Se
// comparan siempre normalizados, o «Planta 1» y «PLANTA 1 » serían dos áreas.
window.claveDeArea = (nombre) =>
    String(nombre == null ? '' : nombre).trim().toUpperCase().replace(/\s+/g, ' ');

// Sube una foto ya encogida y devuelve su URL pública. La usan la foto del
// área y las evidencias de cada pregunta; el mensaje de error nombra el bucket
// porque el script de `sql/` se corre a mano y ése es el fallo probable.
window.subirFotoEvaluacion = async (blob, prefijo) => {
    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const nombreArchivo = `${prefijo}-${Date.now()}.${extension}`;

    const { error } = await sb.storage
        .from(window.BUCKET_FOTOS_EVAL)
        .upload(nombreArchivo, blob, { contentType: blob.type, upsert: true });

    if (error) {
        console.error('Error al subir la fotografía:', error);
        throw new Error(`No se pudo subir la fotografía. Si el problema sigue, revisa que exista el bucket '${window.BUCKET_FOTOS_EVAL}' en Supabase.`);
    }

    const { data } = sb.storage.from(window.BUCKET_FOTOS_EVAL).getPublicUrl(nombreArchivo);
    return (data && data.publicUrl) ? data.publicUrl : '';
};

window.fotoDeArea = (respuesta) => {
    const url = respuesta && respuesta.answers_json ? respuesta.answers_json[window.LLAVE_FOTO_AREA] : null;
    return typeof url === 'string' && url ? url : '';
};

// ==========================================
// EL MOTIVO DE UNA RESPUESTA CON OPCIONES
// ==========================================
// Marcar una opción no dice por qué se marcó, y en una encuesta de seguridad
// eso es justo lo que hay que saber: «no» a secas y «no, porque la máquina
// estaba en paro» son hallazgos distintos. Los tipos de pregunta que se
// contestan eligiendo piden además el motivo, y sin él no se envía.
//
// `range` entra aunque se califique sola: un 0 en «existe un estándar de 5S»
// vale como hallazgo sólo si dice qué se encontró. Que lleve motivo no cambia
// su calificación automática —eso lo decide `autoGradedCount` al enviar—, así
// que una encuesta toda de escala se sigue guardando ya revisada.
//
// Fuera quedan `text` —que ya es texto libre— y `list_match`, que es una lista
// de elementos y no una elección.
window.PREGUNTAS_CON_MOTIVO = ['multiple', 'checklist', 'range'];

// El tope de una escala. Va aquí porque lo preguntan tres sitios —el
// formulario al dibujarla, el envío al calificarla y la regla de más abajo— y
// tres copias del parseo acabarían discrepando. Sin `options` la escala es de 5.
// `options` llega unas veces como arreglo y otras como el texto JSON que
// guardó PostgREST. Todo el que lo mire pasa por aquí.
window.opcionesDePregunta = (pregunta) => {
    let opts = pregunta ? pregunta.options : null;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = null; } }
    return Array.isArray(opts) ? opts : [];
};

window.maximoDeEscala = (pregunta) => {
    const opts = window.opcionesDePregunta(pregunta);
    if (opts.length >= 2) {
        const max = parseFloat(opts[1]);
        if (!isNaN(max)) return max;
    }
    return 5;
};

// Una pregunta de escala puede llevar su propia guía: el texto largo que
// explica qué representa cada valor **en esa pregunta**. Es otra cosa que las
// etiquetas de `range_labels`, que son de la encuesta entera y caben en dos
// palabras debajo del círculo; ésta se lee plegada y puede ocupar párrafos.
//
// Viaja en la cuarta posición de `options`, que para una escala es
// `[min, max, paso, guía]`, y no en una columna nueva: así no hay otro script
// que correr a mano. Todo lo que ya lee `options` de una escala mira sólo las
// tres primeras y no se entera.
window.PLAZA_GUIA_ESCALA = 3;

window.guiaDeEscala = (pregunta) => {
    if (!pregunta || pregunta.question_type !== 'range') return '';
    const guia = window.opcionesDePregunta(pregunta)[window.PLAZA_GUIA_ESCALA];
    return typeof guia === 'string' ? guia.trim() : '';
};

// El mismo desplegable en las dos pantallas donde se ve una escala: al
// contestarla y al calificarla. Sin guía no dibuja nada.
window.bloqueGuiaEscala = (pregunta) => {
    const guia = window.guiaDeEscala(pregunta);
    if (!guia) return '';
    return `
        <details class="hoja-plegable guia-escala">
            <summary class="hoja-plegable-resumen"><span>📖 Qué significa cada valor</span></summary>
            <div class="hoja-plegable-cuerpo guia-escala-texto">${window.sanitizeForHTML(guia)}</div>
        </details>`;
};

// El tope de la escala es el «todo bien»: no hay nada que explicar. Cualquier
// valor por debajo sí, que es donde está el hallazgo. Las demás preguntas con
// opciones piden el motivo siempre: ahí ninguna respuesta es la buena.
window.pideMotivo = (pregunta, valor) => {
    if (!pregunta || !window.PREGUNTAS_CON_MOTIVO.includes(pregunta.question_type)) return false;
    if (pregunta.question_type !== 'range') return true;

    const numero = parseFloat(valor);
    if (isNaN(numero)) return true;
    return numero < window.maximoDeEscala(pregunta);
};

// Los motivos viajan dentro de `answers_json`, bajo una llave reservada: las
// demás son ids de pregunta, siempre numéricos, así que no pueden chocar. Se
// hace así y no con una columna nueva para no obligar a correr otro script en
// la base; todo lo que ya lee `answers_json` lo hace por id de pregunta y no
// se entera de ésta.
window.LLAVE_MOTIVOS = '__comentarios';

window.motivosDeRespuesta = (respuesta) => {
    const mapa = respuesta && respuesta.answers_json ? respuesta.answers_json[window.LLAVE_MOTIVOS] : null;
    return (mapa && typeof mapa === 'object' && !Array.isArray(mapa)) ? mapa : {};
};

window.motivoDePregunta = (respuesta, preguntaId) => {
    const texto = window.motivosDeRespuesta(respuesta)[String(preguntaId)];
    return typeof texto === 'string' ? texto.trim() : '';
};

// ==========================================
// QUIÉN CALIFICA UNA RESPUESTA
// ==========================================
// Por defecto la califica el jefe inmediato de quien contestó, y eso no lo
// dice ninguna tabla: la regla la sostiene el código, igual que la de quién
// firma un registro. Una encuesta puede en cambio nombrar a sus propios
// revisores en `reviewer_employees`, y entonces deja de ser cosa del jefe.
//
// La lista llega como `jsonb` o como texto, según cómo se creara la columna, y
// puede traer el 'ALL' que el resto de los selectores usa para «sin acotar»;
// aquí eso es lo mismo que no haber nombrado a nadie.
window.revisoresDeEncuesta = (ev) => {
    if (!ev) return [];
    let v = ev.reviewer_employees;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch (e) { return []; }
    }
    if (!Array.isArray(v)) return [];
    return v.map(x => String(x).trim()).filter(x => x !== '' && x.toUpperCase() !== 'ALL');
};

window.tieneRevisoresPropios = (ev) => window.revisoresDeEncuesta(ev).length > 0;

// Los revisores que le quedan a UNA respuesta. Nadie se califica a sí mismo,
// así que la respuesta de un revisor se la quedan los demás revisores; si no
// hay más, la lista sale vacía y la revisión vuelve a su jefe inmediato, que
// es preferible a dejarla sin nadie que pueda tocarla.
window.revisoresDeLaRespuesta = (ev, empleadoQueContesto) =>
    window.revisoresDeEncuesta(ev).filter(id => String(id) !== String(empleadoQueContesto));

// La pregunta que hacen todas las pantallas: ¿le toca a esta persona calificar
// esta respuesta? El modo administrador es aparte y lo resuelve cada pantalla.
window.leTocaRevisar = (ev, empleadoQueContesto, revisorId) => {
    if (!revisorId || !empleadoQueContesto) return false;
    if (String(empleadoQueContesto) === String(revisorId)) return false;

    const propios = window.revisoresDeLaRespuesta(ev, empleadoQueContesto);
    if (propios.length > 0) return propios.includes(String(revisorId));

    return window.esSupervisorDirectoDe(empleadoQueContesto, revisorId);
};

// Los nombres de una lista de ids, para decir en pantalla a quién le toca. Un
// id que ya no esté en la plantilla se enseña tal cual en vez de desaparecer.
window.nombresDeEmpleados = (ids) => (ids || []).map(id => {
    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(id));
    return emp && emp.name ? emp.name : `ID ${id}`;
}).join(', ');

// De todas las encuestas, las que esta persona revisa por nombramiento. Es lo
// que convierte a alguien en revisor sin ser jefe de nadie.
window.encuestasQueRevisa = (encuestas, revisorId) =>
    (encuestas || []).filter(ev => window.revisoresDeEncuesta(ev).includes(String(revisorId)));

// La columna es nueva y el script de `sql/` se corre a mano, así que puede no
// estar todavía. Se pregunta una sola vez por sesión —y se guarda la promesa,
// no el resultado, para que dos pantallas a la vez no la pidan dos veces—; sin
// ella todo se comporta como antes y la hoja de la encuesta lo avisa.
// Los scripts de `sql/` se corren a mano, así que una columna nueva puede no
// estar todavía. Se pregunta una sola vez por columna y por sesión —y se guarda
// la promesa, no el resultado, para que dos pantallas a la vez no la pidan dos
// veces—; sin ella todo se comporta como antes.
const promesasDeColumna = {};
window.hayColumna = (tabla, columna) => {
    const clave = `${tabla}.${columna}`;
    if (!promesasDeColumna[clave]) {
        promesasDeColumna[clave] = sb.from(tabla).select(columna).limit(1)
            .then(({ error }) => !error)
            .catch(() => false);
    }
    return promesasDeColumna[clave];
};

window.hayColumnaRevisores = () => window.hayColumna('evaluations', 'reviewer_employees');

// Para las consultas que piden columnas por nombre: pedir una que no existe no
// devuelve la fila sin ese campo, revienta la consulta entera.
window.camposConColumna = async (campos, tabla, columna) =>
    (await window.hayColumna(tabla, columna)) ? `${campos}, ${columna}` : campos;

window.camposConRevisores = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'reviewer_employees');

window.camposConReintento = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'retry_days');

window.camposConMinimo = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'requires_min_score');

// ==========================================
// QUÉ CLASIFICACIONES SE CERTIFICAN
// ==========================================
// Certificar es de una clasificación entera y no de una encuesta suelta: se da
// fe de que lo que alguien contestó en «Seguridad» ese periodo es verídico. Y
// no toda clasificación lo necesita —una de clima laboral o de sugerencias se
// contesta y ya—, así que la decisión se toma por clasificación, en la pantalla
// de certificar.
//
// Vive en la tabla `clasificaciones_certificacion`, con el nombre normalizado
// por llave. La que no tiene fila se certifica, que es lo de siempre: aquí sólo
// hacen falta filas para las que se apaguen.
//
// La caché se llena una sola vez por sesión —se guarda la promesa, no el
// resultado, para que dos pantallas a la vez no la pidan dos veces—. Mientras
// no esté cargada todo se certifica: es lo que hacía antes y lo que deja a la
// aplicación funcionando sin la tabla.
window.CLASIFICACIONES_SIN_CERTIFICAR = null;   // Set de claves normalizadas
let promesaClasificacionesCert = null;

window.cargarCertificacionDeClasificaciones = (recargar) => {
    if (recargar) promesaClasificacionesCert = null;
    if (!promesaClasificacionesCert) {
        promesaClasificacionesCert = sb.from('clasificaciones_certificacion')
            .select('clave, requiere')
            .then(({ data, error }) => {
                if (error) {
                    console.warn('No se pudo leer qué clasificaciones se certifican:', error.message);
                    window.CLASIFICACIONES_SIN_CERTIFICAR = null;
                    return false;
                }
                window.CLASIFICACIONES_SIN_CERTIFICAR = new Set(
                    (data || []).filter(f => f.requiere === false).map(f => String(f.clave)));
                return true;
            })
            .catch(() => { window.CLASIFICACIONES_SIN_CERTIFICAR = null; return false; });
    }
    return promesaClasificacionesCert;
};

// La pregunta que hacen las pantallas, y que tiene que poder contestarse sin
// esperar a nadie: se resuelve con lo que haya en la caché.
window.clasificacionSeCertifica = (clasificacion) => {
    if (!window.CLASIFICACIONES_SIN_CERTIFICAR) return true;
    return !window.CLASIFICACIONES_SIN_CERTIFICAR.has(window.normalizarClasificacion(clasificacion));
};

window.guardarCertificacionDeClasificacion = async (clasificacion, requiere) => {
    const clave = window.normalizarClasificacion(clasificacion);
    const { error } = await sb.from('clasificaciones_certificacion')
        .upsert({ clave: clave, nombre: String(clasificacion || '').trim(), requiere: !!requiere,
                  actualizado_en: new Date().toISOString() }, { onConflict: 'clave' });
    if (error) throw error;

    // La caché se corrige en el acto para que la pantalla no tenga que recargar.
    if (window.CLASIFICACIONES_SIN_CERTIFICAR) {
        if (requiere) window.CLASIFICACIONES_SIN_CERTIFICAR.delete(clave);
        else window.CLASIFICACIONES_SIN_CERTIFICAR.add(clave);
    }
};

// Si esta encuesta tiene un puntaje mínimo que alcanzar. Es cosa aparte de la
// certificación: una encuesta puede no certificarse y aun así exigir el 80%
// —de ahí sale el plazo para repetirla—, y al revés, certificarse con el
// puntaje que sea porque se contesta para dejar constancia y no para aprobar.
//
// Sin encuesta a mano se exige, que es lo prudente: es preferible no dar por
// buena una respuesta que dar por buena la que no se debía.
window.exigeMinimo = (ev) => !ev || ev.requires_min_score !== false;

// La clasificación es texto libre —un `input` con datalist, no un catálogo—,
// así que «Seguridad», «SEGURIDAD» y «seguridad » serían tres grupos distintos
// al guardar un acta. Se compara siempre normalizada.
window.normalizarClasificacion = (nombre) =>
    String(nombre == null ? '' : nombre).trim().toUpperCase().replace(/\s+/g, ' ') || 'GENERAL';

// Lo que puede pasarle a una clasificación. El orden importa: es el de
// severidad con que se resuelven los empates al resumir.
window.ESTADOS_CERTIFICACION = {
    VACIO: 'vacio',                 // no le toca ninguna, o no ha contestado nada
    OBSERVACIONES: 'observaciones', // hay alguna anulada o mal revisada
    PROCESO: 'proceso',             // faltan por contestar o por calificar
    LISTA: 'lista',                 // todas calificadas y por encima del umbral
    CERTIFICADA: 'certificada'      // todas las del periodo certificadas
};

// Sólo se puede certificar a partir de este puntaje. Es el mismo umbral que
// aplica `motivoNoAplicable()` respuesta por respuesta.
window.UMBRAL_CERTIFICACION = 80;

// El periodo vigente de una encuesta. `periodoVigente` vive en
// `7-pendientes.js`, que se carga después de este archivo: para cuando alguien
// llama aquí ya está puesto. Si no estuviera —o si la encuesta es de una sola
// vez— se cuenta desde siempre, que es lo que hacía la pantalla antes de que
// existieran los periodos.
window.periodoDeEncuesta = (ev, fecha) => {
    const referencia = fecha || new Date();
    const frecuencia = (ev && ev.frequency) || 'once';

    if (frecuencia === 'once' || typeof window.periodoVigente !== 'function') {
        return { inicio: new Date(0), fin: null, nombre: 'alguna vez' };
    }
    return window.periodoVigente(frecuencia, referencia) ||
        { inicio: new Date(0), fin: null, nombre: 'alguna vez' };
};

// La respuesta que cuenta para una encuesta en el periodo que corre: la última
// que se entregó dentro de él. Fuera del periodo no cuenta ninguna, que es lo
// que impedía que el sello del mes pasado tapara el mes en curso.
window.respuestaDelPeriodo = (ev, respuestas, fecha) => {
    const periodo = window.periodoDeEncuesta(ev, fecha);
    const delPeriodo = (respuestas || []).filter(r => {
        if (String(r.evaluation_id) !== String(ev.id)) return false;
        const enviada = new Date(r.submitted_at);
        if (isNaN(enviada)) return false;
        if (enviada < periodo.inicio) return false;
        return periodo.fin ? enviada < periodo.fin : true;
    });

    if (delPeriodo.length === 0) return null;
    return delPeriodo.reduce((masNueva, r) =>
        new Date(r.submitted_at) > new Date(masNueva.submitted_at) ? r : masNueva);
};

// El estado de una clasificación para una persona. `encuestas` son las de esa
// clasificación que le tocan a ella —cada pantalla sabe filtrarlas—, y
// `respuestas` las suyas.
//
// Devuelve además el desglose, que es lo que la pantalla del administrador
// necesita para decidir a quién le puede dar al botón.
// Cuál de las encuestas marca el ritmo de una clasificación: la más frecuente.
// Es la que da nombre al periodo y con la que se puede viajar hacia atrás,
// porque una clasificación puede mezclar frecuencias y no hay un periodo de la
// clasificación como tal.
window.PESO_FRECUENCIA = { once: 0, biennial: 1, yearly: 2, semiannual: 3, quarterly: 4, monthly: 5, biweekly: 6, weekly: 7 };

window.encuestaQueMarcaElRitmo = (encuestas) => {
    const lista = encuestas || [];
    if (lista.length === 0) return null;
    const peso = window.PESO_FRECUENCIA;
    return lista.reduce((a, b) =>
        (peso[(b.frequency || 'once')] || 0) > (peso[(a.frequency || 'once')] || 0) ? b : a);
};

// Los últimos `cuantos` periodos de una clasificación, del más reciente al más
// antiguo, para poder mirar atrás. Cada uno trae la fecha con la que hay que
// preguntarle a `estadoCertificacion`: el instante anterior al cierre, que cae
// dentro del periodo pase lo que pase.
//
// Una clasificación de una sola vez no tiene periodos que recorrer: su periodo
// es «alguna vez» y es siempre el mismo.
window.periodosDeClasificacion = (encuestas, cuantos, hasta) => {
    const ritmo = window.encuestaQueMarcaElRitmo(encuestas);
    if (!ritmo) return [];

    const frecuencia = ritmo.frequency || 'once';
    if (frecuencia === 'once' || typeof window.periodoVigente !== 'function') {
        return [{ nombre: 'alguna vez', referencia: hasta || new Date(), inicio: new Date(0), fin: null, actual: true }];
    }

    const periodos = [];
    let cursor = hasta || new Date();
    for (let i = 0; i < (cuantos || 12); i++) {
        const p = window.periodoVigente(frecuencia, cursor);
        if (!p) break;
        periodos.push({
            nombre: p.nombre,
            etiqueta: window.etiquetaDePeriodo(p, frecuencia),
            inicio: p.inicio,
            fin: p.fin,
            // Se pregunta con el último instante del periodo, no con su inicio:
            // así la fecha cae dentro aunque el periodo ya esté cerrado.
            referencia: p.fin ? new Date(p.fin.getTime() - 1) : p.inicio,
            actual: i === 0
        });
        if (!p.inicio || !(p.inicio instanceof Date)) break;
        cursor = new Date(p.inicio.getTime() - 1);
    }
    return periodos;
};

// Cómo se llama un periodo cerrado. `periodoVigente` los nombra en presente
// («este mes»), que sólo vale para el que corre; los de atrás se nombran por su
// fecha para que no digan todos lo mismo.
window.etiquetaDePeriodo = (periodo, frecuencia) => {
    if (!periodo || !periodo.inicio) return '';
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const d = periodo.inicio;

    switch (frecuencia) {
        case 'weekly':
            return `semana del ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
        case 'biweekly':
            return `${d.getDate() <= 15 ? '1ª' : '2ª'} quincena de ${meses[d.getMonth()]} ${d.getFullYear()}`;
        case 'monthly':
            return `${meses[d.getMonth()]} ${d.getFullYear()}`;
        case 'quarterly':
            return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
        case 'semiannual':
            return `${Math.floor(d.getMonth() / 6) + 1}er semestre ${d.getFullYear()}`;
        case 'yearly':
            return String(d.getFullYear());
        case 'biennial':
            return `${d.getFullYear()}-${d.getFullYear() + 1}`;
        default:
            return periodo.nombre || '';
    }
};

window.estadoCertificacion = (encuestas, respuestas, fecha) => {
    const E = window.ESTADOS_CERTIFICACION;
    // Una clasificación que no se certifica no tiene resumen que dar: se queda
    // sin encuestas y el estado sale vacío.
    const lista = (encuestas || []).filter(window.encuestaActiva)
        .filter(ev => window.clasificacionSeCertifica(ev.category));

    const resumen = {
        estado: E.VACIO,
        total: lista.length,
        contestadas: 0,
        certificadas: 0,
        observadas: 0,
        calificadas: 0,     // calificadas y por encima del umbral, sin certificar
        bajoUmbral: 0,      // calificadas pero no alcanzan para certificar
        sinCalificar: 0,
        sinContestar: 0,
        periodo: '',
        periodoFechas: null, // { inicio, fin } — lo que sella el acta
        certificables: []   // los ids de respuesta que un lote sí podría certificar
    };

    if (lista.length === 0) return resumen;

    const periodoRitmo = window.periodoDeEncuesta(window.encuestaQueMarcaElRitmo(lista), fecha);
    resumen.periodo = periodoRitmo.nombre;
    resumen.periodoFechas = { inicio: periodoRitmo.inicio, fin: periodoRitmo.fin };

    lista.forEach(ev => {
        const resp = window.respuestaDelPeriodo(ev, respuestas, fecha);

        if (!resp) { resumen.sinContestar++; return; }
        resumen.contestadas++;

        const estado = resp.review_status;
        if (estado === 'Falsa' || estado === 'Mal Revisada') { resumen.observadas++; return; }
        if (estado === 'Certificada') { resumen.certificadas++; return; }
        if (estado !== 'Revisado') { resumen.sinCalificar++; return; }

        const puntaje = typeof window.calcularScoreRespuesta === 'function'
            ? window.calcularScoreRespuesta(resp) : 0;
        if (!window.exigeMinimo(ev) || puntaje >= window.UMBRAL_CERTIFICACION) {
            resumen.calificadas++;
            resumen.certificables.push(resp.id);
        } else {
            resumen.bajoUmbral++;
        }
    });

    // Nada contestado todavía: no hay nada que certificar ni que reprochar.
    if (resumen.contestadas === 0) { resumen.estado = E.VACIO; return resumen; }

    // Una anulada o mal revisada manda sobre todo lo demás: es lo que hay que
    // resolver antes de poder dar por buena la clasificación.
    if (resumen.observadas > 0) { resumen.estado = E.OBSERVACIONES; return resumen; }

    if (resumen.certificadas === resumen.total) { resumen.estado = E.CERTIFICADA; return resumen; }

    if (resumen.certificadas + resumen.calificadas === resumen.total) { resumen.estado = E.LISTA; return resumen; }

    resumen.estado = E.PROCESO;
    return resumen;
};

// Cómo se enseña ese estado. El texto es el mismo en el panel del usuario y en
// la lista del administrador, para que no se llamen distinto en cada pantalla.
window.insigniaCertificacion = (resumen) => {
    const E = window.ESTADOS_CERTIFICACION;
    if (!resumen || resumen.estado === E.VACIO) return null;

    if (resumen.estado === E.CERTIFICADA) {
        return { texto: `⭐ CERTIFICADA · ${resumen.periodo}`, color: '#1d4ed8', fondo: '#eff6ff', borde: '#3b82f6' };
    }
    if (resumen.estado === E.OBSERVACIONES) {
        const n = resumen.observadas;
        return { texto: `⚠️ ${n} ${n === 1 ? 'respuesta observada' : 'respuestas observadas'}`, color: '#7e22ce', fondo: '#faf5ff', borde: '#a855f7' };
    }
    if (resumen.estado === E.LISTA) {
        return { texto: `✅ Lista para certificar`, color: '#166534', fondo: '#dcfce7', borde: '#22c55e' };
    }

    // Si ya está todo revisado y aun así no se puede certificar, lo que falta
    // es el umbral y hay que decirlo: «3 de 3 revisadas» en un estado que no
    // es «lista» se lee como una contradicción.
    const revisadas = resumen.certificadas + resumen.calificadas + resumen.bajoUmbral;
    if (revisadas === resumen.total && resumen.bajoUmbral > 0) {
        const n = resumen.bajoUmbral;
        return { texto: `📉 ${n} por debajo de ${window.UMBRAL_CERTIFICACION}%`, color: '#b45309', fondo: '#fef3c7', borde: '#f59e0b' };
    }

    return { texto: `⏳ ${revisadas} de ${resumen.total} revisadas`, color: '#b45309', fondo: '#fef3c7', borde: '#f59e0b' };
};

// Qué le falta a una clasificación para poder certificarse, en trozos sueltos
// para que cada pantalla los junte como quiera. La insignia dice en qué estado
// está; esto dice qué hay que resolver, que es lo que el administrador
// necesita cuando busca a alguien y no aparece entre los listos.
window.faltaParaCertificar = (resumen) => {
    const E = window.ESTADOS_CERTIFICACION;
    if (!resumen) return [];
    if (resumen.total === 0) return ['no le toca ninguna encuesta de esta clasificación'];
    if (resumen.estado === E.CERTIFICADA) return [];

    const falta = [];
    // Lo observado va primero: es lo que hay que resolver antes que nada.
    if (resumen.observadas) {
        falta.push(resumen.observadas === 1
            ? '1 anulada o mal revisada'
            : `${resumen.observadas} anuladas o mal revisadas`);
    }
    if (resumen.sinContestar) falta.push(`${resumen.sinContestar} sin contestar`);
    if (resumen.sinCalificar) falta.push(`${resumen.sinCalificar} sin calificar`);
    if (resumen.bajoUmbral) falta.push(`${resumen.bajoUmbral} por debajo del ${window.UMBRAL_CERTIFICACION}%`);
    return falta;
};

// =========================================================
// --- QUIÉN PUEDE VER Y REPARTIR TODAS LAS REFACCIONES ---
// =========================================================
// El permiso no va por puesto sino por encargo extra: en «Configurar
// permisos» se marcan los encargos que autorizan, y los tiene quien los
// lleve en su ficha. La regla vive aquí porque la usan dos pantallas —el
// panel de refacciones y el mapa de activos—, que son documentos distintos
// y no comparten más JavaScript que este archivo.
window.CLAVE_ENCARGOS_REFACCIONES = 'encargos_refacciones';

// La columna es text[], pero se acepta también una cadena separada por comas
// por si algún registro se capturó a mano desde Supabase.
window.normalizarEncargos = (valor) => {
    if (!valor) return [];
    const lista = Array.isArray(valor) ? valor : String(valor).split(',');
    return lista.map(v => String(v).trim()).filter(v => v !== '');
};

window.encargosAutorizadosRefacciones = async () => {
    try {
        const { data } = await sb.from('system_config')
            .select('texto').eq('key', window.CLAVE_ENCARGOS_REFACCIONES);
        if (data && data.length > 0 && data[0].texto) {
            return JSON.parse(data[0].texto).map(r => String(r).toUpperCase().trim());
        }
    } catch (e) {
        console.error("Error al cargar los permisos de refacciones:", e);
    }
    return [];
};

// Los encargos del usuario no se leen de localStorage: la sesión se guarda al
// iniciar y dura hasta treinta días, así que un encargo asignado después no
// aparecería ahí. Hay que preguntárselos a la base.
window.encargosDelUsuarioEnLaBase = async () => {
    let sesion = null;
    try { sesion = JSON.parse(localStorage.getItem("usuarioLogueado")); } catch (e) {}
    if (!sesion || !sesion.id) return [];

    try {
        // La sesión guarda el id numérico o el de texto según su antigüedad, así
        // que se prueban los dos campos.
        const id = String(sesion.id).trim();
        const { data, error } = await sb.from('employees')
            .select('encargos').or(`id.eq.${id},employee_id.eq.${id}`);
        // Si la columna 'encargos' todavía no existe en la base, no hay permiso
        // que conceder; se avisa por consola y se sigue.
        if (error) throw error;
        return window.normalizarEncargos((data && data[0]) ? data[0].encargos : []);
    } catch (e) {
        console.error("No se pudieron leer los encargos del usuario:", e);
        return [];
    }
};

// Con encargos ya resueltos se pasan como argumento —el panel los tiene en su
// caché de empleados—; sin ellos, se preguntan a la base.
window.tienePermisoRefacciones = async (encargosDelUsuario) => {
    const autorizados = await window.encargosAutorizadosRefacciones();
    if (autorizados.length === 0) return false;

    const mios = encargosDelUsuario === undefined
        ? await window.encargosDelUsuarioEnLaBase()
        : window.normalizarEncargos(encargosDelUsuario);

    return mios.map(e => e.toUpperCase()).some(e => autorizados.includes(e));
};

// --- ESTADO DE LA APLICACIÓN ---
window.paginaActual = 0;
window.idEditando = null;
window.idFirmando = null;
window.modoAdminActivo = false;
window.mostrandoPendientes = false;

// --- CACHÉS DE DATOS ---
window.todosLosEmpleadosData = [];
window.empleadosLoginCache = [];
window.incidentCache = {};
window.currentDetailId = null;

// --- MAPAS DE AYUDA (Relación ID -> Nombre/Depto) ---
window.employeeNameMap = {};
window.employeeDeptMap = {};
window.employeeSupMap = {};

// --- VARIABLES PARA ARCHIVOS TEMPORALES ---
window.filesToUpload = [];
window.existingGallery = [];

// --- VARIABLES PARA ESTADÍSTICAS ---
window.statsTree = null;
window.totalFirmasGlobal = 0;
window.totalNecesariasGlobal = 0;

// --- VARIABLES PARA EVALUACIONES ---
window.preguntasTemp = [];
window.evalIdRespondiendo = null;
window.evalTituloRespondiendo = "";
window.gradesTemp = {};
window.gradingResponseId = null;
window.preguntasCacheActual = [];
window.idEditandoEval = null;

console.log("✅ Configuración cargada. Esperando sincronización global...");

// =========================================================
// --- MONITOR DE EGRESS (SOLO VISIBLE EN MODO ADMIN) ---
// =========================================================
(function() {
    // 1. Crear el elemento visual estilo "Píldora" (Oculto por defecto)
    const egressDiv = document.createElement('div');
    egressDiv.id = 'egress-monitor';
    egressDiv.style.cssText = `
        position: fixed;
        bottom: 12px;
        right: 12px;
        background: rgba(30, 41, 59, 0.6); /* Slate oscuro */
        color: rgba(255, 255, 255, 0.9);
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        padding: 4px 10px;
        border-radius: 20px;
        z-index: 99999;
        pointer-events: none;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: opacity 0.3s ease;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        white-space: nowrap;
        display: none; /* Importante: Oculto al inicio */
    `;
    egressDiv.innerHTML = "Data: 0 KB";
    document.body.appendChild(egressDiv);

    let totalBytes = 0;

    // Función para actualizar el texto
    const updateText = () => {
        const mb = totalBytes / (1024 * 1024);
        const kb = totalBytes / 1024;
        
        let bgColor = "rgba(30, 41, 59, 0.6)";

        // Alertas de color
        if (mb >= 50) bgColor = "rgba(225, 29, 72, 0.7)"; // Rojo
        else if (mb >= 10) bgColor = "rgba(245, 158, 11, 0.7)"; // Naranja

        if (mb >= 1) {
            egressDiv.innerText = `Data: ${mb.toFixed(2)} MB`;
        } else {
            egressDiv.innerText = `Data: ${Math.round(kb)} KB`;
        }
        egressDiv.style.background = bgColor;
    };

    // 2. Loop de Visibilidad: Revisa si es Admin cada 500ms
    setInterval(() => {
        if (window.modoAdminActivo) {
            if (egressDiv.style.display === 'none') egressDiv.style.display = 'block';
        } else {
            if (egressDiv.style.display !== 'none') egressDiv.style.display = 'none';
        }
    }, 500);

    // 3. Interceptar Fetch (Captura datos JSON de BD y Auth)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        try {
            const response = await originalFetch(...args);
            const clone = response.clone();
            clone.blob().then(blob => {
                if(response.url.includes('supabase.co')) {
                    totalBytes += blob.size;
                    updateText();
                }
            }).catch(() => {});
            return response;
        } catch (err) { throw err; }
    };

    // 4. Monitor de Recursos (Captura Imágenes)
    if (window.PerformanceObserver) {
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                if (entry.name.includes('supabase.co') &&
                   (entry.initiatorType === 'img' || entry.initiatorType === 'css' || entry.initiatorType === 'fetch')) {
                    const size = entry.transferSize > 0 ? entry.transferSize : entry.decodedBodySize;
                    if(size > 0) {
                        totalBytes += size;
                        updateText();
                    }
                }
            });
        });
        try { observer.observe({ type: 'resource', buffered: true }); } catch (e) {}
    }

})();

// ==========================================
// FRANJA DE LA BARRA DE ESTADO AL ABRIR UN MODAL
// ==========================================
// Con la app instalada en la pantalla de inicio, iOS reserva la franja de la
// barra de estado fuera del viewport y la pinta con el color de fondo del
// documento. Ningún overlay llega hasta ahí, así que al abrir un modal esa
// franja se quedaba clara y el corte contra el fondo atenuado se notaba.
//
// Aquí se marca <html> con la clase 'modal-abierto' mientras haya algún
// overlay visible; el color lo aplica estilos.css. Se hace con un observador
// en lugar de tocar cada función que abre un modal, para que valga también
// para los modales que se crean sobre la marcha.
(() => {
    const esOverlayVisible = (el) => {
        const estilo = getComputedStyle(el);
        return estilo.position === 'fixed' && estilo.display !== 'none';
    };

    const revisar = () => {
        // Se excluyen los elementos internos que comparten el prefijo pero no
        // son overlays; el filtro por position:fixed ya los descarta.
        const visibles = Array.from(document.querySelectorAll('[id^="modal-"]')).filter(esOverlayVisible);
        document.documentElement.classList.toggle('modal-abierto', visibles.length > 0);

        // El panel de administración se aparta solo en cuanto se abre otra
        // hoja. Sus botones la cierran ellos mismos antes de abrir la suya,
        // que es lo que evita el fotograma con las dos a la vista; esto es la
        // red de seguridad, para que un botón nuevo no tenga que acordarse ni
        // dependa de que su hoja lleve un z-index más alto. Dos hojas
        // apiladas esconden la de abajo y dejan dos tiradores a la vista.
        const admin = document.getElementById('modal-admin');
        if (admin && visibles.length > 1 && visibles.includes(admin)) {
            admin.style.display = 'none';
        }
    };

    // Estas páginas repintan listas completas con innerHTML, así que las
    // mutaciones llegan en ráfagas. Se agrupan en un solo repaso por frame.
    let pendiente = false;
    const programarRevision = () => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
            pendiente = false;
            revisar();
        });
    };

    const iniciar = () => {
        revisar();
        new MutationObserver(programarRevision).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();

// ==========================================
// TECLADO EN iOS Y HOJAS INFERIORES
// ==========================================
// Safari no encoge la ventana al abrir el teclado: encoge el viewport visual
// y desplaza el documento entero para revelar el campo enfocado. Como las
// hojas (.hoja-overlay) son position:fixed y hacen su propio scroll interno,
// ese desplazamiento solo saca el encabezado de la hoja por arriba.
//
// Aquí se mide el teclado con visualViewport y se publica su altura en
// --alto-teclado. Las hojas la suman a su margen inferior, así que se apoyan
// sobre el teclado en vez de esconderse detrás, y ya no hace falta que el
// documento se mueva: se devuelve a cero.
//
// El bloque nació en el panel de refacciones, cuya página no se desplaza
// nunca (html, body con overflow:hidden). Aquí lo comparten pantallas que sí
// se desplazan, como el panel principal, así que la vuelta a cero se limita
// al rato en que hay una hoja abierta; el resto del tiempo la página se
// desplaza con normalidad.
//
// Ojo: sólo el teclado de texto justifica mover la hoja. La rueda de un
// <select> (y la de los campos de fecha y hora) encoge el viewport visual
// exactamente igual, pero iOS ya se encarga de dejar el campo enfocado a la
// vista. Si además subimos la hoja, todo el formulario se recoloca mientras
// la rueda está abierta y el toque que la cierra acaba cayendo sobre el
// control que quedó en esa posición: en el panel de refacciones, elegir la
// línea disparaba «Guardar Equipo». Por eso la altura se publica sólo
// cuando el foco está en un campo que de verdad levanta teclado.
(() => {
    const raiz = document.documentElement;

    // Tipos de <input> que no abren teclado: unos no tienen campo de texto y
    // otros (fecha, hora) abren su propia rueda, que es justo lo que hay que
    // ignorar.
    const TIPOS_SIN_TECLADO = new Set([
        'button', 'checkbox', 'color', 'date', 'datetime-local', 'file',
        'hidden', 'image', 'month', 'radio', 'range', 'reset', 'submit',
        'time', 'week'
    ]);

    const hayTecladoDeTexto = () => {
        const el = document.activeElement;
        if (!el || el === document.body) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === 'TEXTAREA') return true;
        if (el.tagName !== 'INPUT') return false;
        return !TIPOS_SIN_TECLADO.has(String(el.type || 'text').toLowerCase());
    };

    const hayHojaAbierta = () => Array.from(document.querySelectorAll('.hoja-overlay'))
        .some(el => getComputedStyle(el).display !== 'none');

    const anclarDocumento = () => {
        if (window.scrollY !== 0 && hayHojaAbierta()) window.scrollTo(0, 0);
    };

    const ajustar = () => {
        const vv = window.visualViewport;
        if (!vv) return;

        // innerHeight es el viewport de maquetación, que no cambia con el
        // teclado; vv.height sí. La diferencia es lo que ocupa.
        const alto = hayTecladoDeTexto()
            ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
            : 0;
        raiz.style.setProperty('--alto-teclado', alto + 'px');

        anclarDocumento();
    };

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', ajustar);
        window.visualViewport.addEventListener('scroll', ajustar);
        // Una medida inicial, para que la variable exista desde el arranque y
        // no sólo a partir del primer teclado.
        ajustar();
    }

    // El scroll del documento (no el de los contenedores internos, que no
    // burbujea hasta window) vuelve al origen mientras haya una hoja abierta.
    window.addEventListener('scroll', anclarDocumento, { passive: true });

    // Pasar de un campo de texto a un <select> no siempre cambia la altura
    // del viewport —el teclado y la rueda miden casi lo mismo—, así que el
    // evento de resize puede no llegar. Se recalcula también al mover el
    // foco. Al cerrar el teclado, además, Safari tarda un instante en
    // devolver las medidas definitivas.
    document.addEventListener('focusin', () => setTimeout(ajustar, 0));
    document.addEventListener('focusout', () => setTimeout(ajustar, 100));
})();

// ==========================================
// TOQUE FANTASMA AL CERRAR UNA RUEDA DE iOS
// ==========================================
// La rueda de un <select> (o de un campo de fecha) es una vista nativa que
// se dibuja encima de la página. El toque que la cierra no llega al
// documento como pointerdown, pero iOS sí sintetiza después un click en esas
// coordenadas, que caen sobre lo que haya quedado debajo. Si es un botón, se
// dispara solo.
//
// Un toque de verdad siempre trae su pointerdown sobre el mismo botón. Aquí
// se descarta el click que no lo tenga, y sólo durante el rato siguiente a
// haber usado una rueda, para no estorbar a nada más. Se limita a <button>
// a propósito: el click programático sobre un <input type="file"> escondido
// tras una etiqueta tampoco trae pointerdown y tiene que seguir pasando.
(() => {
    const MARGEN_MS = 700;

    const esControlDeRueda = (el) => {
        if (!el) return false;
        if (el.tagName === 'SELECT') return true;
        if (el.tagName !== 'INPUT') return false;
        return ['date', 'datetime-local', 'month', 'time', 'week']
            .includes(String(el.type || '').toLowerCase());
    };

    let ultimaRueda = 0;
    let ultimoPointerdown = null;

    const marcarRueda = (e) => {
        if (esControlDeRueda(e.target)) ultimaRueda = Date.now();
    };
    document.addEventListener('change', marcarRueda, true);
    document.addEventListener('focusout', marcarRueda, true);

    document.addEventListener('pointerdown', (e) => {
        ultimoPointerdown = e.target;
    }, true);

    document.addEventListener('click', (e) => {
        const boton = e.target && e.target.closest && e.target.closest('button');

        // Cada pointerdown avala un solo click. Se consume aquí para que uno
        // viejo no acabe avalando al fantasma que venga después.
        const avalado = boton && ultimoPointerdown && boton.contains(ultimoPointerdown);
        ultimoPointerdown = null;

        if (!boton || avalado) return;
        if (Date.now() - ultimaRueda > MARGEN_MS) return;

        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);
})();

// ==========================================
// EL MODO ADMINISTRADOR VIAJA ENTRE PANTALLAS
// ==========================================
// `index.html`, `10-refacciones.html` y `11-mapa-activos.html` son tres
// documentos distintos: al pasar de uno a otro se recarga todo y
// `window.modoAdminActivo` vuelve a false. Quien lo encendió tendría que
// volver a teclear la contraseña en cada salto, y de hecho no podía: el mapa
// no la pide en ningún sitio.
//
// Por eso el modo se sostiene en `sessionStorage`, que dura lo que la pestaña
// y no sobrevive a cerrar la aplicación. Se enciende y se apaga siempre por
// aquí para que no se quede un lado sin el otro: apagarlo en refacciones
// dejaba la marca puesta y al volver al panel principal seguías de
// administrador.
window.sostenerModoAdmin = (activo) => {
    window.modoAdminActivo = !!activo;
    if (activo) sessionStorage.setItem('adminSostenido', 'true');
    else sessionStorage.removeItem('adminSostenido');
};

// Lo que dejó puesto la pantalla anterior. Se lee al cargar cada documento.
window.modoAdminSostenido = () => sessionStorage.getItem('adminSostenido') === 'true';

// ==========================================
// CONTRASEÑA DEL MODO ADMINISTRADOR
// ==========================================
// La misma hoja para las dos pantallas que encienden el modo administrador.
// Vive aquí, y no en el marcado de cada documento, porque `10-refacciones.html`
// e `index.html` no comparten más JavaScript que este archivo: es la razón por
// la que aquí viven también los permisos de refacciones.
//
// El panel principal la pedía con `prompt()`, que no vale para una contraseña:
// iOS capitaliza la primera letra —y la nuestra va en minúsculas—, no deja
// ocultar lo tecleado y se dibuja como un aviso del navegador encima de la
// aplicación instalada.
//
// Lo único que cambia de una pantalla a otra es qué pasa al acertar, y eso lo
// pone quien la abre:
//
//     window.abrirClaveAdmin(() => { ...encender el modo administrador... });
//
// La hoja se monta la primera vez que se pide, así que una pantalla que nunca
// la abra no carga con su marcado. Que se cree sobre la marcha no la deja
// fuera de nada: el observador de más arriba y el bloque del teclado miran el
// documento vivo.
(() => {
    let alAcertar = null;

    const MARCADO = `
    <div id="modal-clave-admin" class="hoja-overlay" style="z-index:5300;">
        <div class="hoja-contenido" style="max-width: 420px; overflow: hidden; padding: 12px 20px 20px;">
            <div class="hoja-encabezado">
                <h3 class="hoja-titulo">Modo administrador</h3>
                <button onclick="window.cerrarClaveAdmin()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
            </div>

            <div class="form-group">
                <label>Contraseña</label>
                <div style="display:flex; gap:8px; align-items:stretch;">
                    <input type="password" id="inp-clave-admin" placeholder="Contraseña"
                           autocapitalize="none" autocorrect="off" autocomplete="current-password"
                           spellcheck="false" enterkeyhint="go"
                           onkeypress="window.manejarEnterClave(event)"
                           style="flex:1; min-width:0;">
                    <button type="button" id="btn-ver-clave" onclick="window.alternarVisibilidadClave()" style="flex-shrink:0; width:44px; border:none; border-radius:10px; background:#f2f2f7; color:#007aff; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;"></button>
                </div>
                <div id="error-clave-admin" style="visibility:hidden; margin-top:6px; font-size:0.78rem; color:#ff3b30; font-weight:500;">Contraseña incorrecta.</div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:4px;">
                <button onclick="window.cerrarClaveAdmin()" style="padding:10px 18px; background:#f2f2f7; color:#1c1c1e; border:none; border-radius:10px; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.95rem;">Cancelar</button>
                <button onclick="window.confirmarClaveAdmin()" style="padding:10px 20px; background:#007aff; color:white; border:none; border-radius:10px; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.95rem;">Entrar</button>
            </div>
        </div>
    </div>`;

    const montarHoja = () => {
        let hoja = document.getElementById('modal-clave-admin');
        if (hoja) return hoja;
        const envoltorio = document.createElement('div');
        envoltorio.innerHTML = MARCADO.trim();
        hoja = envoltorio.firstElementChild;
        document.body.appendChild(hoja);
        return hoja;
    };

    window.abrirClaveAdmin = (seguirAlAcertar) => {
        const hoja = montarHoja();
        alAcertar = typeof seguirAlAcertar === 'function' ? seguirAlAcertar : null;

        const campo = document.getElementById('inp-clave-admin');
        campo.value = '';
        campo.type = 'password';
        document.getElementById('error-clave-admin').style.visibility = 'hidden';
        window.actualizarIconoClave();
        hoja.style.display = 'flex';

        // El foco se retrasa: en iOS enfocar un campo que todavía no se ha
        // pintado no levanta el teclado.
        requestAnimationFrame(() => setTimeout(() => campo.focus(), 60));
    };

    window.cerrarClaveAdmin = () => {
        alAcertar = null;
        const hoja = document.getElementById('modal-clave-admin');
        if (hoja) hoja.style.display = 'none';
        const campo = document.getElementById('inp-clave-admin');
        if (campo) campo.value = '';
    };

    window.alternarVisibilidadClave = () => {
        const campo = document.getElementById('inp-clave-admin');
        if (!campo) return;
        campo.type = campo.type === 'password' ? 'text' : 'password';
        window.actualizarIconoClave();
        campo.focus();
    };

    // El botón no lleva texto, así que lo que dice va al `aria-label` y al
    // `title`; el icono se reescribe entero porque es el propio dibujo el que
    // cambia.
    window.actualizarIconoClave = () => {
        const campo = document.getElementById('inp-clave-admin');
        const btn = document.getElementById('btn-ver-clave');
        if (!campo || !btn) return;

        const visible = campo.type === 'text';
        const etiqueta = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
        btn.setAttribute('aria-label', etiqueta);
        btn.setAttribute('title', etiqueta);
        btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
        btn.innerHTML = visible
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.4 5.2A9.6 9.6 0 0 1 12 4.9c5 0 9 4.6 9 7.1 0 1-.7 2.3-1.8 3.5"/><path d="M6.3 6.9C4.2 8.4 3 10.6 3 12c0 2.5 4 7.1 9 7.1 1.4 0 2.7-.3 3.8-.9"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12c0-2.5 4-7.1 9-7.1s9 4.6 9 7.1-4 7.1-9 7.1S3 14.5 3 12z"/><circle cx="12" cy="12" r="2.6"/></svg>`;
    };

    window.confirmarClaveAdmin = () => {
        const campo = document.getElementById('inp-clave-admin');
        if (!campo) return;

        if (campo.value !== window.PASSWORD_ADMIN) {
            const error = document.getElementById('error-clave-admin');
            if (error) error.style.visibility = 'visible';
            campo.value = '';
            campo.focus();
            return;
        }

        // Se guarda antes de cerrar, que es lo que lo borra.
        const seguir = alAcertar;
        window.cerrarClaveAdmin();
        if (seguir) seguir();
    };

    window.manejarEnterClave = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            window.confirmarClaveAdmin();
        }
    };
})();
