// ==========================================
// 2b-core-dashboard.js (DASHBOARD, GRÁFICAS Y DATOS)
// VERSIÓN: FIX FINAL - REAPARICIÓN DE ENCUESTAS POR FRECUENCIA + FIX LAYOUT RADAR + AREA
// ==========================================

// ==========================================
// AUTO-RESTAURAR EL MODO ADMINISTRADOR
// ==========================================
// Lo que dejó puesto la pantalla anterior —o esta misma antes de simular la
// sesión de alguien—. Las visuales las aplica `mostrarDashboard`, que mira
// `modoAdminActivo`.
if (window.modoAdminSostenido()) {
    window.modoAdminActivo = true;
}

// --- CARGA DE DATOS PARA LOGIN ---
window.cargarEmpleadosParaLogin = async () => {
    document.getElementById('login-loading').style.display = 'block';
    // Cambiamos "area" por "areas(nombre)" y filtramos inactivos
    const { data, error } = await sb.from('employees')
        .select('name, employee_id, department, areas(nombre), puesto, supervisor_id')
        .not('is_active', 'eq', false);

    if(!error && data) {
        window.empleadosLoginCache = data.map(d => ({
            name: d.name, 
            id: d.employee_id, 
            dept: d.department, 
            area: d.areas ? d.areas.nombre : "Sin Área", // Extraemos el texto de la tabla relacional
            puesto: d.puesto, 
            supId: d.supervisor_id, 
            sup: "Sin Supervisor"
        }));
        document.getElementById('login-loading').style.display = 'none';
        document.getElementById('login-form-content').style.display = 'block';
    }
};
// --- CARGAR ÚLTIMOS INCIDENTES (OPTIMIZADO CON CACHÉ Y SKELETON) ---
window.cargarUltimosIncidentes = async () => {
    const container = document.getElementById('container-ultimos-incidentes');
    if(!container) return;
    
    // 1. MOSTRAR SKELETON (CARGA) INMEDIATAMENTE
    container.style.display = 'block';
    container.innerHTML = `
        <div style="background: white; border-radius: 16px; padding: 15px; margin-top: 20px; border: 1px solid #f1f5f9;">
            <div class="skeleton" style="width: 150px; height: 15px; margin-bottom: 15px;"></div>
            <div style="display: flex; gap: 15px; overflow-x: hidden;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                    <div class="skeleton" style="width:60px; height:60px; border-radius:12px;"></div>
                    <div class="skeleton" style="width:80px; height:10px;"></div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                    <div class="skeleton" style="width:60px; height:60px; border-radius:12px;"></div>
                    <div class="skeleton" style="width:80px; height:10px;"></div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                    <div class="skeleton" style="width:60px; height:60px; border-radius:12px;"></div>
                    <div class="skeleton" style="width:80px; height:10px;"></div>
                </div>
                 <div style="display:flex; flex-direction:column; align-items:center; gap:5px;">
                    <div class="skeleton" style="width:60px; height:60px; border-radius:12px;"></div>
                    <div class="skeleton" style="width:80px; height:10px;"></div>
                </div>
            </div>
        </div>
    `;

    const now = Date.now();
    const isCacheValid = (now - window.CACHE_DASHBOARD.timestamp) < window.CACHE_DASHBOARD.TTL;

    let data = [];
    if (isCacheValid && window.CACHE_DASHBOARD.ultimos) {
        data = window.CACHE_DASHBOARD.ultimos;
    } else {
        const { data: dbData, error } = await sb.from('incidents')
            .select('id, title, date, tipo, grado')
            .eq('tipo', 'Incidente')
            .order('date', { ascending: false })
            .limit(5);

        if (error || !dbData || dbData.length === 0) {
            container.style.display = 'none';
            return;
        }
        data = dbData;
        window.CACHE_DASHBOARD.ultimos = data;
    }

    let html = `
        <div style="background: white; border-radius: 16px; padding: 15px 15px 20px 15px; margin-top: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;">
            <h3 style="margin: 0 0 15px 5px; color:#ef4444; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">🚨 Últimos Incidentes</h3>
            <div style="display: flex; flex-direction: row; gap: 15px; overflow-x: auto; padding-bottom: 5px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
    `;
    data.forEach(inc => {
        let badgeHtml = '';
        if (inc.grado) {
            const gradoTexto = inc.grado.replace('Incidente ', '').trim();
            badgeHtml = `<div style="position: absolute; top: 0; right: 0; background: #dc2626; color: white; font-size: 0.65rem; font-weight: 800; padding: 1px 4px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); border: 1px solid white; z-index: 5;">${gradoTexto}</div>`;
        }
        html += `
        <div onclick="window.verIncidenteUnico('${inc.id}')" style="min-width: 100px; width: 100px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; flex-shrink: 0;">
            <div style="position: relative; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
                <img src="Incidente.png" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1));">
                ${badgeHtml}
            </div>
            <div style="font-weight:600; color:#475569; font-size:0.75rem; line-height:1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${inc.title}</div>
        </div>`;
    });
    html += `   </div></div>`;
    container.innerHTML = html;
};

// --- CARGAR ACCESOS DIRECTOS (FILTRADOS POR ADMIN) ---
window.cargarAccesosDirectos = async (vista = 'MAIN') => {
    const container = document.getElementById('container-accesos-directos');
    if(!container) return;
    
    container.style.display = 'block';

    if (vista !== 'MAIN') {
        container.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 15px; margin-top: 10px; border: 1px solid #f1f5f9;">
                <div class="skeleton" style="width: 180px; height: 15px; margin-bottom: 15px;"></div>
                <div style="display: flex; gap: 15px; overflow-x: hidden;">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:5px;"><div class="skeleton" style="width:60px; height:60px; border-radius:16px;"></div><div class="skeleton" style="width:70px; height:10px;"></div></div>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:5px;"><div class="skeleton" style="width:60px; height:60px; border-radius:16px;"></div><div class="skeleton" style="width:70px; height:10px;"></div></div>
                </div>
            </div>
        `;
    }

    try {
        // 🔥 Obtenemos el título de la BD buscando en la nueva columna 'texto'
        if (window.configTituloAccesos === undefined) {
            const { data: configRows } = await sb.from('system_config').select('texto').eq('key', 'titulo_accesos_directos');
            window.configTituloAccesos = (configRows && configRows.length > 0 && configRows[0].texto) ? configRows[0].texto : '🚀 Accesos Directos';
        }
        const tituloSeccion = window.configTituloAccesos;

        // NIVEL 1: MENÚ PRINCIPAL DE CATEGORÍAS
        if (vista === 'MAIN') {
            let html = `
                <div style="background: white; border-radius: 16px; padding: 15px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;">
                    <h3 style="margin: 0 0 15px 5px; color:#0f766e; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">${tituloSeccion}</h3>
                    
                    <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                        
                        <div onclick="window.cargarAccesosDirectos('ENCUESTAS')" style="flex: 1; min-width: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 16px; padding: 20px 10px; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                            <div style="font-size: 2.5rem; margin-bottom: 8px;">📋</div>
                            <div style="font-weight: 700; color: #6d28d9; font-size: 0.95rem;">Encuestas</div>
                            <div style="font-size: 0.7rem; color: #8b5cf6; margin-top: 4px; font-weight: 600;">Ver destacadas</div>
                        </div>

                        <div onclick="window.cargarAccesosDirectos('CAPACITACIONES')" style="flex: 1; min-width: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 16px; padding: 20px 10px; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                            <div style="font-size: 2.5rem; margin-bottom: 8px;">📚</div>
                            <div style="font-weight: 700; color: #0369a1; font-size: 0.95rem;">Capacitaciones</div>
                            <div style="font-size: 0.7rem; color: #0ea5e9; margin-top: 4px; font-weight: 600;">Ver destacadas</div>
                        </div>

                    </div>
                </div>
            `;
            container.innerHTML = html;
            return;
        }

        // NIVEL 2: VISTA DETALLADA DE UNA CATEGORÍA
        let items = [];
        let tituloMenu = "";
        let colorMenu = "";

        if (vista === 'ENCUESTAS') {
            tituloMenu = "📋 Encuestas Destacadas";
            colorMenu = "#7c3aed";
            const { data: encuestas } = await sb.from('evaluations')
                .select('id, title')
                .eq('active', true)
                .eq('destacado', true);

            if (encuestas) {
                encuestas.forEach(e => items.push({
                    id: e.id, title: e.title, type: 'Encuesta', icon: '📋', color: '#7c3aed',
                    action: `window.targetUserForEval=null; window.responderDirecto('${e.id}', '${e.title.replace(/'/g, "\\'")}', 'self')`
                }));
            }
        } else if (vista === 'CAPACITACIONES') {
            tituloMenu = "📚 Capacitaciones Destacadas";
            colorMenu = "#0ea5e9";
            const { data: capacitaciones } = await sb.from('incidents')
                .select('*')
                .eq('tipo', 'Capacitación')
                .eq('destacado', true)
                .order('date', { ascending: false });

            window.incidentCache = window.incidentCache || {};
            
            if (capacitaciones) {
                capacitaciones.forEach(c => {
                    window.incidentCache[c.id] = c;
                    items.push({
                        id: c.id, title: c.title, type: 'Capacitación', icon: '📚', color: '#0ea5e9',
                        action: `window.abrirDetalleIndependiente('${c.id}')`
                    });
                });
            }
        }

        let html = `
            <div style="background: white; border-radius: 16px; padding: 15px 15px 20px 15px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <button onclick="window.cargarAccesosDirectos('MAIN')" style="background: #f1f5f9; border: none; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-right: 10px; color: #475569; font-weight: bold; transition: background 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">⬅</button>
                    <h3 style="margin: 0; color:${colorMenu}; font-size:0.95rem; font-weight:700;">${tituloMenu}</h3>
                </div>
        `;

        if (items.length === 0) {
            html += `
                <div style="text-align: center; color: #94a3b8; padding: 25px 20px; font-size: 0.85rem; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
                    Aún no hay elementos destacados en esta categoría.
                </div></div>`;
            container.innerHTML = html;
            return;
        }

        html += `
                <div class="hide-scrollbar" style="display: flex; flex-direction: row; gap: 15px; overflow-x: auto; padding: 10px 5px; margin-top: -5px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
        `;

        items.forEach(item => {
            html += `
            <div onclick="${item.action}" style="min-width: 100px; width: 100px; display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; flex-shrink: 0; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <div style="position: relative; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; background: ${item.color}15; border-radius: 16px; border: 1px solid ${item.color}30; font-size: 1.8rem;">
                    ${item.icon}
                </div>
                <div style="font-weight:600; color:#475569; font-size:0.75rem; line-height:1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">${item.title}</div>
            </div>`;
        });

        html += `   </div></div>`;
        container.innerHTML = html;

    } catch (error) {
        console.error("Error cargando accesos directos:", error);
        container.innerHTML = `<div style="color:#ef4444; text-align:center; padding:10px;">Ocurrió un error al cargar los datos.</div>`;
    }
};

