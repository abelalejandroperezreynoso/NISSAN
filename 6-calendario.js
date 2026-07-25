// ==========================================
// 6-calendario.js (V36: ACTUALIZACIÓN OPTIMISTA - SIN RECARGAS)
// ==========================================

window.calendarDate = new Date();
window.calendarCache = {};
window.calViewMode = 'grid'; 
window.moveEventState = null;
window.returnToCalendar = false;

// Variables globales de Fecha
var CAL_MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
var CAL_WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];

// --- 1. LÓGICA DE DATOS ---

window.resolveEmpName = (id, myId) => {
    if (String(id) === String(myId)) return "Mí";
    if (window.employeeNameMap && window.employeeNameMap[id]) return window.employeeNameMap[id];
    if (window.todosLosEmpleadosData) {
        const found = window.todosLosEmpleadosData.find(e => String(e.id) === String(id));
        if (found) return found.name;
    }
    return "Usuario";
};

window.fetchAnnualEvents = async (year) => {
    const cacheKey = `year-${year}`;
    if (window.calendarCache[cacheKey]) return window.calendarCache[cacheKey];

    const userJson = localStorage.getItem("usuarioLogueado");
    if (!userJson) return [];
    const user = JSON.parse(userJson);
    const myIdStr = String(user.id);

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    // --- WHITELIST ---
    let allowedIdsSet = new Set([myIdStr]);
    if (window.todosLosEmpleadosData) {
        const all = window.todosLosEmpleadosData;
        const queue = [myIdStr];
        while(queue.length > 0){
            const currentId = queue.shift();
            const children = all.filter(e => String(e.supId) === currentId);
            children.forEach(child => {
                const cId = String(child.id);
                if(!allowedIdsSet.has(cId)) { allowedIdsSet.add(cId); queue.push(cId); }
            });
        }
    }
    
    const targetIds = Array.from(allowedIdsSet);
    const startStr = `${year}-01-01T00:00:00`;
    const endStr = `${year}-12-31T23:59:59`;
    
    let events = [];

    try {
        const pHistory = sb.from('evaluation_responses')
            .select('id, submitted_at, employee_id, evaluation_id, evaluations(title, mode)')
            .in('employee_id', targetIds)
            .gte('submitted_at', startStr)
            .lte('submitted_at', endStr);

        const pScheduled = sb.from('scheduled_evaluations')
            .select('id, scheduled_date, employee_id, evaluation_id, status, notes, evaluations(title, mode)')
            .in('employee_id', targetIds)
            .gte('scheduled_date', `${year}-01-01`)
            .lte('scheduled_date', `${year}-12-31`)
            .neq('status', 'cancelled');

        const [resHist, resSched] = await Promise.all([pHistory, pScheduled]);

        let rawCompleted = [];
        let rawScheduled = [];

        if (resHist.data) {
            resHist.data.forEach(ev => {
                if (!ev.submitted_at) return;
                if (!allowedIdsSet.has(String(ev.employee_id))) return;

                const isMe = String(ev.employee_id) === myIdStr;
                const empName = window.resolveEmpName(ev.employee_id, myIdStr);
                const rawTitle = (ev.evaluations && ev.evaluations.title) ? ev.evaluations.title : 'Evaluación';
                const mode = (ev.evaluations && ev.evaluations.mode) ? ev.evaluations.mode : 'self';

                rawCompleted.push({
                    id: ev.id,
                    employee_id: ev.employee_id,
                    evaluation_id: ev.evaluation_id,
                    title: isMe ? rawTitle : `${rawTitle} (${empName})`,
                    originalTitle: rawTitle,
                    empName: empName,
                    isMe: isMe,
                    date: ev.submitted_at.split('T')[0],
                    type: 'completed',
                    statusLabel: 'Realizado',
                    source: 'response',
                    mode: mode
                });
            });
        }

        if (resSched.data) {
            resSched.data.forEach(sch => {
                if (!allowedIdsSet.has(String(sch.employee_id))) return;
                const isMe = String(sch.employee_id) === myIdStr;
                const empName = window.resolveEmpName(sch.employee_id, myIdStr);
                const rawTitle = (sch.evaluations && sch.evaluations.title) ? sch.evaluations.title : (sch.notes || 'Evaluación');
                const mode = (sch.evaluations && sch.evaluations.mode) ? sch.evaluations.mode : 'self';

                rawScheduled.push({
                    id: sch.id,
                    employee_id: sch.employee_id,
                    evaluation_id: sch.evaluation_id,
                    title: isMe ? rawTitle : `${rawTitle} (${empName})`,
                    originalTitle: rawTitle,
                    empName: empName,
                    isMe: isMe,
                    date: sch.scheduled_date,
                    type: 'scheduled',
                    statusLabel: sch.status === 'pending' ? 'Programada' : 'Agendada',
                    source: 'schedule',
                    notes: sch.notes,
                    mode: mode
                });
            });
        }

        // Conciliación con Match Cercano
        rawScheduled.sort((a,b) => new Date(a.date) - new Date(b.date));
        rawCompleted.sort((a,b) => new Date(a.date) - new Date(b.date));

        const usedCompletions = new Set();
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        rawScheduled.forEach(sch => {
            const schDate = new Date(sch.date);
            const candidates = rawCompleted.filter(comp => 
                String(comp.employee_id) === String(sch.employee_id) &&
                String(comp.evaluation_id) === String(sch.evaluation_id) &&
                !usedCompletions.has(comp.id)
            );

            let bestMatch = null;
            let minDiff = Infinity;

            candidates.forEach(comp => {
                const compDate = new Date(comp.date);
                const diff = Math.abs(compDate - schDate);
                if (diff < minDiff) { minDiff = diff; bestMatch = comp; }
            });

            if (bestMatch) {
                sch.isFulfilled = true;
                sch.statusLabel = "✅ Plan Cumplido";
                sch.isFuture = false;
                usedCompletions.add(bestMatch.id);
            } else {
                sch.isFulfilled = false;
                const isFuture = sch.date > todayStr;
                if (isFuture) { sch.isFuture = true; sch.statusLabel = "📅 Futuro"; }
                else { sch.isFuture = false; sch.statusLabel = "⚠️ Vencida"; sch.isOverdue = true; }
            }
        });

        events = [...rawCompleted, ...rawScheduled];
        events.sort((a,b) => new Date(a.date) - new Date(b.date));
        window.calendarCache[cacheKey] = events;
        return events;
    } catch (e) {
        console.error("⚠️ Error calendario:", e);
        return [];
    }
};

