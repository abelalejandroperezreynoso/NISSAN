// ==========================================
// 4-evaluaciones-admin.js (V52: INTEGRACIÓN DE EDICIÓN Y REVISIÓN EN UNA SOLA VISTA)
// ==========================================

// Variable global para caché de preguntas
window.preguntasCacheActual = null;

// --- HELPER: VERIFICAR SUPERVISOR DIRECTO (NO RECURSIVO) ---
// La comparación vive en `1-config.js`, que la necesita para preguntarlo de
// cualquiera; aquí sólo se le pone el usuario de la sesión.
window.esSupervisorDirecto = (empleadoId) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    return !!user && window.esSupervisorDirectoDe(empleadoId, user.id);
};

// ==========================================
// QUIÉN PUEDE CALIFICAR UNA RESPUESTA
// ==========================================
// La regla está en `1-config.js` (`window.leTocaRevisar`): el jefe inmediato,
// salvo que la encuesta nombre a sus propios revisores. Lo que hace falta aquí
// es la encuesta de la respuesta, que no siempre está a mano: a esta pantalla
// se llega también desde el panel de pendientes, sin haber abierto la lista de
// encuestas.
window.cacheEncuestasRevision = {};

window.encuestaEnCache = (evaluationId) => {
    if (!evaluationId) return null;
    const id = String(evaluationId);
    if (window.evalCache && window.evalCache.evals) {
        const enCache = window.evalCache.evals.find(e => String(e.id) === id);
        if (enCache) return enCache;
    }
    return window.cacheEncuestasRevision[id] || null;
};

window.encuestaDeLaRespuesta = async (evaluationId) => {
    if (!evaluationId) return null;
    const yaEsta = window.encuestaEnCache(evaluationId);
    if (yaEsta) return yaEsta;

    // Sólo lo que hace falta para saber quién la revisa.
    const campos = await window.camposConRevisores('id, title, mode');
    const { data } = await sb.from('evaluations').select(campos).eq('id', evaluationId).single();
    if (data) window.cacheEncuestasRevision[String(evaluationId)] = data;
    return data || null;
};

// Con la encuesta ya en la mano. El modo administrador puede con todo.
window.puedeCalificar = (ev, empleadoQueContesto) => {
    if (window.modoAdminActivo) return true;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if (!user) return false;
    return window.leTocaRevisar(ev, empleadoQueContesto, user.id);
};

// --- 1. HISTORIAL Y LISTA DE RESPUESTAS ---
window.abrirHistorialEvaluacion = async (evalId, title, maintainScroll = false) => {
    window.evalIdRespondiendo = evalId;
    window.evalTituloRespondiendo = title;
    window.isGlobalHistory = false;
    
    const container = document.getElementById('contenido-modal-evaluaciones');
    
    // CORRECCIÓN: Solo reseteamos el scroll del modal interno, NO el de la ventana de fondo
    if (!maintainScroll) {
        if (container) container.scrollTop = 0;
    }

    if (container) container.style.display = 'block';
    
    const { data: qs } = await sb.from('evaluation_questions').select('*').eq('evaluation_id', evalId).order('order_index');
    window.preguntasCacheActual = qs || [];

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    // Hace falta antes de filtrar: es lo que dice si a esta persona le toca
    // revisar la encuesta aunque no sea jefe de nadie.
    const encuestaDeLaLista = await window.encuestaDeLaRespuesta(evalId);

    let responses = [];
    const { data: todasLasRespuestas } = await sb.from('evaluation_responses').select('*').eq('evaluation_id', evalId).order('submitted_at', {ascending: false});
    if (window.modoAdminActivo) {
        responses = todasLasRespuestas || [];
    } else if (todasLasRespuestas) {
        responses = todasLasRespuestas.filter(r =>
            r.employee_id === user.id ||
            window.esSupervisorDirecto(r.employee_id) ||
            window.leTocaRevisar(encuestaDeLaLista, r.employee_id, user.id)
        );
    }
    
    window.respuestasCacheActual = responses || [];

    
    
    let infoHtml = '';
    let evalData = encuestaDeLaLista;

    if (evalData) {
        const desc = evalData.description ? `<div style="margin-bottom:5px;"><b>Descripción:</b> ${evalData.description}</div>` : '';
        
        const freqMap = { 'once': 'Única vez', 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual', 'quarterly': 'Trimestral', 'semiannual': 'Semestral', 'yearly': 'Anual', 'biennial': 'Cada 2 años' };
        const freq = evalData.frequency ? freqMap[evalData.frequency] || evalData.frequency : 'Única vez';
        const freqHtml = `<div style="font-size:0.8rem; color:#64748b;"><b>Frecuencia:</b> ${freq}</div>`;
        const obligHtml = (evalData.is_obligatory === false) ? `<div style="font-size:0.8rem; color:#22c55e; font-weight:bold; margin-top:4px;">✨ Encuesta Opcional</div>` : '';
        const areaHtml = (evalData.evaluates_area === true) ? `<div style="font-size:0.8rem; color:#be185d; font-weight:bold; margin-top:4px;">📍 Mide resultados por Área</div>` : '';

        // Quién la califica sólo se dice cuando no es lo de siempre: con el
        // jefe inmediato no hay nada que aclarar.
        const nombrados = window.revisoresDeEncuesta(evalData);
        const revisoresHtml = nombrados.length > 0
            ? `<div style="font-size:0.8rem; color:#7e22ce; font-weight:bold; margin-top:4px;">👁️ La revisa ${window.sanitizeForHTML(window.nombresDeEmpleados(nombrados))}</div>`
            : '';

        if(desc || freq) {
            infoHtml = `<div style="font-size:0.9rem; color:#475569; margin-top:5px; margin-bottom:15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${desc}${freqHtml}${obligHtml}${areaHtml}${revisoresHtml}</div>`;
        }
    }

    // --- LÓGICA DEL BANNER Y BOTÓN DE RESPONDER ---
    const mode = evalData ? (evalData.mode || 'self') : 'self';
    const safeTitle = title.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    
    let actionButtonHtml = '';
    if (mode === 'boss') {
        actionButtonHtml = `<button onclick="window.abrirSeleccionSubordinado('${evalId}', '${safeTitle}', 'boss')" style="width: 100%; padding:12px 20px; background:#be185d; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px rgba(190, 24, 93, 0.25); transition: transform 0.1s;">👥 Evaluar a un Colaborador...</button>`;
    } else if (window.modoAdminActivo || window.leTocaEstaEncuesta(evalData, user, window.tieneEquipoDirecto(user.id))) {
        const misRespuestas = responses.filter(r => String(r.employee_id) === String(user.id));
        const btnText = misRespuestas.length > 0 ? "Volver a Responder" : "Responder Encuesta";
        actionButtonHtml = `<button onclick="window.targetUserForEval=null; window.responderDirecto('${evalId}', '${safeTitle}', 'self')" style="width: 100%; padding:12px 20px; background:#2563eb; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px rgba(37,99,235,0.25); transition: transform 0.1s;">📝 ${btnText}</button>`;
    } else if (window.revisoresDeEncuesta(evalData).includes(String(user.id))) {
        // Se está aquí para calificarla, no para contestarla: la encuesta no va
        // dirigida a esta persona y el botón de responder sobra.
        actionButtonHtml = `<div style="text-align:center; color:#7e22ce; font-size:0.9rem; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px;">👁️ Te toca revisar esta encuesta.</div>`;
    }

    const bannerHtml = `
        <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="color: #334155; font-size: 0.95rem; margin-bottom: 15px; font-weight: 500; text-align: center;">
                ¿Deseas registrar una nueva respuesta para esta evaluación?
            </div>
            ${actionButtonHtml}
        </div>
    `;

    // --- CONSTRUCCIÓN DEL CONTENEDOR FINAL ---
        container.innerHTML = `
            <div style="display:flex; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" title="Volver a la lista">←</button>
                <div>
                    <h2 style="margin:0; font-size:1.2rem; color:#7c3aed;">${title}</h2>
                </div>
            </div>
            ${infoHtml}
        
        ${bannerHtml} <div id="stats-dashboard" style="display:none; margin-top:20px;"></div>
        <div id="timeline-wrapper" style="margin-top:20px; background:white; padding:15px; border-radius:12px; border:1px solid #e2e8f0; display:none; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h3 style="margin:0; color:#334155; font-size:1rem; display:flex; align-items:center; gap:6px;">📅 Cronología de Participación</h3>
                <span style="font-size:0.7rem; color:#94a3b8;">Fecha vs Calificación</span>
            </div>
            <div style="position: relative; height:250px; width:100%;">
                <canvas id="timeline-chart"></canvas>
            </div>
        </div>
        <div id="lista-wrapper">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom: 10px; flex-wrap:wrap; gap:10px;">
                <h3 style="color:#64748b; font-size:1rem; margin:0;">
                    ${window.modoAdminActivo ? 'Todas las Respuestas' : 'Mi Historial y Equipo Directo'} (<span id="contador-respuestas">${window.respuestasCacheActual.length}</span>)
                </h3>
                <input type="text" id="buscador-historial" placeholder="🔍 Buscar usuario..." oninput="window.renderizarListaRespuestas()" style="padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; width: 250px; font-size: 0.9rem; outline:none; background:#f8fafc;">
            </div>
            <div id="lista-respuestas-historial">Cargando...</div>
        </div>
    `;
    
    window.renderizarListaRespuestas();
    window.renderizarCronologia();

    if(maintainScroll && window.lastScrollPosition) window.scrollTo(0, window.lastScrollPosition);
};


window.abrirHistorialGlobal = async () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if(container) { container.scrollTop = 0; container.style.display = 'block'; }
    
    container.innerHTML = '<div style="padding:40px; text-align:center;"><div class="spinner" style="margin: 0 auto 15px auto;"></div>Obteniendo todas las respuestas...</div>';
    
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    let responses = [];
    
    if (window.modoAdminActivo) {
        const { data } = await sb.from('evaluation_responses').select('*').order('submitted_at', {ascending: false});
        responses = data || [];
    } else {
        const hierarchyIds = window.obtenerJerarquiaCompletaEvaluaciones(user.id);
        const idsArray = Array.from(hierarchyIds);
        if (idsArray.length > 0) {
             const { data } = await sb.from('evaluation_responses').select('*').in('employee_id', idsArray).order('submitted_at', {ascending: false});
             responses = data || [];
        } else {
             const { data } = await sb.from('evaluation_responses').select('*').eq('employee_id', user.id).order('submitted_at', {ascending: false});
             responses = data || [];
        }
    }
    
    window.respuestasCacheActual = responses;
    window.isGlobalHistory = true;

    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.isGlobalHistory=false; window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" title="Volver a la lista">←</button>
            <div>
                <h2 style="margin:0; font-size:1.2rem; color:#7c3aed;">🗂️ Historial Global de Respuestas</h2>
                <div style="font-size:0.85rem; color:#64748b;">Listado de todas las evaluaciones recibidas</div>
            </div>
        </div>
        
        <div id="lista-wrapper">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-bottom:1px solid #e2e8f0; padding-bottom:10px; margin-bottom: 10px; flex-wrap:wrap; gap:10px;">
                <h3 style="color:#64748b; font-size:1rem; margin:0;">
                    ${window.modoAdminActivo ? 'Todas las Respuestas' : 'Mi Equipo y Mías'} (<span id="contador-respuestas">${responses.length}</span>)
                </h3>
                <input type="text" id="buscador-historial" placeholder="🔍 Buscar usuario o evaluación..." oninput="window.renderizarListaRespuestas()" style="padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; width: 250px; font-size: 0.9rem; outline:none; background:#f8fafc;">
            </div>
            <div id="lista-respuestas-historial">Cargando...</div>
        </div>
    `;
    
    window.renderizarListaRespuestas();
};


window.renderizarCronologia = () => {
    const ctx = document.getElementById('timeline-chart');
    const wrapper = document.getElementById('timeline-wrapper');
    if(!ctx || !wrapper) return;
    
    // 1. Clonar y ordenar cronológicamente para que la línea no haga zig-zag hacia atrás
    const responses = [...(window.respuestasCacheActual || [])].sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
    
    if(responses.length === 0) { wrapper.style.display = 'none'; return; }
    wrapper.style.display = 'block';
    
    if(window.timelineChartInstance) { 
        window.timelineChartInstance.destroy(); 
        window.timelineChartInstance = null; 
    }

    // 2. Agrupar las respuestas por empleado para tener una línea por cada uno
    const datasetsMap = {};

    responses.forEach(r => {
        const dateObj = new Date(r.submitted_at);
        const timestamp = dateObj.getTime();
        const dateLabel = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
        const empName = window.employeeNameMap[r.employee_id] || `ID: ${r.employee_id}`;
        const score = window.calcularScoreRespuesta(r);
        
        // Usar la función existente para asignar un color consistente al usuario
        const userColor = window.getColorByString(empName); 
        
       if(!datasetsMap[empName]) {
            datasetsMap[empName] = {
                label: empName,
                data: [],
                backgroundColor: userColor,
                borderColor: userColor, // Color de la línea de conexión
                pointRadius: 2,
                pointHoverRadius: 4,
                borderWidth: 2,       // Grosor de la línea
                showLine: true,       // ¡Esto conecta los puntos!
                tension: 0.2          // Le da una curvatura suave a la línea (0 = recta)
            };
        }
        
        datasetsMap[empName].data.push({ x: timestamp, y: score, empName: empName, dateLabel: dateLabel });
    });

    // Convertir el mapa a un arreglo de datasets para Chart.js
    const datasets = Object.values(datasetsMap);

    window.timelineChartInstance = new Chart(ctx, {
        type: 'scatter', 
        data: { datasets: datasets },
        options: {
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { 
                // Se activa la leyenda inferior para distinguir quién es quién fácilmente
                legend: { 
                    display: true, 
                    position: 'bottom',
                    labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } }
                }, 
                tooltip: { 
                    callbacks: { 
                        label: function(context) { 
                            const p = context.raw; 
                            return `${p.empName}: ${context.parsed.y}% (${p.dateLabel})`; 
                        } 
                    } 
                } 
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    max: 105, 
                    title: { display: true, text: 'Calificación (%)' }, 
                    grid: { color: '#f1f5f9' } 
                }, 
                x: { 
                    type: 'linear', 
                    position: 'bottom', 
                    title: { display: true, text: 'Cronología' }, 
                    grid: { display: false }, 
                    ticks: { 
                        callback: function(value) { 
                            return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }); 
                        }, 
                        maxRotation: 45, 
                        minRotation: 0 
                    } 
                } 
            }
        }
    });
};


window.renderizarListaRespuestas = () => {
    const listContainer = document.getElementById('lista-respuestas-historial');
    // La lista no existe si el administrador llegó desde el expediente por
    // empleado; sin esta guarda el redibujado revienta con TypeError.
    if (!listContainer) return;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    const searchInput = document.getElementById('buscador-historial');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let responses = window.respuestasCacheActual || [];
    
    if (searchTerm) {
        responses = responses.filter(r => {
            const empData = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(r.employee_id)) : null;
            const nombreEmp = (empData ? empData.name : (window.employeeNameMap && window.employeeNameMap[r.employee_id] ? window.employeeNameMap[r.employee_id] : `ID: ${r.employee_id}`)).toLowerCase();
            const evalName = window.evalCache && window.evalCache.evals ? (window.evalCache.evals.find(e => e.id === r.evaluation_id)?.title || '').toLowerCase() : '';
            return nombreEmp.includes(searchTerm) || evalName.includes(searchTerm);
        });
    }

    const contadorElement = document.getElementById('contador-respuestas');
    if (contadorElement) {
        contadorElement.innerText = responses.length;
    }

    if (!responses || responses.length === 0) { 
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">No se encontraron coincidencias.</div>'; 
        return; 
    }
    
    listContainer.innerHTML = '';
    
    const crearCardHtml = (resp, index) => {
        const fecha = new Date(resp.submitted_at).toLocaleDateString();
        const empData = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(resp.employee_id)) : null;
        const nombreEmp = empData ? empData.name : (window.employeeNameMap && window.employeeNameMap[resp.employee_id] ? window.employeeNameMap[resp.employee_id] : `ID: ${resp.employee_id}`);
        
        const originalIndex = window.respuestasCacheActual.findIndex(orig => orig.id === resp.id);
        let tituloCard = `Tu respuesta #${window.respuestasCacheActual.length - originalIndex}`;
        
        if (resp.employee_id !== user.id) tituloCard = `<b>${nombreEmp}</b>`;

        // LÓGICA GLOBAL: Mostrar el nombre de la evaluación si estamos en la vista de historial de todas las encuestas
        if (window.isGlobalHistory) {
             const evalName = window.evalCache && window.evalCache.evals ? (window.evalCache.evals.find(e => e.id === resp.evaluation_id)?.title || 'Evaluación') : 'Evaluación';
             if (resp.employee_id === user.id) {
                 tituloCard = `<b>Tú</b> en <span style="color:#64748b; font-weight:normal;">${evalName}</span>`;
             } else {
                 tituloCard = `<b>${nombreEmp}</b> en <span style="color:#64748b; font-weight:normal;">${evalName}</span>`;
             }
        }

        let scoreBadge = '';
        if(resp.review_status === 'Revisado' || resp.review_status === 'Certificada') {
             const score = window.calcularScoreRespuesta(resp);
             const pct = score;
             const color = pct >= 80 ? '#166534' : (pct >= 60 ? '#b45309' : '#991b1b');
             const bg = pct >= 80 ? '#dcfce7' : (pct >= 60 ? '#fef3c7' : '#fee2e2');
             scoreBadge = `<span style="margin-left:5px; font-weight:bold; color:${color}; background:${bg}; padding:2px 6px; border-radius:6px; font-size:0.8rem;">${pct}%</span>`;
        }
        
        const isRevisado = resp.review_status === 'Revisado';
        const isFalsa = resp.review_status === 'Falsa';
        const isCertificada = resp.review_status === 'Certificada';
        const isMalRevisada = resp.review_status === 'Mal Revisada';
        const safeJson = JSON.stringify(resp).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        
        let colorBorde = isCertificada ? '#3b82f6' : (isRevisado ? '#22c55e' : (isFalsa ? '#ef4444' : (isMalRevisada ? '#a855f7' : '#f97316')));
        
        let textoEstado = isCertificada ? '<span style="color:#1d4ed8; font-weight:bold; font-size:0.75rem;">⭐ Certificada</span>' :
                         (isRevisado ? '<span style="color:#166534; font-weight:bold; font-size:0.75rem;">Revisado</span>' : 
                         (isFalsa ? '<span style="color:#991b1b; font-weight:bold; font-size:0.75rem;">Falsa / Anulada</span>' : 
                         (isMalRevisada ? '<span style="color:#7e22ce; font-weight:bold; font-size:0.75rem;">⚠️ Mal Revisada</span>' : 
                         '<span style="color:#ea580c; font-weight:bold; font-size:0.75rem;">En espera</span>')));
        
        return `<div class="incident-card" style="border-left: 5px solid ${colorBorde}; padding: 15px; cursor:pointer;" onclick='verDetalleRespuesta(${safeJson})'><div style="display:flex; justify-content:space-between; align-items:center;"><div><div style="color:#334155; font-size:1rem; margin-bottom:4px;">${tituloCard} ${scoreBadge}</div><div class="card-meta">${fecha} • ${textoEstado}</div></div><div style="color:#64748b; font-size:1.2rem;">👉</div></div></div>`;
    };

    const pendientesDeRevisar = responses.filter(r =>
        r.review_status !== 'Revisado' && r.review_status !== 'Falsa' && r.review_status !== 'Certificada' &&
        window.puedeCalificar(window.encuestaEnCache(r.evaluation_id), r.employee_id)
    );
    
    const resto = responses.filter(r => !pendientesDeRevisar.includes(r));

    if (pendientesDeRevisar.length > 0) {
        listContainer.insertAdjacentHTML('beforeend', `<div style="margin:20px 0 10px 0; color:#ea580c; font-weight:bold; font-size:0.9rem; background:#fff7ed; padding:8px; border-radius:6px; border:1px dashed #fdba74;">Requieren tu revisión (${pendientesDeRevisar.length})</div>`);
        pendientesDeRevisar.forEach((r, i) => listContainer.insertAdjacentHTML('beforeend', crearCardHtml(r, i)));
    }
    if (resto.length > 0) {
        listContainer.insertAdjacentHTML('beforeend', `<div style="margin:30px 0 10px 0; color:#166534; font-weight:bold; font-size:0.9rem; border-bottom:2px solid #bbf7d0; padding-bottom:5px;">Historial / Míos / Equipo</div>`);
        resto.forEach((r, i) => listContainer.insertAdjacentHTML('beforeend', crearCardHtml(r, i)));
    }
};