// --- MODAL DE ADMINISTRACIÓN DE ACCESOS DIRECTOS ---
window.abrirModalAccesos = async () => {
    const modal = document.getElementById('modal-gestionar-accesos');
    const container = document.getElementById('lista-gestionar-accesos');
    if(!modal || !container) return;
    
    modal.style.display = 'flex';
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;"><div class="spinner" style="margin:0 auto 10px auto;"></div>Buscando registros...</div>';

    try {
        // 🔥 Buscamos el título de forma segura en la nueva columna 'texto'
        const { data: configRows } = await sb.from('system_config').select('texto').eq('key', 'titulo_accesos_directos');
        const tituloActual = (configRows && configRows.length > 0 && configRows[0].texto) ? configRows[0].texto : '🚀 Accesos Directos';

        const { data: encuestas } = await sb.from('evaluations').select('id, title, destacado').eq('active', true);
        const { data: cap } = await sb.from('incidents').select('id, title, destacado').eq('tipo', 'Capacitación').order('date', { ascending: false }).limit(20);

        let html = `
            <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:20px;">
                <label style="font-weight:bold; color:#334155; font-size:0.9rem; display:block; margin-bottom:8px;">✏️ Título del Menú:</label>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="inp-titulo-accesos" value="${tituloActual}" placeholder="Ej. 🚀 Accesos Directos" style="flex:1; padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.9rem; outline:none;">
                    <button onclick="window.guardarTituloAccesos()" style="background:#0ea5e9; color:white; border:none; padding:10px 15px; border-radius:8px; font-weight:bold; cursor:pointer; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">Guardar</button>
                </div>
            </div>
        `;

        html += '<h3 style="margin:0; color:#7c3aed; font-size:1rem; border-bottom:1px solid #ddd6fe; padding-bottom:5px;">📋 Encuestas Activas</h3>';
        if(encuestas && encuestas.length > 0){
            encuestas.forEach(e => {
                const isChecked = e.destacado ? 'checked' : '';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:5px;">
                    <span style="font-size:0.9rem; font-weight:500; color:#334155;">${e.title}</span>
                    <input type="checkbox" ${isChecked} onchange="window.toggleAccesoDestacado('evaluations', '${e.id}', this.checked)" style="width:20px; height:20px; accent-color:#7c3aed; cursor:pointer;">
                </div>`;
            });
        } else { html += '<p style="font-size:0.8rem; color:#94a3b8;">No hay encuestas activas.</p>'; }

        html += '<h3 style="margin:20px 0 10px 0; color:#0ea5e9; font-size:1rem; border-bottom:1px solid #bae6fd; padding-bottom:5px;">📚 Capacitaciones Recientes</h3>';
        if(cap && cap.length > 0){
            cap.forEach(c => {
                const isChecked = c.destacado ? 'checked' : '';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:5px;">
                    <span style="font-size:0.9rem; font-weight:500; color:#334155;">${c.title}</span>
                    <input type="checkbox" ${isChecked} onchange="window.toggleAccesoDestacado('incidents', '${c.id}', this.checked)" style="width:20px; height:20px; accent-color:#0ea5e9; cursor:pointer;">
                </div>`;
            });
        } else { html += '<p style="font-size:0.8rem; color:#94a3b8;">No hay capacitaciones registradas.</p>'; }

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div style="color:#ef4444; text-align:center;">Error: ${error.message}</div>`;
    }
};

window.guardarTituloAccesos = async () => {
    const input = document.getElementById('inp-titulo-accesos');
    if (!input) return;
    
    const nuevoTitulo = input.value.trim() || '🚀 Accesos Directos';

    try {
        // Buscamos si ya existe el registro (sin causar error 406)
        const { data: configRows, error: searchError } = await sb.from('system_config')
            .select('key')
            .eq('key', 'titulo_accesos_directos');
            
        if (searchError) throw searchError;

        if (configRows && configRows.length > 0) {
            // Actualizamos SOLO la nueva columna 'texto'
            const { error: updateError } = await sb.from('system_config')
                .update({ texto: nuevoTitulo })
                .eq('key', 'titulo_accesos_directos');
            if (updateError) throw updateError;
        } else {
            // Insertamos usando la nueva columna 'texto'
            const { error: insertError } = await sb.from('system_config')
                .insert([{ key: 'titulo_accesos_directos', texto: nuevoTitulo }]);
            if (insertError) throw insertError;
        }

        window.configTituloAccesos = nuevoTitulo; // Actualiza la caché
        alert("✅ Título actualizado correctamente.");
        window.cargarAccesosDirectos('MAIN'); // Recarga el dashboard
        
    } catch(e) {
        console.error("Error detallado desde Supabase:", e);
        alert("Ocurrió un error al guardar el título. Revisa la consola.");
    }
};

window.toggleAccesoDestacado = async (tabla, id, valorBoolean) => {
    try {
        await sb.from(tabla).update({ destacado: valorBoolean }).eq('id', id);
        // Recargar en tiempo real la vista del dashboard
        window.cargarAccesosDirectos();
    } catch(e) {
        console.error("Error actualizando destacado", e);
        alert("Error al guardar el cambio en la base de datos.");
    }
};

// ==========================================
// RADAR GENERAL DASHBOARD (HEADER)
// ==========================================
window.cargarRadarGeneralDashboard = async (userId) => {
    const radarContainer = document.getElementById('header-radar-container');
    const skeletonOverlay = document.getElementById('radar-loading-skeleton');
    const canvas = document.getElementById('dashboard-main-radar');
    
    if(!radarContainer || !canvas) return;

    try {
        const { data: activeEvals } = await sb.from('evaluations')
            .select('id, title, category, target_positions, is_obligatory')
            .eq('active', true);
        const { data: responses } = await sb.from('evaluation_responses')
    .select('evaluation_id, grades_json, review_status, submitted_at')
    .eq('employee_id', userId)
    .in('review_status', ['Revisado', 'Certificada']) // 🔥 Agregamos Certificada
    .order('submitted_at', { ascending: false });

        const uniqueResponsesMap = {};
        if (responses) {
            responses.forEach(r => {
                const key = r.evaluation_id;
                if (!uniqueResponsesMap[key]) {
                    uniqueResponsesMap[key] = r;
                }
            });
        }
        const uniqueResponses = Object.values(uniqueResponsesMap);

        let userPuesto = "SIN PUESTO";
        if (window.todosLosEmpleadosData) {
            const empData = window.todosLosEmpleadosData.find(e => String(e.id) === String(userId));
            if (empData) userPuesto = (empData.puesto || "").toUpperCase().trim();
        } else {
            const localUser = JSON.parse(localStorage.getItem("usuarioLogueado"));
            if (localUser && String(localUser.id) === String(userId)) {
                userPuesto = (localUser.puesto || "").toUpperCase().trim();
            }
        }

        const validScores = [];

        if (activeEvals) {
            activeEvals.forEach(evalObj => {
                let targets = evalObj.target_positions;
                if (typeof targets === 'string') {
                    try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; }
                }
                if (!Array.isArray(targets)) targets = ['ALL'];

                let isApplicable = false;
                if (targets.length === 0 || targets.includes('ALL')) {
                    isApplicable = true;
                } else {
                    const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
                    if (targetsNorm.includes(userPuesto)) isApplicable = true;
                }

                if (!isApplicable) return;

                const isObligatory = (evalObj.is_obligatory !== false);
                const response = uniqueResponses.find(r => r.evaluation_id === evalObj.id);
                const cat = evalObj.category || "General";
                const title = evalObj.title || "Sin Título";

                if (response) {
                    let totalPts = 0, maxPts = 0;
                    const grades = response.grades_json || {};
                    Object.values(grades).forEach(g => {
                        maxPts++;
                       if (g.type === 'list_match' && Array.isArray(g.items)) {
    const aciertos = g.items.filter(i => i.status === 'correct').length;
    const tot = g.totalExpected || Math.max(g.items.length, 1); // 🔥 Calcula en base al total esperado
    totalPts += (aciertos / tot);
} else if (g.type === 'numeric_score') {
                             totalPts += (g.percentage / 100);
                        } else {
                            const status = (typeof g === 'object') ? g.status : g;
                            if (status === 'correct') totalPts++;
                        }
                    });
                    
                    const score = maxPts > 0 ? (totalPts / maxPts) * 100 : 0;
                    validScores.push({ title, category: cat, score });

                } else if (isObligatory) {
                    validScores.push({ title, category: cat, score: 0 });
                }
            });
        }

        if (validScores.length === 0) {
            radarContainer.style.display = 'none';
            return;
        }

        const categoryGroups = {};
        validScores.forEach(item => {
            if (!categoryGroups[item.category]) categoryGroups[item.category] = [];
            categoryGroups[item.category].push(item);
        });

        const uniqueCategories = Object.keys(categoryGroups).sort();
        
        let finalLabels = [];
        let finalDataPoints = [];
        let catTitle = "";

        if (uniqueCategories.length === 1) {
            const catName = uniqueCategories[0];
            catTitle = catName;
            const surveys = categoryGroups[catName];
            
            surveys.forEach(s => {
                const words = s.title.split(' ');
                const lines = [];
                while(words.length > 0) lines.push(words.splice(0, 4).join(' '));
                lines.push(`${Math.round(s.score)}%`);
                
                finalLabels.push(lines);
                finalDataPoints.push(Math.round(s.score));
            });
            
        } else {
            uniqueCategories.forEach(cat => {
                const surveys = categoryGroups[cat];
                const sum = surveys.reduce((a, b) => a + b.score, 0);
                const avg = Math.round(sum / surveys.length);
                
                const words = cat.split(' ');
                const lines = [];
                while(words.length > 0) lines.push(words.splice(0, 4).join(' '));
                lines.push(`${avg}%`);

                finalLabels.push(lines);
                finalDataPoints.push(avg);
            });
        }

        let titleEl = document.getElementById('radar-single-cat-title');
        if (!titleEl) {
            titleEl = document.createElement('div');
            titleEl.id = 'radar-single-cat-title';
            titleEl.style.cssText = "position:absolute; top:5px; left:0; width:100%; text-align:center; font-size:0.75rem; color:#64748b; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; z-index:5;";
            radarContainer.appendChild(titleEl);
        }
        
        if (catTitle) {
            titleEl.innerText = catTitle;
            titleEl.style.display = 'block';
        } else {
            titleEl.style.display = 'none';
        }

        radarContainer.style.display = 'block';
        if(skeletonOverlay) skeletonOverlay.style.display = 'none';

        if (window.dashboardRadarInstance) window.dashboardRadarInstance.destroy();

        window.dashboardRadarInstance = new Chart(canvas.getContext('2d'), {
            type: 'radar',
            data: {
                labels: finalLabels,
                datasets: [{
                    data: finalDataPoints,
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    borderColor: '#22c55e',
                    pointBackgroundColor: '#166534',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: 25 },
                scales: {
                    r: {
                        angleLines: { display: false },
                        grid: { color: '#f1f5f9' },
                        pointLabels: {
                            font: { size: 9, weight: 'bold' },
                            color: '#334155',
                            display: true,
                            padding: 8
                        },
                        suggestedMin: 0,
                        suggestedMax: 100,
                        ticks: { display: false }
                    }
                },
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            },
            plugins: [{
                id: 'centerTextPlugin',
                afterDatasetsDraw(chart) {
                    const { ctx } = chart;
                    const data = chart.data.datasets[0].data;
                    const sum = data.reduce((a, b) => a + b, 0);
                    const avg = data.length > 0 ? Math.round(sum / data.length) : 0;
                    
                    const x = chart.scales.r.xCenter;
                    const y = chart.scales.r.yCenter;
                    
                    ctx.save();
                    ctx.font = "bold 0.9rem -apple-system, BlinkMacSystemFont, sans-serif";
                    ctx.fillStyle = "#166534";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.lineWidth = 2.5;
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                    ctx.strokeText(avg + "%", x, y);
                    ctx.fillText(avg + "%", x, y);
                    ctx.restore();
                }
            }]
        });

    } catch (e) {
        console.error("Error radar dashboard header:", e);
        radarContainer.style.display = 'none';
    }
};

// ==========================================
// EL PANEL DEL USUARIO SE PLIEGA
// ==========================================
// Contraído se ve sólo quién es —la foto y el nombre—, que es lo que se mira
// de pasada; el radar sale al tocarlo. En un
// teléfono se llevaban media pantalla del panel todos los días para algo que
// se consulta de vez en cuando, y empujaban abajo los pendientes y los
// accesos, que es a lo que se entra.
//
// Lo elegido se recuerda: a quien le guste ver su radar no tiene que abrirlo
// en cada recarga —y con el botón de actualizar del encabezado, recargar es
// cosa de todos los días—. Un navegador que no deje escribir en
// `localStorage` se comporta como si estuviera contraído, que es el estado
// de entrada.
window.LLAVE_PANEL_USUARIO = 'panelUsuarioAbierto';

window.panelUsuarioAbierto = () => {
    try { return localStorage.getItem(window.LLAVE_PANEL_USUARIO) === '1'; }
    catch (e) { return false; }
};

window.aplicarPanelUsuario = (abierto) => {
    const panel = document.getElementById('main-user-header');
    if (!panel) return;
    panel.classList.toggle('esta-contraido', !abierto);

    // La flecha no tiene texto, así que lo que hace lo dicen su `title` y su
    // `aria-label`; nunca con `innerText`, que borraría el <svg> de dentro.
    const btn = document.getElementById('btn-panel-usuario');
    if (btn) {
        const texto = abierto ? 'Ocultar mi resumen' : 'Ver mi resumen';
        btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        btn.title = texto;
        btn.setAttribute('aria-label', texto);
    }

    // Chart mide el lienzo al dibujarlo y contraído mide cero, así que al
    // abrirse hay que pedirle que vuelva a medir o el radar sale en blanco.
    if (abierto && window.dashboardRadarInstance) {
        requestAnimationFrame(() => {
            try { window.dashboardRadarInstance.resize(); } catch (e) {}
        });
    }
};

window.alternarPanelUsuario = () => {
    const abierto = !window.panelUsuarioAbierto();
    try { localStorage.setItem(window.LLAVE_PANEL_USUARIO, abierto ? '1' : '0'); }
    catch (e) {}
    window.aplicarPanelUsuario(abierto);
};

// ==========================================
// LA TARJETA DEL MODO ADMINISTRADOR
// ==========================================
// Con el modo encendido, la tarjeta de arriba deja de ser la de quien entró:
// ahí no se está mirando el panel de nadie en particular —se administra— y
// seguir enseñando su foto, su nombre y su badge de pendientes se lee como si
// el modo no hubiera cambiado nada.
//
// No lleva chevron ni `.panel-usuario-detalle`: lo que se plegaba era el radar,
// que es de una persona. Tampoco es pulsable, que el modo se apaga donde se
// encendió —el título— y es lo que dice su renglón.
window.tarjetaDeAdministrador = () => `
    <div class="tarjeta-admin">
        <div class="tarjeta-admin-icono">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3l7 3v5c0 4.4-2.9 8.4-7 10-4.1-1.6-7-5.6-7-10V6l7-3z"/>
                <path d="M9 11.8l2 2 4-4"/>
            </svg>
        </div>
        <div style="min-width:0;">
            <div class="tarjeta-admin-titulo">Administrador</div>
            <div class="tarjeta-admin-nota">Modo administrador activo · toca el título de arriba para salir</div>
        </div>
    </div>`;

// La pone en el encabezado y deshace lo que hubiera dejado el panel del
// usuario: la marca de plegado no tiene aquí nada que esconder.
window.pintarTarjetaAdmin = (userHeader) => {
    if (!userHeader) return;
    userHeader.classList.remove('esta-contraido');
    userHeader.innerHTML = window.tarjetaDeAdministrador();
};

window.mostrarDashboard = async (user) => {
    document.getElementById('vista-login').classList.add('hidden');
    document.getElementById('vista-dashboard').classList.remove('hidden');

    const userHeader = document.getElementById('main-user-header');
    const radarContainer = document.getElementById('header-radar-container');
    const quickTeam = document.getElementById('quick-team-view');
    const btnLogout = document.getElementById('btn-logout');

    if(userHeader) {
        userHeader.style.display = 'block';
        userHeader.style.padding = '15px';
        // La tarjeta del administrador no espera a ninguna consulta, así que se
        // dibuja ya: el esqueleto del perfil enseñaría un instante el hueco de
        // la foto y el nombre de quien entró, que es de lo que se sale aquí.
        if (window.modoAdminActivo) {
            window.pintarTarjetaAdmin(userHeader);
        } else {
            userHeader.innerHTML = `
                <div class="panel-usuario-resumen">
                    <div class="skeleton" style="width:60px; height:60px; border-radius:50%; flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div class="skeleton" style="width: 50%; height: 20px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 30%; height: 14px;"></div>
                    </div>
                </div>
                <div class="panel-usuario-detalle" style="width: 100%; padding-top: 10px;">
                     <div id="header-radar-container" style="display:block; width: 100%; max-width: 400px; height: 210px; margin: 0 auto; position: relative;">
                        <div id="radar-loading-skeleton" class="skeleton" style="width: 190px; height: 190px; border-radius: 50%; opacity: 0.5; position: absolute; top:10px; left: 50%; transform: translateX(-50%); z-index:10;"></div>
                        <canvas id="dashboard-main-radar"></canvas>
                     </div>
                </div>
            `;
            window.aplicarPanelUsuario(window.panelUsuarioAbierto());
        }
    }

    if (quickTeam) {
        quickTeam.style.display = 'flex';
        quickTeam.style.flexWrap = 'wrap';
        quickTeam.style.justifyContent = 'center';
        quickTeam.innerHTML = '';
        for(let i=0; i<5; i++){
            quickTeam.innerHTML += `
                <div style="display:flex; flex-direction:column; align-items:center; gap:5px; min-width:60px;">
                    <div class="skeleton" style="width:50px; height:50px; border-radius:50%;"></div>
                    <div class="skeleton" style="width:40px; height:10px;"></div>
                </div>
            `;
        }
    }

    if(btnLogout) {
        btnLogout.style.display = '';
        if(btnLogout.parentElement) btnLogout.parentElement.style.display = '';
    }

    const searchBar = document.getElementById('search-bar-container');
    if (searchBar) {
        searchBar.style.display = 'none';
        document.getElementById('search-input-text').value = '';
        document.getElementById('search-input-date').value = '';
    }

    const title = document.getElementById('app-title');
    window.pintarBotonAdmin();
    if(title) title.style.color = window.modoAdminActivo ? '#d32f2f' : '';

if (!window.empleadosLoginCache || window.empleadosLoginCache.length === 0) {
        // Cambiamos "area" por "areas(nombre)" y filtramos inactivos
        const { data, error } = await sb.from('employees')
            .select('name, employee_id, department, areas(nombre), puesto, supervisor_id')
            .not('is_active', 'eq', false);

        if (data && !error) {
            window.empleadosLoginCache = data.map(d => ({
                name: d.name, 
                id: d.employee_id, 
                dept: d.department, 
                area: d.areas ? d.areas.nombre : "Sin Área", // Extraemos el texto
                puesto: d.puesto, 
                supId: d.supervisor_id, 
                sup: "Sin Supervisor"
            }));
        }
    }

    setTimeout(async () => {
        if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
            await window.cargarDatosEmpleados();
        }

        let avatarUrl = null;
        let currentUserData = null;
        if (window.todosLosEmpleadosData) {
            currentUserData = window.todosLosEmpleadosData.find(e => String(e.id) === String(user.id));
            if (currentUserData) avatarUrl = currentUserData.avatar;
        }
        
        let headerAvatarHtml = '👤';
        let headerBgStyle = 'background:#eff6ff; border:2px solid #bfdbfe; padding:0;';
        
        if (avatarUrl) {
            const safeUrl = window.procesarUrlImagen(avatarUrl);
            headerAvatarHtml = `<img src="${safeUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
            headerBgStyle = 'background:white; border:2px solid #bfdbfe; padding:0;';
        }

        if (userHeader && window.modoAdminActivo) {
            // Administrando no hay perfil que enseñar, y por lo mismo no hay
            // radar que pedir: esas dos consultas son de una persona. El equipo
            // sí se dibuja, que es de lo que el modo enseña de más.
            userHeader.style.display = 'block';
            window.pintarTarjetaAdmin(userHeader);
            window.renderizarVistaRapidaEquipo(false);
        } else if (userHeader) {
            // FIX DEFINITIVO: Forzamos la visualización en bloque aquí también
            userHeader.style.display = 'block';
            
            userHeader.innerHTML = `
                <!-- Contraído, esto es todo lo que se ve. Toda la fila abre y
                     cierra; la foto se queda con lo suyo y por eso corta la
                     propagación. -->
                <div class="panel-usuario-resumen" onclick="window.alternarPanelUsuario()">
                    
                    <div id="header-user-info" style="min-width: 0; flex: 1;">
                        <!-- El flotado va en el envoltorio y no en la foto,
                             que es lo que hace que el nombre y el puesto la
                             rodeen. -->
                        <div style="float: left; margin-right: 15px;">
                            <div id="header-user-icon" onclick="event.stopPropagation(); window.abrirStatsEmpleado('${user.id}', '${user.name}', '${user.puesto || 'Colaborador'}')"
                                    style="width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); cursor:pointer; position:relative; flex-shrink:0; ${headerBgStyle}">
                                ${headerAvatarHtml}
                                <div id="badge-count-${user.id}" class="notification-badge" style="display:none;">0</div>
                            </div>
                        </div>

                        <div style="overflow: hidden;">
                            <div class="user-name-display" style="font-size: clamp(1rem, 5vw, 1.3rem); font-weight: 700; color: #1e293b; line-height: 1.1; word-wrap: break-word;">
                                ${user.name}
                            </div>
                            
                            <div class="user-meta-display" style="font-size: clamp(0.7rem, 3.5vw, 0.85rem); color: #64748b; margin-top: 4px; line-height: 1.2;">
                                <span style="font-weight: 600; color: #334155;">${user.puesto || 'Colaborador'}</span>
                                <span style="margin: 0 4px; color: #cbd5e1;">|</span>
                                <span>${user.dept || 'General'}</span>
                                ${user.area ? `<span style="margin: 0 4px; color: #cbd5e1;">|</span><span>${user.area}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <button id="btn-panel-usuario" class="ios-boton-icono panel-usuario-chevron"
                            onclick="event.stopPropagation(); window.alternarPanelUsuario();"
                            aria-expanded="false" title="Ver mi resumen" aria-label="Ver mi resumen">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
                             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </button>
                </div>

                <div class="panel-usuario-detalle" style="width: 100%; padding-top: 10px;">
                     <div id="header-radar-container" style="display:block; width: 100%; max-width: 450px; height: 260px; margin: 0 auto; position: relative;">
                        <div id="radar-loading-skeleton" class="skeleton" style="width: 190px; height: 190px; border-radius: 50%; opacity: 0.5; position: absolute; top:20px; left: 50%; transform: translateX(-50%); z-index:10;"></div>
                        <canvas id="dashboard-main-radar"></canvas>
                     </div>
                </div>
            `;
            window.aplicarPanelUsuario(window.panelUsuarioAbierto());
            
            window.renderizarVistaRapidaEquipo(false);
            window.cargarRadarGeneralDashboard(user.id);
        }
    }, 100);

    document.getElementById('init-load-container').style.display = 'block';
    
    const topPendientes = document.getElementById('top-pendientes-container');
    if(topPendientes) topPendientes.style.display = 'flex';

    document.getElementById('global-stats').classList.add('hidden');
    document.getElementById('btn-volver').style.display = 'none';
    
    document.getElementById('container-incidentes').innerHTML = '';
    document.getElementById('container-incidentes').style.display = 'block';
    document.getElementById('container-evaluaciones').style.display = 'none';
    document.getElementById('container-evaluaciones-historial').style.display = 'none';
    
    const btnMas = document.getElementById('btn-mas');
    if(btnMas) btnMas.style.display = 'none';
    
    window.mostrandoPendientes = false;
    window.mostrandoPendientesEquipo = false;
    window.tempIdFiltro = null;
    
    
    window.cargarAccesosDirectos(); // LLAMADA RESTAURADA Y AGREGADA AQUÍ

    setTimeout(() => {
        window.calcularPendientesBatch([user.id]);
    }, 500);

    window.cargarEncuestasAsignadas(user.id);
    window.cargarEncuestasQueReviso(user.id);
};

// ==========================================
// LAS ENCUESTAS ASIGNADAS A ESTA PERSONA
// ==========================================
// Debajo del botón de pendientes: cuáles le tocan, cómo va con cada una y qué
// sacó. El botón dice cuántas faltan pero no cuáles, y la lista de encuestas
// está dos toques más adentro. Aquí salen todas las suyas, **también las que
// ya contestó**: una lista donde todo dice «al día» es lo que deja tranquilo,
// y una lista vacía no distingue entre no deber nada y no tener nada asignado.
//
// Van **agrupadas por clasificación**, que es como se mira el resultado: se
// certifica de una clasificación entera y no de una encuesta suelta, así que
// una lista plana obliga a rearmar el grupo de cabeza para saber cómo va
// «Seguridad». Cada encuesta contestada lleva su puntaje del periodo, y el
// encabezado de la tarjeta, el promedio de lo ya calificado.
//
// No decide nada por su cuenta. A quién le toca cada encuesta lo dice
// `leTocaEstaEncuesta` y en qué estado está, `esEvaluacionPendiente` —las
// mismas dos reglas del badge del panel y del panel de pendientes—, así que
// esta tarjeta no puede discrepar de lo que digan ellos. Lo único suyo es cómo
// se llama cada estado.
window.estadoDeAsignada = (v) => {
    const verde = { fondo: '#f0fdf4', color: '#15803d', borde: '#bbf7d0' };
    const rojo  = { fondo: '#fee2e2', color: '#b91c1c', borde: '#fecaca' };
    const ambar = { fondo: '#fef3c7', color: '#b45309', borde: '#fde68a' };

    if (!v || !v.mostrar) return Object.assign({ texto: 'Al día', listo: true }, verde);

    switch (v.tipoAviso) {
        case 'nunca':        return Object.assign({ texto: 'Sin contestar' }, rojo);
        case 'vencida':      return Object.assign({ texto: 'Vencida' }, rojo);
        case 'mal_revisada': return Object.assign({ texto: 'Mal revisada' }, rojo);
        case 'reintento':    return Object.assign({ texto: 'Repetir' }, v.vencida ? rojo : ambar);
        case 'por_vencer': {
            const d = v.diasFaltantes;
            const texto = d <= 0 ? 'Vence hoy' : (d === 1 ? 'Vence mañana' : `Vence en ${d} días`);
            return Object.assign({ texto }, ambar);
        }
        default:             return Object.assign({ texto: 'Pendiente' }, v.vencida ? rojo : ambar);
    }
};

// El estado va como icono a la izquierda del renglón y no como etiqueta a la
// derecha: con siete encuestas al día, siete «Al día» en fila son siete veces
// la misma palabra ocupando la mitad del ancho, y lo que se busca de un vistazo
// es la que **no** lo tiene. Una palomita se lee sin leerla; lo que falta se
// distingue por la forma —un círculo abierto con su admiración— y no sólo por
// el color, que es lo que hay que hacer para que no dependa de distinguir el
// verde del rojo. Lo que decía la etiqueta no se pierde: va al renglón de abajo
// en las que faltan, y al `title` de la fila siempre.
window.iconoDeAsignada = (estado) => {
    const comun = 'width="20" height="20" viewBox="0 0 24 24" style="flex-shrink:0; display:block;" aria-hidden="true"';

    // Lo neutro va antes que nada: es la encuesta que no es de quien mira —la
    // de otra persona, en la lista del administrador—, y ahí ni la palomita ni
    // el círculo abierto dicen la verdad. El trazo a rayas se distingue por la
    // forma de los otros dos y no sólo por el gris.
    if (estado.neutro) {
        return `<svg ${comun}>
            <circle cx="12" cy="12" r="9.6" fill="none" stroke="${estado.color}" stroke-width="2"
                    stroke-dasharray="3.2 3.2"></circle>
        </svg>`;
    }

    if (estado.listo) {
        return `<svg ${comun}>
            <circle cx="12" cy="12" r="10" fill="${estado.color}"></circle>
            <path d="M7.5 12.4l3 3 6-6.6" fill="none" stroke="white" stroke-width="2.4"
                  stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>`;
    }

    return `<svg ${comun}>
        <circle cx="12" cy="12" r="9.6" fill="none" stroke="${estado.color}" stroke-width="2"></circle>
        <path d="M12 7.2v5.6" fill="none" stroke="${estado.color}" stroke-width="2.2" stroke-linecap="round"></path>
        <circle cx="12" cy="16.6" r="1.3" fill="${estado.color}"></circle>
    </svg>`;
};

// ==========================================
// LA MISMA TARJETA, PERO DE TODA LA EMPRESA
// ==========================================
// En modo administrador la tarjeta de encuestas del inicio deja de ser la de
// quien mira —ahí no se está mirando el panel de nadie— y pasa a listar las
// encuestas activas de la empresa con su resultado. Es la misma tarjeta, los
// mismos grupos y el mismo plegado: lo que cambia es de quién habla cada
// renglón.
//
// El promedio es el **del periodo que corre** de cada encuesta, que es lo mismo
// que la tarjeta enseña de una persona, sólo que de todo el mundo. Eso además
// acota la consulta: el historial entero de 455 personas no cabe en el arranque
// de un panel.
window.MAX_PAGINAS_RESPUESTAS = 6;   // 6000 filas, el tope de esta pantalla

// El ritmo del eje de la gráfica de la tarjeta. Va fijo y no sale de las
// encuestas: la tarjeta habla de todas las de la empresa a la vez, y el mes es
// la unidad con la que se lee «cómo vamos». Lo miran la gráfica y el `gte` de
// la consulta, que tienen que cubrir lo mismo.
window.RITMO_GRAFICA_EMPRESA = 'monthly';

// Las respuestas de todos desde el periodo más temprano en juego. PostgREST no
// devuelve más de mil por consulta, así que se pagina; el tope existe porque
// una encuesta anual arrastra el `gte` hasta enero y con ella el año entero.
// Quien llega al tope lo dice en pantalla en vez de enseñar un promedio corto
// como si fuera el bueno.
window.respuestasDelPeriodoDeTodos = async (encuestas, ahora, frecuencia) => {
    const ids = (encuestas || []).map(e => e.id);
    if (ids.length === 0) return { respuestas: [], tope: false };

    // El más temprano de los periodos vigentes: dentro se filtra encuesta por
    // encuesta con el suyo.
    let desde = null;
    encuestas.forEach(ev => {
        const p = window.periodoDeEncuesta(ev, ahora);
        if (p && p.inicio && (!desde || p.inicio < desde)) desde = p.inicio;
    });

    // Y hasta el principio del periodo más viejo que la gráfica va a enseñar,
    // que si no no habría historia que dibujar: con todas las encuestas
    // periódicas, `desde` sería el día 1 de este mes y la línea tendría un solo
    // punto. Es el mismo `gte` acotado de `cargarRespuestasQueReviso`.
    //
    // `frecuencia` es **el ritmo del eje que se va a dibujar**, no el de las
    // encuestas: la tarjeta del panel habla de todas a la vez y su eje va en
    // meses a la fuerza, pero la pantalla de una encuesta dibuja el suyo. Sin
    // esto, una trimestral traía seis meses para un eje de seis trimestres y
    // los cuatro puntos de atrás salían vacíos o, peor, a medias —que es la
    // línea subiendo desde un suelo falso que la gráfica no dibuja nunca—.
    const periodos = window.periodosDeClasificacion(
        [{ frequency: frecuencia || window.RITMO_GRAFICA_EMPRESA }], window.PERIODOS_EN_LA_GRAFICA);
    const masViejo = periodos.length ? periodos[periodos.length - 1].inicio : null;
    if (masViejo && (!desde || masViejo < desde)) desde = masViejo;

    const filas = [];
    let tope = false;
    for (let pagina = 0; pagina < window.MAX_PAGINAS_RESPUESTAS; pagina++) {
        let consulta = sb.from('evaluation_responses')
            .select('evaluation_id, employee_id, submitted_at, review_status, grades_json')
            .in('evaluation_id', ids)
            .order('submitted_at', { ascending: false })
            .range(pagina * 1000, pagina * 1000 + 999);
        if (desde) consulta = consulta.gte('submitted_at', desde.toISOString());

        const { data, error } = await consulta;
        if (error || !data || data.length === 0) break;
        filas.push(...data);
        if (data.length < 1000) break;
        if (pagina === window.MAX_PAGINAS_RESPUESTAS - 1) tope = true;
    }
    return { respuestas: filas, tope };
};

// El promedio de la empresa: **quien no contestó cuenta como cero**, así que el
// divisor es el padrón y no las respuestas que llegaron. Es lo que separa «cómo
// les fue a los que la hicieron» de «cómo va la empresa con esta encuesta», que
// es lo que se viene a ver administrando: con 23 de 40 al 86%, el 86% dice que
// va bien algo que lleva diecisiete personas sin hacer.
//
// Sin padrón —la encuesta llegó sin sus columnas de destinatarios— no hay sobre
// qué repartir, y entonces se promedia lo calificado, que es lo de antes.
window.promedioSobrePadron = (suma, calificadas, padron) => {
    if (padron > 0) return Math.round(suma / padron);
    return calificadas > 0 ? Math.round(suma / calificadas) : null;
};

// Lo que se dice de una encuesta que en aquel periodo todavía no existía. Va
// en los tres sitios que la nombran —el renglón de la encuesta, el pie de su
// clasificación y la fila de la hoja de detalle—, que si no acabarían diciendo
// lo mismo de tres maneras.
window.TEXTO_SIN_EXISTIR = 'Todavía no existía';

// ¿Existía ya esta encuesta en el periodo al que cae esa fecha? Se compara su
// alta contra el **fin del periodo** y no contra la fecha misma: una creada a
// mitad de agosto existió en agosto, aunque no el día 1.
//
// Hace falta porque una encuesta que todavía no existía **no vale cero**: su
// padrón entero contaría como gente que no la contestó, y el periodo de antes
// de crearla saldría con un 0% que se lee como que la empresa lo hizo mal en
// vez de como que aquello no se preguntaba todavía. Lo miran la gráfica de la
// tarjeta —de donde salió la regla— y, desde que se puede elegir un periodo de
// atrás, también la lista de debajo: sin esto las dos discrepaban, porque el
// punto de abril se dibujaba sin esas encuestas y el renglón las contaba.
//
// **Una de «única vez» no tiene fin de periodo, y ahí manda el instante que se
// mira.** `periodoDeEncuesta` le da `fin: null` —su periodo es «alguna vez»—,
// así que mirando el fin no se descartaba nunca: las de DOJO y JUNTAS, creadas
// en julio, seguían pidiendo «0/9 respuestas · 0%» en abril. Y es el mismo tope
// con el que `resumenDeEncuestaAdmin` cuenta sus respuestas —nada de lo enviado
// después del instante que se mira—, así que las dos mitades miran lo mismo: si
// no se le cuenta ninguna respuesta posterior a esa fecha, tampoco se le puede
// cobrar el padrón de antes de existir.
//
// Sin fecha de alta se cuenta, que es lo de siempre: ante la duda, la encuesta
// existía.
window.encuestaExistiaEn = (ev, referencia) => {
    const alta = (ev && ev.created_at) ? new Date(ev.created_at) : null;
    if (!alta || isNaN(alta)) return true;
    const cuando = referencia || new Date();
    const periodo = window.periodoDeEncuesta(ev, cuando);
    const fin = (periodo && periodo.fin) || cuando;
    return alta < fin;
};

// Lo mismo de un grupo de encuestas: se suman los puntajes y los padrones, no
// se promedian los promedios. Una encuesta de cuarenta personas y otra de tres
// no pesan igual, y promediar sus dos cifras las iguala.
window.totalDeEncuestasAdmin = (filas) => {
    let suma = 0, calificadas = 0, total = 0, contestaron = 0, ajenos = 0;
    (filas || []).forEach(f => {
        if (!f.resumen) return;
        suma += f.resumen.suma;
        calificadas += f.resumen.calificadas;
        total += f.resumen.total;
        ajenos += f.resumen.ajenos;
        contestaron += f.resumen.contestaron;
    });
    return { contestaron, total, ajenos, calificadas,
             promedio: window.promedioSobrePadron(suma, calificadas, total) };
};

// «23/40 respuestas», o sólo cuántas hay si no se pudo saber el padrón. El
// divisor es `total` —el padrón de hoy más quien contestó y ya no está en él—,
// que es lo único que no puede dar una fracción mayor que uno.
window.textoDeRespuestasAdmin = (resumen) => {
    const n = resumen.contestaron;
    return resumen.total > 0
        ? `${n}/${resumen.total} respuestas`
        : `${n} respuesta${n === 1 ? '' : 's'}`;
};

// Cómo va una encuesta este periodo: el promedio de la empresa y cuánta gente
// la contestó de la que la tiene asignada.
//
// **Cuenta gente, no respuestas**, igual que el pase de lista: quien contestó
// dos veces cuenta una, y su puntaje es el de la última —promediar las dos la
// pondera el doble—.
// `padronDado` evita recalcularlo: `padronDeLaEncuesta` recorre la plantilla
// entera y la gráfica de periodos pregunta doce veces por la misma encuesta.
window.resumenDeEncuestaAdmin = (ev, respuestas, ahora, padronDado) => {
    const referencia = ahora || new Date();
    const periodo = window.periodoDeEncuesta(ev, referencia);
    const ultimaDeCadaUno = {};

    (respuestas || []).forEach(r => {
        if (String(r.evaluation_id) !== String(ev.id)) return;
        const enviada = new Date(r.submitted_at);
        if (isNaN(enviada) || enviada < periodo.inicio) return;
        if (periodo.fin && enviada >= periodo.fin) return;
        // Nada de lo enviado **después** del instante que se mira. Con `ahora`
        // en el presente no quita nada —del futuro no llegan respuestas—, pero
        // la gráfica pregunta por periodos de atrás y una encuesta de «única
        // vez» no tiene `fin`: sin este tope, su punto de abril incluiría lo
        // contestado en septiembre y todos los periodos saldrían iguales, o sea
        // una línea plana en la cifra de hoy.
        if (enviada > referencia) return;

        const quien = String(r.employee_id);
        const previa = ultimaDeCadaUno[quien];
        if (!previa || new Date(r.submitted_at) > new Date(previa.submitted_at)) {
            ultimaDeCadaUno[quien] = r;
        }
    });

    const suyas = Object.values(ultimaDeCadaUno);
    const puntajes = suyas.map(r => window.puntajeDeRespuesta(r)).filter(p => p !== null);
    const suma = puntajes.reduce((a, b) => a + b, 0);
    // Sin las columnas de destinatarios `padronDeLaEncuesta` no da padrón, y un
    // «de 0» se leería como que no le toca a nadie: ahí no se dice.
    const padron = padronDado || window.padronDeLaEncuesta(ev);
    const enPadron = new Set(padron.map(e => String(e.id)));

    // **Quien contestó y hoy ya no está en el padrón se suma al divisor**, que
    // es lo mismo que hace el pase de lista y por lo mismo: contestó, y
    // borrarlo del acta sería falsearla, pero dejarlo sólo arriba daba «126/95
    // respuestas · 104%». El padrón es el de hoy —quien se dio de baja o cambió
    // de puesto ya no está en él— y una de «única vez» cuenta las respuestas de
    // todos los años, así que ese desfase es lo normal y no la excepción.
    const ajenos = Object.keys(ultimaDeCadaUno).filter(id => !enPadron.has(id)).length;
    const total = padron.length + ajenos;

    return {
        contestaron: suyas.length,
        calificadas: puntajes.length,
        padron: padron.length, ajenos, total, suma,
        promedio: window.promedioSobrePadron(suma, puntajes.length, total),
        // Lo que sacaron quienes sí la contestaron. No se dibuja: va en el globo
        // del renglón, que es donde cabe explicar de dónde sale el otro.
        promedioContestadas: puntajes.length === 0 ? null
            : Math.round(suma / puntajes.length)
    };
};

// El cuerpo de la tarjeta de encuestas: el renglón del resumen y los bloques de
// cada clasificación, a partir de las filas ya calculadas.
//
// Vive fuera de `cargarEncuestasAsignadas` porque **se repinta sin volver a
// cargar nada**: al tocar un punto de la gráfica, la tarjeta pasa a hablar de
// aquel periodo y lo único que cambia son estas dos piezas —la gráfica se queda
// como está, que es la misma para todos los periodos—.
window.cuerpoTarjetaEncuestas = (filas, esAdmin, topeRespuestas) => {
    // El promedio de un puñado de filas. Sin nada calificado no hay
    // promedio: un 0% ahí se leería como haberlo hecho mal en vez de no
    // haber empezado.
    const promedioDe = (unasFilas) => {
        const puntajes = unasFilas.map(f => f.puntaje).filter(p => p !== null);
        if (puntajes.length === 0) return null;
        return Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length);
    };

    // Lo que falta, arriba; y lo vencido antes que lo que aún tiene plazo. Lo
    // que en el periodo elegido todavía no existía se va al final: no tiene
    // nada que decir de aquel periodo y partiría en dos la lista de las que sí.
    const peso = (f) => (f.existia === false ? 3
        : (!f.vencimiento.mostrar ? 2 : (f.vencimiento.vencida ? 0 : 1)));

    const grupos = [];
    const porClave = {};
    filas.forEach(f => {
        const clave = window.normalizarClasificacion(f.ev.category);
        if (!porClave[clave]) {
            porClave[clave] = { nombre: String(f.ev.category || 'General').trim() || 'General', filas: [] };
            grupos.push(porClave[clave]);
        }
        porClave[clave].filas.push(f);
    });

    // Dentro del grupo manda lo que urge; entre grupos, el que peor está.
    // Con el mismo estado, por nombre, para que la tarjeta no baile de una
    // carga a otra.
    grupos.forEach(g => g.filas.sort((a, b) => peso(a) - peso(b)));
    grupos.sort((a, b) => (peso(a.filas[0]) - peso(b.filas[0]))
        || a.nombre.localeCompare(b.nombre, 'es'));

    const pendientes = filas.filter(f => f.vencimiento.mostrar).length;

    // Lo que la hoja de detalle vuelve a leer al abrirse, sin recalcular
    // nada ni volver a preguntarle a la base. Se pasa por índice y no por
    // nombre: así no hay que escapar la clasificación en un atributo.
    //
    // Las respuestas van enteras y no sólo las del periodo que corre: la
    // gráfica de la hoja recorre los periodos de atrás.
    window.clasificacionesAsignadas = grupos;

    const bloques = grupos.map((g, indice) => {
        const renglones = g.filas.map(({ ev, estado, puntaje, resumen, existia }) => {
            const safeTitle = String(ev.title || '').replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            const ritmo = window.textoDeFrecuencia ? window.textoDeFrecuencia(ev.frequency) : '';
            const color = (puntaje !== null && typeof window.getColorScore === 'function')
                ? window.getColorScore(puntaje) : '#64748b';
            // El puntaje en las contestadas; en las que faltan, lo que
            // falta —que ahí no hay puntaje que enseñar y el renglón
            // quedaría con la frecuencia sola—.
            let resultado = puntaje !== null
                ? ` · <span style="color:${color}; font-weight:700;">${puntaje}%</span>`
                : (estado.listo ? '' : ` · <span style="color:${estado.color}; font-weight:700;">${estado.texto}</span>`);

            // Administrando, delante del promedio va cuánta gente la
            // contestó: el promedio se reparte sobre el padrón, así que sin
            // esa cuenta no se sabe si un 49% es media plantilla al 100 o
            // la plantilla entera a la mitad.
            if (resumen) {
                const cifra = puntaje !== null
                    ? ` · <span style="color:${color}; font-weight:700;">${puntaje}%</span>`
                    : ' · sin calificar';
                resultado = ` · ${window.textoDeRespuestasAdmin(resumen)}${cifra}`;
            }

            // Mirando un periodo en el que esta encuesta todavía no existía no
            // hay respuestas que contar ni promedio que repartir: el renglón se
            // queda **sin cifras y desvanecido**, en lugar de enseñar el «0/9
            // respuestas · 0%» que salía de repartir su padrón entre gente que
            // no pudo contestarla. Debajo le queda su ritmo, que es de la
            // encuesta y no del periodo, así que no se lleva por delante la
            // regla de no dejar un título con nada debajo. Lo que pasó se dice
            // en el `title`, como el resto de lo que no cabe en un renglón.
            if (existia === false) resultado = '';

            // El globo dice lo que la cifra no puede: qué sacaron los que
            // sí contestaron, que es de donde sale el promedio de la
            // empresa al repartirlo sobre el padrón.
            const globo = existia === false
                ? window.TEXTO_SIN_EXISTIR
                : (resumen && resumen.promedioContestadas !== null
                    ? `${resumen.promedioContestadas}% entre quienes la contestaron`
                    : estado.texto);

            return `
                <div onclick="window.abrirEncuestaDesdeInicio('${ev.id}', '${safeTitle}')"
                     title="${globo}" class="${existia === false ? 'sin-existir' : ''}"
                     style="display:flex; align-items:center; gap:10px; padding:9px 8px 9px 30px; border-top:1px solid #f1f5f9; cursor:pointer;">
                    ${window.iconoDeAsignada(estado)}
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; color:#1e293b; font-size:0.9rem; line-height:1.2; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                        <div style="font-size:0.72rem; color:#94a3b8;">${window.sanitizeForHTML(ritmo)}${resultado}</div>
                    </div>
                </div>`;
        }).join('');

        // El renglón de la clasificación dice lo suyo sin abrirla: su
        // icono es el de la encuesta que peor está —basta una para que la
        // clasificación no esté al día—, y su pie, cuántas faltan y el
        // promedio de lo ya calificado.
        const pendientesGrupo = g.filas.filter(f => f.vencimiento.mostrar).length;
        const estadoGrupo = g.filas[0].estado;   // ya vienen ordenadas por lo que urge
        // Las que existían en el periodo que se está mirando, que son las
        // únicas que suman: `totalDeEncuestasAdmin` ya se salta a las demás
        // —vienen sin resumen— y aquí hace falta además para no decir «0
        // respuestas» de una clasificación que entonces no se había creado.
        const vigentes = g.filas.filter(f => f.existia !== false);
        // Administrando se suman los puntajes y los padrones de sus
        // encuestas, no se promedian sus promedios: una de cuarenta
        // personas y otra de tres no pesan igual.
        const totalGrupo = esAdmin ? window.totalDeEncuestasAdmin(g.filas) : null;
        const promedioGrupo = esAdmin ? totalGrupo.promedio : promedioDe(g.filas);
        const colorGrupo = (promedioGrupo !== null && typeof window.getColorScore === 'function')
            ? window.getColorScore(promedioGrupo) : '#64748b';

        const cuantas = `${g.filas.length} encuesta${g.filas.length === 1 ? '' : 's'}`;
        // Ninguna de las suyas existía: el renglón se desvanece entero y dice
        // cuántas encuestas tiene, que es lo único suyo que no depende del
        // periodo. «0 respuestas», que es lo que daría `totalDeEncuestasAdmin`
        // sin filas que sumar, diría que nadie contestó algo que no se había
        // creado.
        const sinExistir = esAdmin && vigentes.length === 0;
        const pie = sinExistir ? cuantas : [
            esAdmin
                ? window.textoDeRespuestasAdmin(totalGrupo)
                : (pendientesGrupo > 0
                    ? `${pendientesGrupo} pendiente${pendientesGrupo === 1 ? '' : 's'} de ${g.filas.length}`
                    : `${cuantas} al día`),
            promedioGrupo === null ? null
                : `<span style="color:${colorGrupo}; font-weight:700;">${promedioGrupo}%</span>`
        ].filter(Boolean).join(' · ');

        // Un <details> y no una función colgada de `window`: abrir y cerrar
        // lo hace el navegador solo, como en los plegables de las hojas y
        // de estadísticas. Nace cerrado, que es de lo que se trata —lo que
        // se ve son las clasificaciones—, y quien quiera ver las encuestas
        // de una toca su renglón.
        // El renglón abre la hoja de detalle de la clasificación —de ahí el
        // `preventDefault`, que es lo que evita que el <details> se
        // despliegue— y la flecha de la derecha, que sí lo despliega, es un
        // botón suyo. Son dos acciones distintas sobre la misma fila.
        return `
            <details class="grupo-asignadas">
                <summary onclick="event.preventDefault(); window.abrirDetalleClasificacion(${indice})"
                         class="${sinExistir ? 'sin-existir' : ''}"
                         title="${sinExistir ? window.TEXTO_SIN_EXISTIR : ''}">
                    ${window.iconoDeAsignada(estadoGrupo)}
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.8rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.4px;">${window.sanitizeForHTML(g.nombre)}</div>
                        <div style="font-size:0.72rem; color:#94a3b8;">${pie}</div>
                    </div>
                    <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
                    <button type="button" class="grupo-asignadas-boton" aria-expanded="false"
                            onclick="window.alternarGrupoAsignadas(this, event)"
                            title="Ver sus encuestas" aria-label="Ver sus encuestas">
                        <svg class="grupo-asignadas-flecha" width="18" height="18" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
                             stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                </summary>
                ${renglones}
            </details>`;
    }).join('');

    const promedio = esAdmin ? null : promedioDe(filas);
    // Administrando, el renglón habla de la empresa y no de lo que le falta
    // a quien mira. La participación va aquí también: el promedio se reparte
    // sobre el padrón, así que un «0%» recién empezado el periodo tiene que
    // salir al lado del «0/312 respuestas» que lo explica. El aviso del tope
    // sólo sale cuando de verdad se alcanzó: un promedio sacado de una parte
    // de las respuestas no se puede enseñar como si fueran todas.
    const total = esAdmin ? window.totalDeEncuestasAdmin(filas) : null;
    // Cuántas encuestas había entonces, no cuántas hay hoy: mirando abril, las
    // cuatro que se crearon en julio no son cuatro encuestas al 0%, es que
    // todavía no existían. Así el renglón dice la misma cifra que el punto de
    // la gráfica, que ya las descartaba.
    const cuantasAdmin = esAdmin ? filas.filter(f => f.existia !== false).length : 0;
    //
    // Va sin la palabra «activas» —que es lo que son: las apagadas no se
    // listan— porque con ella el renglón se parte en dos y deja el
    // porcentaje solo en el segundo. Lo dice su globo, que ahí sí cabe.
    const resumen = esAdmin
        ? [
            `${cuantasAdmin} encuesta${cuantasAdmin === 1 ? '' : 's'}`,
            window.textoDeRespuestasAdmin(total),
            total.promedio === null ? null : `${total.promedio}%`,
            topeRespuestas ? 'sobre las respuestas más recientes' : null
          ].filter(Boolean).join(' · ')
        : [
            pendientes === 0
                ? `Ninguna pendiente de ${filas.length}`
                : `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de ${filas.length}`,
            promedio === null ? null : `promedio ${promedio}%`
          ].filter(Boolean).join(' · ');

    return { resumen, bloques };
};

// Tocar un punto de la gráfica deja la tarjeta hablando de **aquel periodo**:
// el renglón del resumen y los renglones de cada clasificación pasan a decir
// cuánta gente había contestado entonces y cómo iba la empresa.
//
// **No consulta nada.** Las respuestas de los seis periodos ya vinieron en la
// misma consulta —el `gte` de `respuestasDelPeriodoDeTodos` llega al más viejo
// del eje—, así que elegir un periodo es volver a preguntarle a
// `resumenDeEncuestaAdmin` con otra fecha. Y se le pasa **la `referencia` del
// propio punto**, que es el instante con el que se dibujó: por eso la lista dice
// exactamente la cifra que enseña el globo y no una parecida.
//
// Con `indice` fuera de rango —o sin periodos— se vuelve a hoy, que es lo que
// hace el botón «Hoy» del renglón.
window.verPeriodoDeLaTarjeta = (indice) => {
    const puntos = window.periodosDeLaTarjeta || [];
    const filas = window.filasDeLaTarjeta || [];
    if (filas.length === 0) return;

    const punto = puntos[indice];
    // El último punto **es** el periodo que corre, así que elegirlo es volver a
    // hoy: no hay dos maneras de estar al día.
    const esHoy = !punto || indice === puntos.length - 1;
    window.periodoElegidoTarjeta = esHoy ? null : indice;

    const referencia = esHoy ? new Date() : punto.referencia;

    // Se reescribe **sobre las mismas filas**, que son las que guarda
    // `clasificacionesAsignadas`: así la hoja de detalle de una clasificación
    // —que las lee al abrirse— habla del mismo periodo que la lista, en vez de
    // contradecirla en cuanto se toca un renglón.
    filas.forEach(f => {
        // Una encuesta que en aquel periodo todavía no existía no se resume:
        // repartir su padrón entero entre gente que no pudo contestarla da un
        // 0% que se lee como que se hizo mal. Se queda sin cifras —y lo dice—,
        // que es exactamente lo que hace la gráfica de arriba con su punto: sin
        // esto, el renglón contaba trece encuestas donde el punto dibujaba
        // nueve, y las dos cifras no cuadraban.
        f.existia = window.encuestaExistiaEn(f.ev, referencia);
        f.resumen = f.existia
            ? window.resumenDeEncuestaAdmin(
                f.ev, window.respuestasAsignadas, referencia, window.padronesDeLaTarjeta[f.ev.id])
            : null;
        f.puntaje = f.resumen ? f.resumen.promedio : null;
    });

    const { resumen, bloques } = window.cuerpoTarjetaEncuestas(filas, true, false);

    const cajaResumen = document.getElementById('resumen-encuestas-tarjeta');
    const cajaBloques = document.getElementById('bloques-encuestas-tarjeta');
    if (cajaBloques) cajaBloques.innerHTML = bloques;
    if (!cajaResumen) return;

    // Mirando atrás, la tarjeta lo dice y ofrece la vuelta. Sin eso enseñaría
    // las cifras de junio sin más, que es exactamente lo que no se puede hacer
    // con un número que se lee y se cree.
    //
    // Va en **su propio renglón**, encima del resumen y no dentro: medido a
    // 375px, «jun 2026 · 13 encuestas · 3350/3587 respuestas · 73%» con el botón
    // detrás se parte en dos siempre —no sólo en el peor caso—, y un renglón que
    // se parte deja el periodo y su cifra en líneas distintas. Aparte, además,
    // se lee como lo que es: un aviso de que no se está mirando hoy.
    cajaResumen.innerHTML = esHoy ? resumen : `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
            <span style="color:#2563eb; font-weight:700;">${window.sanitizeForHTML(punto.etiqueta || '')}</span>
            <button type="button" onclick="window.verPeriodoDeLaTarjeta(null)"
                    title="Volver al periodo que corre" aria-label="Volver al periodo que corre"
                    style="padding:1px 8px; font-size:0.72rem; font-weight:700; color:#2563eb;
                           background:#eff6ff; border:1px solid #bfdbfe; border-radius:999px; cursor:pointer;">Hoy</button>
        </div>
        <div>${resumen}</div>`;
};

window.cargarEncuestasAsignadas = async (userId) => {
    const cont = document.getElementById('container-encuestas-asignadas');
    if (!cont) return;

    cont.style.display = 'none';
    cont.innerHTML = '';

    const empStrId = String(userId).trim();

    try {
        // La ficha manda sobre `usuarioLogueado`: la sesión dura treinta días y
        // un cambio de puesto o de departamento posterior no aparecería ahí, y
        // de esos dos campos depende qué encuestas le tocan.
        if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
            await window.cargarDatosEmpleados();
        }
        const empleado = (window.todosLosEmpleadosData || []).find(e => String(e.id) === empStrId)
            || JSON.parse(localStorage.getItem('usuarioLogueado') || 'null');
        if (!empleado) return;

        // Las mismas columnas que pide el badge, y por lo mismo: sin ellas
        // `esEvaluacionPendiente` decide con lo que no se le dio —una encuesta
        // sin `requires_min_score` pediría repetirse aunque tenga el mínimo
        // apagado— y `leTocaEstaEncuesta` se la contaría a quien no le toca.
        // Y `reviewer_employees`, que es de donde salen las miniaturas de quién
        // revisa en la hoja de detalle: sin la columna, `revisoresDeEncuesta`
        // sólo vería los de la clasificación y enseñaría los heredados en una
        // encuesta que nombra a los suyos. Es la trampa de `requires_min_score`.
        const campos = await window.camposConRevisores(
            await window.camposConRelanzamiento(await window.camposConMinimo(await window.camposConReintento(
                'id, title, category, frequency, created_at, mode, is_obligatory, target_employees, target_positions, target_departments'))));

        // Igual que en el panel de pendientes: las ventanas de las encuestas
        // que pasan lista se piden antes, porque `esEvaluacionPendiente` las
        // consulta sin poder esperar.
        await window.cargarVentanasDeAsistencia();

        // Quién revisa puede venir de la clasificación, y `revisoresDeEncuesta`
        // lo pregunta sin poder esperar cuando se abre la hoja de detalle.
        await window.cargarRevisoresDeClasificaciones();

        const { data: encuestas, error } = await sb.from('evaluations')
            .select(campos)
            .eq('active', true);
        if (error || !encuestas) return;

        // En modo administrador la tarjeta es de la empresa entera: todas las
        // encuestas activas, y no sólo las que le tocan a quien mira.
        const esAdmin = !!window.modoAdminActivo;
        const tieneEquipo = window.tieneEquipoDirecto(empStrId);
        const mias = esAdmin ? encuestas
            : encuestas.filter(ev => window.leTocaEstaEncuesta(ev, empleado, tieneEquipo));
        if (mias.length === 0) return;

        const ahora = new Date();

        // `review_status` y `grades_json` son para el plazo de reintento: sin
        // el puntaje no se sabe si hay que reponer la encuesta.
        let respuestas = [];
        let topeRespuestas = false;
        if (esAdmin) {
            const traidas = await window.respuestasDelPeriodoDeTodos(mias, ahora);
            respuestas = traidas.respuestas;
            topeRespuestas = traidas.tope;
        } else {
            const { data } = await sb.from('evaluation_responses')
                .select('id, evaluation_id, submitted_at, review_status, grades_json')
                .eq('employee_id', empStrId)
                .in('evaluation_id', mias.map(e => e.id));
            respuestas = data || [];
        }

        const puntajeDe = window.puntajeDeRespuesta;

        const filas = mias.map(ev => {
            // Administrando, la encuesta no es de quien mira: su estado es el
            // neutro —una palomita diría que está «al día» de algo que no le
            // toca— y lo que dice el renglón es cómo va la encuesta.
            if (esAdmin) {
                const resumen = window.resumenDeEncuestaAdmin(ev, respuestas, ahora);
                return {
                    ev, resumen, resp: null,
                    vencimiento: { mostrar: false },
                    estado: { texto: 'Encuesta de la empresa', neutro: true, color: '#94a3b8', listo: true },
                    puntaje: resumen.promedio
                };
            }

            const contestaQuienMira = (ev.mode || 'self') !== 'boss';
            const vencimiento = window.esEvaluacionPendiente(
                respuestas, ev.id, ev.frequency, ev.created_at, ev, contestaQuienMira);
            // La respuesta del periodo se guarda: de ella salen el puntaje del
            // renglón y la fecha que enseña la hoja de detalle.
            const resp = window.respuestaDelPeriodo(ev, respuestas, ahora);
            return {
                ev, vencimiento, resp,
                estado: window.estadoDeAsignada(vencimiento),
                puntaje: puntajeDe(resp)
            };
        });

        window.respuestasAsignadas = respuestas || [];

        const { resumen, bloques } = window.cuerpoTarjetaEncuestas(filas, esAdmin, topeRespuestas);

        // Cómo va la empresa periodo a periodo, debajo del resumen: el renglón
        // dice dónde estamos y la línea, si vamos a mejor. Es la misma
        // `graficaDeLinea` de la hoja de una clasificación y el mismo
        // `historialDeRevision` que la alimenta ahí, sólo que con las filas de
        // la tarjeta entera en vez de las de un grupo: así el punto del periodo
        // que corre es, por construcción, el número que se lee encima.
        //
        // **No se dibuja si la consulta llegó al tope.** Las respuestas vienen
        // ordenadas de la más nueva, así que lo que se queda fuera son los
        // periodos de atrás: la línea saldría subiendo desde un suelo falso,
        // que es peor que no enseñarla. El renglón ya avisa del corte.
        //
        // Con menos de dos periodos con resultado devuelve '' y no se dibuja
        // nada, que una línea de un punto no es una tendencia.
        //
        // **Y cada punto se puede tocar para ver aquel periodo** en la lista de
        // abajo: lo que se dibuja ya lo sabe todo, así que elegirlo no consulta
        // nada —las respuestas de los seis periodos vinieron en la misma
        // consulta—. De eso va `verPeriodoDeLaTarjeta`, y por eso los puntos, la
        // gráfica y las filas se quedan a mano.
        window.filasDeLaTarjeta = filas;
        window.periodosDeLaTarjeta = (esAdmin && !topeRespuestas)
            ? window.historialDeRevision({ filas }, respuestas,
                { sobrePadron: true, frecuencia: window.RITMO_GRAFICA_EMPRESA })
            : [];
        window.periodoElegidoTarjeta = null;
        // `padronDeLaEncuesta` recorre la plantilla entera: se pregunta una vez
        // por encuesta y no una vez por encuesta y toque.
        window.padronesDeLaTarjeta = {};
        if (esAdmin) filas.forEach(f => {
            window.padronesDeLaTarjeta[f.ev.id] = window.padronDeLaEncuesta(f.ev);
        });

        const graficaHtml = window.graficaDeLinea(
            window.periodosDeLaTarjeta, 'window.verPeriodoDeLaTarjeta');

        // Sin título: lo que la tarjeta es se ve —las clasificaciones— y el
        // renglón del resumen dice más en el mismo sitio.
        //
        // El resumen y los bloques van en su propio contenedor porque son lo
        // único que se repinta al elegir un periodo: la gráfica se queda como
        // está —es la misma para todos— y redibujarla borraría la marca del
        // punto que se acaba de tocar.
        cont.innerHTML = `
            <div style="background:white; border-radius:16px; padding:15px 15px 5px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); border:1px solid #f1f5f9;">
                <div id="resumen-encuestas-tarjeta"
                     style="font-size:0.8rem; color:#475569; font-weight:600; margin-bottom:4px;"
                     title="${esAdmin ? 'Las encuestas activas de la empresa. El promedio se reparte entre toda la gente a la que le toca: quien no contestó cuenta como 0.' : ''}">${resumen}</div>
                ${graficaHtml}
                <div id="bloques-encuestas-tarjeta">${bloques}</div>
            </div>`;
        cont.style.display = 'block';
    } catch (e) {
        // Nada que enseñar es mejor que una tarjeta rota: el resto del inicio
        // no depende de esto.
        console.warn('No se pudieron cargar las encuestas asignadas:', e.message);
    }
};

// El puntaje de una respuesta, o null si todavía no está calificada. Sin
// calificar no hay cifra que enseñar: un 0% se leería como haberlo hecho mal en
// vez de no haberse revisado. Lo usan la tarjeta del panel y el historial de la
// hoja de detalle, que es lo que lo saca de dentro de `cargarEncuestasAsignadas`.
window.puntajeDeRespuesta = (resp) => {
    const calificada = resp
        && (resp.review_status === 'Revisado' || resp.review_status === 'Certificada')
        && window.tieneCalificaciones(resp)
        && typeof window.calcularScoreRespuesta === 'function';
    return calificada ? window.calcularScoreRespuesta(resp) : null;
};

// Cuántos periodos hacia atrás mira la gráfica de una clasificación. Seis caben
// en el ancho de un teléfono sin que los puntos se toquen.
window.PERIODOS_EN_LA_GRAFICA = 6;

// Cómo se rotula un periodo en el eje de la gráfica, en dos tallas: la corta,
// que es la que se pone si cabe, y la mínima para cuando no —la inicial del mes,
// que es lo único que sobrevive con doce puntos en un teléfono—. El nombre largo
// («ago 2026») sigue saliendo en el globo del punto y en el titular.
window.etiquetasDeEje = (inicio, frecuencia) => {
    if (!(inicio instanceof Date) || isNaN(inicio)) return { corta: '', minima: '' };
    const mes = (window.MESES_CORTOS || [])[inicio.getMonth()] || '';
    const inicial = mes ? mes[0].toUpperCase() : '';
    const anio = `'${String(inicio.getFullYear()).slice(2)}`;

    switch (frecuencia) {
        case 'weekly':     return { corta: `${inicio.getDate()} ${mes}`, minima: String(inicio.getDate()) };
        case 'biweekly':   return { corta: `${inicio.getDate() <= 15 ? '1ª' : '2ª'} ${mes}`, minima: inicial };
        case 'monthly':    return { corta: mes, minima: inicial };
        case 'quarterly':  return { corta: `T${Math.floor(inicio.getMonth() / 3) + 1}`, minima: `T${Math.floor(inicio.getMonth() / 3) + 1}` };
        case 'semiannual': return { corta: `S${Math.floor(inicio.getMonth() / 6) + 1}`, minima: `S${Math.floor(inicio.getMonth() / 6) + 1}` };
        case 'yearly':
        case 'biennial':   return { corta: anio, minima: anio };
        default:           return { corta: '', minima: '' };
    }
};

// El resultado de una clasificación periodo a periodo, del más antiguo al más
// reciente. Una clasificación puede mezclar frecuencias, así que **no hay un
// periodo de la clasificación**: los periodos los marca su encuesta más
// frecuente (`periodosDeClasificacion`) y dentro de cada uno se mira cada
// encuesta en el suyo, que es lo que hace `respuestaDelPeriodo` con la fecha de
// referencia.
//
// Un periodo sin nada calificado devuelve `promedio: null` —no un cero, que se
// leería como haberlo hecho mal— y la gráfica se lo salta.
window.historialDeClasificacion = (grupo, cuantos, respuestas) => {
    const encuestas = (grupo.filas || []).map(f => f.ev);
    // Las respuestas se pueden pasar: la hoja del panel de inicio lee las que
    // dejó `cargarEncuestasAsignadas`, y la pantalla de una clasificación de la
    // hoja de evaluaciones, las de su propia lista. Sin argumento, las del
    // panel, que es de donde salió esto.
    const suyas = respuestas || window.respuestasAsignadas || [];
    const periodos = window.periodosDeClasificacion(encuestas, cuantos || window.PERIODOS_EN_LA_GRAFICA);
    // El ritmo del grupo, que es el que decide cómo se rotula el eje.
    const ritmo = window.encuestaQueMarcaElRitmo(encuestas);
    const frecuencia = (ritmo && ritmo.frequency) || 'once';

    return periodos.slice().reverse().map(p => {
        const puntajes = encuestas
            .map(ev => window.puntajeDeRespuesta(
                window.respuestaDelPeriodo(ev, suyas, p.referencia)))
            .filter(n => n !== null);

        const rotulos = window.etiquetasDeEje(p.inicio, frecuencia);

        return {
            etiqueta: p.etiqueta || p.nombre || '',
            nombre: p.nombre || p.etiqueta || '',
            corta: rotulos.corta,
            minima: rotulos.minima,
            actual: !!p.actual,
            calificadas: puntajes.length,
            total: encuestas.length,
            promedio: puntajes.length === 0 ? null
                : Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length)
        };
    });
};

