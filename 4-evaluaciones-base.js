// ==========================================
// 4-evaluaciones-base.js (V53: SOLO AREA_ID EN SUPABASE, MEMORIA EN JS)
// MODIFICADO: Se eliminó la opción "Mi area no aparece"
// ==========================================

// Variable global para guardar los datos en memoria (Caché)
window.evalCache = null;
window.targetUserForEval = null;
window.evalModeRespondiendo = 'self';

// --- HELPER 1: OBTENER JERARQUÍA COMPLETA ---
window.obtenerJerarquiaCompletaEvaluaciones = (liderId) => {
    const all = window.todosLosEmpleadosData || [];
    const hierarchyIds = new Set([String(liderId)]);
    const queue = [String(liderId)];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = all.filter(e => String(e.supId) === currentId);
        children.forEach(child => {
            const childId = String(child.id);
            if (!hierarchyIds.has(childId)) {
                hierarchyIds.add(childId);
                queue.push(childId);
            }
        });
    }
    return hierarchyIds;
};

// --- HELPER 2: VERIFICAR SI SOY SUPERVISOR ---
window.esSupervisorDe = (empleadoId) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if (!user || !empleadoId) return false;
    if (String(user.id) === String(empleadoId)) return true;
    
    const miEstructura = window.obtenerJerarquiaCompletaEvaluaciones(user.id);
    return miEstructura.has(String(empleadoId));
};

// --- HELPER 4: CALCULAR SCORE ---
window.calcularScoreRespuesta = (r) => {
    const grades = r.grades_json || {};
    let sumPercentages = 0;
    let totalQuestions = 0;

    Object.values(grades).forEach(g => {
        totalQuestions++;
        const type = (typeof g === 'object') ? g.type : 'standard';

        if (type === 'numeric_score') {
            sumPercentages += (g.percentage || 0);
        } else if (type === 'list_match' && Array.isArray(g.items)) {
            const ok = g.items.filter(i => i.status === 'correct').length;
            const tot = g.totalExpected || Math.max(g.items.length, 1);
            sumPercentages += ((ok / tot) * 100);
        } else {
            const st = (typeof g === 'object') ? g.status : g;
            if (st === 'correct') sumPercentages += 100;
        }
    });

    return totalQuestions > 0 ? Math.round(sumPercentages / totalQuestions) : 0;
};

// --- HELPER 5: COLOR POR SCORE ---
window.getColorScore = (score) => {
    if (score >= 80) return '#22c55e'; // Verde
    if (score >= 60) return '#f59e0b'; // Naranja
    return '#ef4444'; // Rojo
};

// --- LÓGICA PARA PEDIR ÁREA (USANDO AREA_ID) ---
window.pedirAreaUsuario = async () => {
    document.getElementById('modal-pedir-area').style.display = 'flex';
    const selectEl = document.getElementById('sel-user-area');
    
    selectEl.innerHTML = '<option value="">Cargando áreas...</option>';
    
    try {
        // Traemos ID (UUID) y Nombre
        const { data: areasData, error } = await sb.from('areas')
            .select('id, nombre')
            .eq('activa', true)
            .order('nombre');
            
        if (error) throw error;

        selectEl.innerHTML = '<option value="">-- Selecciona tu área --</option>';
        if (areasData) {
            areasData.forEach(a => {
                selectEl.innerHTML += `<option value="${a.id}" data-nombre="${a.nombre}">${a.nombre}</option>`;
            });
        }
        
    } catch (e) {
        console.error("Error al cargar áreas desde Supabase:", e);
        selectEl.innerHTML = '<option value="">Error al cargar áreas</option>';
    }
};

window.guardarAreaUsuario = async () => {
    const selectEl = document.getElementById('sel-user-area');
    if (selectEl.selectedIndex <= 0) {
        alert("Por favor selecciona un área válida de la lista.");
        return;
    }

    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const areaIdValue = selectedOption.value;
    const areaName = selectedOption.getAttribute('data-nombre');
    
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const btn = document.getElementById('btn-guardar-area');
    btn.disabled = true; btn.innerText = "Guardando...";
    
    try {
        const uuidToSave = areaIdValue;

        // CORRECCIÓN 1: Solo actualizamos area_id en la base de datos
        const { error } = await sb.from('employees')
            .update({ area_id: uuidToSave })
            .eq('employee_id', user.id);
            
        if (error) throw error;
        
        // Mantenemos el nombre en JS para la interfaz
        user.area_id = uuidToSave;
        user.area = areaName;
        localStorage.setItem("usuarioLogueado", JSON.stringify(user));
        
        const empData = window.todosLosEmpleadosData.find(e => String(e.id) === String(user.id));
        if(empData) {
            empData.area_id = uuidToSave;
            empData.area = areaName;
        }

        document.getElementById('modal-pedir-area').style.display = 'none';
        window.cargarVistaEvaluaciones();
        
    } catch(e) {
        alert("Error al guardar: " + e.message);
    } finally {
        btn.disabled = false; btn.innerText = "Guardar Área";
    }
};

// El desplegable del área sale y se esconde con la propia fila: tocarla dos
// veces lo cierra, así que no hace falta ningún botón de cancelar —era otro
// blanco fácil al lado del que sí importa—. El `<select>` se sincroniza al
// abrirlo, porque el área pudo cambiarse desde otro sitio mientras la hoja
// estaba abierta.
window.abrirSelectorDeArea = () => {
    const editor = document.getElementById('area-edit-container');
    if (!editor) return;

    editor.hidden = !editor.hidden;
    if (editor.hidden) return;

    const select = document.getElementById('eval-inline-area-select');
    const valor = document.getElementById('area-display-text');
    if (select && valor) {
        const nombre = (valor.innerText || '').trim();
        const opcion = Array.from(select.options)
            .find(o => (o.getAttribute('data-nombre') || '') === nombre);
        select.value = opcion ? opcion.value : '';
    }
    // Lo lleva a la vista: en un teléfono la tarjeta puede quedar justo en el
    // borde y el desplegable nacer fuera de la pantalla.
    editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// El área que quedó elegida, en la fila y en un solo sitio: quien guarda no
// vuelve a escribir estilos a mano.
window.pintarAreaElegida = (areaName) => {
    const tarjeta = document.getElementById('area-badge-container');
    const valor = document.getElementById('area-display-text');
    const editor = document.getElementById('area-edit-container');
    const boton = tarjeta ? tarjeta.querySelector('.area-eval-fila') : null;

    if (valor) valor.innerText = areaName;
    if (tarjeta) tarjeta.classList.remove('area-eval--falta');
    if (editor) editor.hidden = true;
    if (boton) {
        boton.title = 'Cambiar el área a evaluar';
        boton.setAttribute('aria-label', 'Cambiar el área a evaluar');
    }
};

window.guardarAreaEnEvaluacion = async (empId) => {
    const selectEl = document.getElementById('eval-inline-area-select');
    const indicator = document.getElementById('area-save-indicator');
    
    if (selectEl.selectedIndex <= 0) {
        alert("Selecciona un área válida de la lista.");
        return;
    }

    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const areaIdValue = selectedOption.value;
    const areaName = selectedOption.getAttribute('data-nombre');
    
    if (selectEl) selectEl.disabled = true;
    if (indicator) indicator.hidden = false;
    
    try {
        const uuidToSave = areaIdValue;

        // CORRECCIÓN 2: Solo actualizamos area_id en la base de datos
        const { error } = await sb.from('employees')
            .update({ area_id: uuidToSave })
            .eq('employee_id', empId);
            
        if (error) throw error;
        
        // Mantenemos el nombre en JS para la interfaz
        if (window.todosLosEmpleadosData) {
            const empData = window.todosLosEmpleadosData.find(e => String(e.id) === String(empId));
            if (empData) {
                empData.area_id = uuidToSave;
                empData.area = areaName;
            }
        }
        
        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        if (user && String(user.id) === String(empId)) {
            user.area_id = uuidToSave;
            user.area = areaName;
            localStorage.setItem("usuarioLogueado", JSON.stringify(user));
        }
        
        window.areaConfirmadaParaEstaSesion = true;
        
        window.pintarAreaElegida(areaName);
        
    } catch (e) {
        console.error(e);
        alert("Error al actualizar el área: " + e.message);
    } finally {
        if (selectEl) selectEl.disabled = false;
        if (indicator) indicator.hidden = true;
    }
};

// Función para cerrar el nuevo panel flotante
window.cerrarModalEvaluaciones = () => {
    const modal = document.getElementById('modal-evaluaciones-flotante');
    if (modal) modal.style.display = 'none';
};

// El encabezado de la hoja dice en qué pantalla estás, porque son seis y todas
// se dibujan dentro del mismo contenedor. Al entrar a una encuesta el título
// pasa a ser el suyo y la cruz se convierte en la flecha de volver: cerrar de
// golpe desde dentro dejaba al dedo sin manera de retroceder salvo bajando a
// buscar otra flecha en el cuerpo.
//
// Sin argumentos vuelve a lo de la lista: «Evaluaciones y encuestas» y la cruz.
// Toda pantalla que repinte `#contenido-modal-evaluaciones` tiene que llamarlo,
// o heredará el título de la anterior.
// ¿Se llegó a la encuesta pasando por la lista? De eso depende el botón del
// encabezado, y no de la pantalla que se esté dibujando: la flecha de volver sólo
// tiene a dónde llevar si la lista fue el camino. Desde el panel de inicio se
// entra derecho a la hoja de una encuesta (`abrirEncuestaDesdeInicio`), y ahí esa
// flecha llevaba a una pantalla por la que nadie había pasado: lo que quiere el
// dedo es cerrar. La marca la pone cada puerta de entrada —la lista al dibujarse,
// el panel de inicio al saltársela— y la leen las pantallas que repintan el
// contenedor con el nombre de una encuesta.
window.vengoDeLaListaDeEncuestas = false;

// Y si se pasó además por la pantalla de una clasificación, cuál: ahí es donde
// vuelve el botón del encabezado, que es de donde se tocó la encuesta. Guarda el
// índice del grupo en `window.clasificacionesDeLaLista`, o null si no se entró
// por ahí. La pone `abrirClasificacionDeLaLista` y la quitan las otras dos
// puertas —la lista y la entrada directa desde el inicio—.
window.grupoDeLaListaAbierto = null;

// El «volver» de la hoja de una encuesta, o null si no hay a dónde volver, que es
// lo que `encabezadoHojaEvaluaciones` entiende como «deja la cruz».
window.volverALaListaDeEncuestas = () => {
    if (window.grupoDeLaListaAbierto !== null && window.grupoDeLaListaAbierto !== undefined) {
        const indice = window.grupoDeLaListaAbierto;
        return () => window.abrirClasificacionDeLaLista(indice);
    }
    return window.vengoDeLaListaDeEncuestas ? () => window.cargarVistaEvaluaciones() : null;
};

window.encabezadoHojaEvaluaciones = (titulo, alVolver, idEncuesta, subtitulo) => {
    const h = document.getElementById('titulo-hoja-evaluaciones');
    const btn = document.getElementById('btn-hoja-evaluaciones');
    if (h) h.innerText = titulo || 'Evaluaciones y encuestas';

    // El subtítulo se escribe siempre, aunque sea para vaciarlo: es del título
    // que hay debajo, y dejar el de la pantalla anterior sería peor que no
    // tener ninguno. Vacío no se dibuja —lo esconde `:empty` en `estilos.css`—.
    const sub = document.getElementById('subtitulo-hoja-evaluaciones');
    if (sub) sub.innerText = subtitulo || '';

    // El lápiz sale sólo en la pantalla de una encuesta —la única que sabe cuál
    // editar— y sólo en modo administrador. Las demás llaman sin ese argumento
    // y ahí se esconde, que es lo que evita que se quede el de la anterior.
    const lapiz = document.getElementById('btn-editar-hoja-evaluaciones');
    if (lapiz) {
        const editable = !!idEncuesta && window.modoAdminActivo && !!window.editarEvaluacion;
        lapiz.hidden = !editable;
        lapiz.onclick = editable
            ? () => { window.cerrarModalEvaluaciones(); window.editarEvaluacion(idEncuesta); }
            : null;
    }

    // Los dos de una clasificación se esconden siempre: sólo los enseña la
    // pantalla que sabe de cuál se trata, llamando a `botonesDeClasificacion`
    // **después** de esto. Es lo mismo que hace el lápiz con la encuesta y por
    // lo mismo: si no, se quedaría el de la clasificación anterior.
    ['btn-revisores-hoja-eval', 'btn-nueva-encuesta-hoja-eval'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.hidden = true; b.onclick = null; }
    });

    if (!btn) return;

    if (typeof alVolver === 'function') {
        // Un icono que no es la cruz va con su `<svg>` dentro y sin la clase
        // que la dibuja.
        btn.classList.remove('ios-boton-cerrar');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7"/></svg>';
        btn.title = 'Volver';
        btn.setAttribute('aria-label', 'Volver a la lista de encuestas');
        btn.onclick = alVolver;
    } else {
        // La cruz la dibuja `.ios-boton-cerrar` con pseudoelementos, así que el
        // botón se queda vacío.
        btn.classList.add('ios-boton-cerrar');
        btn.innerHTML = '';
        btn.title = 'Cerrar';
        btn.setAttribute('aria-label', 'Cerrar');
        btn.onclick = window.cerrarModalEvaluaciones;
    }
};

