// =========================================================
// 9-estadisticas.js (MÓDULO DE ESTADÍSTICAS - MODO SQL)
// VERSIÓN: 1.2 - DESGLOSE POR REGISTRO
// =========================================================
//
// La hoja tiene dos desgloses, que se eligen con «Desglosar por»:
//
//   Departamentos → supervisores → colaboradores
//       Suma todos los registros del filtro. Los conteos los da el reporte
//       obtener_estadisticas_empleados, que devuelve una fila por empleado.
//
//   Registro → departamentos → supervisores → colaboradores
//       Un registro cada vez. Aquí no hay reporte en la base: se traen los
//       incidentes con las firmas incrustadas (incident_signatures) y el
//       avance se calcula en el navegador, así que bajar al detalle no
//       cuesta ninguna consulta más.
//
// Quién debe firmar es la misma regla que usan los pendientes del panel, y vive
// en 1-config.js (`window.leTocaFirmar`): cuentan los empleados activos dados de
// alta en o antes de la fecha del registro, salvo los puestos exentos. Las
// capacitaciones no se firman y quedan fuera.
//
// El desglose por departamentos también la aplica aquí, en el navegador: el
// reporte devuelve una fila por empleado, así que descartar la fila descuenta
// al empleado de todos los totales sin tocar la función SQL.

// Los registros se traen de 25 en 25: la respuesta lleva las firmas dentro,
// así que una página entera de golpe sería mucha descarga en el teléfono.
const REGISTROS_POR_PAGINA = 25;

// ---------------------------------------------------------
// REINTENTOS DE LA CONSULTA
// ---------------------------------------------------------
// El primer intento de esta pantalla fallaba casi siempre: el reporte es
// pesado y, con la conexión fría, la base se pasa del tiempo de espera y
// PostgREST devuelve el error 57014 ("canceling statement due to statement
// timeout"); el segundo intento ya encuentra el plan y los datos en caché del
// servidor y responde. Como es un fallo pasajero, no tiene sentido enseñárselo
// al usuario a la primera: se reintenta un par de veces antes de rendirse.
const INTENTOS_STATS = 3;
const ESPERA_REINTENTO_MS = [800, 2000];

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Errores que no mejoran por reintentar: la función no existe, el nombre del
// parámetro no coincide o los permisos la rechazan. Ahí se muestra ya.
const esErrorDefinitivo = (error) => {
    const codigo = String((error && error.code) || '');
    if (codigo.startsWith('PGRST2')) return true;          // función/parámetro inexistente
    return ['42883', '42501', '28000', '28P01'].includes(codigo);
};

// Ejecuta una consulta (RPC o tabla) reintentando los fallos pasajeros.
async function conReintentos(operacion, avisarIntento) {
    let ultimoError = null;

    for (let intento = 1; intento <= INTENTOS_STATS; intento++) {
        if (intento > 1 && avisarIntento) avisarIntento(intento);

        let data = null, error = null;
        try {
            ({ data, error } = await operacion());
        } catch (e) {
            // Un fallo de red no llega como objeto de error, se lanza.
            error = e;
        }

        if (!error) return { data: data };

        ultimoError = error;
        console.warn(`⚠️ Estadísticas: intento ${intento} de ${INTENTOS_STATS} fallido.`, error);

        if (esErrorDefinitivo(error)) break;
        if (intento < INTENTOS_STATS) await esperar(ESPERA_REINTENTO_MS[intento - 1] || 2000);
    }

    return { error: ultimoError };
}