// La gráfica de línea del historial, dibujada a mano en SVG.
//
// No usa Chart aunque el panel ya lo cargue: Chart mide el lienzo al dibujarlo
// y aquí la hoja está en `display:none` hasta el instante anterior, que es la
// misma trampa del radar del panel plegado. Un SVG con `viewBox` no mide nada
// —se estira con su contenedor— así que tampoco hay que redibujarlo al girar el
// teléfono.
//
// `alElegir` es el nombre de la función a la que se le pasa el índice del punto
// tocado. Sin él, tocar un punto sólo abre su globo, que es lo que hacen las
// gráficas de una clasificación; con él, además elige ese periodo —la tarjeta
// del panel, que pasa a hablar de aquel mes—. Es un identificador escrito aquí
// dentro y no texto de nadie: no hay nada que escapar.
window.graficaDeLinea = (puntos, alElegir) => {
    const conDato = puntos.filter(p => p.promedio !== null);
    if (conDato.length < 2) return '';

    const A = 320, ALTO = 150, IZQ = 26, DER = 10, ARRIBA = 16, ABAJO = 26;
    const ancho = A - IZQ - DER, alto = ALTO - ARRIBA - ABAJO;
    const n = puntos.length;
    const x = (i) => IZQ + (n === 1 ? ancho / 2 : ancho * i / (n - 1));
    const y = (v) => ARRIBA + alto * (1 - v / 100);

    // Las tres referencias de la izquierda y, aparte, el mínimo que se pide
    // para certificar: es contra lo que se lee cada punto.
    const rejilla = [0, 50, 100].map(v => `
        <line x1="${IZQ}" y1="${y(v).toFixed(1)}" x2="${A - DER}" y2="${y(v).toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/>
        <text x="${IZQ - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#cbd5e1">${v}</text>`).join('');

    const umbral = `
        <line x1="${IZQ}" y1="${y(window.UMBRAL_CERTIFICACION).toFixed(1)}" x2="${A - DER}" y2="${y(window.UMBRAL_CERTIFICACION).toFixed(1)}"
              stroke="#86efac" stroke-width="1" stroke-dasharray="3 3"/>`;

    // La línea une los periodos que tienen resultado; los que no lo tienen se
    // saltan, y por eso no hay punto donde no se contestó nada.
    const linea = `<polyline fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
                             points="${puntos.map((p, i) => p.promedio === null ? null : `${x(i).toFixed(1)},${y(p.promedio).toFixed(1)}`).filter(Boolean).join(' ')}"/>`;

    // El punto y, encima, su blanco para el dedo: un círculo de 4 no se acierta,
    // así que el que escucha el toque es uno transparente y mucho más ancho.
    const dots = puntos.map((p, i) => {
        if (p.promedio === null) return '';
        const color = typeof window.getColorScore === 'function' ? window.getColorScore(p.promedio) : '#2563eb';
        const alTocar = alElegir
            ? `window.marcarPuntoGrafica(this, true); ${alElegir}(${i})`
            : 'window.marcarPuntoGrafica(this)';
        return `<g data-punto="${i}" style="cursor:pointer;" onclick="${alTocar}">
                    <title>${window.sanitizeForHTML(p.etiqueta)} · ${p.promedio}%</title>
                    <circle cx="${x(i).toFixed(1)}" cy="${y(p.promedio).toFixed(1)}" r="14" fill="transparent"/>
                    <circle cx="${x(i).toFixed(1)}" cy="${y(p.promedio).toFixed(1)}" r="4" fill="${color}" stroke="white" stroke-width="1.5"/>
                </g>`;
    }).join('');

    // Un rótulo por punto. Se elige **una sola talla para todo el eje** —la
    // corta si le cabe a la más larga, y si no la inicial del mes—: mezclarlas
    // dejaría un eje que dice «ago» en un sitio y «S» en el de al lado.
    const hueco = ancho / Math.max(n - 1, 1);
    const masLarga = Math.max(...puntos.map(p => (p.corta || '').length), 0);
    const cabeCorta = masLarga * 4.4 <= hueco - 4;
    const rotulos = puntos.map((p, i) => {
        const texto = cabeCorta ? p.corta : p.minima;
        if (!texto) return '';
        // El periodo sin resultado se rotula igual y más apagado: el eje es la
        // línea del tiempo, y ahí se ve que ese periodo pasó sin nada.
        return `<text x="${x(i).toFixed(1)}" y="${ALTO - 8}" text-anchor="middle" font-size="8"
                      fill="${p.promedio === null ? '#e2e8f0' : '#94a3b8'}">${window.sanitizeForHTML(texto)}</text>`;
    }).join('');

    // Los globos van los últimos y fuera de los puntos, para que ninguno quede
    // por debajo del punto siguiente. Se emparejan por índice.
    const globos = puntos.map((p, i) => {
        if (p.promedio === null) return '';
        const texto = `${p.etiqueta} · ${p.promedio}%`;
        const anchoGlobo = texto.length * 4.5 + 14;
        const cx = Math.max(anchoGlobo / 2 + 2, Math.min(A - anchoGlobo / 2 - 2, x(i)));
        // Encima del punto, salvo que ahí arriba ya no quepa.
        const encima = y(p.promedio) > ARRIBA + 24;
        const cy = encima ? y(p.promedio) - 24 : y(p.promedio) + 8;
        return `<g data-globo="${i}" style="display:none; pointer-events:none;">
                    <rect x="${(cx - anchoGlobo / 2).toFixed(1)}" y="${cy.toFixed(1)}" width="${anchoGlobo.toFixed(1)}" height="16" rx="5" fill="#1e293b" opacity="0.92"/>
                    <text x="${cx.toFixed(1)}" y="${(cy + 11).toFixed(1)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="white">${window.sanitizeForHTML(texto)}</text>
                </g>`;
    }).join('');

    return `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:10px 8px 4px; margin-bottom:16px;">
            <svg viewBox="0 0 ${A} ${ALTO}" style="width:100%; height:auto; display:block;" role="img"
                 aria-label="Resultados por periodo">
                ${rejilla}${umbral}${linea}${dots}${rotulos}${globos}
            </svg>
        </div>`;
};