window.getEventsForMonth = (allEvents, year, month) => {
    const mStr = String(month + 1).padStart(2, '0');
    return allEvents.filter(e => e.date && e.date.startsWith(`${year}-${mStr}`));
};

// --- 2. NAVEGACIÓN Y ACCIÓN DIRECTA ---

window.navegarAEvento = async (evId, type, evalId, empId, title, mode = 'self') => {
    const modalDetalle = document.getElementById('modal-cal-detalle');
    if(modalDetalle) modalDetalle.style.display = 'none';

    window.returnToCalendar = true;

    const calContainer = document.getElementById('container-calendario');
    if(calContainer) calContainer.style.display = 'none';
    const evalContainer = document.getElementById('container-evaluaciones');
    if(evalContainer) evalContainer.style.display = 'block';

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    // A) VER RESULTADO
    if (type === 'completed') {
        document.body.style.cursor = 'wait';
        try {
            const { data, error } = await sb.from('evaluation_responses').select('*').eq('id', evId).single();
            document.body.style.cursor = 'default';
            if (error || !data) throw new Error("Datos no encontrados.");
            
            if (window.verDetalleRespuesta) window.verDetalleRespuesta(data);
            else { alert("Visor no cargado."); if(calContainer) calContainer.style.display='block'; }
        } catch (e) {
            document.body.style.cursor = 'default';
            alert("Error: " + e.message);
            if(calContainer) calContainer.style.display = 'block';
        }
        return;
    }

    // B) RESPONDER
    if (type === 'scheduled') {
        if (String(empId) !== String(user.id)) {
            const empData = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(empId)) : null;
            window.targetUserForEval = empData || { id: empId, name: "Colaborador" };
        } else {
            window.targetUserForEval = null; 
        }

        if (window.responderDirecto) window.responderDirecto(evalId, title, mode);
        else {
            alert("Formulario no disponible.");
            if(calContainer) calContainer.style.display = 'block';
        }
    }
};

// --- 3. OVERRIDES ---

if (!window.originalCargarVistaEvaluaciones) window.originalCargarVistaEvaluaciones = window.cargarVistaEvaluaciones;
window.cargarVistaEvaluaciones = () => {
    if (window.returnToCalendar) {
        ['container-evaluaciones', 'container-evaluaciones-historial', 'modal-responder-eval'].forEach(id => {
            const el = document.getElementById(id); if(el) el.style.display = 'none';
        });
        const cal = document.getElementById('container-calendario');
        if(cal) cal.style.display = 'block';
        window.returnToCalendar = false;
        document.body.style.overflow = '';
    } else {
        if(window.originalCargarVistaEvaluaciones) window.originalCargarVistaEvaluaciones();
    }
};

if (!window.originalCancelarRespuesta) window.originalCancelarRespuesta = window.cancelarRespuesta;
window.cancelarRespuesta = (mode) => {
    if (window.returnToCalendar && mode !== 'none') window.cargarVistaEvaluaciones();
    else if(window.originalCancelarRespuesta) window.originalCancelarRespuesta(mode);
};