window.verDetalleRespuesta = async (resp) => {
    window.gradingResponseId = resp.id;
    window.gradesTemp = resp.grades_json || {};
    const modal = document.getElementById('modal-responder-eval');
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));

    // Quién revisa esto no siempre es el jefe: la encuesta puede haber
    // nombrado a los suyos. Se pide antes de dibujar nada.
    const encuestaDeLaRespuesta = await window.encuestaDeLaRespuesta(resp.evaluation_id);
    const puedeCalificar = window.puedeCalificar(encuestaDeLaRespuesta, resp.employee_id);
    const esMiRespuesta = (String(resp.employee_id) === String(user.id));
    const esAdminTotal = window.modoAdminActivo;

    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    // Igual que al responder: la clase .hoja-overlay viene de index.html y
    // aquí sólo se enciende la hoja.
    modal.style.cssText = 'display:flex; z-index:999999;';
    
    let saveButton = '', dateInputHtml = '', deleteButton = '', invalidarButton = '';

    if(puedeCalificar) {
        saveButton = `<button id="btn-save-grades" onclick="guardarCalificacionAdmin()" style="width:100%; background:#22c55e; color:white; padding:15px; border:none; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px -1px rgba(34, 197, 94, 0.3); margin-top:30px; transition: transform 0.1s;">Guardar Revisión</button>`;
        const d = new Date(resp.submitted_at); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        const dateDisabledAttr = esAdminTotal ? '' : 'disabled';
        dateInputHtml = `<div style="margin-top:10px;"><label style="font-size:0.85rem; color:#64748b; display:block; margin-bottom:4px;">Fecha de Realización:</label><input type="date" id="admin-edit-date" value="${d.toISOString().slice(0,10)}" ${dateDisabledAttr} style="padding:8px; border:1px solid #cbd5e1; border-radius:6px; width:100%; box-sizing:border-box;"></div>`;
    } else {
        dateInputHtml = `<div style="margin-top:5px; color:#64748b; font-size:0.9rem;">Fecha: ${new Date(resp.submitted_at).toLocaleDateString()}</div>`;
        if (resp.review_status !== 'Revisado' && resp.review_status !== 'Certificada' && !esMiRespuesta) {
             // Decir quién sí puede ahorra la pregunta: con revisores
             // nombrados, el supervisor directo ya no es la respuesta.
             const nombrados = window.revisoresDeLaRespuesta(encuestaDeLaRespuesta, resp.employee_id);
             const quien = nombrados.length > 0
                ? 'Esta encuesta la revisa ' + window.sanitizeForHTML(window.nombresDeEmpleados(nombrados))
                : 'Solo el supervisor directo puede calificar';
             dateInputHtml += `<div style="margin-top:10px; padding:10px; background:#fef3c7; color:#b45309; border-radius:6px; font-size:0.85rem;">Nota: ${quien}.</div>`;
        }
    }

    if (esAdminTotal) {
            deleteButton = `<button onclick="borrarRespuestaIndividual('${resp.id}')" style="width:100%; background:white; color:#ef4444; padding:15px; border:1px solid #ef4444; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">🗑️ Eliminar esta respuesta</button>`;

            // Calculamos el puntaje actual
            const scoreActual = window.calcularScoreRespuesta(resp);
            let adminOptions = [];

            // Si está alterada, permitir restaurar
            if (resp.review_status === 'Falsa' || resp.review_status === 'Certificada' || resp.review_status === 'Mal Revisada') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Revisado')" style="width:100%; background:#dcfce7; color:#166534; padding:15px; border:1px solid #22c55e; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">✅ Restaurar a Validada</button>`);
            }
            
            // Certificar solo si tiene >= 80 y no está certificada
            if (scoreActual >= 80 && resp.review_status !== 'Certificada') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Certificada')" style="width:100%; background:#eff6ff; color:#1d4ed8; padding:15px; border:1px solid #3b82f6; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">⭐ Certificar Respuesta (Auditoría)</button>`);
            }
            
            // Botones de rechazo
            if (resp.review_status !== 'Mal Revisada') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Mal Revisada')" style="width:100%; background:#f3e8ff; color:#7e22ce; padding:15px; border:1px solid #a855f7; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">⚠️ Marcar como Mal Revisada (Requiere corrección)</button>`);
            }
            if (resp.review_status !== 'Falsa') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Falsa')" style="width:100%; background:#fee2e2; color:#991b1b; padding:15px; border:1px solid #ef4444; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">🚫 Marcar como Falsa (Anular)</button>`);
            }

            invalidarButton = adminOptions.join("");
        }

    let descHtml = '';
        let evaluatesArea = false; // Agregamos una bandera para saber si la encuesta mide por áreas
        
        if (window.evalCache && window.evalCache.evals) {
            const found = window.evalCache.evals.find(e => e.id === resp.evaluation_id);
            if (found) {
                if (found.description) {
                    descHtml = `<div style="font-size:0.9rem; color:#475569; margin:10px 0 20px 0; background:#f1f5f9; padding:12px; border-radius:8px; border-left:4px solid #cbd5e1;"><b>Instrucciones:</b> ${found.description}</div>`;
                }
                // Revisamos si la evaluación realmente requería medir el área
                if (found.evaluates_area === true) {
                    evaluatesArea = true;
                }
            }
        }

    const recordedArea = (resp.employee_area && resp.employee_area !== 'Sin Área') ? resp.employee_area : '';
        let areaInfoHtml = '';
        
        if (evaluatesArea) {
            if (esAdminTotal) {
                // Consultamos las áreas oficiales a la base de datos
                const { data: areasData } = await sb.from('areas').select('nombre').eq('activa', true).order('nombre');
                let optionsHtml = '<option value="">Sin Área</option>';
                
                let areaEncontrada = false;
                if (areasData) {
                    areasData.forEach(a => {
                        const isSelected = (a.nombre === recordedArea) ? 'selected' : '';
                        if (isSelected) areaEncontrada = true;
                        optionsHtml += `<option value="${a.nombre}" ${isSelected}>${a.nombre}</option>`;
                    });
                }
                
                // Si el registro histórico tiene un área que ya fue borrada/desactivada, la mantenemos visible en la lista
                if (recordedArea && !areaEncontrada) {
                    optionsHtml += `<option value="${recordedArea}" selected>${recordedArea} (No activa)</option>`;
                }

                // El administrador ahora elige de una lista desplegable
                areaInfoHtml = `<span style="background:#fdf4ff; color:#be185d; padding:2px 8px; border-radius:6px; font-size:0.8rem; border:1px solid #fbcfe8; margin-left:8px; font-weight:bold; display:inline-flex; align-items:center;">
                    📍 Área Evaluada: 
                    <select id="admin-edit-area" style="margin-left:5px; padding:2px 5px; border-radius:4px; border:1px solid #fbcfe8; outline:none; font-family:inherit; font-size:0.8rem; color:#be185d; background:white; cursor:pointer;">
                        ${optionsHtml}
                    </select>
                </span>`;
            } else if (recordedArea) {
                // Vista de solo lectura para el empleado o supervisor
                areaInfoHtml = `<span style="background:#fdf4ff; color:#be185d; padding:2px 8px; border-radius:6px; font-size:0.8rem; border:1px solid #fbcfe8; margin-left:8px; font-weight:bold;">📍 Área Evaluada: ${recordedArea}</span>`;
            }
        }

        // --- NUEVO: CÁLCULO Y GLOBO DE CALIFICACIÓN ---
        let badgeCalificacionHtml = '';
        if (resp.review_status === 'Revisado' || resp.review_status === 'Certificada' || resp.review_status === 'Falsa' || resp.review_status === 'Mal Revisada') {
            // Obtenemos el score actual
            const scoreActual = window.calcularScoreRespuesta(resp);
            // Coloreamos según desempeño
            let bgBadge = scoreActual >= 80 ? '#22c55e' : (scoreActual >= 60 ? '#f59e0b' : '#ef4444');
            
            if (resp.review_status === 'Falsa') bgBadge = '#64748b'; // Gris si fue anulada
            if (resp.review_status === 'Mal Revisada') bgBadge = '#a855f7'; // Morado si fue mal revisada
            
            badgeCalificacionHtml = `<span style="background:${bgBadge}; color:white; padding:4px 12px; border-radius:12px; font-size:1rem; font-weight:bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); letter-spacing:-0.5px; white-space:nowrap;">${scoreActual}%</span>`;
        } else {
            // Mostrar pendiente si se está calificando
            badgeCalificacionHtml = `<span style="background:#f1f5f9; color:#64748b; border: 1px solid #cbd5e1; padding:4px 12px; border-radius:12px; font-size:0.85rem; font-weight:bold; white-space:nowrap;">Calificando...</span>`;
        }

        modal.innerHTML = `
            <div class="hoja-contenido" style="max-width:900px; background:#f8fafc; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h2 class="hoja-titulo">Detalle de respuesta</h2>
                    <div class="hoja-subtitulo">Empleado: <b>${window.employeeNameMap[resp.employee_id] || resp.employee_id}</b> ${areaInfoHtml}</div>
                </div>
                <div class="hoja-acciones">
                    ${badgeCalificacionHtml}
                    <button onclick="cancelarRespuesta('history')" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                </div>
            </div>
            <div id="simple-form-container" style="flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y; padding: 14px 15px calc(25px + env(safe-area-inset-bottom)); box-sizing: border-box;">
                <div style="margin-bottom:20px;">
                    ${dateInputHtml}
                </div>
                ${descHtml}
                <div id="responder-questions-list"></div>
                ${saveButton}${invalidarButton}${deleteButton}
            </div>
            </div>
        `;
    
    const container = document.getElementById('responder-questions-list');
    let questions = window.preguntasCacheActual;
    
    if(!questions || questions.length === 0 || questions[0].evaluation_id !== resp.evaluation_id) {
        container.innerHTML = 'Cargando preguntas...';
        const { data: qs } = await sb.from('evaluation_questions').select('*').eq('evaluation_id', resp.evaluation_id).order('order_index');
        questions = qs; window.preguntasCacheActual = qs;
        container.innerHTML = '';
    }
    
    window.respuestasTempAdmin = resp.answers_json || {};
    const responseDate = new Date(resp.submitted_at);

    if(questions) questions.forEach((q, index) => {
        if (q.created_at) {
            const questionDate = new Date(q.created_at);
            if (questionDate.getTime() > (responseDate.getTime() + 60000) && !window.respuestasTempAdmin[q.id]) {
                return;
            }
        }

        const rawRespuesta = (resp.answers_json || {})[q.id];
        const isListMatch = q.question_type === 'list_match';
        const isRange = q.question_type === 'range';
        
        let contentHtml = ""; 
        const gradeObj = window.gradesTemp[q.id];
        let resultBadgeId = `badge-${q.id}`;
        let resultBadge = '';

        // Pre-calcular el badge y el estado para usarlo en la cabecera
        if (isListMatch) {
            const currentItems = Array.isArray(rawRespuesta) ? rawRespuesta : (typeof rawRespuesta === 'string' ? rawRespuesta.split('\n') : []);
            let modelLen = 0;
            try { const parsed = JSON.parse(q.correct_answer_text); if(Array.isArray(parsed)) modelLen = parsed.length; else if (typeof parsed === 'string') modelLen = 1; } catch(e) { if (q.correct_answer_text) { modelLen = q.correct_answer_text.split(/\n/).filter(s => s.trim() !== "").length; } }
            if (modelLen === 0 && q.correct_answer_text && q.correct_answer_text.includes(',')) { modelLen = q.correct_answer_text.split(',').filter(s => s.trim() !== "").length; }
            
            const totalEsperado = modelLen > 0 ? modelLen : currentItems.length;
            if (!gradeObj || !gradeObj.type || gradeObj.type !== 'list_match') { window.gradesTemp[q.id] = { type: 'list_match', items: currentItems.map(txt => ({ text: txt, status: 'pending' })) }; }
            if(window.gradesTemp[q.id].items.length !== currentItems.length) { window.gradesTemp[q.id].items = currentItems.map(txt => ({ text: txt, status: 'pending' })); }
            window.gradesTemp[q.id].totalExpected = totalEsperado;

            const aciertos = window.gradesTemp[q.id].items.filter(i=>i.status==='correct').length;
            let warningText = '';
            if (currentItems.length < totalEsperado) { warningText = `<div style="margin-top:5px; color:#ef4444; font-size:0.75rem; font-weight:bold;">⚠️ Faltaron ${totalEsperado - currentItems.length} elementos</div>`; }
            let color = '#64748b', bg = '#f1f5f9';
            if(totalEsperado > 0 && aciertos === totalEsperado) { color='#166534'; bg='#dcfce7'; }
            else if(aciertos > 0) { color='#b45309'; bg='#fef3c7'; }
            
            resultBadge = `<div style="text-align:right;"><span id="${resultBadgeId}" data-total="${totalEsperado}" style="background:${bg}; color:${color}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${aciertos}/${totalEsperado} Aciertos</span>${warningText}</div>`;

        } else if (gradeObj && gradeObj.type === 'numeric_score') {
            const val = gradeObj.value;
            const max = gradeObj.max || 5;
            const pct = gradeObj.percentage || 0;
            let color = '#166534', bg = '#dcfce7';
            if(pct < 80) { color = '#b45309'; bg = '#fef3c7'; }
            if(pct < 60) { color = '#991b1b'; bg = '#fee2e2'; }
            resultBadge = `<span id="${resultBadgeId}" style="float:right; background:${bg}; color:${color}; padding:3px 10px; border-radius:12px; font-size:0.85rem; font-weight:bold;">${val}/${max} (${pct}%)</span>`;
        } else {
            let status = "pending";
            if (typeof gradeObj === 'string') status = gradeObj;
            else if (gradeObj && gradeObj.status) status = gradeObj.status;
            
            resultBadge = `<span id="${resultBadgeId}" style="float:right; background:${status==='correct'?'#dcfce7':(status==='incorrect'?'#fee2e2':'#f1f5f9')}; color:${status==='correct'?'#166534':(status==='incorrect'?'#991b1b':'#64748b')}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${status==='correct'?'CORRECTO':(status==='incorrect'?'INCORRECTO':'PENDIENTE')}</span>`;
        }

        // Construir la vista Integrada (Editable/Calificable) vs la vista de Sólo Lectura
        if (puedeCalificar) {
            const readOnlyAttr = esAdminTotal ? '' : 'readonly disabled';
            const displayEditOpts = esAdminTotal ? 'flex' : 'none';
            const bgEditable = esAdminTotal ? 'white' : '#f8fafc';

            if (isListMatch) {
                let modelItems = [];
                try { const parsed = JSON.parse(q.correct_answer_text); if(Array.isArray(parsed)) modelItems = parsed; else if (typeof parsed === 'string') modelItems = [parsed]; } catch(e) { if (q.correct_answer_text) { modelItems = q.correct_answer_text.split(/\n/).map(s => s.trim()).filter(s => s !== ""); } }
                if (modelItems.length === 0 && q.correct_answer_text && q.correct_answer_text.includes(',')) { modelItems = q.correct_answer_text.split(',').map(s => s.trim()).filter(s => s !== ""); }
                let modelLen = modelItems.length;
                let correctModelHtml = modelLen > 0 ? modelItems.map(item => `<div style="background:#eff6ff; border:1px solid #bfdbfe; border-left:3px solid #3b82f6; padding:6px 10px; margin-bottom:4px; border-radius:4px; color:#1e3a8a; font-size:0.85rem;">${item}</div>`).join("") : '<div style="color:#94a3b8; font-style:italic; padding:5px; font-size:0.85rem;">Sin respuesta modelo</div>';
                
                const totalEsperado = window.gradesTemp[q.id].totalExpected;
                const gItems = window.gradesTemp[q.id].items;

                let inputsHtml = `<div id="admin-edit-list-${q.id}" style="display:flex; flex-direction:column; gap:6px;">`;
                gItems.forEach((it, idx) => {
                     const st = it.status;
                     const btnOkClass = st === 'correct' ? 'opacity:1; transform:scale(1.1); filter:grayscale(0);' : 'opacity:0.4; filter:grayscale(1);';
                     const btnBadClass = st === 'incorrect' ? 'opacity:1; transform:scale(1.1); filter:grayscale(0);' : 'opacity:0.4; filter:grayscale(1);';
                     
                     inputsHtml += `<div class="list-item-row" style="display:flex; gap:8px; align-items:center;">
                         <textarea class="admin-edit-list-item-${q.id} auto-resize-text" ${readOnlyAttr} oninput="window.gradesTemp['${q.id}'].items[${idx}].text = this.value; this.style.height='auto'; this.style.height=this.scrollHeight+'px';" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem; background:${bgEditable}; resize:none; overflow-y:hidden; min-height:38px; font-family:inherit; line-height:1.4;">${it.text}</textarea>
                         <div style="display:flex; background:#f1f5f9; padding:4px; border-radius:6px; gap:4px; border:1px solid #e2e8f0;">
                             <button id="btn-ok-${q.id}-${idx}" onclick="setItemGrade('${q.id}', ${idx}, 'correct', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; ${btnOkClass}" title="Marcar Correcto">✅</button>
                             <button id="btn-bad-${q.id}-${idx}" onclick="setItemGrade('${q.id}', ${idx}, 'incorrect', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; ${btnBadClass}" title="Marcar Incorrecto">❌</button>
                         </div>
                         <button onclick="this.closest('.list-item-row').remove(); window.recalcListMatch('${q.id}');" style="display:${displayEditOpts}; color:#ef4444; border:none; background:#fee2e2; width:28px; height:28px; border-radius:6px; cursor:pointer; font-weight:bold; align-items:center; justify-content:center;" title="Eliminar ítem">✕</button>
                     </div>`;
                });
                inputsHtml += `</div><button onclick="addAdminListInputAdvanced('${q.id}')" style="display:${displayEditOpts}; margin-top:10px; padding:6px 12px; font-size:0.8rem; font-weight:bold; color:#2563eb; background:#eff6ff; border:1px dashed #bfdbfe; border-radius:6px; cursor:pointer; width: fit-content;">+ Agregar Ítem</button>`;
                
                contentHtml = `
                <div style="display:flex; flex-wrap:wrap; gap: 20px;">
                    <div style="flex: 1; min-width:250px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Respuestas del Usuario (Editable y Calificable):</div>
                        ${inputsHtml}
                    </div>
                    <div style="width: 250px; flex-shrink:0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Modelo (${totalEsperado}):</div>
                        ${correctModelHtml}
                    </div>
                </div>`;

            } else if (['text', 'multiple', 'checklist'].includes(q.question_type)) {
                let editableInput = '';
                if (q.question_type === 'text') {
                    editableInput = `<textarea class="admin-edit-answer" data-qid="${q.id}" data-type="${q.question_type}" ${readOnlyAttr} oninput="this.style.height=''; this.style.height=this.scrollHeight+'px'" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit; font-size:0.95rem; background:${bgEditable}; resize:none; overflow-y:hidden; min-height:80px;">${rawRespuesta||''}</textarea>`;
                } else if (q.question_type === 'multiple') {
                    let options = q.options || []; if(typeof options === 'string') try{options=JSON.parse(options)}catch(e){}
                    let optsHtml = `<option value="">(Sin selección)</option>`;
                    options.forEach(o => { optsHtml += `<option value="${o}" ${rawRespuesta===o?'selected':''}>${o}</option>`; });
                    editableInput = `<select class="admin-edit-answer" data-qid="${q.id}" data-type="multiple" ${readOnlyAttr} style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.95rem; background:${bgEditable};">${optsHtml}</select>`;
                } else if (q.question_type === 'checklist') {
                    let options = q.options || []; if(typeof options === 'string') try{options=JSON.parse(options)}catch(e){}
                    let checksHtml = ""; const currentArr = Array.isArray(rawRespuesta) ? rawRespuesta : [];
                    options.forEach(o => { checksHtml += `<label style="display:block; margin-bottom:6px; cursor:pointer;"><input type="checkbox" class="admin-edit-check-${q.id}" value="${o}" ${currentArr.includes(o)?'checked':''} ${readOnlyAttr} style="accent-color:#2563eb;"> <span style="font-size:0.95rem; color:#334155;">${o}</span></label>`; });
                    editableInput = `<div class="admin-edit-answer-check-group" data-qid="${q.id}" data-type="checklist" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; background:${bgEditable};">${checksHtml}</div>`;
                }

                let correctText = q.correct_answer_text || "A criterio del evaluador";
                let status = "pending";
                if (typeof gradeObj === 'string') status = gradeObj;
                else if (gradeObj && gradeObj.status) status = gradeObj.status;
                
                const isCorrect = status === 'correct' ? 'selected-correct' : '';
                const isIncorrect = status === 'incorrect' ? 'selected-incorrect' : '';

                contentHtml = `
                <div style="display:flex; gap: 20px; flex-wrap:wrap;">
                    <div style="flex: 1; min-width: 250px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Respuesta del Usuario:</div>
                        ${editableInput}
                    </div>
                    <div style="width: 250px; flex-shrink:0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px; display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">Respuesta Modelo:</div>
                            <div style="background:#eff6ff; padding:8px 12px; border-radius:6px; font-size:0.9rem; color:#1e3a8a; border-left:3px solid #3b82f6;">${correctText}</div>
                        </div>
                        <div style="margin-top:15px;">
                            <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">Calificación:</div>
                            <div style="display:flex; gap:8px;">
                                <button class="grade-btn ${isCorrect}" onclick="setGrade('${q.id}', 'correct', this)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #22c55e; background:${status==='correct'?'#22c55e':'white'}; color:${status==='correct'?'white':'#22c55e'}; cursor:pointer; font-weight:bold; transition:all 0.2s;">Correcto</button>
                                <button class="grade-btn ${isIncorrect}" onclick="setGrade('${q.id}', 'incorrect', this)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ef4444; background:${status==='incorrect'?'#ef4444':'white'}; color:${status==='incorrect'?'white':'#ef4444'}; cursor:pointer; font-weight:bold; transition:all 0.2s;">Incorrecto</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                
            } else if (q.question_type === 'range') {
                let min = 0, max = 5, step = 1;
                let opts = q.options;
                if(typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e){ opts=[]; } }
                if(Array.isArray(opts) && opts.length >= 2) { min = parseInt(opts[0]); max = parseInt(opts[1]); if(opts.length > 2 && (String(opts[2]) === '0.5')) step = 0.5; }
                
                let rangeHtml = '<div class="admin-edit-answer-range-group" data-qid="'+q.id+'" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">';
                for(let i = min; i <= max; i += step) {
                    const val = Math.round(i * 10) / 10;
                    const checked = String(rawRespuesta) === String(val);
                    const bg = checked ? '#2563eb' : 'white'; const col = checked ? 'white' : '#64748b';
                    rangeHtml += `<div onclick="this.parentElement.querySelectorAll('.rg-circle').forEach(c=>{c.style.background='white';c.style.color='#64748b';}); this.style.background='#2563eb'; this.style.color='white'; this.previousElementSibling.checked=true; window.syncGradeWithAnswer('${q.id}', ${val}, ${max});" class="rg-circle" style="width:38px; height:38px; border-radius:50%; border:1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:bold; background:${bg}; color:${col}; font-size:0.9rem; transition:all 0.2s;">${val}</div><input type="radio" name="adm-range-${q.id}" value="${val}" style="display:none" ${checked?'checked':''}>`;
                }
                rangeHtml += '</div>';

                const valActual = gradeObj ? gradeObj.value : (parseFloat(rawRespuesta)||0);

                contentHtml = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                    <div>
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Selección (Ajusta para calificar):</div>
                        ${rangeHtml}
                    </div>
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px; text-align:center; min-width:120px;">
                         <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">Puntaje Asignado:</div>
                         <div style="display:flex; justify-content:center; align-items:center; gap:5px;">
                             <input type="number" id="grade-input-${q.id}" step="${step}" min="${min}" max="${max}" value="${valActual}" oninput="window.updateNumericGrade('${q.id}', this.value, ${max}); this.parentElement.parentElement.previousElementSibling.querySelectorAll('.rg-circle').forEach(c=>{c.style.background='white';c.style.color='#64748b';}); const radios = this.parentElement.parentElement.previousElementSibling.querySelectorAll('input[type=radio]'); radios.forEach(r=>{ if(r.value==this.value){ r.checked=true; r.nextElementSibling.style.background='#2563eb'; r.nextElementSibling.style.color='white'; } })" style="width:60px; padding:6px; border:1px solid #cbd5e1; border-radius:6px; text-align:center; font-weight:bold; font-size:1rem; color:#0f172a;">
                             <span style="font-size:1rem; color:#64748b; font-weight:bold;">/ ${max}</span>
                         </div>
                    </div>
                </div>`;
            }

        } else {
            // SOLO LECTURA (Empleado viendo su respuesta evaluada)
            if(isListMatch && Array.isArray(rawRespuesta)) { contentHtml = rawRespuesta.map((r, i) => `<div style="background:#f1f5f9; padding:5px 10px; border-radius:6px; margin-bottom:4px; font-size:0.95rem;">${i+1}. ${r}</div>`).join(""); }
            else if (isRange) contentHtml = `<div style="font-size:1.5rem; font-weight:bold; color:#2563eb; text-align:center;">${rawRespuesta}</div>`;
            else if (Array.isArray(rawRespuesta)) contentHtml = rawRespuesta.join(", ");
            else contentHtml = rawRespuesta || "(Sin respuesta)";
            
            if (contentHtml) contentHtml = `<div style="background:#f8fafc; padding:15px; border-radius:8px; color:#334155; font-size:1rem; border:1px solid #cbd5e1;">${contentHtml}</div>`;
        }

        // Borde dinámico según si es correcto/incorrecto
        let cardBorderColor = '#e2e8f0';
        if (resultBadge.includes('INCORRECTO') || (resultBadge.includes('Aciertos') && !resultBadge.includes('dcfce7'))) {
            cardBorderColor = '#fecaca';
        } else if (resultBadge.includes('CORRECTO') || resultBadge.includes('dcfce7')) {
            cardBorderColor = '#bbf7d0';
        }

        container.insertAdjacentHTML('beforeend', `<div style="margin-bottom:30px; background:white; padding:25px; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid ${cardBorderColor};"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;"><label style="font-weight:700; color:#1e293b; font-size:1.1rem; line-height:1.4; flex:1;">${index+1}. ${q.question_text}</label>${resultBadge}</div>${contentHtml}</div>`);
    });
    setTimeout(() => {
        document.querySelectorAll('.admin-edit-answer[data-type="text"], .auto-resize-text').forEach(ta => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        });
    }, 150);
};