// ---------------------------------------------------------
// AYUDAS COMUNES
// ---------------------------------------------------------
const escaparHTML = (texto) => String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Para meter un texto dentro de onclick="fn('...')": el navegador deshace las
// entidades antes de que el JS se lea, así que una comilla hay que escaparla
// primero para JavaScript y sólo después para HTML.
const paraOnclick = (texto) => escaparHTML(String(texto === null || texto === undefined ? '' : texto)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

// Un empleado queda fuera del conteo si su puesto está exento o si está dado de
// baja: en cualquiera de los dos casos no va a firmar, y dejarlo en el
// denominador clava el registro por debajo del 100% para siempre.
const quedaFueraDelConteo = (emp) => window.esPuestoExentoDeFirmar(emp.puesto) || !window.empleadoActivo(emp);

const colorPorcentaje = (pct) => pct > 80 ? '#22c55e' : (pct > 50 ? '#f59e0b' : '#ef4444');

const vistaSeleccionada = () => {
    const sel = document.getElementById('stats-filter-vista');
    return sel ? sel.value : 'areas';
};

const pintarBarraGlobal = (firmado, esperado, etiqueta) => {
    const globalFill = document.getElementById('global-fill');
    const globalText = document.getElementById('global-text');
    const globalLabel = document.getElementById('global-label');
    const pct = esperado > 0 ? Math.round((firmado / esperado) * 100) : 0;

    if (globalFill) {
        globalFill.style.width = `${pct}%`;
        globalFill.style.background = colorPorcentaje(pct);
    }
    if (globalText) globalText.innerText = `${pct}% (${firmado}/${esperado})`;
    if (globalLabel) globalLabel.innerText = etiqueta || 'Cumplimiento Total';
};

const mostrarErrorStats = (container, error, funcionReintento) => {
    console.error("❌ ERROR SQL STATS:", error);
    const detalle = escaparHTML((error && error.message) ? error.message : String(error));
    container.innerHTML = `<div style='text-align:center; color:#ef4444; padding:20px; border:1px solid #fecaca; background:#fef2f2; border-radius:8px;'><strong>Error de Base de Datos:</strong><br>${detalle}<br><button onclick="${funcionReintento}" class="btn-back-small" style="margin-top:12px;">Reintentar</button></div>`;
};

// Cada llamada se numera: si el usuario cambia el filtro mientras una consulta
// sigue en el aire, la respuesta vieja ya no pinta nada.
const nuevaPeticion = () => {
    const peticion = (window.statsPeticionActual || 0) + 1;
    window.statsPeticionActual = peticion;
    return () => window.statsPeticionActual === peticion;
};

// ---------------------------------------------------------
// PUNTO DE ENTRADA (REPARTE SEGÚN EL DESGLOSE ELEGIDO)
// ---------------------------------------------------------
window.calcularAvanceGlobal = async function(usarCache = false) {
    const statsContainer = document.getElementById('global-stats');
    if(statsContainer) {
        statsContainer.classList.remove('hidden');
        statsContainer.style.display = 'block';
    }

    if (vistaSeleccionada() === 'registros') return window.calcularAvancePorRegistro(usarCache);
    return calcularAvancePorAreas(usarCache);
};

// ---------------------------------------------------------
// DESGLOSE POR DEPARTAMENTOS (REPORTE SQL)
// ---------------------------------------------------------
async function calcularAvancePorAreas(usarCache) {
    const container = document.getElementById('dept-stats-container');

    let filtroRaw = document.getElementById('stats-filter-type') ? document.getElementById('stats-filter-type').value : "Difusión";
    const filtroTipo = filtroRaw === "" ? null : filtroRaw;

    const vigente = nuevaPeticion();

    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">🔄 Consultando reporte optimizado...</div>';

    if(!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        await window.cargarDatosEmpleados();
        if(!vigente()) return;
    }

    let statsData;

    // Volver atrás desde el detalle no necesita otra consulta: los conteos ya
    // están en memoria mientras no cambie el filtro.
    if (usarCache && window.statsCacheRaw && window.statsCacheFiltro === filtroRaw) {
        statsData = window.statsCacheRaw;
    } else {
        // Llamada al RPC de Supabase para obtener conteos base
        const { data, error } = await conReintentos(
            () => sb.rpc('obtener_estadisticas_empleados', { tipo_filtro: filtroTipo }),
            (intento) => {
                if(!vigente()) return;
                container.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;">🔄 La base tardó en responder. Reintentando (${intento}/${INTENTOS_STATS})...</div>`;
            }
        );

        if(!vigente()) return;

        if(error) {
            mostrarErrorStats(container, error, 'window.calcularAvanceGlobal(false)');
            return;
        }

        statsData = data;
        window.statsCacheRaw = statsData;
        window.statsCacheFiltro = filtroRaw;
    }

    if (!statsData || statsData.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:20px; color:#64748b;'>No hay datos para mostrar con este filtro.</div>";
        pintarBarraGlobal(0, 0, 'Cumplimiento Total');
        return;
    }

    let totalEsperadoGlobal = 0, totalFirmadoGlobal = 0;
    const deptMap = {};

    statsData.forEach(stat => {
        const emp = window.todosLosEmpleadosData.find(e => String(e.id) === String(stat.emp_id));
        if (!emp) return;

        // Exentos y bajas no cuentan en la estadística
        if (quedaFueraDelConteo(emp)) return;

        const depto = emp.dept || "Sin Depto";
        if(!deptMap[depto]) deptMap[depto] = { total: 0, firmados: 0 };

        deptMap[depto].total += stat.total_esperado;
        deptMap[depto].firmados += stat.total_firmado;
        totalEsperadoGlobal += stat.total_esperado;
        totalFirmadoGlobal += stat.total_firmado;
    });

    pintarBarraGlobal(totalFirmadoGlobal, totalEsperadoGlobal, 'Cumplimiento Total');

    container.innerHTML = '';
    container.appendChild(crearTablaDesglose("📂 Selecciona un Departamento", deptMap, 'verSupervisoresPorDepto'));

    document.getElementById('stats-nav-header').style.display = 'none';
    document.getElementById('btn-stats-back').onclick = () => {
        // En lugar de recargar el dashboard, solo ocultamos el detalle y volvemos a la vista general de áreas
        window.calcularAvanceGlobal(true);
    };
}

window.verSupervisoresPorDepto = (deptName) => {
    window.currentStatsDept = deptName;
    const container = document.getElementById('dept-stats-container');
    const navHeader = document.getElementById('stats-nav-header');
    const navTitle = document.getElementById('stats-nav-title');
    navHeader.style.display = 'flex';
    navTitle.innerText = ` / ${deptName}`;

    const rawData = window.statsCacheRaw || [];
    const supMap = {};

    rawData.forEach(stat => {
        const emp = window.todosLosEmpleadosData.find(e => String(e.id) === String(stat.emp_id));
        if (!emp || emp.dept !== deptName) return;

        // Filtrar exentos y bajas en la vista de supervisores
        if (quedaFueraDelConteo(emp)) return;

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

    const rawData = window.statsCacheRaw || [];
    const empList = [];

    rawData.forEach(stat => {
        const emp = window.todosLosEmpleadosData.find(e => String(e.id) === String(stat.emp_id));
        if (!emp || emp.sup !== supName || emp.dept !== window.currentStatsDept) return;

        // Filtrar exentos y bajas en el listado final de empleados
        if (quedaFueraDelConteo(emp)) return;

        const pct = stat.total_esperado > 0 ? Math.round((stat.total_firmado / stat.total_esperado) * 100) : 0;
        empList.push({ name: emp.name, puesto: emp.puesto, pct: pct, firmados: stat.total_firmado, total: stat.total_esperado });
    });

    empList.sort((a,b) => a.pct - b.pct);

    let html = '';
    empList.forEach(emp => {
        if(emp.total === 0) return;
        const color = colorPorcentaje(emp.pct);
        html += `
        <div class="stats-fila-empleado">
            <div style="min-width:0;"><div class="stats-empleado-nombre">${escaparHTML(emp.name)}</div><div class="stats-empleado-puesto">${escaparHTML(emp.puesto || 'Colaborador')}</div></div>
            <div style="text-align:right; flex-shrink:0;"><div style="font-size:0.95rem; font-weight:bold; color:${color}">${emp.pct}%</div><div class="dept-dato">${emp.firmados}/${emp.total}</div></div>
        </div>`;
    });
    container.innerHTML = html || '<div style="padding:20px; text-align:center;">Sin actividad obligatoria.</div>';
    document.getElementById('btn-stats-back').onclick = () => window.verSupervisoresPorDepto(window.currentStatsDept);
};

// ---------------------------------------------------------
// DESGLOSE POR REGISTRO
// ---------------------------------------------------------
// Los registros se traen con sus firmas dentro (incident_signatures), así que
// el avance de cada uno —y todo su detalle por departamento, supervisor y
// colaborador— se calcula sin volver a la base.

async function traerPaginaDeRegistros(filtroTipo, desde, avisarIntento) {
    return conReintentos(() => {
        let consulta = sb.from('incidents')
            .select('id, title, date, tipo, grado, incident_signatures(employee_id)')
            .order('date', { ascending: false })
            .range(desde, desde + REGISTROS_POR_PAGINA - 1);

        // Las capacitaciones no llevan firma. Los registros antiguos pueden
        // tener el tipo vacío, y ésos cuentan como incidente.
        if (filtroTipo) consulta = consulta.eq('tipo', filtroTipo);
        else consulta = consulta.or('tipo.is.null,tipo.neq.Capacitación');

        return consulta;
    }, avisarIntento);
}

// Empleados a los que les tocaba firmar este registro, con su estado.
function auditoriaDelRegistro(registro) {
    const fechaInc = window.fechaDeRegistro(registro.date);
    const firmaron = new Set((registro.incident_signatures || []).map(f => String(f.employee_id)));
    const empleados = window.todosLosEmpleadosData || [];

    const lista = [];
    empleados.forEach(emp => {
        if (!window.leTocaFirmar(emp, fechaInc)) return;
        lista.push({
            id: emp.id,
            name: emp.name,
            puesto: emp.puesto,
            dept: emp.dept || "Sin Depto",
            sup: emp.sup || "Sin Supervisor",
            firmo: firmaron.has(String(emp.id))
        });
    });
    return lista;
}

// Conteo rápido para la lista de registros.
function avanceDelRegistro(registro) {
    const auditoria = auditoriaDelRegistro(registro);
    return {
        total: auditoria.length,
        firmados: auditoria.filter(e => e.firmo).length
    };
}

window.calcularAvancePorRegistro = async function(usarCache = false) {
    const container = document.getElementById('dept-stats-container');

    const filtroRaw = document.getElementById('stats-filter-type') ? document.getElementById('stats-filter-type').value : "";
    const filtroTipo = filtroRaw === "" ? null : filtroRaw;

    const vigente = nuevaPeticion();
    window.statsRegistroActual = null;
    window.statsRegistroDept = null;

    const hayCache = window.statsRegistros && window.statsRegistrosFiltro === filtroRaw;

    if (!usarCache || !hayCache) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">🔄 Consultando registros...</div>';

        if(!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
            await window.cargarDatosEmpleados();
            if(!vigente()) return;
        }

        const { data, error } = await traerPaginaDeRegistros(filtroTipo, 0, (intento) => {
            if(!vigente()) return;
            container.innerHTML = `<div style="text-align:center; padding:20px; color:#64748b;">🔄 La base tardó en responder. Reintentando (${intento}/${INTENTOS_STATS})...</div>`;
        });

        if(!vigente()) return;

        if(error) {
            mostrarErrorStats(container, error, 'window.calcularAvanceGlobal(false)');
            return;
        }

        window.statsRegistros = data || [];
        window.statsRegistrosFiltro = filtroRaw;
        window.statsRegistrosHayMas = (data || []).length === REGISTROS_POR_PAGINA;
    }

    pintarListaDeRegistros();
};

window.cargarMasRegistrosStats = async function() {
    const boton = document.getElementById('btn-mas-registros');
    if (boton) {
        boton.disabled = true;
        boton.innerText = 'Cargando...';
    }

    const filtroRaw = window.statsRegistrosFiltro || "";
    const filtroTipo = filtroRaw === "" ? null : filtroRaw;
    const vigente = nuevaPeticion();

    const { data, error } = await traerPaginaDeRegistros(filtroTipo, (window.statsRegistros || []).length);

    if(!vigente()) return;

    if(error) {
        if (boton) {
            boton.disabled = false;
            boton.innerText = 'No se pudo cargar. Reintentar';
        }
        console.error("❌ ERROR AL CARGAR MÁS REGISTROS:", error);
        return;
    }

    window.statsRegistros = (window.statsRegistros || []).concat(data || []);
    window.statsRegistrosHayMas = (data || []).length === REGISTROS_POR_PAGINA;
    pintarListaDeRegistros();
};

function pintarListaDeRegistros() {
    const container = document.getElementById('dept-stats-container');
    const registros = window.statsRegistros || [];

    document.getElementById('stats-nav-header').style.display = 'none';
    document.getElementById('stats-nav-title').innerText = '';
    document.getElementById('btn-stats-back').onclick = () => window.calcularAvanceGlobal(true);

    if (registros.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:20px; color:#64748b;'>No hay registros para mostrar con este filtro.</div>";
        pintarBarraGlobal(0, 0, 'Cumplimiento Total');
        return;
    }

    let esperadoAcumulado = 0, firmadoAcumulado = 0;

    let html = `<h4 class="stats-subtitulo">🗂️ Selecciona un registro</h4>`;

    registros.forEach(reg => {
        const avance = avanceDelRegistro(reg);
        esperadoAcumulado += avance.total;
        firmadoAcumulado += avance.firmados;

        const pct = avance.total > 0 ? Math.round((avance.firmados / avance.total) * 100) : 0;
        const color = colorPorcentaje(pct);
        const icono = (reg.tipo === 'Difusión') ? '📢' : '🚨';
        const detalle = avance.total > 0 ? `${avance.firmados}/${avance.total}` : 'sin personal';

        html += `
        <div class="dept-row" onclick="window.verDeptosPorRegistro('${paraOnclick(reg.id)}')">
            <div class="dept-header">
                <span class="dept-nombre">${icono} ${escaparHTML(reg.title)}</span>
                <span style="color:${color}; flex-shrink:0;">${pct}%</span>
            </div>
            <div class="dept-pie">
                <span class="dept-dato">${escaparHTML(reg.date || 'Sin fecha')}</span>
                <div class="dept-track"><div class="dept-fill" style="width:${pct}%; background-color:${color}"></div></div>
                <span class="dept-dato">${detalle}</span>
            </div>
        </div>`;
    });

    if (window.statsRegistrosHayMas) {
        html += `<div style="text-align:center; margin-top:12px;"><button id="btn-mas-registros" onclick="window.cargarMasRegistrosStats()" class="btn-back-small" style="margin:0 auto;">Cargar más registros</button></div>`;
    }

    container.innerHTML = html;
    pintarBarraGlobal(firmadoAcumulado, esperadoAcumulado, `Cumplimiento de ${registros.length} registro${registros.length === 1 ? '' : 's'}`);
}

const registroPorId = (id) => (window.statsRegistros || []).find(r => String(r.id) === String(id));

window.verDeptosPorRegistro = (idRegistro) => {
    const registro = registroPorId(idRegistro);
    if (!registro) return;

    window.statsRegistroActual = registro;
    window.statsRegistroDept = null;

    const container = document.getElementById('dept-stats-container');
    document.getElementById('stats-nav-header').style.display = 'flex';
    document.getElementById('stats-nav-title').innerText = ` / ${registro.title}`;

    const auditoria = auditoriaDelRegistro(registro);
    const deptMap = {};
    auditoria.forEach(emp => {
        if(!deptMap[emp.dept]) deptMap[emp.dept] = { total: 0, firmados: 0 };
        deptMap[emp.dept].total++;
        if (emp.firmo) deptMap[emp.dept].firmados++;
    });

    pintarBarraGlobal(auditoria.filter(e => e.firmo).length, auditoria.length, registro.title);

    container.innerHTML = '';
    if (auditoria.length === 0) {
        container.innerHTML = "<div style='text-align:center; padding:20px; color:#64748b;'>Nadie estaba dado de alta cuando se publicó este registro.</div>";
    } else {
        container.appendChild(crearTablaDesglose("📂 Departamentos", deptMap, 'verSupervisoresPorRegistro'));
    }

    document.getElementById('btn-stats-back').onclick = () => window.calcularAvanceGlobal(true);
};

window.verSupervisoresPorRegistro = (deptName) => {
    const registro = window.statsRegistroActual;
    if (!registro) return;

    window.statsRegistroDept = deptName;

    const container = document.getElementById('dept-stats-container');
    document.getElementById('stats-nav-title').innerText = ` / ${registro.title} / ${deptName}`;

    const supMap = {};
    auditoriaDelRegistro(registro).forEach(emp => {
        if (emp.dept !== deptName) return;
        if(!supMap[emp.sup]) supMap[emp.sup] = { total: 0, firmados: 0 };
        supMap[emp.sup].total++;
        if (emp.firmo) supMap[emp.sup].firmados++;
    });

    container.innerHTML = '';
    container.appendChild(crearTablaDesglose(`👤 Supervisores de ${deptName}`, supMap, 'verEmpleadosPorRegistro'));
    document.getElementById('btn-stats-back').onclick = () => window.verDeptosPorRegistro(registro.id);
};

window.verEmpleadosPorRegistro = (supName) => {
    const registro = window.statsRegistroActual;
    if (!registro) return;

    const deptName = window.statsRegistroDept;
    const container = document.getElementById('dept-stats-container');
    document.getElementById('stats-nav-title').innerText = ` / ${registro.title} / ${deptName} / ${supName}`;

    const empleados = auditoriaDelRegistro(registro)
        .filter(emp => emp.dept === deptName && emp.sup === supName);

    // Los que faltan por firmar van primero: es lo que hay que perseguir.
    empleados.sort((a, b) => (a.firmo === b.firmo)
        ? String(a.name).localeCompare(String(b.name))
        : (a.firmo ? 1 : -1));

    const pendientes = empleados.filter(e => !e.firmo).length;

    let html = `<div class="stats-subtitulo">${empleados.length - pendientes} de ${empleados.length} firmaron · ${pendientes} pendiente${pendientes === 1 ? '' : 's'}</div>`;

    empleados.forEach(emp => {
        const etiqueta = emp.firmo
            ? `<span style="color:#16a34a; font-weight:bold; font-size:0.8rem;">✓ Firmado</span>`
            : `<span style="color:#ea580c; font-weight:bold; font-size:0.8rem;">! Pendiente</span>`;
        html += `
        <div class="stats-fila-empleado">
            <div style="min-width:0;"><div class="stats-empleado-nombre">${escaparHTML(emp.name)}</div><div class="stats-empleado-puesto">${escaparHTML(emp.puesto || 'Colaborador')}</div></div>
            <div style="text-align:right; flex-shrink:0;">${etiqueta}</div>
        </div>`;
    });

    container.innerHTML = empleados.length ? html : '<div style="padding:20px; text-align:center;">Sin colaboradores en este grupo.</div>';
    document.getElementById('btn-stats-back').onclick = () => window.verSupervisoresPorRegistro(deptName);
};

// ---------------------------------------------------------
// TABLA DE DESGLOSE (COMPARTIDA POR LOS DOS MODOS)
// ---------------------------------------------------------
function crearTablaDesglose(titulo, mapData, onClickFunctionString) {
    const section = document.createElement('div');
    section.style.marginBottom = "25px";
    let html = `<h4 class="stats-subtitulo">${escaparHTML(titulo)}</h4>`;
    const keys = Object.keys(mapData).sort((a,b) => {
        const pa = mapData[a].total > 0 ? mapData[a].firmados/mapData[a].total : 0;
        const pb = mapData[b].total > 0 ? mapData[b].firmados/mapData[b].total : 0;
        return pa - pb;
    });
    keys.forEach(k => {
        const d = mapData[k];
        if(d.total === 0) return;
        const pct = Math.round((d.firmados / d.total) * 100);
        const color = colorPorcentaje(pct);
        const clickAttr = onClickFunctionString ? `onclick="${onClickFunctionString}('${paraOnclick(k)}')"` : '';
        const clickClass = onClickFunctionString ? 'dept-row' : 'dept-row no-click';
        html += `<div class="${clickClass}" ${clickAttr} style="cursor:pointer;"><div class="dept-header"><span class="dept-nombre">${escaparHTML(k)}</span><span style="color:${color}; flex-shrink:0;">${pct}%</span></div><div class="dept-pie"><div class="dept-track"><div class="dept-fill" style="width:${pct}%; background-color:${color}"></div></div><span class="dept-dato">${d.firmados}/${d.total}</span></div></div>`;
    });
    section.innerHTML = html;
    return section;
}

console.log("✅ Módulo Estadísticas de Difusión cargado correctamente (Managers exentos).");