// --- 4. RENDERIZADORES ---

window.renderizarStatsAnuales = (events, year) => {
    const container = document.getElementById('cal-stats-bar');
    if (!container) return;

    const scheduledTotal = events.filter(e => e.type === 'scheduled');
    const requiredToDate = scheduledTotal.filter(e => !e.isFuture || e.isFulfilled);
    const fulfilledToDate = requiredToDate.filter(e => e.isFulfilled);
    const futurePending = scheduledTotal.filter(e => e.isFuture && !e.isFulfilled).length;
    
    const countTotal = requiredToDate.length;
    const countFulfilled = fulfilledToDate.length;
    
    let perc = 0;
    if (countTotal > 0) perc = Math.round((countFulfilled / countTotal) * 100);
    if (countTotal === 0 && futurePending > 0) perc = 100;

    let barColor = '#ef4444';
    if (perc >= 50) barColor = '#f59e0b';
    if (perc >= 80) barColor = '#10b981';

    container.innerHTML = `
        <div style="background:white; border-radius:12px; padding:15px; box-shadow:0 2px 4px rgba(0,0,0,0.05); margin-bottom:20px; border:1px solid #e2e8f0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-weight:bold; color:#1e293b; font-size:0.95rem;">Cumplimiento a la Fecha</div>
                <div style="font-weight:bold; color:${barColor}; font-size:1.1rem;">${perc}%</div>
            </div>
            <div style="background:#f1f5f9; height:10px; border-radius:5px; width:100%; overflow:hidden; margin-bottom:12px;">
                <div style="background:${barColor}; height:100%; width:${perc}%; transition: width 0.5s ease;"></div>
            </div>
            <div style="display:flex; gap:20px; font-size:0.85rem; color:#64748b; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:8px; height:8px; border-radius:50%; background:#10b981;"></div>Logradas: <b>${countFulfilled}</b>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <div style="width:8px; height:8px; border-radius:50%; background:#ef4444;"></div>Vencidas: <b>${countTotal - countFulfilled}</b>
                </div>
                 <div style="display:flex; align-items:center; gap:6px; margin-left:auto; border-left:1px solid #cbd5e1; padding-left:15px;">
                    <div style="width:8px; height:8px; border-radius:50%; background:#94a3b8;"></div>Futuras: <b>${futurePending}</b>
                </div>
            </div>
        </div>
    `;
};

window.renderCalendarGrid = (containerId, year, month, events, isWidget = false) => {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';
    
    const headerStyle = `text-align:center; font-size:${isWidget ? '0.65rem' : '0.75rem'}; font-weight:bold; color:#94a3b8; margin-bottom:2px;`;
    CAL_WEEKDAYS.forEach(day => { grid.insertAdjacentHTML('beforeend', `<div style="${headerStyle}">${day}</div>`); });

    const firstDayIndex = new Date(year, month, 1).getDay();
    for(let i=0; i < firstDayIndex; i++) { grid.insertAdjacentHTML('beforeend', `<div></div>`); }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.date === dateStr);
        const isToday = (dateStr === todayStr);
        const hasEvents = dayEvents.length > 0;

        let dotsHtml = '';
        if (hasEvents) {
            dotsHtml = `<div style="display:flex; gap:2px; justify-content:center; margin-top:2px;">`;
            dayEvents.slice(0, 4).forEach((ev) => {
                let dotColor = '#94a3b8';
                if (ev.type === 'completed') dotColor = '#3b82f6';
                else if (ev.type === 'scheduled') {
                    if (ev.isFulfilled) dotColor = '#10b981';
                    else if (ev.isOverdue) dotColor = '#ef4444';
                    else if (ev.isFuture) dotColor = '#cbd5e1';
                    else dotColor = '#a855f7';
                }
                dotsHtml += `<div style="width:4px; height:4px; border-radius:50%; background:${dotColor};"></div>`;
            });
            dotsHtml += `</div>`;
        }

        const cellSize = isWidget ? '38px' : '42px';
        let bg = isToday ? '#eff6ff' : (hasEvents ? '#ffffff' : 'transparent');
        let border = isToday ? '1px solid #3b82f6' : (hasEvents ? '1px solid #cbd5e1' : '1px solid transparent');
        
        const html = `
        <div onclick='window.abrirDetalleDia("${dateStr}")' style="height: ${cellSize}; display: flex; flex-direction: column; align-items: center; justify-content: center; background: ${bg}; border: ${border}; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='${isToday ? '#dbeafe' : '#f1f5f9'}'" onmouseout="this.style.background='${bg}'">
            <span style="font-size:0.8rem; color:${isToday ? '#1e40af' : '#334155'}; font-weight:${(isToday || hasEvents) ? 'bold' : 'normal'};">${day}</span>
            ${dotsHtml}
        </div>`;
        grid.insertAdjacentHTML('beforeend', html);
    }
};