// La hoja de evaluaciones, montada y a la vista. El marcado vive aquí y en un
// solo sitio porque se entra a ella por dos caminos: la lista y, desde el panel
// de inicio, derecho a una encuesta —`abrirEncuestaDesdeInicio`—. Devuelve el
// contenedor donde se dibujan las seis pantallas que comparten la hoja.
window.montarHojaEvaluaciones = () => {
    let modal = document.getElementById('modal-evaluaciones-flotante');
    if (!modal) {
        const modalHTML = `
        <div id="modal-evaluaciones-flotante" class="hoja-overlay" style="z-index:2000;">
            <div class="form-content hoja-contenido" style="max-width: 800px; background: #f8fafc; overflow: hidden; padding: 12px 0 0;">
                <div class="hoja-encabezado-lista">
                    <div style="min-width:0;">
                        <h2 id="titulo-hoja-evaluaciones" class="hoja-titulo">Evaluaciones y encuestas</h2>
                        <div id="subtitulo-hoja-evaluaciones" class="hoja-subtitulo"></div>
                    </div>
                    <div class="hoja-acciones">
                        <!-- Los dos de la pantalla de una clasificación:
                             quién revisa sus encuestas y crear una nueva en
                             ella. Los engancha botonesDeClasificacion, el
                             mismo que los de la hoja de detalle del panel de
                             inicio, y los esconde encabezadoHojaEvaluaciones
                             en las demás pantallas de la hoja. Sin acentos
                             graves aquí dentro: este marcado va en una
                             plantilla de JavaScript y uno la cerraría. -->
                        <button id="btn-revisores-hoja-eval" class="ios-boton-icono" hidden
                                title="Revisores" aria-label="Revisores de esta clasificación">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button id="btn-nueva-encuesta-hoja-eval" class="ios-boton-icono" hidden
                                title="Nueva encuesta" aria-label="Nueva encuesta en esta clasificación">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                        </button>
                        <button id="btn-editar-hoja-evaluaciones" class="ios-boton-icono" hidden
                                title="Editar encuesta" aria-label="Editar encuesta">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                        </button>
                        <button id="btn-hoja-evaluaciones" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                    </div>
                </div>
                <div id="contenido-modal-evaluaciones" style="flex:1; overflow-y: auto; padding: 20px; background: #f8fafc;"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('modal-evaluaciones-flotante');
    }

    // Cómo se cierra esta hoja, para el gesto de deslizarla hacia abajo. Hace
    // falta decirlo porque su botón del encabezado no siempre es la cruz:
    // dentro de una encuesta es la flecha de volver, y deslizar hacia abajo
    // cierra la hoja —lo que hace ese gesto en iOS—, no retrocede.
    modal.__cerrarHoja = () => window.cerrarModalEvaluaciones();

    modal.style.display = 'flex';
    return document.getElementById('contenido-modal-evaluaciones');
};

// Qué estado enseña cada renglón de la lista de encuestas, que no es el de la
// tarjeta del panel de inicio: ahí todas las encuestas son de quien mira, y
// aquí la lista trae además las que sólo revisa —y, en modo administrador, las
// de todo el mundo—. Lo suyo es únicamente elegir cuál de las dos reglas habla,
// que ninguna de las dos se escribe aquí:
//
//   - si la encuesta le toca, su pendiente (`esEvaluacionPendiente`, contado
//     con `estadoDeAsignada`), que es lo mismo que dice el badge del panel;
//   - si no le toca pero la revisa, lo que le queda por calificar
//     (`estadoDeRevision`);
//   - y si no es ninguna de las dos cosas, el estado neutro: la encuesta de
//     otra persona que el administrador está mirando. Ahí una palomita verde
//     mentiría —no está «al día» de nada— y un círculo rojo, más.
//
// Devuelve además el `peso` con el que se ordena —lo vencido primero, lo neutro
// al final— y si cuenta como pendiente de quien mira, que es lo que suma el pie
// de la clasificación.
window.estadoDeEncuestaEnLista = (ev, { leToca, revisor, respuestas, porCalificar }) => {
    // Una encuesta apagada no le pide nada a nadie —sólo llega hasta aquí en
    // modo administrador—, así que va con el estado neutro y al final de su
    // clasificación: pintarle «Sin contestar» en rojo sería reclamar una
    // respuesta que ya no se puede dar. Que está apagada lo dice su etiqueta.
    if (!window.encuestaActiva(ev)) {
        return {
            estado: { texto: 'Inactiva: sólo la ves en modo administrador', neutro: true, color: '#94a3b8' },
            pendiente: false,
            peso: 4
        };
    }

    if (leToca) {
        // En modo jefe la contesta el supervisor y no quien la recibe: es el
        // sexto argumento, y de él depende que no se le pida al evaluado
        // reponer una respuesta que no puede tocar.
        const contestaQuienMira = (ev.mode || 'self') !== 'boss';
        const v = window.esEvaluacionPendiente(
            respuestas, ev.id, ev.frequency, window.inicioDeEncuesta(ev), ev, contestaQuienMira);
        return {
            estado: window.estadoDeAsignada(v),
            // El vencimiento se devuelve entero porque la pantalla de la
            // clasificación saca de él la fecha de la última vez que se
            // contestó, cuando no hay respuesta en el periodo que corre.
            vencimiento: v,
            pendiente: !!(v && v.mostrar),
            peso: !(v && v.mostrar) ? 2 : (v.vencida ? 0 : 1)
        };
    }

    if (porCalificar > 0) {
        return { estado: window.estadoDeRevision(porCalificar), pendiente: false, peso: 1.5 };
    }

    if (revisor) {
        return { estado: window.estadoDeRevision(0), pendiente: false, peso: 2 };
    }

    return {
        estado: { texto: 'No te toca contestarla', neutro: true, color: '#94a3b8', fondo: '#f8fafc', borde: '#e2e8f0' },
        pendiente: false,
        peso: 3
    };
};

// La pantalla de una clasificación de la lista: la séptima que se dibuja dentro
// de `#contenido-modal-evaluaciones`. Es el mismo cuerpo que la hoja de detalle
// del panel de inicio —resultado del último periodo, la línea de los
// anteriores, quién revisa y sus encuestas—, y por eso lo arma el ayudante
// compartido `cuerpoDetalleClasificacion` en lugar de una segunda copia.
//
// **Va dentro de esta hoja y no como una hoja encima.** Apilar
// `#modal-detalle-clasificacion` sobre la de evaluaciones dejaría dos tiradores
// a la vista y esconderría la de abajo, que es justo lo que la aplicación no
// hace en ningún sitio; y como las dos llevan el mismo z-index, la de
// evaluaciones —que se inserta al final del `<body>`— taparía a la otra. Aquí
// ya hay una hoja abierta con su encabezado, así que lo que toca es cambiar de
// pantalla, como al abrir una encuesta.
//
// El botón del encabezado es la flecha de volver a la lista, y los dos de la
// clasificación —el ojo y el «+»— son los mismos de la hoja del inicio, con sus
// ids de aquí y cerrando esta hoja antes de abrir la suya.
window.abrirClasificacionDeLaLista = (indice) => {
    const grupo = (window.clasificacionesDeLaLista || [])[indice];
    if (!grupo || !window.cuerpoDetalleClasificacion) return;

    // Se entró por la pantalla de una clasificación, así que la encuesta que se
    // abra desde aquí vuelve a ella y no a la lista.
    window.grupoDeLaListaAbierto = indice;
    window.vengoDeLaListaDeEncuestas = true;

    const container = window.montarHojaEvaluaciones();

    // El subtítulo va en texto pelado —lo escribe `innerText`—, así que el pie
    // del renglón, que lleva el promedio con su color, no sirve tal cual.
    const total = grupo.filas.length;
    const subtitulo = [
        `${total} encuesta${total === 1 ? '' : 's'}`,
        grupo.pendientes > 0 ? `${grupo.pendientes} pendiente${grupo.pendientes === 1 ? '' : 's'}` : null,
        grupo.porCalificar > 0 ? `${grupo.porCalificar} por calificar` : null
    ].filter(Boolean).join(' · ');

    window.encabezadoHojaEvaluaciones(
        grupo.nombre, () => window.cargarVistaEvaluaciones(), null, subtitulo);

    // Después del encabezado, que es quien los esconde.
    if (window.botonesDeClasificacion) {
        window.botonesDeClasificacion(grupo.nombre, total, grupo.filas.map(f => f.ev), {
            idOjo: 'btn-revisores-hoja-eval',
            idMas: 'btn-nueva-encuesta-hoja-eval',
            cerrar: window.cerrarModalEvaluaciones
        });
    }

    // El «abridor» es `abrirHistorialEvaluacion` y no `abrirEncuestaDesdeInicio`:
    // la encuesta se dibuja en esta misma hoja y conserva la flecha de volver,
    // que con la marca de arriba lleva de vuelta a esta pantalla.
    container.innerHTML = window.cuerpoDetalleClasificacion(
        grupo, window.respuestasDeLaLista, 'window.abrirHistorialEvaluacion');
    container.scrollTop = 0;
};

// --- 1. CARGAR LISTA PRINCIPAL ---
window.cargarVistaEvaluaciones = async () => {
    // Se entró por la lista, así que las encuestas que se abran desde aquí sí
    // tienen a dónde volver —y a la lista, no a la pantalla de una
    // clasificación: por eso se limpia esa otra marca—.
    window.vengoDeLaListaDeEncuestas = true;
    window.grupoDeLaListaAbierto = null;
    const container = window.montarHojaEvaluaciones();
    window.encabezadoHojaEvaluaciones();

    if (!window.evalCache) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;"><div class="spinner" style="margin: 0 auto 15px auto;"></div><p>Cargando evaluaciones...</p></div>';
    } else {
        container.innerHTML = '';
    }
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    // Qué clasificaciones se certifican: la insignia de más abajo lo pregunta
    // sin poder esperar, así que la caché se llena antes de dibujar nada.
    await window.cargarCertificacionDeClasificaciones();

    // Y quién revisa cada clasificación, por lo mismo: de eso depende que a un
    // revisor nombrado por clasificación le salga la encuesta en su lista.
    await window.cargarRevisoresDeClasificaciones();

    // Y las ventanas de las encuestas que pasan lista, que es lo que pide el
    // panel de pendientes antes de decidir nada: cada renglón dice ahora en qué
    // estado está, y `esEvaluacionPendiente` consulta esa ventana sin poder
    // esperar. Sin ella no hay ventana y todo se comporta como antes.
    if (window.cargarVentanasDeAsistencia) await window.cargarVentanasDeAsistencia();

    const misDirectos = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
    const tengoEquipo = misDirectos.length > 0;

    let evals = [], misRespuestas = [], allPending = [];

    if (window.evalCache) {
        evals = window.evalCache.evals;
        misRespuestas = window.evalCache.misRespuestas;
        allPending = window.evalCache.allPending;
    } else {
        // Se traen también las inactivas: la lista las esconde más abajo a
        // quien no esté en modo administrador. Filtrar aquí dejaría la caché
        // atada al modo que hubiera al cargarla, y encender el modo admin no
        // la invalida.
        const { data: eData, error: eErr } = await sb.from('evaluations')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (eErr || !eData) {
            container.innerHTML = `<div style="text-align:center; padding:40px;"><div style="color:#64748b; margin-top:10px;">Error al cargar.</div></div>`;
            return;
        }
        evals = eData;

        // Sólo las propias. Antes se traía las de toda la jerarquía porque la
        // cronología dibujaba una línea por cada persona del equipo; quitado el
        // gráfico, esas filas se descartaban acto seguido y en una estructura
        // grande eran casi toda la descarga de abrir la pantalla.
        const { data: rData } = await sb.from('evaluation_responses')
            .select('evaluation_id, review_status, grades_json, submitted_at, employee_id')
            .eq('employee_id', user.id)
            .order('submitted_at', { ascending: false });

        misRespuestas = rData || [];

        const { data: pData } = await sb.from('evaluation_responses')
            .select('evaluation_id, employee_id, review_status');
            
        // Filtramos para que SOLO cuente las que realmente necesitan revisión
        allPending = (pData || []).filter(item => 
            item.review_status !== 'Revisado' && 
            item.review_status !== 'Certificada' && 
            item.review_status !== 'Falsa'
        );

        window.evalCache = { evals, misRespuestas, allPending };
    }

    // Cuántas respuestas espera calificar cada encuesta. Quién califica qué lo
    // decide la regla de `1-config.js`: el jefe inmediato, salvo que la
    // encuesta haya nombrado a sus propios revisores.
    let pendingMap = {};
    if (allPending) {
        const evalPorId = {};
        (evals || []).forEach(ev => { evalPorId[String(ev.id)] = ev; });

        allPending.forEach(item => {
            if (String(item.employee_id) === String(user.id)) return;

            // **El modo administrador ya no lo da todo por suyo.** Estaba
            // escrito `window.modoAdminActivo || leTocaRevisar(…)`, así que en
            // ese modo el globo rojo contaba las respuestas sin calificar de la
            // empresa entera —51 en una pantalla donde ninguna era suya— y su
            // propio `title` decía «esperan **tu** calificación». Con eso, una
            // encuesta que no le toca ni revisa se dibujaba además con el icono
            // de «por calificar» en vez del neutro que promete
            // `estadoDeEncuestaEnLista`. Hoy la cuenta es la misma para todos:
            // lo que espera la calificación de quien mira. Lo de los demás se
            // ve en «Revisar por Empleado», que es la pantalla que habla de eso.
            const meToca = window.leTocaRevisar(
                evalPorId[String(item.evaluation_id)], item.employee_id, user.id);

            if (meToca) {
                pendingMap[item.evaluation_id] = (pendingMap[item.evaluation_id] || 0) + 1;
            }
        });
    }

   container.innerHTML = '';

    // La fila de botones es **sólo del administrador**, y por eso ni se dibuja
    // sin el modo encendido: aquí estuvo «🗂️ Ver Historial Global (Todas)»,
    // que era lo único que veía todo el mundo y se quitó —el historial de una
    // encuesta se lee entrando en ella, que es donde tiene contexto; ese
    // listado mezclaba las respuestas de todas y no se usaba—. Con él fuera,
    // a un usuario normal le quedaba una fila vacía con sus 20px de margen
    // por encima de la lista.
    //
    // **Van como dos filas de ajustes de iOS y no como dos pastillas de
    // colores**, que es lo que llevan siendo desde antes de que la aplicación
    // tuviera ese lenguaje: cada una abre una pantalla, así que es exactamente
    // lo que hace una fila con su icono, su renglón de qué es y su chevron.
    // Comparten la lista con la hoja de gestión (`.lista-ios`, `.fila-ios`),
    // que es la misma cosa. Sin emoji: el icono es un `<svg>` sobre el cuadrado
    // redondeado de su color —cada sistema dibuja el emoji a su manera, y aquí
    // hacen falta dos que se vean del mismo tamaño y del mismo trazo—.
    //
    // Y **se fue la chapa de «Modo Admin Activo»**: que el modo está encendido
    // lo dicen ya el título del panel en rojo y el «+» de su encabezado, así
    // que aquí era un rótulo de color que no llevaba a ningún sitio, al lado
    // justo de los dos que sí.
    if (window.modoAdminActivo) {
        const accionAdmin = (color, icono, titulo, detalle, onclick) => `
            <button type="button" class="fila-ios" onclick="${onclick}">
                <span class="fila-ios-icono fila-ios-icono--tinta" style="background:${color};" aria-hidden="true">${icono}</span>
                <span class="fila-ios-texto">
                    <span class="fila-ios-titulo">${titulo}</span>
                    <span class="fila-ios-detalle fila-ios-detalle--envuelve">${detalle}</span>
                </span>
                <span class="fila-ios-chevron" aria-hidden="true">&rsaquo;</span>
            </button>`;

        const svgRevisar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11l2 2 4-4"/></svg>';
        const svgCertificar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/></svg>';

        container.insertAdjacentHTML('beforeend', `
        <div class="lista-ios" style="margin-bottom:20px;">
            ${accionAdmin('#0d9488', svgRevisar, 'Revisar por empleado',
                'Resuelve juntas las evaluaciones de una persona',
                "if (window.abrirRevisionPorEmpleado) window.abrirRevisionPorEmpleado(); else alert('Módulo en actualización');")}
            ${accionAdmin('#2563eb', svgCertificar, 'Certificar por clasificación',
                'Da fe de lo contestado en un periodo',
                "if (window.abrirCertificacionPorClasificacion) window.abrirCertificacionPorClasificacion(); else alert('Módulo en actualización');")}
        </div>
        `);
    }
    
    // Las encuestas inactivas sólo se listan en modo administrador. La
    // cronología de arriba sí recibe la lista completa: sirve para saber de
    // qué clasificación era cada respuesta ya contestada, y apagar una
    // encuesta no borra el historial de nadie.
    const evalsListables = window.modoAdminActivo ? evals : evals.filter(window.encuestaActiva);

    if (evalsListables.length === 0) {
        container.insertAdjacentHTML('beforeend', `<div style="text-align:center; padding:40px; color:#64748b;">No hay evaluaciones disponibles.</div>`);
        return;
    }

    // A quién le toca una encuesta vive en `1-config.js`: la pantalla que
    // certifica por clasificación tiene que preguntar lo mismo de otras
    // personas, y dos copias de la regla acabarían discrepando. Antes estaba
    // aquí dentro y en modo administrador devolvía todo, que es por lo que la
    // insignia de clasificación certificada no significaba nada para un
    // administrador: se calculaba sobre encuestas que no eran suyas. La lista
    // sigue enseñándolo todo en ese modo; la insignia usa siempre la regla.
    const leTocaEstaEncuesta = (ev) => window.leTocaEstaEncuesta(ev, user, tengoEquipo);

    // Quien revisa una encuesta la ve en la lista aunque no le toque
    // contestarla: si no, no tendría por dónde entrar a calificar una vez que
    // el pendiente se resuelve. La insignia de clasificación de más abajo
    // sigue contando sólo las que le tocan, que es de lo que habla.
    const laReviso = (ev) => window.revisoresDeEncuesta(ev).includes(String(user.id));

    // La lista va como la del panel de inicio: una clasificación por renglón,
    // plegada, con el estado a la izquierda y sus encuestas dentro. Antes era
    // una rejilla de iconos de 64px con el título debajo recortado a dos
    // renglones, así que cada encuesta se leía por un cuadro gris idéntico al
    // de al lado y lo único que la distinguía era un texto de tres palabras:
    // ni cómo va, ni qué sacó, ni qué le falta. Un renglón lo dice todo en el
    // mismo sitio, y las clasificaciones —que es la unidad en la que se
    // certifica— dejan de ser un rótulo suelto entre dos rejillas.
    //
    // La clave del grupo es la clasificación **normalizada**, que es quien
    // decide si dos nombres son el mismo: agrupando por el texto crudo,
    // «Seguridad» y «seguridad » se dibujaban como dos clasificaciones
    // distintas, cada una con su propia insignia de certificación.
    const grupos = [];
    const porClave = {};
    evalsListables.forEach(ev => {
        const clave = window.normalizarClasificacion(ev.category);
        if (!porClave[clave]) {
            porClave[clave] = { nombre: String(ev.category || 'General').trim() || 'General', encuestas: [] };
            grupos.push(porClave[clave]);
        }
        porClave[clave].encuestas.push(ev);
    });

    const ahora = new Date();

    // El promedio de un puñado de filas, igual que en el panel de inicio y por
    // lo mismo: sin nada calificado no hay promedio, que un 0% ahí se leería
    // como haberlo hecho mal en vez de no haber empezado.
    const promedioDe = (unasFilas) => {
        const puntajes = unasFilas.map(f => f.puntaje).filter(p => p !== null && p !== undefined);
        if (puntajes.length === 0) return null;
        return Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length);
    };

    // Lo que espera calificación, con la misma cuenta que llevaba el globo rojo
    // de la rejilla. Va a la derecha —del renglón de la encuesta y del de su
    // clasificación—, que es donde no le quita ancho al título ni alarga el pie
    // a un segundo renglón.
    //
    // **En modo administrador no se dibuja.** Ahí la lista es la de todo el
    // mundo, y un globo rojo por renglón se lee como una bandeja de trabajo que
    // no es la suya: lo que el administrador tiene que calificar le sale igual
    // en su panel de inicio y en «Revisar por Empleado». Sin el globo, esta
    // pantalla queda para lo que es en ese modo: ver y configurar las
    // encuestas.
    const globoDeCalificar = (cuantas, quePasa) => (cuantas > 0 && !window.modoAdminActivo)
        ? `<div class="globo-por-calificar" title="${cuantas} ${quePasa}">${cuantas}</div>`
        : '';

    grupos.forEach(g => {
        const visibles = window.modoAdminActivo
            ? g.encuestas
            : g.encuestas.filter(ev => leTocaEstaEncuesta(ev) || laReviso(ev));

        g.filas = visibles.map(ev => {
            const leToca = leTocaEstaEncuesta(ev);
            const porCalificar = pendingMap[ev.id] || 0;
            const lectura = window.estadoDeEncuestaEnLista(ev, {
                leToca, revisor: laReviso(ev), respuestas: misRespuestas, porCalificar
            });
            // El puntaje del periodo, como en la tarjeta del panel: es la misma
            // pregunta y la respuesta ya está en `misRespuestas`. La respuesta
            // se guarda porque de ella salen la fecha y el puntaje que enseña
            // la pantalla de la clasificación.
            const resp = leToca ? window.respuestaDelPeriodo(ev, misRespuestas, ahora) : null;
            return Object.assign({ ev, resp, porCalificar, leToca, puntaje: window.puntajeDeRespuesta(resp) }, lectura);
        });

        // Dentro del grupo manda lo que urge; entre grupos, el que peor está.
        // Con el mismo estado, por título —o la lista bailaría de una carga a
        // otra—.
        g.filas.sort((a, b) => (a.peso - b.peso)
            || String(a.ev.title || '').localeCompare(String(b.ev.title || ''), 'es'));

        g.pendientes = g.filas.filter(f => f.pendiente).length;
        g.porCalificar = g.filas.reduce((suma, f) => suma + f.porCalificar, 0);
        g.mias = g.filas.filter(f => f.leToca);
        g.promedio = promedioDe(g.mias);
        g.peso = g.filas.length > 0 ? g.filas[0].peso : 9;
    });

    const gruposVisibles = grupos.filter(g => g.filas.length > 0);
    gruposVisibles.sort((a, b) => (a.peso - b.peso) || a.nombre.localeCompare(b.nombre, 'es'));

    // Lo que la pantalla de una clasificación vuelve a leer al abrirse, sin
    // recalcular nada ni volver a preguntarle a la base. Se le pasa el índice
    // del grupo y no su nombre, igual que en la tarjeta del panel de inicio:
    // así no hay que escapar la clasificación en un atributo.
    //
    // Las respuestas van enteras y no sólo las del periodo que corre: la
    // gráfica de esa pantalla recorre los periodos de atrás.
    window.clasificacionesDeLaLista = gruposVisibles;
    window.respuestasDeLaLista = misRespuestas || [];

    if (gruposVisibles.length === 0) {
        container.insertAdjacentHTML('beforeend', `<div style="text-align:center; padding:40px; color:#64748b;">No hay evaluaciones disponibles.</div>`);
        return;
    }

    const bloques = gruposVisibles.map((g, indice) => {
        const renglones = g.filas.map(({ ev, estado, porCalificar, puntaje }) => {
            const safeTitle = String(ev.title || '').replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            const ritmo = window.textoDeFrecuencia ? window.textoDeFrecuencia(ev.frequency) : '';
            const estaActiva = window.encuestaActiva(ev);
            const color = (puntaje !== null && typeof window.getColorScore === 'function')
                ? window.getColorScore(puntaje) : '#64748b';

            // El puntaje en las contestadas; en las que faltan, lo que falta
            // —que ahí no hay puntaje que enseñar y el renglón se quedaría con
            // la frecuencia sola—. Lo neutro no dice nada: es una encuesta que
            // no es de quien mira, y el icono ya lo cuenta.
            const resultado = puntaje !== null
                ? ` · <span style="color:${color}; font-weight:700;">${puntaje}%</span>`
                : ((estado.listo || estado.neutro) ? '' : ` · <span style="color:${estado.color}; font-weight:700;">${estado.texto}</span>`);

            // Quién la contesta se decía con el emoji del cuadro de la rejilla
            // —👥 contra 📋—, y sin cuadro hay que decirlo: en modo jefe la
            // llena el supervisor y no quien la recibe.
            const quienLaLlena = (ev.mode || 'self') === 'boss' ? ' · La contesta el jefe' : '';

            const etiquetaInactiva = estaActiva ? '' :
                `<span style="margin-left:6px; background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; border-radius:6px; font-size:0.6rem; font-weight:bold; padding:1px 5px; letter-spacing:0.5px;">INACTIVA</span>`;

            const globoPendientes = globoDeCalificar(porCalificar, 'requieren revisión');

            // **El renglón del administrador ya no lleva ningún botón.** Aquí
            // hubo tres, y los tres se fueron a donde ya se llegaba —la hoja de
            // editar la encuesta, a un toque del renglón por el lápiz del
            // encabezado de su pantalla—:
            //
            //   - el lápiz de **editar** repetía ese mismo lápiz y sólo quitaba
            //     ancho al título;
            //   - el bote de basura de **eliminar** es hoy el del encabezado de
            //     la hoja de edición: borrar una encuesta se lleva por delante
            //     lo que contestó todo el mundo, y ése no es un botón que deba
            //     estar a un toque de distancia en una lista;
            //   - y **encender y apagar** ya era la casilla «Activa» del grupo
            //     «Opciones» de esa hoja, así que el botón del renglón era el
            //     mismo interruptor por otra puerta. Con los otros dos fuera se
            //     quedó además ocupando su sitio: primero fue un 🚫, que se leía
            //     como el de eliminar, y después un ojo tachado, que seguía
            //     siendo un botón al final de la fila para algo que se hace de
            //     tarde en tarde. Que está apagada lo sigue diciendo su etiqueta
            //     «INACTIVA», que es lo que hay que ver desde la lista.
            //
            // Queda el del revisor, que no es lo mismo: corregir a quién va
            // dirigida es lo único que puede abrir desde aquí quien no es
            // administrador. Corta la propagación, que el resto de la fila abre
            // la encuesta.
            const botonIcono = (fondo, colorTexto, onclick, titulo, icono) => `
                <button class="encuesta-boton" style="background:${fondo}; color:${colorTexto};"
                        onclick="event.stopPropagation(); ${onclick}"
                        title="${titulo}" aria-label="${titulo}">${icono}</button>`;

            let acciones = '';
            if (!window.modoAdminActivo && laReviso(ev)) {
                // Quien revisa la encuesta puede corregir a quién va dirigida
                // sin ser administrador: es quien sabe a quién le falta
                // tomarla. La hoja se abre restringida a ese bloque; el resto
                // de la configuración no se le enseña.
                acciones = botonIcono('#f3e8ff', '#7e22ce',
                    `window.cerrarModalEvaluaciones(); window.editarDestinatariosEncuesta('${ev.id}')`,
                    'Editar a quién va dirigida', '✏️');
            }
            if (acciones) acciones = `<div class="encuesta-acciones">${acciones}</div>`;

            return `
                <div class="encuesta-fila${estaActiva ? '' : ' encuesta-fila--inactiva'}"
                     onclick="window.abrirHistorialEvaluacion('${ev.id}', '${safeTitle}')"
                     title="${estado.texto}">
                    ${window.iconoDeAsignada(estado)}
                    <div class="encuesta-fila-texto">
                        <div class="encuesta-titulo">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                        <div class="encuesta-meta">${window.sanitizeForHTML(ritmo)}${quienLaLlena}${resultado}${etiquetaInactiva}</div>
                    </div>
                    ${globoPendientes}
                    ${acciones}
                </div>`;
        }).join('');

        // La insignia habla de lo que le toca a quien mira, y de su periodo en
        // curso. Antes se calculaba con la última respuesta calificada que
        // hubiera, sin mirar fechas: la certificada de julio tapaba la de
        // agosto sin revisar, y una anulada reciente ni siquiera la tumbaba.
        const resumenCert = window.estadoCertificacion(
            g.encuestas.filter(leTocaEstaEncuesta),
            misRespuestas
        );
        const insignia = window.insigniaCertificacion(resumenCert);
        // Va en su propio renglón y no al lado del nombre: «📉 1 por debajo de
        // 80%» no cabe en lo que queda del ancho de un teléfono y partiría el
        // renglón del resumen en dos.
        const chapaCert = insignia
            ? `<div><span class="grupo-eval-chapa"
                     title="${resumenCert.contestadas} de ${resumenCert.total} contestadas en ${resumenCert.periodo}"
                     style="background:${insignia.fondo}; color:${insignia.color}; border:1px solid ${insignia.borde};">${insignia.texto}</span></div>`
            : '';

        // El renglón de la clasificación dice lo suyo sin abrirla: su icono es
        // el de la encuesta que peor está —basta una para que la clasificación
        // no esté al día, y por eso se toma del primero de sus renglones, que
        // vienen ordenados por lo que urge— y su pie, cuántas hay, cuántas
        // faltan, cuántas esperan calificación y el promedio de lo calificado.
        const estadoGrupo = g.filas[0].estado;
        const colorGrupo = (g.promedio !== null && typeof window.getColorScore === 'function')
            ? window.getColorScore(g.promedio) : '#64748b';

        const cuenta = `${g.filas.length} encuesta${g.filas.length === 1 ? '' : 's'}`;
        // Lo que espera calificación no va aquí sino en el globo rojo de la
        // derecha: con cuatro trozos, el pie se partía en dos renglones y el
        // encabezado de la clasificación quedaba más alto que sus encuestas.
        const pie = [
            g.pendientes > 0
                ? `${cuenta} · ${g.pendientes} pendiente${g.pendientes === 1 ? '' : 's'}`
                : (g.mias.length > 0 ? `${cuenta} al día` : cuenta),
            g.promedio === null ? null
                : `<span style="color:${colorGrupo}; font-weight:700;">${g.promedio}%</span>`
        ].filter(Boolean).join(' · ');

        // El renglón hace dos cosas, igual que en la tarjeta del panel de
        // inicio: tocarlo abre la **pantalla de la clasificación** —cómo va,
        // su gráfica y quién la revisa— y la flecha de la derecha despliega
        // aquí mismo sus encuestas. Las dos no caben en el mismo toque, así
        // que la flecha es un botón suyo (`alternarGrupoAsignadas`) y el
        // `<summary>` hace `preventDefault` para que el navegador no despliegue
        // por su cuenta lo que ya decide el botón.
        //
        // Nace abierta si hay algo esperando a quien mira, como la lista de
        // respuestas de una encuesta y por lo mismo. En modo administrador no:
        // ahí se listan las encuestas de todo el mundo y casi todas tienen algo
        // pendiente de alguien, así que abrirlas todas es no plegar nada.
        const abrir = g.pendientes > 0 || (g.porCalificar > 0 && !window.modoAdminActivo);

        return `
            <details class="grupo-asignadas"${abrir ? ' open' : ''}>
                <summary onclick="event.preventDefault(); window.abrirClasificacionDeLaLista(${indice})">
                    ${window.iconoDeAsignada(estadoGrupo)}
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.8rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.4px;">${window.sanitizeForHTML(g.nombre)}</div>
                        <div style="font-size:0.72rem; color:#94a3b8;">${pie}</div>
                        ${chapaCert}
                    </div>
                    ${globoDeCalificar(g.porCalificar, 'esperan tu calificación en esta clasificación')}
                    <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
                    <button type="button" class="grupo-asignadas-boton" aria-expanded="${abrir ? 'true' : 'false'}"
                            onclick="window.alternarGrupoAsignadas(this, event)"
                            title="${abrir ? 'Ocultar sus encuestas' : 'Ver sus encuestas'}"
                            aria-label="${abrir ? 'Ocultar sus encuestas' : 'Ver sus encuestas'}">
                        <svg class="grupo-asignadas-flecha" width="18" height="18" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
                             stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                </summary>
                ${renglones}
            </details>`;
    }).join('');

    // El renglón del resumen, que es lo que la tarjeta tiene en vez de título:
    // lo que es se ve —clasificaciones con sus encuestas—.
    const todasLasFilas = gruposVisibles.reduce((acc, g) => acc.concat(g.filas), []);
    const pendientesTotal = todasLasFilas.filter(f => f.pendiente).length;
    const porCalificarTotal = todasLasFilas.reduce((suma, f) => suma + f.porCalificar, 0);
    const promedioTotal = promedioDe(todasLasFilas.filter(f => f.leToca));
    const resumen = [
        `${todasLasFilas.length} encuesta${todasLasFilas.length === 1 ? '' : 's'}`,
        pendientesTotal > 0 ? `${pendientesTotal} pendiente${pendientesTotal === 1 ? '' : 's'}` : null,
        // Lo mismo que el globo rojo, y por lo mismo: en modo administrador esa
        // cuenta no habla de quien mira.
        (porCalificarTotal > 0 && !window.modoAdminActivo) ? `${porCalificarTotal} por calificar` : null,
        promedioTotal === null ? null : `promedio ${promedioTotal}%`
    ].filter(Boolean).join(' · ');

    container.insertAdjacentHTML('beforeend', `
        <div style="background:white; border-radius:16px; padding:15px 15px 5px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); border:1px solid #f1f5f9;">
            <div style="font-size:0.8rem; color:#475569; font-weight:600; margin-bottom:4px;">${resumen}</div>
            ${bloques}
        </div>
    `);
};