// El globo de un punto de la gráfica: se enseña al tocarlo y se quita al volver
// a tocarlo o al tocar otro. Sólo uno a la vez, que en un teléfono dos globos
// abiertos se tapan entre sí.
//
// Se esconde con `style.display` y no con el atributo `hidden`: ese atributo lo
// entiende la hoja de estilos del navegador para el marcado HTML, y esto es un
// SVG.
//
// Con `siempre` no alterna: lo deja abierto. Es lo que hace falta cuando el
// toque además **elige** ese periodo —en la tarjeta del panel—, porque ahí el
// globo no es un detalle que se abre y se cierra sino la marca de qué se está
// mirando, y cerrarlo dejando la lista en aquel periodo sería peor que no
// marcarlo.
window.marcarPuntoGrafica = (nodo, siempre) => {
    const svg = nodo.ownerSVGElement;
    if (!svg) return;
    const globo = svg.querySelector(`[data-globo="${nodo.getAttribute('data-punto')}"]`);
    const abierto = !!globo && globo.style.display !== 'none';
    svg.querySelectorAll('[data-globo]').forEach(g => { g.style.display = 'none'; });
    if (globo && (siempre || !abierto)) globo.style.display = '';
};

// ==========================================
// EL DETALLE DE UNA CLASIFICACIÓN
// ==========================================
// El renglón de una clasificación hace dos cosas, y por eso la flecha es un
// botón y no parte de la fila: la flecha despliega ahí mismo la lista de sus
// encuestas —lo de siempre, para echar un vistazo sin salir del panel— y el
// resto del renglón abre esta hoja, donde hay sitio para decir cómo va.
//
// No consulta nada: lee `window.clasificacionesAsignadas`, que dejó puesto
// `cargarEncuestasAsignadas` con todo ya calculado.
window.alternarGrupoAsignadas = (btn, ev) => {
    // Los dos hacen falta: `stopPropagation` para que no salte el `onclick` del
    // renglón —que abriría la hoja— y `preventDefault` para que el navegador no
    // despliegue por su cuenta el <details>, que aquí se abre a mano.
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    const grupo = btn.closest('details.grupo-asignadas');
    if (!grupo) return;
    grupo.open = !grupo.open;
    // Un botón de icono no tiene texto, así que lo que hace lo cuentan su
    // `title` y su `aria-label`.
    const etiqueta = grupo.open ? 'Ocultar sus encuestas' : 'Ver sus encuestas';
    btn.setAttribute('aria-expanded', grupo.open ? 'true' : 'false');
    btn.title = etiqueta;
    btn.setAttribute('aria-label', etiqueta);
};

window.cerrarDetalleClasificacion = () => {
    const overlay = document.getElementById('modal-detalle-clasificacion');
    if (!overlay) return;
    overlay.style.display = 'none';
    // El cuerpo se arma al abrir y se vacía al cerrar: cada clasificación tiene
    // sus encuestas y las de la anterior no pintan nada aquí.
    const cuerpo = document.getElementById('cuerpo-detalle-clasif');
    if (cuerpo) cuerpo.innerHTML = '';
};

// La miniatura de la foto de alguien, redonda y del tamaño que se pida. Sin
// foto va el 👤 sobre el mismo azul que en las listas de gente, que es lo que
// deja la fila pareja en lugar de un hueco. Una ficha que ya no está en la
// plantilla se dibuja igual, con su hueco y su «ID N» al lado.
window.miniaturaDeEmpleado = (emp, lado) => {
    const tam = lado || 30;
    const foto = emp && emp.avatar
        ? `<img src="${window.procesarUrlImagen(emp.avatar)}" loading="lazy" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
        : '👤';
    const fondo = (emp && emp.avatar)
        ? 'background:white; border:1.5px solid #ddd6fe;'
        : 'background:#f5f3ff; border:1.5px solid #ddd6fe;';
    // Un empleado dado de baja se dibuja apagado, como en las demás listas.
    const apagado = (emp && emp.isActive === false) ? 'opacity:0.5; filter:grayscale(100%);' : '';
    return `<div style="width:${tam}px; height:${tam}px; border-radius:50%; flex-shrink:0; display:flex;
                        align-items:center; justify-content:center; font-size:${Math.round(tam * 0.5)}px;
                        overflow:hidden; ${fondo} ${apagado}">${foto}</div>`;
};

// Quién revisa las encuestas de una clasificación. Es la **unión de los
// efectivos** de sus encuestas —lo que devuelve `revisoresDeEncuesta`, que ya
// resuelve la precedencia: los propios de la encuesta mandan sobre los de la
// clasificación—, y no sólo los de la clasificación: una encuesta que nombra a
// los suyos también los tiene, y esconderlos sería enseñar a quien no califica.
//
// Se cuenta de cuántas encuestas del grupo revisa cada quien, que es lo único
// que separa al revisor de la clasificación entera del que sólo lleva una.
window.revisoresDelGrupo = (grupo) => {
    const cuenta = {};
    (grupo.filas || []).forEach(({ ev }) => {
        window.revisoresDeEncuesta(ev).forEach(id => {
            cuenta[String(id)] = (cuenta[String(id)] || 0) + 1;
        });
    });

    return Object.keys(cuenta).map(id => ({
        id: id,
        emp: (window.todosLosEmpleadosData || []).find(e => String(e.id) === id) || null,
        cuantas: cuenta[id]
    })).sort((a, b) => b.cuantas - a.cuantas
        || String((a.emp && a.emp.name) || a.id).localeCompare(String((b.emp && b.emp.name) || b.id), 'es'));
};

// La fila de miniaturas de la hoja de detalle. Sin revisores nombrados no se
// dibuja nada: ahí califica el jefe inmediato de cada quien, que es lo de
// siempre y no hace falta decirlo en todas las clasificaciones.
//
// Va la cara con **una sola palabra debajo** —el primer nombre, como bajo los
// avatares del equipo del panel— y todas en **una fila**, que se arrastra si no
// caben. Con el nombre completo al lado, cada revisor se llevaba un renglón
// entero y cuatro empujaban la lista de encuestas fuera de la pantalla; así el
// bloque mide lo mismo haya dos o haya seis.
//
// Lo que no cabe se dice en el `title`: el nombre completo y de cuántas
// encuestas del grupo es revisor, que es lo que distingue al de la
// clasificación entera del que lleva una encuesta suelta.
window.filaDeRevisores = (grupo) => {
    const revisores = window.revisoresDelGrupo(grupo);
    if (revisores.length === 0) return '';

    const total = (grupo.filas || []).length;
    const fichas = revisores.map(r => {
        const nombre = (r.emp && r.emp.name) ? r.emp.name : `ID ${r.id}`;
        const corto = (r.emp && r.emp.name) ? r.emp.name.split(' ')[0] : `ID ${r.id}`;
        const alcance = r.cuantas < total
            ? `revisa ${r.cuantas} de las ${total} encuestas`
            : (total === 1 ? 'revisa esta encuesta' : `revisa las ${total} encuestas`);

        // Quien no las revisa todas lleva un punto: la fila no puede decirlo
        // con palabras sin gastar el renglón que se acaba de ahorrar, pero
        // tampoco puede callarlo del todo.
        const marca = r.cuantas < total
            ? `<div style="position:absolute; right:6px; top:28px; width:10px; height:10px; border-radius:50%;
                           background:#a78bfa; border:2px solid #faf5ff;"></div>`
            : '';

        return `<div title="${window.sanitizeForHTML(nombre)} · ${alcance}"
                     style="position:relative; width:58px; flex-shrink:0; display:flex; flex-direction:column;
                            align-items:center; gap:3px;">
                    ${window.miniaturaDeEmpleado(r.emp, 40)}
                    ${marca}
                    <div style="font-size:0.7rem; color:#4c1d95; font-weight:600; line-height:1.2; max-width:100%;
                                white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.sanitizeForHTML(corto)}</div>
                </div>`;
    }).join('');

    // La fila se alinea a la izquierda y se desplaza: centrada, en cuanto
    // desborda el navegador recorta por la izquierda y a los primeros no se
    // llega arrastrando.
    return `
        <div style="background:#faf5ff; border:1px solid #ede9fe; border-radius:12px;
                    padding:10px 12px; margin-bottom:14px;">
            <div style="font-size:0.68rem; color:#7e22ce; font-weight:700; text-transform:uppercase;
                        letter-spacing:0.04em; margin-bottom:6px;">${revisores.length === 1 ? 'Revisa' : 'Revisan'}</div>
            <div style="display:flex; gap:10px; overflow-x:auto; -webkit-overflow-scrolling:touch;
                        scrollbar-width:none;">${fichas}</div>
        </div>`;
};

// Los dos botones del encabezado de la hoja de detalle, que son los mismos se
// entre por las encuestas que le tocan a uno o por las que revisa: el ojo, que
// abre quién revisa esta clasificación, y el «+», que crea una encuesta suya.
// Los dos sólo en modo administrador, cerrando esta hoja antes de abrir la suya
// —el observador de `1-config.js` apartaría ésta al ver dos abiertas, pero así
// no hay ni el fotograma con las dos a la vista— y con la etiqueta enganchada
// desde JavaScript, que el nombre cambia con cada clasificación.
// Los ids y el cierre van por argumento porque estos dos botones se dibujan en
// dos encabezados: el de la hoja `#modal-detalle-clasificacion` del panel de
// inicio y el de la hoja de evaluaciones, cuando enseña la pantalla de una
// clasificación. Lo que cambia entre los dos es qué hoja hay que cerrar antes
// de abrir la que ellos abren.
window.botonesDeClasificacion = (nombre, cuantas, encuestas, opciones) => {
    const idOjo = (opciones && opciones.idOjo) || 'btn-revisores-clasif';
    const idMas = (opciones && opciones.idMas) || 'btn-nueva-encuesta-clasif';
    const cerrar = (opciones && opciones.cerrar) || window.cerrarDetalleClasificacion;
    const esAdmin = !!window.modoAdminActivo;

    // **El ojo se queda sólo para el administrador.** Nombrar revisores es
    // repartir quién califica a quién, y un revisor podría quitarse a sí mismo
    // o quedarse con la clasificación entera; crear una encuesta, en cambio,
    // sólo se añade trabajo a sí mismo.
    const ojo = document.getElementById(idOjo);
    if (ojo) {
        const puede = esAdmin && !!window.abrirRevisoresDeClasificacion;
        ojo.hidden = !puede;
        const etiqueta = `Revisores de ${nombre}`;
        ojo.title = etiqueta;
        ojo.setAttribute('aria-label', etiqueta);
        ojo.onclick = puede
            ? () => { cerrar(); window.abrirRevisoresDeClasificacion(nombre, cuantas); }
            : null;
    }

    // El «+» lo tiene además **quien revisa esta clasificación**, y sólo ésta:
    // es el instructor que la imparte y quien sabe qué falta por medir. Se le
    // pasa la clasificación **fijada**, que es lo que bloquea el campo de la
    // hoja y lo que se vuelve a comprobar al guardar; para el administrador va
    // suelta, como siempre.
    const mas = document.getElementById(idMas);
    if (mas) {
        const user = JSON.parse(localStorage.getItem('usuarioLogueado') || 'null');
        const revisa = !esAdmin && !!user
            && window.puedeCrearEnClasificacion(nombre, user.id, encuestas);
        const puede = (esAdmin || revisa) && !!window.abrirNuevaEvaluacion;
        mas.hidden = !puede;
        const etiqueta = `Nueva encuesta en ${nombre}`;
        mas.title = etiqueta;
        mas.setAttribute('aria-label', etiqueta);
        mas.onclick = puede
            ? () => { cerrar(); window.abrirNuevaEvaluacion(nombre, !esAdmin); }
            : null;
    }
};

// El cuerpo de una clasificación: el resultado del último periodo, la línea de
// los anteriores, quién las revisa y sus encuestas. Se dibuja en **dos sitios**
// —la hoja `#modal-detalle-clasificacion` del panel de inicio y la pantalla de
// una clasificación de la hoja de evaluaciones—, así que vive aquí suelto y no
// dentro de la función que abre una de las dos. Cada sitio escribe su propio
// título: el subtítulo no dice lo mismo en los dos.
//
// `abridor` es lo que se llama al tocar una encuesta, y es lo único que cambia:
// desde el panel hay que cerrar esa hoja antes de entrar a la encuesta, y desde
// la hoja de evaluaciones se entra por `abrirHistorialEvaluacion`, que dibuja la
// encuesta en la misma hoja y conserva la flecha de volver.
window.cuerpoDetalleClasificacion = (grupo, respuestas, abridor) => {
    // Lo que se viene a ver es cómo va: el resultado del último periodo que
    // dejó alguno —con su nombre, que puede no ser el que corre— y la línea de
    // los anteriores. Cuántas faltan y cuántas están al día ya lo dice el
    // renglón de la clasificación, y aquí lo dice cada encuesta de abajo.
    // En modo administrador las respuestas que llegan aquí son de todo el
    // mundo, y `historialDeClasificacion` toma **una** por encuesta y periodo
    // —la última de quien sea—: el resultado sería el de una persona elegida al
    // azar con el rótulo de toda la empresa. `historialDeRevision` es el mismo
    // historial promediando todas, que es lo que esas respuestas significan.
    const historial = window.modoAdminActivo
        ? window.historialDeRevision(grupo, respuestas || window.respuestasAsignadas || [], { sobrePadron: true })
        : window.historialDeClasificacion(grupo, null, respuestas);
    const conDato = historial.filter(p => p.promedio !== null);
    // Con un periodo elegido en la gráfica de la tarjeta, la hoja habla de ése y
    // no del último: sus renglones ya lo hacen —`verPeriodoDeLaTarjeta` les
    // reescribe el puntaje— y un titular de septiembre encima de unas filas de
    // junio es peor que no tener titular. El eje de la gráfica sigue enseñando
    // los seis, que es lo que es.
    const elegido = window.periodoElegidoTarjeta;
    const delElegido = (elegido === null || elegido === undefined) ? null
        : conDato.find(punto => historial.indexOf(punto) === elegido);
    const ultimo = delElegido
        || (conDato.length > 0 ? conDato[conDato.length - 1] : null);

    const colorUltimo = (ultimo && typeof window.getColorScore === 'function')
        ? window.getColorScore(ultimo.promedio) : '#94a3b8';

    const resumen = `
        <div style="display:flex; align-items:center; gap:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:14px;">
            <div style="font-size:2rem; font-weight:800; color:${colorUltimo}; line-height:1; flex-shrink:0;">${ultimo ? ultimo.promedio + '%' : '—'}</div>
            <div style="min-width:0;">
                <div style="font-size:0.8rem; color:#334155; font-weight:700;">${ultimo ? 'Resultado del último periodo' : 'Todavía sin resultados'}</div>
                <div style="font-size:0.75rem; color:#94a3b8;">${ultimo
                    ? (window.modoAdminActivo
                        ? `${window.sanitizeForHTML(ultimo.etiqueta)} · ${ultimo.total}/${ultimo.divisor} respuestas`
                        : `${window.sanitizeForHTML(ultimo.etiqueta)} · ${ultimo.calificadas} de ${ultimo.total} calificada${ultimo.calificadas === 1 ? '' : 's'}`)
                    : 'Ninguna de sus encuestas se ha calificado'}</div>
            </div>
        </div>
        ${window.graficaDeLinea(historial)}`;

    const renglones = grupo.filas.map(({ ev, estado, puntaje, resp, vencimiento, existia }) => {
        const safeTitle = String(ev.title || '').replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        const ritmo = window.textoDeFrecuencia ? window.textoDeFrecuencia(ev.frequency) : '';
        const color = (puntaje !== null && typeof window.getColorScore === 'function')
            ? window.getColorScore(puntaje) : '#64748b';

        // La fecha de la que cuenta en este periodo; si no hay, la de la última
        // vez que se contestó, que es lo que la deja en contexto.
        const cuando = resp ? resp.submitted_at : ((vencimiento && vencimiento.ultimaFecha) || null);
        const fecha = cuando
            ? new Date(cuando).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
        // Con un periodo de atrás elegido en la gráfica de la tarjeta, la que
        // entonces no existía se desvanece y se queda con su ritmo a secas:
        // `verPeriodoDeLaTarjeta` la dejó sin puntaje, y sin esto su renglón
        // llevaría el estado de hoy encima de unas cifras que son de otro
        // periodo. Lo dice su `title`, como en la tarjeta del panel.
        const sinExistir = existia === false;
        const pie = [
            window.sanitizeForHTML(ritmo),
            sinExistir ? null : `<span style="color:${estado.color}; font-weight:700;">${estado.texto}</span>`,
            (!sinExistir && fecha) ? `${resp ? 'contestada' : 'última vez'} ${fecha}` : null
        ].filter(Boolean).join(' · ');

        return `
            <div onclick="${abridor}('${ev.id}', '${safeTitle}')"
                 class="${sinExistir ? 'sin-existir' : ''}"
                 title="${sinExistir ? window.TEXTO_SIN_EXISTIR : ''}"
                 style="display:flex; align-items:center; gap:12px; padding:12px 4px; border-top:1px solid #f1f5f9; cursor:pointer;">
                ${window.iconoDeAsignada(estado)}
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#1e293b; font-size:0.95rem; line-height:1.25;">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                    <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">${pie}</div>
                </div>
                ${puntaje !== null ? `<div style="font-weight:800; color:${color}; font-size:1rem; flex-shrink:0;">${puntaje}%</div>` : ''}
                <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
            </div>`;
    }).join('');

    // Quién las revisa va entre el resultado y la lista: lo que se viene a ver
    // es cómo va, así que el resultado se queda arriba del todo.
    return resumen + window.filaDeRevisores(grupo) + renglones;
};

window.abrirDetalleClasificacion = (indice) => {
    const grupo = (window.clasificacionesAsignadas || [])[indice];
    const overlay = document.getElementById('modal-detalle-clasificacion');
    const cuerpo = document.getElementById('cuerpo-detalle-clasif');
    if (!grupo || !overlay || !cuerpo) return;

    const total = grupo.filas.length;

    document.getElementById('titulo-detalle-clasif').innerText = grupo.nombre;
    // «Asignadas» es de quien mira, y administrando estas encuestas no son de
    // nadie en particular.
    document.getElementById('subtitulo-detalle-clasif').innerText = window.modoAdminActivo
        ? `${total} encuesta${total === 1 ? '' : 's'} de la empresa`
        : `${total} encuesta${total === 1 ? '' : 's'} asignada${total === 1 ? '' : 's'}`;

    window.botonesDeClasificacion(grupo.nombre, total, grupo.filas.map(f => f.ev));

    // La hoja se cierra ella misma antes de abrir la de la encuesta: el
    // observador de `1-config.js` apartaría ésta al ver dos abiertas, pero así
    // no hay ni el fotograma con las dos a la vista.
    cuerpo.innerHTML = window.cuerpoDetalleClasificacion(
        grupo, window.respuestasAsignadas,
        'window.cerrarDetalleClasificacion(); window.abrirEncuestaDesdeInicio');
    overlay.style.display = 'flex';
};

// ==========================================
// LAS ENCUESTAS QUE REVISA ESTA PERSONA
// ==========================================
// Revisar una encuesta —ser el instructor que la imparte— no depende de ser
// jefe de nadie, así que hasta ahora no se notaba en ningún sitio de la
// pantalla de inicio: la encuesta puede no tocarle a él, y el badge de
// pendientes sólo se enciende cuando alguien ya contestó. Esta tarjeta dice de
// cuáles es revisor aunque todavía no haya nada que calificar, que es lo que
// permite entrar a corregir a quién va dirigida antes de que la conteste
// nadie.
//
// Se esconde entera si no revisa ninguna, que es el caso de casi todo el
// mundo: quien no sea revisor no ve nada nuevo en su inicio.
// El estado de lo que hay que calificar, con la misma forma que
// `estadoDeAsignada` para que `iconoDeAsignada` lo dibuje sin enterarse: la
// palomita cuando no hay nada esperando y el círculo abierto cuando sí.
window.estadoDeRevision = (porCalificar) => porCalificar > 0
    ? { texto: `${porCalificar} por calificar`, fondo: '#fee2e2', color: '#b91c1c', borde: '#fecaca' }
    : { texto: 'Al día', listo: true, fondo: '#f0fdf4', color: '#15803d', borde: '#bbf7d0' };

// Las respuestas de las encuestas que esta persona revisa. **Aquí sí hay
// consulta**, al revés que en la hoja de las asignadas —que lee lo que la
// tarjeta dejó calculado—: la tarjeta de revisión sólo se trae la cuenta de lo
// que espera calificación, y traerse el historial entero de la clasificación en
// cada carga del panel sería cobrárselo a todo el que revise algo por una hoja
// que puede no abrir.
//
// Se pide una sola vez por sesión —se guarda la promesa, no el resultado— y
// acotada al periodo más antiguo que la gráfica va a enseñar: sin ese `gte` se
// traería el historial completo de toda la empresa.
window.respuestasQueReviso = null;
window.promesaRespuestasQueReviso = null;

