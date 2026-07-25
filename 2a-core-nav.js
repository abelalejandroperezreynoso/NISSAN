// ==========================================
// 2a-core-nav.js (V17: FIX REAPARICIÓN ENCUESTAS POR FRECUENCIA + EXPIRACIÓN 30 DÍAS)
// ==========================================

// --- SISTEMA DE CACHÉ ---
window.CACHE_DASHBOARD = {
    ultimos: null,
    pendientes: {},
    timestamp: 0,
    TTL: 300000 // 5 minutos
};

// Función para forzar recarga
window.invalidarCacheDashboard = () => {
    console.log("🔄 Caché invalidada: Datos frescos requeridos.");
    window.CACHE_DASHBOARD.timestamp = 0;
    window.CACHE_DASHBOARD.ultimos = null;
    window.CACHE_DASHBOARD.pendientes = {};
};

// Variables Globales
window.currentTypeFilter = "";
window.mostrandoPendientesEquipo = false;
window.statsPendientes = {};
window.currentStatsEmpId = null;
window.radarChartInstances = [];
window.dashboardRadarInstance = null;
window.tempIdFiltro = null;
window.modoAdminActivo = false;

const canvas = document.getElementById('signature-pad');
const ctx = canvas ? canvas.getContext('2d') : null;
let drawing = false;

