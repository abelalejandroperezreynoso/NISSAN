// ==========================================
// 4-evaluaciones-admin.js (V52: INTEGRACIÓN DE EDICIÓN Y REVISIÓN EN UNA SOLA VISTA)
// ==========================================

// Variable global para caché de preguntas
window.preguntasCacheActual = null;

// --- HELPER: VERIFICAR SUPERVISOR DIRECTO (fwindow.borrarRespuestaIndividual = async (id) => {NO RECURSIVO) ---
window.esSupervisorDirecto = (empleadoId) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if (!user || !empleadoId || !window.todosLosEmpleadosData) return false;
    const empleado = window.todosLosEmpleadosData.find(e => String(e.id) === String(empleadoId));
    return empleado && String(empleado.supId) === String(user.id);
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
    
    let responses = [];
    if (window.modoAdminActivo) {
        const { data } = await sb.from('evaluation_responses').select('*').eq('evaluation_id', evalId).order('submitted_at', {ascending: false});
        responses = data || [];
    } else {
        const { data } = await sb.from('evaluation_responses').select('*').eq('evaluation_id', evalId).order('submitted_at', {ascending: false});
        if (data) {
            responses = data.filter(r => (r.employee_id === user.id) || window.esSupervisorDirecto(r.employee_id));
        }
    }
    
    window.respuestasCacheActual = responses || [];

    
    
    let infoHtml = '';
    let evalData = null;

    if (window.evalCache && window.evalCache.evals) {
        evalData = window.evalCache.evals.find(e => String(e.id) === String(evalId));
        if (evalData) {
            const desc = evalData.description ? `<div style="margin-bottom:5px;"><b>Descripción:</b> ${evalData.description}</div>` : '';
            
            const freqMap = { 'once': 'Única vez', 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual', 'quarterly': 'Trimestral', 'semiannual': 'Semestral', 'yearly': 'Anual', 'biennial': 'Cada 2 años' };
            const freq = evalData.frequency ? freqMap[evalData.frequency] || evalData.frequency : 'Única vez';
            const freqHtml = `<div style="font-size:0.8rem; color:#64748b;"><b>Frecuencia:</b> ${freq}</div>`;
            const obligHtml = (evalData.is_obligatory === false) ? `<div style="font-size:0.8rem; color:#22c55e; font-weight:bold; margin-top:4px;">✨ Encuesta Opcional</div>` : '';
            const areaHtml = (evalData.evaluates_area === true) ? `<div style="font-size:0.8rem; color:#be185d; font-weight:bold; margin-top:4px;">📍 Mide resultados por Área</div>` : '';

            if(desc || freq) {
                infoHtml = `<div style="font-size:0.9rem; color:#475569; margin-top:5px; margin-bottom:15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${desc}${freqHtml}${obligHtml}${areaHtml}</div>`;
            }
        }
    }

    // --- LÓGICA DEL BANNER Y BOTÓN DE RESPONDER ---
    const mode = evalData ? (evalData.mode || 'self') : 'self';
    const safeTitle = title.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    
    let actionButtonHtml = '';
    if (mode === 'boss') {
        actionButtonHtml = `<button onclick="window.abrirSeleccionSubordinado('${evalId}', '${safeTitle}', 'boss')" style="width: 100%; padding:12px 20px; background:#be185d; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px rgba(190, 24, 93, 0.25); transition: transform 0.1s;">👥 Evaluar a un Colaborador...</button>`;
    } else {
        const misRespuestas = responses.filter(r => String(r.employee_id) === String(user.id));
        const btnText = misRespuestas.length > 0 ? "Volver a Responder" : "Responder Encuesta";
        actionButtonHtml = `<button onclick="window.targetUserForEval=null; window.responderDirecto('${evalId}', '${safeTitle}', 'self')" style="width: 100%; padding:12px 20px; background:#2563eb; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold; font-size:1rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 6px rgba(37,99,235,0.25); transition: transform 0.1s;">📝 ${btnText}</button>`;
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
        (window.modoAdminActivo || (r.employee_id !== user.id && window.esSupervisorDirecto(r.employee_id)))
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

    const soySupervisorDirecto = window.esSupervisorDirecto(resp.employee_id);
    const esMiRespuesta = (resp.employee_id === user.id);
    const puedeCalificar = window.modoAdminActivo || (soySupervisorDirecto && !esMiRespuesta);
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
             dateInputHtml += `<div style="margin-top:10px; padding:10px; background:#fef3c7; color:#b45309; border-radius:6px; font-size:0.85rem;">Nota: Solo el supervisor directo puede calificar.</div>`;
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
    const { data: evaluaciones } = await sb.from('evaluations').select('id, title, category');
    const titulos = {};
    (evaluaciones || []).forEach(ev => {
        titulos[String(ev.id)] = { title: ev.title, category: (ev.category || 'General') };
    });

    window.expedienteActual = {
        empleado: empleado || { id: empId, name: (window.employeeNameMap || {})[empId] || `ID: ${empId}` },
        respuestas: respuestas || [],
        titulos: titulos,
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
            return `
            <div class="clasificacion-expediente" data-grupo="${g.clave}" data-clasificacion="${escapar(cat)}" style="margin-top:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:0 4px 6px 4px; border-bottom:1px dashed #e2e8f0; margin-bottom:8px;">
                    <span style="color:#475569; font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">${cat} (${deLaCat.length})</span>
                    ${botonSeleccion(idsCat, g.color, 'Marcar', 'Quitar')}
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

// --- 3. CREAR Y EDITAR EVALUACIONES ---

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

window.verificarRestriccionesModo = () => {
    const modeEl = document.getElementById('eval-mode-input');
    const mode = modeEl ? modeEl.value : 'self';
    const allTypeSelects = document.querySelectorAll('.inp-tipo');
    const btnAddQuestion = document.querySelector('button[onclick="agregarCampoPregunta()"]');
    const rangeLabelsDiv = document.getElementById('div-rango-labels');

    if(rangeLabelsDiv) {
        rangeLabelsDiv.style.display = 'block';
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
        if(btnAddQuestion) btnAddQuestion.innerText = `+ Agregar Pregunta Numérica (1-${maxVal})`;
    } else {
        allTypeSelects.forEach(sel => { sel.disabled = false; });
        if(btnAddQuestion) btnAddQuestion.innerText = "+ Agregar Pregunta";
    }
};

window.prepararInputCategorias = async (currentValue = '') => {
    let input = document.getElementById('eval-category-input');
    if (input && input.tagName === 'SELECT') {
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.id = 'eval-category-input';
        newInput.setAttribute('list', 'eval-category-list');
        newInput.placeholder = "Escribe o selecciona categoría...";
        newInput.style.width = '100%';
        newInput.style.padding = '12px';
        newInput.style.border = '1px solid #e2e8f0';
        newInput.style.borderRadius = '10px';
        newInput.style.background = '#f9fafb';
        newInput.style.boxSizing = 'border-box';
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

    const chkAllEmpleados = document.getElementById('chk-all-empleados');
        if(chkAllEmpleados) chkAllEmpleados.checked = true;
        window.empleadosSeleccionadosEval = [];
        if(window.toggleSelectorEmpleados) window.toggleSelectorEmpleados();
        const inpBuscar = document.getElementById('inp-buscar-empleado-eval');
        if(inpBuscar) inpBuscar.value = '';
        const resDiv = document.getElementById('lista-resultados-empleados-eval');
        if(resDiv) resDiv.innerHTML = '';

        await window.prepararInputCategorias('General');
        const modeInput = document.getElementById('eval-mode-input');
    if(modeInput) { modeInput.value = 'self'; modeInput.onchange = window.verificarRestriccionesModo; }
    document.getElementById('questions-container').innerHTML = '';
    window.agregarCampoPregunta();
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

        const chkAllEmpleados = document.getElementById('chk-all-empleados');
        let targetEmployeesData = null;

        if (evaluacion.target_employees) {
            targetEmployeesData = typeof evaluacion.target_employees === 'string' ? JSON.parse(evaluacion.target_employees) : evaluacion.target_employees;
        }

        if (targetEmployeesData && Array.isArray(targetEmployeesData) && !targetEmployeesData.includes('ALL')) {
            if (chkAllEmpleados) chkAllEmpleados.checked = false;
            window.empleadosSeleccionadosEval = targetEmployeesData.map(id => {
                const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(id));
                return { id: id, name: emp ? emp.name : `ID: ${id}` };
            });
        } else {
            if (chkAllEmpleados) chkAllEmpleados.checked = true;
            window.empleadosSeleccionadosEval = [];
        }
        if(window.toggleSelectorEmpleados) window.toggleSelectorEmpleados();

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

                const chkAllEmpleados = document.getElementById('chk-all-empleados');
                let targetEmployees = ['ALL'];

                if (chkAllEmpleados && !chkAllEmpleados.checked) {
                    if (window.empleadosSeleccionadosEval.length > 0) {
                        targetEmployees = window.empleadosSeleccionadosEval.map(e => e.id);
                    } else {
                        alert("Seleccionaste 'Personas Específicas' pero no agregaste a nadie a la lista.");
                        return;
                    }
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

        // --- LÓGICA DE PERSONAS ESPECÍFICAS PARA EVALUACIONES ---
        window.empleadosSeleccionadosEval = [];

        window.toggleSelectorEmpleados = () => {
            const chkAll = document.getElementById('chk-all-empleados');
            const container = document.getElementById('container-selector-empleados');
            if (chkAll.checked) {
                container.style.display = 'none';
            } else {
                container.style.display = 'block';
                window.renderizarEmpleadosSeleccionadosEval();
            }
        };

        window.buscarEmpleadoParaEval = (term) => {
            const resDiv = document.getElementById('lista-resultados-empleados-eval');
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
                const isSelected = window.empleadosSeleccionadosEval.some(s => String(s.id) === String(m.id));
                const btnState = isSelected ?
                    `<button disabled style="background:#f1f5f9; color:#94a3b8; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:bold;">Agregado</button>` :
                    `<button onclick="window.agregarEmpleadoEval('${m.id}', '${m.name.replace(/'/g, "\\'")}')" style="background:#7e22ce; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">+ Agregar</button>`;
                    
                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 5px; border-bottom:1px solid #f1f5f9; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <span style="font-size:0.85rem; color:#334155; font-weight:500;">${m.name} <small style="color:#94a3b8; font-weight:normal;">(${m.id})</small></span>
                    ${btnState}
                </div>`;
            }).join('');
        };

        window.agregarEmpleadoEval = (id, nombre) => {
            if (!window.empleadosSeleccionadosEval.some(e => String(e.id) === String(id))) {
                window.empleadosSeleccionadosEval.push({ id: String(id), name: nombre });
                window.renderizarEmpleadosSeleccionadosEval();
                const inp = document.getElementById('inp-buscar-empleado-eval');
                if(inp) window.buscarEmpleadoParaEval(inp.value);
            }
        };

        window.quitarEmpleadoEval = (id) => {
            window.empleadosSeleccionadosEval = window.empleadosSeleccionadosEval.filter(e => String(e.id) !== String(id));
            window.renderizarEmpleadosSeleccionadosEval();
            const inp = document.getElementById('inp-buscar-empleado-eval');
            if(inp) window.buscarEmpleadoParaEval(inp.value);
        };

        window.renderizarEmpleadosSeleccionadosEval = () => {
            const container = document.getElementById('lista-empleados-seleccionados-eval');
            if (window.empleadosSeleccionadosEval.length === 0) {
                container.innerHTML = '<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Ninguno seleccionado.</span>';
                return;
            }
            
            container.innerHTML = window.empleadosSeleccionadosEval.map(e => `
                <div style="display:flex; align-items:center; background:#f3e8ff; border:1px solid #d8b4fe; color:#6b21a8; padding:4px 10px; border-radius:20px; font-size:0.85rem; font-weight:500; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    ${e.name}
                    <button onclick="window.quitarEmpleadoEval('${e.id}')" style="background:none; border:none; color:#d946ef; font-weight:bold; margin-left:6px; cursor:pointer; font-size:1rem; line-height:1;">✕</button>
                </div>
            `).join('');
        };

        console.log("✅ Evaluaciones Admin v52: INTEGRACIÓN DE VISTA Y CALIFICACIÓN.");