window.cargarRespuestasQueReviso = () => {
    if (!window.promesaRespuestasQueReviso) {
        window.promesaRespuestasQueReviso = (async () => {
            const grupos = window.clasificacionesQueReviso || [];
            const encuestas = [];
            grupos.forEach(g => (g.filas || []).forEach(f => encuestas.push(f.ev)));
            if (encuestas.length === 0) { window.respuestasQueReviso = []; return []; }

            // El inicio del periodo más antiguo en juego. Una clasificación
            // puede mezclar frecuencias, así que se pregunta grupo por grupo y
            // se toma el más temprano; una encuesta de «única vez» no se puede
            // acotar —su periodo empieza en la época— y entonces no acota nada.
            let desde = null;
            grupos.forEach(g => {
                const periodos = window.periodosDeClasificacion(
                    (g.filas || []).map(f => f.ev), window.PERIODOS_EN_LA_GRAFICA);
                const masViejo = periodos[periodos.length - 1];
                if (!masViejo || !(masViejo.inicio instanceof Date)) return;
                if (!desde || masViejo.inicio < desde) desde = masViejo.inicio;
            });

            let consulta = sb.from('evaluation_responses')
                .select('id, evaluation_id, employee_id, submitted_at, review_status, grades_json')
                .in('evaluation_id', encuestas.map(e => e.id));
            if (desde instanceof Date && desde.getTime() > 0) {
                consulta = consulta.gte('submitted_at', desde.toISOString());
            }

            const { data, error } = await consulta;
            if (error) {
                console.warn('No se pudo leer el historial de lo que revisa:', error.message);
                window.respuestasQueReviso = [];
                return [];
            }

            // Sólo las que le tocan a esta persona, con la misma regla que
            // cuenta los pendientes: con varios revisores, la respuesta es de
            // quien asignó a esa persona, y las propias vuelven a su jefe.
            const porId = {};
            encuestas.forEach(ev => { porId[String(ev.id)] = ev; });
            const mio = String(window.revisorQueMira || '');

            window.respuestasQueReviso = (data || []).filter(r =>
                window.leTocaRevisar(porId[String(r.evaluation_id)], r.employee_id, mio));
            return window.respuestasQueReviso;
        })();
    }
    return window.promesaRespuestasQueReviso;
};

// El historial de una clasificación **vista desde quien la revisa**: un punto
// por periodo con el promedio de todo lo que se calificó en él, y no el de la
// respuesta propia de cada encuesta, que es lo que mira `historialDeClasificacion`.
// Aquí hay muchas personas contestando la misma encuesta y todas cuentan.
//
// El periodo se mira **de cada encuesta en el suyo** (`periodoDeEncuesta`), que
// una clasificación puede mezclar frecuencias, y el eje se rotula con el ritmo
// de la que lo marca, igual que en la otra.
//
// Con `sobrePadron` el promedio se reparte entre toda la gente a la que le
// tocaba —quien no contestó cuenta como cero—, que es lo que dice la tarjeta
// del panel en modo administrador: si la gráfica promediara sólo lo entregado,
// las dos pantallas darían cifras distintas del mismo periodo. El padrón es el
// de hoy también para los periodos de atrás, que es lo único que sabe
// `padronDeLaEncuesta`: quien se dio de baja desde entonces ya no cuenta.
window.historialDeRevision = (grupo, respuestas, opciones) => {
    const opts = (opciones === true) ? { sobrePadron: true } : (opciones || {});
    const sobrePadron = !!opts.sobrePadron;
    const encuestas = (grupo.filas || []).map(f => f.ev);

    // `frecuencia` fuerza el ritmo del eje. La gráfica de una clasificación no
    // la pasa —ahí manda su encuesta más frecuente, que es la que marca el
    // ritmo de revisión—, pero la de la tarjeta del panel habla de las trece
    // encuestas de la empresa a la vez y ahí ese criterio no vale: con una
    // semanal dentro, el eje salía en semanas y las cuatro de un mes repetían
    // el mismo dato de la mensual —el `periodoDeEncuesta` de una mensual es el
    // mes entero, se pregunte con la semana que se pregunte—, o sea cuatro
    // puntos idénticos y una línea que no dice nada.
    const conRitmo = opts.frecuencia ? [{ frequency: opts.frecuencia }] : encuestas;
    const periodos = window.periodosDeClasificacion(conRitmo, window.PERIODOS_EN_LA_GRAFICA);
    const ritmo = window.encuestaQueMarcaElRitmo(conRitmo);
    const frecuencia = (ritmo && ritmo.frequency) || 'once';

    // `padronDeLaEncuesta` recorre la plantilla entera, así que se pregunta una
    // vez por encuesta y no una vez por encuesta y periodo.
    const padrones = {};
    if (sobrePadron) encuestas.forEach(ev => {
        padrones[ev.id] = window.padronDeLaEncuesta(ev);
    });

    return periodos.slice().reverse().map(p => {
        const puntajes = [];
        let entregadas = 0;
        let suma = 0, calificadas = 0, divisor = 0, contestaron = 0;

        // El periodo que corre se pregunta **con la hora de ahora** y no con su
        // último instante, que todavía no ha llegado. Sólo importa cuando el
        // eje va más grueso que alguna encuesta: preguntándole a una semanal
        // por el 30 de septiembre, su periodo es la semana del 28 —que aún no
        // empieza— y su punto salía vacío, de modo que el último punto de la
        // línea no coincidía con el renglón de encima.
        const ahora = Date.now();
        const referencia = (p.actual && p.referencia && p.referencia.getTime() > ahora)
            ? new Date(ahora) : p.referencia;

        encuestas.forEach(ev => {
            const periodo = window.periodoDeEncuesta(ev, referencia);

            if (sobrePadron) {
                // Una encuesta que todavía no existía no vale cero en aquel
                // periodo: sin esto, la de hace tres meses dibujaría nueve
                // puntos clavados en el 0 antes de su primer resultado. Sin
                // divisor el periodo se queda sin promedio y la gráfica se lo
                // salta, que es lo que ya hacía cuando no había nada calificado.
                // Es la misma regla con la que la lista de la tarjeta descarta
                // esas encuestas al elegir un periodo de atrás.
                if (!window.encuestaExistiaEn(ev, referencia)) return;

                // Por la **misma** función que la tarjeta del panel y la hoja de
                // una encuesta: cuenta gente y no respuestas, y suma al divisor
                // a quien contestó y hoy ya no está en el padrón. Calcularlo
                // aquí aparte es lo que dejaría al punto de este periodo
                // discrepando del número que se lee arriba.
                const r = window.resumenDeEncuestaAdmin(ev, respuestas, referencia, padrones[ev.id]);
                suma += r.suma;
                calificadas += r.calificadas;
                divisor += r.total;
                contestaron += r.contestaron;
                return;
            }

            (respuestas || []).forEach(r => {
                if (String(r.evaluation_id) !== String(ev.id)) return;
                const enviada = new Date(r.submitted_at);
                if (isNaN(enviada) || enviada < periodo.inicio) return;
                if (periodo.fin && enviada >= periodo.fin) return;
                entregadas++;
                const n = window.puntajeDeRespuesta(r);
                if (n !== null) puntajes.push(n);
            });
        });

        const rotulos = window.etiquetasDeEje(p.inicio, frecuencia);

        return {
            etiqueta: p.etiqueta || p.nombre || '',
            nombre: p.nombre || p.etiqueta || '',
            corta: rotulos.corta,
            minima: rotulos.minima,
            actual: !!p.actual,
            // El instante con el que se calculó este punto. Es lo que hace que
            // volver a preguntar por él —al tocarlo en la gráfica— dé
            // exactamente la misma cifra que se está viendo dibujada.
            referencia,
            calificadas: sobrePadron ? calificadas : puntajes.length,
            // Sin `sobrePadron` son respuestas entregadas; con él, gente que
            // contestó, que es lo que cuenta `resumenDeEncuestaAdmin`.
            total: sobrePadron ? contestaron : entregadas,
            divisor,
            promedio: sobrePadron
                ? window.promedioSobrePadron(suma, calificadas, divisor)
                : (puntajes.length === 0 ? null
                    : Math.round(puntajes.reduce((a, b) => a + b, 0) / puntajes.length))
        };
    });
};

window.cargarEncuestasQueReviso = async (userId) => {
    const cont = document.getElementById('container-encuestas-reviso');
    if (!cont) return;

    cont.style.display = 'none';
    cont.innerHTML = '';

    const empStrId = String(userId).trim();

    try {
        // Sólo las encendidas: una apagada no la ve nadie salvo el
        // administrador, y tampoco genera respuestas que calificar. Sin la
        // columna de revisores —su script se corre a mano—,
        // `camposConRevisores` la deja fuera y la lista sale vacía.
        // Ser revisor puede venir de la clasificación, y `encuestasQueRevisa` lo
        // pregunta sin poder esperar.
        await window.cargarRevisoresDeClasificaciones();

        // `frequency` es para el ritmo que dice cada renglón, como en la
        // tarjeta de las asignadas.
        const campos = await window.camposConRevisores('id, title, category, frequency');
        const { data: encuestas, error } = await sb.from('evaluations')
            .select(campos)
            .eq('active', true);

        if (error || !encuestas) return;

        const mias = window.encuestasQueRevisa(encuestas, empStrId);
        if (mias.length === 0) return;

        // Cuántas respuestas espera calificar cada una. Las suyas propias no
        // cuentan: nadie califica su propia respuesta, ésa vuelve a su jefe
        // inmediato. Es el mismo filtro del badge de `calcularPendientesBatch`.
        const porCalificar = {};
        const { data: respuestas } = await sb.from('evaluation_responses')
            .select('evaluation_id, employee_id')
            .in('review_status', ['Pendiente', 'Mal Revisada'])
            .in('evaluation_id', mias.map(e => e.id))
            .neq('employee_id', empStrId);

        // No basta con que la encuesta sea suya: si a ese colaborador lo dirigió
        // a la encuesta otro de los revisores, la respuesta es de aquél y aquí
        // no se cuenta. Lo decide la misma regla que los pendientes.
        const miasPorId = {};
        mias.forEach(ev => { miasPorId[String(ev.id)] = ev; });

        (respuestas || []).forEach(r => {
            const clave = String(r.evaluation_id);
            if (!window.leTocaRevisar(miasPorId[clave], r.employee_id, empStrId)) return;
            porCalificar[clave] = (porCalificar[clave] || 0) + 1;
        });

        const totalPorCalificar = Object.values(porCalificar).reduce((a, b) => a + b, 0);

        // Agrupadas por clasificación, como las asignadas y por lo mismo: se
        // revisa —y se certifica— de una clasificación entera, así que ésa es
        // la unidad que se mira. Con siete encuestas desplegadas la tarjeta se
        // llevaba media pantalla para decir siete veces lo mismo.
        const grupos = [];
        const porClave = {};
        mias.forEach(ev => {
            const clave = window.normalizarClasificacion(ev.category);
            if (!porClave[clave]) {
                porClave[clave] = { nombre: String(ev.category || 'General').trim() || 'General', filas: [] };
                grupos.push(porClave[clave]);
            }
            porClave[clave].filas.push({ ev: ev, porCalificar: porCalificar[String(ev.id)] || 0 });
        });

        // Dentro del grupo manda lo que más espera; entre grupos, el que más
        // debe. Con el mismo número, por nombre, para que la tarjeta no baile
        // de una carga a otra.
        grupos.forEach(g => {
            g.filas.sort((a, b) => b.porCalificar - a.porCalificar
                || String(a.ev.title || '').localeCompare(String(b.ev.title || ''), 'es'));
            g.porCalificar = g.filas.reduce((n, f) => n + f.porCalificar, 0);
        });
        grupos.sort((a, b) => b.porCalificar - a.porCalificar
            || a.nombre.localeCompare(b.nombre, 'es'));

        // Lo que la hoja de detalle vuelve a leer al abrirse. Se pasa por
        // índice y no por nombre: así no hay que escapar la clasificación en un
        // atributo. `revisorQueMira` es de quién son los pendientes que se
        // cuentan, que la hoja lo necesita para acotar el historial.
        window.clasificacionesQueReviso = grupos;
        window.revisorQueMira = empStrId;

        const bloques = grupos.map((g, indice) => {
            const estadoGrupo = window.estadoDeRevision(g.porCalificar);
            const cuantas = `${g.filas.length} encuesta${g.filas.length === 1 ? '' : 's'}`;
            const pie = g.porCalificar > 0
                ? `${cuantas} · ${g.porCalificar} ${g.porCalificar === 1 ? 'respuesta' : 'respuestas'} por calificar`
                : `${cuantas} · al día`;

            const renglones = g.filas.map(({ ev, porCalificar: n }) => {
                const estado = window.estadoDeRevision(n);
                const safeTitle = String(ev.title || '').replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                const ritmo = window.textoDeFrecuencia ? window.textoDeFrecuencia(ev.frequency) : '';

                return `
                    <div onclick="window.abrirEncuestaQueReviso('${ev.id}', '${safeTitle}')"
                         title="${window.sanitizeForHTML(ev.title || 'Sin título')} · ${estado.texto}"
                         style="display:flex; align-items:center; gap:10px; padding:10px 8px; border-top:1px solid #f1f5f9; cursor:pointer;">
                        ${window.iconoDeAsignada(estado)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:600; color:#1e293b; font-size:0.9rem; line-height:1.2;">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                            <div style="font-size:0.72rem; color:#94a3b8;">${[window.sanitizeForHTML(ritmo),
                                `<span style="color:${estado.color}; font-weight:700;">${estado.texto}</span>`].filter(Boolean).join(' · ')}</div>
                        </div>
                        <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
                    </div>`;
            }).join('');

            // El mismo renglón que el de las asignadas, y por eso comparte su
            // clase y su botón: tocarlo abre la hoja de detalle y la flecha
            // despliega aquí mismo la lista de sus encuestas.
            return `
                <details class="grupo-asignadas">
                    <summary onclick="event.preventDefault(); window.abrirDetalleClasificacionRevision(${indice})">
                        ${window.iconoDeAsignada(estadoGrupo)}
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.8rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.4px;">${window.sanitizeForHTML(g.nombre)}</div>
                            <div style="font-size:0.72rem; color:#94a3b8;">${pie}</div>
                        </div>
                        <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
                        <button type="button" class="grupo-asignadas-boton" aria-expanded="false"
                                onclick="window.alternarGrupoAsignadas(this, event)"
                                title="Ver sus encuestas" aria-label="Ver sus encuestas">
                            <svg class="grupo-asignadas-flecha" width="18" height="18" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"
                                 stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                    </summary>
                    ${renglones}
                </details>`;
        }).join('');

        const resumen = totalPorCalificar > 0
            ? `${totalPorCalificar} ${totalPorCalificar === 1 ? 'respuesta espera' : 'respuestas esperan'} tu calificación`
            : 'No hay nada esperando calificación';

        // El título se queda, al revés que en la tarjeta de las asignadas: ahí
        // lo que se ve son las encuestas de uno y no hace falta decirlo, y aquí
        // la tarjeta se parece a aquélla y hay que separarlas.
        cont.innerHTML = `
            <div style="background:white; border-radius:16px; padding:15px 15px 5px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); border:1px solid #f1f5f9;">
                <h3 style="margin:0 0 2px 0; color:#7e22ce; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">Encuestas que revisas</h3>
                <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:4px;">${resumen}</div>
                ${bloques}
            </div>`;
        cont.style.display = 'block';
    } catch (e) {
        // Nada que enseñar es mejor que una tarjeta rota: el resto del inicio
        // no depende de esto.
        console.warn('No se pudieron cargar las encuestas que revisa:', e.message);
    }
};

// La hoja de detalle de una clasificación **de las que uno revisa**. Es la
// misma hoja que la de las asignadas —`#modal-detalle-clasificacion`, con sus
// dos botones de administrador y su fila de quién revisa—, y lo que cambia es
// de qué habla: ahí, cómo va uno; aquí, cómo va la gente a la que uno califica
// y qué le queda por calificar.
//
// A diferencia de aquélla, **ésta sí consulta**: el historial no lo dejó
// calculado nadie (ver `cargarRespuestasQueReviso`). Por eso se dibuja en dos
// tiempos —el encabezado, la fila de revisores y las encuestas van en el primer
// fotograma, y el resultado y la gráfica caen cuando llegan—, que es lo que
// evita quedarse mirando una hoja en blanco.
window.abrirDetalleClasificacionRevision = async (indice) => {
    const grupo = (window.clasificacionesQueReviso || [])[indice];
    const overlay = document.getElementById('modal-detalle-clasificacion');
    const cuerpo = document.getElementById('cuerpo-detalle-clasif');
    if (!grupo || !overlay || !cuerpo) return;

    const total = grupo.filas.length;

    document.getElementById('titulo-detalle-clasif').innerText = grupo.nombre;
    document.getElementById('subtitulo-detalle-clasif').innerText =
        `${total} encuesta${total === 1 ? '' : 's'} que revisas`;

    window.botonesDeClasificacion(grupo.nombre, total, grupo.filas.map(f => f.ev));

    const renglones = grupo.filas.map(({ ev, porCalificar }) => {
        const estado = window.estadoDeRevision(porCalificar);
        const safeTitle = String(ev.title || '').replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        const ritmo = window.textoDeFrecuencia ? window.textoDeFrecuencia(ev.frequency) : '';
        const pie = [
            window.sanitizeForHTML(ritmo),
            `<span style="color:${estado.color}; font-weight:700;">${estado.texto}</span>`
        ].filter(Boolean).join(' · ');

        return `
            <div onclick="window.cerrarDetalleClasificacion(); window.abrirEncuestaQueReviso('${ev.id}', '${safeTitle}')"
                 style="display:flex; align-items:center; gap:12px; padding:12px 4px; border-top:1px solid #f1f5f9; cursor:pointer;">
                ${window.iconoDeAsignada(estado)}
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#1e293b; font-size:0.95rem; line-height:1.25;">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                    <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">${pie}</div>
                </div>
                <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
            </div>`;
    }).join('');

    const cargando = `<div id="resumen-revision-clasif" style="text-align:center; padding:24px 0; color:#94a3b8; font-size:0.8rem;">Cargando resultados...</div>`;

    cuerpo.innerHTML = cargando + window.filaDeRevisores(grupo) + renglones;
    overlay.style.display = 'flex';

    const respuestas = await window.cargarRespuestasQueReviso();

    // La hoja pudo cerrarse —o abrirse otra clasificación— mientras se
    // consultaba: se escribe sólo si el hueco sigue siendo el de esta hoja.
    const hueco = document.getElementById('resumen-revision-clasif');
    if (!hueco || overlay.style.display !== 'flex') return;

    const historial = window.historialDeRevision(grupo, respuestas);
    const conDato = historial.filter(p => p.promedio !== null);
    const ultimo = conDato.length > 0 ? conDato[conDato.length - 1] : null;
    const color = (ultimo && typeof window.getColorScore === 'function')
        ? window.getColorScore(ultimo.promedio) : '#94a3b8';

    // El pie dice lo que sí es suyo: cuántas esperan su calificación. El
    // resultado de arriba es de la gente que contesta, no de quien mira.
    const espera = grupo.porCalificar > 0
        ? `<span style="color:#b91c1c; font-weight:700;">${grupo.porCalificar} ${grupo.porCalificar === 1 ? 'espera' : 'esperan'} tu calificación</span>`
        : 'Nada espera tu calificación';

    hueco.outerHTML = `
        <div style="display:flex; align-items:center; gap:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:14px;">
            <div style="font-size:2rem; font-weight:800; color:${color}; line-height:1; flex-shrink:0;">${ultimo ? ultimo.promedio + '%' : '—'}</div>
            <div style="min-width:0;">
                <div style="font-size:0.8rem; color:#334155; font-weight:700;">${ultimo ? 'Resultado del último periodo' : 'Todavía sin resultados'}</div>
                <div style="font-size:0.75rem; color:#94a3b8;">${ultimo
                    ? `${window.sanitizeForHTML(ultimo.etiqueta)} · ${ultimo.calificadas} calificada${ultimo.calificadas === 1 ? '' : 's'} de ${ultimo.total}`
                    : 'Ninguna respuesta se ha calificado todavía'}</div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${espera}</div>
            </div>
        </div>
        ${window.graficaDeLinea(historial)}`;
};

// Se abre **la hoja de la encuesta, sin pasar por la lista**. Antes se montaba
// la lista entera y encima se pintaba el detalle: dos consultas y un fotograma
// —a veces más de uno— de una lista que nadie había pedido. `abrirHistorialEvaluacion`
// no la necesita, y lo dice su propio código: se trae las preguntas y las
// respuestas de esa encuesta, y `encuestaDeLaRespuesta` consulta la ficha
// cuando no está en caché, precisamente porque «a este panel se llega también
// desde el inicio».
//
// Lo único que hacía falta de la lista era la hoja donde dibujar, y eso es hoy
// `montarHojaEvaluaciones()`, que la monta y la enseña sin traer nada.
//
// El encabezado se pone antes de la consulta, con el título de la encuesta: así
// el primer fotograma ya dice a dónde se entró. Y con la cruz, no con la flecha
// de volver: aquí no se pasó por la lista, así que esa flecha llevaba a una
// pantalla por la que nadie había pasado. Lo dice `vengoDeLaListaDeEncuestas`.
//
// Lleva al detalle y no a contestar directamente, que es lo que deja que la
// pantalla decida qué botón toca: responder, elegir a qué colaborador se
// evalúa en una encuesta de modo jefe, o corregir a quién va dirigida.
window.abrirEncuestaDesdeInicio = async (evalId, titulo) => {
    if (!window.montarHojaEvaluaciones || !window.abrirHistorialEvaluacion) {
        alert('Módulo de encuestas en actualización');
        return;
    }

    window.vengoDeLaListaDeEncuestas = false;
    // Ni a la pantalla de una clasificación de la lista: por aquí no se pasó
    // por ninguna de las dos, así que el encabezado se queda con la cruz.
    window.grupoDeLaListaAbierto = null;
    const container = window.montarHojaEvaluaciones();
    window.encabezadoHojaEvaluaciones(titulo, null, evalId);
    if (container) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;">' +
            '<div class="spinner" style="margin: 0 auto 15px auto;"></div><p>Abriendo encuesta…</p></div>';
    }

    await window.abrirHistorialEvaluacion(evalId, titulo);
};

// El nombre con el que la tarjeta de revisión la llamaba desde el principio.
window.abrirEncuestaQueReviso = window.abrirEncuestaDesdeInicio;

window.cargarDatosEmpleados = async () => {
    // 1. Agregamos is_active al select (quitamos el filtro .not)
    //
    // Va por `consultarEmpleados` y no por un `select` a pelo desde que también
    // se traen los encargos: esa columna la añade un script de sql/ que se corre
    // a mano, y pedirle a PostgREST una columna que no existe no devuelve la
    // fila sin ese campo, revienta la consulta entera —y con ella la caché de la
    // que cuelga medio panel—. El ayudante la reintenta sin ella.
    const { data, error } = await window.consultarEmpleados(
        'employee_id, name, department, area_id, puesto, supervisor_id, created_at, avatar_url, areas(nombre), is_active, encargos');

    if(error || !data) return;
    
    window.todosLosEmpleadosData = [];
    window.employeeNameMap = {}; window.employeeDeptMap = {}; window.employeeSupMap = {};
    
    const idToName = {};
    data.forEach(d => { if(d.employee_id) idToName[d.employee_id] = d.name; });
    
    data.forEach(d => {
        const puesto = (d.puesto || "").trim();
        const fecha = d.created_at ? new Date(d.created_at) : new Date();
        const depto = (d.department || "General").trim();
        const supervisorId = d.supervisor_id;
        let supervisorNombre = (supervisorId && idToName[supervisorId]) ? idToName[supervisorId] : "Sin Supervisor";
        
        const areaNombre = d.areas ? d.areas.nombre : "Sin Área";

        window.todosLosEmpleadosData.push({
            date: fecha, dept: depto, area: areaNombre, sup: supervisorNombre, supId: supervisorId,
            id: String(d.employee_id), name: d.name, puesto: puesto,
            // Los encargos extra son otro corte del desglose de estadísticas.
            // Sin la columna en la base llegan vacíos y todo el mundo cae en
            // «Sin encargos», que es lo que de verdad hay.
            encargos: window.normalizarEncargos(d.encargos),
            avatar: d.avatar_url,
            isActive: d.is_active !== false // <-- NUEVO: Guardamos el estado para usarlo visualmente
        });
        
        if(d.employee_id) {
            window.employeeNameMap[d.employee_id] = d.name;
            window.employeeDeptMap[String(d.employee_id)] = depto;
            window.employeeSupMap[String(d.employee_id)] = supervisorNombre;
        }
    });
    window.renderizarVistaRapidaEquipo(true);
    const userLog = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if(userLog) {
        const miData = window.todosLosEmpleadosData.find(e => String(e.id) === String(userLog.id));
        const headerIconDiv = document.getElementById('header-user-icon');
        if(miData && miData.avatar && headerIconDiv) {
             const safeUrl = window.procesarUrlImagen(miData.avatar);
             headerIconDiv.innerHTML = `
                <img src="${safeUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                <div id="badge-count-${userLog.id}" class="notification-badge" style="display:none;">0</div>
             `;
             headerIconDiv.style.background = 'white';
             headerIconDiv.style.padding = '0';
             setTimeout(() => window.calcularPendientesBatch([userLog.id]), 200);
        }
    }
};