window.abrirSeleccionSubordinado = (evalId, title, mode) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    let subs = [];

    if (window.modoAdminActivo) {
        subs = window.todosLosEmpleadosData.filter(e => String(e.id) !== String(user.id));
    } else {
        subs = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
    }
    
    if (subs.length === 0) {
        alert("No tienes colaboradores directos asignados para evaluar.");
        return;
    }

    subs.sort((a,b) => a.name.localeCompare(b.name));

    const div = document.createElement('div');
    div.id = 'modal-select-sub';
    div.className = 'hoja-overlay';
    div.style.cssText = "z-index:10000; display:flex;";
    
    let listHtml = '';
    subs.forEach(s => {
        let avatar = `<div style="width:36px; height:36px; background:#e0f2fe; color:#0284c7; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">${s.name.charAt(0)}</div>`;
        if (s.avatar) {
            const safeUrl = window.procesarUrlImagen(s.avatar);
            avatar = `<img src="${safeUrl}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">`;
        }

        const safeTitle = title.replace(/'/g, "&apos;").replace(/"/g, "&quot;");

        listHtml += `
        <div onclick="confirmarEvaluacionSub('${evalId}', '${safeTitle}', '${s.id}', '${s.name}', '${mode}')" 
             style="padding:12px; border-bottom:1px solid #f1f5f9; cursor:pointer; display:flex; align-items:center; gap:12px; background:white; transition:background 0.2s;"
             onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
            ${avatar}
            <div style="flex:1;">
                <div style="font-weight:600; color:#1e293b; font-size:0.95rem;">${s.name}</div>
                <div style="font-size:0.75rem; color:#64748b;">${s.puesto || 'Colaborador'}</div>
            </div>
            <div style="color:#2563eb; font-weight:bold; font-size:1.2rem;">➜</div>
        </div>`;
    });

    div.innerHTML = `
        <div class="hoja-contenido" style="max-width:400px; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Evaluar a colaborador</h3>
                    <div class="hoja-subtitulo">Selecciona quién recibirá la calificación</div>
                </div>
                <button onclick="document.getElementById('modal-select-sub').remove()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
            </div>
            <div style="max-height:60vh; overflow-y:auto; background:#f8fafc;">${listHtml}</div>
        </div>
    `;
    document.body.appendChild(div);
};

