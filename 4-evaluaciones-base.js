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
    if (indicator) indicator.style.display = 'inline-block';
    
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
        
        const displaySpan = document.getElementById('area-display-text');
        if (displaySpan) {
            displaySpan.innerHTML = `${areaName} ✏️`;
            displaySpan.style.display = 'inline-block';
            displaySpan.style.color = '';
            displaySpan.style.background = '';
            document.getElementById('area-edit-container').style.display = 'none';
        }
        
    } catch (e) {
        console.error(e);
        alert("Error al actualizar el área: " + e.message);
    } finally {
        if (selectEl) selectEl.disabled = false;
        if (indicator) indicator.style.display = 'none';
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
window.encabezadoHojaEvaluaciones = (titulo, alVolver) => {
    const h = document.getElementById('titulo-hoja-evaluaciones');
    const btn = document.getElementById('btn-hoja-evaluaciones');
    if (h) h.innerText = titulo || 'Evaluaciones y encuestas';
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

// --- 1. CARGAR LISTA PRINCIPAL ---
window.cargarVistaEvaluaciones = async () => {
    // 1. Asegurarnos de que el modal flotante exista en el HTML (lo inyectamos si no)
    let modal = document.getElementById('modal-evaluaciones-flotante');
    if (!modal) {
        const modalHTML = `
        <div id="modal-evaluaciones-flotante" class="hoja-overlay" style="z-index:2000;">
            <div class="form-content hoja-contenido" style="max-width: 800px; background: #f8fafc; overflow: hidden; padding: 12px 0 0;">
                <div class="hoja-encabezado-lista">
                    <h2 id="titulo-hoja-evaluaciones" class="hoja-titulo">Evaluaciones y encuestas</h2>
                    <button id="btn-hoja-evaluaciones" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                </div>
                <div id="contenido-modal-evaluaciones" style="flex:1; overflow-y: auto; padding: 20px; background: #f8fafc;"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('modal-evaluaciones-flotante');
    }

    // 2. Mostrar el modal
    modal.style.display = 'flex';
    window.encabezadoHojaEvaluaciones();
    
    // 3. Nuestro contenedor destino ahora es el interior del modal
    const container = document.getElementById('contenido-modal-evaluaciones');

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

            const meToca = window.modoAdminActivo ||
                window.leTocaRevisar(evalPorId[String(item.evaluation_id)], item.employee_id, user.id);

            if (meToca) {
                pendingMap[item.evaluation_id] = (pendingMap[item.evaluation_id] || 0) + 1;
            }
        });
    }

   container.innerHTML = '';
    
    let adminBadge = window.modoAdminActivo ? `<span style="background:#f1f5f9; color:#ef4444; padding:4px 8px; border-radius:6px; font-size:0.8rem; border:1px solid #fecaca; font-weight:bold;">⚙️ Modo Admin Activo</span>` : '';

    // Acceso rápido del administrador para trabajar por persona en vez de por evaluación.
    let botonPorEmpleado = window.modoAdminActivo ? `
            <button onclick="if(window.abrirRevisionPorEmpleado) window.abrirRevisionPorEmpleado(); else alert('Módulo en actualización');" style="background:#ccfbf1; color:#0f766e; padding:8px 16px; border-radius:8px; border:1px solid #5eead4; font-weight:bold; cursor:pointer; font-size:0.9rem; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(13, 148, 136, 0.1); transition:all 0.2s;" onmouseover="this.style.background='#99f6e4'" onmouseout="this.style.background='#ccfbf1'">
                🔎 Revisar por Empleado
            </button>
            <button onclick="if(window.abrirCertificacionPorClasificacion) window.abrirCertificacionPorClasificacion(); else alert('Módulo en actualización');" style="background:#eff6ff; color:#1d4ed8; padding:8px 16px; border-radius:8px; border:1px solid #93c5fd; font-weight:bold; cursor:pointer; font-size:0.9rem; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(29, 78, 216, 0.1); transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                ⭐ Certificar por Clasificación
            </button>` : '';

    container.insertAdjacentHTML('beforeend', `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; flex-wrap:wrap; gap:10px;">
                <button onclick="if(window.abrirHistorialGlobal) window.abrirHistorialGlobal(); else alert('Módulo en actualización');" style="background:#f3e8ff; color:#7e22ce; padding:8px 16px; border-radius:8px; border:1px solid #d8b4fe; font-weight:bold; cursor:pointer; font-size:0.9rem; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(126, 34, 206, 0.1); transition:all 0.2s;" onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'">
                    🗂️ Ver Historial Global (Todas)
                </button>
                ${botonPorEmpleado}
            </div>
            ${adminBadge}
        </div>
    `);
    
    // Las encuestas inactivas sólo se listan en modo administrador. La
    // cronología de arriba sí recibe la lista completa: sirve para saber de
    // qué clasificación era cada respuesta ya contestada, y apagar una
    // encuesta no borra el historial de nadie.
    const evalsListables = window.modoAdminActivo ? evals : evals.filter(window.encuestaActiva);

    if (evalsListables.length === 0) {
        container.insertAdjacentHTML('beforeend', `<div style="text-align:center; padding:40px; color:#64748b;">No hay evaluaciones disponibles.</div>`);
        return;
    }

    const groups = {};
    evalsListables.forEach(ev => {
        const cat = ev.category || "General";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(ev);
    });

    const sortedKeys = Object.keys(groups).sort();

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

    sortedKeys.forEach(catName => {
        const evalsVisibles = window.modoAdminActivo
            ? groups[catName]
            : groups[catName].filter(ev => leTocaEstaEncuesta(ev) || laReviso(ev));

        if (evalsVisibles.length === 0) return;

        // La insignia habla de lo que le toca a quien mira, y de su periodo en
        // curso. Antes se calculaba con la última respuesta calificada que
        // hubiera, sin mirar fechas: la certificada de julio tapaba la de
        // agosto sin revisar, y una anulada reciente ni siquiera la tumbaba.
        const resumenCert = window.estadoCertificacion(
            groups[catName].filter(leTocaEstaEncuesta),
            misRespuestas
        );
        const insignia = window.insigniaCertificacion(resumenCert);

        const bordeCat = insignia ? `3px solid ${insignia.borde}` : '3px solid #cbd5e1';
        const colorCat = insignia ? insignia.color : '#64748b';
        const badgeCatHtml = insignia
            ? `<span title="${resumenCert.contestadas} de ${resumenCert.total} contestadas en ${resumenCert.periodo}"
                     style="margin-left: 10px; background: ${insignia.fondo}; color: ${insignia.color}; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; border: 1px solid ${insignia.borde}; vertical-align: middle; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${insignia.texto}</span>`
            : '';

        // Título de Categoría
        container.insertAdjacentHTML('beforeend', `
            <div style="display:flex; align-items:center; margin-top:25px; margin-bottom:15px; padding-left:5px; border-left:${bordeCat}; line-height:1; flex-wrap:wrap; gap:6px 0;">
                <h3 style="color:${colorCat}; font-size:0.9rem; text-transform:uppercase; letter-spacing:1px; margin:0;">${catName}</h3>
                ${badgeCatHtml}
            </div>
        `);

        // INICIO DEL CONTENEDOR GRID TIPO MENÚ DE APLICACIONES iOS (Íconos pequeños)
        let gridHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: 20px 10px; margin-bottom: 25px; padding: 10px 5px; justify-items: center;">`;

        evalsVisibles.forEach(ev => {
            const respuestasDeEstaEval = misRespuestas.filter(r => r.evaluation_id === ev.id);
            const ultimaRevisada = respuestasDeEstaEval.find(r => r.review_status === 'Revisado' || r.review_status === 'Certificada');
            const ultimaCualquiera = respuestasDeEstaEval.length > 0 ? respuestasDeEstaEval[0] : null;
            const mode = ev.mode || 'self';
            
            const safeTitle = ev.title.replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            // Una inactiva sólo llega hasta aquí en modo administrador: se
            // dibuja apagada para no confundirla con las que sí ve la gente.
            const estaActiva = window.encuestaActiva(ev);

            // Variables de Estilo iOS
                        let iconHtml = mode === 'boss' ? "👥" : "📋";
                        let bgStyle = "background: linear-gradient(135deg, #64748b 0%, #334155 100%);"; // Gradiente Gris Pizarra Elegante
                        let estiloApagado = "";
                        let etiquetaInactiva = "";
                        if (!estaActiva) {
                            estiloApagado = "filter: grayscale(1); opacity:0.45;";
                            etiquetaInactiva = `<div style="margin-top:3px; background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; border-radius:6px; font-size:0.6rem; font-weight:bold; padding:1px 6px; letter-spacing:0.5px;">INACTIVA</div>`;
                        }
                        let notificationBadge = "";

                        // NOTIFICACIÓN DE PENDIENTES / MAL REVISADAS
                        const pendientesDeEstaEval = pendingMap[ev.id] || 0;
                        if (pendientesDeEstaEval > 0) {
                            notificationBadge = `<div style="position:absolute; top:-6px; right:-6px; background:#ef4444; color:white; font-size:0.75rem; font-weight:bold; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius:50%; border:2px solid #f8fafc; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index:10;" title="${pendientesDeEstaEval} requieren revisión">${pendientesDeEstaEval}</div>`;
                        }

                        // Botones de Admin
                        let adminBtn = '';
                        if (window.modoAdminActivo) {
                            adminBtn = `
                            <div style="display:flex; gap:5px; margin-top:6px; justify-content:center; position:relative; z-index:100;">
                                <button onclick="event.stopPropagation(); window.cerrarModalEvaluaciones(); window.editarEvaluacion('${ev.id}')"
                                        style="border:none; background:#e2e8f0; color:#475569; border-radius:50%; width:24px; height:24px; cursor:pointer; font-size:0.7rem; display:flex; align-items:center; justify-content:center; transition: background 0.2s;" 
                                        onmouseover="this.style.background='#cbd5e1'" onmouseout="this.style.background='#e2e8f0'"
                                        title="Editar Evaluación">✏️</button>
                                
                                <button onclick="event.stopPropagation(); window.alternarEncuestaActiva('${ev.id}', ${estaActiva ? 'false' : 'true'})"
                                        style="border:none; background:${estaActiva ? '#e0f2fe' : '#dcfce7'}; color:${estaActiva ? '#0369a1' : '#15803d'}; border-radius:50%; width:24px; height:24px; cursor:pointer; font-size:0.7rem; display:flex; align-items:center; justify-content:center; transition: background 0.2s;"
                                        title="${estaActiva ? 'Desactivar (sólo la verá el administrador)' : 'Activar (volverá a verla todo el mundo)'}">${estaActiva ? '🚫' : '✅'}</button>

                                <button onclick="event.stopPropagation(); window.borrarEvaluacion('${ev.id}')"
                                        style="border:none; background:#fee2e2; color:#ef4444; border-radius:50%; width:24px; height:24px; cursor:pointer; font-size:0.7rem; display:flex; align-items:center; justify-content:center; transition: background 0.2s;"
                                        onmouseover="this.style.background='#fecaca'" onmouseout="this.style.background='#fee2e2'"
                                        title="Eliminar Evaluación">🗑️</button>
                            </div>`;
                        } else if (laReviso(ev)) {
                            // Quien revisa la encuesta puede corregir a quién va
                            // dirigida sin ser administrador: es quien sabe a
                            // quién le falta tomarla. La hoja se abre
                            // restringida a ese bloque; el resto de la
                            // configuración no se le enseña.
                            adminBtn = `
                            <div style="display:flex; gap:5px; margin-top:6px; justify-content:center; position:relative; z-index:100;">
                                <button onclick="event.stopPropagation(); window.cerrarModalEvaluaciones(); window.editarDestinatariosEncuesta('${ev.id}')"
                                        style="border:none; background:#f3e8ff; color:#7e22ce; border-radius:50%; width:24px; height:24px; cursor:pointer; font-size:0.7rem; display:flex; align-items:center; justify-content:center; transition: background 0.2s;"
                                        onmouseover="this.style.background='#e9d5ff'" onmouseout="this.style.background='#f3e8ff'"
                                        title="Editar a quién va dirigida" aria-label="Editar a quién va dirigida">✏️</button>
                            </div>`;
                        }

                        // TARJETA ESTRUCTURADA COMO APP DE iOS
                        const cardHtml = `
                        <div style="display:flex; flex-direction:column; align-items:center; width: 100%; max-width: 85px; cursor:default; transition:transform 0.1s ease-in-out;">
                            
                            <div onclick="window.abrirHistorialEvaluacion('${ev.id}', '${safeTitle}')"
                                 style="position:relative; ${bgStyle} ${estiloApagado} width: 64px; height: 64px; border-radius: 16px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.15); margin-bottom: 6px; cursor:pointer; transition: transform 0.1s;"
                                 onmouseover="this.style.transform='scale(0.95)'" onmouseout="this.style.transform='scale(1)'">
                                
                                ${notificationBadge} <!-- Globo de Pendientes/Mal Revisadas -->
                                
                                <div style="font-size:2.2rem; line-height:1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">${iconHtml}</div>
                            </div>
                            
                            <div style="font-size:0.75rem; font-weight:500; color:${estaActiva ? '#1e293b' : '#94a3b8'}; text-align:center; width:100%; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.2; padding: 0 2px;">
                                ${ev.title}
                            </div>

                            ${etiquetaInactiva}

                            ${adminBtn}
                            
                        </div>`;
                        
                        gridHtml += cardHtml;
        });

        // CERRAR CONTENEDOR GRID E INYECTAR TODO DE GOLPE
        gridHtml += `</div>`;
        container.insertAdjacentHTML('beforeend', gridHtml);
    });
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

window.prepararRespuesta = (evalId, title, explicitLabels = null, explicitDesc = null, explicitFreq = null, explicitEvaluatesArea = false, listaAreasOficiales = []) => {
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

    const freqMap = {
        'once': 'Única vez',
        'weekly': '📅 Semanal',
        'biweekly': '🗓️ Quincenal',
        'monthly': '🈷️ Mensual',
        'quarterly': '🍂 Trimestral',
        'semiannual': '🌗 Semestral',
        'yearly': '🎂 Anual',
        'biennial': '⏳ Cada 2 años'
    };
    
    const freqText = freqMap[currentFreq] || 'Única vez';

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
    window.fotoAreaLista = null;
    window.fotosPreguntaListas = {};
    if (evaluatesArea) {
        window.areaConfirmadaParaEstaSesion = false;
        
        let optionsHtml = '<option value="">-- Seleccionar --</option>';
        listaAreasOficiales.forEach(a => {
            const isSelected = (a.id === currentAreaId) || (a.nombre === currentAreaName);
            optionsHtml += `<option value="${a.id}" data-nombre="${a.nombre}" ${isSelected ? 'selected' : ''}>${a.nombre}</option>`;
        });
        
        let displayAreaText = currentAreaName;
        let areaAlertStyle = "";
        
        if (currentAreaName === "Sin Área" || !currentAreaName) {
            displayAreaText = "⚠️ Selecciona tu área";
            areaAlertStyle = "color: #ef4444; font-weight: bold; background: #fee2e2; padding: 2px 6px; border-radius: 4px;";
        }

        areaBadgeHtml = `
                <div id="area-badge-container" style="display:inline-block; background:#fdf4ff; color:#be185d; padding:6px 12px; border-radius:8px; font-size:0.85rem; font-weight:bold; border:1px solid #fbcfe8; margin-top:10px;">
                    📍 Área a evaluar: 
                    <span id="area-display-text" style="text-decoration:underline; cursor:pointer; margin-left:2px; ${areaAlertStyle}" title="Clic para cambiar área" onclick="document.getElementById('area-edit-container').style.display='inline-flex'; this.style.display='none';">${displayAreaText} ✏️</span>
                    
                    <span id="area-edit-container" style="display:none; align-items:center; margin-left:5px; gap:5px;">
                        <select id="eval-inline-area-select" onchange="window.guardarAreaEnEvaluacion('${targetId}')" style="padding:2px 5px; border-radius:4px; border:1px solid #fbcfe8; outline:none; font-family:inherit; font-size:0.8rem; color:#be185d; background:white; cursor:pointer;">
                            ${optionsHtml}
                        </select>
                        <span id="area-save-indicator" style="display:none; font-size:0.75rem; color:#be185d;">⏳ Guardando...</span>
                        <button onclick="document.getElementById('area-edit-container').style.display='none'; document.getElementById('area-display-text').style.display='inline-block';" style="background:transparent; color:#be185d; border:none; cursor:pointer; font-size:0.9rem; padding:0 4px;" title="Cancelar">✕</button>
                    </span>
                </div>`;

        // Una evaluación de área sin foto es la palabra de quien la llenó
        // contra nada: la foto es la constancia de cómo estaba el área ese día.
        // El `<label for>` es lo que abre la cámara sin un `.click()`
        // programático, que en iOS se confunde con el toque fantasma de las
        // ruedas (ver 1-config.js).
        areaBadgeHtml += `
                <div id="foto-area-bloque" style="margin-top:12px; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
                    <div style="font-weight:600; color:#475569; font-size:0.9rem; margin-bottom:4px;">
                        Fotografía del área <span style="color:#ef4444;">*</span>
                    </div>
                    <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:10px;">Se guarda reducida a ${window.MAX_LADO_FOTO_EVAL}px para no ocupar espacio.</div>

                    <input type="file" id="inp-foto-area" accept="image/*" capture="environment" style="display:none;" onchange="window.mostrarFotoArea(this)">
                    <label for="inp-foto-area" id="btn-foto-area" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; box-sizing:border-box; padding:12px; background:#eff6ff; color:#2563eb; border:1px dashed #93c5fd; border-radius:10px; font-weight:600; font-size:0.95rem; cursor:pointer;">
                        📷 Tomar fotografía
                    </label>

                    <div id="previo-foto-area" style="display:none; margin-top:10px;">
                        <img id="previo-foto-area-img" alt="Fotografía del área" style="width:100%; border-radius:10px; display:block;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">
                            <span id="previo-foto-area-peso" style="font-size:0.75rem; color:#94a3b8;"></span>
                            <label for="inp-foto-area" style="font-size:0.8rem; color:#2563eb; font-weight:600; cursor:pointer;">Cambiar</label>
                        </div>
                    </div>
                </div>`;
    }

    const modal = document.getElementById('modal-responder-eval');
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // 👇 OCULTAMOS TEMPORALMENTE EL PANEL DE ENCUESTAS PARA NO ESTORBAR
        const panelEvaluaciones = document.getElementById('modal-evaluaciones-flotante');
        if (panelEvaluaciones) panelEvaluaciones.style.display = 'none';

        // El contenedor ya trae la clase .hoja-overlay desde index.html; aquí
        // sólo se enciende. Nada de cssText a pantalla completa: el aspecto lo
        // pone la clase.
        modal.style.cssText = 'display:flex; z-index:999999;';
        
        let headerTitle = title;
    let subTitle = currentDesc ? currentDesc : "Responde las siguientes preguntas.";
    // El aviso de que van todas va aparte y no dentro del subtítulo: las
    // encuestas con descripción propia la enseñan en su lugar y se quedaban sin
    // enterarse de la regla hasta que el envío se lo decía.
    const avisoObligatorias = '<p style="color:#94a3b8; margin:6px 0 0; font-size:0.85rem;">Todas las preguntas son obligatorias.</p>';
    let headerStyle = "color:#1e293b;";
    
    if (window.targetUserForEval) {
        headerTitle = `Evaluando a: <span style="color:#be185d;">${window.targetUserForEval.name}</span>`;
        subTitle = currentDesc ? `<b>Instrucciones:</b> ${currentDesc}` : `Encuesta: <b>${title}</b>. Los resultados se guardarán en el perfil del colaborador.`;
        headerStyle = "color:#334155; border-left: 4px solid #be185d; padding-left: 10px;";
    }

    // El fondo gris de la hoja deja que las tarjetas blancas de cada pregunta
    // se sigan leyendo como tarjetas.
    modal.innerHTML = `
        <div class="hoja-contenido" style="max-width:800px; background:#f8fafc; overflow:hidden; padding:12px 0 0;">
        <div class="hoja-encabezado-lista">
            <div style="min-width:0;">
                <h2 class="hoja-titulo">${headerTitle}</h2>
                <div class="hoja-subtitulo">${freqText}</div>
            </div>
            <button onclick="cancelarRespuesta('main')" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
        </div>
        <div id="simple-form-container" style="flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y; padding: 14px 15px calc(25px + env(safe-area-inset-bottom)); box-sizing: border-box;">
            <div style="margin-bottom:25px; ${headerStyle}">
                <p style="color:#64748b; margin:0; font-size:0.95rem;">${subTitle}</p>
                ${avisoObligatorias}
                ${areaBadgeHtml} 
            </div>
            <div id="dynamic-questions-root"></div>
            <button id="btn-enviar-respuestas" onclick="enviarRespuestasEval()" style="width:100%; background:#2563eb; color:white; padding:15px; border:none; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px -1px rgba(37, 99, 235, 0.3); margin-top:20px; transition: transform 0.1s;">Enviar Respuestas</button>
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
                        ¿Por qué?
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
// de lo que se va a subir y el envío no se queda pensando. El blob se guarda
// aquí y `enviarRespuestasEval` lo recoge.
window.fotoAreaLista = null;

window.mostrarFotoArea = async (input) => {
    const previo = document.getElementById('previo-foto-area');
    const img = document.getElementById('previo-foto-area-img');
    const peso = document.getElementById('previo-foto-area-peso');
    const boton = document.getElementById('btn-foto-area');

    window.fotoAreaLista = null;
    if (!input.files || !input.files[0]) { if (previo) previo.style.display = 'none'; return; }

    if (boton) boton.innerText = '⏳ Preparando la foto…';
    try {
        const blob = await window.optimizarImagen(input.files[0], {
            maxLado: window.MAX_LADO_FOTO_EVAL,
            maxBytes: 300 * 1024
        });
        window.fotoAreaLista = blob;

        if (img) img.src = URL.createObjectURL(blob);
        if (peso) peso.innerText = `${Math.round(blob.size / 1024)} KB`;
        if (previo) previo.style.display = 'block';
        if (boton) boton.innerText = '📷 Tomar otra fotografía';
    } catch (e) {
        console.error('No se pudo preparar la foto del área:', e);
        alert('No se pudo procesar la foto: ' + (e.message || e));
        if (previo) previo.style.display = 'none';
        if (boton) boton.innerText = '📷 Tomar fotografía';
        input.value = '';
    }
};

// Las evidencias de cada pregunta, por id. Se encogen al elegirlas, igual que
// la del área, y `enviarRespuestasEval` las sube al final.
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

            // La foto es la constancia de cómo estaba el área ese día.
            if (!window.fotoAreaLista) {
                alert("⚠️ Falta la fotografía del área.\n\nToca '📷 Tomar fotografía' en la parte superior.");
                const bloque = document.getElementById('foto-area-bloque');
                if (bloque) bloque.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

        // La foto se sube al final, cuando ya se sabe que la encuesta está
        // completa: subirla antes dejaría archivos huérfanos en el bucket cada
        // vez que alguien se arrepiente o le falta una pregunta.
        if (evaluatesArea && window.fotoAreaLista) {
            if (btn) btn.innerText = "Subiendo foto del área…";
            answersMap[window.LLAVE_FOTO_AREA] = await window.subirFotoEvaluacion(
                window.fotoAreaLista, `area-${window.evalIdRespondiendo}-${targetEmployeeId}`);
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
window.abrirNuevaEvaluacion = () => {
    if (window.cerrarPanelAdmin) window.cerrarPanelAdmin();
    if (window.abrirModalCrearEval) window.abrirModalCrearEval();
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