window.renderizarVistaRapidaEquipo = (forzarRender = false) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const container = document.getElementById('quick-team-view');
    
    if(!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) return;

    if(!container || !user) return;
    const misDirectos = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
    const idsParaCalculo = misDirectos.map(e => e.id);
    
    misDirectos.sort((a,b) => {
        const pendientesA = (window.statsPendientes && window.statsPendientes[a.id]) ? window.statsPendientes[a.id].total : 0;
        const pendientesB = (window.statsPendientes && window.statsPendientes[b.id]) ? window.statsPendientes[b.id].total : 0;
        if (pendientesB !== pendientesA) return pendientesB - pendientesA;
        return a.name.localeCompare(b.name);
    });
    
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.justifyContent = 'center';
    container.style.overflowX = 'visible';
    
    if (misDirectos.length > 0) {
        const btnTeam = document.createElement('div');
        btnTeam.className = 'team-member-container';
        btnTeam.onclick = window.abrirStatsEquipo;
        btnTeam.innerHTML = `
            <div class="team-summary-btn" title="Ver desempeño grupal">
                👥
                <div id="badge-team-total" class="notification-badge" style="display:none; background:#ea580c;">0</div>
            </div>
            <div style="font-size:0.7rem; color:#0284c7; font-weight:bold; text-align:center; margin-top:5px;">Mi Equipo</div>
        `;
        container.appendChild(btnTeam);
    }
    
    misDirectos.forEach(emp => {
        const div = document.createElement('div');
        div.className = 'team-member-container';
        div.onclick = () => { window.abrirStatsEmpleado(emp.id, emp.name, emp.puesto); };
        let avatarHtml = '👤';
        let bgStyle = 'background:#eff6ff; border:2px solid #bfdbfe;';
        if (emp.avatar) {
            const safeUrl = window.procesarUrlImagen(emp.avatar);
            avatarHtml = `<img src="${safeUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
            bgStyle = 'background:white; border:2px solid #bfdbfe; padding:0;';
        }
        
        // NUEVO: Variables de estilo para inactivos
        let opacityStyle = emp.isActive === false ? 'opacity: 0.5; filter: grayscale(100%);' : '';
        let badgeInactivo = emp.isActive === false ? `<div style="position:absolute; bottom:-4px; background:#64748b; color:white; font-size:0.5rem; padding:2px 4px; border-radius:4px; font-weight:bold; z-index:10; border: 1px solid white;">INACTIVO</div>` : '';

        div.innerHTML = `
            <div style="width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; margin-bottom:5px; box-shadow:0 2px 4px rgba(0,0,0,0.05); position:relative; ${bgStyle} ${opacityStyle}">
                ${avatarHtml}
                <div id="badge-count-${emp.id}" class="notification-badge" style="display:none;">0</div>
                ${badgeInactivo}
            </div>
            <div style="font-size:0.7rem; color:#334155; text-align:center; line-height:1.2; max-width:70px; white-space:normal; ${opacityStyle}">
                ${emp.name.split(' ')[0]}
            </div>
        `;
        container.appendChild(div);
    });
    
    const btnAdd = document.createElement('div');
    btnAdd.className = 'team-member-container';
    btnAdd.onclick = window.abrirModalReclamo;
    btnAdd.innerHTML = `
        <div class="add-member-btn" title="Agregar a mi equipo">＋</div>
        <div style="font-size:0.7rem; color:#94a3b8; text-align:center; margin-top:5px;">Agregar</div>
    `;
    container.appendChild(btnAdd);

    if (window.modoAdminActivo) {
        const btnTodos = document.createElement('div');
        btnTodos.className = 'team-member-container';
        btnTodos.onclick = window.abrirModalTodosLosEmpleados;
        btnTodos.innerHTML = `
            <div style="width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; margin-bottom:5px; box-shadow:0 2px 4px rgba(0,0,0,0.05); position:relative; background:#fef08a; border:2px solid #fde047; color: #854d0e; cursor:pointer;">
                🌍
            </div>
            <div style="font-size:0.7rem; color:#ca8a04; font-weight:bold; text-align:center; margin-top:5px;">Todos (Admin)</div>
        `;
        container.appendChild(btnTodos);
    }
    
    const btnEquipo = document.getElementById('btn-ver-pendientes-equipo');
    if (btnEquipo) {
        if (misDirectos.length > 0 || window.modoAdminActivo) btnEquipo.style.display = 'flex';
        else btnEquipo.style.display = 'none';
    }

    setTimeout(() => {
        window.calcularPendientesBatch(idsParaCalculo);
    }, 500);
};

// --- NUEVA LÓGICA DE ORDENAMIENTO ---
window.ordenActualTodos = 'cantidad';

window.toggleOrdenTodos = () => {
    window.ordenActualTodos = window.ordenActualTodos === 'cantidad' ? 'antiguedad' : 'cantidad';
    
    const btn = document.getElementById('btn-orden-todos');
    if (btn) {
        btn.innerHTML = window.ordenActualTodos === 'cantidad' 
            ? '⏳ Ordenar: Mayor Cantidad' 
            : '🚨 Ordenar: Más Atrasados';
        
        btn.style.background = window.ordenActualTodos === 'antiguedad' ? '#fff1f2' : '#f8fafc';
        btn.style.color = window.ordenActualTodos === 'antiguedad' ? '#e11d48' : '#475569';
        btn.style.borderColor = window.ordenActualTodos === 'antiguedad' ? '#fecdd3' : '#cbd5e1';
    }

    const inputBusqueda = document.getElementById('inp-buscar-todos');
    window.filtrarTodosLosEmpleados(inputBusqueda ? inputBusqueda.value : '');
};
// ------------------------------------

window.abrirModalTodosLosEmpleados = async () => {
    const modal = document.getElementById('modal-todos-empleados');
    if (!modal) return;
    
    const inputBusqueda = document.getElementById('inp-buscar-todos');
    if (inputBusqueda) inputBusqueda.value = '';

    modal.style.display = 'flex';
    
    const container = document.getElementById('lista-todos-empleados');
    if(container) {
        container.innerHTML = '<div style="width:100%; text-align:center; padding:30px; color:#64748b; font-weight:bold;">⏳ Calculando pendientes para ordenar la lista...</div>';
    }

    const ids = window.todosLosEmpleadosData.map(e => e.id);
    await window.calcularPendientesBatch(ids);

    window.renderizarListaTodosLosEmpleados(window.todosLosEmpleadosData);
};

window.filtrarTodosLosEmpleados = (texto) => {
    if (!texto) {
        window.renderizarListaTodosLosEmpleados(window.todosLosEmpleadosData);
        return;
    }
    const busqueda = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const filtrados = window.todosLosEmpleadosData.filter(e =>
        e.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(busqueda)
    );
    window.renderizarListaTodosLosEmpleados(filtrados);
};

window.renderizarListaTodosLosEmpleados = (empleados) => {
    const container = document.getElementById('lista-todos-empleados');
    if (!container) return;
    
    container.innerHTML = '';
    
    const ordenados = [...empleados].sort((a,b) => {
        const statsA = window.statsPendientes[a.id] || { total: 0 };
        const statsB = window.statsPendientes[b.id] || { total: 0 };
        
        const pendientesA = statsA.total;
        const pendientesB = statsB.total;
        
        // La columna "fecha_mas_antigua" debe llegar desde Supabase (en milisegundos)
        const fechaA = statsA.fecha_mas_antigua || Infinity; 
        const fechaB = statsB.fecha_mas_antigua || Infinity;

        if (window.ordenActualTodos === 'antiguedad') {
            if (pendientesA === 0) return 1;
            if (pendientesB === 0) return -1;
            
            if (fechaA !== fechaB) {
                return fechaA - fechaB; 
            }
            return pendientesB - pendientesA;
        } else {
            if (pendientesB !== pendientesA) {
                return pendientesB - pendientesA;
            }
            return a.name.localeCompare(b.name);
        }
    });

    ordenados.forEach(emp => {        const div = document.createElement('div');
        div.className = 'team-member-container';
        
        div.onclick = () => {
            document.getElementById('modal-todos-empleados').style.display = 'none';
            window.abrirStatsEmpleado(emp.id, emp.name, emp.puesto);
        };
        
        let avatarHtml = '👤';
        let bgStyle = 'background:#eff6ff; border:2px solid #bfdbfe;';
        if (emp.avatar) {
            const safeUrl = window.procesarUrlImagen(emp.avatar);
            avatarHtml = `<img src="${safeUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
            bgStyle = 'background:white; border:2px solid #bfdbfe; padding:0;';
        }
        
        const stats = window.statsPendientes && window.statsPendientes[emp.id];
        const displayBadge = (stats && stats.total > 0) ? 'flex' : 'none';
        const textBadge = (stats && stats.total > 0) ? (stats.total > 99 ? '99+' : stats.total) : '0';

        // NUEVO: Variables de estilo para inactivos
        let opacityStyle = emp.isActive === false ? 'opacity: 0.5; filter: grayscale(100%);' : '';
        let badgeInactivo = emp.isActive === false ? `<div style="position:absolute; bottom:-4px; background:#64748b; color:white; font-size:0.5rem; padding:2px 4px; border-radius:4px; font-weight:bold; z-index:10; border: 1px solid white;">INACTIVO</div>` : '';

div.innerHTML = `
            <div style="width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5rem; margin-bottom:5px; box-shadow:0 2px 4px rgba(0,0,0,0.05); position:relative; cursor:pointer; ${bgStyle} ${opacityStyle}">
                ${avatarHtml}
                <div id="badge-count-${emp.id}" class="notification-badge" style="display:${displayBadge};">${textBadge}</div>
                ${badgeInactivo}
            </div>
            <div style="font-size:0.7rem; color:#334155; text-align:center; line-height:1.2; width:70px; word-wrap: break-word; ${opacityStyle}">
                ${emp.name.split(' ')[0]} ${emp.name.split(' ')[1] ? emp.name.split(' ')[1].charAt(0) + '.' : ''}
            </div>
        `;
        container.appendChild(div);
    });
};

window.actualizarResumenPendientesEnModal = (empId) => {
    const summaryBox = document.getElementById('stats-summary-content');
    if(!summaryBox) return;

    // NUEVO: Aplicar difuminado si es inactivo
    const empData = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(empId)) : null;
    if (empData && empData.isActive === false) {
        summaryBox.style.opacity = "0.5";
        summaryBox.style.filter = "grayscale(100%)";
    } else {
        summaryBox.style.opacity = "1";
        summaryBox.style.filter = "none";
    }

    const modal = document.getElementById('modal-stats-empleado');
    if(modal && modal.style.display === 'none') return;
    if(empId === 'EQUIPO') return;
    if(window.currentStatsEmpId !== empId) return;
    
    const stats = window.statsPendientes[empId];
    
    const cardStyle = "flex: 1; min-width: 100px; padding: 12px; border-radius: 12px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03); border: 1px solid transparent;";

    if (!stats) {
        summaryBox.innerHTML = "<div style='text-align:center; color:#64748b; padding: 10px;'>⏳ Calculando...</div>";
    } else if (stats.total === 0 && stats.porCalificar === 0) {
        summaryBox.innerHTML = `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 5px;">🎉</div>
                <div style="color: #166534; font-weight: bold; font-size: 1rem;">¡Todo al día!</div>
                <div style="color: #15803d; font-size: 0.85rem;">No hay tareas pendientes.</div>
            </div>`;
    } else {
        let cardsHtml = '';
        if (stats.incidentes > 0) {
            cardsHtml += `<div style="${cardStyle} background: #fff1f2; border-color: #fecdd3;"><div style="font-size: 1.5rem; color: #e11d48; font-weight: 800; line-height: 1;">${stats.incidentes}</div><div style="font-size: 0.75rem; color: #9f1239; font-weight: 600; margin-top: 4px;">Incidentes</div></div>`;
        }
        if (stats.difusiones > 0) {
            cardsHtml += `<div style="${cardStyle} background: #eff6ff; border-color: #bfdbfe;"><div style="font-size: 1.5rem; color: #2563eb; font-weight: 800; line-height: 1;">${stats.difusiones}</div><div style="font-size: 0.75rem; color: #1e40af; font-weight: 600; margin-top: 4px;">Difusiones</div></div>`;
        }
        if (stats.evaluaciones > 0) {
            cardsHtml += `<div style="${cardStyle} background: #f5f3ff; border-color: #ddd6fe;"><div style="font-size: 1.5rem; color: #7c3aed; font-weight: 800; line-height: 1;">${stats.evaluaciones}</div><div style="font-size: 0.75rem; color: #5b21b6; font-weight: 600; margin-top: 4px;">Encuestas</div></div>`;
        }
        if (stats.porCalificar > 0) {
            cardsHtml += `<div style="${cardStyle} background: #fff7ed; border-color: #fed7aa;"><div style="font-size: 1.5rem; color: #ea580c; font-weight: 800; line-height: 1;">${stats.porCalificar}</div><div style="font-size: 0.75rem; color: #9a3412; font-weight: 600; margin-top: 4px;">Por Calificar</div></div>`;
        }
        summaryBox.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 10px;">${cardsHtml}</div><div style="margin-top: 10px; font-size: 0.75rem; color: #94a3b8; text-align: center;">Total pendientes: <b>${stats.total}</b></div>`;
    }
};

window.calcularPendientesBatch = async (idsEmpleados) => {
    if (!idsEmpleados || idsEmpleados.length === 0) return;

    const now = Date.now();
    const isCacheValid = (now - window.CACHE_DASHBOARD.timestamp) < window.CACHE_DASHBOARD.TTL;
    const idsFaltantes = isCacheValid ? idsEmpleados.filter(id => !window.CACHE_DASHBOARD.pendientes[id]) : idsEmpleados;

    if (idsFaltantes.length === 0) {
        idsEmpleados.forEach(empId => actualizarBadgeUI(empId, window.CACHE_DASHBOARD.pendientes[empId]));
        actualizarBadgeEquipo();
        return;
    }

    try {
        // `requires_min_score` va con `retry_days`: sin ella el badge daba por
        // hecho que toda encuesta exige el 80% y contaba como pendiente hasta
        // las respuestas de las que lo tienen apagado.
        // Igual que en el panel de pendientes: `esEvaluacionPendiente` pregunta
        // por la ventana de las encuestas que pasan lista sin poder esperar.
        await window.cargarVentanasDeAsistencia();

        // Igual que en el panel de pendientes: `leTocaRevisar` pregunta por los
        // revisores de la clasificación sin poder esperar, así que la caché se
        // llena antes de contar nada.
        await window.cargarRevisoresDeClasificaciones();

        const camposEvals = await window.camposConRelanzamiento(await window.camposConMinimo(await window.camposConReintento(await window.camposConRevisores(
            'id, category, target_positions, target_departments, target_employees, mode, is_obligatory, active, frequency, created_at'))));
        const { data: activeEvalsDb } = await sb.from('evaluations')
            .select(camposEvals)
            .eq('active', true);
            
        const activeEvals = activeEvalsDb ? activeEvalsDb : [];

        const { data: incidentes } = await sb.from('incidents')
            .select('id, tipo, date');

        await Promise.all(idsFaltantes.map(async (empId) => {
            const empStrId = String(empId).trim();
            const empleadoData = window.todosLosEmpleadosData.find(e => String(e.id) === empStrId);
            const puestoEmpleado = empleadoData ? (empleadoData.puesto || "").trim().toUpperCase() : "";
            const deptoEmpleado = empleadoData ? (empleadoData.department || empleadoData.dept || "GENERAL").trim().toUpperCase() : "GENERAL";

            // Un empleado dado de baja no tiene nada pendiente: ya no firma ni
            // responde. Se guarda el cero para que el badge desaparezca en vez
            // de arrastrar el conteo del día que se le dio de baja.
            if (!window.empleadoActivo(empleadoData)) {
                const sinPendientes = { incidentes: 0, difusiones: 0, evaluaciones: 0, porCalificar: 0, total: 0 };
                window.statsPendientes[empId] = sinPendientes;
                window.CACHE_DASHBOARD.pendientes[empId] = sinPendientes;
                actualizarBadgeUI(empId, sinPendientes);
                return;
            }

            let countEvals = 0;
            if (activeEvals && activeEvals.length > 0) {
                const evalsQueLeTocan = activeEvals.filter(ev => {
                    if (ev.is_obligatory === false || String(ev.is_obligatory) === 'false') return false;

                    let targetEmps = ev.target_employees;
                    if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                    if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];
                    const empsNorm = targetEmps.map(t => String(t).trim());

                    if (empsNorm.length > 0 && !empsNorm.includes('ALL')) {
                        return empsNorm.includes(empStrId);
                    }

                    let targets = ev.target_positions;
                    if (typeof targets === 'string') { try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; } }
                    if (!Array.isArray(targets)) targets = ['ALL'];
                    const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
                    const matchPuesto = targets.length === 0 || targets.includes('ALL') || targetsNorm.includes(puestoEmpleado);

                    let targetsDeptos = ev.target_departments;
                    if (typeof targetsDeptos === 'string') { try { targetsDeptos = JSON.parse(targetsDeptos); } catch(e) { targetsDeptos = ['ALL']; } }
                    if (!Array.isArray(targetsDeptos)) targetsDeptos = ['ALL'];
                    const targetsNormDeptos = targetsDeptos.map(t => String(t).toUpperCase().trim());
                    const matchDepto = targetsDeptos.length === 0 || targetsDeptos.includes('ALL') || targetsNormDeptos.includes(deptoEmpleado);

                    return matchPuesto && matchDepto;
                });

                if (evalsQueLeTocan.length > 0) {
                    const idsEvals = evalsQueLeTocan.map(e => e.id);
                    // `grades_json` es para el plazo de reintento: sin el
                    // puntaje no se sabe si hay que reponer la encuesta.
                    const { data: respuestas } = await sb.from('evaluation_responses')
                        .select('evaluation_id, submitted_at, review_status, grades_json')
                        .eq('employee_id', empId)
                        .in('evaluation_id', idsEvals);
                    
                    countEvals = evalsQueLeTocan.filter(ev => {
                                            if (window.esEvaluacionPendiente) {
                                                // Usamos la nueva lógica unificada (Retorna un objeto, por lo que leemos .mostrar)
                                                return window.esEvaluacionPendiente(respuestas, ev.id, ev.frequency, ev.created_at, ev, (ev.mode || 'self') !== 'boss').mostrar;
                                            } else {
                                                // Fallback de seguridad por si el archivo 7-pendientes.js aún no ha cargado
                                                const resps = respuestas ? respuestas.filter(r => r.evaluation_id === ev.id) : [];
                                                if (resps.length === 0) return true;
                                                if (resps[0].review_status === 'Mal Revisada') return true;
                                                return false;
                                            }
                                        }).length;
                }
            }

            let countInc = 0;
            let countDif = 0;

            if (!window.esPuestoExentoDeFirmar(puestoEmpleado) && incidentes && incidentes.length > 0) {
                const { data: firmas } = await sb.from('incident_signatures')
                    .select('incident_id')
                    .eq('employee_id', empId);
                
                const firmadosIds = firmas ? firmas.map(f => f.incident_id) : [];
                const fechaIngresoEmp = window.fechaDeAltaEmpleado(empleadoData);

                incidentes.forEach(inc => {
                    const incDate = window.fechaDeRegistro(inc.date);
                    if (!incDate) return;

                    if (incDate >= fechaIngresoEmp) {
                        if (!firmadosIds.includes(inc.id)) {
                            if (inc.tipo === 'Capacitación') return;
                            else if (inc.tipo === 'Difusión') countDif++;
                            else countInc++;
                        }
                    }
                });
            }

            let countPorCalificar = 0;

            // Lo que esta persona revisa por nombramiento: no depende de ser
            // jefe de nadie. Al descartar sus propias respuestas —nadie se
            // califica a sí mismo— todo lo que quede le toca, así que basta
            // contarlo.
            const evalsQueRevisa = window.encuestasQueRevisa(activeEvals, empStrId);
            if (evalsQueRevisa.length > 0) {
                // Ya no se cuentan de un plumazo: una respuesta de alguien a
                // quien dirigió a la encuesta otro revisor es de aquél, así que
                // hace falta mirar de quién es cada una con la misma regla que
                // usa el panel de pendientes.
                const revisadasPorId = {};
                evalsQueRevisa.forEach(ev => { revisadasPorId[String(ev.id)] = ev; });

                const { data: nombradas } = await sb.from('evaluation_responses')
                    .select('id, employee_id, evaluation_id')
                    .in('review_status', ['Pendiente', 'Mal Revisada'])
                    .in('evaluation_id', evalsQueRevisa.map(e => e.id))
                    .neq('employee_id', empStrId);

                countPorCalificar += (nombradas || []).filter(r =>
                    window.leTocaRevisar(revisadasPorId[String(r.evaluation_id)], r.employee_id, empStrId)
                ).length;
            }

            const esJefe = window.todosLosEmpleadosData.some(e => String(e.supId) === empStrId);
            
            if (esJefe) {
                const misSubs = window.todosLosEmpleadosData.filter(e => String(e.supId) === empStrId);
                const misSubsIds = misSubs.map(e => e.id);
                
                if(misSubsIds.length > 0) {
                    // Sólo cuentan las respuestas de encuestas encendidas: si
                    // no, el badge seguiría pidiendo calificar algo que ya no
                    // aparece en la lista de pendientes.
                    //
                    // Ya no se cuentan de un plumazo: una encuesta con
                    // revisores propios deja de ser cosa del jefe, así que hace
                    // falta mirar respuesta por respuesta con la misma regla
                    // que usa el panel de pendientes.
                    const evalPorId = {};
                    activeEvals.forEach(ev => { evalPorId[String(ev.id)] = ev; });

                    const { data: delEquipo } = await sb.from('evaluation_responses')
                        .select('id, employee_id, evaluation_id')
                        .in('review_status', ['Pendiente', 'Mal Revisada'])
                        .in('employee_id', misSubsIds)
                        .in('evaluation_id', activeEvals.map(e => e.id));

                    // Las encuestas que además revisa por nombramiento ya se
                    // contaron arriba, y las de su equipo entran en ese conteo:
                    // sin esto sumarían dos veces.
                    const yaContadas = new Set(evalsQueRevisa.map(e => String(e.id)));

                    countPorCalificar += (delEquipo || []).filter(r =>
                        !yaContadas.has(String(r.evaluation_id)) &&
                        window.leTocaRevisar(evalPorId[String(r.evaluation_id)], r.employee_id, empStrId)
                    ).length;

                    const teamObligatorias = activeEvalsDb ? activeEvalsDb.filter(ev => ev.is_obligatory !== false) : [];
                    
                    if(teamObligatorias.length > 0) {
                        // Con `review_status` y `grades_json` el badge cuenta también
                        // la evaluación de modo jefe que se quedó por debajo del
                        // mínimo y hay que reponer, que es trabajo suyo.
                        const { data: teamResps } = await sb.from('evaluation_responses')
                            .select('evaluation_id, employee_id, submitted_at, review_status, grades_json')
                            .in('employee_id', misSubsIds)
                            .in('evaluation_id', teamObligatorias.map(e=>e.id));
                        
                        teamObligatorias.forEach(ev => {
                                                    let targetEmps = ev.target_employees;
                                                    if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                                                    if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];
                                                    const empsNorm = targetEmps.map(t => String(t).trim());

                                                    let targets = ev.target_positions;
                                                    if (typeof targets === 'string') { try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; } }
                                                    if (!Array.isArray(targets)) targets = ['ALL'];
                                                    const targetsNorm = targets.map(t => String(t).toUpperCase().trim());

                                                    misSubs.forEach(sub => {
                                                        // A un subordinado dado de baja ya no le va a llegar
                                                        // la encuesta; no cuenta como trabajo por calificar.
                                                        if (!window.empleadoActivo(sub)) return;

                                                        let aplicaSub = false;
                                                        if (empsNorm.length > 0 && !empsNorm.includes('ALL')) {
                                                            aplicaSub = empsNorm.includes(String(sub.id).trim());
                                                        } else {
                                                            const subPuesto = (sub.puesto || "").trim().toUpperCase();
                                                            aplicaSub = targets.length === 0 || targets.includes('ALL') || targetsNorm.includes(subPuesto);
                                                        }

                                                        if(aplicaSub) {
                                                            const subResps = teamResps ? teamResps.filter(r => String(r.employee_id) === String(sub.id)) : [];
                                                            
                                                            // Evaluamos usando la lógica global unificada
                                                            if (window.esEvaluacionPendiente) {
                                                                if (window.esEvaluacionPendiente(subResps, ev.id, ev.frequency, ev.created_at, ev, (ev.mode || 'self') === 'boss').mostrar) {
                                                                    countPorCalificar++;
                                                                }
                                                            } else {
                                                                // Fallback de seguridad si no ha cargado 7-pendientes.js
                                                                if (subResps.length === 0) countPorCalificar++;
                                                            }
                                                        }
                                                    });
                                                });
                    }
                }
            }

            const stats = {
                incidentes: countInc,
                difusiones: countDif,
                evaluaciones: countEvals,
                porCalificar: countPorCalificar,
                total: countInc + countDif + countEvals + countPorCalificar
            };

            window.statsPendientes[empId] = stats;
            window.CACHE_DASHBOARD.pendientes[empId] = stats;
            actualizarBadgeUI(empId, stats);
        }));

        window.CACHE_DASHBOARD.timestamp = Date.now();
        actualizarBadgeEquipo();

    } catch (e) {
        console.error("Error calculando pendientes (Local):", e);
    }
};

function actualizarBadgeUI(empId, stats) {
    const badgeEl = document.getElementById(`badge-count-${empId}`);
    if (badgeEl && stats) {
        if (stats.total > 0) {
            badgeEl.innerText = stats.total > 99 ? '99+' : stats.total;
            badgeEl.style.display = 'flex';
        } else { badgeEl.style.display = 'none'; }
    }
}

function actualizarBadgeEquipo() {
    let grandTotal = 0;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    // Sin sesión no hay equipo que contar, y `user.id` reventaría la función.
    if(window.todosLosEmpleadosData && user) {
        const misDirectosIds = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id)).map(e => e.id);
        misDirectosIds.forEach(id => { if(window.statsPendientes[id]) grandTotal += window.statsPendientes[id].total; });
        const teamBadge = document.getElementById('badge-team-total');
        if(teamBadge) {
            if(grandTotal > 0) {
                teamBadge.innerText = grandTotal > 99 ? '99+' : grandTotal;
                teamBadge.style.display = 'flex';
            } else {
                teamBadge.style.display = 'none';
            }
        }
    }
}