// Funciones Helper para agregar y recalcular en List Match Dinámico
window.addAdminListInputAdvanced = (qid) => {
    const container = document.getElementById(`admin-edit-list-${qid}`);
    const idx = container.children.length;
    window.gradesTemp[qid].items.push({ text: '', status: 'pending' });
    
    const div = document.createElement('div');
    div.className = "list-item-row";
    div.style.cssText = "display:flex; gap:8px; align-items:center;";
    div.innerHTML = `
        <textarea class="admin-edit-list-item-${qid} auto-resize-text" oninput="window.gradesTemp['${qid}'].items[${idx}].text = this.value; this.style.height='auto'; this.style.height=this.scrollHeight+'px';" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem; resize:none; overflow-y:hidden; min-height:38px; font-family:inherit; line-height:1.4;"></textarea>
        <div style="display:flex; background:#f1f5f9; padding:4px; border-radius:6px; gap:4px; border:1px solid #e2e8f0;">
            <button id="btn-ok-${qid}-${idx}" onclick="setItemGrade('${qid}', ${idx}, 'correct', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; opacity:0.4; filter:grayscale(1);" title="Marcar Correcto">✅</button>
            <button id="btn-bad-${qid}-${idx}" onclick="setItemGrade('${qid}', ${idx}, 'incorrect', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; opacity:0.4; filter:grayscale(1);" title="Marcar Incorrecto">❌</button>
        </div>
        <button onclick="this.closest('.list-item-row').remove(); window.recalcListMatch('${qid}');" style="display:flex; color:#ef4444; border:none; background:#fee2e2; width:28px; height:28px; border-radius:6px; cursor:pointer; font-weight:bold; align-items:center; justify-content:center;" title="Eliminar ítem">✕</button>
    `;
    container.appendChild(div);
};

window.recalcListMatch = (qid) => {
    const container = document.getElementById(`admin-edit-list-${qid}`);
    const newItems = [];
    container.querySelectorAll('.list-item-row').forEach((row, newIdx) => {
         const inp = row.querySelector(`textarea.auto-resize-text`) || row.querySelector(`input[type="text"]`);
         const text = inp ? inp.value : '';
         
         const btnOk = row.querySelector(`button[id^="btn-ok-"]`);
         let status = 'pending';
         if(btnOk && btnOk.style.opacity === '1') status = 'correct';
         else {
             const btnBad = row.querySelector(`button[id^="btn-bad-"]`);
             if(btnBad && btnBad.style.opacity === '1') status = 'incorrect';
         }
         
         newItems.push({ text, status });
         
         inp.setAttribute('oninput', `window.gradesTemp['${qid}'].items[${newIdx}].text = this.value`);
         if(btnOk) {
             btnOk.id = `btn-ok-${qid}-${newIdx}`;
             btnOk.setAttribute('onclick', `setItemGrade('${qid}', ${newIdx}, 'correct', this)`);
         }
         const btnBad = row.querySelector(`button[id^="btn-bad-"]`);
         if(btnBad) {
             btnBad.id = `btn-bad-${qid}-${newIdx}`;
             btnBad.setAttribute('onclick', `setItemGrade('${qid}', ${newIdx}, 'incorrect', this)`);
         }
    });
    
    window.gradesTemp[qid].items = newItems;
    
    const aciertos = newItems.filter(i => i.status === 'correct').length;
    const badge = document.getElementById(`badge-${qid}`);
    if(badge) {
        const total = parseInt(badge.dataset.total || newItems.length);
        let color = '#64748b', bg = '#f1f5f9';
        if(total > 0 && aciertos === total) { color='#166534'; bg='#dcfce7'; }
        else if(aciertos > 0) { color='#b45309'; bg='#fef3c7'; }
        badge.style.background = bg;
        badge.style.color = color;
        badge.innerText = `${aciertos}/${total} Aciertos`;
    }
};

// --- LOGICA DE CALIFICACIÓN (ADMIN) ---

window.updateBadgeVisual = (qid, val, max, pct) => {
    const badge = document.getElementById(`badge-${qid}`);
    if(badge) {
        let color = '#166534', bg = '#dcfce7';
        if(pct < 80) { color = '#b45309'; bg = '#fef3c7'; }
        if(pct < 60) { color = '#991b1b'; bg = '#fee2e2'; }
        
        badge.style.background = bg;
        badge.style.color = color;
        badge.innerText = `${val}/${max} (${Math.round(pct)}%)`;
        
        const card = badge.closest('div[style*="border-radius:16px"]');
        if(card) {
            let borderColor = '#bbf7d0';
            if(pct < 60) borderColor = '#fecaca';
            card.style.borderColor = borderColor;
        }
    }
}

window.syncGradeWithAnswer = (qid, val, max) => {
    const numericVal = parseFloat(val);
    if(isNaN(numericVal)) return;

    const pct = (numericVal / max) * 100;
    
    window.gradesTemp[qid] = {
        type: 'numeric_score',
        value: numericVal,
        max: max,
        percentage: Math.round(pct * 100) / 100
    };

    window.updateBadgeVisual(qid, numericVal, max, pct);

    const gradeInput = document.getElementById(`grade-input-${qid}`);
    if(gradeInput) gradeInput.value = numericVal;
};

window.updateNumericGrade = (questionId, newVal, max) => {
    const val = parseFloat(newVal);
    if(isNaN(val)) return;
    
    const pct = (val / max) * 100;
    
    window.gradesTemp[questionId] = {
        type: 'numeric_score',
        value: val,
        max: max,
        percentage: Math.round(pct * 100) / 100
    };

    window.updateBadgeVisual(questionId, val, max, pct);
};

window.setGrade = (questionId, status, btn) => {
    window.gradesTemp[questionId] = { status: status, type: 'standard' };
    
    const container = btn.closest('div');
    container.querySelectorAll('.grade-btn').forEach(b => {
        b.style.background = 'white';
        if(b.classList.contains('selected-correct')) b.style.color = '#22c55e';
        else b.style.color = '#ef4444';
    });
    
    btn.style.background = status === 'correct' ? '#22c55e' : '#ef4444';
    btn.style.color = 'white';
    
    const badge = document.getElementById(`badge-${questionId}`);
    if(badge) {
        badge.style.background = status === 'correct' ? '#dcfce7' : '#fee2e2';
        badge.style.color = status === 'correct' ? '#166534' : '#991b1b';
        badge.innerText = status === 'correct' ? 'CORRECTO' : 'INCORRECTO';
        badge.closest('.incident-card, div[style*="border-radius:16px"]').style.borderColor = status === 'correct' ? '#bbf7d0' : '#fecaca';
    }
};

window.setItemGrade = (questionId, itemIndex, status, btn) => {
    if (!window.gradesTemp[questionId] || window.gradesTemp[questionId].type !== 'list_match') { return; }
    
    window.gradesTemp[questionId].items[itemIndex].status = status;
    
    const row = btn.closest('div');
    row.querySelectorAll('button[id^="btn-ok-"], button[id^="btn-bad-"]').forEach(b => { 
        b.style.opacity = '0.4'; 
        b.style.filter = 'grayscale(1)'; 
        b.style.transform = 'scale(1)'; 
    });
    btn.style.opacity = '1';
    btn.style.filter = 'grayscale(0)';
    btn.style.transform = 'scale(1.1)';

    const items = window.gradesTemp[questionId].items;
    const aciertos = items.filter(i => i.status === 'correct').length;
    const badge = document.getElementById(`badge-${questionId}`);
    if(badge) {
        const total = parseInt(badge.dataset.total || items.length);
        let color = '#64748b', bg = '#f1f5f9';
        if(total > 0 && aciertos === total) { color='#166534'; bg='#dcfce7'; }
        else if(aciertos > 0) { color='#b45309'; bg='#fef3c7'; }
        badge.style.background = bg;
        badge.style.color = color;
        badge.innerText = `${aciertos}/${total} Aciertos`;
    }
};

window.guardarCalificacionAdmin = async () => {
    const btn = document.getElementById('btn-save-grades');
    if(btn) { btn.disabled = true; btn.innerText = "Guardando..."; }
    
    try {
        const responseId = window.gradingResponseId;

        // El enunciado se copia dentro de la calificación. La llave de
        // grades_json es el id de la pregunta, así que si mañana se edita el
        // texto —o se borra la pregunta— esta respuesta seguiría sin poder
        // decir qué se preguntó. Con la copia, se lee sola.
        (window.preguntasCacheActual || []).forEach(q => {
            const g = window.gradesTemp[q.id];
            if (g && typeof g === 'object' && q.question_text) g.question = q.question_text;
        });

        const updates = {
            grades_json: window.gradesTemp,
            review_status: 'Revisado'
        };
        
        if (window.modoAdminActivo) {
                    const newAnswers = { ...window.respuestasTempAdmin };
                    document.querySelectorAll('.admin-edit-answer').forEach(el => { newAnswers[el.dataset.qid] = el.value; });
                    document.querySelectorAll('.admin-edit-answer-check-group').forEach(group => {
                        newAnswers[group.dataset.qid] = Array.from(group.querySelectorAll(`input[type="checkbox"]:checked`)).map(c => c.value);
                    });
                    document.querySelectorAll('div[id^="admin-edit-list-"]').forEach(listDiv => {
                        const items = [];
                        listDiv.querySelectorAll('textarea, input[type="text"]').forEach(inp => { if(inp.value.trim()) items.push(inp.value.trim()); });
                        newAnswers[listDiv.id.replace('admin-edit-list-', '')] = items;
                    });
                    document.querySelectorAll('.admin-edit-answer-range-group').forEach(group => {
                        const checked = group.querySelector(`input[type="radio"]:checked`);
                        if(checked) newAnswers[group.dataset.qid] = checked.value;
                    });

                    const dateInput = document.getElementById('admin-edit-date');
                    if(dateInput && dateInput.value) { updates.submitted_at = new Date(dateInput.value).toISOString(); }
                    
                    // NUEVO: Capturar el área editada si existe
                    const areaInput = document.getElementById('admin-edit-area');
                    if(areaInput) { updates.employee_area = areaInput.value.trim() || 'Sin Área'; }

                    updates.answers_json = newAnswers;
                }

        const { error } = await sb.from('evaluation_responses').update(updates).eq('id', responseId);
        if(error) throw error;
        
        // 🚀 NUEVO: Actualizar la memoria local para que la UI se refresque instantáneamente
        if (window.respuestasCacheActual) {
            // CORRECCIÓN: Usar String()
            const idx = window.respuestasCacheActual.findIndex(r => String(r.id) === String(responseId));
            if (idx !== -1) {
                window.respuestasCacheActual[idx] = { ...window.respuestasCacheActual[idx], ...updates };
            }
        }
        
        if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();
        
        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        if (user && window.calcularPendientesBatch) await window.calcularPendientesBatch([user.id]);

        alert("Calificación guardada correctamente.");
        window.evalCache = null;

        if (window.mostrandoPendientes === true || window.mostrandoPendientesEquipo === true) {
            document.getElementById('modal-responder-eval').style.display = 'none';
            document.body.style.overflow = '';
            window.targetUserForEval = null;
            
            const modoActual = window.mostrandoPendientesEquipo ? 'EQUIPO' : 'PROPIOS';
            setTimeout(() => {
                if (window.cargarVistaPendientes) window.cargarVistaPendientes(modoActual);
            }, 300);
            
        } else {
            // 🚀 NUEVO: Solo cerramos el modal y redibujamos la lista local actualizada
            document.getElementById('modal-responder-eval').style.display = 'none';
            document.body.style.overflow = '';
            if (window.renderizarListaRespuestas) window.renderizarListaRespuestas();
            if (window.renderizarCronologia) window.renderizarCronologia();
        }
        
    } catch (e) {
        alert("Error al guardar: " + e.message);
    } finally {
        if(btn) { btn.disabled = false; btn.innerText = "Guardar Revisión"; }
    }
};

