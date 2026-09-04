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

// --- VERSIÓN DE LA APLICACIÓN ---
// Se sube a mano en cada cambio que tenga que llegar a los teléfonos, y tiene
// que coincidir con la de `version.json` (`./subir-version.sh` cambia las dos
// y las etiquetas `?v=` de las tres pantallas de una vez). Es lo único que
// permite que un dispositivo con el JavaScript viejo cargado se entere de que
// hay una versión nueva; ver el bloque «Comprobación de versión» al final de
// este archivo.
window.VERSION_APP = '2026-09-04-11';

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

// Una pregunta de asistencia no se contesta: se confirma. Sirve para pasar
// lista de una junta o una capacitación —la encuesta se dirige a quien tenía
// que ir y cada quien registra que fue—, así que no hay respuesta buena ni
// mala que calificar y **se da por cumplida al enviarla**: el envío le escribe
// su calificación, como hacen la escala y las opciones marcadas.
//
// El valor que se guarda es este texto y no la hora: cuándo se registró ya lo
// dice `submitted_at` de la respuesta, y así todo lo que ya imprime
// `answers_json` por su llave lo enseña legible sin tener que formatear nada.
window.TIPO_PREGUNTA_ASISTENCIA = 'attendance';
window.TEXTO_ASISTENCIA = 'Asistí';
window.esPreguntaDeAsistencia = (pregunta) =>
    !!pregunta && pregunta.question_type === window.TIPO_PREGUNTA_ASISTENCIA;

// ==========================================
// LA HORA DE UN REGISTRO DE ASISTENCIA
// ==========================================
// Pasar lista sin hora no sirve de mucho: quien no fue puede registrarse al
// día siguiente. Por eso una pregunta de asistencia lleva **la fecha y la hora
// del evento**, y sólo se puede registrar dentro de la hora siguiente. Antes
// no aparece —todavía no ha pasado nada que confirmar— y después tampoco: no
// haberla contestado es la inasistencia.
//
// Viaja en la **primera posición de `options`**, que para este tipo no guardaba
// nada, así que no hay columna nueva ni script que correr. Es la misma idea que
// la guía de una escala en la cuarta posición.
//
// La fecha es opcional: sin ella la pregunta se comporta como antes —siempre
// registrable—, que es lo que deja en pie a las que ya estaban creadas.
window.PLAZA_FECHA_EVENTO = 0;
window.MINUTOS_PARA_REGISTRAR_ASISTENCIA = 60;

window.fechaDelEvento = (pregunta) => {
    if (!window.esPreguntaDeAsistencia(pregunta)) return null;
    const crudo = window.opcionesDePregunta(pregunta)[window.PLAZA_FECHA_EVENTO];
    if (!crudo || typeof crudo !== 'string') return null;
    const fecha = new Date(crudo);
    return isNaN(fecha.getTime()) ? null : fecha;
};

window.ventanaDeLaPregunta = (pregunta) => {
    const inicio = window.fechaDelEvento(pregunta);
    if (!inicio) return null;
    return {
        inicio,
        fin: new Date(inicio.getTime() + window.MINUTOS_PARA_REGISTRAR_ASISTENCIA * 60000)
    };
};

// Los cuatro estados en los que puede estar una pregunta de asistencia. Por
// aquí pasan el formulario —que apaga la casilla—, el envío —que no acepta un
// registro fuera de hora— y la pantalla de calificar.
window.estadoDeAsistencia = (pregunta, ahora) => {
    const ventana = window.ventanaDeLaPregunta(pregunta);
    if (!ventana) return { estado: 'sin-fecha' };

    const t = (ahora instanceof Date ? ahora : new Date()).getTime();
    if (t < ventana.inicio.getTime()) return { estado: 'antes', ...ventana };
    if (t > ventana.fin.getTime()) return { estado: 'cerrada', ...ventana };
    return { estado: 'abierta', ...ventana };
};