window.confirmarEvaluacionSub = (evalId, title, empId, empName, mode) => {
    const modal = document.getElementById('modal-select-sub');
    if (modal) modal.remove();
    
    window.targetUserForEval = { id: empId, name: empName };
    window.responderDirecto(evalId, title, mode);
};

window.responderDirecto = async (evalId, title, mode = 'self') => {
    // Una encuesta se contesta con el cuestionario de hoy, y quien la abre con
    // la versión anterior de la aplicación no lo tiene: un tipo de pregunta que
    // ese código no conoce —la evidencia fotográfica, sin ir más lejos— no
    // dibuja ningún control, se envía en `null` y la respuesta queda incompleta
    // sin que nadie se entere. Aquí sí se puede parar, así que se para: es el
    // único sitio de la aplicación donde el aviso de versión no admite un
    // «Ahora no». Si no hay red o no hay `version.json`, se sigue como siempre.
    if (window.comprobarVersionApp && await window.comprobarVersionApp({ forzar: true })) {
        window.avisarVersionNueva({ bloqueante: true });
        return;
    }

    window.evalModeRespondiendo = mode;
    document.body.style.cursor = 'wait';
    try {
        const p1 = sb.from('evaluation_questions').select('*').eq('evaluation_id', evalId).order('order_index');
        const p2 = sb.from('evaluations').select('range_labels, description, frequency, evaluates_area').eq('id', evalId).single();
        const p3 = sb.from('areas').select('id, nombre').eq('activa', true).order('nombre');
        
        const [resQ, resE, resA] = await Promise.all([p1, p2, p3]);
        if (resQ.error) throw resQ.error;

        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        const miAreaNorm = (user.area || "").trim().toUpperCase();
        let evaluatesArea = false;
        
        if (resE.data && resE.data.evaluates_area === true) {
            evaluatesArea = true;
        }

        if (evaluatesArea && !miAreaNorm && !window.modoAdminActivo && mode === 'self') {
            document.body.style.cursor = 'default';
            window.pedirAreaUsuario();
            return;
        }

        window.preguntasCacheActual = resQ.data || [];
        window.evalIdRespondiendo = evalId;
        window.evalTituloRespondiendo = title;
        
        let fetchedLabels = null;
        let fetchedDesc = null;
        let fetchedFreq = null;

        if (resE.data) {
            if(resE.data.range_labels) fetchedLabels = resE.data.range_labels;
            if(resE.data.description) fetchedDesc = resE.data.description;
            if(resE.data.frequency) fetchedFreq = resE.data.frequency;
        }

        const listaAreasOficiales = resA.data || [];

        window.prepararRespuesta(evalId, title, fetchedLabels, fetchedDesc, fetchedFreq, evaluatesArea, listaAreasOficiales);
    } catch (e) {
        alert("Error al cargar la encuesta: " + e.message);
    } finally {
        document.body.style.cursor = 'default';
    }
};

