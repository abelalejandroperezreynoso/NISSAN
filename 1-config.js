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
(() => {
    const raiz = document.documentElement;

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
        const alto = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
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

    // Al cerrar el teclado, Safari tarda un instante en devolver las medidas
    // definitivas.
    document.addEventListener('focusout', () => setTimeout(ajustar, 100));
})();
