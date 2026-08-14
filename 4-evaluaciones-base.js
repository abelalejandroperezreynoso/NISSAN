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

// --- HELPER 3: GENERAR COLOR POR STRING (HASH) ---
window.getColorByString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
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

// --- 1. CARGAR LISTA PRINCIPAL ---
window.cargarVistaEvaluaciones = async () => {
    // 1. Asegurarnos de que el modal flotante exista en el HTML (lo inyectamos si no)
    let modal = document.getElementById('modal-evaluaciones-flotante');
    if (!modal) {
        const modalHTML = `
        <div id="modal-evaluaciones-flotante" class="hoja-overlay" style="z-index:2000;">
            <div class="form-content hoja-contenido" style="max-width: 800px; background: #f8fafc; overflow: hidden; padding: 12px 0 0;">
                <div class="hoja-encabezado-lista">
                    <h2 class="hoja-titulo">Evaluaciones y encuestas</h2>
                    <button onclick="window.cerrarModalEvaluaciones()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                </div>
                <div id="contenido-modal-evaluaciones" style="flex:1; overflow-y: auto; padding: 20px; background: #f8fafc;"></div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('modal-evaluaciones-flotante');
    }

    // 2. Mostrar el modal
    modal.style.display = 'flex';
    
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

    const misDirectos = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
    const tengoEquipo = misDirectos.length > 0;

    let evals = [], misRespuestas = [], teamResponses = [], allPending = [];

    if (window.evalCache) {
        evals = window.evalCache.evals;
        misRespuestas = window.evalCache.misRespuestas;
        allPending = window.evalCache.allPending;
        teamResponses = window.evalCache.teamResponses || misRespuestas;
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

        const hierarchyIds = window.obtenerJerarquiaCompletaEvaluaciones(user.id);
        const idsArray = Array.from(hierarchyIds);

        let rData = [];
        if (idsArray.length > 0) {
             const { data } = await sb.from('evaluation_responses')
                .select('evaluation_id, review_status, grades_json, submitted_at, employee_id')
                .in('employee_id', idsArray)
                .order('submitted_at', { ascending: false });
             rData = data || [];
        } else {
             const { data } = await sb.from('evaluation_responses')
                .select('evaluation_id, review_status, grades_json, submitted_at, employee_id')
                .eq('employee_id', user.id)
                .order('submitted_at', { ascending: false });
             rData = data || [];
        }

        misRespuestas = rData.filter(r => String(r.employee_id) === String(user.id));
        teamResponses = rData;

        const { data: pData } = await sb.from('evaluation_responses')
            .select('evaluation_id, employee_id, review_status');
            
        // Filtramos para que SOLO cuente las que realmente necesitan revisión
        allPending = (pData || []).filter(item => 
            item.review_status !== 'Revisado' && 
            item.review_status !== 'Certificada' && 
            item.review_status !== 'Falsa'
        );

        window.evalCache = { evals, misRespuestas, allPending, teamResponses };
    }

    let pendingMap = {};
    if (allPending) {
        allPending.forEach(item => {
            const empData = window.todosLosEmpleadosData.find(e => String(e.id) === String(item.employee_id));
            const esDirecto = empData && String(empData.supId) === String(user.id);

            if (window.modoAdminActivo || esDirecto) {
                if (item.employee_id !== user.id) {
                    pendingMap[item.evaluation_id] = (pendingMap[item.evaluation_id] || 0) + 1;
                }
            }
        });
    }

   container.innerHTML = '';
    
    let adminBadge = window.modoAdminActivo ? `<span style="background:#f1f5f9; color:#ef4444; padding:4px 8px; border-radius:6px; font-size:0.8rem; border:1px solid #fecaca; font-weight:bold;">⚙️ Modo Admin Activo</span>` : '';

    // Acceso rápido del administrador para trabajar por persona en vez de por evaluación.
    let botonPorEmpleado = window.modoAdminActivo ? `
            <button onclick="if(window.abrirRevisionPorEmpleado) window.abrirRevisionPorEmpleado(); else alert('Módulo en actualización');" style="background:#ccfbf1; color:#0f766e; padding:8px 16px; border-radius:8px; border:1px solid #5eead4; font-weight:bold; cursor:pointer; font-size:0.9rem; display:flex; align-items:center; gap:6px; box-shadow:0 2px 4px rgba(13, 148, 136, 0.1); transition:all 0.2s;" onmouseover="this.style.background='#99f6e4'" onmouseout="this.style.background='#ccfbf1'">
                🔎 Revisar por Empleado
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
    
    if (teamResponses && teamResponses.length > 0) {
        const tituloGrafico = (misRespuestas.length === teamResponses.length) ? "📈 Mi Historial de Desempeño" : "📈 Desempeño: Mi Equipo y Yo";
        
        container.insertAdjacentHTML('beforeend', `
            <div id="global-timeline-wrapper" style="margin-bottom:25px; background:white; padding:15px; border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 2px 4px rgba(0,0,0,0.02); animation: fadeIn 0.5s;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0; color:#334155; font-size:0.9rem; font-weight:700;">${tituloGrafico}</h3>
                    <span style="font-size:0.7rem; color:#94a3b8;">Cronología General</span>
                </div>
                <div style="position: relative; height:220px; width:100%;">
                    <canvas id="global-timeline-chart"></canvas>
                </div>
            </div>
        `);
        setTimeout(() => window.renderizarCronologiaGlobal(teamResponses, evals), 100);
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

    const groups = {};
    evalsListables.forEach(ev => {
        const cat = ev.category || "General";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(ev);
    });

    const sortedKeys = Object.keys(groups).sort();
    const freqMap = { 'once': 'Única vez', 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual', 'quarterly': 'Trimestral', 'semiannual': 'Semestral', 'yearly': 'Anual', 'biennial': 'Cada 2 años' };

    sortedKeys.forEach(catName => {
        const evalsVisibles = groups[catName].filter(ev => {
                if (window.modoAdminActivo) return true;
                if (ev.mode === 'boss' && !tengoEquipo) return false;

                let targetEmps = ev.target_employees;
                if (typeof targetEmps === 'string') {
                    try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; }
                }
                if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];

                if (targetEmps.length > 0 && !targetEmps.includes('ALL')) {
                    const myIdStr = String(user.id);
                    if (targetEmps.includes(myIdStr)) {
                        return true;
                    } else {
                        return false;
                    }
                }

                const esObligatoria = (ev.is_obligatory !== false);
                if (esObligatoria) return true;

                const miPuestoNorm = user.puesto ? user.puesto.trim().toUpperCase() : "SIN PUESTO";
                let targets = ev.target_positions;
                
                if (typeof targets === 'string') {
                    try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; }
                }
                if (!Array.isArray(targets)) targets = ['ALL'];

                if (targets.length > 0 && !targets.includes('ALL')) {
                    const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
                    if (!targetsNorm.includes(miPuestoNorm)) return false;
                }

                return true;
            });

        if (evalsVisibles.length === 0) return;

       let categoriaCertificada = true;
        evalsVisibles.forEach(ev => {
            const respuestasDeEstaEval = misRespuestas.filter(r => r.evaluation_id === ev.id);
            const ultimaValida = respuestasDeEstaEval.find(r => r.review_status === 'Revisado' || r.review_status === 'Certificada');
            
            if (!ultimaValida || ultimaValida.review_status !== 'Certificada') {
                categoriaCertificada = false;
            }
        });

        let badgeCatHtml = '';
        let bordeCat = '3px solid #cbd5e1';
        let colorCat = '#64748b';

        if (categoriaCertificada) {
            badgeCatHtml = `<span style="margin-left: 10px; background: #eff6ff; color: #1d4ed8; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; border: 1px solid #3b82f6; vertical-align: middle; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">⭐ CLASIFICACIÓN CERTIFICADA</span>`;
            bordeCat = '3px solid #3b82f6';
            colorCat = '#1e3a8a';
        }

        // Título de Categoría
        container.insertAdjacentHTML('beforeend', `
            <div style="display:flex; align-items:center; margin-top:25px; margin-bottom:15px; padding-left:5px; border-left:${bordeCat}; line-height:1;">
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

window.renderizarCronologiaGlobal = (respuestas, evaluaciones) => {
    const ctx = document.getElementById('global-timeline-chart');
    if (!ctx) return;
    
    if (window.globalTimelineChart) window.globalTimelineChart.destroy();

    // 1. Mapear qué categoría tiene cada evaluación
    const evalCatMap = {};
    evaluaciones.forEach(e => {
        evalCatMap[e.id] = e.category || 'General';
    });

    // 2. Ordenar TODAS las respuestas cronológicamente (de la más vieja a la más nueva)
    const validResponses = respuestas
        .filter(r => r.review_status === 'Revisado')
        .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

    // 3. Estructuras para la "Memoria Viva" (Running State)
    const categoryState = {};      // Guarda el último puntaje de cada empleado por categoría
    const categoryDataPoints = {}; // Guarda los puntos a graficar por categoría

    validResponses.forEach(r => {
        const cat = evalCatMap[r.evaluation_id] || 'General';
        const dateObj = new Date(r.submitted_at);
        dateObj.setHours(12, 0, 0, 0); // Estandarizamos al mediodía para evitar duplicados en el mismo día
        const timestamp = dateObj.getTime();
        const dateLabel = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

        const score = window.calcularScoreRespuesta(r);

        // Inicializar estructuras si no existen para esta categoría
        if (!categoryState[cat]) categoryState[cat] = {};
        if (!categoryDataPoints[cat]) categoryDataPoints[cat] = [];

        // ACTUALIZACIÓN CLAVE: Sobrescribimos la calificación del usuario con su último intento
        categoryState[cat][r.employee_id] = score;

        // Calculamos el promedio actual tomando el último puntaje de TODOS los que han participado hasta ahora
        const scoresActuales = Object.values(categoryState[cat]);
        const sumatoria = scoresActuales.reduce((sum, val) => sum + val, 0);
        const promedioEquipo = Math.round(sumatoria / scoresActuales.length);

        // Buscar si ya insertamos un punto HOY para esta categoría
        const arrPuntos = categoryDataPoints[cat];
        const lastPoint = arrPuntos[arrPuntos.length - 1];

        if (lastPoint && lastPoint.x === timestamp) {
            // Si el mismo día hubo varios intentos, actualizamos el promedio del día
            lastPoint.y = promedioEquipo;
            lastPoint.miembrosActivos = scoresActuales.length;
        } else {
            // Si es un día nuevo, creamos un nuevo punto en la gráfica
            arrPuntos.push({
                x: timestamp,
                y: promedioEquipo,
                dateLabel: dateLabel,
                miembrosActivos: scoresActuales.length
            });
        }
    });

    // 4. Crear los datasets (las líneas) para Chart.js
    const datasets = [];
    Object.keys(categoryDataPoints).forEach(cat => {
        const puntos = categoryDataPoints[cat];
        if (puntos.length === 0) return;

        const color = window.getColorByString(cat);
        datasets.push({
            label: cat,
            data: puntos,
            backgroundColor: color,
            borderColor: color,
            pointRadius: 2,
            pointHoverRadius: 4,
            borderWidth: 2,
            showLine: true,
            tension: 0.3
        });
    });

    if (datasets.length === 0) {
        document.getElementById('global-timeline-wrapper').style.display = 'none';
        return;
    }
    
    document.getElementById('global-timeline-wrapper').style.display = 'block';

    // 5. Renderizar el Chart
    window.globalTimelineChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'bottom',
                    labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#e2e8f0',
                    bodyColor: '#cbd5e1',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y}%`;
                        },
                        afterLabel: function(context) {
                            const p = context.raw;
                            return `📅 ${p.dateLabel}\n👥 Promedio de ${p.miembrosActivos} miembro(s)`;
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, max: 105, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
                x: {
                    type: 'linear', position: 'bottom', grid: { display: false },
                    ticks: { callback: function(value) { return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }); }, maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 10 } }
                }
            }
        }
    });
};window.abrirSeleccionSubordinado = (evalId, title, mode) => {
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
    let subTitle = currentDesc ? currentDesc : "Responde las siguientes preguntas:";
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
        else if (q.question_type === 'range') {
            let min = 0, max = 5, step = 1;
            let opts = q.options;
            if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e) { opts = []; } }
            if (Array.isArray(opts) && opts.length >= 2) {
                min = parseInt(opts[0]); max = parseInt(opts[1]);
                if (opts.length > 2 && (String(opts[2]) === '0.5')) step = 0.5;
            }
            let rangeHtml = '<div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center;">';
            for (let i = min; i <= max; i += step) {
                const val = Math.round(i * 10) / 10;
                let labelText = '';
                if (rangeLabels[val]) { labelText = `<div style="font-size:0.7rem; color:#64748b; margin-top:4px; max-width:60px; text-align:center; line-height:1.1; word-wrap:break-word;">${rangeLabels[val]}</div>`; }
                rangeHtml += `
                <label style="cursor:pointer; display:flex; flex-direction:column; align-items:center;">
                    <input type="radio" name="range-${q.id}" value="${val}" class="resp-range" data-id="${q.id}" style="display:none;" onchange="updateRangeVisual(this)">
                    <div class="range-circle" style="width:42px; height:42px; border-radius:50%; border:2px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#64748b; background:white; transition:all 0.2s; font-size:0.85rem;">${val}</div>
                    ${labelText}
                </label>`;
            }
            rangeHtml += '</div>';
            inputHtml = rangeHtml;
        }

        container.insertAdjacentHTML('beforeend', `<div style="margin-bottom:30px; background:white; padding:25px; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e2e8f0;"><label style="display:block; font-weight:700; color:#1e293b; margin-bottom:15px; font-size:1.1rem; line-height:1.4;">${index + 1}. ${q.question_text}</label>${inputHtml}</div>`);
    });
};

window.updateRangeVisual = (input) => {
    const container = input.closest('div');
    container.querySelectorAll('.range-circle').forEach(c => {
        c.style.background = 'white'; c.style.color = '#64748b'; c.style.borderColor = '#cbd5e1'; c.style.transform = 'scale(1)';
    });
    const label = input.nextElementSibling;
    label.style.background = '#2563eb'; label.style.color = 'white'; label.style.borderColor = '#2563eb'; label.style.transform = 'scale(1.1)';
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

        window.preguntasCacheActual.forEach(q => {
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
            }
            
            answersMap[q.id] = val;

            if (val !== null && val !== "" && !(Array.isArray(val) && val.length === 0)) {
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
                }
            }
        });

        const keys = Object.keys(answersMap);
        if (keys.length === 0) throw new Error("No hay preguntas para responder.");
        
        const finalStatus = (isBossMode || (answeredCount > 0 && answeredCount === autoGradedCount)) ? 'Revisado' : 'Pendiente';
        const finalGrades = autoGradesMap;

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

const btnNuevaEval = document.getElementById('btn-nueva-eval');
if (btnNuevaEval) { btnNuevaEval.onclick = () => { if (window.abrirModalCrearEval) window.abrirModalCrearEval(); }; }

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