window.fechaYHoraLegible = (fecha) => !(fecha instanceof Date) || isNaN(fecha.getTime())
    ? ''
    : fecha.toLocaleString('es-MX', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

// S\u00f3lo la hora. Sacarla partiendo el texto de `fechaYHoraLegible` por la
// coma funciona en es-MX y se rompe en cuanto el formato cambia.
window.horaLegible = (fecha) => !(fecha instanceof Date) || isNaN(fecha.getTime())
    ? ''
    : fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

// Lo que se le dice a quien la mira, seg\u00fan en qu\u00e9 momento llegue. Sin punto
// final: en espa\u00f1ol la hora ya acaba en «a.m.» y se ve\u00edan dos seguidos.
window.avisoDeAsistencia = (pregunta, ahora) => {
    const est = window.estadoDeAsistencia(pregunta, ahora);
    if (est.estado === 'sin-fecha') return '';

    if (est.estado === 'antes') {
        return `Se podr\u00e1 registrar el ${window.fechaYHoraLegible(est.inicio)}, y hasta las ${window.horaLegible(est.fin)}`;
    }
    if (est.estado === 'cerrada') {
        return `El plazo cerr\u00f3 el ${window.fechaYHoraLegible(est.fin)} y ya no se puede registrar`;
    }
    return `Tienes hasta las ${window.horaLegible(est.fin)} para registrarla`;
};

// ------------------------------------------------------------------
// LA VENTANA DE UNA ENCUESTA ENTERA
// ------------------------------------------------------------------
// El pendiente es de la encuesta, no de una pregunta suelta, y las pantallas
// que lo deciden —`esEvaluacionPendiente` y el badge del panel— parten de
// `evaluations` y no traen las preguntas. Por eso las ventanas se piden una
// sola vez por sesión y se guardan aquí, como la caché de clasificaciones que
// se certifican: quien pregunta lo hace sin poder esperar.
//
// La consulta trae **sólo** las preguntas de asistencia, que son pocas.
//
// Si una encuesta tuviera varias con fechas distintas —no es para lo que está
// pensada: una encuesta de asistencia es de un evento— la ventana va de la
// primera a la última, para que ninguna se quede sin poder registrarse. Cada
// pregunta sigue exigiendo la suya al contestarla.
window.ventanasAsistencia = null;
let promesaVentanasAsistencia = null;

window.cargarVentanasDeAsistencia = (recargar = false) => {
    if (recargar) { promesaVentanasAsistencia = null; window.ventanasAsistencia = null; }
    if (promesaVentanasAsistencia) return promesaVentanasAsistencia;

    promesaVentanasAsistencia = sb.from('evaluation_questions')
        .select('evaluation_id, options, question_type')
        .eq('question_type', window.TIPO_PREGUNTA_ASISTENCIA)
        .then(({ data, error }) => {
            const mapa = {};
            if (!error && data) {
                data.forEach(q => {
                    const ventana = window.ventanaDeLaPregunta(q);
                    if (!ventana) return;
                    const clave = String(q.evaluation_id);
                    const ya = mapa[clave];
                    mapa[clave] = ya
                        ? { inicio: ya.inicio < ventana.inicio ? ya.inicio : ventana.inicio,
                            fin: ya.fin > ventana.fin ? ya.fin : ventana.fin }
                        : ventana;
                });
            }
            // Un fallo deja el mapa vacío: sin ventana todo se comporta como
            // antes, que es preferible a esconderle el pendiente a todo el
            // mundo porque una consulta no respondió.
            window.ventanasAsistencia = mapa;
            return mapa;
        })
        .catch(() => { window.ventanasAsistencia = {}; return {}; });

    return promesaVentanasAsistencia;
};

window.ventanaDeAsistencia = (evaluationId) =>
    (window.ventanasAsistencia || {})[String(evaluationId)] || null;

// ¿Hay que esconder el pendiente de esta encuesta? Sólo si tiene ventana y
// estamos fuera de ella. Mientras la caché no esté cargada no hay ventana y
// todo se comporta como antes, igual que con las clasificaciones.
window.asistenciaFueraDeHora = (evaluationId, ahora) => {
    const v = window.ventanaDeAsistencia(evaluationId);
    if (!v) return false;
    const t = (ahora instanceof Date ? ahora : new Date()).getTime();
    return t < v.inicio.getTime() || t > v.fin.getTime();
};

// Lo que admite una encuesta de modo `boss`. Esa encuesta se guarda ya
// calificada al enviarla —la contesta el jefe y su palabra es el veredicto—,
// así que sólo caben las preguntas que se puntúan solas y las evidencias, que
// no puntúan: quedan como constancia de lo que vio mientras evaluaba. Un texto
// o unas opciones se quedarían sin calificar y sin nadie que los revisara.
window.TIPOS_EN_MODO_JEFE = ['range', window.TIPO_PREGUNTA_FOTO];

// ==========================================
// LOS TIPOS DE PREGUNTA, CON SU EXPLICACIÓN
// ==========================================
// El catálogo de lo que se puede preguntar. Vive aquí y no en el marcado de
// `index.html` porque la hoja de crear encuestas lo dibuja dos veces —el
// control que dice el tipo elegido y la lista donde se elige— y dos copias
// acabarían diciendo cosas distintas.
//
// `detalle` es lo que se lee al elegir, y por eso cuenta las dos cosas que no
// se ven en el nombre: **cómo se contesta** y **quién la califica**. Elegir
// entre «Checklist» y «Recall» a ciegas es lo que hacía falta adivinar antes,
// y de ahí salían encuestas con el tipo equivocado que ya no se podían
// cambiar sin partir el historial.
//
// Un tipo nuevo se añade aquí y aparece solo en la hoja; lo que sí hay que
// tocar aparte es qué controles enseña (`toggleTipoPregunta`) y cómo se
// contesta y se califica.
window.TIPOS_DE_PREGUNTA = [
    {
        valor: 'text',
        icono: '\u270D\uFE0F',
        nombre: 'Texto Abierto',
        detalle: 'Se contesta escribiendo. Puedes dejar una respuesta modelo como referencia, pero la califica quien revise.'
    },
    {
        valor: 'multiple',
        icono: '\u{1F518}',
        nombre: 'Opci\u00f3n M\u00faltiple',
        detalle: 'Se elige una sola opci\u00f3n. Si marcas cu\u00e1l es la correcta se califica sola; si no, se pide adem\u00e1s el porqu\u00e9 y la califica quien revise.'
    },
    {
        valor: 'checklist',
        icono: '\u2611\uFE0F',
        nombre: 'Checklist',
        detalle: 'Se marcan todas las que apliquen. Marcando las correctas se califica sola, y hay que acertarlas todas sin ninguna de m\u00e1s.'
    },
    {
        valor: 'list_match',
        icono: '\u{1F9E0}',
        nombre: 'Recall (Lista de Memoria)',
        detalle: 'Sale un rengl\u00f3n en blanco por cada elemento que registres y se escriben de memoria. Quien revise da por bueno cada uno por separado.'
    },
    {
        valor: 'range',
        icono: '\u{1F4CA}',
        nombre: 'Rango Num\u00e9rico',
        detalle: 'Una escala del 0 al puntaje m\u00e1ximo de la encuesta. Se califica sola, pide explicar todo lo que baje del tope y puedes decir qu\u00e9 significa cada valor.'
    },
    {
        valor: window.TIPO_PREGUNTA_FOTO,
        icono: '\u{1F4F7}',
        nombre: 'Evidencia fotogr\u00e1fica',
        detalle: 'El enunciado dice qu\u00e9 hay que fotografiar y la respuesta es la foto, que se reduce antes de subirla. Para pedir varias, agrega otra pregunta as\u00ed.',
        enunciado: 'Qu\u00e9 hay que fotografiar\u2026'
    },
    {
        valor: window.TIPO_PREGUNTA_ASISTENCIA,
        icono: '\u{1F64B}',
        nombre: 'Registro de asistencia',
        detalle: 'No se contesta: se confirma. Para pasar lista de una junta o una capacitaci\u00f3n; queda registrada al enviar y nadie tiene que calificarla.',
        enunciado: 'A qu\u00e9 se asisti\u00f3\u2026'
    }
];

window.tipoDePregunta = (valor) =>
    window.TIPOS_DE_PREGUNTA.find(t => t.valor === valor) || null;

// Lo que el campo del enunciado pide para cada tipo. Casi todos preguntan algo
// —«Escribe la pregunta»— pero una evidencia pide qué fotografiar y una
// asistencia a qué se asistió, que no son preguntas. Sale de aquí para que la
// hoja lo cambie al cambiar de tipo y no sólo al montar la tarjeta.
window.enunciadoDeTipo = (valor) => {
    const tipo = window.tipoDePregunta(valor);
    return (tipo && tipo.enunciado) || 'Escribe la pregunta aqu\u00ed...';
};

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

// Si la respuesta trae siquiera una pregunta calificada. `grades_json` llega
// como objeto, pero se admite el texto JSON por si alguna consulta lo pide en
// crudo.
window.tieneCalificaciones = (resp) => {
    let grades = resp ? resp.grades_json : null;
    if (typeof grades === 'string') { try { grades = JSON.parse(grades); } catch (e) { grades = null; } }
    return !!grades && typeof grades === 'object' && Object.keys(grades).length > 0;
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

    // Sin mínimo que alcanzar no hay reprobado que reponer. Ojo: quien
    // pregunte tiene que haberse traído `requires_min_score` en su consulta,
    // o esta puerta se queda abierta —la columna que no llega se lee como
    // `undefined` y eso no es `false`—. La arma `window.camposConMinimo`.
    if (!window.exigeMinimo(ev)) return null;

    // Sólo lo ya calificado y todavía no dado por bueno: lo que está sin
    // calificar aún no se sabe, y lo certificado ya pasó.
    if (resp.review_status !== 'Revisado') return null;

    // Una respuesta sin ninguna pregunta calificada no sacó cero: es que no
    // hay nada que puntuar, y `calcularScoreRespuesta` devuelve 0 en los dos
    // casos. Pasa con una encuesta de modo jefe hecha sólo de evidencias
    // fotográficas —que se guarda ya `'Revisado'` y no puntúan— y con
    // cualquier respuesta que alguien diera por revisada sin calificar nada:
    // sin esta puerta se les pedía repetirlas para siempre.
    if (!window.tieneCalificaciones(resp)) return null;

    const puntaje = typeof window.calcularScoreRespuesta === 'function'
        ? window.calcularScoreRespuesta(resp) : 0;
    if (puntaje >= window.UMBRAL_CERTIFICACION) return null;

    const ahora = fecha ? new Date(fecha) : new Date();
    const vence = new Date(new Date(resp.submitted_at).getTime() + dias * 86400000);
    const diasFaltantes = Math.ceil((vence - ahora) / 86400000);

    return { dias, puntaje, vence, diasFaltantes, vencida: diasFaltantes < 0,
             fechaRespuesta: resp.submitted_at };
};

// ==========================================
// RELANZAR UNA ENCUESTA
// ==========================================
// Volver a pedir una encuesta que la gente ya contestó: la clasificación se
// repite, la capacitación se vuelve a dar, el evento se celebra otra vez. Lo
// hace quien la revisa —el instructor que la imparte, que es quien sabe cuándo
// toca— desde el panel de detalles de la encuesta.
//
// Es **un instante, no un interruptor**, que es la misma idea que la orden de
// cerrar sesiones: `relaunched_at` sella la hora en que se dio y toda respuesta
// anterior deja de cerrar el pendiente, así que la encuesta vuelve a salir
// entre los de todo el mundo. En cuanto cada quien la contesta de nuevo, su
// respuesta es posterior al instante y su pendiente se cierra solo; un
// interruptor encendido y olvidado la estaría pidiendo para siempre. Volver a
// relanzarla es adelantar el instante, y no hay nada que apagar después.
//
// Lo que **no** hace es tocar las respuestas anteriores: siguen en el
// historial, en las estadísticas y en lo que ya estuviera certificado. Lo
// único que pierden es la capacidad de cerrar el pendiente.
window.fechaDeRelanzamiento = (ev) => {
    if (!ev || !ev.relaunched_at) return null;
    const f = new Date(ev.relaunched_at);
    return isNaN(f.getTime()) ? null : f;
};

// ¿Esta respuesta sigue contando después del último relanzamiento? Sin
// relanzamiento —o sin la columna, que su script se corre a mano— cuentan
// todas, que es lo de siempre. Una respuesta sin fecha de envío se deja pasar:
// ante la duda, contestada.
window.respuestaTrasRelanzar = (ev, resp) => {
    const relanzada = window.fechaDeRelanzamiento(ev);
    if (!relanzada || !resp || !resp.submitted_at) return true;
    const enviada = new Date(resp.submitted_at);
    return isNaN(enviada.getTime()) || enviada.getTime() >= relanzada.getTime();
};

window.respuestasTrasRelanzar = (ev, respuestas) =>
    (respuestas || []).filter(r => window.respuestaTrasRelanzar(ev, r));

// Relanzar es de quien revisa la encuesta, por lo mismo que corregir a quién va
// dirigida: es quien la imparte. El modo administrador es aparte y lo resuelve
// cada pantalla, como en `puedeEditarDestinatarios`.
window.puedeRelanzarEncuesta = (ev, empleadoId) =>
    window.revisoresDeEncuesta(ev).includes(String(empleadoId));

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
// LAS OPCIONES CORRECTAS DE UNA PREGUNTA
// ==========================================
// Una pregunta de opciones puede decir cuáles dan por buena la respuesta, y
// entonces se califica sola al enviarla: es lo que convierte una encuesta en
// un examen. Sin opciones correctas marcadas todo sigue como antes —la
// califica quien revise—, que es lo que hacen las encuestas de seguridad,
// donde ninguna respuesta es «la buena».
//
// Van dentro de `correct_answer_text`, que para estos tipos no guardaba nada
// aprovechable —era el arreglo de TODAS las opciones, copiado del propio
// campo—, así que no hay columna nueva ni script que correr. Lo nuevo se
// escribe como objeto (`{"correctas": [...]}`) y lo viejo era un arreglo: por
// eso un arreglo se lee como «no se marcó ninguna» y las encuestas de antes se
// siguen calificando a mano, en vez de darse todas por correctas de golpe.
window.PREGUNTAS_CON_OPCIONES = ['multiple', 'checklist'];
window.LLAVE_OPCIONES_CORRECTAS = 'correctas';

window.opcionesCorrectas = (pregunta) => {
    if (!pregunta || !window.PREGUNTAS_CON_OPCIONES.includes(pregunta.question_type)) return [];

    let v = pregunta.correct_answer_text;
    if (typeof v === 'string') {
        if (!v.trim()) return [];
        try { v = JSON.parse(v); } catch (e) { return []; }
    }
    // Lo viejo: el arreglo con todas las opciones. No dice nada de cuál es la
    // correcta y no puede leerse como que lo son todas.
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [];

    const lista = v[window.LLAVE_OPCIONES_CORRECTAS];
    return Array.isArray(lista) ? lista.map(x => String(x)) : [];
};

// Si esta pregunta se califica sola. Lo preguntan el envío —que es quien pone
// la calificación—, el formulario y la pantalla de calificar.
window.seCalificaSola = (pregunta) => window.opcionesCorrectas(pregunta).length > 0;

// Si la respuesta acierta. En una de opción múltiple basta con haber elegido
// una de las correctas —marcar varias como buenas es dar por válidas varias
// salidas—; en un checklist hay que marcar exactamente ésas, ni una de más ni
// una de menos, que es lo que se está preguntando.
window.aciertaEnOpciones = (pregunta, respuesta) => {
    const correctas = window.opcionesCorrectas(pregunta);
    if (correctas.length === 0) return false;

    if (pregunta.question_type === 'checklist') {
        const marcadas = Array.isArray(respuesta)
            ? respuesta.map(String)
            : (respuesta === null || respuesta === undefined || respuesta === '' ? [] : [String(respuesta)]);
        const juego = new Set(correctas);
        return marcadas.length === juego.size && marcadas.every(m => juego.has(m));
    }

    return correctas.includes(String(respuesta));
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

// Los valores que ofrece una escala, del mínimo al máximo de paso en paso.
// Se redondea a un decimal porque sumar 0.5 en coma flotante acaba dando
// 2.9999999999, y ese número no casaría con ninguna llave de la guía. Lo
// preguntan los círculos al contestar y los recuadros de la guía al crearla,
// así que vive aquí y no en cada pantalla.
window.valoresDeEscala = (min, max, paso) => {
    const desde = parseFloat(min);
    const hasta = parseFloat(max);
    const salto = parseFloat(paso);
    if (!isFinite(desde) || !isFinite(hasta) || !isFinite(salto) || salto <= 0) return [];

    const valores = [];
    // El tope de 200 es una red de seguridad: un paso diminuto guardado a mano
    // en la base colgaría el navegador en este bucle.
    for (let v = desde; v <= hasta + 1e-9 && valores.length < 200; v += salto) {
        valores.push(window.claveDeValorEscala(v));
    }
    return valores;
};

// Un valor de la escala redondeado a un decimal, que es como se nombra en la
// guía. Devuelve número; la llave de la guía es este número en texto.
window.claveDeValorEscala = (valor) => {
    const numero = parseFloat(valor);
    return isNaN(numero) ? valor : Math.round(numero * 10) / 10;
};

// Una pregunta de escala puede llevar su propia guía: qué representa cada
// valor **en esa pregunta**. Es otra cosa que las etiquetas de `range_labels`,
// que son de la encuesta entera y caben en dos palabras debajo del círculo.
//
// Viaja en la cuarta posición de `options`, que para una escala es
// `[min, max, paso, guía]`, y no en una columna nueva: así no hay otro script
// que correr a mano. Todo lo que ya lee `options` de una escala mira sólo las
// tres primeras y no se entera.
//
// Esa cuarta posición tiene dos formas, y las dos se entienden:
//
//   'texto libre'                          — como se escribía antes
//   { '0': '…', '1.5': '…', __nota: '…' }  — un recuadro por cada valor
//
// La segunda es la de hoy: la hoja de crear la encuesta dibuja un recuadro por
// cada valor que ofrece la escala —0, 0.5, 1… hasta el máximo— y quien la
// escribe no tiene que inventarse el formato ni acordarse de todos los
// valores. La primera es lo que hay guardado de antes y se sigue leyendo tal
// cual; al abrir esa pregunta para editarla se reparte en recuadros lo que
// venga escrito como «0 = …» y el resto se queda en la nota general, que es lo
// único que no es de ningún valor en concreto.
window.PLAZA_GUIA_ESCALA = 3;
window.LLAVE_NOTA_GUIA = '__nota';

window.guiaDeEscalaCruda = (pregunta) => {
    if (!pregunta || pregunta.question_type !== 'range') return null;
    const guia = window.opcionesDePregunta(pregunta)[window.PLAZA_GUIA_ESCALA];
    return (guia === undefined) ? null : guia;
};

// La nota general: lo que no habla de ningún valor en concreto. En una guía
// vieja —texto libre— es todo lo que hay.
window.guiaDeEscala = (pregunta) => {
    const guia = window.guiaDeEscalaCruda(pregunta);
    if (typeof guia === 'string') return guia.trim();
    if (guia && typeof guia === 'object' && !Array.isArray(guia)) {
        const nota = guia[window.LLAVE_NOTA_GUIA];
        return typeof nota === 'string' ? nota.trim() : '';
    }
    return '';
};

// Qué dice la guía de cada valor, con la llave normalizada a un decimal: lo
// guardado puede venir como '1' o como '1.0' y las dos son el mismo círculo.
window.guiaPorValor = (pregunta) => {
    const guia = window.guiaDeEscalaCruda(pregunta);
    const mapa = {};
    if (!guia || typeof guia !== 'object' || Array.isArray(guia)) return mapa;

    Object.keys(guia).forEach(llave => {
        if (llave === window.LLAVE_NOTA_GUIA) return;
        const valor = parseFloat(llave);
        if (isNaN(valor)) return;
        const texto = typeof guia[llave] === 'string' ? guia[llave].trim() : '';
        if (texto) mapa[String(window.claveDeValorEscala(valor))] = texto;
    });
    return mapa;
};

window.textoGuiaDeValor = (pregunta, valor) =>
    window.guiaPorValor(pregunta)[String(window.claveDeValorEscala(valor))] || '';

// El mismo desplegable en las dos pantallas donde se ve una escala: al
// contestarla y al calificarla. Sin guía no dibuja nada.
//
// Al contestar la guía es **además el control**: cada renglón lleva a la
// izquierda el círculo del valor que explica, así se elige mientras se lee en
// vez de leerlo todo, cerrar y buscar el número abajo —con explicaciones de un
// párrafo, para cuando se llega a los círculos ya no se sabe cuál era cuál—.
// Eso es lo que pide `elegible`:
//
//   { valores, nombre, id, max }
//
// `valores` son los que ofrece la escala, no sólo los explicados: un valor sin
// explicación lleva igualmente su renglón, o con la guía abierta no habría
// manera de elegirlo. `nombre` es el `name` del grupo de radios —el mismo que
// el de los círculos de abajo, así que sólo uno de los dos puede quedar
// marcado y el envío sigue leyendo uno solo—, y `max` es el tope, que es lo
// que mira `updateRangeVisual` para el rótulo del motivo.
//
// La pantalla de calificar la enseña sólo para leerla: ahí el control es otro y
// lo maneja `syncGradeWithAnswer`.
window.bloqueGuiaEscala = (pregunta, elegible) => {
    const porValor = window.guiaPorValor(pregunta);
    const nota = window.guiaDeEscala(pregunta);
    const explicados = Object.keys(porValor).sort((a, b) => parseFloat(a) - parseFloat(b));
    if (!explicados.length && !nota) return '';

    // Sin ningún valor explicado no hay nada que elegir renglón a renglón: la
    // guía es sólo la nota general y los círculos se quedan donde están.
    const eligeAqui = !!(elegible && Array.isArray(elegible.valores) && elegible.valores.length && explicados.length);
    const valores = eligeAqui ? elegible.valores.map(v => String(v)) : explicados;

    const filas = valores.map(v => {
        const valor = window.sanitizeForHTML(v);
        const texto = window.sanitizeForHTML(porValor[v] || '');

        if (!eligeAqui) {
            return `
                    <div class="guia-escala-fila">
                        <span class="guia-escala-valor">${valor}</span>
                        <span class="guia-escala-significado">${texto}</span>
                    </div>`;
        }

        const significado = texto || '<span class="guia-escala-sin-texto">Sin descripción</span>';
        return `
                    <label class="guia-escala-fila guia-escala-fila--elegible">
                        <input type="radio" name="${window.sanitizeForHTML(elegible.nombre)}" value="${valor}" class="resp-range"
                               data-id="${window.sanitizeForHTML(elegible.id)}" data-max="${window.sanitizeForHTML(elegible.max)}"
                               style="display:none;" onchange="updateRangeVisual(this)">
                        <span class="range-circle guia-escala-boton">${valor}</span>
                        <span class="guia-escala-significado">${significado}</span>
                    </label>`;
    }).join('');

    const listaHtml = filas ? `<div class="guia-escala-lista">${filas}</div>` : '';
    const notaHtml = nota ? `<div class="guia-escala-texto">${window.sanitizeForHTML(nota)}</div>` : '';
    // La pista va **dentro** del mismo <span> que el rótulo: el resumen es un
    // flex con `gap`, así que cada nodo suelto cuenta como elemento y en un
    // teléfono la pista se quedaba colgada a la derecha del título partido en
    // dos renglones.
    const pista = eligeAqui ? ' <span class="hoja-plegable-nota">y elige aquí</span>' : '';

    return `
        <details class="hoja-plegable guia-escala${eligeAqui ? ' guia-escala--elegible' : ''}">
            <summary class="hoja-plegable-resumen"><span>📖 Qué significa cada valor${pista}</span></summary>
            <div class="hoja-plegable-cuerpo guia-escala-cuerpo">${listaHtml}${notaHtml}</div>
        </details>`;
};

// Lo escrito a mano en una guía vieja, repartido en recuadros: los renglones
// que empiezan por un número y un separador —«0 = no existe», «1: a medias»—
// son de ese valor y lo demás se queda en la nota. Sin esto, abrir una de esas
// preguntas para editarla dejaría el texto en un campo que ya no existe.
window.guiaDesdeTextoLibre = (texto) => {
    const valores = {};
    const sueltos = [];

    String(texto || '').split(/\r?\n/).forEach(renglon => {
        const casa = renglon.match(/^\s*(\d+(?:[.,]\d+)?)\s*[=:.–—-]\s*(.+?)\s*$/);
        if (casa) valores[String(window.claveDeValorEscala(casa[1].replace(',', '.')))] = casa[2];
        else if (renglon.trim()) sueltos.push(renglon.trim());
    });

    return { valores, nota: sueltos.join('\n') };
};

// La guía tal como se guarda, a partir de sus dos mitades. Vacía por completo
// devuelve null: en `options` no se escribe una cuarta posición que no dice
// nada.
window.guiaDeEscalaParaGuardar = (valores, nota) => {
    const guia = {};
    Object.keys(valores || {}).forEach(llave => {
        const texto = String(valores[llave] || '').trim();
        if (texto) guia[llave] = texto;
    });

    const general = String(nota || '').trim();
    if (general) guia[window.LLAVE_NOTA_GUIA] = general;

    return Object.keys(guia).length ? guia : null;
};

// Si esta pregunta lleva campo de motivo. Una que se califica sola no: ahí sí
// hay una respuesta buena y otra mala, se acierta o no se acierta, y pedir
// además el porqué de cada una convierte un examen de diez preguntas en diez
// redacciones. Es la diferencia entre examinar y levantar hallazgos.
window.llevaMotivo = (pregunta) =>
    !!pregunta &&
    window.PREGUNTAS_CON_MOTIVO.includes(pregunta.question_type) &&
    !window.seCalificaSola(pregunta);

// El tope de la escala es el «todo bien»: no hay nada que explicar. Cualquier
// valor por debajo sí, que es donde está el hallazgo. Las demás preguntas con
// opciones piden el motivo siempre: ahí ninguna respuesta es la buena.
window.pideMotivo = (pregunta, valor) => {
    if (!window.llevaMotivo(pregunta)) return false;
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

// Quién dirigió la encuesta a cada persona. Un revisor puede corregir a quién
// va dirigida —es el instructor que la imparte—, y al hacerlo queda apuntado
// que fue él: `assigned_by` es un objeto `{ idEmpleado: idRevisor }` dentro de
// la propia fila de la encuesta. Llega como jsonb o como texto, según cómo se
// creara la columna, igual que las tres listas de destinatarios.
window.asignacionesDeEncuesta = (ev) => {
    if (!ev) return {};
    let v = ev.assigned_by;
    if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch (e) { return {}; }
    }
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
};

// El id que quedó apuntado, tal cual. Que siga valiendo —que esa persona siga
// siendo revisora y no sea quien contestó— lo decide quien lo use.
window.revisorQueAsigno = (ev, empleadoId) => {
    const apuntado = window.asignacionesDeEncuesta(ev)[String(empleadoId)];
    return apuntado === undefined || apuntado === null ? '' : String(apuntado).trim();
};

// Los revisores que le quedan a UNA respuesta. Nadie se califica a sí mismo,
// así que la respuesta de un revisor se la quedan los demás revisores; si no
// hay más, la lista sale vacía y la revisión vuelve a su jefe inmediato, que
// es preferible a dejarla sin nadie que pueda tocarla.
//
// Y si a esta persona la dirigió a la encuesta uno de los revisores, la
// respuesta es **suya y de nadie más**: quien la asignó es quien sabe qué
// esperaba de ella, y a los demás revisores no tiene por qué aparecerles el
// pendiente. Se cae al reparto de siempre en cuanto lo apuntado deja de valer
// —el revisor que asignó ya no lo es, o resulta ser quien contestó—, porque
// dejar la respuesta sin nadie que pueda calificarla es peor.
window.revisoresDeLaRespuesta = (ev, empleadoQueContesto) => {
    const todos = window.revisoresDeEncuesta(ev)
        .filter(id => String(id) !== String(empleadoQueContesto));

    const asigno = window.revisorQueAsigno(ev, empleadoQueContesto);
    if (asigno && todos.includes(asigno)) return [asigno];

    return todos;
};

// Lo que hay que guardar en `assigned_by`, a partir del mapa que se ha ido
// armando en la hoja. Se queda sólo con lo que sigue teniendo sentido: la
// persona tiene que seguir entre los destinatarios concretos —con «todos los
// colaboradores» no hay a quién apuntar y el mapa se vacía— y quien la asignó
// tiene que seguir siendo revisor. Sin esta poda, quitar a alguien de la lista
// dejaría su apunte colgando y volvería a mandar si se le vuelve a agregar.
window.asignacionesVigentes = (mapa, targetEmployees, revisores) => {
    const destinatarios = (Array.isArray(targetEmployees) ? targetEmployees : [])
        .map(x => String(x).trim());
    if (destinatarios.some(x => x.toUpperCase() === 'ALL')) return {};

    const revisoresOk = (revisores || []).map(x => String(x).trim());
    const limpio = {};

    Object.keys(mapa || {}).forEach(empId => {
        const asigno = String((mapa || {})[empId] || '').trim();
        if (!asigno) return;
        if (!destinatarios.includes(String(empId))) return;
        if (!revisoresOk.includes(asigno)) return;
        limpio[String(empId)] = asigno;
    });

    return limpio;
};

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

// Quien revisa una encuesta —el instructor que la imparte— puede corregir a
// quién va dirigida sin ser administrador: es quien sabe a quién le falta
// tomarla y quién ya no tiene por qué. Lo demás de la configuración —el
// cuestionario, la frecuencia, los revisores— no se le enseña, y el guardado
// de esa hoja restringida sólo escribe las tres columnas de destinatarios.
//
// Lo usan la lista de encuestas (para sacar el lápiz en la tarjeta) y la hoja
// de edición (al abrirla y al guardar), que son dos módulos distintos.
window.puedeEditarDestinatarios = (ev, empleadoId) =>
    window.revisoresDeEncuesta(ev).includes(String(empleadoId));

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

window.hayColumnaAsignador = () => window.hayColumna('evaluations', 'assigned_by');

// Para las consultas que piden columnas por nombre: pedir una que no existe no
// devuelve la fila sin ese campo, revienta la consulta entera.
window.camposConColumna = async (campos, tabla, columna) =>
    (await window.hayColumna(tabla, columna)) ? `${campos}, ${columna}` : campos;

window.camposConAsignador = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'assigned_by');

// Las dos columnas viajan juntas a propósito: `leTocaRevisar` mira las dos, y
// una consulta que trajera sólo la lista de revisores repartiría el pendiente
// entre todos ellos sin enterarse de que ya tiene dueño. Toda pantalla que
// pregunte quién revisa pasa por aquí, así que ninguna puede olvidarse de la
// mitad.
window.camposConRevisores = async (campos) =>
    window.camposConAsignador(
        await window.camposConColumna(campos, 'evaluations', 'reviewer_employees'));

window.camposConReintento = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'retry_days');