// El octavo argumento la abre **como vista previa**: el mismo cuestionario y la
// misma hoja, pero sin nada que enviar. Es lo que enseña el ojo del encabezado
// de la hoja de edición, y va por aquí y no por un dibujo propio porque una
// vista previa que no sea exactamente la pantalla de contestar no sirve para lo
// que está —diría que la escala se ve de una manera cuando se ve de otra—.
//
// Lo que cambia es sólo lo que en una previa no puede pasar: no hay botón de
// enviar, el área no se guarda —sería escribirle el área a alguien desde una
// previa— y la cruz devuelve a la hoja de edición en lugar de al panel.
window.prepararRespuesta = (evalId, title, explicitLabels = null, explicitDesc = null, explicitFreq = null, explicitEvaluatesArea = false, listaAreasOficiales = [], opciones = {}) => {
    const vistaPrevia = opciones && opciones.vistaPrevia === true;
    window.evalIdRespondiendo = evalId;
    window.evalTituloRespondiendo = title;

    let rangeLabels = {};
    let currentDesc = explicitDesc || "";
    let currentFreq = explicitFreq || "once";
    let evaluatesArea = explicitEvaluatesArea;

    if (explicitLabels) {
        if (typeof explicitLabels === 'string') { try { rangeLabels = JSON.parse(explicitLabels); } catch(e){} }
        else { rangeLabels = explicitLabels; }
    }
    
    if (window.evalCache && window.evalCache.evals) {
        const found = window.evalCache.evals.find(e => e.id === evalId);
        if (found) {
            if(!currentDesc) currentDesc = found.description || "";
            if(!explicitFreq) currentFreq = found.frequency || "once";
            if(found.evaluates_area === true) evaluatesArea = true;
            
            if (Object.keys(rangeLabels).length === 0 && found.range_labels) {
                if (typeof found.range_labels === 'string') { try { rangeLabels = JSON.parse(found.range_labels); } catch(e){} }
                else { rangeLabels = found.range_labels; }
            }
        }
    }

    // Sin emoji, y por el mismo ayudante que el resto de la aplicación: aquí
    // vivía la última copia del mapa de frecuencias —la que las adornaba con
    // «🈷️ Mensual»—, y en el subtítulo de la hoja ese icono no decía nada que
    // no dijera la palabra.
    const freqText = window.textoDeFrecuencia
        ? window.textoDeFrecuencia(currentFreq) : 'Única vez';

    const userLogueado = JSON.parse(localStorage.getItem("usuarioLogueado")) || {};
    let currentAreaId = userLogueado.area_id || null;
    let currentAreaName = userLogueado.area || "Sin Área";
    let targetId = userLogueado.id;
    
    if (window.targetUserForEval && window.todosLosEmpleadosData) {
        const empData = window.todosLosEmpleadosData.find(e => String(e.id) === String(window.targetUserForEval.id));
        if (empData) {
            if (empData.area_id) currentAreaId = empData.area_id;
            if (empData.area) currentAreaName = empData.area;
        }
        targetId = window.targetUserForEval.id;
    }

    let areaBadgeHtml = '';
    window.fotosPreguntaListas = {};
    if (evaluatesArea && vistaPrevia) {
        // La misma fila, sin el desplegable: elegir aquí escribiría el área de
        // quien esté mirando, y una previa no cambia nada de nadie. Lo que se
        // viene a ver es que la fila sale y qué dice.
        const valorArea = (!currentAreaName || currentAreaName === 'Sin Área')
            ? 'Selecciona un área' : currentAreaName;
        areaBadgeHtml = `
                <div class="area-eval">
                    <div class="area-eval-fila">
                        <span class="area-eval-rotulo">Área a evaluar</span>
                        <span class="area-eval-valor">${window.sanitizeForHTML(valorArea)}</span>
                        <svg class="area-eval-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                             aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                    </div>
                </div>`;
    } else if (evaluatesArea) {
        window.areaConfirmadaParaEstaSesion = false;
        
        let optionsHtml = '<option value="">-- Seleccionar --</option>';
        listaAreasOficiales.forEach(a => {
            const isSelected = (a.id === currentAreaId) || (a.nombre === currentAreaName);
            optionsHtml += `<option value="${a.id}" data-nombre="${a.nombre}" ${isSelected ? 'selected' : ''}>${a.nombre}</option>`;
        });
        
        // La fila de ajustes de iOS: rótulo a la izquierda, el área a la derecha
        // y el chevron que dice que se toca. Sin emoji —ni el 📍 ni el lápiz—:
        // lo que hace lo cuentan su `aria-label` y su `title`, y el chevron.
        // Los ids se quedan como estaban, que son los que busca
        // `guardarAreaEnEvaluacion`.
        const faltaArea = !currentAreaName || currentAreaName === 'Sin Área';
        const valorArea = faltaArea ? 'Selecciona un área' : currentAreaName;
        const etiquetaArea = faltaArea ? 'Elegir el área a evaluar' : 'Cambiar el área a evaluar';

        areaBadgeHtml = `
                <div id="area-badge-container" class="area-eval${faltaArea ? ' area-eval--falta' : ''}">
                    <button type="button" class="area-eval-fila" onclick="window.abrirSelectorDeArea()"
                            title="${etiquetaArea}" aria-label="${etiquetaArea}">
                        <span class="area-eval-rotulo">Área a evaluar</span>
                        <span class="area-eval-valor" id="area-display-text">${window.sanitizeForHTML(valorArea)}</span>
                        <svg class="area-eval-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                             aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                    </button>
                    <div class="area-eval-editor" id="area-edit-container" hidden>
                        <select id="eval-inline-area-select" class="area-eval-select"
                                onchange="window.guardarAreaEnEvaluacion('${targetId}')"
                                aria-label="Área a evaluar">
                            ${optionsHtml}
                        </select>
                        <div class="area-eval-estado" id="area-save-indicator" hidden>Guardando el área…</div>
                    </div>
                </div>`;
    }

    const modal = document.getElementById('modal-responder-eval');
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // 👇 OCULTAMOS TEMPORALMENTE EL PANEL DE ENCUESTAS PARA NO ESTORBAR
        // En una previa no: se viene de la hoja de edición, que es la que se
        // apartó y la que hay que devolver al cerrar.
        if (!vistaPrevia) {
            const panelEvaluaciones = document.getElementById('modal-evaluaciones-flotante');
            if (panelEvaluaciones) panelEvaluaciones.style.display = 'none';
        }

        // El contenedor ya trae la clase .hoja-overlay desde index.html; aquí
        // sólo se enciende. Nada de cssText a pantalla completa: el aspecto lo
        // pone la clase.
        modal.style.cssText = 'display:flex; z-index:999999;';
        
        let headerTitle = title;
    // **Sin «Responde las siguientes preguntas» ni «Todas las preguntas son
    // obligatorias».** Debajo estaban las preguntas y el botón de enviar, así
    // que la primera decía en voz alta lo que ya se ve, y la segunda una regla
    // que se cumple sola: el envío no deja mandar nada en blanco y lo dice
    // señalando lo que falta. Sólo queda lo que escribió quien creó la
    // encuesta, que es información suya, y en modo jefe el renglón que dice
    // cuál se está contestando —ahí el título de la hoja es la persona—.
    let subTitle = currentDesc || '';
    let headerStyle = "color:#1e293b;";

    // En una previa nadie está evaluando a nadie, aunque hubiera quedado puesto
    // a quién se evaluaba: lo que se enseña es la encuesta.
    if (!vistaPrevia && window.targetUserForEval) {
        headerTitle = `Evaluando a: <span style="color:#be185d;">${window.targetUserForEval.name}</span>`;
        subTitle = currentDesc ? `<b>Instrucciones:</b> ${currentDesc}` : `Encuesta: <b>${title}</b>. Los resultados se guardarán en el perfil del colaborador.`;
        headerStyle = "color:#334155; border-left: 4px solid #be185d; padding-left: 10px;";
    }

    // El bloque de arriba no se dibuja si no tiene nada que decir: con los dos
    // textos fuera, una encuesta sin descripción y sin área dejaba un hueco de
    // 25px por encima de la primera pregunta.
    const introHtml = (subTitle || areaBadgeHtml)
        ? `<div style="margin-bottom:18px; ${headerStyle}">
                ${subTitle ? `<p style="color:#64748b; margin:0 0 14px; font-size:0.95rem;">${subTitle}</p>` : ''}
                ${areaBadgeHtml}
           </div>`
        : '';

    // En una previa el subtítulo lo dice desde el encabezado, que es lo único
    // que se queda a la vista al desplazar las preguntas: quien la abre para
    // revisar una escala no puede acabar creyendo que está contestando.
    const subEncabezado = vistaPrevia ? `Vista previa · ${freqText}` : freqText;

    // Y abajo no hay nada que enviar. El botón se queda —el hueco de la acción
    // principal es parte de lo que se viene a ver— pero apagado y diciendo lo
    // que hará de verdad; debajo va el que cierra, que es lo único que aquí sí
    // se puede pulsar.
    const accionHtml = vistaPrevia
        ? `<button disabled style="width:100%; background:#cbd5e1; color:#f8fafc; padding:15px; border:none; border-radius:12px; font-size:1.1rem; font-weight:bold; margin-top:20px;">Enviar Respuestas</button>
           <div style="text-align:center; color:#94a3b8; font-size:0.8rem; margin-top:8px;">Aquí no se envía nada: es la encuesta tal y como la verá quien la conteste.</div>
           <button onclick="window.cerrarVistaPrevia()" style="width:100%; background:#fff; color:#334155; padding:14px; border:1px solid #cbd5e1; border-radius:12px; font-size:1rem; font-weight:600; cursor:pointer; margin-top:14px;">Volver a la edición</button>`
        : `<button id="btn-enviar-respuestas" onclick="enviarRespuestasEval()" style="width:100%; background:#2563eb; color:white; padding:15px; border:none; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px -1px rgba(37, 99, 235, 0.3); margin-top:20px; transition: transform 0.1s;">Enviar Respuestas</button>`;

    // El fondo gris de la hoja deja que las tarjetas blancas de cada pregunta
    // se sigan leyendo como tarjetas.
    modal.innerHTML = `
        <div class="hoja-contenido" style="max-width:800px; background:#f8fafc; overflow:hidden; padding:12px 0 0;">
        <div class="hoja-encabezado-lista">
            <div style="min-width:0;">
                <h2 class="hoja-titulo">${headerTitle}</h2>
                <div class="hoja-subtitulo">${subEncabezado}</div>
            </div>
            <button onclick="${vistaPrevia ? 'window.cerrarVistaPrevia()' : "cancelarRespuesta('main')"}" class="ios-boton-icono ios-boton-cerrar" title="${vistaPrevia ? 'Cerrar la vista previa' : 'Cerrar'}" aria-label="${vistaPrevia ? 'Cerrar la vista previa' : 'Cerrar'}"></button>
        </div>
        <div id="simple-form-container" style="flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y; padding: 14px 15px calc(25px + env(safe-area-inset-bottom)); box-sizing: border-box;">
            ${introHtml}
            <div id="dynamic-questions-root"></div>
            ${accionHtml}
        </div>
        </div>
    `;

    const container = document.getElementById('dynamic-questions-root');
    if (!window.preguntasCacheActual || window.preguntasCacheActual.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">No hay preguntas cargadas.</div>';
        return;
    }

    window.preguntasCacheActual.forEach((q, index) => {
        let inputHtml = '';
        // Los valores de la escala, si es una: los dibujan los círculos y
        // también la guía, que aquí es el otro sitio desde donde se elige.
        let valoresDeLaEscala = [], maxDeLaEscala = 0;
        const commonStyle = "width:100%; padding:15px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; font-family:inherit; box-sizing: border-box;";
        
        if (q.question_type === 'text') {
            inputHtml = `<textarea class="resp-input" data-id="${q.id}" style="${commonStyle} resize:none; overflow-y:hidden; min-height:100px;" oninput="this.style.height=''; this.style.height=this.scrollHeight+'px'" placeholder="Escribe tu respuesta..."></textarea>`;
        }
        else if (q.question_type === 'multiple') {
            let options = q.options || [];
            if (typeof options === 'string') try { options = JSON.parse(options); } catch(e){}
            options.forEach(opt => {
                inputHtml += `<label style="display:flex; align-items:center; gap:12px; cursor:pointer; width:100%; background:#fff; padding:12px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px;"><input type="radio" name="radio-${q.id}" value="${opt}" class="resp-radio" data-id="${q.id}" style="transform:scale(1.3); accent-color:#2563eb;"> <span style="font-size:1rem; color:#334155;">${opt}</span></label>`;
            });
        }
        else if (q.question_type === 'checklist') {
            let options = q.options || [];
            if (typeof options === 'string') try { options = JSON.parse(options); } catch(e){}
            options.forEach(opt => {
                inputHtml += `<label style="display:flex; align-items:center; gap:12px; cursor:pointer; width:100%; background:#fff; padding:12px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px;"><input type="checkbox" value="${opt}" class="resp-check" data-id="${q.id}" style="transform:scale(1.3); accent-color:#2563eb;"> <span style="font-size:1rem; color:#334155;">${opt}</span></label>`;
            });
        }
        else if (q.question_type === 'list_match') {
            let numSlots = 1;
            try {
                const parsed = JSON.parse(q.correct_answer_text);
                if (Array.isArray(parsed) && parsed.length > 0) numSlots = parsed.length;
            } catch(e) {
                if (q.correct_answer_text && q.correct_answer_text.includes('\n')) {
                    numSlots = q.correct_answer_text.split('\n').filter(x=>x.trim()).length;
                }
            }
            let listHtml = '';
            for (let i = 0; i < numSlots; i++) {
                listHtml += `
                <div class="recall-item" style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
                    <span style="font-weight:bold; color:#cbd5e1; width:20px; font-size:0.9rem;">${i+1}.</span>
                    <input type="text" class="resp-list-item" data-id="${q.id}" style="${commonStyle}" placeholder="Respuesta ${i+1}...">
                </div>`;
            }
            inputHtml = `<div id="recall-list-${q.id}">${listHtml}</div>`;
        }
        else if (window.esPreguntaDeFoto(q)) {
            // El enunciado ya dice qué fotografiar, así que aquí sólo va el
            // botón y la vista previa. Igual que la foto del área: `<label for>`
            // y nada de `.click()` sobre el input, que en iOS se confunde con
            // el toque fantasma de las ruedas.
            inputHtml = `
                <input type="file" id="inp-foto-preg-${q.id}" accept="image/*" capture="environment" style="display:none;" onchange="window.mostrarFotoPregunta(this, '${q.id}')">
                <label for="inp-foto-preg-${q.id}" id="btn-foto-preg-${q.id}" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; box-sizing:border-box; padding:14px; background:#eff6ff; color:#2563eb; border:1px dashed #93c5fd; border-radius:10px; font-weight:600; font-size:0.95rem; cursor:pointer;">
                    📷 Tomar fotografía
                </label>
                <div id="previo-foto-preg-${q.id}" style="display:none; margin-top:10px;">
                    <img id="previo-foto-preg-img-${q.id}" alt="Evidencia" style="width:100%; border-radius:10px; display:block;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">
                        <span id="previo-foto-preg-peso-${q.id}" style="font-size:0.75rem; color:#94a3b8;"></span>
                        <label for="inp-foto-preg-${q.id}" style="font-size:0.8rem; color:#2563eb; font-weight:600; cursor:pointer;">Cambiar</label>
                    </div>
                </div>`;
        }
        else if (window.esPreguntaDeAsistencia(q)) {
            // No hay nada que contestar: el enunciado dice a qué se asistió y
            // esto sólo lo confirma. Va como una casilla grande y no como un
            // botón que envíe: la encuesta puede llevar más preguntas y se
            // entrega entera, como todas.
            //
            // Con fecha y hora, la casilla sólo se puede tocar dentro de su
            // plazo. Fuera de él se enseña igual pero apagada y diciendo por
            // qué: esconderla dejaría el enunciado con nada debajo, que es
            // exactamente lo que no se puede distinguir de un teléfono con el
            // JavaScript viejo.
            const est = window.estadoDeAsistencia(q);
            const cerrada = est.estado === 'antes' || est.estado === 'cerrada';
            const aviso = window.avisoDeAsistencia(q);

            inputHtml = `
                <label for="chk-asistencia-${q.id}" class="asistencia-registro${cerrada ? ' esta-cerrado' : ''}">
                    <input type="checkbox" id="chk-asistencia-${q.id}" class="resp-asistencia" data-id="${q.id}"
                           ${cerrada ? 'disabled' : ''} onchange="window.pintarAsistencia(this)">
                    <span class="asistencia-texto">
                        <span class="asistencia-titulo">${est.estado === 'cerrada' ? 'Fuera de plazo' : (est.estado === 'antes' ? 'Todavía no' : 'Sí, asistí')}</span>
                        <span class="asistencia-ayuda">${aviso || 'Tócalo para registrar tu asistencia.'}</span>
                    </span>
                </label>`;
        }
        else if (q.question_type === 'range') {
            let min = 0, step = 1;
            const max = window.maximoDeEscala(q);
            let opts = q.options;
            if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e) { opts = []; } }
            if (Array.isArray(opts) && opts.length >= 2) {
                min = parseInt(opts[0]);
                if (opts.length > 2 && (String(opts[2]) === '0.5')) step = 0.5;
            }
            // Los valores salen del helper y no de un bucle propio: son las
            // mismas llaves con las que la guía nombra cada valor, y dos
            // redondeos distintos las dejarían sin casar. Se guardan fuera
            // porque la guía dibuja un renglón por cada uno.
            maxDeLaEscala = max;
            valoresDeLaEscala = window.valoresDeEscala(min, max, step);

            let rangeHtml = '<div class="range-circulos">';
            valoresDeLaEscala.forEach(val => {
                let labelText = '';
                if (rangeLabels[val]) { labelText = `<div style="font-size:0.7rem; color:#64748b; margin-top:4px; max-width:60px; text-align:center; line-height:1.1; word-wrap:break-word;">${rangeLabels[val]}</div>`; }
                rangeHtml += `
                <label style="cursor:pointer; display:flex; flex-direction:column; align-items:center;">
                    <input type="radio" name="range-${q.id}" value="${val}" class="resp-range" data-id="${q.id}" data-max="${max}" style="display:none;" onchange="updateRangeVisual(this)">
                    <div class="range-circle" style="width:42px; height:42px; border-radius:50%; border:2px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#64748b; background:white; transition:all 0.2s; font-size:0.85rem;">${val}</div>
                    ${labelText}
                </label>`;
            });
            rangeHtml += '</div>';
            inputHtml = rangeHtml;
        }

        // Una opción marcada no dice por qué: en una encuesta de seguridad, «no»
        // a secas y «no, porque la máquina estaba en paro» son hallazgos
        // distintos. Las preguntas con opciones piden el motivo, y sin él no se
        // envía —eso lo comprueba `enviarRespuestasEval`—.
        let comentarioHtml = '';
        if (window.llevaMotivo(q)) {
            comentarioHtml = `
                <div style="margin-top:16px; border-top:1px solid #f1f5f9; padding-top:14px;">
                    <label style="display:block; font-weight:600; color:#475569; margin-bottom:8px; font-size:0.9rem;">
                        Comentario
                        <span id="motivo-obligatorio-${q.id}" style="color:#ef4444;">*</span>
                        <span id="motivo-opcional-${q.id}" style="display:none; color:#94a3b8; font-weight:500;">(opcional)</span>
                    </label>
                    <textarea class="resp-comentario" data-id="${q.id}" placeholder="${q.question_type === 'range' ? 'Explica el motivo de tu calificación...' : 'Explica el motivo de tu respuesta...'}"
                              style="${commonStyle} resize:none; overflow-y:hidden; min-height:70px;"
                              oninput="this.style.height=''; this.style.height=this.scrollHeight+'px'"></textarea>
                </div>`;
        }

        // La guía de la escala va entre el enunciado y los círculos, y aquí es
        // además el control: cada renglón lleva su círculo a la izquierda, así
        // que se elige mientras se lee. Con la guía abierta, los círculos de
        // abajo se esconden —lo hace `estilos.css`— para no ofrecer lo mismo
        // dos veces. Sin guía no dibuja nada y los círculos son lo único que
        // hay.
        const guiaHtml = window.bloqueGuiaEscala(q, valoresDeLaEscala.length
            ? { valores: valoresDeLaEscala, nombre: `range-${q.id}`, id: q.id, max: maxDeLaEscala }
            : null);

        container.insertAdjacentHTML('beforeend', `<div id="pregunta-card-${q.id}" class="pregunta-card" style="margin-bottom:30px; background:white; padding:25px; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e2e8f0;"><label style="display:block; font-weight:700; color:#1e293b; margin-bottom:15px; font-size:1.1rem; line-height:1.4;">${index + 1}. ${q.question_text}</label>${guiaHtml}${inputHtml}${comentarioHtml}</div>`);
    });
};