const DB_TABLES_ORDER = [ 'employees', 'evaluations', 'evaluation_questions', 'incidents', 'incident_gallery', 'incident_signatures', 'evaluation_responses' ];
window.exportarBaseDatos = async () => {
    if(!confirm("¿Descargar copia completa de la base de datos?")) return;
    const btn = document.getElementById('btn-backup-download');
    if (!btn) return;
    const originalText = window.textoBoton(btn, "⏳..."); btn.disabled = true;
    try {
        const backupData = { timestamp: new Date().toISOString(), version: "1.0", tables: {} };
        for (const tableName of DB_TABLES_ORDER) {
            const { data, error } = await sb.from(tableName).select('*');
            if (error) throw new Error(`Error ${tableName}: ${error.message}`);
            backupData.tables[tableName] = data;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const a = document.createElement('a'); a.href = dataStr;
        a.download = `backup_sistema_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        alert(`Backup completado.`);
    } catch (e) { alert("Error: " + e.message); }
    window.textoBoton(btn, originalText); btn.disabled = false;
};

window.importarBaseDatos = async (inputElement) => {
    const file = inputElement.files[0]; if (!file) return;
    if(!confirm("⚠️ PELIGRO: Esto sobrescribirá datos.\n\n¿Continuar?")) { inputElement.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backupData = JSON.parse(e.target.result);
            if (!backupData.tables) throw new Error("Formato inválido");
            for (const tableName of DB_TABLES_ORDER) {
                const rows = backupData.tables[tableName];
                if (rows && rows.length > 0) {
                    const batchSize = 100;
                    for (let i = 0; i < rows.length; i += batchSize) {
                        const { error } = await sb.from(tableName).upsert(rows.slice(i, i + batchSize));
                        if (error) throw new Error(`Error ${tableName}: ${error.message}`);
                    }
                }
            }
            alert("✅ Restauración completada."); location.reload();
        } catch (err) { alert("❌ Error: " + err.message); }
    };
    reader.readAsText(file); inputElement.value = '';
};

window.iniciarSesionComo = (empId) => {
    if (!window.modoAdminActivo) {
        alert("Acción no permitida.");
        return;
    }

    if (!confirm("⚠️ ¿Simular sesión de este colaborador?")) {
        return;
    }

    const targetUser = window.todosLosEmpleadosData.find(e => String(e.id) === String(empId));
    
    if (targetUser) {
        const userObj = {
            name: targetUser.name,
            id: targetUser.id,
            dept: targetUser.dept,
            area: targetUser.area,
            puesto: targetUser.puesto,
            supId: targetUser.supId
        };
        
        localStorage.setItem("usuarioLogueado", JSON.stringify(userObj));
        window.sostenerModoAdmin(true);
        
        setTimeout(() => {
            location.reload();
        }, 100);
        
    } else {
        alert("Error: No se encontraron los datos del colaborador.");
    }
};

window.abrirStatsEmpleado = async (empId, empName, empPuesto, isBack = false) => {
    const modal = document.getElementById('modal-stats-empleado');
    
    if (!window.statsHistoryStack) window.statsHistoryStack = [];
    const isOpen = modal && modal.style.display === 'flex';
    
    if (!isBack) {
        if (isOpen && window.currentStatsEmpId && window.currentStatsEmpId !== empId) {
            if (window.currentStatsEmpId === 'EQUIPO') {
                window.statsHistoryStack.push({ id: 'EQUIPO', name: 'Equipo', puesto: '' });
            } else {
                const currentEmp = window.todosLosEmpleadosData.find(e => String(e.id) === String(window.currentStatsEmpId));
                if (currentEmp) {
                    window.statsHistoryStack.push({ id: currentEmp.id, name: currentEmp.name, puesto: currentEmp.puesto });
                }
            }
        } else if (!isOpen) {
            window.statsHistoryStack = [];
        }
    }
    
    const title = document.getElementById('stats-emp-name');
    const containerScroll = document.getElementById('radar-scroll-container');
    const noData = document.getElementById('stats-no-data');
    
    const oldRanking = document.getElementById('team-ranking-container');
    if(oldRanking) oldRanking.remove();
    const oldFilter = document.getElementById('team-category-filter-container');
    if(oldFilter) oldFilter.remove();
    const oldAvatarDiv = document.getElementById('modal-avatar-wrapper');
    if(oldAvatarDiv) oldAvatarDiv.remove();
    const oldSubTeam = document.getElementById('modal-sub-team-view');
    if(oldSubTeam) oldSubTeam.remove();
    
    window.currentStatsEmpId = empId;
    
    const btnFantasma = document.getElementById('admin-discreet-login-btn');
    if (btnFantasma) btnFantasma.remove();
    
    const empleadoObj = window.todosLosEmpleadosData.find(e => String(e.id) === String(empId));
    const currentAvatarUrl = (empleadoObj && empleadoObj.avatar) ? empleadoObj.avatar : null;
    
    let avatarImgHtml = `<div style="font-size:2.5rem;">👤</div>`;
    if(currentAvatarUrl) {
        const safeUrl = window.procesarUrlImagen(currentAvatarUrl);
        avatarImgHtml = `<img src="${safeUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    }
    
    const avatarWrapper = document.createElement('div');
    avatarWrapper.id = 'modal-avatar-wrapper';
    
    // NUEVO: Definimos el difuminado si el empleado no está activo
    const isInactive = empleadoObj && empleadoObj.isActive === false;
    const blurStyle = isInactive ? 'opacity: 0.5; filter: grayscale(100%);' : '';
    
    avatarWrapper.style.cssText = `display:flex; justify-content:center; margin-bottom:15px; margin-top:10px; ${blurStyle}`;
    const clickAction = isInactive ? '' : `onclick="if(event.target.tagName !== 'INPUT') document.getElementById('inp-avatar-upload').click()"`;
    const editableAction = empId !== 'EQUIPO' ? clickAction : '';
    const hoverIcon = empId !== 'EQUIPO' ? `<div class="avatar-edit-overlay">📷</div>` : '';
    
    avatarWrapper.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center;">
            <div class="avatar-circle-large" ${editableAction} title="Cambiar foto">
                ${avatarImgHtml}
                ${hoverIcon}
                <input type="file" id="inp-avatar-upload" style="display:none;" accept="image/*" onchange="window.cambiarFotoPerfil(this, '${empId}')">
            </div>
        </div>
    `;
    
    const modalContent = modal.querySelector('div');
    const headerDiv = modalContent.querySelector('div');
    headerDiv.insertAdjacentElement('afterend', avatarWrapper);

    if (window.todosLosEmpleadosData && empId !== 'EQUIPO') {
        const susSubordinados = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(empId));
        if (susSubordinados.length > 0) {
            const subWrapper = document.createElement('div');
            subWrapper.id = 'modal-sub-team-view';
            subWrapper.style.cssText = "margin-bottom: 15px; padding: 0 10px;";
            subWrapper.innerHTML = `<h4 style="margin:0 0 10px 0; color:#475569; font-size:0.8rem; text-transform:uppercase; letter-spacing: 0.5px; text-align: center;">👥 Equipo a su cargo</h4>`;
            
            const subContainer = document.createElement('div');
            subContainer.style.cssText = "display:flex; gap:15px; overflow-x:auto; padding:10px 5px; scroll-behavior:smooth; -webkit-overflow-scrolling:touch; justify-content: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; flex-wrap: wrap;";
            
            susSubordinados.forEach(sub => {
                let subAvatarHtml = '👤';
                let subBgStyle = 'background:#eff6ff; border:2px solid #bfdbfe;';
                if (sub.avatar) {
                    const safeSubUrl = window.procesarUrlImagen(sub.avatar);
                    subAvatarHtml = `<img src="${safeSubUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                    subBgStyle = 'background:white; border:2px solid #bfdbfe; padding:0;';
                }
                
                // NUEVO: Variables de estilo para subordinados inactivos
                let subOpacityStyle = sub.isActive === false ? 'opacity: 0.5; filter: grayscale(100%);' : '';
                let subBadgeInactivo = sub.isActive === false ? `<div style="position:absolute; bottom:-2px; background:#64748b; color:white; font-size:0.45rem; padding:1px 3px; border-radius:3px; font-weight:bold; z-index:10; border: 1px solid white;">INACTIVO</div>` : '';

                const subDiv = document.createElement('div');
                subDiv.className = 'team-member-container';
                subDiv.onclick = () => { window.abrirStatsEmpleado(sub.id, sub.name, sub.puesto); };
                subDiv.innerHTML = `
                        <div style="width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; margin-bottom:3px; box-shadow:0 1px 2px rgba(0,0,0,0.05); position:relative; ${subBgStyle} ${subOpacityStyle}">
                            ${subAvatarHtml}
                            <div id="badge-count-${sub.id}" class="notification-badge" style="display:none; width:16px; height:16px; font-size:0.6rem; right:-2px; top:-2px;">0</div>
                            ${subBadgeInactivo}
                        </div>
                        <div style="font-size:0.65rem; color:#334155; text-align:center; line-height:1.1; max-width:60px; white-space:normal; ${subOpacityStyle}">
                            ${sub.name.split(' ')[0]}
                        </div>
                     `;
                subContainer.appendChild(subDiv);
            });

            subWrapper.appendChild(subContainer);
            avatarWrapper.insertAdjacentElement('afterend', subWrapper);

            setTimeout(() => window.calcularPendientesBatch(susSubordinados.map(s => s.id)), 200);
        }
    }
    
    if(modal) modal.style.display = 'flex';
    
    const empDept = (empleadoObj && empleadoObj.dept) ? empleadoObj.dept : 'General';
    
    let backBtnHtml = '';
    let titleTooltip = "Volver al anterior";
    let onclickAction = "window.volverStatsAnterior()";
    
    if (window.modoAdminActivo && empleadoObj && empleadoObj.supId && empleadoObj.supId !== 'null' && empleadoObj.supId !== '') {
        const jefeData = window.todosLosEmpleadosData.find(e => String(e.id) === String(empleadoObj.supId));
        if (jefeData) {
            onclickAction = `window.abrirStatsEmpleado('${jefeData.id}', '${jefeData.name}', '${jefeData.puesto}')`;
            titleTooltip = `Volver a ${jefeData.name} (Jefe Inmediato)`;
            
            backBtnHtml = `<button onclick="${onclickAction}" style="background:none; border:none; color:#0284c7; font-size:1.1rem; cursor:pointer; padding:0; margin-right:8px; display:flex; align-items:center; outline:none;" title="${titleTooltip}">⬅</button>`;
        }
    }
    
    if (!backBtnHtml && window.statsHistoryStack && window.statsHistoryStack.length > 0) {
        backBtnHtml = `<button onclick="${onclickAction}" style="background:none; border:none; color:#0284c7; font-size:1.1rem; cursor:pointer; padding:0; margin-right:8px; display:flex; align-items:center; outline:none;" title="${titleTooltip}">⬅</button>`;
    }
    
    if(title) {
        const empAreaHtml = (empleadoObj && empleadoObj.area) ? `<span style="margin: 0 5px; color: #cbd5e1;">|</span> ${empleadoObj.area}` : '';
        // NUEVO: Etiqueta roja en el título del modal
        const empInactivoBadge = (empleadoObj && empleadoObj.isActive === false) ? `<span style="background:#ef4444; color:white; font-size:0.6rem; padding:2px 6px; border-radius:10px; font-weight:bold; margin-left:8px; vertical-align:middle;">INACTIVO</span>` : '';
        
        title.innerHTML = `
                    <div style="display: flex; align-items: center; margin-bottom: 4px;">
                        ${backBtnHtml}
                        <div style="font-size: 0.75rem; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 800;">Detalle de Colaborador</div>
                    </div>
                    ${empName} ${empInactivoBadge}
                    <div style="font-size:0.8rem; color:#64748b; font-weight:normal; margin-top:4px;">
                        ${empPuesto || 'Colaborador'} <span style="margin: 0 5px; color: #cbd5e1;">|</span> ${empDept} ${empAreaHtml}
                    </div>
                `;
    }
    
    if (window.radarChartInstances) {
        window.radarChartInstances.forEach(chart => chart.destroy());
        window.radarChartInstances = [];
    }
    if(containerScroll) containerScroll.innerHTML = '';
    
    if(window.CACHE_DASHBOARD && window.CACHE_DASHBOARD.pendientes) {
        delete window.CACHE_DASHBOARD.pendientes[empId];
    }
    
    const summaryBox = document.getElementById('stats-summary-content');
    if(summaryBox) summaryBox.innerHTML = "<div style='text-align:center; color:#64748b; padding: 10px;'>🔄 Actualizando pendientes...</div>";
    
    await window.calcularPendientesBatch([empId]);
    window.actualizarResumenPendientesEnModal(empId);
    
    const oldDiscreetBtn = document.getElementById('admin-discreet-login-btn');
    if (oldDiscreetBtn) oldDiscreetBtn.remove();
    
    if (window.modoAdminActivo && String(empId) !== 'EQUIPO') {
        const discreetBtnWrapper = document.createElement('div');
        discreetBtnWrapper.id = 'admin-discreet-login-btn';
        discreetBtnWrapper.style.cssText = "display: flex; justify-content: center; margin-top: 20px; padding-top: 15px; border-top: 1px dashed #e2e8f0;";
        
        discreetBtnWrapper.innerHTML = `
                <button onclick="window.iniciarSesionComo('${empId}')" 
                        title="Simular sesión como ${empName.split(' ')[0]}"
                        onmouseover="this.style.background='#e2e8f0'; this.style.transform='scale(1.1)'" 
                        onmouseout="this.style.background='#f8fafc'; this.style.transform='scale(1)'" 
                        style="background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; width: 36px; height: 36px; border-radius: 50%; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; outline: none; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    🔑
                </button>
            `;
        if (summaryBox && summaryBox.parentElement) {
            summaryBox.parentElement.appendChild(discreetBtnWrapper);
        }
    }
    
    if(noData) {
        noData.style.display = 'block';
        noData.innerText = "Cargando datos...";
    }
    
    try {
        const { data: activeEvals, error: errEvals } = await sb.from('evaluations').select('id, title, category, target_positions, is_obligatory').eq('active', true);
        if(errEvals) throw errEvals;
        
        const { data: responses, error: errResps } = await sb.from('evaluation_responses')
        .select('evaluation_id, grades_json, submitted_at, review_status')
        .eq('employee_id', empId)
        .in('review_status', ['Revisado', 'Certificada']) // 🔥 CORRECCIÓN CLAVE
        .order('submitted_at', { ascending: false });
        if (errResps) throw errResps;
        
        const uniqueResponsesMap = {};
        if (responses) {
            responses.forEach(r => {
                const key = r.evaluation_id;
                if (!uniqueResponsesMap[key]) {
                    uniqueResponsesMap[key] = r;
                }
            });
        }
        const uniqueResponses = Object.values(uniqueResponsesMap);
        
        const validScores = [];
        const userPuestoNorm = (empPuesto || "SIN PUESTO").toUpperCase().trim();
        
        if (activeEvals) {
            activeEvals.forEach(evalObj => {
                let targets = evalObj.target_positions;
                if (typeof targets === 'string') {
                    try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; }
                }
                if (!Array.isArray(targets)) targets = ['ALL'];
                
                let isApplicable = false;
                if (targets.length === 0 || targets.includes('ALL')) {
                    isApplicable = true;
                } else {
                    const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
                    if (targetsNorm.includes(userPuestoNorm)) isApplicable = true;
                }
                
                if (!isApplicable) return;
                
                const isObligatory = (evalObj.is_obligatory !== false);
                const response = uniqueResponses.find(r => r.evaluation_id === evalObj.id);
                const cat = evalObj.category || "General";
                const title = evalObj.title || "Sin Título";
                
                if (response) {
                    let totalPts = 0, maxPts = 0;
                    const grades = response.grades_json || {};
                    Object.values(grades).forEach(g => {
                        maxPts++;
                       if (g.type === 'list_match' && Array.isArray(g.items)) {
    const aciertos = g.items.filter(i => i.status === 'correct').length;
    const tot = g.totalExpected || Math.max(g.items.length, 1); // 🔥 Calcula en base al total esperado
    totalPts += (aciertos / tot);
} else if (g.type === 'numeric_score') {
                            totalPts += (g.percentage / 100);
                        } else {
                            const status = (typeof g === 'object') ? g.status : g;
                            if (status === 'correct') totalPts++;
                        }
                    });
                    
                    const score = maxPts > 0 ? (totalPts / maxPts) * 100 : 0;
                    validScores.push({ title, category: cat, score });
                    
                } else if (isObligatory) {
                    validScores.push({ title, category: cat, score: 0 });
                }
            });
        }
        
        if (validScores.length === 0) {
            if(noData) { noData.style.display = 'block'; noData.innerText = "No hay evaluaciones aplicables o revisadas."; }
            return;
        }
        
        if(noData) noData.style.display = 'none';
        
        const categoryGroups = {};
        validScores.forEach(item => {
            if (!categoryGroups[item.category]) categoryGroups[item.category] = [];
            categoryGroups[item.category].push(item);
        });
        
        const uniqueCategories = Object.keys(categoryGroups).sort();
        
        let finalLabels = [];
        let finalDataPoints = [];
        let catTitle = "VISIÓN GENERAL";
        
        if (uniqueCategories.length === 1) {
            const catName = uniqueCategories[0];
            catTitle = catName;
            const surveys = categoryGroups[catName];
            
            surveys.forEach(s => {
                const words = s.title.split(' ');
                const lines = [];
                while(words.length > 0) lines.push(words.splice(0, 4).join(' '));
                lines.push(`${Math.round(s.score)}%`);
                
                finalLabels.push(lines);
                finalDataPoints.push(Math.round(s.score));
            });
            
        } else {
            uniqueCategories.forEach(cat => {
                const surveys = categoryGroups[cat];
                const sum = surveys.reduce((a, b) => a + b.score, 0);
                const avg = Math.round(sum / surveys.length);
                
                const words = cat.split(' ');
                const lines = [];
                while(words.length > 0) lines.push(words.splice(0, 4).join(' '));
                lines.push(`${avg}%`);
                
                finalLabels.push(lines);
                finalDataPoints.push(avg);
            });
        }
        
                const generalWrapper = document.createElement('div');
                generalWrapper.style.cssText = `min-width: 260px; max-width: 450px; margin: 0 auto; flex: 1; background: white; border-radius: 12px; padding: 10px; border: 1px solid #f1f5f9; display:flex; flex-direction:column; align-items:center; ${blurStyle}`;
                generalWrapper.innerHTML = `<div style="font-weight:800; color:#64748b; margin-bottom:5px; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">${catTitle}</div>`;
                
                const generalCanvasContainer = document.createElement('div');
                generalCanvasContainer.style.cssText = "position:relative; height:220px; width:100%;";
                const generalCanvasEl = document.createElement('canvas');
                generalCanvasContainer.appendChild(generalCanvasEl);
                generalWrapper.appendChild(generalCanvasContainer);
                containerScroll.appendChild(generalWrapper);

        const generalChart = new Chart(generalCanvasEl.getContext('2d'), {
                            type: 'radar',
                            data: {
                                labels: finalLabels,
                                datasets: [{
                                    data: finalDataPoints,
                                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                    borderColor: '#22c55e',
                                    pointBackgroundColor: '#166534',
                                    borderWidth: 1.5,
                                    pointRadius: 0,
                                    pointHoverRadius: 0
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                layout: { padding: 25 },
                                scales: {
                                    r: {
                                        angleLines: { display: false },
                                        grid: { color: '#f1f5f9' },
                                        pointLabels: { font: { size: 9, weight: 'bold' }, color: '#334155', display: true, padding: 8 },
                                        suggestedMin: 0, suggestedMax: 100, ticks: { display: false }
                                    }
                                },
                                plugins: { legend: { display: false }, tooltip: { enabled: false } }
                            },
                            plugins: [{
                                id: 'centerTextPlugin',
                                afterDatasetsDraw(chart) {
                                    const { ctx } = chart;
                                    const data = chart.data.datasets[0].data;
                                    const sum = data.reduce((a, b) => a + b, 0);
                                    const avg = data.length > 0 ? Math.round(sum / data.length) : 0;
                                    
                                    const x = chart.scales.r.xCenter;
                                    const y = chart.scales.r.yCenter;
                                    
                                    ctx.save();
                                    ctx.font = "bold 0.9rem -apple-system, BlinkMacSystemFont, sans-serif";
                                    ctx.fillStyle = "#166534";
                                    ctx.textAlign = "center";
                                    ctx.textBaseline = "middle";
                                    ctx.lineWidth = 2.5;
                                    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                                    ctx.strokeText(avg + "%", x, y);
                                    ctx.fillText(avg + "%", x, y);
                                    ctx.restore();
                                }
                            }]
                        });
                window.radarChartInstances.push(generalChart);

                if (uniqueCategories.length > 1) {
                    uniqueCategories.forEach(cat => {
                        const surveys = categoryGroups[cat];
                        const labelsIndiv = [];
                        const dataIndiv = [];

                        surveys.forEach(s => {
                            const words = s.title.split(' ');
                            const lines = [];
                            while(words.length > 0) lines.push(words.splice(0, 3).join(' '));
                            lines.push(`${Math.round(s.score)}%`);
                            
                            labelsIndiv.push(lines);
                            dataIndiv.push(Math.round(s.score));
                        });

                        const chartWrapper = document.createElement('div');
                        chartWrapper.style.cssText = "min-width: 260px; max-width: 450px; flex: 1; background: white; border-radius: 12px; padding: 10px; border: 1px solid #f1f5f9; display:flex; flex-direction:column; align-items:center;";
                        chartWrapper.innerHTML = `<div style="font-weight:800; color:#64748b; margin-bottom:5px; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">${cat}</div>`;
                        
                        const canvasContainer = document.createElement('div');
                        canvasContainer.style.cssText = "position:relative; height:220px; width:100%;";
                        const canvasEl = document.createElement('canvas');
                        canvasContainer.appendChild(canvasEl);
                        chartWrapper.appendChild(canvasContainer);
                        containerScroll.appendChild(chartWrapper);

                        const newChart = new Chart(canvasEl.getContext('2d'), {
                                                    type: 'radar',
                                                    data: {
                                                        labels: labelsIndiv,
                                                        datasets: [{
                                                            data: dataIndiv,
                                                            backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                                            borderColor: '#22c55e',
                                                            pointBackgroundColor: '#166534',
                                                            borderWidth: 1.5,
                                                            pointRadius: 0,
                                                            pointHoverRadius: 0
                                                        }]
                                                    },
                                                    options: {
                                                        responsive: true,
                                                        maintainAspectRatio: false,
                                                        layout: { padding: 25 },
                                                        scales: {
                                                            r: {
                                                                angleLines: { display: false },
                                                                grid: { color: '#f1f5f9' },
                                                                pointLabels: { font: { size: 9, weight: 'bold' }, color: '#334155', display: true, padding: 8 },
                                                                suggestedMin: 0, suggestedMax: 100, ticks: { display: false }
                                                            }
                                                        },
                                                        plugins: { legend: { display: false }, tooltip: { enabled: false } }
                                                    },
                                                    plugins: [{
                                                        id: 'centerTextPlugin',
                                                        afterDatasetsDraw(chart) {
                                                            const { ctx } = chart;
                                                            const data = chart.data.datasets[0].data;
                                                            const sum = data.reduce((a, b) => a + b, 0);
                                                            const avg = data.length > 0 ? Math.round(sum / data.length) : 0;
                                                            
                                                            const x = chart.scales.r.xCenter;
                                                            const y = chart.scales.r.yCenter;
                                                            
                                                            ctx.save();
                                                            ctx.font = "bold 0.9rem -apple-system, BlinkMacSystemFont, sans-serif";
                                                            ctx.fillStyle = "#166534";
                                                            ctx.textAlign = "center";
                                                            ctx.textBaseline = "middle";
                                                            ctx.lineWidth = 2.5;
                                                            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                                                            ctx.strokeText(avg + "%", x, y);
                                                            ctx.fillText(avg + "%", x, y);
                                                            ctx.restore();
                                                        }
                                                    }]
                                                });
                                                window.radarChartInstances.push(newChart);
                    });
                }
        
    } catch (e) {
        console.error(e);
        if(noData) { noData.style.display = 'block'; noData.innerText = "Error cargando gráficas."; }
    }
};
    