window.camposConMinimo = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'requires_min_score');

// El instante del último relanzamiento. Toda consulta que vaya a decidir un
// pendiente tiene que traerlo: sin él, `esEvaluacionPendiente` no se entera de
// que las respuestas de antes ya no cuentan y la encuesta se queda cerrada
// para quien ya la había contestado.
window.hayColumnaRelanzamiento = () => window.hayColumna('evaluations', 'relaunched_at');

window.camposConRelanzamiento = (campos) =>
    window.camposConColumna(campos, 'evaluations', 'relaunched_at');

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

// Cómo se llama cada frecuencia en pantalla. Vive aquí porque lo escriben el
// panel de pendientes —tres veces, una por tipo de tarjeta—, la lista de
// encuestas y el panel de detalles, y las copias ya habían discrepado: unas
// decían «Cada 2 años» y otras «Bienal», y ninguna de las del panel de
// pendientes traducía `once`, así que la tarjeta de una encuesta de única vez
// enseñaba «⏱️ once», el valor crudo de la base.
//
// Sin frecuencia, con `'once'` o con un valor que no esté en la lista se
// responde «Única vez», que es lo que significa no tener ritmo.
window.NOMBRE_FRECUENCIA = {
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    yearly: 'Anual',
    biennial: 'Cada 2 años'
};

