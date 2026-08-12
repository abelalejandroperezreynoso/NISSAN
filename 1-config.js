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
        const hayModal = Array.from(document.querySelectorAll('[id^="modal-"]')).some(esOverlayVisible);
        document.documentElement.classList.toggle('modal-abierto', hayModal);
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
