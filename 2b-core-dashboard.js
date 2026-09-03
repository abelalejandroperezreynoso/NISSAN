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
// INSIGNIAS POR CLASIFICACIÓN
// ==========================================
// Se gana una insignia por clasificación cuando **todas** las encuestas de esa
// clasificación que le tocan a alguien están calificadas al mínimo o por
// encima. No es el promedio: un 100 y un 60 promedian 80 y ahí falta una, así
// que esa clasificación no da insignia. Es la misma regla del criterio «80%
// Líderes» de las estadísticas, mirada por clasificación en vez de por
// persona.
//
// Una encuesta sin contestar, o contestada y aún sin calificar, deja la
// clasificación sin insignia: no se puede dar por cumplido lo que nadie ha
// revisado. Y la que no exige mínimo (`requires_min_score` en false) cuenta
// como cumplida en cuanto está calificada, que es lo que esa bandera significa.
window.insigniasGanadas = (encuestas, respuestas, empleado, tieneEquipo) => {
    if (!empleado) return [];

    // La respuesta que vale de cada encuesta es la última calificada. Llegan
    // ordenadas de la más reciente, así que la primera de cada una es la suya.
    const suyaDe = {};
    (respuestas || []).forEach(r => {
        if (suyaDe[r.evaluation_id] === undefined) suyaDe[r.evaluation_id] = r;
    });

    const umbral = window.UMBRAL_CERTIFICACION || 80;
    const porClasificacion = {};

    (encuestas || []).forEach(ev => {
        if (!window.leTocaEstaEncuesta(ev, empleado, tieneEquipo)) return;

        const nombre = (ev.category || 'General').trim() || 'General';
        const clave = window.normalizarClasificacion(nombre);
        if (!porClasificacion[clave]) porClasificacion[clave] = { nombre: nombre, total: 0, cumplidas: 0 };
        porClasificacion[clave].total++;

        const resp = suyaDe[ev.id];
        if (!resp) return;
        // Sin nada calificado no hay puntaje que mirar: `calcularScoreRespuesta`
        // devuelve 0 tanto si se falló todo como si no hay nada, y no son lo
        // mismo.
        if (!window.tieneCalificaciones(resp)) return;
        if (!window.exigeMinimo(ev) || window.calcularScoreRespuesta(resp) >= umbral) {
            porClasificacion[clave].cumplidas++;
        }
    });

    return Object.values(porClasificacion)
        .filter(c => c.total > 0 && c.cumplidas === c.total)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// El símbolo de la insignia. Las clasificaciones habituales tienen el suyo; a
// cualquier otra le toca uno fijo sacado de su nombre, que es lo que hace que
// no cambie de un día para otro.
window.SIMBOLOS_INSIGNIA = [
    { busca: /SEGURIDAD|SAFETY/, simbolo: '🛡️' },
    { busca: /CALIDAD|QUALITY/, simbolo: '⭐' },
    { busca: /\b5S\b|ORDEN|LIMPIEZA/, simbolo: '🧹' },
    { busca: /MANTENIMIENTO|MANTTO/, simbolo: '🔧' },
    { busca: /AMBIENT|ECOLOG|VERDE/, simbolo: '🌱' },
    { busca: /SALUD|MEDIC|HIGIENE/, simbolo: '⛑️' },
    { busca: /PRODUC|MANUFAC|ENSAMBLE/, simbolo: '⚙️' },
    { busca: /CAPACITA|ENTRENA|FORMACI|CURSO/, simbolo: '🎓' },
    { busca: /ENERG|ELECTR/, simbolo: '⚡' }
];
window.SIMBOLOS_INSIGNIA_SUELTOS = ['🏅', '🎖️', '🥇', '🏆', '🔰', '✨', '🧭', '🦉'];

// Un número estable a partir del nombre: el mismo nombre da siempre el mismo
// color y el mismo símbolo, en este teléfono y en el de al lado.
window.semillaDeTexto = (texto) => {
    let h = 5381;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
};

window.simboloDeClasificacion = (nombre) => {
    const norm = window.normalizarClasificacion(nombre).toUpperCase();
    const conocida = window.SIMBOLOS_INSIGNIA.find(s => s.busca.test(norm));
    if (conocida) return conocida.simbolo;
    const sueltos = window.SIMBOLOS_INSIGNIA_SUELTOS;
    return sueltos[window.semillaDeTexto(norm) % sueltos.length];
};

window.matizDeClasificacion = (nombre) =>
    window.semillaDeTexto(window.normalizarClasificacion(nombre)) % 360;

// El parche de mérito: un aro festoneado —los puntos del borde son las
// puntadas—, el disco de dentro y el símbolo. Todo en SVG y sin imágenes, que
// el color sale del nombre de la clasificación.
window.svgInsignia = (nombre) => {
    const matiz = window.matizDeClasificacion(nombre);
    const aro = `hsl(${matiz}, 45%, 32%)`;
    const disco = `hsl(${matiz}, 45%, 92%)`;
    const costura = `hsl(${matiz}, 40%, 60%)`;

    let puntadas = '';
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        puntadas += `<circle cx="${(32 + 26.5 * Math.cos(a)).toFixed(1)}" cy="${(32 + 26.5 * Math.sin(a)).toFixed(1)}" r="5" fill="${aro}"/>`;
    }

    return `<svg viewBox="0 0 64 64" class="insignia-svg" aria-hidden="true">
            ${puntadas}
            <circle cx="32" cy="32" r="26.5" fill="${aro}"/>
            <circle cx="32" cy="32" r="21.5" fill="${disco}"/>
            <circle cx="32" cy="32" r="21.5" fill="none" stroke="${costura}" stroke-width="1.2" stroke-dasharray="3 3"/>
            <text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-size="20">${window.simboloDeClasificacion(nombre)}</text>
        </svg>`;
};