// --- GESTIÓN DE FIRMA (CANVAS) ---
const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - r.left, y: cy - r.top };
};
const startDraw = (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
const moveDraw = (e) => { if(!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
const endDraw = () => { drawing = false; };

if(canvas) {
    canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('mousemove', moveDraw); canvas.addEventListener('touchmove', moveDraw);
    canvas.addEventListener('mouseup', endDraw); canvas.addEventListener('touchend', endDraw);
}

window.limpiarFirma = () => {
    if(!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
};

window.cerrarFirma = () => document.getElementById('modal-firma').style.display = 'none';

// --- UTILIDADES DE INTERFAZ ---
window.cerrarDetallesSiAbiertos = () => {
    if(window.currentDetailId) {
        const detailEl = document.getElementById(`details-${window.currentDetailId}`);
        if(detailEl) detailEl.style.display = 'none';
        window.currentDetailId = null;
    }
};

window.toggleGradoVisibility = () => {
    const el = document.getElementById('inp-tipo');
    if(!el) return;
    const tipo = el.value;
    const gradoDiv = document.getElementById('div-grado-container');
    if (tipo === 'Incidente') gradoDiv.style.display = 'block';
    else gradoDiv.style.display = 'none';
};

window.cambiarFiltroTipo = () => {
    const container = document.getElementById('container-incidentes');
    if(container && container.style.display !== 'none' && typeof window.cargarIncidentes === 'function') {
        window.cargarIncidentes();
    }
};

window.ocultarElementosNav = () => {
    const userHeader = document.getElementById('main-user-header');
    if(userHeader) userHeader.style.display = 'none';
    
    const quickView = document.getElementById('quick-team-view');
    if(quickView) quickView.style.display = 'none';
    
    const latestInc = document.getElementById('container-ultimos-incidentes');
    if(latestInc) latestInc.style.display = 'none';

    const topPendientes = document.getElementById('top-pendientes-container');
        if(topPendientes) topPendientes.style.display = 'none';

    };

// --- NAVEGACIÓN PRINCIPAL ---
window.cargarVistaTipo = (tipo) => {
    window.mostrandoPendientes = false;
    window.mostrandoPendientesEquipo = false;
    window.currentTypeFilter = tipo;
    window.paginaActual = 0;
    window.tempIdFiltro = null;
    
    // Abrir el modal en lugar de ocultar el dashboard
    const modal = document.getElementById('modal-lista-incidentes');
    if(modal) modal.style.display = 'flex';
    
    const titulo = document.getElementById('titulo-modal-lista-incidentes');
    if(titulo) {
        if(tipo === 'Incidente') titulo.innerHTML = "🚨 Incidentes";
        else if(tipo === 'Difusión') titulo.innerHTML = "📢 Difusiones";
        else if(tipo === 'Capacitación') titulo.innerHTML = "📚 Capacitaciones";
    }

    const container = document.getElementById('container-incidentes');
    if(container) container.innerHTML = '';
    
    if(typeof window.cargarIncidentes === 'function') window.cargarIncidentes();
};

window.verIncidenteUnico = (id) => {
    // Abrimos directamente el detalle del registro para una mejor experiencia
    if (window.abrirDetalleIndependiente) {
        window.abrirDetalleIndependiente(id);
    }
};

window.cerrarModalListaIncidentes = () => {
    const modal = document.getElementById('modal-lista-incidentes');
    if(modal) modal.style.display = 'none';
    window.currentTypeFilter = "";
};
// --- EVENT LISTENERS (BOTONES) ---
document.getElementById('btn-ver-tipo-incidente').onclick = () => window.cargarVistaTipo('Incidente');
document.getElementById('btn-ver-tipo-difusion').onclick = () => window.cargarVistaTipo('Difusión');
document.getElementById('btn-ver-tipo-capacitacion').onclick = () => window.cargarVistaTipo('Capacitación');

document.getElementById('btn-ver-evaluaciones').onclick = () => {
    // Solo abrimos el panel flotante, sin ocultar el dashboard de fondo
    if(window.cargarVistaEvaluaciones) window.cargarVistaEvaluaciones();
};

document.getElementById('btn-ver-stats').onclick = () => {
    // Asegurarnos de que el contenedor de datos no tenga la clase 'hidden'
    const globalStats = document.getElementById('global-stats');
    if (globalStats) globalStats.classList.remove('hidden');
    
    // Mostramos la ventana flotante
    document.getElementById('modal-stats-difusion').style.display = 'flex';
    
    // Ejecutamos el cálculo de datos
    if(window.calcularAvanceGlobal) window.calcularAvanceGlobal(false);
};

// CÓDIGO NUEVO:
const btnStatsEncuestas = document.getElementById('btn-ver-stats-encuestas');
if(btnStatsEncuestas) {
    btnStatsEncuestas.onclick = () => {
        document.getElementById('modal-stats-encuestas').style.display = 'flex';
        if(window.cargarStatsEncuestasGlobales) window.cargarStatsEncuestasGlobales();
    };
}



// --- BOTONES DE PENDIENTES (INTEGRACIÓN CON 7-PENDIENTES.JS) ---
document.getElementById('btn-ver-pendientes-init').onclick = () => {
    window.ocultarElementosNav();
    document.getElementById('init-load-container').style.display = 'none';
    
    if(window.cargarVistaPendientes) {
        window.cargarVistaPendientes('PROPIOS');
    } else {
        alert("Error: Módulo de pendientes no cargado.");
    }
};

const btnEquipo = document.getElementById('btn-ver-pendientes-equipo');
if(btnEquipo) {
    btnEquipo.onclick = () => {
        window.ocultarElementosNav();
        document.getElementById('init-load-container').style.display = 'none';
        
        if(window.cargarVistaPendientes) {
            window.cargarVistaPendientes('EQUIPO');
        } else {
            alert("Error: Módulo de pendientes no cargado.");
        }
    };
}

document.getElementById('btn-nuevo').onclick = () => {
    if(!window.checkAdmin()) return;
    window.idEditando=null;
    window.existingGallery=[];
    if(window.abrirModal) window.abrirModal();
};

window.volverAlDashboard = () => window.mostrarDashboard(JSON.parse(localStorage.getItem("usuarioLogueado")));

// --- MODO ADMINISTRADOR ---
document.getElementById('app-title').onclick = () => {
    const titleElem = document.getElementById('app-title');
    const adminToolbar = document.getElementById('admin-toolbar');
    
    if(window.modoAdminActivo) {
        window.modoAdminActivo = false;
        sessionStorage.removeItem('adminSostenido'); // <-- LÍNEA AGREGADA
        if(adminToolbar) adminToolbar.style.display = 'none';
        titleElem.style.color = '';
        window.volverAlDashboard();
    } else if(prompt("Contraseña Admin:") === window.PASSWORD_ADMIN) {
        window.modoAdminActivo = true;
        if(adminToolbar) adminToolbar.style.display = 'flex';
        titleElem.style.color = '#d32f2f';
        const btnAhorro = document.getElementById('btn-toggle-ahorro');
        if(btnAhorro && window.actualizarBotonAhorroVisual) {
            window.actualizarBotonAhorroVisual(btnAhorro);
        }
        window.volverAlDashboard();
    }
};

window.checkAdmin = () => { return window.modoAdminActivo ? true : (alert("Requiere permisos de administrador"), false); }

// --- VALIDACIÓN DE SESIÓN (NUEVO) ---
window.verificarExpiracionSesion = () => {
    const userLog = localStorage.getItem("usuarioLogueado");
    
    // Si no hay usuario, no hay nada que verificar
    if (!userLog) return false;

    const loginTimestamp = localStorage.getItem("loginTimestamp");
    
    // Si el usuario está logueado pero NO tiene un timestamp (es un caché viejo), lo sacamos
    if (!loginTimestamp) {
        window.cerrarSesionForzada("Hemos actualizado el sistema. Por favor, inicia sesión nuevamente para sincronizar tus datos.");
        return true;
    }

    // Calcular cuántos días han pasado
    const diasTranscurridos = (Date.now() - parseInt(loginTimestamp)) / (1000 * 60 * 60 * 24);
    
    // Si han pasado más de 30 días, cerramos la sesión
    if (diasTranscurridos > 30) {
        window.cerrarSesionForzada("Tu sesión ha expirado por seguridad. Por favor, inicia sesión de nuevo.");
        return true;
    }

    return false; // La sesión sigue siendo válida
};

window.cerrarSesionForzada = (mensaje) => {
    alert(mensaje);
    localStorage.removeItem("usuarioLogueado");
    localStorage.removeItem("loginTimestamp");
    sessionStorage.removeItem("adminSostenido");
    location.reload();
};

// --- LOGIN Y GESTIÓN DE SESIÓN ---
const btnLoginAction = document.getElementById('btn-login-action');
const inpLoginName = document.getElementById('login-name');

window.iniciarApp = () => {
    // 1. Verificamos si la sesión expiró antes de iniciar
    const sesionExpirada = window.verificarExpiracionSesion();

    // 2. Si no ha expirado, procedemos con el arranque normal
    if (!sesionExpirada) {
        if(localStorage.getItem("usuarioLogueado")) {
            window.mostrarDashboard(JSON.parse(localStorage.getItem("usuarioLogueado")));
        } else {
            window.mostrarLogin();
        }
    }
}

window.mostrarLogin = () => {
    document.getElementById('vista-login').classList.remove('hidden');
    document.getElementById('vista-dashboard').classList.add('hidden');
    if(window.cargarEmpleadosParaLogin) window.cargarEmpleadosParaLogin();
}

if(inpLoginName) {
    inpLoginName.addEventListener('input', () => {
        const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const val = normalize(inpLoginName.value);
        const list = document.getElementById('suggestions-list');
        list.innerHTML = ''; list.style.display='none';
        if(val.length < 2) return;
        
        if(!window.empleadosLoginCache) return;
                // Se eliminó el .slice(0,5) para que muestre todos los resultados
                const matches = window.empleadosLoginCache.filter(e => normalize(e.name).includes(val));
                if(matches.length > 0) {
            list.style.display='block';
            matches.forEach(e => {
                const d=document.createElement('div'); d.className='suggestion-item'; d.innerText=e.name;
                d.onclick=()=>{inpLoginName.value=e.name; list.style.display='none'; document.getElementById('login-id').focus();}
                list.appendChild(d);
            });
        }
    });
}

if(btnLoginAction) {
    btnLoginAction.addEventListener('click', () => {
        const n = inpLoginName.value.trim(), p = document.getElementById('login-id').value.trim();
        const user = window.empleadosLoginCache ? window.empleadosLoginCache.find(e => e.name === n && e.id == p) : null;
        if(user) {
            // Guardamos el usuario y registramos el timestamp de inicio de sesión
            localStorage.setItem("usuarioLogueado", JSON.stringify(user));
            localStorage.setItem("loginTimestamp", Date.now().toString());
            
            window.mostrarDashboard(user);
        } else alert("Credenciales incorrectas o datos cargando...");
    });
}

document.getElementById('btn-logout').onclick = () => {
    localStorage.removeItem("usuarioLogueado");
    localStorage.removeItem("loginTimestamp"); // Limpiamos también el timestamp al salir manualmente
    window.modoAdminActivo = false;
    sessionStorage.removeItem("adminSostenido");
    window.invalidarCacheDashboard();
    location.reload();
};

// ==========================================
// CONTROL DE AHORRO DE DATOS (ADMIN GLOBAL)
// ==========================================

window.actualizarBotonAhorroVisual = (btn) => {
    if (!btn) return;
    if (window.MODO_AHORRO_DATOS) {
        btn.innerText = "📡 Ahorro: ON";
        btn.style.background = "#dcfce7";
        btn.style.color = "#166534";
        btn.style.borderColor = "#22c55e";
    } else {
        btn.innerText = "📡 Ahorro: OFF";
        btn.style.background = "#fee2e2";
        btn.style.color = "#991b1b";
        btn.style.borderColor = "#ef4444";
    }
};

window.toggleAhorroGlobal = async () => {
    if (!window.checkAdmin()) return;
    const btn = document.getElementById('btn-toggle-ahorro');
    const estadoAnterior = window.MODO_AHORRO_DATOS;
    const nuevoEstado = !estadoAnterior;
    btn.innerText = "Guardando..."; btn.disabled = true;

    try {
        const { error } = await sb.from('system_config').upsert({ key: 'ahorro_datos', value: nuevoEstado });
        if (error) throw error;
        window.MODO_AHORRO_DATOS = nuevoEstado;
        window.actualizarBotonAhorroVisual(btn);
        const mensaje = nuevoEstado ? "✅ MODO AHORRO ACTIVADO" : "⚠️ MODO AHORRO DESACTIVADO";
        alert(mensaje);
    } catch (e) {
        console.error(e);
        alert("Error: " + e.message);
        window.MODO_AHORRO_DATOS = estadoAnterior;
        window.actualizarBotonAhorroVisual(btn);
    } finally {
        btn.disabled = false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-toggle-ahorro');
    if(btn) window.actualizarBotonAhorroVisual(btn);
});

// --- LÓGICA DE PENDIENTES (BADGES Y RESUMEN) ---

window.actualizarResumenPendientesEnModal = (empId) => {
    const summaryBox = document.getElementById('stats-summary-content');
    if(!summaryBox) return;
    const modal = document.getElementById('modal-stats-empleado');
    if(modal && modal.style.display === 'none') return;
    if(empId === 'EQUIPO') return;
    if(window.currentStatsEmpId !== empId) return;
    
    const stats = window.statsPendientes[empId];
    const cardStyle = "flex: 1; min-width: 100px; padding: 12px; border-radius: 12px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.03); border: 1px solid transparent;";

    if (!stats) {
        summaryBox.innerHTML = "<div style='text-align:center; color:#64748b; padding: 10px;'>⏳ Calculando...</div>";
    } else if (stats.total === 0 && stats.porCalificar === 0) {
        summaryBox.innerHTML = `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center;"><div style="font-size: 2rem; margin-bottom: 5px;">🎉</div><div style="color: #166534; font-weight: bold; font-size: 1rem;">¡Todo al día!</div></div>`;
    } else {
        let cardsHtml = '';
        if (stats.incidentes > 0) cardsHtml += `<div style="${cardStyle} background: #fff1f2; border-color: #fecdd3;"><div style="font-size: 1.5rem; color: #e11d48; font-weight: 800; line-height: 1;">${stats.incidentes}</div><div style="font-size: 0.75rem; color: #9f1239; font-weight: 600; margin-top: 4px;">Incidentes</div></div>`;
        if (stats.difusiones > 0) cardsHtml += `<div style="${cardStyle} background: #eff6ff; border-color: #bfdbfe;"><div style="font-size: 1.5rem; color: #2563eb; font-weight: 800; line-height: 1;">${stats.difusiones}</div><div style="font-size: 0.75rem; color: #1e40af; font-weight: 600; margin-top: 4px;">Difusiones</div></div>`;
        if (stats.evaluaciones > 0) cardsHtml += `<div style="${cardStyle} background: #f5f3ff; border-color: #ddd6fe;"><div style="font-size: 1.5rem; color: #7c3aed; font-weight: 800; line-height: 1;">${stats.evaluaciones}</div><div style="font-size: 0.75rem; color: #5b21b6; font-weight: 600; margin-top: 4px;">Encuestas</div></div>`;
        if (stats.porCalificar > 0) cardsHtml += `<div style="${cardStyle} background: #fff7ed; border-color: #fed7aa;"><div style="font-size: 1.5rem; color: #ea580c; font-weight: 800; line-height: 1;">${stats.porCalificar}</div><div style="font-size: 0.75rem; color: #9a3412; font-weight: 600; margin-top: 4px;">Por Calificar</div></div>`;
        summaryBox.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 10px;">${cardsHtml}</div><div style="margin-top: 10px; font-size: 0.75rem; color: #94a3b8; text-align: center;">Total pendientes: <b>${stats.total}</b></div>`;
    }
};

// --- CÁLCULO CENTRALIZADO DE PENDIENTES (BATCH PARA EQUIPOS) ---
window.calcularPendientesBatch = async (idsEmpleados) => {
    if(!idsEmpleados || idsEmpleados.length === 0) return;
    
    // Verificación de caché
    const now = Date.now();
    const isCacheValid = (now - window.CACHE_DASHBOARD.timestamp) < window.CACHE_DASHBOARD.TTL;
    const idsFaltantes = isCacheValid ? idsEmpleados.filter(id => !window.CACHE_DASHBOARD.pendientes[id]) : idsEmpleados;

    // Si todo está en caché, actualizar UI y salir
    if (idsFaltantes.length === 0) {
        idsEmpleados.forEach(empId => actualizarBadgeUI(empId, window.CACHE_DASHBOARD.pendientes[empId]));
        actualizarBadgeEquipo();
        return;
    }

    try {
        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        
        // 1. Obtener pendientes SQL (Incidentes y Revisiones)
        const idsComoTexto = idsFaltantes.map(id => String(id));
        let rpcData = {};
        try {
             const { data, error } = await sb.rpc('obtener_conteo_pendientes', { lista_empleados_ids: idsComoTexto });
             if (!error && data) rpcData = data;
        } catch(e) { console.error("RPC Error", e); }

        // --- INYECCIÓN DE PENDIENTES DE ENCUESTAS ---
        const { data: activeEvals } = await sb.from('evaluations')
    .select('id, target_positions, target_employees, is_obligatory, frequency, mode')
    .eq('active', true);

// Removemos la restricción .filter() para que se incluyan las evaluaciones modo 'boss' en la lista del usuario
const selfEvals = activeEvals ? activeEvals : [];
                const teamObligatorias = activeEvals ? activeEvals.filter(e => e.is_obligatory !== false) : [];
                
                const { data: allResps } = await sb.from('evaluation_responses')
                    .select('evaluation_id, employee_id, submitted_at');

                // Iteramos sobre CADA empleado
                idsFaltantes.forEach(empId => {
                    const empStrId = String(empId);
                    
                    // --- FIX PUESTO ROBUSTO ---
                    let empPuestoRaw = "Sin Puesto";
                    if (window.todosLosEmpleadosData) {
                        const empData = window.todosLosEmpleadosData.find(e => String(e.id) === empStrId);
                        if (empData) empPuestoRaw = empData.puesto || "Sin Puesto";
                    }
                    if (empPuestoRaw === "Sin Puesto" && user && String(user.id) === empStrId) {
                        empPuestoRaw = user.puesto || "Sin Puesto";
                    }
                    const empPuestoNorm = empPuestoRaw.toUpperCase().trim();
                    // ---------------------------
                    
                    const empResponses = allResps ? allResps.filter(r => String(r.employee_id) === empStrId) : [];
                    let countEncuestasPendientes = 0;
                    let countBossPendientes = 0;

                    const calcPendiente = (resps, f) => {
    if(resps.length === 0) return true;
    resps.sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    const d = (new Date() - new Date(resps[0].submitted_at)) / 86400000;
    let c = 0, a = 0;
    switch(f) { 
        case 'weekly': c=7; a=2; break; 
        case 'biweekly': c=14; a=7; break; 
        case 'monthly': c=30; a=14; break; 
        case 'quarterly': c=90; a=30; break; 
        case 'semiannual': c=180; a=60; break; 
        case 'yearly': c=365; a=90; break; 
        case 'biennial': c=730; a=120; break; 
        default: return false; 
    }
    return (c - d) <= a;
};

                    // 1. Sus encuestas propias (self)
                                        selfEvals.forEach(ev => {
                                            let targetEmps = ev.target_employees;
                                            if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                                            if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];

                                            let esParaUsuario = false;

                                            if (targetEmps.length > 0 && !targetEmps.includes('ALL')) {
                                                esParaUsuario = targetEmps.includes(empStrId);
                                            } else {
                                                let targets = ev.target_positions;
                                                if (typeof targets === 'string') { try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; } }
                                                if (!Array.isArray(targets)) targets = ['ALL'];
                                                esParaUsuario = targets.length === 0 || targets.includes('ALL') || targets.map(t => String(t).toUpperCase().trim()).includes(empPuestoNorm);
                                            }
                                            
                                            if (esParaUsuario && ev.is_obligatory !== false) {
    const misRespuestasDeEstaEncuesta = empResponses.filter(r => r.evaluation_id === ev.id);
    
    // Si la evaluación es modo jefe, usamos la lógica de esEvaluacionPendiente para revisar si el jefe ya la hizo en este periodo
    if (ev.mode === 'boss') {
        if (window.esEvaluacionPendiente(misRespuestasDeEstaEncuesta, ev.id, ev.frequency).mostrar) {
             countEncuestasPendientes++;
        }
    } else {
        // Lógica de cálculo clásica para auto-encuestas
        if (calcPendiente(misRespuestasDeEstaEncuesta, ev.frequency)) countEncuestasPendientes++;
    }
}
                                        });
                    // 2. Evaluaciones y alertas de equipo (Si es jefe)
                    const misSubs = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.filter(e => String(e.supId) === empStrId) : [];
                    
                    if(misSubs.length > 0 && teamObligatorias.length > 0) {
                                            teamObligatorias.forEach(ev => {
                                                let targetEmps = ev.target_employees;
                                                if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                                                if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];

                                                let targets = ev.target_positions;
                                                if (typeof targets === 'string') { try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; } }
                                                if (!Array.isArray(targets)) targets = ['ALL'];
                                                const tNorm = targets.map(t => String(t).toUpperCase().trim());

                                                misSubs.forEach(sub => {
                                                    let aplicaSub = false;

                                                    if (targetEmps.length > 0 && !targetEmps.includes('ALL')) {
                                                        aplicaSub = targetEmps.includes(String(sub.id));
                                                    } else {
                                                        const subPuesto = (sub.puesto || "").trim().toUpperCase();
                                                        aplicaSub = targets.length === 0 || targets.includes('ALL') || tNorm.includes(subPuesto);
                                                    }
                                                    
                                                    if(aplicaSub) {
                                                        const subR = allResps ? allResps.filter(r => String(r.employee_id) === String(sub.id) && r.evaluation_id === ev.id) : [];
                                                        if(calcPendiente(subR, ev.frequency)) countBossPendientes++;
                                                    }
                                                });
                                            });
                                        }

                    if (!rpcData[empStrId]) rpcData[empStrId] = { incidentes: 0, difusiones: 0, evaluaciones: 0, porCalificar: 0 };
                    
                    // Sumamos los contadores
                    rpcData[empStrId].evaluaciones = (rpcData[empStrId].evaluaciones || 0) + countEncuestasPendientes;
                    rpcData[empStrId].porCalificar = (rpcData[empStrId].porCalificar || 0) + countBossPendientes;
                });

        // Actualizar caché y UI
        Object.keys(rpcData).forEach(empId => {
            const stats = rpcData[empId];
            stats.total = (stats.incidentes || 0) + (stats.difusiones || 0) + (stats.evaluaciones || 0) + (stats.porCalificar || 0);
            window.statsPendientes[empId] = stats;
            window.CACHE_DASHBOARD.pendientes[empId] = stats;
            actualizarBadgeUI(empId, stats);
            if(window.currentStatsEmpId === empId) window.actualizarResumenPendientesEnModal(empId);
        });
        window.CACHE_DASHBOARD.timestamp = Date.now();
        actualizarBadgeEquipo();

    } catch (e) { console.error("Error excepción RPC", e); }
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
    if(window.todosLosEmpleadosData && user) {
        const misDirectosIds = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id)).map(e => e.id);
        misDirectosIds.forEach(id => { if(window.statsPendientes[id]) grandTotal += window.statsPendientes[id].total; });
        const teamBadge = document.getElementById('badge-team-total');
        if(teamBadge) {
            if(grandTotal > 0) {
                teamBadge.innerText = grandTotal > 99 ? '99+' : grandTotal;
                teamBadge.style.display = 'flex';
            } else { teamBadge.style.display = 'none'; }
        }
    }
}