window.borrarRespuestaIndividual = async (id) => {
    if(!confirm("¿Eliminar esta respuesta permanentemente?")) return;
    try {
        const { error } = await sb.from('evaluation_responses').delete().eq('id', id);
        if(error) throw error;
        alert("Respuesta eliminada");
        
        // 🚀 CORRECCIÓN: Usar String() para asegurar la coincidencia de tipos
        if (window.respuestasCacheActual) {
            window.respuestasCacheActual = window.respuestasCacheActual.filter(r => String(r.id) !== String(id));
        }

        if (window.mostrandoPendientes === true || window.mostrandoPendientesEquipo === true) {
             document.getElementById('modal-responder-eval').style.display = 'none';
             document.body.style.overflow = '';
             window.targetUserForEval = null;
             
             const modoActual = window.mostrandoPendientesEquipo ? 'EQUIPO' : 'PROPIOS';
             setTimeout(() => {
                 if (window.cargarVistaPendientes) window.cargarVistaPendientes(modoActual);
             }, 300);
             
        } else {
            window.evalCache = null;
            document.getElementById('modal-responder-eval').style.display = 'none';
            document.body.style.overflow = '';
            if (window.renderizarListaRespuestas) window.renderizarListaRespuestas();
            if (window.renderizarCronologia) window.renderizarCronologia();
        }
    } catch (e) { alert(e.message); }
};

window.cambiarEstadoRespuesta = async (id, nuevoEstado) => {
    let msg = "";
    if (nuevoEstado === 'Falsa') {
        msg = "¿Estás seguro de anular esta respuesta por datos falsos? Se conservará como evidencia pero no sumará a las estadísticas.";
    } else if (nuevoEstado === 'Certificada') {
        msg = "¿Quieres certificar esta respuesta? Esto indicará visualmente que ha sido auditada y es legítima.";
    } else if (nuevoEstado === 'Mal Revisada') {
        msg = "¿Marcar como 'Mal Revisada'? Esto indicará que el supervisor no calificó correctamente. La evaluación regresará a la bandeja de pendientes del supervisor.";
    } else {
        msg = `¿Cambiar el estado de esta evaluación a ${nuevoEstado}?`;
    }
        
    if(!confirm(msg)) return;
    
    try {
        const { error } = await sb.from('evaluation_responses')
            .update({ review_status: nuevoEstado })
            .eq('id', id);
            
        if(error) throw error;
        
        // 🚀 NUEVO: Actualizar la memoria local para vista instantánea
        if (window.respuestasCacheActual) {
            // CORRECCIÓN: Usar String()
            const idx = window.respuestasCacheActual.findIndex(r => String(r.id) === String(id));
            if (idx !== -1) {
                window.respuestasCacheActual[idx].review_status = nuevoEstado;
            }
        }
        
        alert(`La respuesta ha sido marcada como ${nuevoEstado}.`);
        
        window.evalCache = null; 
        if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        // 🚀 NUEVO: Solo cerramos el modal y redibujamos
        document.getElementById('modal-responder-eval').style.display = 'none';
        document.body.style.overflow = '';
        if (window.renderizarListaRespuestas) window.renderizarListaRespuestas();
        if (window.renderizarCronologia) window.renderizarCronologia();
        // Si el cambio salió de una ficha abierta desde el expediente por
        // empleado, hay que repintar esa pantalla y no la lista de la evaluación.
        if (window.expedienteActual && window.renderizarExpedienteEmpleado) window.renderizarExpedienteEmpleado();

    } catch (e) {
        alert("Ocurrió un error al cambiar el estado: " + e.message);
    }
};
window.cambiarEstadoFalso = window.cambiarEstadoRespuesta; // Compatibilidad

// --- 2B. EXPEDIENTE POR EMPLEADO (REVISIÓN EN LOTE) ---
// Acceso rápido del administrador: busca a una persona y trabaja todas sus
// respuestas de una sola vez, en lugar de entrar evaluación por evaluación.

window.expedienteActual = null;

// Reglas de qué estado admite cada respuesta. Son exactamente las mismas que
// ofrece la ficha individual, para que el lote no pueda hacer nada que no se
// pudiera hacer una por una.
window.motivoNoAplicable = (resp, nuevoEstado) => {
    const estado = resp.review_status;
    if (nuevoEstado === 'Certificada') {
        if (estado === 'Certificada') return 'ya está certificada';
        if (window.calcularScoreRespuesta(resp) < 80) return 'califica por debajo de 80%';
        return null;
    }
    if (nuevoEstado === 'Mal Revisada') return estado === 'Mal Revisada' ? 'ya está marcada así' : null;
    if (nuevoEstado === 'Falsa') return estado === 'Falsa' ? 'ya está anulada' : null;
    if (nuevoEstado === 'Revisado') {
        return ['Falsa', 'Certificada', 'Mal Revisada'].includes(estado) ? null : 'no está anulada ni certificada';
    }
    return 'estado desconocido';
};

window.abrirRevisionPorEmpleado = async () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return;

    // El expediente cruza a todos los empleados, así que es solo para admin.
    if (!window.modoAdminActivo) {
        alert("Esta vista está reservada para el modo administrador.");
        return;
    }

    container.scrollTop = 0;
    container.style.display = 'block';

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    // No se consulta nada todavía: solo se traen las respuestas de la gente que
    // el administrador realmente busque.
    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.expedienteActual=null; window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Volver a la lista">←</button>
            <div>
                <h2 style="margin:0; font-size:1.2rem; color:#0d9488;">🔎 Revisión por Empleado</h2>
                <div style="font-size:0.85rem; color:#64748b;">Busca a una persona y resuelve todas sus evaluaciones juntas</div>
            </div>
        </div>

        <input type="text" id="buscador-empleado-revision" placeholder="🔍 Nombre, puesto o departamento..." oninput="window.programarBusquedaEmpleado()"
               style="width:100%; box-sizing:border-box; padding:12px 14px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; margin-bottom:15px;">

        <div id="lista-empleados-revision"></div>
    `;

    window.buscarEmpleadosRevision();
    const buscador = document.getElementById('buscador-empleado-revision');
    if (buscador) buscador.focus();
};

// La búsqueda espera a que el administrador deje de teclear para no lanzar una
// consulta por cada letra.
window.programarBusquedaEmpleado = () => {
    clearTimeout(window.temporizadorBusquedaEmpleado);
    window.temporizadorBusquedaEmpleado = setTimeout(() => window.buscarEmpleadosRevision(), 300);
};

window.buscarEmpleadosRevision = async () => {
    const lista = document.getElementById('lista-empleados-revision');
    if (!lista) return;

    const input = document.getElementById('buscador-empleado-revision');
    const termino = input ? input.value.toLowerCase().trim() : '';

    const aviso = (texto) => { lista.innerHTML = `<div style="padding:30px; text-align:center; color:#94a3b8;">${texto}</div>`; };

    if (termino.length < 2) {
        aviso('Escribe al menos dos letras para buscar a un empleado.');
        return;
    }

    const coincidencias = (window.todosLosEmpleadosData || []).filter(e =>
        (e.name || '').toLowerCase().includes(termino) ||
        (e.puesto || '').toLowerCase().includes(termino) ||
        (e.dept || '').toLowerCase().includes(termino)
    );

    if (coincidencias.length === 0) {
        aviso('Ningún empleado coincide con la búsqueda.');
        return;
    }

    const recortadas = coincidencias.slice(0, 25);
    const sobran = coincidencias.length - recortadas.length;

    // Si el administrador siguió tecleando, esta respuesta ya no interesa.
    const token = (window.tokenBusquedaEmpleado || 0) + 1;
    window.tokenBusquedaEmpleado = token;

    lista.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Buscando sus respuestas...</div>';

    const { data: resumen } = await sb.from('evaluation_responses')
        .select('employee_id, review_status')
        .in('employee_id', recortadas.map(e => String(e.id)));

    if (window.tokenBusquedaEmpleado !== token) return;

    const conteos = {};
    (resumen || []).forEach(r => {
        const id = String(r.employee_id);
        if (!conteos[id]) conteos[id] = { total: 0, calificadas: 0, sinCalificar: 0 };
        conteos[id].total++;
        if (r.review_status === 'Revisado') conteos[id].calificadas++;
        else if (!['Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status)) conteos[id].sinCalificar++;
    });

    const conRespuestas = recortadas.filter(e => (conteos[String(e.id)] || {}).total);

    if (conRespuestas.length === 0) {
        aviso('Esos empleados todavía no tienen respuestas registradas.');
        return;
    }

    // Primero quien tiene trabajo esperando al administrador.
    conRespuestas.sort((a, b) => {
        const ca = conteos[String(a.id)], cb = conteos[String(b.id)];
        if (cb.calificadas !== ca.calificadas) return cb.calificadas - ca.calificadas;
        return (a.name || '').localeCompare(b.name || '');
    });

    lista.innerHTML = conRespuestas.map(e => {
        const c = conteos[String(e.id)];
        const inactivo = e.isActive === false ? ` <span style="background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:6px; font-size:0.7rem; margin-left:6px;">Inactivo</span>` : '';
        const chipCalificadas = c.calificadas > 0 ? `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:700;">${c.calificadas} calificada${c.calificadas === 1 ? '' : 's'}</span>` : '';
        const chipSinCalificar = c.sinCalificar > 0 ? `<span style="background:#fff7ed; color:#c2410c; padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:700;">${c.sinCalificar} sin calificar</span>` : '';

        return `
        <div class="incident-card" style="border-left:5px solid #0d9488; padding:14px; cursor:pointer; margin-bottom:10px;" onclick="window.abrirExpedienteEmpleado('${e.id}')">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="min-width:0;">
                    <div style="color:#0f172a; font-weight:700; font-size:1rem;">${e.name}${inactivo}</div>
                    <div style="color:#64748b; font-size:0.8rem; margin-top:2px;">${e.puesto || 'Sin puesto'} · ${e.dept || 'General'}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                        <span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:700;">${c.total} en total</span>
                        ${chipCalificadas}
                        ${chipSinCalificar}
                    </div>
                </div>
                <div style="color:#64748b; font-size:1.2rem; flex-shrink:0;">👉</div>
            </div>
        </div>`;
    }).join('') + (sobran > 0 ? `<div style="padding:12px; text-align:center; color:#94a3b8; font-size:0.85rem;">Hay ${sobran} coincidencia(s) más. Afina la búsqueda para verlas.</div>` : '');
};

window.abrirExpedienteEmpleado = async (empId) => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return;

    container.scrollTop = 0;
    container.innerHTML = '<div style="padding:40px; text-align:center;"><div class="spinner" style="margin: 0 auto 15px auto;"></div>Abriendo expediente...</div>';

    const empleado = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(empId));

    const { data: respuestas } = await sb.from('evaluation_responses')
        .select('*')
        .eq('employee_id', empId)
        .order('submitted_at', { ascending: false });

    // Título y clasificación se consultan aquí porque evalCache se invalida cada
    // vez que cambia un estado, y sin ellos las filas quedarían sin nombre.
    // `frequency` y `active` los pide la certificación por clasificación, que
    // necesita saber en qué periodo cae cada encuesta y cuáles ya no cuentan;
    // los de destinatarios, para no contarle a esta persona encuestas que no
    // van dirigidas a su puesto ni a su departamento.
    const { data: evaluaciones } = await sb.from('evaluations')
        .select('id, title, category, frequency, active, mode, is_obligatory, target_employees, target_positions, target_departments');
    const titulos = {};
    (evaluaciones || []).forEach(ev => {
        titulos[String(ev.id)] = { title: ev.title, category: (ev.category || 'General') };
    });

    window.expedienteActual = {
        empleado: empleado || { id: empId, name: (window.employeeNameMap || {})[empId] || `ID: ${empId}` },
        respuestas: respuestas || [],
        titulos: titulos,
        evaluaciones: evaluaciones || [],
        seleccion: []
    };
    // La ficha individual y cambiarEstadoRespuesta trabajan sobre esta caché.
    window.respuestasCacheActual = window.expedienteActual.respuestas;

    window.renderizarExpedienteEmpleado();
};

window.alternarSeleccionRespuesta = (id) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    const i = exp.seleccion.indexOf(id);
    if (i === -1) exp.seleccion.push(id); else exp.seleccion.splice(i, 1);
    window.renderizarExpedienteEmpleado();
};

window.seleccionarGrupoRespuestas = (ids, marcar) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    const lista = String(ids).split(',').filter(Boolean);
    lista.forEach(id => {
        const i = exp.seleccion.indexOf(id);
        if (marcar && i === -1) exp.seleccion.push(id);
        if (!marcar && i !== -1) exp.seleccion.splice(i, 1);
    });
    window.renderizarExpedienteEmpleado();
};

window.limpiarSeleccionExpediente = () => {
    if (!window.expedienteActual) return;
    window.expedienteActual.seleccion = [];
    window.renderizarExpedienteEmpleado();
};

window.verDetalleDesdeExpediente = (id) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    const resp = exp.respuestas.find(r => String(r.id) === String(id));
    if (resp) window.verDetalleRespuesta(resp);
};