// Una estrella por insignia, debajo de la foto de perfil. Es el mismo dato que
// los parches de más abajo, dicho donde se mira primero: el parche dice de qué
// clasificación y la estrella sólo cuántas van.
//
// La estrella es un `<path>` y no un emoji: el emoji lo dibuja cada sistema a
// su manera —en iOS sale con relieve y borde— y aquí hacen falta cinco iguales
// en fila, del mismo amarillo.
window.svgEstrella = () => '<svg class="estrella-insignia" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M12 1.8l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.6l-6.2 3.3 1.2-6.9-5-4.9 6.9-1z"/>'
    + '</svg>';

window.dibujarEstrellasInsignias = (cuantas) => {
    const caja = document.getElementById('estrellas-insignias');
    if (!caja) return;

    if (!cuantas) { caja.innerHTML = ''; caja.removeAttribute('title'); return; }

    caja.className = 'estrellas-insignias';
    caja.title = cuantas === 1
        ? '1 clasificación con todas sus encuestas al mínimo'
        : `${cuantas} clasificaciones con todas sus encuestas al mínimo`;
    caja.innerHTML = window.svgEstrella().repeat(cuantas);
};

window.dibujarInsigniasClasificacion = (insignias) => {
    window.dibujarEstrellasInsignias((insignias || []).length);

    const caja = document.getElementById('insignias-clasificacion');
    if (!caja) return;

    // Sin ninguna ganada no se dibuja nada: un hueco vacío en el panel no
    // dice más que la ausencia de la insignia.
    if (!insignias || insignias.length === 0) { caja.innerHTML = ''; return; }

    const umbral = window.UMBRAL_CERTIFICACION || 80;
    caja.innerHTML = `
        <div class="insignias-titulo">Insignias</div>
        <div class="insignias-fila">
            ${insignias.map(ins => {
                const seguro = window.sanitizeForHTML(ins.nombre);
                const globo = ins.total === 1
                    ? `${seguro}: su única encuesta de esta clasificación está calificada al ${umbral}% o más`
                    : `${seguro}: sus ${ins.total} encuestas de esta clasificación están calificadas al ${umbral}% o más`;
                return `<div class="insignia" title="${globo}">
                        ${window.svgInsignia(ins.nombre)}
                        <div class="insignia-nombre">${seguro}</div>
                    </div>`;
            }).join('')}
        </div>`;
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
        // Las columnas de más —`mode`, los otros dos destinatarios y el mínimo—
        // son para las insignias, que deciden a quién le toca cada encuesta con
        // `leTocaEstaEncuesta` y no sólo por el puesto. El radar sigue mirando
        // lo suyo.
        const camposEval = await window.camposConMinimo(
            'id, title, category, target_positions, is_obligatory, mode, target_departments, target_employees');
        const { data: activeEvals } = await sb.from('evaluations').select(camposEval).eq('active', true);
        const { data: responses } = await sb.from('evaluation_responses')
    .select('evaluation_id, grades_json, review_status, submitted_at')
    .eq('employee_id', userId)
    .in('review_status', ['Revisado', 'Certificada']) // 🔥 Agregamos Certificada
    .order('submitted_at', { ascending: false });

        // Las insignias van con estos mismos datos y antes de dibujar nada: si
        // el radar se queda sin ejes que enseñar, ellas se dibujan igual.
        try {
            const yo = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(userId));
            window.dibujarInsigniasClasificacion(
                window.insigniasGanadas(activeEvals, responses, yo, window.tieneEquipoDirecto(userId)));
        } catch (e) {
            console.error('Error insignias por clasificación:', e);
        }

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

