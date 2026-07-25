// =========================================================
// 9-estadisticas.js (MÓDULO DE ESTADÍSTICAS - MODO SQL)
// VERSIÓN: 1.1 - EXCLUSIÓN DE MANAGERS
// =========================================================

window.calcularAvanceGlobal = async function(usarCache = false) {
    const statsContainer = document.getElementById('global-stats');
    if(statsContainer) {
        statsContainer.classList.remove('hidden');
        statsContainer.style.display = 'block';
    }

    const container = document.getElementById('dept-stats-container');
    const globalFill = document.getElementById('global-fill');
    const globalText = document.getElementById('global-text');
    
    let filtroRaw = document.getElementById('stats-filter-type') ? document.getElementById('stats-filter-type').value : "Difusión";
    const filtroTipo = filtroRaw === "" ? null : filtroRaw;

    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">🔄 Consultando reporte optimizado...</div>';

    if(!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        await window.cargarDatosEmpleados();
    }
    
    // Llamada al RPC de Supabase para obtener conteos base
    const { data: statsData, error } = await sb.rpc('obtener_estadisticas_empleados', { tipo_filtro: filtroTipo });

    if(error) {
        console.error("❌ ERROR SQL STATS:", error);
        container.innerHTML = `<div style='text-align:center; color:#ef4444; padding:20px; border:1px solid #fecaca; background:#fef2f2; border-radius:8px;'><strong>Error de Base de Datos:</strong><br>${error.message}</div>`;
        return;
    }

    if (!statsData || statsData.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:20px; color:#64748b;'>No hay datos para mostrar con este filtro.</div>";
        globalFill.style.width = "0%";
        globalText.innerText = "0%";
        return;
    }

    window.statsCacheRaw = statsData;

    let totalEsperadoGlobal = 0, totalFirmadoGlobal = 0;
    const deptMap = {};

    // --- CONFIGURACIÓN DE EXCLUSIÓN ---
    const puestosExentos = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"];

    statsData.forEach(stat => {
        const emp = window.todosLosEmpleadosData.find(e => String(e.id) === String(stat.emp_id));
        if (!emp) return;

        // Validar si el puesto debe ser ignorado en la estadística
        const puestoNorm = (emp.puesto || "").trim().toUpperCase();
        if (puestosExentos.includes(puestoNorm)) return;

        const depto = emp.dept || "Sin Depto";
        if(!deptMap[depto]) deptMap[depto] = { total: 0, firmados: 0 };
        
        deptMap[depto].total += stat.total_esperado;
        deptMap[depto].firmados += stat.total_firmado;
        totalEsperadoGlobal += stat.total_esperado;
        totalFirmadoGlobal += stat.total_firmado;
    });

    const pctGlobal = totalEsperadoGlobal > 0 ? Math.round((totalFirmadoGlobal / totalEsperadoGlobal) * 100) : 0;
    globalFill.style.width = `${pctGlobal}%`;
    globalFill.style.background = pctGlobal > 80 ? '#22c55e' : (pctGlobal > 50 ? '#f59e0b' : '#ef4444');
    globalText.innerText = `${pctGlobal}% (${totalFirmadoGlobal}/${totalEsperadoGlobal})`;

    container.innerHTML = '';
    container.appendChild(crearTablaDesglose("📂 Selecciona un Departamento", deptMap, 'verSupervisoresPorDepto'));

    document.getElementById('stats-nav-header').style.display = 'none';
    document.getElementById('btn-stats-back').onclick = () => {
        // En lugar de recargar el dashboard, solo ocultamos el detalle y volvemos a la vista general de áreas
        window.calcularAvanceGlobal(true);
    };
};

window.verSupervisoresPorDepto = (deptName) => {
    window.currentStatsDept = deptName;
    const container = document.getElementById('dept-stats-container');
    const navHeader = document.getElementById('stats-nav-header');
    const navTitle = document.getElementById('stats-nav-title');
    navHeader.style.display = 'flex';
    navTitle.innerText = ` / ${deptName}`;
    
    const rawData = window.statsCacheRaw;
    const supMap = {};
    const puestosExentos = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"];

    rawData.forEach(stat => {
        const emp = window.todosLosEmpleadosData.find(e => String(e.id) === String(stat.emp_id));
        if (!emp || emp.dept !== deptName) return;

        // Filtrar exentos en la vista de supervisores
        const puestoNorm = (emp.puesto || "").trim().toUpperCase();
        if (puestosExentos.includes(puestoNorm)) return;

        const sup = emp.sup || "Sin Supervisor";
        if(!supMap[sup]) supMap[sup] = { total: 0, firmados: 0 };
        supMap[sup].total += stat.total_esperado;
        supMap[sup].firmados += stat.total_firmado;
    });

    container.innerHTML = '';
    container.appendChild(crearTablaDesglose(`👤 Supervisores de ${deptName}`, supMap, 'verDetalleSupervisorStats'));
    document.getElementById('btn-stats-back').onclick = () => window.calcularAvanceGlobal(true);
};