window.renderCalendarList = (containerId, year, allEvents) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (allEvents.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#94a3b8;"><div style="font-size:2rem; margin-bottom:10px;">📭</div>No hay evaluaciones registradas para el año ${year}.</div>`;
        return;
    }

    let html = '<div style="max-width: 1100px; margin: 0 auto;">';
    html += `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px; padding:0 10px; position:sticky; top:130px; z-index:10; background:#f8fafc; padding-bottom:10px;">
            <div style="background:white; padding:10px; border-radius:10px; text-align:center; font-weight:800; color:#7e22ce; border-bottom:3px solid #d8b4fe; box-shadow:0 2px 4px rgba(0,0,0,0.03);">📅 PLANIFICADO</div>
            <div style="background:white; padding:10px; border-radius:10px; text-align:center; font-weight:800; color:#059669; border-bottom:3px solid #6ee7b7; box-shadow:0 2px 4px rgba(0,0,0,0.03);">✅ REALIZADO</div>
        </div>
    `;

    for (let m = 0; m < 12; m++) {
        const monthEvents = window.getEventsForMonth(allEvents, year, m);
        if (monthEvents.length > 0) {
            html += `<h3 style="color:#334155; font-size:0.95rem; margin: 30px 0 15px 0; border-bottom:1px solid #cbd5e1; padding-bottom:5px; text-transform:uppercase; letter-spacing:1px;">${CAL_MONTH_NAMES[m]}</h3>`;
            html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">`;

            const scheduled = monthEvents.filter(e => e.type === 'scheduled');
            const completed = monthEvents.filter(e => e.type === 'completed');

            html += `<div style="background:white; border-radius:12px; padding:10px; border:1px solid #f1f5f9;">`;
            if(scheduled.length === 0) html += `<div style="text-align:center; padding:15px; font-size:0.8rem; color:#cbd5e1; font-style:italic;">Sin planificación</div>`;
            else {
                scheduled.forEach(ev => {
                    const [y, mStr, d] = ev.date.split('-');
                    let barColor = '#a855f7'; if(ev.isFulfilled) barColor='#10b981'; else if(ev.isOverdue) barColor='#ef4444'; else if(ev.isFuture) barColor='#cbd5e1';
                    const safeTitle = ev.originalTitle.replace(/'/g, "\\'");
                    
                    html += `<div onclick="window.navegarAEvento('${ev.id}', 'scheduled', '${ev.evaluation_id}', '${ev.employee_id}', '${safeTitle}', '${ev.mode}')" style="background:#faf5ff; margin-bottom:8px; padding:10px; border-radius:8px; border-left:4px solid ${barColor}; cursor:pointer; font-size:0.9rem;">
                        <div style="font-size:0.75rem; color:#64748b; margin-bottom:2px; font-weight:600;">👤 ${ev.empName}</div>
                        <div style="font-weight:bold; color:#334155;">${d} - ${ev.originalTitle}</div>
                        <div style="font-size:0.75rem; color:#64748b;">${ev.statusLabel}</div>
                    </div>`;
                });
            }
            html += `</div>`;

            html += `<div style="background:white; border-radius:12px; padding:10px; border:1px solid #f1f5f9;">`;
            if(completed.length === 0) html += `<div style="text-align:center; padding:15px; font-size:0.8rem; color:#cbd5e1; font-style:italic;">Sin ejecuciones</div>`;
            else {
                completed.forEach(ev => {
                    const [y, mStr, d] = ev.date.split('-');
                    const safeTitle = ev.originalTitle.replace(/'/g, "\\'");
                    html += `<div onclick="window.navegarAEvento('${ev.id}', 'completed', '${ev.evaluation_id}', '${ev.employee_id}', '${safeTitle}', '${ev.mode}')" style="background:#ecfdf5; margin-bottom:8px; padding:10px; border-radius:8px; border-left:4px solid #10b981; cursor:pointer; font-size:0.9rem;">
                        <div style="font-size:0.75rem; color:#065f46; margin-bottom:2px; font-weight:600;">👤 ${ev.empName}</div>
                        <div style="font-weight:bold; color:#064e3b;">${d} - ${ev.originalTitle}</div>
                        <div style="font-size:0.75rem; color:#34d399;">Completado</div>
                    </div>`;
                });
            }
            html += `</div></div>`;
        }
    }
    html += '</div>';
    container.innerHTML = html;
};

// --- 5. DETALLES Y MODALES ---

window.crearModalDetalleHtml = () => `
    <div id="modal-cal-detalle" style="display:none; position:fixed; z-index:3000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter:blur(3px); align-items:center; justify-content:center;">
        <div style="background:white; width:90%; max-width:400px; border-radius:16px; padding:20px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.1); animation: scaleUp 0.2s;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
                <h3 id="modal-cal-title" style="margin:0; color:#1e293b; font-size:1.1rem;">Detalle</h3>
                <button onclick="document.getElementById('modal-cal-detalle').style.display='none'" style="border:none; background:#f1f5f9; width:30px; height:30px; border-radius:50%; cursor:pointer; color:#64748b;">✕</button>
            </div>
            <div id="modal-cal-content" style="max-height:60vh; overflow-y:auto;"></div>
        </div>
    </div>`;

window.abrirDetalleDia = (dateStr) => {
    if (window.moveEventState) { window.ejecutarMovimientoEvento(dateStr); return; }
    if(!document.getElementById('modal-cal-detalle')) document.body.insertAdjacentHTML('beforeend', window.crearModalDetalleHtml());
    
    const [y, m, d] = dateStr.split('-');
    const cacheKey = `year-${parseInt(y)}`;
    const allEvents = window.calendarCache[cacheKey] || [];
    const dayEvents = allEvents.filter(e => e.date === dateStr);
    
    const modal = document.getElementById('modal-cal-detalle');
    const content = document.getElementById('modal-cal-content');
    const dateObj = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    document.getElementById('modal-cal-title').innerText = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    content.innerHTML = '';

    const isAdmin = window.modoAdminActivo;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));

    if (dayEvents.length === 0) content.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px; font-style:italic;">Nada programado.</div>';
    else {
        dayEvents.forEach(ev => {
            const safeTitle = ev.originalTitle.replace(/'/g, "\\'");
            let borderColor = '#94a3b8'; let bgColor = '#f8fafc'; let icon = '📝'; let actionBtnHtml = '';

            if (ev.type === 'completed') {
                borderColor = '#3b82f6'; bgColor = '#eff6ff'; icon = '✅';
                actionBtnHtml = `<button onclick="window.navegarAEvento('${ev.id}', 'completed', '${ev.evaluation_id}', '${ev.employee_id}', '${safeTitle}', '${ev.mode}')" style="margin-top:8px; width:100%; background:#3b82f6; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:0.85rem;">📊 Ver Resultado Detallado</button>`;
            } else if (ev.type === 'scheduled') {
                if (ev.isFulfilled) {
                    borderColor = '#10b981'; bgColor = '#ecfdf5'; icon = '✅';
                    actionBtnHtml = `<div style="margin-top:5px; font-size:0.75rem; color:#059669; font-weight:bold;">¡Ya realizada!</div>`;
                } else {
                    const isOverdue = ev.isOverdue;
                    borderColor = isOverdue ? '#ef4444' : '#a855f7'; 
                    bgColor = isOverdue ? '#fef2f2' : '#faf5ff';
                    icon = isOverdue ? '⚠️' : '📅';
                    actionBtnHtml = `<button onclick="window.navegarAEvento('${ev.id}', 'scheduled', '${ev.evaluation_id}', '${ev.employee_id}', '${safeTitle}', '${ev.mode}')" style="margin-top:8px; width:100%; background:${isOverdue?'#ef4444':'#a855f7'}; color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:bold; font-size:0.85rem;">✍️ Responder Ahora</button>`;
                }
            }

            let adminBtns = '';
            let isDirectSub = false;
            if (window.todosLosEmpleadosData && ev.employee_id) {
                const sub = window.todosLosEmpleadosData.find(e => String(e.id) === String(ev.employee_id));
                if(sub && String(sub.supId) === String(user.id)) isDirectSub = true;
            }
            if (isAdmin || ev.isMe || isDirectSub) {
                 if(isAdmin) adminBtns += `<button onclick="event.stopPropagation(); window.iniciarMovimientoEvento('${ev.id}', '${ev.type}', '${safeTitle}')" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; margin-right:5px;">✏️</button>`;
                 adminBtns += `<button onclick="event.stopPropagation(); window.borrarEventoGenerico('${ev.id}', '${ev.type}')" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; color:#ef4444;">🗑️</button>`;
            }

            const div = document.createElement('div');
            div.style.cssText = `padding: 12px; border-left: 4px solid ${borderColor}; background: ${bgColor}; margin-bottom: 10px; border-radius: 8px; position:relative;`;
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        ${ev.isMe ? '' : `<div style="font-size:0.75rem; color:#64748b;">👤 ${ev.empName}</div>`}
                        <div style="font-weight:bold; color:#334155; font-size:0.9rem;">${icon} ${ev.title}</div>
                        <div style="font-size:0.8rem; color:#64748b;">${ev.statusLabel}</div>
                    </div>
                    <div>${adminBtns}</div>
                </div>
                ${ev.notes ? `<div style="font-size:0.75rem; color:#7e22ce; margin-top:4px;">Nota: ${ev.notes}</div>` : ''}
                ${actionBtnHtml}
            `;
            content.appendChild(div);
        });
    }

    const btnAdd = document.createElement('button');
    btnAdd.innerText = "+ Programar Evaluación";
    btnAdd.style.cssText = "width:100%; padding:12px; margin-top:10px; background:#f1f5f9; color:#475569; border:1px dashed #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold;";
    btnAdd.onclick = () => window.abrirModalProgramar(dateStr);
    content.appendChild(btnAdd);
    modal.style.display = 'flex';
};

// --- 6. GESTIÓN LOCAL (OPTIMISTA) ---

window.iniciarMovimientoEvento = (id, type, title) => {
    document.getElementById('modal-cal-detalle').style.display = 'none';
    window.moveEventState = { id, type, title };
    const banner = document.getElementById('cal-move-banner');
    const txt = document.getElementById('cal-move-text');
    if (banner && txt) { txt.innerHTML = `Moviendo <b>"${title}"</b>. Haz clic en la nueva fecha.`; banner.style.display = 'block'; }
    const container = document.getElementById('container-calendario');
    if(container) container.scrollTo({top: 0, behavior: 'smooth'});
};

window.cancelarMovimiento = () => {
    window.moveEventState = null;
    document.getElementById('cal-move-banner').style.display = 'none';
};

window.ejecutarMovimientoEvento = async (newDate) => {
    const { id, type, title } = window.moveEventState;
    if (!confirm(`¿Mover "${title}" al día ${newDate}?`)) return;
    try {
        let error = null;
        if (type === 'scheduled') {
            const res = await sb.from('scheduled_evaluations').update({ scheduled_date: newDate }).eq('id', id); error = res.error;
        } else {
            const isoDate = `${newDate}T12:00:00`;
            const res = await sb.from('evaluation_responses').update({ submitted_at: isoDate }).eq('id', id); error = res.error;
        }
        if (error) throw error;
        
        // UPDATE LOCAL
        const year = window.calendarDate.getFullYear();
        const k = `year-${year}`;
        if(window.calendarCache[k]) {
            const ev = window.calendarCache[k].find(e => e.id == id);
            if(ev) ev.date = newDate;
        }
        
        window.cancelarMovimiento(); 
        window.renderizarAnioFull(); // Repintado instantáneo
    } catch (e) { alert("Error al mover: " + e.message); window.cancelarMovimiento(); }
};

window.borrarEventoGenerico = async (id, type) => {
    if(!confirm(type === 'completed' ? "⚠️ ¿Eliminar historial permanente?" : "¿Cancelar programación?")) return;
    try {
        const table = type === 'scheduled' ? 'scheduled_evaluations' : 'evaluation_responses';
        const { error } = await sb.from(table).delete().eq('id', id);
        if(error) throw error;

        // DELETE LOCAL
        const year = window.calendarDate.getFullYear();
        const k = `year-${year}`;
        if(window.calendarCache[k]) {
            window.calendarCache[k] = window.calendarCache[k].filter(e => e.id !== id);
        }

        window.renderizarAnioFull(); // Repintado instantáneo
        document.getElementById('modal-cal-detalle').style.display='none';
    } catch (e) { alert("Error al eliminar: " + e.message); }
};

window.abrirModalProgramar = async (dateStr) => {
    document.getElementById('modal-cal-detalle').style.display = 'none';
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));

    let empleados = [];
    if(window.modoAdminActivo) empleados = window.todosLosEmpleadosData;
    else {
        empleados = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
        const me = window.todosLosEmpleadosData.find(e => String(e.id) === String(user.id));
        if(me && !empleados.find(e => String(e.id) === String(me.id))) empleados.unshift(me);
    }
    
    const { data: evals } = await sb.from('evaluations').select('id, title').eq('active', true).order('title');

    const div = document.createElement('div');
    div.id = 'modal-programar-form';
    div.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter:blur(3px); z-index:3500; display:flex; align-items:center; justify-content:center;";
    
    let empCheckboxes = empleados.length > 0 ? empleados.map(e => `
        <label style="display:flex; align-items:center; gap:8px; padding:8px; border-bottom:1px solid #f1f5f9; cursor:pointer;">
            <input type="checkbox" class="prog-emp-checkbox" value="${e.id}" style="width:16px; height:16px;">
            <span style="font-size:0.9rem; color:#334155;">${e.name}</span>
        </label>`).join('') : '<div style="padding:10px; color:#94a3b8;">No hay empleados.</div>';

    let evalOptions = evals ? evals.map(e => `<option value="${e.id}">${e.title}</option>`).join('') : '<option value="">Sin evaluaciones</option>';

    div.innerHTML = `
        <div style="background:white; width:90%; max-width:400px; padding:25px; border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.2); animation: scaleUp 0.2s; display:flex; flex-direction:column; max-height:85vh;">
            <h3 style="margin:0 0 15px 0; color:#1e293b;">📅 Programar Evaluación</h3>
            <div style="border:1px solid #cbd5e1; border-radius:8px; margin-bottom:15px; background:#f8fafc; overflow:hidden;">
                <div style="padding:8px; background:#eff6ff; border-bottom:1px solid #bfdbfe;"><label style="font-weight:bold; color:#1e40af; font-size:0.85rem;"><input type="checkbox" onchange="document.querySelectorAll('.prog-emp-checkbox').forEach(c=>c.checked=this.checked)"> Todos</label></div>
                <div style="max-height:150px; overflow-y:auto; background:white;">${empCheckboxes}</div>
            </div>
            <select id="prog-eval-id" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:15px;">${evalOptions}</select>
            <input type="date" id="prog-date" value="${dateStr}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:15px;">
            <input type="text" id="prog-notes" placeholder="Nota (Opcional)" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:20px;">
            <div style="display:flex; gap:10px; margin-top:auto;">
                <button onclick="document.getElementById('modal-programar-form').remove()" style="flex:1; padding:10px; border:none; background:#f1f5f9; color:#475569; border-radius:8px; cursor:pointer;">Cancelar</button>
                <button id="btn-save-prog" onclick="window.guardarProgramacionCompleta()" style="flex:1; padding:10px; border:none; background:#a855f7; color:white; border-radius:8px; cursor:pointer;">Guardar</button>
            </div>
        </div>`;
    document.body.appendChild(div);
};

window.guardarProgramacionCompleta = async () => {
    const selectedIds = Array.from(document.querySelectorAll('.prog-emp-checkbox:checked')).map(cb => cb.value);
    const evalId = document.getElementById('prog-eval-id').value;
    const date = document.getElementById('prog-date').value;
    const notes = document.getElementById('prog-notes').value;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));

    if(selectedIds.length === 0 || !evalId || !date) return alert("Faltan datos.");
    const btn = document.getElementById('btn-save-prog'); btn.disabled=true; btn.innerText="Guardando...";

    try {
        const rows = selectedIds.map(empId => ({ evaluation_id: evalId, employee_id: String(empId), creator_id: String(user.id), scheduled_date: date, status: 'pending', notes: notes }));
        const { error } = await sb.from('scheduled_evaluations').insert(rows);
        if(error) throw error;
        document.getElementById('modal-programar-form').remove(); alert("✅ Guardado.");
        window.calendarCache = {}; window.renderizarAnioFull();
    } catch (e) { alert("Error: " + e.message); btn.disabled=false; btn.innerText="Guardar"; }
};

// --- 8. WIDGET Y DASHBOARD ---
window.cargarWidgetCalendario = async () => {
    const container = document.getElementById('dashboard-calendar-widget');
    if (!container) return;
    container.style.display = 'block';
    const now = new Date();
    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="background:#eff6ff; color:#3b82f6; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.1rem;">${now.getDate()}</div>
                <div><div style="font-weight:bold; color:#1e293b; font-size:0.95rem;">${CAL_MONTH_NAMES[now.getMonth()]}</div><div style="font-size:0.75rem; color:#64748b;">Agenda</div></div>
            </div>
            <button onclick="window.cargarVistaCalendario()" style="border:none; background:#f0f9ff; color:#0284c7; padding:6px 12px; border-radius:20px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Ver Año ➝</button>
        </div>
        <div id="widget-cal-grid" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;"><div class="spinner" style="grid-column:1/-1; margin:15px auto;"></div></div>
    `;
    const events = await window.fetchAnnualEvents(now.getFullYear());
    const monthEvents = window.getEventsForMonth(events, now.getFullYear(), now.getMonth());
    window.renderCalendarGrid('widget-cal-grid', now.getFullYear(), now.getMonth(), monthEvents, true);
};

window.toggleCalendarView = (mode) => {
    window.calViewMode = mode;
    const btnGrid = document.getElementById('btn-view-grid');
    const btnList = document.getElementById('btn-view-list');
    if(btnGrid) btnGrid.style.cssText = `border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.85rem; transition:all 0.2s; ${mode==='grid'?'background:white; color:#0f172a; box-shadow:0 1px 3px rgba(0,0,0,0.1);':'background:transparent; color:#64748b;'}`;
    if(btnList) btnList.style.cssText = `border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600; font-size:0.85rem; transition:all 0.2s; ${mode==='list'?'background:white; color:#0f172a; box-shadow:0 1px 3px rgba(0,0,0,0.1);':'background:transparent; color:#64748b;'}`;
    window.renderizarAnioFull();
};

window.cargarVistaCalendario = async () => {
    ['init-load-container','global-stats','container-incidentes','container-evaluaciones','container-evaluaciones-historial','search-bar-container','admin-toolbar','quick-team-view','container-estructura','container-ultimos-incidentes','main-user-header','dashboard-calendar-widget','btn-logout'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none'});
    let container = document.getElementById('container-calendario');
    if (!container) { container = document.createElement('div'); container.id = 'container-calendario'; document.body.appendChild(container); }
    Object.assign(container.style, { display: 'block', position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: '#f8fafc', zIndex: '1500', overflowY: 'auto' });

    container.innerHTML = `
        <div style="max-width: 1200px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column;">
            <div style="padding: 15px 20px; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 20; border-bottom: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                <div style="display:flex; align-items:center; gap:15px;">
                    <button onclick="window.mostrarDashboard(JSON.parse(localStorage.getItem('usuarioLogueado')))" style="background:transparent; border:1px solid #e2e8f0; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b;">⬅</button>
                    <h2 style="color:#0f172a; margin:0; font-size:1.2rem;">Calendario</h2>
                </div>
                <div style="background:#f1f5f9; padding:4px; border-radius:10px; display:flex;">
                    <button id="btn-view-grid" onclick="window.toggleCalendarView('grid')">📅 Cuadrícula</button>
                    <button id="btn-view-list" onclick="window.toggleCalendarView('list')">☰ Lista</button>
                </div>
                <div style="display:flex; gap:10px; align-items:center; background:#f1f5f9; padding:4px 8px; border-radius:12px;">
                    <button onclick="window.cambiarAnio(-1)" style="border:none; background:white; width:32px; height:32px; border-radius:8px; cursor:pointer;">‹</button>
                    <span id="cal-year-label" style="font-weight:800; min-width:60px; text-align:center;">${window.calendarDate.getFullYear()}</span>
                    <button onclick="window.cambiarAnio(1)" style="border:none; background:white; width:32px; height:32px; border-radius:8px; cursor:pointer;">›</button>
                </div>
            </div>
            <div id="cal-move-banner" style="display:none; background:#f59e0b; color:white; padding:15px; text-align:center; position:sticky; top:70px; z-index:25; border-radius:12px; margin:20px;">
                <span id="cal-move-text" style="font-weight:bold; margin-right:15px;"></span><button onclick="window.cancelarMovimiento()" style="background:white; color:#f59e0b; border:none; padding:5px 15px; border-radius:20px;">Cancelar</button>
            </div>
            <div style="padding: 20px;">
                <div id="cal-stats-bar"></div>
                <div id="full-year-content" style="padding-bottom:40px;"></div>
            </div>
        </div>
        ${!document.getElementById('modal-cal-detalle') ? window.crearModalDetalleHtml() : ''}
    `;
    window.toggleCalendarView(window.calViewMode);
};

window.renderizarAnioFull = async () => {
    const year = window.calendarDate.getFullYear();
    document.getElementById('cal-year-label').innerText = year;
    const container = document.getElementById('full-year-content');
    container.innerHTML = '<div class="spinner" style="margin:50px auto;"></div>';
    
    const allEvents = await window.fetchAnnualEvents(year);
    window.renderizarStatsAnuales(allEvents, year);
    container.innerHTML = '';

    if (window.calViewMode === 'grid') {
        container.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; padding-bottom:40px;";
        for(let m=0; m<12; m++) {
            container.insertAdjacentHTML('beforeend', `<div style="background:white; border-radius:16px; border:1px solid #e2e8f0; padding:15px;"><h3 style="margin:0 0 10px 0; text-align:center;">${CAL_MONTH_NAMES[m]}</h3><div id="month-grid-${m}" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;"></div></div>`);
            window.renderCalendarGrid(`month-grid-${m}`, year, m, window.getEventsForMonth(allEvents, year, m), false);
        }
    } else {
        container.style.display = 'block';
        window.renderCalendarList('full-year-content', year, allEvents);
    }
};

window.cambiarAnio = async (d) => { window.calendarDate.setFullYear(window.calendarDate.getFullYear() + d); await window.renderizarAnioFull(); };

if (!window.originalMostrarDashboardCal) window.originalMostrarDashboardCal = window.mostrarDashboard;
window.mostrarDashboard = async (user) => {
    const calContainer = document.getElementById('container-calendario');
    if (calContainer) calContainer.style.display = 'none';
    const btnLogout = document.getElementById('btn-logout'); if (btnLogout) btnLogout.style.display = '';
    if (window.originalMostrarDashboardCal) await window.originalMostrarDashboardCal(user);
    setTimeout(() => { window.cargarWidgetCalendario(); }, 150);
};