// La foto se encoge en cuanto se elige, no al enviar: así se ve el tamaño real
// de lo que se va a subir y el envío no se queda pensando. Los blobs esperan
// aquí y `enviarRespuestasEval` los recoge.
window.fotosPreguntaListas = {};

// La casilla de asistencia se pinta de verde al marcarse. Se hace con una
// clase y no con `:has()` en la hoja de estilos: la etiqueta es la madre de la
// casilla, no su hermana, y así funciona igual en los Safari que no lo traen.
window.pintarAsistencia = (chk) => {
    const etiqueta = chk.closest('.asistencia-registro');
    if (etiqueta) etiqueta.classList.toggle('esta-marcado', chk.checked);
};

window.mostrarFotoPregunta = async (input, qid) => {
    const previo = document.getElementById(`previo-foto-preg-${qid}`);
    const img = document.getElementById(`previo-foto-preg-img-${qid}`);
    const peso = document.getElementById(`previo-foto-preg-peso-${qid}`);
    const boton = document.getElementById(`btn-foto-preg-${qid}`);

    delete window.fotosPreguntaListas[qid];
    if (!input.files || !input.files[0]) { if (previo) previo.style.display = 'none'; return; }

    if (boton) boton.innerText = '⏳ Preparando la foto…';
    try {
        const blob = await window.optimizarImagen(input.files[0], {
            maxLado: window.MAX_LADO_FOTO_EVAL,
            maxBytes: 300 * 1024
        });
        window.fotosPreguntaListas[qid] = blob;

        if (img) img.src = URL.createObjectURL(blob);
        if (peso) peso.innerText = `${Math.round(blob.size / 1024)} KB`;
        if (previo) previo.style.display = 'block';
        if (boton) boton.innerText = '📷 Tomar otra fotografía';
    } catch (e) {
        console.error('No se pudo preparar la evidencia:', e);
        alert('No se pudo procesar la foto: ' + (e.message || e));
        if (previo) previo.style.display = 'none';
        if (boton) boton.innerText = '📷 Tomar fotografía';
        input.value = '';
    }
};