window.abrirStatsEquipo = async (isBack = false) => {
    const oldSubTeam = document.getElementById('modal-sub-team-view');
    if(oldSubTeam) oldSubTeam.remove();
    const oldFilter = document.getElementById('team-category-filter-container');
    if(oldFilter) oldFilter.remove();

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const misDirectos = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
    if (misDirectos.length === 0) { alert("No tienes equipo asignado aún."); return; }
    
    const modal = document.getElementById('modal-stats-empleado');
    const title = document.getElementById('stats-emp-name');
    
    if (!window.statsHistoryStack) window.statsHistoryStack = [];
    const isOpen = modal && modal.style.display === 'flex';
    
    if (!isBack) {
        if (isOpen && window.currentStatsEmpId && window.currentStatsEmpId !== 'EQUIPO') {
            const currentEmp = window.todosLosEmpleadosData.find(e => String(e.id) === String(window.currentStatsEmpId));
            if (currentEmp) {
                window.statsHistoryStack.push({ id: currentEmp.id, name: currentEmp.name, puesto: currentEmp.puesto });
            }
        } else if (!isOpen) {
            window.statsHistoryStack = [];
        }
    }

    window.currentStatsEmpId = 'EQUIPO';
    
    const summaryBox = document.getElementById('stats-summary-content');
    const containerScroll = document.getElementById('radar-scroll-container');
    const noData = document.getElementById('stats-no-data');
    const oldAvatarDiv = document.getElementById('modal-avatar-wrapper');
    if(oldAvatarDiv) oldAvatarDiv.remove();
    
    modal.style.display = 'flex';
    
    let backBtnHtml = '';
        if (window.statsHistoryStack && window.statsHistoryStack.length > 0) {
            backBtnHtml = `<button onclick="window.volverStatsAnterior()" style="background:none; border:none; color:#0f172a; font-size:1.1rem; cursor:pointer; padding:0; margin-right:8px; display:flex; align-items:center; outline:none;" title="Volver al anterior">⬅</button>`;
        }
        
    title.innerHTML = `
                <div style="display: flex; align-items: center;">
                    ${backBtnHtml}
                    Reporte de Equipo 
                </div>
                <div style="font-size:0.8rem; color:#64748b; font-weight:normal; margin-top:4px;">${user.name} | ${misDirectos.length} colaboradores</div>
            `;

            const modalContent = modal.querySelector('div');
            const headerDiv = modalContent.querySelector('div');
            
            const managerObj = window.todosLosEmpleadosData.find(e => String(e.id) === String(user.id));
            const currentAvatarUrl = (managerObj && managerObj.avatar) ? managerObj.avatar : null;

            let avatarImgHtml = `<div style="font-size:2.5rem;">👤</div>`;
            if(currentAvatarUrl) {
                const safeUrl = window.procesarUrlImagen(currentAvatarUrl);
                avatarImgHtml = `<img src="${safeUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
            }
            
            const avatarWrapper = document.createElement('div');
            avatarWrapper.id = 'modal-avatar-wrapper';
            avatarWrapper.style.cssText = "display:flex; justify-content:center; margin-bottom:15px; margin-top:10px;";
            
           const clickAction = `onclick="if(event.target.tagName !== 'INPUT') document.getElementById('inp-avatar-upload').click()"`;
            
            // Obtener los pendientes del Jefe (usuario actual)
            const myStats = window.statsPendientes[user.id];
            const myDisplayBadge = (myStats && myStats.total > 0) ? 'flex' : 'none';
            const myTextBadge = (myStats && myStats.total > 0) ? (myStats.total > 99 ? '99+' : myStats.total) : '0';

            avatarWrapper.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center;">
                    <div style="position: relative; display: inline-block;">

                        <div class="avatar-circle-large" ${clickAction} title="Cambiar foto">
                            ${avatarImgHtml}
                            <div class="avatar-edit-overlay">📷</div>
                            <input type="file" id="inp-avatar-upload" style="display:none;" accept="image/*" onchange="window.cambiarFotoPerfil(this, '${user.id}')">
                        </div>

                        <div id="badge-count-${user.id}" class="notification-badge" style="display:${myDisplayBadge}; position:absolute; top:-5px; right:-5px; width:24px; height:24px; font-size:0.8rem; z-index:10; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                            ${myTextBadge}
                        </div>

                    </div>
                </div>
            `;
            
            headerDiv.insertAdjacentElement('afterend', avatarWrapper);

            const subWrapper = document.createElement('div');
            subWrapper.id = 'modal-sub-team-view';
            subWrapper.style.cssText = "margin-bottom: 15px; padding: 0 10px; margin-top: 15px;";
            subWrapper.innerHTML = `<h4 style="margin:0 0 10px 0; color:#475569; font-size:0.8rem; text-transform:uppercase; letter-spacing: 0.5px; text-align: center;">👥 Miembros del Equipo</h4>`;
            
            const subContainer = document.createElement('div');
            subContainer.style.cssText = "display:flex; gap:15px; overflow-x:auto; padding:10px 5px; scroll-behavior:smooth; -webkit-overflow-scrolling:touch; justify-content: center; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; flex-wrap: wrap;";
            
            misDirectos.forEach(sub => {
                 let subAvatarHtml = '👤';
                 let subBgStyle = 'background:#eff6ff; border:2px solid #bfdbfe;';
                 if (sub.avatar) {
                     const safeSubUrl = window.procesarUrlImagen(sub.avatar);
                     subAvatarHtml = `<img src="${safeSubUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                     subBgStyle = 'background:white; border:2px solid #bfdbfe; padding:0;';
                 }
                 
                 // NUEVO: Variables de estilo para subordinados inactivos
                 let subOpacityStyle = sub.isActive === false ? 'opacity: 0.5; filter: grayscale(100%);' : '';
                 let subBadgeInactivo = sub.isActive === false ? `<div style="position:absolute; bottom:-2px; background:#64748b; color:white; font-size:0.45rem; padding:1px 3px; border-radius:3px; font-weight:bold; z-index:10; border: 1px solid white;">INACTIVO</div>` : '';

                 const subDiv = document.createElement('div');
                 subDiv.className = 'team-member-container';
                 subDiv.onclick = () => { window.abrirStatsEmpleado(sub.id, sub.name, sub.puesto); };
                 subDiv.innerHTML = `
                    <div style="width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; margin-bottom:3px; box-shadow:0 1px 2px rgba(0,0,0,0.05); position:relative; ${subBgStyle} ${subOpacityStyle}">
                        ${subAvatarHtml}
                        <div id="badge-count-${sub.id}" class="notification-badge" style="display:none; width:16px; height:16px; font-size:0.6rem; right:-2px; top:-2px;">0</div>
                        ${subBadgeInactivo}
                    </div>
                    <div style="font-size:0.65rem; color:#334155; text-align:center; line-height:1.2; max-width:60px; white-space:normal; ${subOpacityStyle}">
                        ${sub.name.split(' ')[0]}
                    </div>
                 `;
                 subContainer.appendChild(subDiv);
                 
                 const stats = window.statsPendientes[sub.id];
                 if(stats && stats.total > 0) {
                     const badge = subDiv.querySelector('.notification-badge');
                     if(badge) {
                         badge.innerText = stats.total > 99 ? '99+' : stats.total;
                         badge.style.display = 'flex';
                     }
                 }
            });
            
            subWrapper.appendChild(subContainer);
            avatarWrapper.insertAdjacentElement('afterend', subWrapper);

        if (window.radarChartInstances) { window.radarChartInstances.forEach(c => c.destroy()); window.radarChartInstances = []; }
        if(containerScroll) containerScroll.innerHTML = '';
    
    noData.style.display = 'block';
    noData.innerText = "Calculando promedios y ranking...";
    
    let totalInc = 0, totalDif = 0, totalEval = 0, totalCalif = 0;
    misDirectos.forEach(emp => {
        const s = window.statsPendientes[emp.id];
        if (s) { totalInc += s.incidentes || 0; totalDif += s.difusiones || 0; totalEval += s.evaluaciones || 0; totalCalif += s.porCalificar || 0; }
    });
    
    const cardStyle = "flex: 1; min-width: 100px; padding: 12px; border-radius: 12px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03); border: 1px solid transparent;";
    let cardsHtml = '';
    if (totalInc > 0) cardsHtml += `<div style="${cardStyle} background: #fff1f2; border-color: #fecdd3;"><div style="font-size: 1.5rem; color: #e11d48; font-weight: 800; line-height: 1;">${totalInc}</div><div style="font-size: 0.75rem; color: #9f1239; font-weight: 600; margin-top: 4px;">Incidentes</div></div>`;
    if (totalDif > 0) cardsHtml += `<div style="${cardStyle} background: #eff6ff; border-color: #bfdbfe;"><div style="font-size: 1.5rem; color: #2563eb; font-weight: 800; line-height: 1;">${totalDif}</div><div style="font-size: 0.75rem; color: #1e40af; font-weight: 600; margin-top: 4px;">Difusiones</div></div>`;
    if (totalEval > 0) cardsHtml += `<div style="${cardStyle} background: #f5f3ff; border-color: #ddd6fe;"><div style="font-size: 1.5rem; color: #7c3aed; font-weight: 800; line-height: 1;">${totalEval}</div><div style="font-size: 0.75rem; color: #5b21b6; font-weight: 600; margin-top: 4px;">Encuestas</div></div>`;
    if (totalCalif > 0) cardsHtml += `<div style="${cardStyle} background: #fff7ed; border-color: #fed7aa;"><div style="font-size: 1.5rem; color: #ea580c; font-weight: 800; line-height: 1;">${totalCalif}</div><div style="font-size: 0.75rem; color: #9a3412; font-weight: 600; margin-top: 4px;">Por Calificar</div></div>`;
    
    if (cardsHtml === '') summaryBox.innerHTML = `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center;"><div style="font-size: 2rem; margin-bottom: 5px;">🎉</div><div style="color: #166534; font-weight: bold; font-size: 1rem;">¡Todo al día!</div><div style="color: #15803d; font-size: 0.85rem;">El equipo no tiene pendientes.</div></div>`;
    else summaryBox.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 10px;">${cardsHtml}</div>`;

    try {
        // 🔥 NUEVO: Unimos al equipo directo con el jefe actual en un solo arreglo
        const equipoYJefe = [...misDirectos];
        if (managerObj) equipoYJefe.push(managerObj);

        // Usamos el arreglo combinado para buscar encuestas y graficar
        const ids = equipoYJefe.map(e => e.id);
        
        const { data: activeEvals } = await sb.from('evaluations').select('id, title, category, target_positions, is_obligatory').eq('active', true);
        if (!activeEvals) throw new Error("No hay evaluaciones");
        
        const { data: responses } = await sb.from('evaluation_responses')
            .select('evaluation_id, employee_id, grades_json, review_status, submitted_at')
            .in('employee_id', ids)
            .in('review_status', ['Revisado', 'Certificada']) // 🔥 CORRECCIÓN CLAVE
            .order('submitted_at', { ascending: false });

                const uniqueCategories = [...new Set(activeEvals.map(ev => ev.category || 'General'))].sort();
                const filterContainer = document.createElement('div');
                filterContainer.id = 'team-category-filter-container';
                
                filterContainer.style.cssText = "margin: 0 0 20px 0; width: 100%; display: flex; justify-content: center; text-align: center;";
                
                const renderizarSelector = (categoriaActiva) => {
                    const categorias = ['TODAS', ...uniqueCategories];
                    const optionsHtml = categorias.map(cat => {
                        const texto = cat === 'TODAS' ? 'General' : cat;
                        return `<option value="${cat}" ${cat === categoriaActiva ? 'selected' : ''}>${texto}</option>`;
                    }).join('');
                    
                    filterContainer.innerHTML = `
                        <div style="position:relative; display:inline-flex; justify-content:center; align-items:center; width: fit-content;">
                            <select id="select-team-category" style="font-size:1.2rem; font-weight:700; color:#334155; border:none; background:transparent; outline:none; cursor:pointer; appearance:none; padding-right:20px; margin:0; font-family:inherit; text-align:center; text-align-last:center;">
                                ${optionsHtml}
                            </select>
                            <span style="position:absolute; right:0; color:#334155; font-size:0.75rem; pointer-events:none;">▼</span>
                        </div>
                    `;
                    
                    const selectEl = filterContainer.querySelector('#select-team-category');
                    selectEl.addEventListener('change', (e) => {
                        const nuevaCat = e.target.value;
                        renderizarSelector(nuevaCat);
                        // 🔥 Pasamos equipoYJefe en lugar de misDirectos
                        renderizarGraficosEquipo(equipoYJefe, activeEvals, responses, nuevaCat);
                    });
                };
                
                containerScroll.insertAdjacentElement('beforebegin', filterContainer);
                
                renderizarSelector('TODAS');
                // 🔥 Pasamos equipoYJefe en lugar de misDirectos
                renderizarGraficosEquipo(equipoYJefe, activeEvals, responses, 'TODAS');
                noData.style.display = 'none';

    } catch (e) {
        console.error(e);
        noData.style.display = 'block';
        noData.innerText = "No hay suficientes datos para el promedio.";
    }
};

window.renderizarGraficosEquipo = (misDirectos, activeEvals, responses, categoriaFiltro) => {
    const containerScroll = document.getElementById('radar-scroll-container');
    const oldRanking = document.getElementById('team-ranking-container');
    
    if(oldRanking) oldRanking.remove();
    if (window.radarChartInstances) { window.radarChartInstances.forEach(c => c.destroy()); window.radarChartInstances = []; }
    containerScroll.innerHTML = '';
    
    let evalsFiltradas = activeEvals;
    if (categoriaFiltro !== 'TODAS') {
        evalsFiltradas = activeEvals.filter(ev => (ev.category || 'General') === categoriaFiltro);
    }
    const idsEvalsFiltradas = evalsFiltradas.map(e => e.id);

    const verificaTarget = (evalObj, puestoEmp) => {
        let targets = ['ALL'];
        if (evalObj.target_positions) {
            try { targets = typeof evalObj.target_positions === 'string' ? JSON.parse(evalObj.target_positions) : evalObj.target_positions; } catch(err){}
        }
        if (!Array.isArray(targets)) targets = ['ALL'];
        const p = (puestoEmp || '').trim().toUpperCase();
        return targets.length === 0 || targets.includes('ALL') || targets.map(t => String(t).toUpperCase().trim()).includes(p);
    };

    const uniqueResponsesMap = {};
    if (responses) {
        responses.forEach(r => {
            if (!idsEvalsFiltradas.includes(r.evaluation_id)) return;
            const key = `${r.employee_id}_${r.evaluation_id}`;
            const existing = uniqueResponsesMap[key];
            if (!existing || new Date(r.submitted_at) > new Date(existing.submitted_at)) {
                uniqueResponsesMap[key] = r;
            }
        });
    }
    const uniqueResponses = Object.values(uniqueResponsesMap);

    const promediosRadar = {};
    evalsFiltradas.forEach(ev => promediosRadar[ev.title] = { suma: 0, count: 0 });
    
    const puntajesEmpleados = {};
    misDirectos.forEach(e => puntajesEmpleados[e.id] = {
        name: e.name,
        puesto: (e.puesto || '').trim().toUpperCase(),
        totalScore: 0,
        countSurveys: 0,
        respuestasSet: new Set(),
        certificadasSet: new Set()
    });
    
    uniqueResponses.forEach(r => {
        const evalObj = evalsFiltradas.find(e => e.id === r.evaluation_id);
        if (!evalObj) return;

        const empData = puntajesEmpleados[r.employee_id];
        if (!empData) return;

        if (!verificaTarget(evalObj, empData.puesto)) return;

        let totalPts = 0, maxPts = 0;
        Object.values(r.grades_json || {}).forEach(g => {
            maxPts++;
            if (g.type === 'list_match' && Array.isArray(g.items)) {
    const aciertos = g.items.filter(i => i.status === 'correct').length;
    const tot = g.totalExpected || Math.max(g.items.length, 1); // 🔥 Calcula en base al total esperado
    totalPts += (aciertos / tot);
} else if (g.type === 'numeric_score') {
                    totalPts += (g.percentage / 100);
            } else {
                if ((typeof g === 'object' ? g.status : g) === 'correct') totalPts++;
            }
        });
        const score = maxPts > 0 ? (totalPts / maxPts) * 100 : 0;
        
        if (promediosRadar[evalObj.title]) {
            promediosRadar[evalObj.title].suma += score;
            promediosRadar[evalObj.title].count += 1;
        }
        empData.totalScore += score;
        empData.countSurveys += 1;
        empData.respuestasSet.add(r.evaluation_id);
        
        if (r.review_status === 'Certificada') {
            empData.certificadasSet.add(r.evaluation_id);
        }
    });

    const listaRanking = Object.values(puntajesEmpleados).map(e => {
        let expectedCount = 0;
        let obligatoryAssigned = 0;
        let obligatoryCompleted = 0;

        evalsFiltradas.forEach(ev => {
            const isTarget = verificaTarget(ev, e.puesto);

            if (isTarget) {
                const isObligatory = ev.is_obligatory !== false;
                const hasAnswered = e.respuestasSet.has(ev.id);

                if (isObligatory) {
                    expectedCount++;
                    obligatoryAssigned++;
                    if (hasAnswered) obligatoryCompleted++;
                } else if (hasAnswered) {
                    expectedCount++;
                }
            }
        });

        const incompleto = obligatoryCompleted < obligatoryAssigned;
        const divisor = expectedCount > 0 ? expectedCount : 1;
        
        const promedioReal = Math.round(e.totalScore / divisor);
        const isFullyCertified = (expectedCount > 0 && e.certificadasSet.size === expectedCount);
        
        return {
            name: e.name,
            promedio: promedioReal,
            participacion: e.countSurveys,
            totalEsperado: expectedCount,
            incompleto: incompleto,
            isFullyCertified: isFullyCertified
        };
    }).sort((a, b) => {
        return b.promedio - a.promedio;
    });
    
    let rankingHtml = `
            <div id="team-ranking-container" style="margin-bottom:20px;">
                <h4 style="margin:0 0 10px 0; color:#334155; font-size:0.9rem; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">
                    👥 Tabla de Posiciones
                </h4>
                <div style="display:flex; flex-direction:column; gap:8px;">
        `;
    
    listaRanking.forEach((item, idx) => {
        let medal = `<span style="width:20px; display:inline-block; text-align:center; color:#94a3b8; font-weight:bold;">${idx + 1}</span>`;
        if (idx === 0) medal = '🥇'; if (idx === 1) medal = '🥈'; if (idx === 2) medal = '🥉';
        
        let colorScore = '#10b981';
        if (item.promedio < 90) colorScore = '#f59e0b';
        if (item.promedio < 70) colorScore = '#ef4444';
        
        let scoreDisplay = `<div style="font-weight:bold; color:${colorScore};">${item.promedio}%</div>`;
        let warningHtml = '';

        if (item.incompleto) {
            warningHtml = `<div style="font-size:0.65rem; color:#ef4444; font-weight:bold; margin-top:2px;">⚠️ Faltan obligatorias</div>`;
        }

        if (item.totalEsperado > 0 && item.participacion === 0) {
            colorScore = '#ef4444';
            scoreDisplay = `<div style="font-weight:bold; color:${colorScore};">0%</div>`;
        } else if(item.totalEsperado === 0) {
            colorScore = '#94a3b8';
            scoreDisplay = `<div style="font-weight:bold; color:${colorScore};">-</div>`;
        }
        
        let nameDisplay = `<div style="font-size:0.9rem; color:#1e293b; font-weight:500;">${item.name}</div>`;
        if (item.isFullyCertified) {
            nameDisplay = `<div style="font-size:0.9rem; color:#1d4ed8; font-weight:bold; display:flex; align-items:center; gap:4px;">${item.name} <span title="¡Todas sus encuestas evaluadas están certificadas!" style="font-size:0.85rem; background:#eff6ff; padding:2px 6px; border-radius:12px; border:1px solid #bfdbfe;">⭐ Certificado</span></div>`;
        }

        rankingHtml += `
            <div style="display:flex; align-items:center; justify-content:space-between; background:white; padding:8px 12px; border-radius:8px; border:1px solid ${item.incompleto ? '#fee2e2' : (item.isFullyCertified ? '#bfdbfe' : '#f1f5f9')};">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="font-size:1.1rem;">${medal}</div>
                    <div>
                        ${nameDisplay}
                        ${warningHtml}
                    </div>
                </div>
                <div style="text-align:right;">
                    ${scoreDisplay}
                    <div style="font-size:0.7rem; color:#64748b;">${item.participacion} / ${item.totalEsperado} eval.</div>
                </div>
            </div>
        `;
    });
    rankingHtml += `</div></div>`;
        
    containerScroll.insertAdjacentHTML('afterend', rankingHtml);

    const labels = Object.keys(promediosRadar);
    if (labels.length === 0) {
        containerScroll.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px;">No hay evaluaciones en esta categoría.</div>';
        return;
    }

    const dataPoints = labels.map(k => {
        const item = promediosRadar[k];
        return item.count > 0 ? Math.round(item.suma / item.count) : 0;
    });

    const formattedLabels = labels.map((label, idx) => {
        const words = label.split(' ');
        const lines = [];
        while(words.length > 0) lines.push(words.splice(0, 3).join(' '));
        lines.push(`${dataPoints[idx]}%`);
        return lines;
    });

    const chartWrapper = document.createElement('div');
    chartWrapper.style.cssText = "min-width: 100%; flex: 1; background: white; border-radius: 12px; padding: 10px; display:flex; flex-direction:column; align-items:center;";
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = "position:relative; height:250px; width:100%;";
    const canvasEl = document.createElement('canvas');
    canvasContainer.appendChild(canvasEl);
    chartWrapper.appendChild(canvasContainer);
    containerScroll.appendChild(chartWrapper);

    const newChart = new Chart(canvasEl.getContext('2d'), {
        type: 'radar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: `Promedio ${categoriaFiltro === 'TODAS' ? 'Global' : categoriaFiltro} (%)`,
                data: dataPoints,
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                borderColor: '#22c55e',
                pointBackgroundColor: '#166534',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { display: false },
                    grid: { color: '#f1f5f9' },
                    pointLabels: {
                        font: { size: 9, weight: 'bold' },
                        color: '#334155',
                        display: true
                    },
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: { display: false }
                }
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        },
        plugins: [{
            id: 'centerTextPlugin',
            afterDatasetsDraw(chart) {
                const { ctx, width, height } = chart;
                const data = chart.data.datasets[0].data;
                const sum = data.reduce((a, b) => a + b, 0);
                const avg = data.length > 0 ? Math.round(sum / data.length) : 0;
                
                ctx.save();
                ctx.font = "bolder 1.5rem -apple-system, BlinkMacSystemFont, sans-serif";
                ctx.fillStyle = "#166534";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.lineWidth = 4;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                ctx.strokeText(avg + "%", width / 2, height / 2);
                ctx.fillText(avg + "%", width / 2, height / 2);
                ctx.restore();
            }
        }]
    });
    window.radarChartInstances.push(newChart);
};

window.abrirModalReclamo = () => {
    document.getElementById('inp-buscar-reclamo').value = '';
    document.getElementById('lista-resultados-reclamo').innerHTML = '';
    document.getElementById('lista-resultados-reclamo').style.display = 'none';
    document.getElementById('modal-reclamar-empleado').style.display = 'flex';
    document.getElementById('inp-buscar-reclamo').focus();
};

window.buscarEmpleadoReclamo = (texto) => {
    const lista = document.getElementById('lista-resultados-reclamo');
    lista.innerHTML = '';
    if (!texto || texto.length < 2) { lista.style.display = 'none'; return; }
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const busqueda = normalize(texto);
    const resultados = window.todosLosEmpleadosData.filter(e => {
        return normalize(e.name).includes(busqueda) && String(e.id) !== String(user.id);
    });
    if (resultados.length === 0) {
        lista.innerHTML = '<div style="padding:15px; color:#94a3b8; text-align:center;">No se encontraron coincidencias.</div>';
        lista.style.display = 'block';
        return;
    }
    resultados.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'resultado-reclamo-item';
        const supActual = emp.sup || "Sin Supervisor";
        const estiloSup = emp.supId ? 'color:#ef4444;' : 'color:#166534;';
        item.innerHTML = `
            <div style="font-weight:bold; color:#1e293b;">${emp.name}</div>
            <div style="font-size:0.8rem; color:#64748b; display:flex; justify-content:space-between;">
                <span>${emp.puesto || 'Colaborador'}</span>
                <span style="${estiloSup} font-size:0.75rem;">Sup. Actual: ${supActual}</span>
            </div>
        `;
        item.onclick = () => window.ejecutarReclamo(emp);
        lista.appendChild(item);
    });
    lista.style.display = 'block';
};

window.ejecutarReclamo = async (empleadoObjetivo) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    let mensaje = `¿Estás seguro de que deseas agregar a ${empleadoObjetivo.name} a tu equipo?`;
    if (empleadoObjetivo.supId) { mensaje += `\n\n⚠️ AVISO: Actualmente está asignado a ${empleadoObjetivo.sup}. Al aceptar, cambiarás su supervisor a ti.`; }
    if (!confirm(mensaje)) return;
    try {
        const { error } = await sb.from('employees').update({ supervisor_id: user.id }).eq('employee_id', empleadoObjetivo.id);
        if (error) throw error;
        alert(`✅ Éxito: ${empleadoObjetivo.name} ahora es parte de tu equipo.`);
        document.getElementById('modal-reclamar-empleado').style.display = 'none';
        document.getElementById('quick-team-view').innerHTML = '<div class="spinner"></div>';
        await window.cargarDatosEmpleados();
    } catch (e) { console.error(e); alert("Error al asignar empleado: " + e.message); }
};

window.comprimirImagen = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxSize = 800;
                if (width > maxSize || height > maxSize) {
                    if (width > height) { height *= maxSize / width; width = maxSize; } else { width *= maxSize / height; height = maxSize; }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if(blob) resolve(blob); else reject(new Error("Error al procesar la imagen (Canvas vacío)."));
                }, 'image/jpeg', 0.7);
            };
            img.onerror = () => reject(new Error("La imagen está dañada o el formato no es compatible."));
        };
        reader.onerror = () => reject(new Error("Error de lectura del archivo."));
    });
};

window.cambiarFotoPerfil = async (input, empId) => {
    const file = input.files[0];
    if (!file) return;
    if (file.size === 0) { alert("El archivo seleccionado está vacío."); return; }
    let blobFinal = file;
    try { blobFinal = await window.comprimirImagen(file); } catch (compressionError) { console.warn("No se pudo comprimir la imagen, se usará el archivo original.", compressionError); }
    const avatarCircle = input.closest('.avatar-circle-large');
    let loader = null;
    if (avatarCircle) {
        loader = document.createElement('div');
        loader.className = 'avatar-loading-overlay';
        loader.innerHTML = '<div class="spinner"></div>';
        loader.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.8); display:flex; align-items:center; justify-content:center; border-radius:50%; z-index:10;";
        avatarCircle.appendChild(loader);
    }
    try {
        const fileName = `avatar_${empId}_${Date.now()}.jpg`;
        const filePath = `${fileName}`;
        const { error: uploadError } = await sb.storage.from('avatars').upload(filePath, blobFinal, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = sb.storage.from('avatars').getPublicUrl(filePath);
        const publicUrl = urlData.publicUrl;
        const { error: dbError } = await sb.from('employees').update({ avatar_url: publicUrl }).eq('employee_id', empId);
        if (dbError) throw dbError;
        const empIndex = window.todosLosEmpleadosData.findIndex(e => String(e.id) === String(empId));
        if (empIndex !== -1) { window.todosLosEmpleadosData[empIndex].avatar = publicUrl; }
        
        window.renderizarVistaRapidaEquipo(true);
        const avatarWrapper = document.getElementById('modal-avatar-wrapper');
        if(avatarWrapper) {
            const clickAction = `onclick="if(event.target.tagName !== 'INPUT') document.getElementById('inp-avatar-upload').click()"`;
            avatarWrapper.innerHTML = `
                <div class="avatar-circle-large" ${clickAction} title="Cambiar foto">
                    <img src="${publicUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                    <div class="avatar-edit-overlay">📷</div>
                    <input type="file" id="inp-avatar-upload" style="display:none;" accept="image/*" onchange="window.cambiarFotoPerfil(this, '${empId}')">
                </div>
            `;
        }
        const userLog = JSON.parse(localStorage.getItem("usuarioLogueado"));
        if(userLog && String(userLog.id) === String(empId)) {
             const headerIconDiv = document.getElementById('header-user-icon');
             if(headerIconDiv) {
                 headerIconDiv.innerHTML = `
                    <img src="${publicUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                    <div id="badge-count-${userLog.id}" class="notification-badge" style="display:none;">0</div>
                 `;
                 headerIconDiv.style.background = 'white';
                 headerIconDiv.style.padding = '0';
                 setTimeout(() => window.calcularPendientesBatch([userLog.id]), 500);
             }
        }
        alert("✅ Foto actualizada.");
    } catch (e) {
        console.error("Error subida foto:", e);
        if (loader) loader.remove();
        const msg = e.message ? e.message : "Error desconocido al subir";
                alert("Error: " + msg);
            }
        };

        window.volverStatsAnterior = () => {
            if (!window.statsHistoryStack || window.statsHistoryStack.length === 0) return;
            
            const prev = window.statsHistoryStack.pop();
            
            if (prev.id === 'EQUIPO') {
                if (window.abrirStatsEquipo) window.abrirStatsEquipo(true);
            } else {
                window.abrirStatsEmpleado(prev.id, prev.name, prev.puesto, true);
            }
        };

        console.log("✅ Core Dashboard Loaded (2b - FIXED: Bloque de Header Restaurado, Area Added)");

document.addEventListener('DOMContentLoaded', () => {
    const modales = document.querySelectorAll('[id^="modal-"]');
    
    const observer = new MutationObserver(() => {
        let algunModalAbierto = false;
        
        modales.forEach(modal => {
            if (window.getComputedStyle(modal).display !== 'none') {
                algunModalAbierto = true;
            }
        });
        
        document.body.style.overflow = algunModalAbierto ? 'hidden' : '';
    });

    modales.forEach(modal => {
        observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
    });
});