window.textoDeFrecuencia = (frecuencia) => window.NOMBRE_FRECUENCIA[frecuencia] || 'Única vez';

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

// ==========================================================================
// COMPROBACIÓN DE VERSIÓN
// ==========================================================================
// Esta aplicación no tiene service worker ni paso de compilación: el navegador
// se guarda los `.js` y el `.html` con su propia caché, y una instalada en la
// pantalla de inicio puede pasarse semanas abierta sin recargar el documento
// ni una vez. El resultado es que un teléfono sigue ejecutando el JavaScript
// de hace un mes contra la base de datos de hoy, y eso no se nota hasta que
// algo nuevo pasa de largo: una pregunta de un tipo que ese código no conoce
// —una evidencia fotográfica— no dibuja ningún control, se envía en `null` y
// la respuesta queda incompleta sin que nadie avise. Pasó de verdad.
//
// La versión que sirve el servidor vive en `version.json`, que se pide con
// `cache: 'no-store'` y con un parámetro distinto cada vez: es la única
// petición que no puede venir de la caché, así que es la que descubre el
// desfase. Al encontrarlo se recarga a una URL con `?v=` nueva, que el
// navegador tampoco ha visto y por eso tiene que pedir a la red.
//
//     await window.comprobarVersionApp()             // ¿hay una más nueva?
//     await window.comprobarVersionApp({forzar:true})// sin esperar al intervalo
//     window.avisarVersionNueva({ bloqueante: true })// la hoja que lo dice
//     window.urlDePantalla('index.html')             // navegar sin caché vieja
//
// Sin `version.json` en el servidor, o sin red, todo se comporta como antes:
// no se avisa de nada y no se bloquea nada.
(() => {
    const ARCHIVO = 'version.json';
    const ESPERA_MAXIMA = 6000;          // ms antes de rendirse
    const INTERVALO = 5 * 60 * 1000;     // ms entre comprobaciones normales

    let ultimaComprobacion = 0;
    let versionEnServidor = null;
    let enCurso = null;

    const leerVersionDelServidor = async () => {
        const control = new AbortController();
        const corte = setTimeout(() => control.abort(), ESPERA_MAXIMA);
        try {
            const resp = await fetch(`${ARCHIVO}?t=${Date.now()}`, {
                cache: 'no-store',
                signal: control.signal
            });
            if (!resp.ok) return null;
            const datos = await resp.json();
            const v = datos && datos.version;
            return (typeof v === 'string' && v) ? v : null;
        } catch (e) {
            // Sin red o sin archivo se sigue con lo que hay: avisar de una
            // versión nueva que no se ha podido comprobar sería peor.
            return null;
        } finally {
            clearTimeout(corte);
        }
    };

    // Lo que ya se sabe, sin preguntar a nadie.
    window.hayVersionNueva = () =>
        !!versionEnServidor && versionEnServidor !== window.VERSION_APP;

    // La última que dijo el servidor, o null si todavía no ha dicho nada.
    window.versionEnServidor = () => versionEnServidor;

    window.comprobarVersionApp = async ({ forzar = false } = {}) => {
        if (window.hayVersionNueva()) return true;
        if (enCurso) return enCurso;
        if (!forzar && Date.now() - ultimaComprobacion < INTERVALO) return false;

        enCurso = (async () => {
            ultimaComprobacion = Date.now();
            const v = await leerVersionDelServidor();
            if (v) versionEnServidor = v;
            enCurso = null;
            return window.hayVersionNueva();
        })();
        return enCurso;
    };

    // La URL de otra pantalla, con la versión pegada. Las tres páginas son
    // documentos distintos y navegar entre ellas es pedir un `.html` que el
    // navegador puede tener guardado viejo; con la versión en la URL no.
    window.urlDePantalla = (archivo) => {
        try {
            const destino = new URL(archivo, window.location.href);
            destino.searchParams.set('v', versionEnServidor || window.VERSION_APP);
            return destino.toString();
        } catch (e) {
            return archivo;
        }
    };

    window.irAPantalla = (archivo) => {
        window.location.href = window.urlDePantalla(archivo);
    };

    window.recargarAVersionNueva = () => {
        const btn = document.getElementById('btn-version-actualizar');
        if (btn) { btn.disabled = true; window.textoBoton(btn, 'Actualizando…'); }
        try {
            const destino = new URL(window.location.href);
            destino.searchParams.set('v', versionEnServidor || String(Date.now()));
            window.location.replace(destino.toString());
        } catch (e) {
            window.location.reload();
        }
    };

    const MARCADO = `
    <div id="modal-version-nueva" class="hoja-overlay" style="z-index:5400;">
        <div class="hoja-contenido" style="max-width: 420px; overflow: hidden; padding: 12px 20px 20px;">
            <div class="hoja-encabezado">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Hay una versión nueva</h3>
                    <div class="hoja-subtitulo" id="sub-version-nueva"></div>
                </div>
            </div>
            <p id="texto-version-nueva" style="margin:4px 0 18px; color:#3c3c43; font-size:0.95rem; line-height:1.45;"></p>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button id="btn-version-luego" onclick="window.cerrarAvisoVersion()" style="padding:10px 18px; background:#f2f2f7; color:#1c1c1e; border:none; border-radius:10px; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.95rem;">Ahora no</button>
                <button id="btn-version-actualizar" onclick="window.recargarAVersionNueva()" style="padding:10px 20px; background:#007aff; color:white; border:none; border-radius:10px; font-weight:600; cursor:pointer; font-family:inherit; font-size:0.95rem;"><span data-texto>Actualizar</span></button>
            </div>
        </div>
    </div>`;

    const montarHoja = () => {
        let hoja = document.getElementById('modal-version-nueva');
        if (hoja) return hoja;
        const envoltorio = document.createElement('div');
        envoltorio.innerHTML = MARCADO.trim();
        hoja = envoltorio.firstElementChild;
        document.body.appendChild(hoja);
        return hoja;
    };

    // Bloqueante quiere decir que no hay «Ahora no»: se usa donde seguir con la
    // versión vieja estropearía el trabajo, que hoy es al abrir una encuesta.
    window.avisarVersionNueva = ({ bloqueante = false } = {}) => {
        if (!window.hayVersionNueva()) return;
        const hoja = montarHoja();

        const sub = document.getElementById('sub-version-nueva');
        if (sub) sub.innerText = `${window.VERSION_APP} → ${versionEnServidor}`;

        const texto = document.getElementById('texto-version-nueva');
        if (texto) {
            texto.innerText = bloqueante
                ? 'Este dispositivo está usando una versión anterior de la aplicación y podría no mostrar todas las preguntas de la encuesta. Actualiza antes de contestarla.'
                : 'Este dispositivo está usando una versión anterior de la aplicación. Se pondrá al día solo la próxima vez que la abras. Si prefieres actualizar ahora, se perderá lo que tengas sin enviar.';
        }

        const luego = document.getElementById('btn-version-luego');
        if (luego) luego.style.display = bloqueante ? 'none' : '';

        hoja.style.display = 'flex';
    };

    window.cerrarAvisoVersion = () => {
        const hoja = document.getElementById('modal-version-nueva');
        if (hoja) hoja.style.display = 'none';
    };

    // ------------------------------------------------------------------
    // La actualización se pone sola
    // ------------------------------------------------------------------
    // Lo normal es que nadie tenga que tocar nada: si la pantalla está en
    // reposo se recarga sin preguntar, así que abrir la aplicación —o volver a
    // ella— basta para quedarse al día. El botón es para lo que no se puede
    // hacer solo.
    //
    // Con una hoja abierta no se recarga jamás: ahí puede haber media encuesta
    // llena, un incidente a medio redactar o una foto ya tomada, y nada de eso
    // sobrevive a una recarga. `modal-abierto` es la marca que el observador de
    // más arriba deja en <html> mientras haya cualquier panel a la vista, y es
    // exactamente donde vive todo formulario de la aplicación. En ese caso se
    // avisa y decide la persona.
    const hayTrabajoAMedias = () =>
        document.documentElement.classList.contains('modal-abierto');

    // Y no se recarga dos veces por la misma versión. Si tras el salto seguimos
    // desfasados es que el despliegue quedó a medias —`version.json` subido y
    // los `.js` todavía viejos, o al revés—, y sin esta marca la aplicación se
    // quedaría recargando en bucle para siempre. La marca vive en
    // `sessionStorage`, que dura lo que la pestaña: un intento por arranque.
    const LLAVE_INTENTO = 'versionIntentada';

    const yaSeIntento = (version) => {
        try { return sessionStorage.getItem(LLAVE_INTENTO) === version; }
        catch (e) { return true; }   // sin sessionStorage no hay red de seguridad
    };

    const anotarIntento = (version) => {
        try { sessionStorage.setItem(LLAVE_INTENTO, version); } catch (e) {}
    };

    const olvidarIntento = () => {
        try { sessionStorage.removeItem(LLAVE_INTENTO); } catch (e) {}
    };

    const comprobarYResolver = async (opciones) => {
        if (!await window.comprobarVersionApp(opciones)) {
            // Al día: si veníamos de un salto, salió bien y la marca sobra.
            olvidarIntento();
            return;
        }
        if (hayTrabajoAMedias() || yaSeIntento(window.versionEnServidor())) {
            window.avisarVersionNueva();
            return;
        }
        anotarIntento(window.versionEnServidor());
        window.recargarAVersionNueva();
    };

    // Al arrancar. Pronto, para que el salto ocurra antes de que nadie se haya
    // puesto a trabajar: es un archivo de sesenta bytes y no le quita sitio a
    // la primera carga de datos.
    window.addEventListener('load', () => setTimeout(() => comprobarYResolver(), 600));

    // Y al volver a primer plano, que es el único momento en que se entera una
    // aplicación instalada que lleva semanas abierta y no ha recargado nunca.
    // Cerrarla y abrirla pasa por aquí aunque iOS no relance el documento.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') comprobarYResolver();
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) comprobarYResolver({ forzar: true });
    });
})();