window.mostrarDashboard = async (user) => {
    document.getElementById('vista-login').classList.add('hidden');
    document.getElementById('vista-dashboard').classList.remove('hidden');

    const userHeader = document.getElementById('main-user-header');
    const radarContainer = document.getElementById('header-radar-container');
    const quickTeam = document.getElementById('quick-team-view');
    const btnLogout = document.getElementById('btn-logout');

    const calendarWidget = document.getElementById('dashboard-calendar-widget');
    if(calendarWidget) calendarWidget.style.display = 'block';

    if(userHeader) {
        userHeader.style.display = 'block';
        userHeader.style.padding = '15px';
        userHeader.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; flex-wrap: nowrap;">
                <div class="skeleton" style="width:60px; height:60px; border-radius:50%; flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div class="skeleton" style="width: 50%; height: 20px; margin-bottom: 8px;"></div>
                    <div class="skeleton" style="width: 30%; height: 14px;"></div>
                </div>
            </div>
            <div style="width: 100%; padding-top: 10px;">
                 <div id="header-radar-container" style="display:block; width: 100%; max-width: 400px; height: 210px; margin: 0 auto; position: relative;">
                    <div id="radar-loading-skeleton" class="skeleton" style="width: 190px; height: 190px; border-radius: 50%; opacity: 0.5; position: absolute; top:10px; left: 50%; transform: translateX(-50%); z-index:10;"></div>
                    <canvas id="dashboard-main-radar"></canvas>
                 </div>
            </div>
        `;
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

    const toolbar = document.getElementById('admin-toolbar');
    const title = document.getElementById('app-title');
    if (window.modoAdminActivo) {
        if(toolbar) toolbar.style.display = 'flex';
        if(title) title.style.color = '#d32f2f';
    } else {
        if(toolbar) toolbar.style.display = 'none';
        if(title) title.style.color = '';
    }

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

        if (userHeader) {
            // FIX DEFINITIVO: Forzamos la visualización en bloque aquí también
            userHeader.style.display = 'block';
            
            userHeader.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px; flex-wrap: nowrap;">
                    
                    <div id="header-user-info" style="min-width: 0; flex: 1;">
                        <!-- La foto y, debajo, una estrella por insignia. El
                             flotado vive aquí y no en la foto: así las
                             estrellas caen debajo de ella y el nombre las
                             rodea igual que rodeaba a la foto sola. -->
                        <div style="float: left; margin-right: 15px;">
                            <div id="header-user-icon" onclick="window.abrirStatsEmpleado('${user.id}', '${user.name}', '${user.puesto || 'Colaborador'}')"
                                    style="width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); cursor:pointer; position:relative; flex-shrink:0; ${headerBgStyle}">
                                ${headerAvatarHtml}
                                <div id="badge-count-${user.id}" class="notification-badge" style="display:none;">0</div>
                            </div>
                            <div id="estrellas-insignias"></div>
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
                </div>

                <div style="width: 100%; padding-top: 10px;">
                     <div id="header-radar-container" style="display:block; width: 100%; max-width: 450px; height: 260px; margin: 0 auto; position: relative;">
                        <div id="radar-loading-skeleton" class="skeleton" style="width: 190px; height: 190px; border-radius: 50%; opacity: 0.5; position: absolute; top:20px; left: 50%; transform: translateX(-50%); z-index:10;"></div>
                        <canvas id="dashboard-main-radar"></canvas>
                     </div>
                </div>

                <!-- Las insignias de clasificación las llena
                     dibujarInsigniasClasificacion, y si no hay ninguna se
                     queda vacío. -->
                <div id="insignias-clasificacion"></div>
            `;
            
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

    window.cargarEncuestasQueReviso(user.id);
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
        const campos = await window.camposConRevisores('id, title, category');
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
            .select('evaluation_id')
            .in('review_status', ['Pendiente', 'Mal Revisada'])
            .in('evaluation_id', mias.map(e => e.id))
            .neq('employee_id', empStrId);

        (respuestas || []).forEach(r => {
            const clave = String(r.evaluation_id);
            porCalificar[clave] = (porCalificar[clave] || 0) + 1;
        });

        const totalPorCalificar = Object.values(porCalificar).reduce((a, b) => a + b, 0);

        const filas = mias.map(ev => {
            const pendientes = porCalificar[String(ev.id)] || 0;
            const safeTitle = String(ev.title || '').replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            const insignia = pendientes > 0
                ? `<div style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; border-radius:20px; padding:3px 10px; font-size:0.7rem; font-weight:bold; white-space:nowrap;">${pendientes} por calificar</div>`
                : `<div style="background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0; border-radius:20px; padding:3px 10px; font-size:0.7rem; font-weight:bold; white-space:nowrap;">Al día</div>`;

            return `
                <div onclick="window.abrirEncuestaQueReviso('${ev.id}', '${safeTitle}')"
                     style="display:flex; align-items:center; gap:10px; padding:10px 8px; border-top:1px solid #f1f5f9; cursor:pointer;">
                    <div style="font-size:1.3rem; line-height:1;">📋</div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; color:#1e293b; font-size:0.9rem; line-height:1.2; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                        <div style="font-size:0.72rem; color:#94a3b8;">${window.sanitizeForHTML(ev.category || 'General')}</div>
                    </div>
                    ${insignia}
                </div>`;
        }).join('');

        const resumen = totalPorCalificar > 0
            ? `${totalPorCalificar} ${totalPorCalificar === 1 ? 'respuesta espera' : 'respuestas esperan'} tu calificación`
            : 'No hay nada esperando calificación';

        cont.innerHTML = `
            <div style="background:white; border-radius:16px; padding:15px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); border:1px solid #f1f5f9;">
                <h3 style="margin:0 0 2px 0; color:#7e22ce; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">👁️ Encuestas que revisas</h3>
                <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:6px;">${resumen}</div>
                ${filas}
            </div>`;
        cont.style.display = 'block';
    } catch (e) {
        // Nada que enseñar es mejor que una tarjeta rota: el resto del inicio
        // no depende de esto.
        console.warn('No se pudieron cargar las encuestas que revisa:', e.message);
    }
};