window.renderizarExpedienteEmpleado = () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    const exp = window.expedienteActual;
    if (!container || !exp) return;

    const { empleado, respuestas, titulos, seleccion } = exp;

    // Solo se puede certificar a partir de 80%, así que las calificadas por
    // debajo van en su propio bloque en vez de mezclarse con las que sí aplican.
    const grupos = [
        { clave: 'porCertificar', titulo: '⭐ Listas para certificar', color: '#166534', fondo: '#dcfce7',
          filtro: r => r.review_status === 'Revisado' && window.calcularScoreRespuesta(r) >= 80 },
        { clave: 'bajoUmbral', titulo: '📉 Calificadas por debajo de 80%', color: '#b45309', fondo: '#fef3c7',
          nota: 'No se pueden certificar mientras no suban de 80%.',
          filtro: r => r.review_status === 'Revisado' && window.calcularScoreRespuesta(r) < 80 },
        { clave: 'sinCalificar', titulo: '⏳ Sin calificar todavía', color: '#c2410c', fondo: '#fff7ed',
          filtro: r => !['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status) },
        { clave: 'certificadas', titulo: '✅ Certificadas', color: '#1d4ed8', fondo: '#eff6ff',
          filtro: r => r.review_status === 'Certificada' },
        { clave: 'rechazadas', titulo: '🚫 Rechazadas o anuladas', color: '#7e22ce', fondo: '#faf5ff',
          filtro: r => r.review_status === 'Mal Revisada' || r.review_status === 'Falsa' }
    ];

    const datosEval = (r) => titulos[String(r.evaluation_id)] || { title: 'Evaluación', category: 'General' };

    const filaHtml = (r) => {
        const marcada = seleccion.includes(String(r.id));
        const fecha = new Date(r.submitted_at).toLocaleDateString();
        const titulo = datosEval(r).title;
        const calificada = ['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status);
        const score = calificada ? window.calcularScoreRespuesta(r) : null;
        const colorScore = score === null ? '#94a3b8' : (score >= 80 ? '#166534' : (score >= 60 ? '#b45309' : '#991b1b'));
        const fondoScore = score === null ? '#f1f5f9' : (score >= 80 ? '#dcfce7' : (score >= 60 ? '#fef3c7' : '#fee2e2'));
        const badgeScore = score === null ? '' : `<span style="color:${colorScore}; background:${fondoScore}; padding:2px 8px; border-radius:8px; font-size:0.8rem; font-weight:700;">${score}%</span>`;

        return `
        <div style="display:flex; align-items:center; gap:10px; background:${marcada ? '#f0fdfa' : 'white'}; border:1px solid ${marcada ? '#5eead4' : '#e2e8f0'}; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
            <input type="checkbox" ${marcada ? 'checked' : ''} onclick="event.stopPropagation(); window.alternarSeleccionRespuesta('${r.id}')"
                   style="width:20px; height:20px; flex-shrink:0; accent-color:#0d9488; cursor:pointer;">
            <div style="flex:1; min-width:0; cursor:pointer;" onclick="window.verDetalleDesdeExpediente('${r.id}')">
                <div style="color:#0f172a; font-weight:600; font-size:0.92rem;">${titulo}</div>
                <div style="color:#64748b; font-size:0.78rem; margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span>${fecha}</span> ${badgeScore}
                </div>
            </div>
            <button onclick="window.verDetalleDesdeExpediente('${r.id}')" style="flex-shrink:0; background:#f1f5f9; border:none; color:#475569; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">Abrir</button>
        </div>`;
    };

    const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const botonSeleccion = (ids, color, textoMarcar, textoQuitar) => {
        const todasMarcadas = ids.every(id => seleccion.includes(id));
        return `<button onclick="window.seleccionarGrupoRespuestas('${ids.join(',')}', ${todasMarcadas ? 'false' : 'true'})"
                        style="background:white; border:1px solid ${color}; color:${color}; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; flex-shrink:0;">
                    ${todasMarcadas ? textoQuitar : textoMarcar}
                </button>`;
    };

    let cuerpo = '';
    grupos.forEach(g => {
        const filas = respuestas.filter(g.filtro);
        if (filas.length === 0) return;

        const ids = filas.map(r => String(r.id));

        // Dentro de cada estado, las evaluaciones se separan por clasificación.
        const porClasificacion = {};
        filas.forEach(r => {
            const cat = datosEval(r).category;
            if (!porClasificacion[cat]) porClasificacion[cat] = [];
            porClasificacion[cat].push(r);
        });

        const clasificaciones = Object.keys(porClasificacion).sort((a, b) => a.localeCompare(b));

        const bloques = clasificaciones.map(cat => {
            const deLaCat = porClasificacion[cat];
            const idsCat = deLaCat.map(r => String(r.id));

            // El atajo de certificar la clasificación entera sólo tiene sentido
            // en el bloque de las que están listas: es ahí donde el
            // administrador ve que ya se puede dar fe de todas.
            const btnCertificar = g.clave === 'porCertificar'
                ? `<button onclick="window.certificarClasificacionExpediente('${escapar(cat).replace(/'/g, "\\'")}')"
                           style="background:#eff6ff; border:1px solid #3b82f6; color:#1d4ed8; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; flex-shrink:0;"
                           title="Certificar de una vez todo lo certificable de esta clasificación en el periodo vigente">⭐ Certificar clasificación</button>`
                : '';

            return `
            <div class="clasificacion-expediente" data-grupo="${g.clave}" data-clasificacion="${escapar(cat)}" style="margin-top:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:0 4px 6px 4px; border-bottom:1px dashed #e2e8f0; margin-bottom:8px; flex-wrap:wrap;">
                    <span style="color:#475569; font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">${cat} (${deLaCat.length})</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${btnCertificar}
                        ${botonSeleccion(idsCat, g.color, 'Marcar', 'Quitar')}
                    </div>
                </div>
                ${deLaCat.map(filaHtml).join('')}
            </div>`;
        }).join('');

        const notaHtml = g.nota ? `<div style="font-size:0.75rem; color:${g.color}; padding:0 4px; margin-top:-4px;">${g.nota}</div>` : '';
        // El botón del bloque solo aporta cuando hay más de una clasificación.
        const botonBloque = clasificaciones.length > 1 ? botonSeleccion(ids, g.color, 'Marcar bloque', 'Quitar bloque') : '';

        cuerpo += `
        <div style="margin-top:18px;">
            <div class="cabecera-grupo-expediente" data-grupo="${g.clave}" style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:${g.fondo}; color:${g.color}; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem;">
                <span>${g.titulo} (${filas.length})</span>
                ${botonBloque}
            </div>
            ${notaHtml}
            ${bloques}
        </div>`;
    });

    if (respuestas.length === 0) {
        cuerpo = `<div style="padding:40px; text-align:center; color:#94a3b8;">Esta persona no tiene respuestas registradas.</div>`;
    }

    // Barra de acciones: solo aparece con algo seleccionado.
    let barraHtml = '';
    if (seleccion.length > 0) {
        const btn = (estado, texto, fondo, borde, color) =>
            `<button onclick="window.aplicarEstadoEnLote('${estado}')" style="flex:1 1 45%; background:${fondo}; color:${color}; border:1px solid ${borde}; padding:10px 8px; border-radius:10px; font-size:0.82rem; font-weight:700; cursor:pointer;">${texto}</button>`;

        barraHtml = `
        <div style="position:sticky; bottom:0; margin-top:20px; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px; box-shadow:0 -4px 12px rgba(0,0,0,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:700; color:#0f172a; font-size:0.9rem;">${seleccion.length} seleccionada${seleccion.length === 1 ? '' : 's'}</span>
                <button onclick="window.limpiarSeleccionExpediente()" style="background:none; border:none; color:#64748b; font-size:0.8rem; font-weight:700; cursor:pointer; text-decoration:underline;">Limpiar</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${btn('Certificada', '⭐ Certificar', '#eff6ff', '#3b82f6', '#1d4ed8')}
                ${btn('Mal Revisada', '⚠️ Mal revisada', '#f3e8ff', '#a855f7', '#7e22ce')}
                ${btn('Falsa', '🚫 Anular', '#fee2e2', '#ef4444', '#991b1b')}
                ${btn('Revisado', '↩️ Volver a Validada', '#dcfce7', '#22c55e', '#166534')}
            </div>
        </div>`;
    }

    const puesto = empleado.puesto ? `${empleado.puesto} · ${empleado.dept || 'General'}` : '';

    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:16px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.abrirRevisionPorEmpleado()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Volver a la búsqueda">←</button>
            <div style="min-width:0;">
                <h2 style="margin:0; font-size:1.15rem; color:#0d9488;">${empleado.name}</h2>
                <div style="font-size:0.82rem; color:#64748b;">${puesto}${puesto ? ' · ' : ''}${respuestas.length} respuesta${respuestas.length === 1 ? '' : 's'}</div>
            </div>
        </div>
        <div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
            Marca las que quieras y aplica el cambio a todas juntas. Toca el nombre de una evaluación para abrirla completa.
        </div>
        ${cuerpo}
        ${barraHtml}
    `;
};

window.aplicarEstadoEnLote = async (nuevoEstado) => {
    const exp = window.expedienteActual;
    if (!exp || exp.seleccion.length === 0) return;
    if (!window.modoAdminActivo) { alert("Solo el modo administrador puede cambiar el estado de las respuestas."); return; }

    const elegidas = exp.respuestas.filter(r => exp.seleccion.includes(String(r.id)));
    const aplicables = [];
    const descartadas = [];

    elegidas.forEach(r => {
        const motivo = window.motivoNoAplicable(r, nuevoEstado);
        if (motivo) descartadas.push({ resp: r, motivo: motivo });
        else aplicables.push(r);
    });

    if (aplicables.length === 0) {
        alert(`Ninguna de las ${elegidas.length} respuestas seleccionadas puede pasar a "${nuevoEstado}".\n\nMotivo: ${descartadas[0] ? descartadas[0].motivo : 'no aplica'}.`);
        return;
    }

    let msg = `Se van a marcar como "${nuevoEstado}" ${aplicables.length} respuesta(s) de ${exp.empleado.name}.`;
    if (descartadas.length > 0) {
        const detalle = descartadas.slice(0, 5)
            .map(d => `  • ${exp.titulos[String(d.resp.evaluation_id)] || 'Evaluación'}: ${d.motivo}`)
            .join('\n');
        msg += `\n\nSe omitirán ${descartadas.length}:\n${detalle}`;
        if (descartadas.length > 5) msg += `\n  • …y ${descartadas.length - 5} más`;
    }
    if (nuevoEstado === 'Mal Revisada') msg += `\n\nLas marcadas volverán a la bandeja de pendientes del supervisor.`;
    if (nuevoEstado === 'Falsa') msg += `\n\nLas anuladas se conservan como evidencia pero dejan de sumar a las estadísticas.`;
    if (nuevoEstado === 'Revisado') msg += `\n\nQuedarán como calificadas y válidas, sin certificación ni marca de anulada o mal revisada.`;
    msg += `\n\n¿Confirmas?`;

    if (!confirm(msg)) return;

    try {
        const ids = aplicables.map(r => r.id);
        const { error } = await sb.from('evaluation_responses')
            .update({ review_status: nuevoEstado })
            .in('id', ids);

        if (error) throw error;

        aplicables.forEach(r => { r.review_status = nuevoEstado; });
        exp.seleccion = [];

        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        alert(`Listo: ${aplicables.length} respuesta(s) marcada(s) como ${nuevoEstado}.`);
        window.renderizarExpedienteEmpleado();

    } catch (e) {
        alert("Ocurrió un error al aplicar el cambio en lote: " + e.message);
    }
};

// --- 2C. CERTIFICAR UNA CLASIFICACIÓN COMPLETA ---
// Certificar respuesta por respuesta no escala: una clasificación con seis
// encuestas son seis confirmaciones para una sola persona. Esto lo hace de una,
// y de paso deja constancia de quién dio fe y de qué periodo, que antes no
// quedaba en ningún lado.
//
// La verdad sigue estando en la respuesta: esto sella las que cubre a
// 'Certificada', igual que si se hubieran marcado a mano. El acta es lo que se
// añade, y por eso el badge del usuario se sigue calculando de las respuestas y
// no del acta: si mañana se anula una, la clasificación deja de estar
// certificada aunque el acta siga guardada.

// La fila del acta a partir de un resumen ya recalculado.
window.filaDeActa = ({ clasificacion, empleadoId, resumen, cubiertas, nota }) => {
    const periodo = resumen && resumen.periodoFechas;
    if (!periodo) return null;

    const aFecha = (d) => d ? new Date(d).toISOString().slice(0, 10) : null;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogueado') || 'null');

    return {
        clasificacion: window.normalizarClasificacion(clasificacion),
        employee_id: empleadoId,
        periodo_inicio: aFecha(periodo.inicio),
        periodo_fin: aFecha(periodo.fin),
        periodo_nombre: resumen.periodo,
        certificado_por: usuario ? usuario.id : null,
        certificado_en: new Date().toISOString(),
        respuestas_cubiertas: cubiertas,
        nota: nota || null
    };
};

// Guarda las actas. Si la tabla todavía no existe —el script de `sql/` se corre
// a mano— no pasa nada: la certificación ya quedó hecha en las respuestas, que
// es lo que ve todo el mundo. Se avisa por consola y se sigue.
window.registrarActasCertificacion = async (filas) => {
    const utiles = (filas || []).filter(Boolean);
    if (utiles.length === 0) return { guardadas: 0, motivo: 'sin periodo' };

    try {
        // Se encadena `.select()` porque un insert que RLS rechaza responde con
        // éxito y cero filas: sin contar lo que vuelve, la pantalla diría que
        // guardó sin haber guardado.
        const { data, error } = await sb.from('certificaciones_clasificacion')
            .upsert(utiles, { onConflict: 'clasificacion,employee_id,periodo_inicio' })
            .select();

        if (error) throw error;
        const guardadas = (data || []).length;
        return { guardadas, motivo: guardadas ? '' : 'la base no dejó escribir' };
    } catch (e) {
        console.warn('No se pudo guardar el acta de certificación:', e.message);
        return { guardadas: 0, motivo: e.message };
    }
};

window.registrarActaCertificacion = async (datos) => {
    const res = await window.registrarActasCertificacion([window.filaDeActa(datos)]);
    return { guardada: res.guardadas > 0, motivo: res.motivo };
};

// Certifica de una vez todo lo certificable de una clasificación para la
// persona del expediente abierto.
window.certificarClasificacionExpediente = async (clasificacion) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    if (!window.modoAdminActivo) { alert("Solo el modo administrador puede certificar."); return; }

    const clave = window.normalizarClasificacion(clasificacion);
    // Sólo las de esta clasificación **que le tocan a esta persona**: sin lo
    // segundo, una encuesta dirigida a otro puesto engordaba el total y el
    // aviso decía que quedaba una sin contestar que nunca le tocó.
    const encuestasDeLaCat = (exp.evaluaciones || [])
        .filter(ev => window.normalizarClasificacion(ev.category || 'General') === clave)
        .filter(ev => window.leTocaEstaEncuesta(ev, exp.empleado, window.tieneEquipoDirecto(exp.empleado.id)));

    const resumen = window.estadoCertificacion(encuestasDeLaCat, exp.respuestas);
    const E = window.ESTADOS_CERTIFICACION;

    if (resumen.estado === E.CERTIFICADA) {
        alert(`«${clasificacion}» ya está certificada por completo en ${resumen.periodo}.`);
        return;
    }
    if (resumen.certificables.length === 0) {
        alert(`No hay nada que certificar en «${clasificacion}» (${resumen.periodo}).\n\n`
            + `De ${resumen.total} encuesta(s): ${resumen.certificadas} ya certificada(s), `
            + `${resumen.sinContestar} sin contestar, ${resumen.sinCalificar} sin calificar, `
            + `${resumen.bajoUmbral} por debajo de ${window.UMBRAL_CERTIFICACION}% y `
            + `${resumen.observadas} observada(s).`);
        return;
    }

    // Certificar una clasificación no puede hacer nada que no se pudiera hacer
    // respuesta por respuesta, así que lo que no aplique se queda fuera y se
    // dice cuánto y por qué.
    const pendientesDeCubrir = resumen.total - resumen.certificadas - resumen.certificables.length;

    let msg = `Se van a certificar ${resumen.certificables.length} respuesta(s) de `
        + `${exp.empleado.name} en «${clasificacion}» (${resumen.periodo}).`;
    if (pendientesDeCubrir > 0) {
        msg += `\n\nQuedarán ${pendientesDeCubrir} sin cubrir:`;
        if (resumen.sinContestar) msg += `\n  • ${resumen.sinContestar} sin contestar`;
        if (resumen.sinCalificar) msg += `\n  • ${resumen.sinCalificar} sin calificar`;
        if (resumen.bajoUmbral) msg += `\n  • ${resumen.bajoUmbral} por debajo de ${window.UMBRAL_CERTIFICACION}%`;
        if (resumen.observadas) msg += `\n  • ${resumen.observadas} anulada(s) o mal revisada(s)`;
        msg += `\n\nLa clasificación no quedará certificada mientras falten.`;
    }
    msg += `\n\n¿Confirmas?`;

    if (!confirm(msg)) return;

    try {
        // El `.select()` no es opcional: un update que RLS rechaza responde con
        // éxito y cero filas.
        const { data, error } = await sb.from('evaluation_responses')
            .update({ review_status: 'Certificada' })
            .in('id', resumen.certificables)
            .select('id');

        if (error) throw error;

        const selladas = (data || []).length;
        if (selladas === 0) {
            alert("No se certificó ninguna respuesta: la base rechazó la escritura.");
            return;
        }

        const idsSellados = new Set((data || []).map(r => String(r.id)));
        exp.respuestas.forEach(r => {
            if (idsSellados.has(String(r.id))) r.review_status = 'Certificada';
        });

        // El acta se guarda con el estado ya recalculado, para que refleje lo
        // que de verdad quedó cubierto.
        const despues = window.estadoCertificacion(encuestasDeLaCat, exp.respuestas);
        const acta = await window.registrarActaCertificacion({
            clasificacion: clasificacion,
            empleadoId: exp.empleado.id,
            resumen: despues,
            cubiertas: despues.certificadas
        });

        exp.seleccion = [];
        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        let aviso = `Listo: ${selladas} respuesta(s) certificada(s) en «${clasificacion}».`;
        if (despues.estado === window.ESTADOS_CERTIFICACION.CERTIFICADA) {
            aviso += `\n\nLa clasificación queda certificada para ${exp.empleado.name} en ${despues.periodo}.`;
        }
        if (!acta.guardada) {
            aviso += `\n\n(No se pudo dejar constancia del acta: ${acta.motivo}. Las respuestas sí quedaron certificadas.)`;
        }
        alert(aviso);

        window.renderizarExpedienteEmpleado();

    } catch (e) {
        alert("Ocurrió un error al certificar la clasificación: " + e.message);
    }
};

// --- 2D. CERTIFICAR UNA CLASIFICACIÓN A VARIAS PERSONAS ---
// La transpuesta del expediente: en vez de una persona y todas sus
// clasificaciones, una clasificación y toda la gente a la que le toca. Es lo
// que quita el «uno por uno» cuando son cuarenta personas.

window.certificacionActual = null;

window.abrirCertificacionPorClasificacion = async () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return;

    if (!window.modoAdminActivo) {
        alert("Esta vista está reservada para el modo administrador.");
        return;
    }

    container.scrollTop = 0;
    container.style.display = 'block';
    container.innerHTML = '<div style="padding:40px; text-align:center;"><div class="spinner" style="margin: 0 auto 15px auto;"></div>Cargando clasificaciones...</div>';

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    const { data: evaluaciones, error } = await sb.from('evaluations')
        .select('id, title, category, frequency, active, mode, is_obligatory, target_employees, target_positions, target_departments');

    if (error) {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;">No se pudieron cargar las encuestas: ${error.message}</div>`;
        return;
    }

    // Sólo las encendidas: una apagada no le aparece a nadie, así que tampoco
    // hay nada que certificarle.
    const activas = (evaluaciones || []).filter(window.encuestaActiva);
    const clasificaciones = Array.from(new Set(activas.map(ev => ev.category || 'General')))
        .sort((a, b) => a.localeCompare(b));

    window.certificacionActual = {
        evaluaciones: activas,
        clasificaciones: clasificaciones,
        elegida: '',
        filas: [],
        seleccion: [],
        busqueda: '',
        departamento: '',
        vista: 'pendientes',
        fecha: null,
        periodos: [],
        periodoElegido: null,
        actas: {}
    };

    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.certificacionActual=null; window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Volver a la lista">←</button>
            <div style="min-width:0;">
                <h2 style="margin:0; font-size:1.2rem; color:#1d4ed8;">⭐ Certificar por clasificación</h2>
                <div style="font-size:0.85rem; color:#64748b;">Busca a la persona y da fe de su clasificación entera</div>
            </div>
        </div>

        <select id="selector-clasificacion-cert" onchange="window.cargarClasificacionParaCertificar(this.value)"
                style="width:100%; box-sizing:border-box; padding:12px 14px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; margin-bottom:15px; color:#0f172a; font-weight:600;">
            <option value="">Elige una clasificación…</option>
            ${clasificaciones.map(c => `<option value="${window.sanitizeForHTML(c)}">${window.sanitizeForHTML(c)}</option>`).join('')}
        </select>

        <div id="filtros-cert" style="display:none; gap:8px; flex-wrap:wrap; margin-bottom:15px;">
            <input type="text" id="buscador-cert" placeholder="🔍 Buscar empleado…"
                   oninput="window.filtrarEmpleadosCert(this.value)"
                   style="flex:1 1 100%; box-sizing:border-box; padding:12px 14px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white;">
            <select id="depto-cert" onchange="window.filtrarDeptoCert(this.value)"
                    style="flex:1 1 calc(50% - 4px); min-width:0; box-sizing:border-box; padding:12px 10px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; color:#0f172a;"></select>
            <select id="periodo-cert" onchange="window.cambiarPeriodoCert(this.value)"
                    style="flex:1 1 calc(50% - 4px); min-width:0; box-sizing:border-box; padding:12px 10px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; color:#0f172a;"></select>
            <div class="stats-conmutador" style="flex:1 1 100%;" id="vista-cert">
                <button data-vista="pendientes" onclick="window.cambiarVistaCert('pendientes')">⭐ Por certificar</button>
                <button data-vista="certificadas" onclick="window.cambiarVistaCert('certificadas')">✅ Certificadas</button>
            </div>
        </div>

        <div id="cuerpo-certificacion"></div>
    `;

    if (clasificaciones.length === 0) {
        document.getElementById('cuerpo-certificacion').innerHTML =
            `<div style="padding:30px; text-align:center; color:#94a3b8;">No hay encuestas activas.</div>`;
    }
};

window.cargarClasificacionParaCertificar = async (clasificacion, fechaRef) => {
    const cuerpo = document.getElementById('cuerpo-certificacion');
    const estado = window.certificacionActual;
    if (!cuerpo || !estado) return;

    const buscador = document.getElementById('buscador-cert');
    const cajaFiltros = document.getElementById('filtros-cert');

    if (!clasificacion) {
        estado.elegida = ''; estado.filas = []; estado.seleccion = [];
        estado.busqueda = ''; estado.departamento = '';
        estado.vista = 'pendientes'; estado.fecha = null; estado.periodos = [];
        if (cajaFiltros) cajaFiltros.style.display = 'none';
        if (buscador) buscador.value = '';
        cuerpo.innerHTML = '';
        return;
    }

    if (cajaFiltros) cajaFiltros.style.display = 'flex';
    if (buscador) buscador.value = '';
    estado.busqueda = '';
    estado.departamento = '';

    cuerpo.innerHTML = '<div style="padding:30px; text-align:center;"><div class="spinner" style="margin: 0 auto 12px auto;"></div>Reuniendo respuestas…</div>';

    const clave = window.normalizarClasificacion(clasificacion);
    const encuestas = estado.evaluaciones
        .filter(ev => window.normalizarClasificacion(ev.category || 'General') === clave);

    // El periodo que se está mirando. Sin fecha es el que corre; con ella, uno
    // de atrás. Todo lo que sigue —qué respuestas se traen, en qué periodo cae
    // cada encuesta y qué acta se busca— cuelga de esta fecha.
    const periodos = window.periodosDeClasificacion(encuestas, 12);
    const fecha = fechaRef ? new Date(fechaRef) : (periodos[0] ? periodos[0].referencia : new Date());
    const periodoElegido = periodos.find(p => Math.abs(p.referencia - fecha) < 1000) || periodos[0] || null;

    // Sólo hacen falta las respuestas del periodo que se mira. Se acota por la
    // fecha más temprana de todos los periodos en juego, que en una
    // clasificación mensual son unas semanas en vez de todo el historial. Si hay
    // alguna de una sola vez no se puede acotar: su periodo es «desde siempre».
    let desde = null;
    let hasta = null;
    encuestas.forEach(ev => {
        const p = window.periodoDeEncuesta(ev, fecha);
        if (!p.fin) { desde = false; return; }          // una `once` manda
        if (desde === false) return;
        if (desde === null || p.inicio < desde) desde = p.inicio;
        if (hasta === null || p.fin > hasta) hasta = p.fin;
    });

    let consulta = sb.from('evaluation_responses')
        .select('id, evaluation_id, employee_id, review_status, grades_json, submitted_at')
        .in('evaluation_id', encuestas.map(ev => ev.id));
    if (desde) {
        consulta = consulta.gte('submitted_at', new Date(desde).toISOString());
        // Mirando atrás también hay que poner techo, o se traería todo lo
        // posterior para nada.
        if (hasta) consulta = consulta.lt('submitted_at', new Date(hasta).toISOString());
    }

    const { data: respuestas, error } = await consulta;

    if (error) {
        cuerpo.innerHTML = `<div style="padding:30px; text-align:center; color:#ef4444;">No se pudieron cargar las respuestas: ${error.message}</div>`;
        return;
    }

    const porEmpleado = {};
    (respuestas || []).forEach(r => {
        const id = String(r.employee_id);
        if (!porEmpleado[id]) porEmpleado[id] = [];
        porEmpleado[id].push(r);
    });

    // Un empleado dado de baja no cuenta: ni se le certifica ni se le reprocha.
    const filas = (window.todosLosEmpleadosData || [])
        .filter(window.empleadoActivo)
        .map(emp => {
            const suyas = encuestas.filter(ev =>
                window.leTocaEstaEncuesta(ev, emp, window.tieneEquipoDirecto(emp.id)));
            if (suyas.length === 0) return null;

            const resumen = window.estadoCertificacion(suyas, porEmpleado[String(emp.id)] || [], fecha);
            return { empleado: emp, resumen: resumen };
        })
        .filter(Boolean);

    estado.elegida = clasificacion;
    estado.encuestas = encuestas;
    estado.filas = filas;
    estado.fecha = fecha;
    estado.periodos = periodos;
    estado.periodoElegido = periodoElegido;
    estado.actas = await window.actasDeClasificacion(clave, periodoElegido);
    // Nada viene marcado de entrada: con el buscador de por medio, una
    // selección hecha antes de teclear acabaría certificando a gente que ya no
    // está a la vista.
    estado.seleccion = [];

    // Los departamentos salen de toda la gente a la que le toca la
    // clasificación, no sólo de los listos: así el desplegable no se vacía
    // según se van certificando.
    const deptos = Array.from(new Set(filas.map(f => window.deptoDeEmpleado(f.empleado))))
        .sort((a, b) => a.localeCompare(b));
    const selDepto = document.getElementById('depto-cert');
    if (selDepto) {
        selDepto.innerHTML = `<option value="">Todos los departamentos (${filas.length})</option>`
            + deptos.map(d => {
                const cuantos = filas.filter(f => window.deptoDeEmpleado(f.empleado) === d).length;
                return `<option value="${window.sanitizeForHTML(d)}">${window.sanitizeForHTML(d)} (${cuantos})</option>`;
            }).join('');
        selDepto.value = '';
    }

    const selPeriodo = document.getElementById('periodo-cert');
    if (selPeriodo) {
        selPeriodo.innerHTML = periodos.map(p =>
            `<option value="${p.referencia.getTime()}">${p.actual ? '⏳ Periodo actual' : '🕒 ' + window.sanitizeForHTML(p.etiqueta || p.nombre)}</option>`
        ).join('');
        if (periodoElegido) selPeriodo.value = String(periodoElegido.referencia.getTime());
    }

    window.renderizarCertificacionClasificacion();
};

window.alternarSeleccionEmpleadoCert = (empId) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    const i = estado.seleccion.indexOf(String(empId));
    if (i === -1) estado.seleccion.push(String(empId)); else estado.seleccion.splice(i, 1);
    window.renderizarCertificacionClasificacion();
};

window.seleccionarGrupoCert = (ids, marcar) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    String(ids).split(',').filter(Boolean).forEach(id => {
        const i = estado.seleccion.indexOf(id);
        if (marcar && i === -1) estado.seleccion.push(id);
        if (!marcar && i !== -1) estado.seleccion.splice(i, 1);
    });
    window.renderizarCertificacionClasificacion();
};

// El departamento tal como se agrupa en esta pantalla. Se saca aparte porque
// lo usan el desplegable y el filtrado, y tienen que coincidir.
// Las actas del periodo que se está mirando, indexadas por empleado. Son un
// extra: dicen quién dio fe y cuándo, que es lo único que no se puede deducir
// de las respuestas. Si la tabla todavía no existe —el script de `sql/` se
// corre a mano— se sigue sin ellas y la lista se dibuja igual.
window.actasDeClasificacion = async (clave, periodo) => {
    if (!periodo || !periodo.inicio) return {};
    const aFecha = (d) => new Date(d).toISOString().slice(0, 10);

    try {
        const { data, error } = await sb.from('certificaciones_clasificacion')
            .select('employee_id, certificado_por, certificado_en, respuestas_cubiertas, nota')
            .eq('clasificacion', clave)
            .eq('periodo_inicio', aFecha(periodo.inicio));

        if (error) throw error;

        const porEmpleado = {};
        (data || []).forEach(a => { porEmpleado[String(a.employee_id)] = a; });
        return porEmpleado;
    } catch (e) {
        console.warn('No se pudieron leer las actas de certificación:', e.message);
        return {};
    }
};

window.cambiarPeriodoCert = (referencia) => {
    const estado = window.certificacionActual;
    if (!estado || !estado.elegida) return Promise.resolve();
    // Se recarga porque cambian las respuestas que hay que traerse: las del
    // periodo nuevo, no las del que estaba. Se devuelve la promesa para que
    // quien la llame pueda esperar a que la lista esté puesta.
    return window.cargarClasificacionParaCertificar(estado.elegida, new Date(Number(referencia)));
};

window.cambiarVistaCert = (vista) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    estado.vista = vista === 'certificadas' ? 'certificadas' : 'pendientes';
    // Lo marcado es de la vista de certificar; al cambiar de vista se suelta
    // para que la barra de abajo no siga ofreciendo sellar lo que ya no se ve.
    estado.seleccion = [];
    window.renderizarCertificacionClasificacion();
};

window.deptoDeEmpleado = (emp) => String((emp && emp.dept) || '').trim() || 'Sin departamento';

window.filtrarEmpleadosCert = (termino) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    estado.busqueda = String(termino || '');
    // El buscador vive fuera de #cuerpo-certificacion, así que repintar la
    // lista no se lo lleva por delante y el foco aguanta entre letra y letra.
    window.renderizarCertificacionClasificacion();
};

window.filtrarDeptoCert = (depto) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    estado.departamento = String(depto || '');
    window.renderizarCertificacionClasificacion();
};

// Certificar a una sola persona sin pasar por las casillas: es el camino
// normal —se busca a alguien y se le da fe—, y entra por la misma función que
// el lote para no tener dos maneras de certificar.
window.certificarSoloA = (empId) => {
    const estado = window.certificacionActual;
    if (!estado) return Promise.resolve();
    estado.seleccion = [String(empId)];
    // Se devuelve la promesa: sin ella nadie puede esperar a que termine ni
    // enterarse de un fallo, que es justo lo que hace una escritura.
    return window.certificarSeleccionClasificacion();
};

window.renderizarCertificacionClasificacion = () => {
    const cuerpo = document.getElementById('cuerpo-certificacion');
    const estado = window.certificacionActual;
    if (!cuerpo || !estado || !estado.elegida) return;

    const E = window.ESTADOS_CERTIFICACION;
    const { filas, seleccion } = estado;
    const safeClas = window.sanitizeForHTML(estado.elegida);
    const vista = estado.vista === 'certificadas' ? 'certificadas' : 'pendientes';
    const periodo = estado.periodoElegido;
    const nombrePeriodo = periodo
        ? (periodo.actual ? (periodo.nombre || 'el periodo actual') : (periodo.etiqueta || periodo.nombre))
        : 'el periodo actual';

    document.querySelectorAll('#vista-cert button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
    });

    const termino = (estado.busqueda || '').toLowerCase().trim();
    const depto = estado.departamento || '';
    const buscando = termino.length > 0;

    const coincide = (f) => {
        const e = f.empleado;
        return (e.name || '').toLowerCase().includes(termino)
            || (e.puesto || '').toLowerCase().includes(termino)
            || (e.dept || '').toLowerCase().includes(termino);
    };
    const enDepto = (f) => !depto || window.deptoDeEmpleado(f.empleado) === depto;

    const listos = filas.filter(f => f.resumen.estado === E.LISTA);
    const certificadas = filas.filter(f => f.resumen.estado === E.CERTIFICADA);

    const cuenta = {
        listos: listos.length,
        proceso: filas.filter(f => f.resumen.estado === E.PROCESO).length,
        observaciones: filas.filter(f => f.resumen.estado === E.OBSERVACIONES).length,
        certificadas: certificadas.length,
        sinActividad: filas.filter(f => f.resumen.estado === E.VACIO).length
    };

    const rotuloPeriodo = `<span style="display:inline-block; background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; padding:2px 8px; border-radius:20px; font-size:0.7rem; font-weight:700;">${window.sanitizeForHTML(nombrePeriodo)}</span>`;

    // --- Vista de certificadas: quién ya tiene la clasificación cerrada ---
    if (vista === 'certificadas') {
        const visibles = buscando
            ? certificadas.filter(coincide)
            : certificadas.filter(enDepto);

        const encabezado = `
            <div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                Quien tiene «${safeClas}» <b>certificada por completo</b> en ${rotuloPeriodo}.
                ${cuenta.certificadas > 0 ? `<div style="margin-top:6px;">${cuenta.certificadas} de ${filas.length} persona(s) a las que les toca.</div>` : ''}
            </div>`;

        if (visibles.length === 0) {
            const vacio = certificadas.length === 0
                ? `Todavía no hay nadie con «${safeClas}» certificada en ${window.sanitizeForHTML(nombrePeriodo)}.`
                : (buscando ? 'Ninguna de las certificadas coincide con la búsqueda.'
                            : `Nadie de ${window.sanitizeForHTML(depto)} tiene «${safeClas}» certificada en este periodo.`);
            cuerpo.innerHTML = encabezado + `<div style="padding:30px; text-align:center; color:#94a3b8;">${vacio}</div>`;
            return;
        }

        const nombreDe = (id) => {
            const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(id));
            return emp ? emp.name : null;
        };

        const filaCert = (f) => {
            const id = String(f.empleado.id);
            const acta = (estado.actas || {})[id];
            const safeName = window.sanitizeForHTML(f.empleado.name || 'Sin nombre');
            const puesto = window.sanitizeForHTML(
                [f.empleado.puesto, window.deptoDeEmpleado(f.empleado)].filter(Boolean).join(' · '));

            // El acta es lo único que dice quién dio fe y cuándo; sin ella —o
            // sin la tabla— se enseña igual, que la certificación vive en las
            // respuestas.
            let firma = `<span style="color:#64748b; font-size:0.75rem;">Certificada · ${f.resumen.total} encuesta${f.resumen.total === 1 ? '' : 's'}</span>`;
            if (acta) {
                const quien = nombreDe(acta.certificado_por);
                const cuando = acta.certificado_en ? new Date(acta.certificado_en).toLocaleDateString() : '';
                firma = `<span style="color:#64748b; font-size:0.75rem;">Dio fe ${quien ? '<b>' + window.sanitizeForHTML(quien) + '</b>' : 'alguien'}${cuando ? ' · ' + cuando : ''}</span>`;
            }

            return `
            <div style="background:white; border:1px solid #bfdbfe; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
                <div style="display:flex; align-items:flex-start; gap:10px;">
                    <span style="flex-shrink:0; font-size:1.1rem; margin-top:1px;">⭐</span>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#0f172a; font-weight:600; font-size:0.92rem; line-height:1.25; word-break:break-word;">${safeName}</div>
                        <div style="color:#64748b; font-size:0.78rem; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${puesto}</div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap;">
                    ${firma}
                    <button onclick="window.abrirExpedienteEmpleado('${id}')"
                            style="flex-shrink:0; background:#f1f5f9; border:none; color:#475569; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">Abrir</button>
                </div>
            </div>`;
        };

        cuerpo.innerHTML = encabezado + `
            <div style="margin-top:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:#eff6ff; color:#1d4ed8; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem;">
                    <span>${buscando ? '🔍 Resultados' : '✅ Certificadas'} (${visibles.length}${!buscando && visibles.length !== certificadas.length ? ` de ${certificadas.length}` : ''})</span>
                </div>
                <div style="margin-top:8px;">${visibles.map(filaCert).join('')}</div>
            </div>`;
        return;
    }

    // --- Vista de por certificar ---
    // Buscando, aparece cualquiera y en el estado que sea: si escribes un
    // nombre es porque quieres ver a esa persona, no que te digan que no
    // califica. Sin búsqueda, la lista es la de los listos —acotada al
    // departamento elegido—, que es a lo que se entra a esta pantalla.
    const visibles = buscando ? filas.filter(coincide) : listos.filter(enDepto);

    const resto = [];
    if (cuenta.proceso) resto.push(`${cuenta.proceso} en proceso`);
    if (cuenta.observaciones) resto.push(`${cuenta.observaciones} con observaciones`);
    if (cuenta.certificadas) resto.push(`${cuenta.certificadas} ya certificada(s)`);
    if (cuenta.sinActividad) resto.push(`${cuenta.sinActividad} sin contestar`);

    const encabezado = buscando
        ? `<div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
               Buscando entre <b>las ${filas.length} personas</b> a las que les toca «${safeClas}», estén listas o no, en ${rotuloPeriodo}.
               ${depto ? '<div style="margin-top:4px;">El filtro de departamento no se aplica mientras buscas.</div>' : ''}
           </div>`
        : `<div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
               Sólo aparece quien tiene <b>toda la clasificación revisada</b> y lista para certificar en ${rotuloPeriodo}.
               Busca por nombre para ver a cualquiera y saber qué le falta.
               ${resto.length ? `<div style="margin-top:6px;">Del resto: ${resto.join(' · ')}.</div>` : ''}
           </div>`;

    if (visibles.length === 0) {
        const vacio = buscando
            ? `Nadie de «${safeClas}» coincide con la búsqueda.`
            : (depto
                ? `Nadie de ${window.sanitizeForHTML(depto)} tiene «${safeClas}» lista para certificar.`
                : `Nadie tiene «${safeClas}» lista para certificar en ${window.sanitizeForHTML(nombrePeriodo)}.`);
        cuerpo.innerHTML = encabezado + `<div style="padding:30px; text-align:center; color:#94a3b8;">${vacio}</div>`;
        return;
    }

    const filaHtml = (f) => {
        const id = String(f.empleado.id);
        const marcada = seleccion.includes(id);
        const lista = f.resumen.estado === E.LISTA;
        const cuantas = f.resumen.certificables.length;
        const falta = window.faltaParaCertificar(f.resumen);
        const insignia = window.insigniaCertificacion(f.resumen);
        const safeName = window.sanitizeForHTML(f.empleado.name || 'Sin nombre');
        const puesto = window.sanitizeForHTML(
            [f.empleado.puesto, window.deptoDeEmpleado(f.empleado)].filter(Boolean).join(' · '));

        // A quien no está listo se le dice qué le falta y no se le ofrece
        // certificar: el botón daría fe de algo que todavía no está revisado.
        // Se resuelve entrando a su expediente, que es a donde lleva «Abrir».
        const abajo = lista
            ? `<span style="color:#166534; font-size:0.75rem; font-weight:700;">${cuantas} encuesta${cuantas === 1 ? '' : 's'} por certificar</span>`
            : (falta.length
                ? `<span style="color:#b45309; font-size:0.75rem; font-weight:700; min-width:0;">Falta: ${window.sanitizeForHTML(falta.join(' · '))}</span>`
                : `<span style="color:#1d4ed8; font-size:0.75rem; font-weight:700;">Ya está certificada</span>`);

        return `
        <div style="background:${marcada ? '#eff6ff' : 'white'}; border:1px solid ${marcada ? '#93c5fd' : '#e2e8f0'}; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
            <div style="display:flex; align-items:flex-start; gap:10px;">
                ${lista
                    ? `<input type="checkbox" ${marcada ? 'checked' : ''} onclick="window.alternarSeleccionEmpleadoCert('${id}')"
                              style="width:20px; height:20px; flex-shrink:0; margin-top:2px; accent-color:#1d4ed8; cursor:pointer;"
                              title="Marcar para certificar a varios de una vez">`
                    : `<span style="width:20px; flex-shrink:0;"></span>`}
                <div style="flex:1; min-width:0;">
                    <div style="color:#0f172a; font-weight:600; font-size:0.92rem; line-height:1.25; word-break:break-word;">${safeName}</div>
                    <div style="color:#64748b; font-size:0.78rem; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${puesto}</div>
                    ${(buscando && insignia && !lista)
                        ? `<div style="margin-top:6px;"><span style="display:inline-block; background:${insignia.fondo}; color:${insignia.color}; border:1px solid ${insignia.borde}; padding:3px 8px; border-radius:20px; font-size:0.68rem; font-weight:700;">${insignia.texto}</span></div>`
                        : ''}
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap;">
                ${abajo}
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button onclick="window.abrirExpedienteEmpleado('${id}')"
                            style="background:#f1f5f9; border:none; color:#475569; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">Abrir</button>
                    ${lista
                        ? `<button onclick="window.certificarSoloA('${id}')"
                                   style="background:#eff6ff; border:1px solid #3b82f6; color:#1d4ed8; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">⭐ Certificar</button>`
                        : ''}
                </div>
            </div>
        </div>`;
    };

    // «Marcar todas» sólo alcanza a lo que se está viendo y sólo a los listos:
    // con un filtro puesto, marcar a los que quedaron fuera sería marcar a
    // ciegas.
    const idsMarcables = visibles.filter(f => f.resumen.estado === E.LISTA).map(f => String(f.empleado.id));
    const todasMarcadas = idsMarcables.length > 0 && idsMarcables.every(id => seleccion.includes(id));

    const rotulo = buscando
        ? `🔍 Resultados (${visibles.length})`
        : `⭐ Listas para certificar (${visibles.length}${depto && cuenta.listos !== visibles.length ? ` de ${cuenta.listos}` : ''})`;

    const lista = `
        <div style="margin-top:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:${buscando ? '#f1f5f9' : '#dcfce7'}; color:${buscando ? '#334155' : '#166534'}; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem;">
                <span>${rotulo}</span>
                ${idsMarcables.length > 0
                    ? `<button onclick="window.seleccionarGrupoCert('${idsMarcables.join(',')}', ${todasMarcadas ? 'false' : 'true'})"
                               style="background:white; border:1px solid #166534; color:#166534; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; flex-shrink:0;">
                           ${todasMarcadas ? 'Quitar' : 'Marcar todas'}
                       </button>`
                    : ''}
            </div>
            <div style="margin-top:8px;">${visibles.map(filaHtml).join('')}</div>
        </div>`;

    let barra = '';
    if (seleccion.length > 0) {
        const marcadas = filas.filter(f => seleccion.includes(String(f.empleado.id)));
        const cubiertas = marcadas.reduce((n, f) => n + f.resumen.certificables.length, 0);

        barra = `
        <div style="position:sticky; bottom:0; margin-top:20px; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px; box-shadow:0 -4px 12px rgba(0,0,0,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:700; color:#0f172a; font-size:0.9rem;">${seleccion.length} persona${seleccion.length === 1 ? '' : 's'} · ${cubiertas} respuesta${cubiertas === 1 ? '' : 's'}</span>
                <button onclick="window.seleccionarGrupoCert('${seleccion.join(',')}', false)" style="background:none; border:none; color:#64748b; font-size:0.8rem; font-weight:700; cursor:pointer; text-decoration:underline;">Limpiar</button>
            </div>
            <button onclick="window.certificarSeleccionClasificacion()"
                    style="width:100%; background:#eff6ff; color:#1d4ed8; border:1px solid #3b82f6; padding:12px; border-radius:10px; font-size:0.95rem; font-weight:700; cursor:pointer;">
                ⭐ Certificar «${safeClas}»
            </button>
        </div>`;
    }

    cuerpo.innerHTML = encabezado + lista + barra;
};

window.certificarSeleccionClasificacion = async () => {
    const estado = window.certificacionActual;
    if (!estado || estado.seleccion.length === 0) return;
    if (!window.modoAdminActivo) { alert("Solo el modo administrador puede certificar."); return; }

    const elegidas = estado.filas.filter(f => estado.seleccion.includes(String(f.empleado.id)));
    const idsRespuesta = elegidas.reduce((acc, f) => acc.concat(f.resumen.certificables), []);

    if (idsRespuesta.length === 0) {
        alert("Ninguna de las personas seleccionadas tiene respuestas que se puedan certificar.");
        return;
    }

    const incompletas = elegidas.filter(f => f.resumen.estado !== window.ESTADOS_CERTIFICACION.LISTA);

    const periodo = estado.periodoElegido;
    const deQuePeriodo = periodo && !periodo.actual
        ? ` del periodo ${periodo.etiqueta || periodo.nombre}`
        : '';

    let msg = `Se van a certificar ${idsRespuesta.length} respuesta(s) de ${elegidas.length} persona(s) `
        + `en «${estado.elegida}»${deQuePeriodo}.`;
    if (incompletas.length > 0) {
        msg += `\n\n${incompletas.length} quedará(n) sin cerrar porque todavía les falta algo:`;
        incompletas.slice(0, 5).forEach(f => {
            const r = f.resumen;
            const falta = [];
            if (r.sinContestar) falta.push(`${r.sinContestar} sin contestar`);
            if (r.sinCalificar) falta.push(`${r.sinCalificar} sin calificar`);
            if (r.bajoUmbral) falta.push(`${r.bajoUmbral} bajo ${window.UMBRAL_CERTIFICACION}%`);
            msg += `\n  • ${f.empleado.name}: ${falta.join(', ') || 'pendiente'}`;
        });
        if (incompletas.length > 5) msg += `\n  • …y ${incompletas.length - 5} más`;
    }
    msg += `\n\n¿Confirmas?`;

    if (!confirm(msg)) return;

    try {
        // El `.select()` no es opcional: un update que RLS rechaza responde con
        // éxito y cero filas.
        const { data, error } = await sb.from('evaluation_responses')
            .update({ review_status: 'Certificada' })
            .in('id', idsRespuesta)
            .select('id');

        if (error) throw error;

        const sellados = new Set((data || []).map(r => String(r.id)));
        if (sellados.size === 0) {
            alert("No se certificó ninguna respuesta: la base rechazó la escritura.");
            return;
        }

        // Se recalcula cada persona con lo que de verdad quedó sellado, y de ahí
        // sale el acta: así no dice haber cubierto más de lo que cubrió.
        let cerradas = 0;
        const actas = [];
        elegidas.forEach(f => {
            f.resumen.certificables.forEach(id => {
                if (!sellados.has(String(id))) return;
                f.resumen.certificadas++;
                f.resumen.calificadas--;
            });
            f.resumen.certificables = f.resumen.certificables.filter(id => !sellados.has(String(id)));
            if (f.resumen.certificadas === f.resumen.total) {
                f.resumen.estado = window.ESTADOS_CERTIFICACION.CERTIFICADA;
                cerradas++;
            }
            actas.push(window.filaDeActa({
                clasificacion: estado.elegida,
                empleadoId: f.empleado.id,
                resumen: f.resumen,
                cubiertas: f.resumen.certificadas
            }));
        });

        const acta = await window.registrarActasCertificacion(actas);

        // Las actas recién levantadas se meten en la caché para que la vista de
        // certificadas las enseñe sin recargar la pantalla.
        actas.filter(Boolean).forEach(a => {
            estado.actas = estado.actas || {};
            estado.actas[String(a.employee_id)] = a;
        });

        estado.seleccion = [];
        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        let aviso = `Listo: ${sellados.size} respuesta(s) certificada(s) en «${estado.elegida}».`;
        if (cerradas > 0) aviso += `\n\n${cerradas} persona(s) quedan con la clasificación certificada.`;
        if (acta.guardadas === 0) {
            aviso += `\n\n(No se pudo dejar constancia de las actas: ${acta.motivo}. Las respuestas sí quedaron certificadas.)`;
        }
        alert(aviso);

        window.renderizarCertificacionClasificacion();

    } catch (e) {
        alert("Ocurrió un error al certificar: " + e.message);
    }
};

// --- 3. CREAR Y EDITAR EVALUACIONES ---

// La misma hoja sirve para crear y para editar, así que lo que la distingue
// tiene que decirlo el encabezado: el título, el subtítulo y la etiqueta del
// botón de guardar, que al ser un botón de icono la lleva en el aria-label y
// en el title. Antes decía «Nueva evaluación» también al editar una existente.
window.prepararEncabezadoEval = (editando) => {
    const titulo = document.getElementById('titulo-crear-eval');
    const subtitulo = document.getElementById('subtitulo-crear-eval');
    const guardar = document.getElementById('btn-guardar-eval');
    const escala = document.getElementById('div-rango-labels');

    if (titulo) titulo.innerText = editando ? 'Editar evaluación' : 'Nueva evaluación';
    if (subtitulo) subtitulo.innerText = editando
        ? 'Los cambios valen del periodo siguiente en adelante'
        : 'Define el cuestionario y a quién le toca';
    if (guardar) {
        const etiqueta = editando ? 'Guardar cambios' : 'Publicar evaluación';
        guardar.title = etiqueta;
        guardar.setAttribute('aria-label', etiqueta);
    }
    // La escala arranca plegada; quien la necesite la abre, y al editar la
    // abre window.editarEvaluacion si la encuesta ya trae etiquetas.
    if (escala) escala.open = false;
};

window.renderConfiguracionEscala = () => {
    const maxVal = parseInt(document.getElementById('eval-max-scale').value) || 5;
    const container = document.getElementById('dynamic-labels-container');
    container.innerHTML = '';

    for(let i=0; i<=maxVal; i++) {
        container.insertAdjacentHTML('beforeend',
            `<div style="display:flex; align-items:center; gap:5px;">
                <span style="width:20px; font-weight:bold; color:#be185d;">${i}:</span> 
                <input type="text" id="lbl-range-${i}" placeholder="Ej. Nivel ${i}" style="flex:1; padding:6px; border-radius:6px; border:1px solid #fbcfe8;">
            </div>`
        );
    }
};

// Sin la columna en la base no se puede nombrar a nadie: se deja la casilla
// como está —revisa el jefe— y se dice por qué, en lugar de ofrecer un
// selector que no va a guardar nada.
window.avisarSiFaltaColumnaRevisores = async () => {
    const aviso = document.getElementById('aviso-revisores-no-disponible');
    const hay = await window.hayColumnaRevisores();
    if (aviso) aviso.style.display = hay ? 'none' : 'block';

    const chk = document.getElementById('chk-revisa-jefe');
    if (chk) {
        chk.disabled = !hay;
        if (!hay) {
            chk.checked = true;
            window.toggleSelectorPersonas('revisores');
        }
    }
};

window.verificarRestriccionesModo = () => {
    const modeEl = document.getElementById('eval-mode-input');
    const mode = modeEl ? modeEl.value : 'self';
    const allTypeSelects = document.querySelectorAll('.inp-tipo');
    // Por id, y no por `button[onclick="agregarCampoPregunta()"]`: aquel
    // selector comparaba el atributo carácter a carácter y se rompía con sólo
    // reordenar el marcado del botón.
    const btnAddQuestion = document.getElementById('btn-agregar-pregunta');
    const rangeLabelsDiv = document.getElementById('div-rango-labels');

    if(rangeLabelsDiv) {
        const container = document.getElementById('dynamic-labels-container');
        if(container && container.children.length === 0) window.renderConfiguracionEscala();
    }

    if (mode === 'boss') {
        const maxVal = document.getElementById('eval-max-scale') ? document.getElementById('eval-max-scale').value : 5;
        allTypeSelects.forEach(sel => {
            sel.value = 'range';
            sel.disabled = true;
            window.toggleTipoPregunta(sel);
        });
        window.textoBoton(btnAddQuestion, `+ Agregar Pregunta Numérica (1-${maxVal})`);
    } else {
        allTypeSelects.forEach(sel => { sel.disabled = false; });
        window.textoBoton(btnAddQuestion, "+ Agregar Pregunta");
    }

    // La que contesta el jefe llega ya calificada —`4-evaluaciones-base.js` la
    // guarda como 'Revisado' al enviarla—, así que no hay nada que repartir y
    // el bloque de revisores sobra.
    const esModoJefe = (mode === 'boss');
    ['grupo-revisores', 'grupo-revisores-cuerpo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = esModoJefe ? 'none' : '';
    });
};

window.prepararInputCategorias = async (currentValue = '') => {
    let input = document.getElementById('eval-category-input');
    if (input && input.tagName === 'SELECT') {
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.id = 'eval-category-input';
        newInput.setAttribute('list', 'eval-category-list');
        newInput.placeholder = "Escribe o selecciona categoría...";
        // Sin estilos en línea: los pone `.form-group input` y, dentro de una
        // hoja, la regla de `.hoja-contenido input[type="text"]`. Con el
        // padding de 12px que traía aquí, este campo quedaba más alto que
        // todos los demás de la hoja.
        const dl = document.createElement('datalist');
        dl.id = 'eval-category-list';
        input.parentNode.replaceChild(newInput, input);
        newInput.parentNode.appendChild(dl);
        input = newInput;
    }
    if (input) {
        input.value = currentValue;
        const { data } = await sb.from('evaluations').select('category');
        if (data) {
            const categories = [...new Set(data.map(i => i.category).filter(c => c))];
            const dl = document.getElementById('eval-category-list');
            if (dl) {
                dl.innerHTML = '';
                categories.sort().forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    dl.appendChild(opt);
                });
            }
        }
    }
};

window.renderizarSelectorPuestos = async (seleccionados = null) => {
    const container = document.getElementById('container-lista-puestos');
    const chkAll = document.getElementById('chk-all-puestos');
    
    if (!container) return;

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#64748b;">Cargando lista de puestos...</div>';
        if (window.cargarDatosEmpleados) {
            await window.cargarDatosEmpleados();
        }
    }

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#ef4444;">No hay empleados registrados.</div>';
        return;
    }

    container.innerHTML = '';

    const rawPuestos = window.todosLosEmpleadosData.map(e => {
        const p = e.puesto || e.Puesto || e.job || e.position;
        return p ? p.trim() : "Sin Puesto";
    });
    const uniquePuestos = [...new Set(rawPuestos)].sort();

    const isAll = (seleccionados === null || (Array.isArray(seleccionados) && seleccionados.includes('ALL')) || (Array.isArray(seleccionados) && seleccionados.length === 0));
    
    if(chkAll) {
        chkAll.checked = isAll;
        window.toggleSelectorPuestos();
    }

    uniquePuestos.forEach(puesto => {
        if(!puesto) return;
        
        const isChecked = !isAll && Array.isArray(seleccionados) && seleccionados.includes(puesto);

        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f8fafc;";
        div.innerHTML = `
            <input type="checkbox" class="chk-puesto-item" value="${puesto}" ${isChecked ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
            <span style="font-size:0.9rem; color:#475569;">${puesto}</span>
        `;
        container.appendChild(div);
    });
};

window.toggleSelectorPuestos = () => {
    const chkAll = document.getElementById('chk-all-puestos');
    const container = document.getElementById('container-lista-puestos');
    if (chkAll.checked) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
    }
};

window.renderizarSelectorDeptos = async (seleccionados = null) => {
    const container = document.getElementById('container-lista-deptos');
    const chkAll = document.getElementById('chk-all-deptos');
    if (!container) return;

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#64748b;">Cargando lista de departamentos...</div>';
        if (window.cargarDatosEmpleados) {
            await window.cargarDatosEmpleados();
        }
    }

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#ef4444;">No hay empleados registrados.</div>';
        return;
    }

    container.innerHTML = '';

    const rawDeptos = window.todosLosEmpleadosData.map(e => {
        const d = e.department || e.dept;
        return d ? d.trim() : "GENERAL";
    });
    const uniqueDeptos = [...new Set(rawDeptos)].sort();

    const isAll = (seleccionados === null || (Array.isArray(seleccionados) && seleccionados.includes('ALL')) || (Array.isArray(seleccionados) && seleccionados.length === 0));
    
    if(chkAll) {
        chkAll.checked = isAll;
        window.toggleSelectorDeptos();
    }

    uniqueDeptos.forEach(depto => {
        if(!depto) return;
        const isChecked = !isAll && Array.isArray(seleccionados) && seleccionados.includes(depto);
        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f8fafc;";
        div.innerHTML = `
            <input type="checkbox" class="chk-depto-item" value="${depto}" ${isChecked ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
            <span style="font-size:0.9rem; color:#475569;">${depto}</span>
        `;
        container.appendChild(div);
    });
};

window.toggleSelectorDeptos = () => {
    const chkAll = document.getElementById('chk-all-deptos');
    const container = document.getElementById('container-lista-deptos');
    if (chkAll.checked) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
    }
};

window.abrirModalCrearEval = async () => {
    window.idEditandoEval = null;
    document.getElementById('eval-title-input').value = '';
    
    const descInput = document.getElementById('eval-desc-input');
    if(descInput) descInput.value = '';
    const freqInput = document.getElementById('eval-frequency-input');
    if(freqInput) freqInput.value = 'once';

    const maxInput = document.getElementById('eval-max-scale');
        if(maxInput) maxInput.value = 5;
        window.renderConfiguracionEscala();
        
    const chkHalf = document.getElementById('eval-half-points');
    if(chkHalf) chkHalf.checked = false;
        
    await window.renderizarSelectorPuestos(null);
    await window.renderizarSelectorDeptos(null);
    
    const chkOblig = document.getElementById('chk-eval-obligatoria');
    if(chkOblig) chkOblig.checked = true;
    
    const chkArea = document.getElementById('chk-eval-por-area');
    if(chkArea) chkArea.checked = false;

    const chkActiva = document.getElementById('chk-eval-activa');
    if(chkActiva) chkActiva.checked = true;

    window.prepararSelectorPersonas('destinatarios', null);
        window.prepararSelectorPersonas('revisores', null);
        await window.avisarSiFaltaColumnaRevisores();

        await window.prepararInputCategorias('General');
        const modeInput = document.getElementById('eval-mode-input');
    if(modeInput) { modeInput.value = 'self'; modeInput.onchange = window.verificarRestriccionesModo; }
    document.getElementById('questions-container').innerHTML = '';
    window.agregarCampoPregunta();
    window.prepararEncabezadoEval(false);
    document.getElementById('modal-crear-eval').style.display = 'flex';
    window.verificarRestriccionesModo();
};

window.editarEvaluacion = async (id) => {
    let evaluacion = null;
    if (window.evalCache && window.evalCache.evals) {
        evaluacion = window.evalCache.evals.find(e => e.id === id);
    }
    if (!evaluacion) {
        const { data } = await sb.from('evaluations').select('*').eq('id', id).single();
        evaluacion = data;
    }
    if (!evaluacion) { alert("Error: No se encontró la evaluación."); return; }

    window.idEditandoEval = id;
    // Antes de tocar la escala: prepararEncabezadoEval la deja plegada y el
    // bloque de range_labels de más abajo la vuelve a abrir si hay etiquetas.
    window.prepararEncabezadoEval(true);
    document.getElementById('eval-title-input').value = evaluacion.title;

    const descInput = document.getElementById('eval-desc-input');
    if(descInput) descInput.value = evaluacion.description || '';
    const freqInput = document.getElementById('eval-frequency-input');
    if(freqInput) freqInput.value = evaluacion.frequency || 'once';

    let targetPositions = null;
    if (evaluacion.target_positions) {
        targetPositions = typeof evaluacion.target_positions === 'string'
            ? JSON.parse(evaluacion.target_positions)
            : evaluacion.target_positions;
    }
    await window.renderizarSelectorPuestos(targetPositions);

    let targetDepartments = null;
        if (evaluacion.target_departments) {
            targetDepartments = typeof evaluacion.target_departments === 'string'
                ? JSON.parse(evaluacion.target_departments)
                : evaluacion.target_departments;
        }
        await window.renderizarSelectorDeptos(targetDepartments);

        let targetEmployeesData = null;
        if (evaluacion.target_employees) {
            try {
                targetEmployeesData = typeof evaluacion.target_employees === 'string'
                    ? JSON.parse(evaluacion.target_employees)
                    : evaluacion.target_employees;
            } catch (e) { targetEmployeesData = null; }
        }
        window.prepararSelectorPersonas('destinatarios', targetEmployeesData);

        // Los revisores propios se leen con el mismo helper que usan las demás
        // pantallas, que es el que aguanta que la columna venga como texto.
        window.prepararSelectorPersonas('revisores', window.revisoresDeEncuesta(evaluacion));
        await window.avisarSiFaltaColumnaRevisores();

        const chkOblig = document.getElementById('chk-eval-obligatoria');
    if(chkOblig) {
        chkOblig.checked = (evaluacion.is_obligatory !== false);
    }
    
    const chkArea = document.getElementById('chk-eval-por-area');
    if(chkArea) { chkArea.checked = (evaluacion.evaluates_area === true); }

    const chkActiva = document.getElementById('chk-eval-activa');
    if(chkActiva) { chkActiva.checked = window.encuestaActiva(evaluacion); }

    await window.prepararInputCategorias(evaluacion.category || 'General');

    let maxScale = 5;
    if(evaluacion.range_labels) {
        let labels = {};
        if(typeof evaluacion.range_labels === 'string') { try { labels = JSON.parse(evaluacion.range_labels); } catch(e){} }
        else { labels = evaluacion.range_labels; }
        const keys = Object.keys(labels).map(Number).filter(n => !isNaN(n));
                if(keys.length > 0) maxScale = Math.max(...keys);
                const maxInput = document.getElementById('eval-max-scale');
                if(maxInput) maxInput.value = maxScale;
                window.renderConfiguracionEscala();
                for(let i=0; i<=maxScale; i++) { const el = document.getElementById(`lbl-range-${i}`); if(el) el.value = labels[i] || ''; }
                // Ya hay etiquetas puestas: se despliega para que se vean.
                const escalaConEtiquetas = document.getElementById('div-rango-labels');
                if(escalaConEtiquetas && keys.length > 0) escalaConEtiquetas.open = true;
            } else {
        const maxInput = document.getElementById('eval-max-scale');
        if(maxInput) maxInput.value = 5;
        window.renderConfiguracionEscala();
    }

    const modeInput = document.getElementById('eval-mode-input');
    if(modeInput) {
        modeInput.value = evaluacion.mode || 'self';
        modeInput.onchange = window.verificarRestriccionesModo;
    }

    const container = document.getElementById('questions-container');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Cargando preguntas...</div>';
    document.getElementById('modal-crear-eval').style.display = 'flex';

    const { data: qs, error } = await sb.from('evaluation_questions').select('*').eq('evaluation_id', id).order('order_index', { ascending: true });
        container.innerHTML = '';
        if (error) { alert("Error cargando preguntas"); return; }

        let hasHalfPoints = false;
        if (qs && qs.length > 0) {
            const rangeQ = qs.find(q => q.question_type === 'range');
            if (rangeQ) {
                let opts = rangeQ.options;
                if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e){} }
                if (Array.isArray(opts) && opts.length > 2 && String(opts[2]) === '0.5') {
                    hasHalfPoints = true;
                }
            }
        }
        const chkHalfPoints = document.getElementById('eval-half-points');
        if(chkHalfPoints) chkHalfPoints.checked = hasHalfPoints;

        if (qs && qs.length > 0) {
            qs.forEach(q => {
            let opts = q.options;
            if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e) { opts = []; } }
            if (q.question_type === 'list_match') {
                try { const parsed = JSON.parse(q.correct_answer_text); if (Array.isArray(parsed)) opts = parsed; } catch(e) { if (q.correct_answer_text) { opts = q.correct_answer_text.split(/\n|,/).map(s=>s.trim()).filter(s=>s!==""); } }
            }
            window.agregarCampoPregunta(q.question_text, q.correct_answer_text, q.id, q.question_type, opts);
        });
    } else { window.agregarCampoPregunta(); }
    setTimeout(window.verificarRestriccionesModo, 50);
};

window.agregarCampoPregunta = (t="",c="",id=null,tp="text",op=[]) => {
    const modeEl = document.getElementById('eval-mode-input');
    const isBoss = modeEl && modeEl.value === 'boss';

    const d=document.createElement('div'); d.className="pregunta-wrapper"; if(id)d.setAttribute('data-id',id);
    d.style.cssText="margin-bottom:20px;background:#f9fafb;padding:15px;border-radius:12px;border:1px solid #e2e8f0;";
    
    const btnDeleteHTML = id
        ? `<button onclick="borrarPreguntaDB('${id}', this)" style="color:red; border:none; background:#fee2e2; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Borrar de la base de datos">🗑️ Eliminar</button>`
        : `<button onclick="this.closest('.pregunta-wrapper').remove()" style="color:#64748b; border:none; cursor:pointer;">✕ Quitar</button>`;

    const showTextContainer = (tp === 'text');
    const showOptionsContainer = (tp === 'multiple' || tp === 'checklist' || tp === 'list_match');
    const showRangeInfo = (tp === 'range');
    const optionsLabel = (tp === 'list_match') ? "Elementos Correctos (Respuesta Modelo):" : "Opciones:";

    d.innerHTML=`
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <select class="inp-tipo" onchange="window.toggleTipoPregunta(this)" ${isBoss ? 'disabled' : ''}>
            <option value="text" ${tp==='text'?'selected':''}>Texto Abierto</option>
            <option value="multiple" ${tp==='multiple'?'selected':''}>Opción Múltiple</option>
            <option value="checklist" ${tp==='checklist'?'selected':''}>Checklist</option>
            <option value="list_match" ${tp==='list_match'?'selected':''}>Recall (Lista de Memoria)</option>
            <option value="range" ${tp==='range'?'selected':''}>Rango Numérico</option>
        </select>
        ${btnDeleteHTML}
    </div>
    <input type="text" class="inp-pregunta" value="${t}" placeholder="Escribe la pregunta aquí..." style="width:100%;padding:10px; border:1px solid #cbd5e1; border-radius:6px;">
    
    <div class="options-container" style="display:${showOptionsContainer?'block':'none'};margin-top:10px;">
        <label class="lbl-options" style="font-size:0.8rem; color:#64748b; margin-bottom:5px; display:block;">${optionsLabel}</label>
        <div class="dynamic-options-list"></div>
        <button onclick="window.agregarInputOpcion(this.parentElement.querySelector('.dynamic-options-list'))" style="margin-top:5px; cursor:pointer; color:#2563eb; background:none; border:none; font-weight:bold;">+ Agregar Elemento</button>
    </div>
    
    <div class="text-container" style="display:${showTextContainer?'block':'none'};margin-top:10px;">
        <label style="font-size:0.8rem; color:#64748b; margin-bottom:3px; display:block;">Respuesta Modelo (Opcional):</label>
        <textarea class="inp-respuesta-correcta-text" placeholder='Texto esperado...' style="width:100%; padding:8px; border:1px solid #94a3b8; border-radius:6px; background:#f0f9ff; font-family:inherit;" rows="4">${c}</textarea>
    </div>

    <div class="range-info-container" style="display:${showRangeInfo?'block':'none'}; margin-top:15px; padding:10px; background:#fdf2f8; border:1px dashed #fbcfe8; border-radius:8px; font-size:0.85rem; color:#be185d;">
        📊 <b>Nota:</b> Esta pregunta se auto-evaluará utilizando el "Puntaje Máximo" global configurado arriba.
    </div>`;
    
    document.getElementById('questions-container').appendChild(d);
    const l=d.querySelector('.dynamic-options-list');
    if(showOptionsContainer && op.length>0) op.forEach(o=>window.agregarInputOpcion(l,o));
    else if(showOptionsContainer) window.agregarInputOpcion(l);
    window.verificarRestriccionesModo();
};

window.borrarPreguntaDB = async (questionId, btnElement) => {
    if(!confirm("¿Eliminar esta pregunta permanentemente de la base de datos?")) return;
    btnElement.innerText = "...";
    const { error } = await sb.from('evaluation_questions').delete().eq('id', questionId);
    if(error) { alert("Error al borrar: " + error.message); btnElement.innerText = "🗑️ Eliminar"; }
    else { btnElement.closest('.pregunta-wrapper').remove(); }
};

// Apagar y encender una encuesta desde su propia tarjeta. Una encuesta
// inactiva se queda en la base con todas sus respuestas, pero sólo la ve el
// administrador y deja de generar pendientes: las consultas que los arman
// filtran por `active`.
window.alternarEncuestaActiva = async (id, activar) => {
    if (!window.modoAdminActivo) { alert("Requiere permisos de administrador"); return; }

    const quiereActivar = (activar === true || activar === 'true');
    if (!quiereActivar && !confirm("¿Desactivar esta encuesta?\n\nDejará de aparecer a los usuarios y de generar pendientes. Sus respuestas se conservan y tú la seguirás viendo en modo administrador.")) return;

    try {
        // PostgREST responde con éxito aunque las políticas rechacen la
        // escritura: se encadena .select() para contar las filas que de
        // verdad cambiaron.
        const { data, error } = await sb.from('evaluations')
            .update({ active: quiereActivar })
            .eq('id', id)
            .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
            alert("La base no aplicó el cambio: no hay permiso para modificar esta encuesta.");
            return;
        }

        window.evalCache = null;
        if (window.cargarVistaEvaluaciones) await window.cargarVistaEvaluaciones();
    } catch (e) {
        alert("Error al cambiar el estado: " + e.message);
    }
};

window.borrarEvaluacion = async (id) => {
    if(!confirm("¿Estás seguro de eliminar esta evaluación?")) return;
    try {
        const { error } = await sb.from('evaluations').delete().eq('id', id);
        if (error) throw error;
        alert("Evaluación eliminada.");
        window.evalCache = null;
        window.cargarVistaEvaluaciones();
    } catch (e) { alert("Error al eliminar: " + e.message); }
};

window.toggleTipoPregunta = (s) => {
    const w = s.closest('.pregunta-wrapper');
    const o = w.querySelector('.options-container');
    const t = w.querySelector('.text-container');
    const lbl = w.querySelector('.lbl-options');
    const rInfo = w.querySelector('.range-info-container');
    
    if(o) o.style.display = 'none';
    if(t) t.style.display = 'none';
    if(rInfo) rInfo.style.display = 'none';

    if (s.value === 'text') {
        if(t) t.style.display = 'block';
    } else if (s.value === 'range') {
        if(rInfo) rInfo.style.display = 'block';
    } else {
        if(o) {
            o.style.display = 'block';
            lbl.innerText = (s.value === 'list_match') ? "Elementos Correctos (Respuesta Modelo):" : "Opciones:";
            if(w.querySelector('.dynamic-options-list').children.length === 0) {
                window.agregarInputOpcion(w.querySelector('.dynamic-options-list'));
            }
        }
    }
};

window.agregarInputOpcion = (c,v="") => {
    const d=document.createElement('div');
    d.style.cssText="display:flex;gap:5px;margin-top:5px;";
    const inp = document.createElement('input');
    inp.type = "text"; inp.className = "inp-opt-val"; inp.value = v;
    inp.style.cssText = "flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px;";
    const btn = document.createElement('button');
    btn.innerText = "✕"; btn.style.cssText = "color:red; border:none; background:white; font-weight:bold; cursor:pointer;";
    btn.onclick = function() { this.parentElement.remove(); };
    d.appendChild(inp); d.appendChild(btn); c.appendChild(d);
};

window.guardarNuevaEvaluacion = async () => {
    const tit = document.getElementById('eval-title-input').value.trim();
    const cat = document.getElementById('eval-category-input').value.trim() || "General";
    
    const descInput = document.getElementById('eval-desc-input');
    const desc = descInput ? descInput.value.trim() : null;
    const freqInput = document.getElementById('eval-frequency-input');
    const freq = freqInput ? freqInput.value : 'once';

    const mode = document.getElementById('eval-mode-input') ? document.getElementById('eval-mode-input').value : 'self';
    const wr = document.querySelectorAll('.pregunta-wrapper');
    if(!tit || wr.length === 0){alert("Faltan datos"); return;}
    
    try{
        let eid = window.idEditandoEval;
        const rangeLabels = {};
        let hasLabels = false;
        
        const globalMaxVal = parseInt(document.getElementById('eval-max-scale').value) || 5;
        for(let i=0; i<=globalMaxVal; i++) {
            const el = document.getElementById(`lbl-range-${i}`);
            if(el && el.value.trim()) { rangeLabels[i] = el.value.trim(); hasLabels = true; }
        }

        const chkAll = document.getElementById('chk-all-puestos');
        let targetPositions = ['ALL'];

        if (chkAll && !chkAll.checked) {
            const checkboxes = document.querySelectorAll('.chk-puesto-item:checked');
            const seleccionados = Array.from(checkboxes).map(cb => cb.value);
            if (seleccionados.length > 0) {
                targetPositions = seleccionados;
            } else {
                targetPositions = ['ALL'];
            }
        }

        const chkAllDeptos = document.getElementById('chk-all-deptos');
        let targetDepartments = ['ALL'];

        if (chkAllDeptos && !chkAllDeptos.checked) {
            const checkboxesDeptos = document.querySelectorAll('.chk-depto-item:checked');
            const seleccionadosDeptos = Array.from(checkboxesDeptos).map(cb => cb.value);
            if (seleccionadosDeptos.length > 0) {
                targetDepartments = seleccionadosDeptos;
            } else {
                targetDepartments = ['ALL'];
            }
        }

        let isObligatory = true;
        const chkOblig = document.getElementById('chk-eval-obligatoria');
        if(chkOblig) isObligatory = chkOblig.checked;

        const chkArea = document.getElementById('chk-eval-por-area');
                const evaluatesArea = chkArea ? chkArea.checked : false;

                // Sin la casilla marcada la encuesta queda inactiva: sólo la
                // ve el administrador y no genera pendientes a nadie.
                const chkActiva = document.getElementById('chk-eval-activa');
                const estaActiva = chkActiva ? chkActiva.checked : true;

                const targetEmployees = window.idsDelSelector('destinatarios');
                if (targetEmployees === null) {
                    alert("Desmarcaste 'Todos los colaboradores' pero no agregaste a nadie a la lista.");
                    return;
                }

                // Nombrar revisores es opcional: ['ALL'] significa lo de
                // siempre, que la revisa el jefe inmediato.
                const revisores = window.idsDelSelector('revisores');
                if (revisores === null) {
                    alert("Desmarcaste 'La revisa el jefe inmediato' pero no agregaste a ningún revisor.");
                    return;
                }

                const payload = {
                    title: tit,
                    category: cat,
                    description: desc,
                    frequency: freq,
                    mode: mode,
                    range_labels: hasLabels ? JSON.stringify(rangeLabels) : null,
                    target_positions: targetPositions,
                    target_departments: targetDepartments,
                    target_employees: targetEmployees,
                    evaluates_area: evaluatesArea,
                    is_obligatory: isObligatory,
                    active: estaActiva
                };

                // Sin la columna en la base no se puede guardar el
                // nombramiento; el resto de la encuesta sí, y la hoja ya avisó.
                if (await window.hayColumnaRevisores()) {
                    payload.reviewer_employees = revisores;
                }

                if(eid) {
            const { error } = await sb.from('evaluations').update(payload).eq('id', eid);
            if(error) throw error;
        } else {
            const {data, error} = await sb.from('evaluations').insert(payload).select().single();
            if(error) throw error;
            eid = data.id;
        }
        
        const ups=[], ins=[];
        wr.forEach((d,i)=>{
            const txt=d.querySelector('.inp-pregunta').value.trim();
            const tp=d.querySelector('.inp-tipo').value;
            const exId=d.getAttribute('data-id');
            let corr="", ops=[];
            
            if(tp==='multiple' || tp==='checklist'){
                d.querySelectorAll('.inp-opt-val').forEach(r=>{if(r.value.trim())ops.push(r.value.trim());});
                corr=JSON.stringify(ops);
            } else if (tp === 'list_match') {
                const items = [];
                d.querySelectorAll('.inp-opt-val').forEach(r=>{if(r.value.trim())items.push(r.value.trim());});
                corr = JSON.stringify(items);
                ops = [];
            } else if (tp==='range') {
                const chkHalf = document.getElementById('eval-half-points');
                const step = (chkHalf && chkHalf.checked) ? 0.5 : 1;
                ops = [0, globalMaxVal, step];
                corr = "";
            } else {
                corr=d.querySelector('.inp-respuesta-correcta-text').value.trim();
            }
            if(txt){
                const p={evaluation_id:eid,question_text:txt,correct_answer_text:corr,question_type:tp,options:ops,order_index:i};
                if(exId){ p.id=exId; ups.push(p); } else { ins.push(p); }
            }
        });
        
        if(ins.length) await sb.from('evaluation_questions').insert(ins);
                if(ups.length) {
                    const updatePromises = ups.map(q => { const { id, ...dataToUpdate } = q; return sb.from('evaluation_questions').update(dataToUpdate).eq('id', id); });
                    await Promise.all(updatePromises);
                }
                
                alert("✅ Guardado correctamente");
                document.getElementById('modal-crear-eval').style.display='none';
                window.evalCache = null;
                cargarVistaEvaluaciones();
            }catch(e){ alert("❌ Error: " + e.message); console.error(e); }
        };

        // --- LOS DOS SELECTORES DE PERSONAS DE LA HOJA ---
        // «A quién va dirigida» y «quién la revisa» son el mismo control con
        // distintos ids: una casilla que lo despliega, un buscador y las
        // fichas de los elegidos. En vez de repetir las cuatro funciones, cada
        // una recibe de qué selector se trata.
        window.SELECTORES_PERSONAS = {
            destinatarios: {
                casilla: 'chk-all-empleados',
                caja: 'container-selector-empleados',
                buscador: 'inp-buscar-empleado-eval',
                resultados: 'lista-resultados-empleados-eval',
                fichas: 'lista-empleados-seleccionados-eval',
                elegidos: []
            },
            revisores: {
                casilla: 'chk-revisa-jefe',
                caja: 'container-selector-revisores',
                buscador: 'inp-buscar-revisor-eval',
                resultados: 'lista-resultados-revisores-eval',
                fichas: 'lista-revisores-seleccionados-eval',
                elegidos: []
            }
        };

        // Los elegidos se guardan como {id, name}: el nombre es para las
        // fichas, y hace falta guardarlo porque la lista se pinta antes de que
        // se pueda buscar a nadie.
        window.personasElegidas = (clave) => window.SELECTORES_PERSONAS[clave].elegidos;

        window.ponerPersonasElegidas = (clave, lista) => {
            window.SELECTORES_PERSONAS[clave].elegidos = lista || [];
        };

        window.toggleSelectorPersonas = (clave) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const chk = document.getElementById(cfg.casilla);
            const caja = document.getElementById(cfg.caja);
            if (!chk || !caja) return;

            // La casilla dice lo de siempre —todos, o el jefe—, así que el
            // selector aparece justo cuando se desmarca.
            if (chk.checked) {
                caja.style.display = 'none';
            } else {
                caja.style.display = 'block';
                window.pintarPersonasEval(clave);
            }
        };

        window.buscarPersonaEval = (clave, term) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const resDiv = document.getElementById(cfg.resultados);
            if (!resDiv) return;
            if (!term.trim()) { resDiv.innerHTML = ''; return; }

            const termLow = term.toLowerCase();
            const matches = (window.todosLosEmpleadosData || []).filter(e =>
                (e.name && e.name.toLowerCase().includes(termLow)) || String(e.id).includes(termLow)
            ).slice(0, 8);

            if (matches.length === 0) {
                resDiv.innerHTML = '<div style="font-size:0.85rem; color:#64748b; padding:5px;">No se encontraron coincidencias.</div>';
                return;
            }

            resDiv.innerHTML = matches.map(m => {
                const isSelected = cfg.elegidos.some(s => String(s.id) === String(m.id));
                const nombre = String(m.name || '').replace(/'/g, "\\'");
                const btnState = isSelected ?
                    `<button disabled style="background:#f1f5f9; color:#94a3b8; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:bold;">Agregado</button>` :
                    `<button onclick="window.agregarPersonaEval('${clave}', '${m.id}', '${nombre}')" style="background:#7e22ce; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">+ Agregar</button>`;

                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 5px; border-bottom:1px solid #f1f5f9; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <span style="font-size:0.85rem; color:#334155; font-weight:500;">${m.name} <small style="color:#94a3b8; font-weight:normal;">(${m.id})</small></span>
                    ${btnState}
                </div>`;
            }).join('');
        };

        window.agregarPersonaEval = (clave, id, nombre) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            if (!cfg.elegidos.some(e => String(e.id) === String(id))) {
                cfg.elegidos.push({ id: String(id), name: nombre });
                window.pintarPersonasEval(clave);
                const inp = document.getElementById(cfg.buscador);
                if (inp) window.buscarPersonaEval(clave, inp.value);
            }
        };

        window.quitarPersonaEval = (clave, id) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            cfg.elegidos = cfg.elegidos.filter(e => String(e.id) !== String(id));
            window.pintarPersonasEval(clave);
            const inp = document.getElementById(cfg.buscador);
            if (inp) window.buscarPersonaEval(clave, inp.value);
        };

        window.pintarPersonasEval = (clave) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const container = document.getElementById(cfg.fichas);
            if (!container) return;

            if (cfg.elegidos.length === 0) {
                container.innerHTML = '<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Ninguno seleccionado.</span>';
                return;
            }

            container.innerHTML = cfg.elegidos.map(e => `
                <div style="display:flex; align-items:center; background:#f3e8ff; border:1px solid #d8b4fe; color:#6b21a8; padding:4px 10px; border-radius:20px; font-size:0.85rem; font-weight:500; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    ${window.sanitizeForHTML(e.name)}
                    <button onclick="window.quitarPersonaEval('${clave}', '${e.id}')" style="background:none; border:none; color:#d946ef; font-weight:bold; margin-left:6px; cursor:pointer; font-size:1rem; line-height:1;">✕</button>
                </div>
            `).join('');
        };

        // Deja el selector como si se abriera la hoja de cero, con la lista de
        // ids que traiga la encuesta. `null` o con 'ALL' es lo de siempre.
        window.prepararSelectorPersonas = (clave, ids) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const chk = document.getElementById(cfg.casilla);
            const concretos = Array.isArray(ids)
                ? ids.map(String).filter(x => x.trim() !== '' && x.toUpperCase() !== 'ALL')
                : [];

            if (concretos.length > 0) {
                if (chk) chk.checked = false;
                cfg.elegidos = concretos.map(id => {
                    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(id));
                    return { id: String(id), name: emp ? emp.name : `ID: ${id}` };
                });
            } else {
                if (chk) chk.checked = true;
                cfg.elegidos = [];
            }

            const inp = document.getElementById(cfg.buscador);
            if (inp) inp.value = '';
            const res = document.getElementById(cfg.resultados);
            if (res) res.innerHTML = '';
            window.toggleSelectorPersonas(clave);
        };

        // Lo que hay que guardar: la lista de ids, o ['ALL'] si manda la
        // casilla. Devuelve null si se desmarcó sin elegir a nadie, que es un
        // descuido y no una configuración.
        window.idsDelSelector = (clave) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const chk = document.getElementById(cfg.casilla);
            if (!chk || chk.checked) return ['ALL'];
            if (cfg.elegidos.length === 0) return null;
            return cfg.elegidos.map(e => String(e.id));
        };

        console.log("✅ Evaluaciones Admin v52: INTEGRACIÓN DE VISTA Y CALIFICACIÓN.");