window.updateRangeVisual = (input) => {
    // El mismo valor se puede elegir en dos sitios —los círculos de abajo y los
    // renglones de la guía—, así que se repintan todos los del grupo y no sólo
    // los del contenedor donde se tocó. Se compara por **valor** y no por
    // `checked`: los dos círculos de un mismo número son radios distintos del
    // mismo grupo, de modo que marcar uno desmarca al otro y el elegido se
    // quedaría sin pintar en el sitio donde no se tocó.
    const elegido = String(input.value);
    document.querySelectorAll('.resp-range').forEach(radio => {
        if (radio.name !== input.name) return;
        const circulo = radio.nextElementSibling;
        if (!circulo || !circulo.classList.contains('range-circle')) return;

        const esEste = String(radio.value) === elegido;
        circulo.style.background = esEste ? '#2563eb' : 'white';
        circulo.style.color = esEste ? 'white' : '#64748b';
        circulo.style.borderColor = esEste ? '#2563eb' : '#cbd5e1';
        circulo.style.transform = esEste ? 'scale(1.1)' : 'scale(1)';
    });

    // El tope de la escala es el «todo bien» y no pide explicación; el rótulo
    // lo dice en cuanto se elige, para no reclamarla al enviar.
    const qid = input.dataset.id;
    const esElTope = parseFloat(input.value) >= parseFloat(input.dataset.max);
    const marcaObligatorio = document.getElementById(`motivo-obligatorio-${qid}`);
    const marcaOpcional = document.getElementById(`motivo-opcional-${qid}`);
    if (marcaObligatorio) marcaObligatorio.style.display = esElTope ? 'none' : 'inline';
    if (marcaOpcional) marcaOpcional.style.display = esElTope ? 'inline' : 'none';
};

window.cancelarRespuesta = (mode = 'history') => {
    document.body.style.overflow = '';
    const modal = document.getElementById('modal-responder-eval');
    
    if (modal) {
        modal.style.display = 'none';
        modal.innerHTML = ''; // Limpiamos para evitar basura en la memoria
    }
    
    window.targetUserForEval = null;
    
    // --- 🚀 RETORNO INTELIGENTE (AL CANCELAR) ---
    if (window.mostrandoPendientes || window.mostrandoPendientesEquipo) {
        // No hacemos nada con el panel flotante porque no estábamos ahí.
        // El modal de pendientes ya debería estar de fondo.
    } else {
        // Si veníamos del menú de iOS normal, devolvemos el panel.
        const panelEvaluaciones = document.getElementById('modal-evaluaciones-flotante');
        if (panelEvaluaciones) panelEvaluaciones.style.display = 'flex';
    }
};