// Se abre la lista de encuestas primero: el detalle se dibuja dentro de su
// hoja —`#contenido-modal-evaluaciones`, que no existe hasta que la lista se
// ha montado— y así la flecha de volver lleva a donde tiene que llevar.
window.abrirEncuestaQueReviso = async (evalId, titulo) => {
    if (!window.cargarVistaEvaluaciones) { alert('Módulo de encuestas en actualización'); return; }
    await window.cargarVistaEvaluaciones();
    if (window.abrirHistorialEvaluacion) await window.abrirHistorialEvaluacion(evalId, titulo);
};

window.cargarDatosEmpleados = async () => {
    // 1. Agregamos is_active al select (quitamos el filtro .not)
    const { data, error } = await sb.from('employees')
        .select('employee_id, name, department, area_id, puesto, supervisor_id, created_at, avatar_url, areas(nombre), is_active');
    
    if(error) return;
    
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

    setTimeout(() => window.calcularPendientesBatch(idsParaCalculo), 500);
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
        const camposEvals = await window.camposConMinimo(await window.camposConReintento(await window.camposConRevisores(
            'id, target_positions, target_departments, target_employees, mode, is_obligatory, active, frequency, created_at')));
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
                const { count: countNombrado } = await sb.from('evaluation_responses')
                    .select('id', { count: 'exact', head: true })
                    .in('review_status', ['Pendiente', 'Mal Revisada'])
                    .in('evaluation_id', evalsQueRevisa.map(e => e.id))
                    .neq('employee_id', empStrId);
                countPorCalificar += (countNombrado || 0);
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
        <div class="avatar-circle-large" ${editableAction} title="Cambiar foto">
            ${avatarImgHtml}
            ${hoverIcon}
            <input type="file" id="inp-avatar-upload" style="display:none;" accept="image/*" onchange="window.cambiarFotoPerfil(this, '${empId}')">
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