// ==========================================================================
// CIERRE DE SESIÓN ORDENADO POR EL ADMINISTRADOR
// ==========================================================================
// El administrador puede obligar a toda la plantilla a volver a identificarse.
// No es un interruptor que se enciende y se apaga, sino **un instante**: se
// guarda la hora de la orden en `system_config`, y toda sesión iniciada antes
// de esa hora deja de valer. La diferencia importa. Un interruptor encendido y
// olvidado deja a todo el mundo fuera para siempre; un instante se agota solo,
// porque en cuanto cada persona vuelve a entrar su sesión es posterior a la
// orden y ya no le afecta. Volver a darla es simplemente adelantar el
// instante.
//
//     await window.ordenarCierreDeSesiones()   // el administrador la da
//     await window.sesionEstaInvalidada()      // ¿le alcanza a esta sesión?
//     window.cerrarSesionForzada(mensaje)      // sacar a quien esté dentro
//
// La sesión se guarda en `localStorage` con su hora en `loginTimestamp`
// (2a-core-nav.js), y de ahí sale la comparación. Una sesión sin esa hora es
// de una versión anterior y se cierra igual, que es lo que ya hacía la
// caducidad de treinta días.
//
// Vive aquí porque lo comprueban los tres documentos —el panel, refacciones y
// el mapa— y porque `cerrarSesionForzada` tiene que existir en los tres: antes
// sólo la tenía `2a-core-nav.js`, que es el único que carga `index.html`.
(() => {
    window.CLAVE_CIERRE_SESION = 'cierre_sesion_global';

    const INTERVALO = 5 * 60 * 1000;   // ms entre consultas a la base

    let ultimaConsulta = 0;
    let instante = null;               // ms de la orden, 0 si no hay ninguna
    let enCurso = null;

    const leerInstante = async () => {
        try {
            const { data, error } = await sb.from('system_config')
                .select('texto').eq('key', window.CLAVE_CIERRE_SESION);
            if (error) return null;
            const texto = (data && data.length > 0) ? data[0].texto : null;
            if (!texto) return 0;      // nunca se ha dado la orden
            const ms = Date.parse(texto);
            return isNaN(ms) ? 0 : ms;
        } catch (e) {
            return null;               // sin red se sigue como se estaba
        }
    };

    window.instanteDeCierreGlobal = async ({ forzar = false } = {}) => {
        if (!forzar && instante !== null && Date.now() - ultimaConsulta < INTERVALO) return instante;
        if (enCurso) return enCurso;

        enCurso = (async () => {
            const ms = await leerInstante();
            if (ms !== null) { instante = ms; ultimaConsulta = Date.now(); }
            enCurso = null;
            return instante || 0;
        })();
        return enCurso;
    };

    // Sin sesión abierta no hay nada que invalidar: quien no ha entrado ya está
    // en el login.
    window.sesionEstaInvalidada = async (opciones) => {
        if (!localStorage.getItem('usuarioLogueado')) return false;

        const orden = await window.instanteDeCierreGlobal(opciones);
        if (!orden) return false;

        // Una sesión sin hora viene de una versión anterior a que se guardara:
        // no se puede saber si es de antes o de después de la orden, y ante la
        // duda se pide entrar de nuevo, que es lo que ya hace la caducidad.
        const inicio = parseInt(localStorage.getItem('loginTimestamp'), 10);
        return isNaN(inicio) ? true : inicio < orden;
    };

    // El administrador da la orden. Se sella el instante de ahora y **su propia
    // sesión se renueva**: quien la da no se echa a sí mismo, que si no acabaría
    // fuera a mitad de lo que estuviera administrando.
    window.ordenarCierreDeSesiones = async () => {
        const ahora = new Date();
        const texto = ahora.toISOString();

        // Una escritura que las políticas de RLS rechacen no da error, sólo
        // afecta a cero filas: hay que contar lo que devuelve el `.select()`.
        const { data: existentes, error: errorLectura } = await sb.from('system_config')
            .select('key').eq('key', window.CLAVE_CIERRE_SESION);
        if (errorLectura) throw errorLectura;

        const escritura = (existentes && existentes.length > 0)
            ? sb.from('system_config').update({ texto }).eq('key', window.CLAVE_CIERRE_SESION).select('key')
            : sb.from('system_config').insert([{ key: window.CLAVE_CIERRE_SESION, texto }]).select('key');

        const { data, error } = await escritura;
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('La base no aceptó la orden (ninguna fila se guardó).');
        }

        instante = ahora.getTime();
        ultimaConsulta = Date.now();
        if (localStorage.getItem('usuarioLogueado')) {
            localStorage.setItem('loginTimestamp', String(instante + 1000));
        }
        return ahora;
    };

    // Sacar a quien esté dentro. Estaba en `2a-core-nav.js` y se mudó aquí en
    // cuanto la necesitaron los tres documentos. El login vive sólo en
    // `index.html`, así que desde las otras pantallas hay que ir hasta allí en
    // vez de recargar la que se esté viendo.
    window.cerrarSesionForzada = (mensaje) => {
        if (mensaje) alert(mensaje);
        localStorage.removeItem('usuarioLogueado');
        localStorage.removeItem('loginTimestamp');
        if (window.sostenerModoAdmin) window.sostenerModoAdmin(false);

        const enElPanel = /(^|\/)index\.html$/.test(window.location.pathname)
            || /\/$/.test(window.location.pathname);
        if (enElPanel) window.location.reload();
        else window.irAPantalla('index.html');
    };

    const AVISO = 'El administrador pidió que todos vuelvan a iniciar sesión.';

    // Al arrancar se aplica siempre: es lo que se le pide a esta función, que
    // al abrir la aplicación haya que entrar de nuevo, y ahí no hay nada a
    // medias que perder.
    //
    // Al volver a primer plano con una hoja abierta, no. Ahí puede haber media
    // encuesta llena o una foto ya tomada, y cerrar la sesión de golpe se lo
    // llevaría por delante sin haberlo enviado; se deja para la próxima vez que
    // se abra la aplicación, que es lo que la orden pedía de todas formas. Es
    // el mismo freno que usa la comprobación de versión, y por lo mismo.
    const comprobarYCerrar = async (opciones) => {
        if (await window.sesionEstaInvalidada(opciones)) window.cerrarSesionForzada(AVISO);
    };

    window.addEventListener('load', () => setTimeout(() => comprobarYCerrar({ forzar: true }), 600));

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (document.documentElement.classList.contains('modal-abierto')) return;
        comprobarYCerrar();
    });
})();