window.enviarRespuestasEval = async () => {
    const btn = document.getElementById('btn-enviar-respuestas');
    if (btn) { btn.disabled = true; btn.innerText = "Procesando..."; }

    try {
        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        if (!user) throw new Error("Sesión expirada");

        const targetEmployeeId = window.targetUserForEval ? window.targetUserForEval.id : user.id;
        const isBossMode = (window.evalModeRespondiendo === 'boss');

        // Extraemos el NOMBRE del área para enviarlo a la tabla de historial (evaluation_responses)
        let targetAreaName = 'Sin Área';
        if (window.todosLosEmpleadosData) {
            const empData = window.todosLosEmpleadosData.find(e => String(e.id) === String(targetEmployeeId));
            if (empData && empData.area) {
                targetAreaName = empData.area;
            } else if (!isBossMode && user.area) {
                targetAreaName = user.area;
            }
        } else if (!isBossMode && user.area) {
            targetAreaName = user.area;
        }

        let evaluatesArea = false;
        if (window.evalCache && window.evalCache.evals) {
            const evalData = window.evalCache.evals.find(e => String(e.id) === String(window.evalIdRespondiendo));
            if (evalData && evalData.evaluates_area === true) evaluatesArea = true;
        }

        if (evaluatesArea) {
            if (!targetAreaName || targetAreaName === 'Sin Área') {
                alert("⚠️ Es obligatorio seleccionar un área para esta evaluación.\n\nHaz clic en '⚠️ Selecciona tu área ✏️' en la parte superior para elegir una.");
                if (btn) { btn.disabled = false; btn.innerText = "Enviar Respuestas"; }
                return;
            }
        }

        const answersMap = {};
        const autoGradesMap = {};
        
        let answeredCount = 0;
        let autoGradedCount = 0;

        const motivos = {};
        const faltanMotivos = [];
        const faltanRespuestas = [];
        const evidenciasPorSubir = [];
        const fueraDePlazo = [];

        window.preguntasCacheActual.forEach((q, indice) => {
            let val = null;
            if (q.question_type === 'text') {
                const el = document.querySelector(`.resp-input[data-id="${q.id}"]`);
                if (el) val = el.value.trim();
            } else if (q.question_type === 'multiple') {
                const el = document.querySelector(`input[name="radio-${q.id}"]:checked`);
                if (el) val = el.value;
            } else if (q.question_type === 'checklist') {
                const checked = document.querySelectorAll(`.resp-check[data-id="${q.id}"]:checked`);
                if (checked.length > 0) val = Array.from(checked).map(c => c.value);
            } else if (q.question_type === 'list_match') {
                const inputs = document.querySelectorAll(`.resp-list-item[data-id="${q.id}"]`);
                const items = [];
                inputs.forEach(inp => { const txt = inp.value.trim(); if (txt) items.push(txt); });
                if (items.length > 0) val = items;
            } else if (q.question_type === 'range') {
                const el = document.querySelector(`input[name="range-${q.id}"]:checked`);
                if (el) val = el.value;
            } else if (window.esPreguntaDeFoto(q)) {
                // Todavía no hay URL: la foto se sube más abajo, cuando ya se
                // sabe que la encuesta está completa. Aquí sólo cuenta como
                // contestada, y el valor definitivo lo pone la subida.
                if (window.fotosPreguntaListas[q.id]) {
                    val = '';
                    evidenciasPorSubir.push({ id: q.id, blob: window.fotosPreguntaListas[q.id] });
                }
            } else if (window.esPreguntaDeAsistencia(q)) {
                const el = document.querySelector(`.resp-asistencia[data-id="${q.id}"]`);
                // Se comprueba también aquí y no sólo al dibujar: la hoja pudo
                // quedarse abierta desde antes del evento —o pasarse la hora
                // con ella abierta— y el reloj corre igual.
                const enHora = window.estadoDeAsistencia(q).estado !== 'antes'
                            && window.estadoDeAsistencia(q).estado !== 'cerrada';
                if (el && el.checked && enHora) val = window.TEXTO_ASISTENCIA;
                if (el && el.checked && !enHora) fueraDePlazo.push({ numero: indice + 1, texto: q.question_text || '', id: q.id });
            }
            
            answersMap[q.id] = val;

            const contestada = window.esPreguntaDeFoto(q)
                ? !!window.fotosPreguntaListas[q.id]
                : (val !== null && val !== "" && !(Array.isArray(val) && val.length === 0));

            // Una encuesta a medias no dice nada: se contestan todas.
            if (!contestada) faltanRespuestas.push({ numero: indice + 1, texto: q.question_text || '', id: q.id });

            // El motivo se pide sólo de lo que sí se contestó: a lo que aún no
            // tiene opción marcada se le pide antes la respuesta, y sería
            // confuso reclamar las dos cosas a la vez.
            if (window.llevaMotivo(q)) {
                const campo = document.querySelector(`.resp-comentario[data-id="${q.id}"]`);
                const motivo = campo ? campo.value.trim() : '';
                if (contestada) {
                    if (!motivo && window.pideMotivo(q, val)) {
                        faltanMotivos.push({ numero: indice + 1, texto: q.question_text || '', id: q.id, campo });
                    } else if (motivo) {
                        motivos[q.id] = motivo;
                    }
                } else if (motivo) {
                    // Escribió el porqué y se le olvidó marcar: se guarda igual
                    // para no tirarle lo escrito.
                    motivos[q.id] = motivo;
                }
            }

            if (contestada) {
                answeredCount++;

                if (q.question_type === 'range') {
                    let max = 5;
                    if (q.options) {
                        let opts = q.options;
                        if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e){} }
                        if (Array.isArray(opts) && opts.length >= 2) max = parseFloat(opts[1]);
                    }
                    const numericVal = parseFloat(val);
                    const percentage = (numericVal / max) * 100;
                    
                    autoGradesMap[q.id] = {
                        type: 'numeric_score',
                        value: numericVal,
                        max: max,
                        percentage: Math.round(percentage * 100) / 100,
                        // Copia del enunciado tal como se preguntó: la llave es
                        // el id de la pregunta y ese texto puede cambiar o
                        // desaparecer del cuestionario más adelante.
                        question: q.question_text || ''
                    };
                    autoGradedCount++;
                } else if (window.esPreguntaDeAsistencia(q)) {
                    // Pasar lista no tiene respuesta buena ni mala: haberla
                    // confirmado es todo lo que se preguntaba. Se califica al
                    // enviarla para no dejarle a nadie un pendiente de revisión
                    // que no tiene nada que decidir; y si la encuesta es sólo
                    // de asistencia, `autoGradedCount` la guarda ya 'Revisado'.
                    autoGradesMap[q.id] = {
                        type: 'standard',
                        status: 'correct',
                        question: q.question_text || '',
                        auto: true
                    };
                    autoGradedCount++;
                } else if (window.seCalificaSola(q)) {
                    // La pregunta dice cuáles son sus opciones correctas, así
                    // que no hay nada que decidir: acierta o no acierta. Si
                    // todas las de la encuesta son así, se guarda ya revisada
                    // —lo decide `autoGradedCount` más abajo— y quien la
                    // contestó ve su resultado al momento.
                    autoGradesMap[q.id] = {
                        // La misma forma que pone `setGrade` al calificar a
                        // mano, para que `calcularScoreRespuesta` no tenga que
                        // saber de dónde vino; `auto` es sólo para decirlo en
                        // la pantalla de calificar.
                        type: 'standard',
                        status: window.aciertaEnOpciones(q, val) ? 'correct' : 'incorrect',
                        question: q.question_text || '',
                        auto: true
                    };
                    autoGradedCount++;
                }
            }
        });

        const keys = Object.keys(answersMap);
        if (keys.length === 0) throw new Error("No hay preguntas para responder.");

        // Lo que falte se dice todo junto y se señala en el formulario: ir
        // descubriendo pega a pega en qué pregunta se quedó uno es lo que hace
        // que se abandone a medio llenar.
        document.querySelectorAll('.pregunta-card').forEach(c => {
            c.style.border = '1px solid #e2e8f0';
            c.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        });

        // Una asistencia marcada fuera de su plazo se para aquí y va antes que
        // lo que falta: no es un descuido de quien la llena, es que el plazo se
        // pasó con la hoja abierta, y decirle «falta contestar» sería mentirle.
        if (fueraDePlazo.length > 0) {
            fueraDePlazo.forEach(f => {
                const card = document.getElementById(`pregunta-card-${f.id}`);
                if (card) {
                    card.style.border = '2px solid #ef4444';
                    card.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.12)';
                }
            });

            alert(
                'El plazo para registrar la asistencia ya cerró:\n\n' +
                fueraDePlazo.map(f => `   ${f.numero}. ${f.texto}`).join('\n') +
                '\n\nVuelve a abrir la encuesta para ver hasta cuándo había. ' +
                'Si el plazo pasó, cuenta como inasistencia y hay que avisarle a quien la imparte.'
            );

            const card = document.getElementById(`pregunta-card-${fueraDePlazo[0].id}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });

            if (btn) { btn.disabled = false; btn.innerText = "Enviar Respuestas"; }
            return;
        }

        if (faltanRespuestas.length > 0 || faltanMotivos.length > 0) {
            const lista = (titulo, faltas) => faltas.length === 0 ? ''
                : `${titulo}\n${faltas.map(f => `   ${f.numero}. ${f.texto}`).join('\n')}\n\n`;

            [...faltanRespuestas, ...faltanMotivos].forEach(f => {
                const card = document.getElementById(`pregunta-card-${f.id}`);
                if (card) {
                    card.style.border = '2px solid #ef4444';
                    card.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.12)';
                }
            });

            alert(
                'Para enviar hay que completar toda la encuesta.\n\n' +
                lista('Falta contestar:', faltanRespuestas) +
                lista('Falta explicar por qué:', faltanMotivos)
            );

            // Al primero que falte, que con diez preguntas no se encuentra solo.
            const primeroId = (faltanRespuestas[0] || faltanMotivos[0]).id;
            const card = document.getElementById(`pregunta-card-${primeroId}`);
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (faltanRespuestas.length === 0 && faltanMotivos[0].campo) faltanMotivos[0].campo.focus();

            if (btn) { btn.disabled = false; btn.innerText = "Enviar Respuestas"; }
            return;
        }

        // Los motivos van bajo su llave reservada, después de contar las
        // preguntas: no es una respuesta más.
        if (Object.keys(motivos).length > 0) answersMap[window.LLAVE_MOTIVOS] = motivos;
        
        const finalStatus = (isBossMode || (answeredCount > 0 && answeredCount === autoGradedCount)) ? 'Revisado' : 'Pendiente';
        const finalGrades = autoGradesMap;

        // Las evidencias de cada pregunta, por el mismo camino y por lo mismo:
        // subir antes de validar dejaría archivos huérfanos en el bucket.
        for (let i = 0; i < evidenciasPorSubir.length; i++) {
            const { id, blob } = evidenciasPorSubir[i];
            if (btn) btn.innerText = `Subiendo evidencia ${i + 1} de ${evidenciasPorSubir.length}…`;
            answersMap[id] = await window.subirFotoEvaluacion(blob, `preg-${id}-${targetEmployeeId}`);
        }

        // Mandamos EL TEXTO a employee_area para conservar el registro histórico en esa tabla
        const { error } = await sb.from('evaluation_responses').insert({
            evaluation_id: window.evalIdRespondiendo,
            employee_id: targetEmployeeId,
            employee_area: targetAreaName,
            answers_json: answersMap,
            grades_json: finalGrades,
            review_status: finalStatus,
            submitted_at: new Date().toISOString()
        });
        
        if (error) throw error;
        
        let successMsg = "Respuestas enviadas correctamente. Pendiente de revisión.";
        if (isBossMode) {
            successMsg = `✅ Evaluación CALIFICADA AUTOMÁTICAMENTE para ${window.targetUserForEval ? window.targetUserForEval.name : 'el colaborador'}.`;
        } else if (finalStatus === 'Revisado') {
            successMsg = "✅ Autoevaluación completada y registrada automáticamente en tu desempeño.";
        }

        alert(successMsg);
                
                window.evalCache = null;
                window.targetUserForEval = null;
                window.cancelarRespuesta('none');
                
                // --- 🚀 NUEVA LÓGICA DE RETORNO INTELIGENTE ---
                // Si veníamos del panel de pendientes, regresamos allá y refrescamos.
                // Si no, volvemos a la cuadrícula normal de aplicaciones de iOS.
                if (window.mostrandoPendientes) {
                    if (window.cargarVistaPendientes) window.cargarVistaPendientes('PROPIOS');
                } else if (window.mostrandoPendientesEquipo) {
                    if (window.cargarVistaPendientes) window.cargarVistaPendientes('EQUIPO');
                } else {
                    window.cargarVistaEvaluaciones();
                }
                
            } catch (e) {
                console.error(e);
        alert("Error al enviar: " + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Enviar Respuestas"; }
    }
};

// Igual que «Nuevo Registro»: cuelga de window y la llama el onclick del
// botón, en vez de engancharse por id al cargarse el archivo.
//
// Con una clasificación nace ya con ella puesta: es lo que hace el «+» de la
// hoja de detalle de una clasificación, donde la encuesta nueva es de ésa y no
// de otra. Sin argumento, «General», que es lo de siempre.
// `fijarClasificacion` es para quien crea sin ser administrador: quien revisa
// una clasificación puede crear encuestas **en ella y sólo en ella**, así que
// la hoja bloquea el campo y el guardado lo vuelve a comprobar. Sin ese
// argumento la clasificación va suelta, que es lo de siempre.
//
// La marca la pone aquí la única puerta que crea encuestas, y la quita
// `editarEvaluacion` al abrir una que ya existe —una copia sí la conserva, que
// también es crear—.
window.abrirNuevaEvaluacion = (categoria, fijarClasificacion) => {
    if (window.cerrarPanelAdmin) window.cerrarPanelAdmin();
    window.clasificacionFijaParaCrear = fijarClasificacion
        ? String(categoria || '').trim() : '';
    // Antes de la hoja de crear se pregunta de dónde sale la encuesta: desde
    // cero o copiando una que ya existe. Esa hoja se salta ella sola cuando no
    // hay ninguna que copiar.
    if (window.abrirOrigenDeEncuesta) return window.abrirOrigenDeEncuesta(categoria);
    if (window.abrirModalCrearEval) window.abrirModalCrearEval(categoria);
};

// ==========================================
// LÓGICA PARA VER EL HISTORIAL DENTRO DEL PANEL FLOTANTE
// ==========================================
window.abrirHistorialEvaluacion = (evalId, title) => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return; // Si el modal flotante no está abierto, abortamos

    // 1. Obtener las respuestas y los datos de la evaluación desde la caché
    let respuestas = [];
    let evalData = null;

    if (window.evalCache) {
        if (window.evalCache.misRespuestas) {
            respuestas = window.evalCache.misRespuestas.filter(r => String(r.evaluation_id) === String(evalId));
        }
        if (window.evalCache.evals) {
            evalData = window.evalCache.evals.find(e => String(e.id) === String(evalId));
        }
    }

    // 2. Ordenarlas de la más reciente a la más antigua
    respuestas.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

    // 3. Determinar el modo de la evaluación para generar el botón correcto
    const mode = evalData ? (evalData.mode || 'self') : 'self';
    const safeTitle = title.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    
    let actionButtonHtml = '';
    if (mode === 'boss') {
        actionButtonHtml = `<button onclick="window.abrirSeleccionSubordinado('${evalId}', '${safeTitle}', 'boss')" style="width: 100%; padding:12px 20px; background:#be185d; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px rgba(190, 24, 93, 0.25); transition: transform 0.1s;">👥 Evaluar a un Colaborador...</button>`;
    } else {
        const btnText = respuestas.length > 0 ? "Volver a Responder" : "Responder Encuesta";
        actionButtonHtml = `<button onclick="window.targetUserForEval=null; window.responderDirecto('${evalId}', '${safeTitle}', 'self')" style="width: 100%; padding:12px 20px; background:#2563eb; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px rgba(37,99,235,0.25); transition: transform 0.1s;">📝 ${btnText}</button>`;
    }

    // 4. Construir la cabecera (Título y botón de volver)
    let html = `
        <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
            <button onclick="window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s; flex-shrink: 0;" title="Volver a la lista" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                ←
            </button>
            <div>
                <h3 style="color:#1e293b; margin:0; font-size: 1.15rem; line-height: 1.2;">Historial de Resultados</h3>
                <div style="color:#64748b; font-size: 0.85rem; margin-top: 2px;">${title}</div>
            </div>
        </div>
    `;

    // 5. BANNER PRINCIPAL DE ACCIÓN (Aquí está el botón ahora)
    html += `
        <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="color: #334155; font-size: 0.95rem; margin-bottom: 15px; font-weight: 500; text-align: center;">
                ¿Deseas registrar una nueva respuesta para esta evaluación?
            </div>
            ${actionButtonHtml}
        </div>
    `;

    // 6. Dibujar las tarjetas del historial
    if (respuestas.length === 0) {
        html += `<div style="text-align:center; padding:40px; background: white; border-radius: 12px; border: 2px dashed #e2e8f0; color:#64748b; font-weight: 500;">No tienes un historial registrado para esta evaluación.</div>`;
    } else {
        html += `
        <h4 style="margin: 0 0 15px 5px; color: #64748b; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;">Historial de Entregas</h4>
        <div style="display:flex; flex-direction:column; gap:12px;">`;
        
        respuestas.forEach((r, i) => {
            const dateObj = new Date(r.submitted_at);
            const fechaStr = dateObj.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' });
            
            // Colores dependiendo del estado de revisión
            let statusColor = '#b45309';
            let statusBg = '#fef3c7';
            let statusBorder = '#f59e0b';
            
            if (r.review_status === 'Revisado') {
                statusColor = '#166534'; statusBg = '#dcfce7'; statusBorder = '#22c55e';
            } else if (r.review_status === 'Certificada') {
                statusColor = '#1d4ed8'; statusBg = '#eff6ff'; statusBorder = '#3b82f6';
            } else if (r.review_status === 'Falsa') {
                statusColor = '#991b1b'; statusBg = '#fee2e2'; statusBorder = '#ef4444';
            } else if (r.review_status === 'Mal Revisada') {
                statusColor = '#7e22ce'; statusBg = '#f3e8ff'; statusBorder = '#a855f7';
            }
            
            let scoreText = '';
            if (r.review_status === 'Revisado' || r.review_status === 'Certificada') {
                const score = window.calcularScoreRespuesta(r);
                let colorScore = window.getColorScore ? window.getColorScore(score) : '#2563eb';
                if (r.review_status === 'Certificada') colorScore = '#1d4ed8'; 
                scoreText = `<div style="font-size:1.5rem; font-weight:900; color:${colorScore}; line-height: 1;">${score}%</div>`;
            } else {
                scoreText = `<div style="font-size:0.85rem; color:#64748b; font-weight: bold;">${r.review_status === 'Falsa' ? 'Anulada' : 'Calificando...'}</div>`;
            }

            // Escapamos el JSON para poder enviarlo al botón de "Ver Detalle" si es necesario
            const jsonString = JSON.stringify(r).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

            html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:15px 20px; border-radius:12px; border-left: 5px solid ${statusBorder}; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                <div>
                    <div style="font-weight:bold; color:#334155; font-size: 1rem;">Intento #${respuestas.length - i}</div>
                    <div style="font-size:0.8rem; color:#64748b; margin-top:2px; margin-bottom: 8px;">📅 ${fechaStr}</div>
                    <span style="display:inline-block; background:${statusBg}; color:${statusColor}; font-size:0.75rem; padding:3px 8px; border-radius:12px; font-weight:bold; border: 1px solid ${statusBorder};">${r.review_status}</span>
                </div>
                <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                    ${scoreText}
                    <button onclick='if(window.verDetalleRespuesta) window.verDetalleRespuesta(${jsonString})' style="padding:6px 15px; background:#f8fafc; color:#475569; border: 1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-size:0.85rem; font-weight:600; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">🔍 Ver Detalle</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // 7. Inyectamos todo en el modal
    container.innerHTML = html;
};

console.log("✅ Evaluaciones Base v53: SOLO AREA_ID EN SUPABASE, MEMORIA EN JS");