// --- BACKUP Y RESTAURACIÓN ---

window.exportarBaseDatos = async () => {
    if(!confirm("¿Descargar copia completa?")) return;
    const btn = document.getElementById('btn-backup-download');
    const originalText = btn.innerText; btn.innerText = "⏳..."; btn.disabled = true;
    try {
        const backupData = { timestamp: new Date().toISOString(), version: "1.0", tables: {} };
        const DB_TABLES = ['employees', 'evaluations', 'evaluation_questions', 'incidents', 'incident_gallery', 'incident_signatures', 'evaluation_responses'];
        for (const tableName of DB_TABLES) {
            const { data, error } = await sb.from(tableName).select('*');
            if (error) throw new Error(error.message);
            backupData.tables[tableName] = data;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
        const a = document.createElement('a'); a.href = dataStr;
        a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        alert(`Backup completado.`);
    } catch (e) { alert("Error: " + e.message); }
    btn.innerText = originalText; btn.disabled = false;
};

window.importarBaseDatos = async (inputElement) => {
    const file = inputElement.files[0]; if (!file) return;
    if(!confirm("⚠️ Esto sobrescribirá datos. ¿Continuar?")) { inputElement.value = ''; return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backupData = JSON.parse(e.target.result);
            const DB_TABLES = ['employees', 'evaluations', 'evaluation_questions', 'incidents', 'incident_gallery', 'incident_signatures', 'evaluation_responses'];
            for (const tableName of DB_TABLES) {
                const rows = backupData.tables[tableName];
                if (rows && rows.length > 0) {
                    for (let i = 0; i < rows.length; i += 100) {
                        await sb.from(tableName).upsert(rows.slice(i, i + 100));
                    }
                }
            }
            alert("✅ Restauración completada."); location.reload();
        } catch (err) { alert("Error: " + err.message); }
    };
    reader.readAsText(file); inputElement.value = '';
};

console.log("✅ Core Nav Loaded (2a) + FIX Reaparición Encuestas por Frecuencia (V17)");