window.verDetalleSupervisorStats = (supName) => {
    const container = document.getElementById('dept-stats-container');
    const navTitle = document.getElementById('stats-nav-title');
    navTitle.innerText = ` / ${window.currentStatsDept} / ${supName}`;
    
    const rawData = window.statsCacheRaw;
    const empList = [];
    const puestosExentos = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"];

    rawData.forEach(stat => {
        const emp = window.todosLosEmpleadosData.find(e => String(e.id) === String(stat.emp_id));
        if (!emp || emp.sup !== supName || emp.dept !== window.currentStatsDept) return;

        // Filtrar exentos en el listado final de empleados
        const puestoNorm = (emp.puesto || "").trim().toUpperCase();
        if (puestosExentos.includes(puestoNorm)) return;

        const pct = stat.total_esperado > 0 ? Math.round((stat.total_firmado / stat.total_esperado) * 100) : 0;
        empList.push({ name: emp.name, puesto: emp.puesto, pct: pct, firmados: stat.total_firmado, total: stat.total_esperado });
    });

    empList.sort((a,b) => a.pct - b.pct);

    let html = '';
    empList.forEach(emp => {
        if(emp.total === 0) return;
        const color = emp.pct > 80 ? '#22c55e' : (emp.pct > 50 ? '#f59e0b' : '#ef4444');
        html += `
        <div style="background:white; border-bottom:1px solid #f1f5f9; padding:12px; display:flex; justify-content:space-between; align-items:center;">
            <div><div style="font-weight:bold; color:#334155;">${emp.name}</div><div style="font-size:0.8rem; color:#64748b;">${emp.puesto || 'Colaborador'}</div></div>
            <div style="text-align:right;"><div style="font-size:1.1rem; font-weight:bold; color:${color}">${emp.pct}%</div><div style="font-size:0.7rem; color:#94a3b8;">${emp.firmados}/${emp.total}</div></div>
        </div>`;
    });
    container.innerHTML = html || '<div style="padding:20px; text-align:center;">Sin actividad obligatoria.</div>';
    document.getElementById('btn-stats-back').onclick = () => window.verSupervisoresPorDepto(window.currentStatsDept);
};

function crearTablaDesglose(titulo, mapData, onClickFunctionString) {
    const section = document.createElement('div');
    section.style.marginBottom = "25px";
    let html = `<h4 style="color:#475569; margin-bottom:10px; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.5px;">${titulo}</h4>`;
    const keys = Object.keys(mapData).sort((a,b) => {
        const pa = mapData[a].total > 0 ? mapData[a].firmados/mapData[a].total : 0;
        const pb = mapData[b].total > 0 ? mapData[b].firmados/mapData[b].total : 0;
        return pa - pb;
    });
    keys.forEach(k => {
        const d = mapData[k];
        if(d.total === 0) return;
        const pct = Math.round((d.firmados / d.total) * 100);
        const color = pct > 80 ? '#22c55e' : (pct > 50 ? '#f59e0b' : '#ef4444');
        const clickAttr = onClickFunctionString ? `onclick="${onClickFunctionString}('${k}')"` : '';
        const clickClass = onClickFunctionString ? 'dept-row' : 'dept-row no-click';
        html += `<div class="${clickClass}" ${clickAttr} style="cursor:pointer;"><div class="dept-header"><span>${k}</span><span style="color:${color}">${pct}%</span></div><div class="dept-track"><div class="dept-fill" style="width:${pct}%; background-color:${color}"></div></div><div style="text-align:right; font-size:0.75rem; color:#94a3b8; margin-top:2px;">${d.firmados}/${d.total} firmas</div></div>`;
    });
    section.innerHTML = html;
    return section;
}

console.log("✅ Módulo Estadísticas de Difusión cargado correctamente (Managers exentos).");
