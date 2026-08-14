// ==========================================
// 4b-evaluaciones-stats.js (V63: BARRA INDEPENDIENTE PARA CERTIFICADAS)
// ==========================================

window.encuestasRawData = null;
window.encuestasStatsCacheForDrilldown = null;
window.statsRadarChart = null;

// --- FUNCIÓN DE SEGURIDAD PARA NOMBRES CON COMILLAS O CARACTERES ESPECIALES ---
window.sanitizeForHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

// --- 1. PUNTO DE ENTRADA (SOLO DESCARGA DAfv<TOS) ---
window.cargarStatsEncuestasGlobales = async () => {
    const container = document.getElementById('contenedor-modal-stats-encuestas');
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#64748b;"><div class="spinner"></div><br>Analizando datos históricos por lotes...</div>';

    try {
        const p1 = window.todosLosEmpleadosData && window.todosLosEmpleadosData.length > 0
            ? Promise.resolve(null)
            : window.cargarDatosEmpleados();
            
        // Las encuestas inactivas salen de las estadísticas de todo el mundo
        // salvo del administrador, que es el único que las sigue viendo.
        let consultaEvals = sb.from('evaluations').select('*');
        if (!window.modoAdminActivo) consultaEvals = consultaEvals.eq('active', true);
        const p2 = consultaEvals;
        
        // Paginación automática (Batch Fetching)
        const fetchTodasLasRespuestas = async () => {
            let todasLasRespuestas = [];
            let rangoInicio = 0;
            const limitePorPagina = 1000;
            let hayMasDatos = true;

            while (hayMasDatos) {
                const { data, error } = await sb.from('evaluation_responses')
                    .select('id, employee_id, evaluation_id, grades_json, review_status, submitted_at, employee_area')
                    .order('submitted_at', { ascending: false })
                    .range(rangoInicio, rangoInicio + limitePorPagina - 1);

                if (error) throw error;
                todasLasRespuestas = todasLasRespuestas.concat(data);

                if (data.length < limitePorPagina) hayMasDatos = false;
                else rangoInicio += limitePorPagina;
            }
            return todasLasRespuestas;
        };

        const [_, resEvals, rawResponses] = await Promise.all([p1, p2, fetchTodasLasRespuestas()]);

        if (resEvals.error) throw new Error("Error evaluaciones: " + resEvals.error.message);

        const evalsList = resEvals.data || [];

        const catSet = new Set();
        evalsList.forEach(e => catSet.add(e.category || 'General'));
        const categories = Array.from(catSet).sort();

        window.encuestasRawData = {
            evalsList,
            rawResponses,
            categories
        };

        window.renderizarPanelEstadisticas('GLOBAL');

    } catch (e) {
        console.error("Error fatal en stats:", e);
        container.innerHTML = `<div style="text-align:center; padding:40px;"><h3 style="color:#ef4444;">Error de Conexión</h3><p>${e.message}</p></div>`;
    }
};


window.currentStatsSortCriterion = 'participacion'; // Criterio por defecto

window.cambiarOrdenStats = (criterio) => {
    window.currentStatsSortCriterion = criterio;
    const catFiltro = document.getElementById('global-stats-filter') ? document.getElementById('global-stats-filter').value : 'GLOBAL';
    const perFiltro = document.getElementById('global-period-filter') ? document.getElementById('global-period-filter').value : 'CURRENT';
    window.renderizarPanelEstadisticas(catFiltro, perFiltro);
};


// --- 2. MOTOR DE CÁLCULO Y RENDERIZADO ---
window.renderizarPanelEstadisticas = (categoriaFiltro, periodoFiltro = 'CURRENT') => {
    const raw = window.encuestasRawData;
    if (!raw) return;

    const container = document.getElementById('contenedor-modal-stats-encuestas');
    
    let evalsList = raw.evalsList;
    if (categoriaFiltro !== 'GLOBAL') {
        evalsList = evalsList.filter(e => (e.category || 'General') === categoriaFiltro);
    }

    // --- NUEVA LÓGICA: DETECTAR FRECUENCIA DOMINANTE ---
    let maxFreq = 'once';
    const freqWeight = { 'once':0, 'weekly':1, 'biweekly':2, 'monthly':3, 'quarterly':4, 'semiannual':5, 'yearly':6, 'biennial':7 };

    const evalMap = {};
    evalsList.forEach(e => {
        let targets = ['ALL'];
        if (e.target_positions) {
            if (Array.isArray(e.target_positions)) targets = e.target_positions;
            else if (typeof e.target_positions === 'string') {
                try { targets = JSON.parse(e.target_positions); } catch(err) { targets = ['ALL']; }
            }
        }
        let targetDeptos = ['ALL'];
        if (e.target_departments) {
            if (Array.isArray(e.target_departments)) targetDeptos = e.target_departments;
            else if (typeof e.target_departments === 'string') {
                try { targetDeptos = JSON.parse(e.target_departments); } catch(err) { targetDeptos = ['ALL']; }
            }
        }
        
        const f = e.frequency || 'once';
        if (freqWeight[f] > freqWeight[maxFreq]) maxFreq = f;

        evalMap[e.id] = {
            title: e.title,
            category: e.category || "General",
            targets: targets,
            target_departments: targetDeptos,
            is_obligatory: e.is_obligatory !== false,
            evaluates_area: e.evaluates_area === true,
            frequency: f
        };
    });

    // --- NUEVA LÓGICA: GENERAR OPCIONES DE VIAJE EN EL TIEMPO ---
    const isYearlyMode = (maxFreq === 'yearly' || maxFreq === 'biennial');
    
    // Resetear filtro si hay choque de formatos (Ej. de Mensual a Anual)
    if (periodoFiltro !== 'CURRENT') {
        if (isYearlyMode && periodoFiltro.includes('-')) periodoFiltro = 'CURRENT';
        else if (!isYearlyMode && !periodoFiltro.includes('-')) periodoFiltro = 'CURRENT';
    }

    const availablePeriods = new Set();
    raw.rawResponses.forEach(r => {
        if (!evalMap[r.evaluation_id]) return;
        const d = new Date(r.submitted_at);
        if (isYearlyMode) {
            availablePeriods.add(d.getFullYear().toString());
        } else {
            const m = String(d.getMonth() + 1).padStart(2, '0');
            availablePeriods.add(`${d.getFullYear()}-${m}`);
        }
    });
    
    const periodosArray = Array.from(availablePeriods).sort((a,b) => b.localeCompare(a));
    const puestosDirigidosSet = new Set();
    let incluyeAllPuestos = false;

    Object.values(evalMap).forEach(info => {
        if (info.targets) {
             info.targets.forEach(t => {
                 const pNorm = String(t).toUpperCase().trim();
                 if (pNorm === 'ALL') incluyeAllPuestos = true;
                 else if (pNorm !== '') puestosDirigidosSet.add(String(t).trim());
             });
        }
    });

    let textoPuestosDirigidos = '';
    if (incluyeAllPuestos) {
        textoPuestosDirigidos = puestosDirigidosSet.size > 0 
            ? 'Todos los puestos (y configuraciones explícitas: ' + Array.from(puestosDirigidosSet).join(', ') + ')'
            : 'Aplica a todos los puestos';
    } else if (puestosDirigidosSet.size > 0) {
        textoPuestosDirigidos = Array.from(puestosDirigidosSet).join(', ');
    } else {
        textoPuestosDirigidos = '<span style="color:#ef4444;">Ningún puesto asignado (excluye a todos)</span>';
    }

    const statsCache = {};
    const puestoCache = {};
    const getDept = (e) => (e.department || e.departamento || e.dept || "Sin Departamento").trim();
    const getSup = (e) => (e.sup || e.supervisor || e.supervisor_name || "Sin Supervisor").trim();
    const getPuesto = (e) => (e.puesto || e.Puesto || "").trim() || "Sin Puesto";

    let totalAsignadasGlobal = 0;
    const radarGroupingUsersAssigned = {};

    window.todosLosEmpleadosData.forEach(e => {
        if (e.isActive === false) return; // <-- NUEVO: Excluir inactivos del universo asignado
        const dept = getDept(e);
        const sup = getSup(e);
        const empPuesto = (e.puesto || e.Puesto || "").trim();
        const empId = String(e.id);

        // NUEVO: Agregado contador "certificadas", "malRevisadas" y "revisadasAltas"
        if (!statsCache[dept]) statsCache[dept] = { employeesCount: 0, assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0, malRevisadas: 0, revisadasAltas: 0, sumScore: 0, countScore: 0, supervisors: {} };
        if (!statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup] = { employeesCount: 0, assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0, malRevisadas: 0, revisadasAltas: 0, sumScore: 0, countScore: 0 };

        statsCache[dept].employeesCount++;
        statsCache[dept].supervisors[sup].employeesCount++;

        const empPuestoNorm = empPuesto.toUpperCase();
        const empDeptoNorm = dept.toUpperCase();
        let empAssignments = 0;

        const empPuestoKey = getPuesto(e);
        if (!puestoCache[empPuestoKey]) puestoCache[empPuestoKey] = { employeesCount: 0, assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0, malRevisadas: 0, revisadasAltas: 0, sumScore: 0, countScore: 0 };
        puestoCache[empPuestoKey].employeesCount++;
        
        evalsList.forEach(ev => {
             const info = evalMap[ev.id];
             const targetsNorm = info.targets ? info.targets.map(t => String(t).toUpperCase().trim()) : ['ALL'];
             const deptosNorm = info.target_departments ? info.target_departments.map(t => String(t).toUpperCase().trim()) : ['ALL'];

             const matchesPuesto = targetsNorm.includes('ALL') || targetsNorm.includes(empPuestoNorm);
             const matchesDepto = deptosNorm.includes('ALL') || deptosNorm.includes(empDeptoNorm);
             
             if (matchesPuesto && matchesDepto) {
                 empAssignments++;
                 const radarKey = categoriaFiltro === 'GLOBAL' ? info.category : info.title;
                 if (!radarGroupingUsersAssigned[radarKey]) radarGroupingUsersAssigned[radarKey] = new Set();
                 radarGroupingUsersAssigned[radarKey].add(empId);
             }
        });

        statsCache[dept].assignedCount += empAssignments;
        statsCache[dept].supervisors[sup].assignedCount += empAssignments;
        puestoCache[empPuestoKey].assignedCount += empAssignments;
        totalAsignadasGlobal += empAssignments;
    });

    const uniqueResponseMap = {};
    const now = new Date();
    const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        raw.rawResponses.forEach(r => {
            const info = evalMap[r.evaluation_id];
            if (!info) return;

            // --- NUEVO FILTRO: IGNORAR RESPUESTAS DE USUARIOS NO ASIGNADOS ---
            const empObj = window.todosLosEmpleadosData.find(e => String(e.id) === String(r.employee_id));
            if (!empObj || empObj.isActive === false) return; // Ignoramos si no existe o está inactivo

            const empPuestoNorm = getPuesto(empObj).toUpperCase();
            const empDeptoNorm = getDept(empObj).toUpperCase();
            
            const targetsNorm = info.targets ? info.targets.map(t => String(t).toUpperCase().trim()) : ['ALL'];
            const deptosNorm = info.target_departments ? info.target_departments.map(t => String(t).toUpperCase().trim()) : ['ALL'];

            const matchesPuesto = targetsNorm.includes('ALL') || targetsNorm.includes(empPuestoNorm);
            const matchesDepto = deptosNorm.includes('ALL') || deptosNorm.includes(empDeptoNorm);

            if (!matchesPuesto || !matchesDepto) {
                return; // ⛔ El usuario contestó, pero la encuesta no era para su Puesto/Depto. Se ignora.
            }
            // -------------------------------------------------------------------

            const subDate = new Date(r.submitted_at);
            const subYear = subDate.getFullYear();
            const subMonth = subDate.getMonth();
        
        let validForPeriod = false;

        if (periodoFiltro === 'CURRENT') {
            let expirada = false;
            if (info.frequency && info.frequency !== 'once') {
                switch (info.frequency) {
                    case 'weekly':
                        const diaSemanaActual = now.getDay() || 7;
                        const inicioSemana = new Date(now);
                        inicioSemana.setHours(0,0,0,0);
                        inicioSemana.setDate(now.getDate() - diaSemanaActual + 1);
                        expirada = subDate < inicioSemana;
                        break;
                    case 'biweekly':
                        const quincenaActual = now.getDate() <= 15 ? 1 : 2;
                        const subQuincena = subDate.getDate() <= 15 ? 1 : 2;
                        expirada = (currentYear !== subYear) || (currentMonth !== subMonth) || (quincenaActual !== subQuincena);
                        break;
                    case 'monthly':
                        expirada = (currentYear !== subYear) || (currentMonth !== subMonth);
                        break;
                    case 'quarterly':
                        const subQuarter = Math.floor(subMonth / 3);
                        const currentQuarter = Math.floor(currentMonth / 3);
                        expirada = (currentYear !== subYear) || (currentQuarter !== subQuarter);
                        break;
                    case 'semiannual':
                        const subHalf = Math.floor(subMonth / 6);
                        const currentHalf = Math.floor(currentMonth / 6);
                        expirada = (currentYear !== subYear) || (currentHalf !== subHalf);
                        break;
                    case 'yearly':
                        expirada = (currentYear !== subYear);
                        break;
                    case 'biennial':
                        expirada = (currentYear - subYear) >= 2;
                        break;
                }
            }
            validForPeriod = !expirada;
        } else {
            // Evaluando historial (Modo Viaje en el Tiempo)
            if (periodoFiltro.includes('-')) {
                const [targetYear, targetMonth] = periodoFiltro.split('-');
                if (subYear === parseInt(targetYear) && subMonth === (parseInt(targetMonth) - 1)) {
                    validForPeriod = true;
                }
            } else {
                if (subYear === parseInt(periodoFiltro)) {
                    validForPeriod = true;
                }
            }
        }

        if (validForPeriod) {
            const key = `${r.employee_id}_${r.evaluation_id}`;
            // Mantiene el último intento válido para el periodo seleccionado
            if (!uniqueResponseMap[key]) {
                uniqueResponseMap[key] = r;
            }
        }
    });
    
    const dataset = Object.values(uniqueResponseMap);

    let totalContestadas = dataset.length;
    let totalRevisadas = 0; // Agrupa Revisadas y Certificadas para el progreso global
    let totalScoreSum = 0;
    
    const evalPerfMap={};
    const radarPerfMap={};
    const areaPerfMap={};
    let evaluaAreas=false;
    evalsList.forEach(ev=>{
    if(evalMap[ev.id]&&evalMap[ev.id].evaluates_area)evaluaAreas=true;
    });
    if(evaluaAreas){
    window.todosLosEmpleadosData.forEach(e=>{
    if(e.isActive===false)return;
    let empArea="Sin Área";
    if(e.area&&typeof e.area==='string'&&e.area.trim()!==""){
    empArea=e.area.trim();
    }else if(e.area&&typeof e.area==='object'&&e.area.name){
    empArea=e.area.name;
    }else{
    empArea=getDept(e);
    }
    if(!areaPerfMap[empArea])areaPerfMap[empArea]={sum:0,count:0,details:{},users:new Set(),userStats:{}};
    });
    }
    const isSingleEvalMode=categoriaFiltro!=='GLOBAL'&&evalsList.length===1;
    const radarQuestionsMap={};
    dataset.forEach(r => {
        const empObj = window.todosLosEmpleadosData.find(e => String(e.id) === String(r.employee_id));
        if (!empObj || empObj.isActive === false) return; // <-- NUEVO: Ignorar respuestas de inactivos
        const empId = String(r.employee_id);

        const dept = getDept(empObj);
        const sup = getSup(empObj);
        const empPuestoKey = getPuesto(empObj);
        const evalInfo = evalMap[r.evaluation_id];
        const title = evalInfo.title;
        const radarKey = categoriaFiltro === 'GLOBAL' ? evalInfo.category : evalInfo.title;

        if (statsCache[dept]) {
            statsCache[dept].responses++;
            if (statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].responses++;
        }
        
        if (puestoCache[empPuestoKey]) {
            puestoCache[empPuestoKey].responses++;
        }

        if(!evalPerfMap[title]) evalPerfMap[title] = { sum: 0, countRevisadas: 0, countTotal: 0 };
        evalPerfMap[title].countTotal++;
        
        // Clasificación detallada para las barras
        if (r.review_status === 'Falsa') {
            if (statsCache[dept]) { statsCache[dept].falsas++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].falsas++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].falsas++;
        } else if (r.review_status === 'Certificada') {
            if (statsCache[dept]) { statsCache[dept].certificadas++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].certificadas++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].certificadas++;
        } else if (r.review_status === 'Revisado') {
            if (statsCache[dept]) { statsCache[dept].reviewed++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].reviewed++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].reviewed++;
        } else if (r.review_status === 'Mal Revisada') {
            if (statsCache[dept]) { statsCache[dept].malRevisadas++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].malRevisadas++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].malRevisadas++;
        }
        
        // 1. CALCULAMOS EL PUNTAJE PARA TODAS LAS RESPUESTAS
        const grades = r.grades_json || {};
        let sumScore = 0; let qCount = 0;
        
        Object.entries(grades).forEach(([qKey, g]) => {
            qCount++;
            let qScore = 0;
            let qTitle = qKey;
            
            if (g && typeof g === 'object') {
                if(g.type === 'numeric_score') qScore = (parseFloat(g.percentage) || 0);
                else if (g.type === 'list_match' && Array.isArray(g.items)) {
                    const ok = g.items.filter(i=>i.status==='correct').length;
                    const tot = Math.max(g.items.length, 1);
                    qScore = ((ok/tot)*100);
                } else { if(g.status === 'correct') qScore = 100; }
                
                if (g.question) qTitle = g.question;
                else if (g.title) qTitle = g.title;
                else if (g.text) qTitle = g.text;
                else if (g.label) qTitle = g.label;
            } else if (g === 'correct') {
                qScore = 100;
            }
            
            sumScore += qScore;
            
            if (isSingleEvalMode && (r.review_status === 'Revisado' || r.review_status === 'Certificada')) {
                if (!radarQuestionsMap[qKey]) radarQuestionsMap[qKey] = { sum: 0, count: 0, users: new Set(), labelText: qTitle };
                radarQuestionsMap[qKey].sum += qScore;
                radarQuestionsMap[qKey].count++;
                radarQuestionsMap[qKey].users.add(empId);
            }
        });
        
        const finalScore = qCount > 0 ? (sumScore / qCount) : 0;
        r.finalScoreCalculated = finalScore; // Guardar para el drilldown (vistas secundarias)
        
        // 2. CONTADOR DE REVISADAS ALTAS (Para cualquier evaluación procesada que supere 80%)
        if (['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status) && finalScore >= 80) {
            if (statsCache[dept]) {
                statsCache[dept].revisadasAltas = (statsCache[dept].revisadasAltas || 0) + 1;
                if (statsCache[dept].supervisors[sup]) {
                    statsCache[dept].supervisors[sup].revisadasAltas = (statsCache[dept].supervisors[sup].revisadasAltas || 0) + 1;
                }
            }
            if (puestoCache[empPuestoKey]) {
                puestoCache[empPuestoKey].revisadasAltas = (puestoCache[empPuestoKey].revisadasAltas || 0) + 1;
            }
        }

        // 3. Lógica Global Original: Tanto Revisado como Certificada suman puntos y cuentan como progreso general
        if (r.review_status === 'Revisado' || r.review_status === 'Certificada') {
        if (statsCache[dept]) {
        statsCache[dept].sumScore += finalScore;
        statsCache[dept].countScore++;
        if (statsCache[dept].supervisors[sup]) {
        statsCache[dept].supervisors[sup].sumScore += finalScore;
        statsCache[dept].supervisors[sup].countScore++;
        }
        }
        if (puestoCache[empPuestoKey]) {
        puestoCache[empPuestoKey].sumScore += finalScore;
        puestoCache[empPuestoKey].countScore++;
        }
        totalRevisadas++;
        totalScoreSum += finalScore;
            
            evalPerfMap[title].sum += finalScore;
            evalPerfMap[title].countRevisadas++;

            if (!isSingleEvalMode) {
                if (!radarPerfMap[radarKey]) radarPerfMap[radarKey] = { sum: 0, count: 0, users: new Set() };
                radarPerfMap[radarKey].sum += finalScore;
                radarPerfMap[radarKey].count++;
                radarPerfMap[radarKey].users.add(empId);
            }

            if(evalInfo.evaluates_area){
            let empArea="Sin Área";
            if(r.employee_area&&r.employee_area!=='Sin Área'){
            empArea=r.employee_area;
            }else if(empObj.area&&empObj.area.trim()!==""){
            empArea=empObj.area.trim();
            }else{
            empArea=getDept(empObj);
            }
            const deptoAsignado=getDept(empObj);
            const nombreConDepto=empObj.name?`${empObj.name} (${deptoAsignado})`:'Desconocido';
            if(!areaPerfMap[empArea])areaPerfMap[empArea]={sum:0,count:0,details:{},users:new Set(),userStats:{}};
            areaPerfMap[empArea].sum+=finalScore;
            areaPerfMap[empArea].count++;
            areaPerfMap[empArea].users.add(nombreConDepto);
                if(!areaPerfMap[empArea].userStats[empId]){
                areaPerfMap[empArea].userStats[empId]={name:empObj.name,dept:deptoAsignado,puesto:empPuestoKey,sum:0,count:0};
                }
                areaPerfMap[empArea].userStats[empId].sum+=finalScore;
                areaPerfMap[empArea].userStats[empId].count++;
            if(!areaPerfMap[empArea].details[title])areaPerfMap[empArea].details[title]={sum:0,count:0,users:new Set()};
            areaPerfMap[empArea].details[title].sum+=finalScore;
            areaPerfMap[empArea].details[title].count++;
            areaPerfMap[empArea].details[title].users.add(nombreConDepto);
            }
        }
    });


    const radarLabels=[];
    const radarDataPoints=[];
    const radarUserStats=[];
    const radarFullLabels=[];
    if(isSingleEvalMode){
    let pCounter=1;
    const evalTitle=evalsList[0].title;
    Object.keys(radarQuestionsMap).forEach(qKey=>{
    const d=radarQuestionsMap[qKey];
    const avg=d.count>0?Math.round(d.sum/d.count):0;
    const uniqueParticipating=d.users.size;
    const uniqueAssigned=radarGroupingUsersAssigned[evalTitle]?radarGroupingUsersAssigned[evalTitle].size:0;
    let label=qKey.length>20?`Pregunta ${pCounter}`:qKey;
    if(label.match(/^[0-9a-fA-F-]+$/))label=`P${pCounter}`;
    radarLabels.push(label);
    radarDataPoints.push(avg);
    radarUserStats.push(`${uniqueParticipating} de ${uniqueAssigned} usuarios`);
    radarFullLabels.push(d.labelText||qKey);
    pCounter++;
    });
    }else{
    Object.keys(radarPerfMap).sort().forEach(key=>{
    const d=radarPerfMap[key];
    const avg=d.count>0?Math.round(d.sum/d.count):0;
    const uniqueParticipating=d.users.size;
    const uniqueAssigned=radarGroupingUsersAssigned[key]?radarGroupingUsersAssigned[key].size:0;
    radarLabels.push(key);
    radarDataPoints.push(avg);
    radarUserStats.push(`${uniqueParticipating} de ${uniqueAssigned} usuarios`);
    radarFullLabels.push(key);
    });
    }

    window.encuestasStatsCacheForDrilldown = {
        statsCache,
        puestoCache,
        cleanResponses: dataset,
        activeEvalsList: evalsList
    };

    let areasHtml = '';
    if (Object.keys(areaPerfMap).length > 0) {
        areasHtml = `
        <div class="stats-seccion" style="border-color:#fbcfe8; box-shadow:0 4px 6px -1px rgba(190, 24, 93, 0.05);">
            <div class="stats-seccion-encabezado" style="border-bottom-color:#fdf2f8;">
                <h3 class="stats-seccion-titulo" style="color:#be185d;">📍 Comparativa de Desempeño por Áreas</h3>
                <span style="font-size:0.8rem; color:#be185d; font-weight:600;">Evaluaciones enfocadas en áreas</span>
            </div>
            <!-- Las áreas no se apilan: van en fila y se arrastran con el dedo,
                 que es lo que evita que esta sección se coma la pantalla. -->
            <div class="stats-carrusel hide-scrollbar">
                ${window.renderAreaStats(areaPerfMap)}
            </div>
        </div>`;
    }

    try {
        const participacionGlobal = Math.min(100, totalAsignadasGlobal > 0 ? Math.round((totalContestadas / totalAsignadasGlobal) * 100) : 0);
        const porcentajeRevision = totalContestadas > 0 ? Math.round((totalRevisadas / totalContestadas) * 100) : 0;
        const globalAvgScore = totalRevisadas > 0 ? Math.round(totalScoreSum / totalRevisadas) : 0;
        
        const getColor = window.getColorScore || ((s) => s >= 80 ? '#166534' : '#ef4444');
        const colorGlobalScore = getColor(globalAvgScore);

        const optionsHtml = ['GLOBAL', ...raw.categories].map(c =>
            `<option value="${c}" ${c === categoriaFiltro ? 'selected' : ''}>${c === 'GLOBAL' ? '🏆 Todas las Categorías' : '📂 ' + c}</option>`
        ).join('');

        // Generar HTML para el selector de periodo (Viaje en el tiempo)
        let periodOptionsHtml = `<option value="CURRENT" ${periodoFiltro === 'CURRENT' ? 'selected' : ''}>⏳ Periodo Actual</option>`;
        periodosArray.forEach(p => {
            let label = p;
            if (p.includes('-')) {
                const [y, m] = p.split('-');
                const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                label = `${meses[parseInt(m)-1]} ${y}`;
            }
            periodOptionsHtml += `<option value="${p}" ${periodoFiltro === p ? 'selected' : ''}>🕒 ${label}</option>`;
        });

        const filtroContainer = document.getElementById('encabezado-filtro-stats');
        if (filtroContainer) {
            // El aspecto de la fila y de los desplegables lo pone .stats-filtros
            // en estilos.css; aquí sólo queda el color de cada uno.
            filtroContainer.innerHTML = `
                <select id="global-stats-filter" onchange="window.renderizarPanelEstadisticas(this.value, document.getElementById('global-period-filter') ? document.getElementById('global-period-filter').value : 'CURRENT')"
                    style="color:#1e40af; background:#eff6ff;">
                    ${optionsHtml}
                </select>
                <select id="global-period-filter" onchange="window.renderizarPanelEstadisticas(document.getElementById('global-stats-filter').value, this.value)"
                    style="color:#0f766e; background:#f0fdf4;">
                    ${periodOptionsHtml}
                </select>
            `;
        }
        const universoContainer = document.getElementById('stats-universo-count');
        if (universoContainer) {
            universoContainer.innerText = `${totalAsignadasGlobal} asignadas`;
        }

        // LEYENDA ACTUALIZADA INTERACTIVA CON ORDENAMIENTO (SIN FLECHA A CALIFICACIÓN)
                const criterion = window.currentStatsSortCriterion || 'participacion';
                const legendsHtml = `
                    <div class="stats-leyenda">

                            <!-- Sección 1 -->
                            <div style="display:flex; align-items:center; gap:4px;">
                                <div onclick="window.cambiarOrdenStats('participacion')" style="display:flex; align-items:center; gap:4px; font-weight:bold; cursor:pointer; padding:4px 8px; border-radius:4px; background:${criterion === 'participacion' ? '#eff6ff' : 'transparent'}; border:${criterion === 'participacion' ? '1px solid #bfdbfe' : '1px solid transparent'}; transition: all 0.2s;" title="Ordenar gráficos por: Participación">
                                    <div style="width:10px; height:10px; background:#3b82f6; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="color:#1e293b; white-space:nowrap;">1. Participación</span>
                                </div>
                            </div>
                            
                            <span style="color:#cbd5e1; flex-shrink:0;">➔</span>
                            
                            <!-- Sección 2 -->
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="color:#1e293b; font-weight:bold; white-space:nowrap;">2. Revisadas:</span>
                                <div style="display:flex; align-items:center; gap:4px; padding:2px 4px;">
                                    <div style="width:10px; height:10px; background:#10b981; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="color:#475569; white-space:nowrap;">&lt; 80%</span>
                                </div>
                                <div onclick="event.stopPropagation(); window.cambiarOrdenStats('revisadas_altas')" style="display:flex; align-items:center; gap:4px; cursor:pointer; padding:2px 4px; border-radius:4px; background:${criterion === 'revisadas_altas' ? '#dcfce7' : 'transparent'}; border:${criterion === 'revisadas_altas' ? '1px solid #86efac' : '1px solid transparent'}; transition: all 0.2s;">
                                    <div style="width:10px; height:10px; background:#047857; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="color:${criterion === 'revisadas_altas' ? '#14532d' : '#475569'}; font-weight:${criterion === 'revisadas_altas' ? 'bold' : 'normal'}; white-space:nowrap;">≥ 80%</span>
                                </div>
                            </div>
                            
                            <span style="color:#cbd5e1; flex-shrink:0;">➔</span>
                            
                            <!-- Sección 3 -->
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="color:#475569; font-weight:bold; white-space:nowrap;">3. Auditado:</span>
                                
                                <div onclick="window.cambiarOrdenStats('certificadas')" style="display:flex; align-items:center; gap:4px; cursor:pointer; padding:2px 6px; border-radius:4px; background:${criterion === 'certificadas' ? '#fffbeb' : 'transparent'}; border:${criterion === 'certificadas' ? '1px solid #fde68a' : '1px solid transparent'}; transition: all 0.2s;">
                                    <div style="width:10px; height:10px; background:#eab308; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="white-space:nowrap;">Certificadas</span>
                                </div>
                                
                                <div onclick="window.cambiarOrdenStats('falsas')" style="display:flex; align-items:center; gap:4px; cursor:pointer; padding:2px 6px; border-radius:4px; background:${criterion === 'falsas' ? '#fef2f2' : 'transparent'}; border:${criterion === 'falsas' ? '1px solid #fee2e2' : '1px solid transparent'}; transition: all 0.2s;">
                                    <div style="width:10px; height:10px; background:#ef4444; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="white-space:nowrap;">Falsas</span>
                                </div>
                                
                                <div onclick="window.cambiarOrdenStats('mal_revisadas')" style="display:flex; align-items:center; gap:4px; cursor:pointer; padding:2px 6px; border-radius:4px; background:${criterion === 'mal_revisadas' ? '#fdf4ff' : 'transparent'}; border:${criterion === 'mal_revisadas' ? '1px solid #fbcfe8' : '1px solid transparent'}; transition: all 0.2s;">
                                    <div style="width:10px; height:10px; background:#a855f7; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="white-space:nowrap;">Mal Rev.</span>
                                </div>
                            </div>

                            <!-- Separador vertical sutil en lugar de flecha -->
                            <div style="width:2px; height:20px; background:#e2e8f0; margin:0 5px; flex-shrink:0; border-radius:1px;"></div>

                            <!-- Sección 4 -->
                            <div style="display:flex; align-items:center; gap:4px;">
                                <div onclick="window.cambiarOrdenStats('calificacion')" style="display:flex; align-items:center; gap:4px; font-weight:bold; cursor:pointer; padding:4px 8px; border-radius:4px; background:${criterion === 'calificacion' ? '#f3f4f6' : 'transparent'}; border:${criterion === 'calificacion' ? '1px solid #d1d5db' : '1px solid transparent'}; transition: all 0.2s;" title="Ordenar gráficos por: Calificación Promedio">
                                    <div style="width:10px; height:10px; background:#86efac; border-radius:2px; flex-shrink:0;"></div>
                                    <span style="color:#1e293b; white-space:nowrap;">4. Calificación</span>
                                </div>
                            </div>

                    </div>
                `;

        let html = `
        <div class="stats-resumen">
            <div class="stats-tarjeta">
                <div class="stats-tarjeta-rotulo">Participación</div>
                <div class="stats-tarjeta-cifra" style="color:#3b82f6;">${participacionGlobal}<span>%</span></div>
                <div class="stats-tarjeta-pie">${totalContestadas} de ${totalAsignadasGlobal} realizadas</div>
            </div>
            <div class="stats-tarjeta">
                <div class="stats-tarjeta-rotulo">Progreso Revisión</div>
                <div class="stats-tarjeta-cifra" style="color:#10b981;">${porcentajeRevision}<span>%</span></div>
                <div class="stats-tarjeta-pie">${totalRevisadas} de ${totalContestadas} procesadas</div>
            </div>
            <div class="stats-tarjeta" style="border-bottom: 4px solid ${colorGlobalScore};">
                <div class="stats-tarjeta-rotulo">Calificación Promedio</div>
                <div class="stats-tarjeta-cifra" style="color:#1e293b;">${globalAvgScore}<span>%</span></div>
                <div class="stats-tarjeta-pie">Considera cumplimiento</div>
            </div>
        </div>

        <div class="stats-objetivo">
            <div style="font-size:1.4rem;">🎯</div>
            <div style="min-width:0;">
                <div class="stats-tarjeta-rotulo">Puestos objetivo de esta clasificación</div>
                <div style="font-size:0.85rem; color:#1e293b; font-weight:600; margin-top:3px; line-height:1.35;">${textoPuestosDirigidos}</div>
            </div>
        </div>

        ${areasHtml} 
        
        <div class="stats-seccion">
            <div class="stats-seccion-encabezado">
                <h3 class="stats-seccion-titulo">Por Departamento</h3>
                ${legendsHtml}
            </div>
            <div id="dept-list-container">
                ${window.renderDeptDetailed(statsCache)}
            </div>
        </div>

        <div class="stats-seccion">
            <div class="stats-seccion-encabezado">
                <h3 class="stats-seccion-titulo">Por Puesto</h3>
                ${legendsHtml}
            </div>
            <div id="puesto-list-container">
                ${window.renderPuestoDetailed(puestoCache)}
            </div>
        </div>

        <div class="stats-seccion" id="stats-seccion-radar">
            <div style="border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:15px;">
                <h3 id="titulo-radar-text" class="stats-seccion-titulo">Panorama de cumplimiento</h3>
            </div>

            <div id="stats-radar-wrapper" style="width: 100%; max-width: 400px; margin: 0 auto; display:block;">
                <h4 id="radar-title" style="text-align:center; color:#64748b; font-size:0.85rem; text-transform:uppercase; margin-bottom:10px;">
                    ${categoriaFiltro === 'GLOBAL' ? 'Promedio por categoría' : 'Detalle de Evaluaciones: ' + categoriaFiltro}
                </h4>
                <div style="position: relative; width: 100%; height: 300px;">
                    <canvas id="stats-radar-chart"></canvas>
                </div>
            </div>
        </div>

        <div class="stats-seccion">
            <h3 class="stats-seccion-titulo" style="border-bottom:1px solid #f1f5f9; padding-bottom:10px; margin-bottom:15px;">📝 Por Tipo de Encuesta</h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap:15px;">
                ${window.renderMiniTable(evalPerfMap)}
            </div>
        </div>`;

        container.innerHTML = html;

        if (radarLabels.length > 0) {
            const ctx = document.getElementById('stats-radar-chart');
            if (window.statsRadarChart) window.statsRadarChart.destroy();
            
            const formattedLabels = radarLabels.map((label, idx) => {
                const words = label.split(' ');
                const lines = [];
                while(words.length > 0) lines.push(words.splice(0, 3).join(' '));
                lines.push(`${radarDataPoints[idx]}%`);
                return lines;
            });

            window.statsRadarChart = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: formattedLabels,
                    datasets: [{
                        label: 'Promedio',
                        data: radarDataPoints,
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        borderColor: '#22c55e',
                        pointBackgroundColor: '#166534',
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { display: true, color: '#f1f5f9' },
                            grid: { color: '#e2e8f0' },
                            pointLabels: { font: { size: 10, weight: 'bold' }, color: '#334155', display: true },
                            suggestedMin: 0, suggestedMax: 100, ticks: { display: false, stepSize: 20 }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            padding: 10,
                            callbacks: {
                                label: function(context) {
                                    const index = context.dataIndex;
                                    const uStat = radarUserStats[index] || "";
                                    return [`Promedio: ${context.parsed.r}%`, `(${uStat})`];
                                }
                            }
                        }
                    }
                },
                plugins: [{
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        // El número del centro es el mismo que el del recuadro
                        // «Calificación Promedio»: la media de las respuestas,
                        // redondeada una sola vez. Promediar las puntas de la
                        // gráfica daría otra cosa —cada punta ya viene
                        // redondeada y todas pesarían igual sin importar
                        // cuántas respuestas hay detrás—, y por eso el centro
                        // decía 81% donde el recuadro decía 80%.
                        const avg = globalAvgScore;

                        const totalU=new Set();
                        const totalA=new Set();
                        if(isSingleEvalMode){
                        Object.values(radarQuestionsMap).forEach(d=>d.users.forEach(u=>totalU.add(u)));
                        }else{
                        Object.values(radarPerfMap).forEach(d=>d.users.forEach(u=>totalU.add(u)));
                        }
                        Object.values(radarGroupingUsersAssigned).forEach(s=>s.forEach(u=>totalA.add(u)));
                        const textPart=`${totalU.size} de ${totalA.size} usuarios`;
                        
                        const x = chart.scales.r.xCenter;
                        const y = chart.scales.r.yCenter;
                        
                        ctx.save();
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.lineWidth = 4;
                        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";

                        ctx.font = "bolder 1.5rem -apple-system, BlinkMacSystemFont, sans-serif";
                        ctx.fillStyle = "#166534";
                        ctx.strokeText(avg + "%", x, y - 8);
                        ctx.fillText(avg + "%", x, y - 8);
                        
                        ctx.font = "bold 0.7rem -apple-system, BlinkMacSystemFont, sans-serif";
                        ctx.fillStyle = "#64748b";
                        ctx.strokeText(textPart, x, y + 14);
                        ctx.fillText(textPart, x, y + 14);
                        
                        ctx.restore();
                    }
                }]
            });
        } else {
            // Sin datos que dibujar, la sección se esconde entera: ya no queda
            // nada debajo del radar que la justifique.
            const seccionRadar = document.getElementById('stats-seccion-radar');
            if (seccionRadar) seccionRadar.style.display = 'none';
        }

    } catch(e) {
        console.error("Error visual stats:", e);
        document.getElementById('contenedor-modal-stats-encuestas').innerHTML = `<div style="color:red; padding:20px;">Error visual: ${e.message}</div>`;
    }
};

// Redibuja el radar con el recorte que se esté mirando: un departamento, el
// grupo de un supervisor o un puesto. El título de la sección es lo único que
// dice a qué recorte pertenece lo que muestra la gráfica.
window.actualizarRadarDOM = (deptName = null, supName = null, puestoName = null) => {
    const cache = window.encuestasStatsCacheForDrilldown;
    if (!cache || !cache.activeEvalsList) return;

    let tituloBase = 'Panorama de cumplimiento';

    if (puestoName) {
        tituloBase = `Panorama del puesto: ${puestoName}`;
    } else if (deptName && supName) {
        tituloBase = `Panorama: ${supName}`;
    } else if (deptName) {
        tituloBase = `Panorama: ${deptName}`;
    }

    const tituloEl = document.getElementById('titulo-radar-text');
    if (tituloEl) tituloEl.innerText = tituloBase;

    const getDept = (e) => (e.department || e.departamento || e.dept || "Sin Departamento").trim();
    const getSup = (e) => (e.sup || e.supervisor || e.supervisor_name || "Sin Supervisor").trim();
    const getPuesto = (e) => (e.puesto || e.Puesto || "").trim() || "Sin Puesto";

    const validEmpIds = new Set();
    window.todosLosEmpleadosData.forEach(e => {
         if (e.isActive === false) return; // Los dados de baja no cuentan en el radar
         const d = getDept(e);
         const s = getSup(e);
         const p = getPuesto(e);
         
         if (puestoName) {
             if (p === puestoName) validEmpIds.add(String(e.id));
         } else if (deptName && supName) {
             if (d === deptName && s === supName) validEmpIds.add(String(e.id));
         } else if (deptName) {
             if (d === deptName) validEmpIds.add(String(e.id));
         } else {
             validEmpIds.add(String(e.id));
         }
    });

    const radarMap = {};
    const assignedMap = {};
    // Media del recorte, con la misma definición que el recuadro de
    // «Calificación Promedio»: se suma el promedio de cada respuesta y se
    // redondea una sola vez, al final.
    let sumaRecorte = 0;
    let conteoRecorte = 0;
    const activeEvalsMap = {};
    cache.activeEvalsList.forEach(e => activeEvalsMap[e.id] = e);
    
    const filterEl = document.getElementById('global-stats-filter');
    const currentFilter = filterEl ? filterEl.value : 'GLOBAL';

    window.todosLosEmpleadosData.forEach(e => {
        if (e.isActive === false) return; // <-- NUEVO: Doble filtro por seguridad
        if (!validEmpIds.has(String(e.id))) return;
        const empPuestoNorm = (e.puesto || e.Puesto || "").trim().toUpperCase();
        const empDeptoNorm = getDept(e).toUpperCase();
        
        cache.activeEvalsList.forEach(ev => {
             let targets = ['ALL'];
             if (ev.target_positions) {
                 if (Array.isArray(ev.target_positions)) targets = ev.target_positions;
                 else if (typeof ev.target_positions === 'string') {
                     try { targets = JSON.parse(ev.target_positions); } catch(err) { targets = ['ALL']; }
                 }
             }
             let targetDeptos = ['ALL'];
             if (ev.target_departments) {
                 if (Array.isArray(ev.target_departments)) targetDeptos = ev.target_departments;
                 else if (typeof ev.target_departments === 'string') {
                     try { targetDeptos = JSON.parse(ev.target_departments); } catch(err) { targetDeptos = ['ALL']; }
                 }
             }
             const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
             const deptosNorm = targetDeptos.map(t => String(t).toUpperCase().trim());
             
             const matchesPuesto = targetsNorm.includes('ALL') || targetsNorm.includes(empPuestoNorm);
             const matchesDepto = deptosNorm.includes('ALL') || deptosNorm.includes(empDeptoNorm);

             if (matchesPuesto && matchesDepto) {
                 const radarKey = currentFilter === 'GLOBAL' ? (ev.category || 'General') : ev.title;
                 if (!assignedMap[radarKey]) assignedMap[radarKey] = new Set();
                 assignedMap[radarKey].add(String(e.id));
             }
        });
    });

    // --- NUEVO: Detectar Single Eval Mode en el Drilldown ---
    const evalsInCat = currentFilter === 'GLOBAL' ? cache.activeEvalsList : cache.activeEvalsList.filter(e => (e.category || 'General') === currentFilter);
    const isSingleEvalMode = currentFilter !== 'GLOBAL' && evalsInCat.length === 1;
    const radarQuestionsMap = {}; // Caché para el Drilldown

    cache.cleanResponses.forEach(r => {
        if (r.review_status !== 'Revisado' && r.review_status !== 'Certificada') return;
        const evalInfo = activeEvalsMap[r.evaluation_id];
        if (!evalInfo) return;
        if (!validEmpIds.has(String(r.employee_id))) return;

        const radarKey = currentFilter === 'GLOBAL' ? (evalInfo.category || 'General') : evalInfo.title;

        const grades = r.grades_json || {};
        let sumScore = 0; let qCount = 0;
        
        Object.entries(grades).forEach(([qKey, g]) => {
            qCount++;
            let qScore = 0;
            let qTitle = qKey;
            
            if (g && typeof g === 'object') {
                if(g.type === 'numeric_score') qScore = (parseFloat(g.percentage) || 0);
                else if (g.type === 'list_match' && Array.isArray(g.items)) {
                    const ok = g.items.filter(i=>i.status==='correct').length;
                    const tot = Math.max(g.items.length, 1);
                    qScore = ((ok/tot)*100);
                } else { if(g.status === 'correct') qScore = 100; }
                
                if (g.question) qTitle = g.question;
                else if (g.title) qTitle = g.title;
                else if (g.text) qTitle = g.text;
                else if (g.label) qTitle = g.label;
            } else if (g === 'correct') {
                qScore = 100;
            }
            
            sumScore += qScore;
            
            if (isSingleEvalMode) {
                if (!radarQuestionsMap[qKey]) radarQuestionsMap[qKey] = { sum: 0, count: 0, users: new Set(), labelText: qTitle };
                radarQuestionsMap[qKey].sum += qScore;
                radarQuestionsMap[qKey].count++;
                radarQuestionsMap[qKey].users.add(String(r.employee_id));
            }
        });
        
        const finalScore = qCount > 0 ? (sumScore / qCount) : 0;
        sumaRecorte += finalScore;
        conteoRecorte++;

        if (!isSingleEvalMode) {
            if (!radarMap[radarKey]) radarMap[radarKey] = { sum: 0, count: 0, users: new Set() };
            radarMap[radarKey].sum += finalScore;
            radarMap[radarKey].count++;
            radarMap[radarKey].users.add(String(r.employee_id));
        }
    });

    const radarLabels = [];
    const radarDataPoints = [];
    const radarUserStats = [];
    
    const totalU = new Set();
    const totalA = new Set();
    
    if (isSingleEvalMode) {
        let pCounter = 1;
        const evalTitle = evalsInCat[0].title;
        Object.keys(radarQuestionsMap).forEach(qKey => {
            const d = radarQuestionsMap[qKey];
            const avg = d.count > 0 ? Math.round(d.sum / d.count) : 0;
            const uniqueParticipating = d.users.size;
            const uniqueAssigned = assignedMap[evalTitle] ? assignedMap[evalTitle].size : 0;
            
            let label = qKey.length > 20 ? `Pregunta ${pCounter}` : qKey;
            if (label.match(/^[0-9a-fA-F-]+$/)) label = `P${pCounter}`;

            radarLabels.push(label);
            radarDataPoints.push(avg);
            radarUserStats.push(`${uniqueParticipating} de ${uniqueAssigned} usuarios`);
            
            d.users.forEach(u => totalU.add(u));
            if (assignedMap[evalTitle]) assignedMap[evalTitle].forEach(u => totalA.add(u));
            pCounter++;
        });
    } else {
        Object.keys(radarMap).sort().forEach(key => {
            const d = radarMap[key];
            const avg = d.count > 0 ? Math.round(d.sum / d.count) : 0;
            const uniqueParticipating = d.users.size;
            const uniqueAssigned = assignedMap[key] ? assignedMap[key].size : 0;
            
            radarLabels.push(key);
            radarDataPoints.push(avg);
            radarUserStats.push(`${uniqueParticipating} de ${uniqueAssigned} usuarios`);
            
            d.users.forEach(u => totalU.add(u));
            if (assignedMap[key]) assignedMap[key].forEach(u => totalA.add(u));
        });
    }

    // El recorte que se esté mirando lo dice el título de la sección; aquí sólo
    // va cómo están agrupadas las puntas de la gráfica.
    const radarTitleEl = document.getElementById('radar-title');
    if (radarTitleEl) {
        radarTitleEl.innerText = currentFilter === 'GLOBAL' ? 'Promedio por categoría' : 'Detalle de Evaluaciones: ' + currentFilter;
    }

    const ctx = document.getElementById('stats-radar-chart');
    const seccionRadar = document.getElementById('stats-seccion-radar');

    if (radarLabels.length > 0 && ctx) {
        if (seccionRadar) seccionRadar.style.display = 'block';
        if (window.statsRadarChart) window.statsRadarChart.destroy();
        
        const formattedLabels = radarLabels.map((label, idx) => {
            const words = label.split(' ');
            const lines = [];
            while(words.length > 0) lines.push(words.splice(0, 3).join(' '));
            lines.push(`${radarDataPoints[idx]}%`);
            return lines;
        });

        window.statsRadarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: formattedLabels,
                datasets: [{
                    label: 'Promedio',
                    data: radarDataPoints,
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    borderColor: '#22c55e',
                    pointBackgroundColor: '#166534',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { display: true, color: '#f1f5f9' },
                        grid: { color: '#e2e8f0' },
                        pointLabels: { font: { size: 10, weight: 'bold' }, color: '#334155', display: true },
                        suggestedMin: 0, suggestedMax: 100, ticks: { display: false, stepSize: 20 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 10,
                        callbacks: {
                            label: function(context) {
                                const index = context.dataIndex;
                                const uStat = radarUserStats[index] || "";
                                return [`Promedio: ${context.parsed.r}%`, `(${uStat})`];
                            }
                        }
                    }
                }
            },
            plugins: [{
                afterDatasetsDraw(chart) {
                    const { ctx } = chart;
                    const avg = conteoRecorte > 0 ? Math.round(sumaRecorte / conteoRecorte) : 0;

                    const totalU=new Set();
                    const totalA=new Set();
                    if(isSingleEvalMode){
                    Object.values(radarQuestionsMap).forEach(d=>d.users.forEach(u=>totalU.add(u)));
                    }else{
                    Object.values(radarMap).forEach(d=>d.users.forEach(u=>totalU.add(u)));
                    }
                    Object.values(assignedMap).forEach(s=>s.forEach(u=>totalA.add(u)));
                    const textPart=`${totalU.size} de ${totalA.size} usuarios`;
                    
                    const x = chart.scales.r.xCenter;
                    const y = chart.scales.r.yCenter;
                    
                    ctx.save();
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";

                    ctx.font = "bolder 1.5rem -apple-system, BlinkMacSystemFont, sans-serif";
                    ctx.fillStyle = "#166534";
                    ctx.strokeText(avg + "%", x, y - 8);
                    ctx.fillText(avg + "%", x, y - 8);
                    
                    ctx.font = "bold 0.7rem -apple-system, BlinkMacSystemFont, sans-serif";
                    ctx.fillStyle = "#64748b";
                    ctx.strokeText(textPart, x, y + 14);
                    ctx.fillText(textPart, x, y + 14);
                    
                    ctx.restore();
                }
            }]
        });
    } else {
        if (seccionRadar) seccionRadar.style.display = 'none';
    }
};

window.renderMiniTable = (dataMap) => {
    const keys = Object.keys(dataMap).sort((a,b) => {
        const sa = dataMap[a].countRevisadas > 0 ? (dataMap[a].sum/dataMap[a].countRevisadas) : 0;
        const sb = dataMap[b].countRevisadas > 0 ? (dataMap[b].sum/dataMap[b].countRevisadas) : 0;
        return sb - sa;
    });
    const getColor = window.getColorScore || ((s) => s >= 80 ? '#166534' : '#ef4444');
    let h = '';
    keys.forEach(k => {
        const d = dataMap[k];
        if (d.countRevisadas === 0) return;
        const avg = Math.round(d.sum / d.countRevisadas);
        const col = getColor(avg);
        h += `
        <div style="background:white; border:1px solid #f1f5f9; padding:15px; border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px;">
                <div style="font-size:0.9rem; color:#334155; font-weight:600; min-width:0;">${k}</div>
                <div style="text-align:right; flex-shrink:0;">
                    <span style="display:inline-block; background:${col}20; color:${col}; padding:3px 8px; border-radius:6px; font-weight:bold; font-size:0.85rem;">${avg}%</span>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:3px; white-space:nowrap;">(${d.countRevisadas} rev.)</div>
                </div>
            </div>
            <div style="width:100%; height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
                <div style="width:${avg}%; height:100%; background:${col}; border-radius:3px;"></div>
            </div>
        </div>`;
    });
    return h || '<div style="color:#cbd5e1; font-style:italic;">Sin datos revisados aún</div>';
};

window.renderAreaStats=(areaMap)=>{
const keys=Object.keys(areaMap).sort((a,b)=>{
const avgA=areaMap[a].count>0?areaMap[a].sum/areaMap[a].count:-1;
const avgB=areaMap[b].count>0?areaMap[b].sum/areaMap[b].count:-1;
if(avgB===avgA)return a.localeCompare(b);
return avgB-avgA;
});
const getColor=window.getColorScore||((s)=>s>=80?'#166534':'#ef4444');
let h='';
keys.forEach((k,index)=>{
const d=areaMap[k];
const avg=d.count>0?Math.round(d.sum/d.count):0;
const col=d.count>0?getColor(avg):'#94a3b8';
const medal=d.count>0?`#${index+1}`:'-';
let usersHtml='';
if(d.userStats&&Object.keys(d.userStats).length>0){
const userKeys=Object.keys(d.userStats).sort((a,b)=>{
const uA=d.userStats[a];
const uB=d.userStats[b];
const avgA=Math.round(uA.sum/uA.count);
const avgB=Math.round(uB.sum/uB.count);
return avgB-avgA;
});
userKeys.forEach(uid=>{
const u=d.userStats[uid];
const uAvg=Math.round(u.sum/u.count);
const uCol=getColor(uAvg);
const puestoText=u.puesto?u.puesto:'Sin Puesto';
usersHtml+=`
<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #f8fafc;">
<div style="display:flex; flex-direction:column; padding-right:10px;">
<span style="color:#334155; font-weight:600; font-size:0.8rem; line-height:1.2;">${u.name}</span>
<span style="color:#94a3b8; font-size:0.7rem; margin-top:2px;">${puestoText} &bull; ${u.dept}</span>
</div>
<span style="font-weight:bold; font-size:0.75rem; color:${uCol}; background:${uCol}15; padding:3px 8px; border-radius:6px; flex-shrink:0;">${uAvg}%</span>
</div>`;
});
}else{
usersHtml=`<div style="font-size:0.75rem; color:#94a3b8; font-style:italic; padding:5px 0;">Aún no hay evaluaciones</div>`;
}
// La lista de participantes va plegada: con un catálogo grande, abierta se
// llevaba casi toda la pantalla. El <details> guarda su propio estado y no
// necesita ninguna función colgada de window.
const numParticipantes=d.userStats?Object.keys(d.userStats).length:0;
h+=`
<div class="stats-area" style="border-left-color:${col}; opacity:${d.count>0?'1':'0.6'};">
<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px;">
<div style="flex: 1; min-width:0;">
<div style="font-size:1rem; color:#334155; font-weight:700; display:flex; align-items:center; gap:8px;">
<span style="font-size:1.2rem; color:${d.count>0?'inherit':'#cbd5e1'}; flex-shrink:0;">${medal}</span> ${k}
</div>
</div>
<div style="text-align:right; flex-shrink:0;">
<span style="display:inline-block; background:${d.count>0?col+'20':'#f1f5f9'}; color:${col}; padding:4px 10px; border-radius:8px; font-weight:bold; font-size:1rem;">${d.count>0?avg+'%':'N/A'}</span>
<div style="font-size:0.7rem; color:#94a3b8; margin-top:2px; white-space:nowrap;">(${d.count} encuestas)</div>
</div>
</div>
<details class="stats-plegable">
<summary>Participantes${numParticipantes>0?` <span class="stats-plegable-conteo">${numParticipantes}</span>`:''}</summary>
<div class="stats-plegable-cuerpo">
${usersHtml}
</div>
</details>
</div>`;
});
return h;
};

window.renderDeptDetailed = (dataMap) => {
    const keys = Object.keys(dataMap).sort((a,b) => {
        const dA = dataMap[a];
        const dB = dataMap[b];
        const assA = dA.assignedCount || 0;
        const assB = dB.assignedCount || 0;

        let valA = 0;
        let valB = 0;

        if (window.currentStatsSortCriterion === 'participacion') {
            valA = assA > 0 ? dA.responses / assA : 0;
            valB = assB > 0 ? dB.responses / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas') {
            valA = assA > 0 ? dA.reviewed / assA : 0;
            valB = assB > 0 ? dB.reviewed / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas_altas') {
            valA = assA > 0 ? (dA.revisadasAltas || 0) / assA : 0;
            valB = assB > 0 ? (dB.revisadasAltas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'certificadas') {
            valA = assA > 0 ? (dA.certificadas || 0) / assA : 0;
            valB = assB > 0 ? (dB.certificadas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'falsas') {
            valA = assA > 0 ? (dA.falsas || 0) / assA : 0;
            valB = assB > 0 ? (dB.falsas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'mal_revisadas') {
        valA = assA > 0 ? (dA.malRevisadas || 0) / assA : 0;
        valB = assB > 0 ? (dB.malRevisadas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'calificacion') {
        valA = dA.countScore > 0 ? (dA.sumScore / dA.countScore) : 0;
        valB = dB.countScore > 0 ? (dB.sumScore / dB.countScore) : 0;
        }

        if (valB !== valA) return valB - valA;
        const partA = assA > 0 ? dA.responses / assA : 0;
        const partB = assB > 0 ? dB.responses / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });
    
    let tieneDatos = false;
    
    let chartHtml = `
    <div style="display:flex; flex-direction:column; width:100%;">
        <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:5px; border-bottom:2px solid #e2e8f0; min-height:165px;" class="hide-scrollbar">
    `;
    
    keys.forEach(k => {
        const d = dataMap[k];
        const assigned = d.assignedCount;
        if (assigned === 0 && d.responses === 0) return;
        tieneDatos = true;
        
        const responses = d.responses;
        const reviewed = d.reviewed;
        const certificadas = d.certificadas || 0;
        const falsas = d.falsas || 0;
        const malRevisadas = d.malRevisadas || 0;
        const revisadasAltas = d.revisadasAltas || 0;
        
        const totalProcesadas = reviewed + certificadas + falsas + malRevisadas;

        const pctParticipacion = Math.min(100, assigned > 0 ? Math.round((responses / assigned) * 100) : 0);
        const pctRevision = Math.min(100, assigned > 0 ? Math.round((totalProcesadas / assigned) * 100) : 0);
        const avgScore = d.countScore > 0 ? Math.round(d.sumScore / d.countScore) : 0;
        const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados
        const pctCertificada = Math.min(100, assigned > 0 ? Math.round((certificadas / assigned) * 100) : 0);
        const pctFalsa = Math.min(100, assigned > 0 ? Math.round((falsas / assigned) * 100) : 0);
        const pctMalRevisada = Math.min(100, assigned > 0 ? Math.round((malRevisadas / assigned) * 100) : 0);

        const partColor = '#3b82f6';
        const revColor = '#10b981';
        const certColor = '#eab308';
        const falsaColor = '#ef4444';
        const malRevColor = '#a855f7';
        const safeK = window.sanitizeForHTML(k);

        chartHtml += `
        <div onclick="verStatsDetalleDepto(this.dataset.name)" data-name="${safeK}"
        title="${safeK}&#10;Asignadas: ${assigned}&#10;Respuestas: ${responses}&#10;Revisadas: ${reviewed}&#10;Certificadas: ${certificadas}&#10;Falsas/Anuladas: ${falsas}&#10;Mal Revisadas: ${malRevisadas}&#10;⭐ Calificación: ${avgScore}%" 
        class="stats-columna" 
        onmouseover="this.style.background='#f8fafc'; this.style.transform='translateY(-2px)';" 
        onmouseout="this.style.background='transparent'; this.style.transform='none';">

        <div style="font-size:0.65rem; color:#64748b; margin-bottom:4px; text-align:center; font-weight:700; line-height:1.2; display:flex; justify-content:center; gap:8px;">
        <div>
        <div style="color:${partColor}">${pctParticipacion}%</div>
        <div style="color:${revColor}; font-size:0.6rem;">${pctRevision}%</div>
        </div>
        ${d.countScore > 0 ? `
        <div style="display:flex; align-items:flex-end;">
        <div style="color:${colorScore}; font-size:0.65rem; font-weight:800;">${avgScore}%</div>
        </div>` : ''}
        </div>

        <div style="display:flex; align-items:flex-end; height:90px; width:100%; justify-content:center; gap:4px;">

        <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Flujo de Revisión">
        <div style="position:absolute; bottom:0; left:0; width:100%; height:${pctParticipacion}%; background:${partColor}; display:flex; flex-direction:column; justify-content:flex-end;">
        ${totalProcesadas > 0 ? `
        <div style="width:100%; height:${(totalProcesadas / responses) * 100}%; background:${revColor}; display:flex; flex-direction:column; justify-content:flex-end;">
        ${(Math.max(0, revisadasAltas - certificadas - falsas - malRevisadas)) > 0 ? `<div style="width:100%; height:${(Math.max(0, revisadasAltas - certificadas - falsas - malRevisadas) / totalProcesadas) * 100}%; background:#047857;"></div>` : ''}
        ${certificadas > 0 ? `<div style="width:100%; height:${(certificadas / totalProcesadas) * 100}%; background:${certColor};"></div>` : ''}
        ${falsas > 0 ? `<div style="width:100%; height:${(falsas / totalProcesadas) * 100}%; background:${falsaColor};"></div>` : ''}
        ${malRevisadas > 0 ? `<div style="width:100%; height:${(malRevisadas / totalProcesadas) * 100}%; background:${malRevColor};"></div>` : ''}
        </div>
        ` : ''}
        </div>
        </div>

        <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Calificación Promedio">
        ${d.countScore > 0 ? `<div style="position:absolute; bottom:0; left:0; width:100%; height:${avgScore}%; background:${colorScore};"></div>` : ''}
        </div>

        </div>

        <div class="stats-columna-rotulo">${safeK}</div>
        </div>`;
    });
    
    chartHtml += `
        </div>
    </div>`;
    
    return tieneDatos ? chartHtml : '<div style="padding:10px; font-size:0.8rem; color:#94a3b8;">Sin datos.</div>';
};



window.renderPuestoDetailed = (dataMap) => {
    const keys = Object.keys(dataMap).sort((a,b) => {
        const dA = dataMap[a];
        const dB = dataMap[b];
        const assA = dA.assignedCount || 0;
        const assB = dB.assignedCount || 0;

        let valA = 0;
        let valB = 0;

        // Evalúa el valor de orden según el criterio activo en la leyenda
        if (window.currentStatsSortCriterion === 'participacion') {
            valA = assA > 0 ? dA.responses / assA : 0;
            valB = assB > 0 ? dB.responses / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas') {
            valA = assA > 0 ? dA.reviewed / assA : 0;
            valB = assB > 0 ? dB.reviewed / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas_altas') {
            valA = assA > 0 ? (dA.revisadasAltas || 0) / assA : 0;
            valB = assB > 0 ? (dB.revisadasAltas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'certificadas') {
            valA = assA > 0 ? (dA.certificadas || 0) / assA : 0;
            valB = assB > 0 ? (dB.certificadas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'falsas') {
            valA = assA > 0 ? (dA.falsas || 0) / assA : 0;
            valB = assB > 0 ? (dB.falsas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'mal_revisadas') {
        valA = assA > 0 ? a.malRevisadasCount / assA : 0;
        valB = assB > 0 ? b.malRevisadasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'calificacion') {
        valA = a.countScore > 0 ? (a.sumScore / a.countScore) : 0;
        valB = b.countScore > 0 ? (b.sumScore / b.countScore) : 0;
        }

        if (valB !== valA) return valB - valA;
        // Rompe empates usando la participación base
        const partA = assA > 0 ? dA.responses / assA : 0;
        const partB = assB > 0 ? dB.responses / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });
    
    let tieneDatos = false;
    
    let chartHtml = `
    <div style="display:flex; flex-direction:column; width:100%;">
        <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:5px; border-bottom:2px solid #e2e8f0; min-height:165px;" class="hide-scrollbar">
    `;
    
    keys.forEach(k => {
        const d = dataMap[k];
        const assigned = d.assignedCount;
        if (assigned === 0 && d.responses === 0) return;
        tieneDatos = true;
        
        const responses = d.responses;
        const reviewed = d.reviewed;
        const certificadas = d.certificadas || 0;
        const falsas = d.falsas || 0;
        const malRevisadas = d.malRevisadas || 0;
        const revisadasAltas = d.revisadasAltas || 0;
        
        const totalProcesadas = reviewed + certificadas + falsas + malRevisadas;

        const pctParticipacion = Math.min(100, assigned > 0 ? Math.round((responses / assigned) * 100) : 0);
        const pctRevision = Math.min(100, assigned > 0 ? Math.round((totalProcesadas / assigned) * 100) : 0);
        const avgScore = d.countScore > 0 ? Math.round(d.sumScore / d.countScore) : 0;
        const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados
        const pctCertificada = Math.min(100, assigned > 0 ? Math.round((certificadas / assigned) * 100) : 0);
        const pctFalsa = Math.min(100, assigned > 0 ? Math.round((falsas / assigned) * 100) : 0);
        const pctMalRevisada = Math.min(100, assigned > 0 ? Math.round((malRevisadas / assigned) * 100) : 0);

        const partColor = '#3b82f6';
        const revColor = '#10b981';
        const certColor = '#eab308';
        const falsaColor = '#ef4444';
        const malRevColor = '#a855f7';
        const safeK = window.sanitizeForHTML(k);

        chartHtml += `
        <div onclick="verStatsDetallePuesto(this.dataset.name)" data-name="${safeK}"
        title="${safeK}&#10;Asignadas: ${assigned}&#10;Respuestas: ${responses}&#10;Revisadas: ${reviewed}&#10;Certificadas: ${certificadas}&#10;Falsas/Anuladas: ${falsas}&#10;Mal Revisadas: ${malRevisadas}&#10;⭐ Calificación: ${avgScore}%" 
        class="stats-columna" 
        onmouseover="this.style.background='#f8fafc'; this.style.transform='translateY(-2px)';" 
        onmouseout="this.style.background='transparent'; this.style.transform='none';">

        <div style="font-size:0.65rem; color:#64748b; margin-bottom:4px; text-align:center; font-weight:700; line-height:1.2; display:flex; justify-content:center; gap:8px;">
        <div>
        <div style="color:${partColor}">${pctParticipacion}%</div>
        <div style="color:${revColor}; font-size:0.6rem;">${pctRevision}%</div>
        </div>
        ${d.countScore > 0 ? `
        <div style="display:flex; align-items:flex-end;">
        <div style="color:${colorScore}; font-size:0.65rem; font-weight:800;">${avgScore}%</div>
        </div>` : ''}
        </div>

        <div style="display:flex; align-items:flex-end; height:90px; width:100%; justify-content:center; gap:4px;">

        <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Flujo de Revisión">
        <div style="position:absolute; bottom:0; left:0; width:100%; height:${pctParticipacion}%; background:${partColor}; display:flex; flex-direction:column; justify-content:flex-end;">
        ${totalProcesadas > 0 ? `
        <div style="width:100%; height:${(totalProcesadas / responses) * 100}%; background:${revColor}; display:flex; flex-direction:column; justify-content:flex-end;">
        ${(Math.max(0, revisadasAltas - certificadas - falsas - malRevisadas)) > 0 ? `<div style="width:100%; height:${(Math.max(0, revisadasAltas - certificadas - falsas - malRevisadas) / totalProcesadas) * 100}%; background:#047857;"></div>` : ''}
        ${certificadas > 0 ? `<div style="width:100%; height:${(certificadas / totalProcesadas) * 100}%; background:${certColor};"></div>` : ''}
        ${falsas > 0 ? `<div style="width:100%; height:${(falsas / totalProcesadas) * 100}%; background:${falsaColor};"></div>` : ''}
        ${malRevisadas > 0 ? `<div style="width:100%; height:${(malRevisadas / totalProcesadas) * 100}%; background:${malRevColor};"></div>` : ''}
        </div>
        ` : ''}
        </div>
        </div>

        <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Calificación Promedio">
        ${d.countScore > 0 ? `<div style="position:absolute; bottom:0; left:0; width:100%; height:${avgScore}%; background:${colorScore};"></div>` : ''}
        </div>

        </div>

        <div class="stats-columna-rotulo">${safeK}</div>
        </div>`;
    });
    
    chartHtml += `
        </div>
    </div>`;
    
    return tieneDatos ? chartHtml : '<div style="padding:10px; font-size:0.8rem; color:#94a3b8;">Sin datos.</div>';
};

window.verStatsDetalleDepto = (deptName) => {
    window.actualizarRadarDOM(deptName);
    
    const data = window.encuestasStatsCacheForDrilldown.statsCache[deptName];
    if (!data) return;
    const supList = Object.keys(data.supervisors).map(supName => ({ name: supName, ...data.supervisors[supName] }));
    supList.sort((a,b) => {
        const assA = a.assignedCount || 0;
        const assB = b.assignedCount || 0;
        let valA = 0;
        let valB = 0;

        if (window.currentStatsSortCriterion === 'participacion') {
            valA = assA > 0 ? a.responses / assA : 0;
            valB = assB > 0 ? b.responses / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas') {
            valA = assA > 0 ? a.reviewed / assA : 0;
            valB = assB > 0 ? b.reviewed / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas_altas') {
            valA = assA > 0 ? (a.revisadasAltas || 0) / assA : 0;
            valB = assB > 0 ? (b.revisadasAltas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'certificadas') {
            valA = assA > 0 ? (a.certificadas || 0) / assA : 0;
            valB = assB > 0 ? (b.certificadas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'falsas') {
            valA = assA > 0 ? (a.falsas || 0) / assA : 0;
            valB = assB > 0 ? (b.falsas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'mal_revisadas') {
        valA = assA > 0 ? (a.malRevisadas || 0) / assA : 0;
        valB = assB > 0 ? (b.malRevisadas || 0) / assB : 0;
        } else if (window.currentStatsSortCriterion === 'calificacion') {
        valA = a.countScore > 0 ? (a.sumScore / a.countScore) : 0;
        valB = b.countScore > 0 ? (b.sumScore / b.countScore) : 0;
        }

        if (valB !== valA) return valB - valA;
        
        const partA = assA > 0 ? a.responses / assA : 0;
        const partB = assB > 0 ? b.responses / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });
    
    const safeDept = window.sanitizeForHTML(deptName);
    
    let html = `
    <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:10px;">
            <button onclick="document.getElementById('dept-list-container').innerHTML = window.renderDeptDetailed(window.encuestasStatsCacheForDrilldown.statsCache); window.actualizarRadarDOM(null);" style="background:#f1f5f9; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; color:#475569; font-weight:bold;">Volver</button>
            <span style="font-weight:bold; color:#1e293b; font-size:1rem;">${safeDept}</span>
        </div>
        <div style="font-size:0.75rem; color:#64748b; margin-left:5px;">Supervisores en esta área: ${supList.length}</div>
    </div>
    <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:5px; border-bottom:2px solid #e2e8f0; min-height:165px;" class="hide-scrollbar">`;
    
    if (supList.length === 0) {
        html += `<div style="padding:15px; text-align:center; color:#94a3b8; font-style:italic; width:100%;">No se encontraron supervisores.</div>`;
    } else {
        supList.forEach(sup => {
            const assigned = sup.assignedCount;
            if (assigned === 0 && sup.responses === 0) return;
            
            const responses = sup.responses;
            const reviewed = sup.reviewed;
            const certificadas = sup.certificadas || 0;
            const falsas = sup.falsas || 0;
            const malRevisadas = sup.malRevisadas || 0;
            const revisadasAltas = sup.revisadasAltas || 0;
            
            const totalProcesadas = reviewed + certificadas + falsas + malRevisadas;
                        
            const pctParticipacion = Math.min(100, assigned > 0 ? Math.round((responses / assigned) * 100) : 0);
            const pctRevision = Math.min(100, assigned > 0 ? Math.round((totalProcesadas / assigned) * 100) : 0);
            const avgScore = sup.countScore > 0 ? Math.round(sup.sumScore / sup.countScore) : 0;
            const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados
            const pctCertificada = Math.min(100, assigned > 0 ? Math.round((certificadas / assigned) * 100) : 0);
            const pctFalsa = Math.min(100, assigned > 0 ? Math.round((falsas / assigned) * 100) : 0);
            const pctMalRevisada = Math.min(100, assigned > 0 ? Math.round((malRevisadas / assigned) * 100) : 0);

            const partColor = '#3b82f6';
            const revColor = '#10b981';
            const certColor = '#eab308';
            const falsaColor = '#ef4444';
            const malRevColor = '#a855f7';
            const safeSup = window.sanitizeForHTML(sup.name);

            html += `
            <div onclick="verStatsDetalleSupervisor(this.dataset.dept, this.dataset.sup)" data-dept="${safeDept}" data-sup="${safeSup}"
            title="Grupo de ${safeSup}&#10;Asignadas: ${assigned}&#10;Respuestas: ${responses}&#10;Revisadas: ${reviewed}&#10;Certificadas: ${certificadas}&#10;Falsas/Anuladas: ${falsas}&#10;Mal Revisadas: ${malRevisadas}&#10;⭐ Calificación: ${avgScore}%" 
            class="stats-columna" 
            onmouseover="this.style.background='#f8fafc'; this.style.transform='translateY(-2px)';" 
            onmouseout="this.style.background='transparent'; this.style.transform='none';">

            <div style="font-size:0.65rem; color:#64748b; margin-bottom:4px; text-align:center; font-weight:700; line-height:1.2; display:flex; justify-content:center; gap:8px;">
            <div>
            <div style="color:${partColor}">${pctParticipacion}%</div>
            <div style="color:${revColor}; font-size:0.6rem;">${pctRevision}%</div>
            </div>
            ${sup.countScore > 0 ? `
            <div style="display:flex; align-items:flex-end;">
            <div style="color:${colorScore}; font-size:0.65rem; font-weight:800;">${avgScore}%</div>
            </div>` : ''}
            </div>

            <div style="display:flex; align-items:flex-end; height:90px; width:100%; justify-content:center; gap:4px;">

            <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Flujo de Revisión">
            <div style="position:absolute; bottom:0; left:0; width:100%; height:${pctParticipacion}%; background:${partColor}; display:flex; flex-direction:column; justify-content:flex-end;">
            ${totalProcesadas > 0 ? `
            <div style="width:100%; height:${(totalProcesadas / responses) * 100}%; background:${revColor}; display:flex; flex-direction:column; justify-content:flex-end;">
            ${(Math.max(0, revisadasAltas - certificadas - falsas - malRevisadas)) > 0 ? `<div style="width:100%; height:${(Math.max(0, revisadasAltas - certificadas - falsas - malRevisadas) / totalProcesadas) * 100}%; background:#047857;" title="Pendientes de Auditoría (>= 80%)"></div>` : ''}
            ${certificadas > 0 ? `<div style="width:100%; height:${(certificadas / totalProcesadas) * 100}%; background:${certColor};" title="Certificadas: ${certificadas}"></div>` : ''}
            ${falsas > 0 ? `<div style="width:100%; height:${(falsas / totalProcesadas) * 100}%; background:${falsaColor};" title="Falsas: ${falsas}"></div>` : ''}
            ${malRevisadas > 0 ? `<div style="width:100%; height:${(malRevisadas / totalProcesadas) * 100}%; background:${malRevColor};" title="Mal Revisadas: ${malRevisadas}"></div>` : ''}
            </div>
            ` : ''}
            </div>
            </div>

            <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Calificación Promedio">
            ${sup.countScore > 0 ? `<div style="position:absolute; bottom:0; left:0; width:100%; height:${avgScore}%; background:${colorScore};"></div>` : ''}
            </div>

            </div>

            <div class="stats-columna-rotulo">Grupo de ${safeSup}</div>
            </div>`;
        });
    }
    html += `</div>`;
    document.getElementById('dept-list-container').innerHTML = html;
};

window.verStatsDetalleSupervisor = (deptName, supName) => {
    window.actualizarRadarDOM(deptName, supName);
    
    const data = window.encuestasStatsCacheForDrilldown;
    const allEmps = window.todosLosEmpleadosData;
    const responses = data.cleanResponses || [];
    const activeEvals = data.activeEvalsList || [];
    const getDept = (e) => (e.department || e.departamento || e.dept || "Sin Departamento").trim();
    const getSup = (e) => (e.sup || e.supervisor || e.supervisor_name || "Sin Supervisor").trim();
    
    // Función inteligente para extraer el área del JOIN de Supabase o del objeto directo
    const getArea = (e) => {
        if (e.areas && e.areas.name) return e.areas.name;
        if (e.area && typeof e.area === 'object' && e.area.name) return e.area.name;
        if (e.area && typeof e.area === 'string' && e.area.trim() !== '') return e.area.trim();
        return "Sin Área";
    };
    
    const subordinates = allEmps.filter(e => e.isActive !== false && getDept(e) === deptName && getSup(e) === supName);

    let empStats = subordinates.map(emp => {
        const empPuesto = (emp.puesto || emp.Puesto || "").trim();
        const empPuestoNorm = empPuesto.toUpperCase();
        const empDeptoNorm = getDept(emp).toUpperCase();

        let totalAssigned = 0;
        let obligatoryAssigned = 0;
        let obligatoryCompleted = 0;

        activeEvals.forEach(ev => {
            let targets = ['ALL'];
            if (ev.target_positions) {
                 if(Array.isArray(ev.target_positions)) targets=ev.target_positions;
                 else if(typeof ev.target_positions==='string') try{targets=JSON.parse(ev.target_positions)}catch(e){}
            }
            let targetDeptos = ['ALL'];
            if (ev.target_departments) {
                 if (Array.isArray(ev.target_departments)) targetDeptos = ev.target_departments;
                 else if (typeof ev.target_departments === 'string') {
                     try { targetDeptos = JSON.parse(ev.target_departments); } catch(err) { targetDeptos = ['ALL']; }
                 }
            }
            
            const isObligatory = (ev.is_obligatory !== false);
            const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
            const deptosNorm = targetDeptos.map(t => String(t).toUpperCase().trim());

            const matchesPuesto = targetsNorm.includes('ALL') || targetsNorm.includes(empPuestoNorm);
            const matchesDepto = deptosNorm.includes('ALL') || deptosNorm.includes(empDeptoNorm);

            if (matchesPuesto && matchesDepto) {
                totalAssigned++;
                if (isObligatory) {
                    obligatoryAssigned++;
                    const hasResponded = responses.some(r => String(r.employee_id) === String(emp.id) && String(r.evaluation_id) === String(ev.id));
                    if (hasResponded) obligatoryCompleted++;
                }
            }
        });

        const empResps = responses.filter(r => String(r.employee_id) === String(emp.id));
        const totalResp = empResps.length;
        
        const reviewedResp = empResps.filter(r => r.review_status === 'Revisado');
        const certificadasResp = empResps.filter(r => r.review_status === 'Certificada');
        const falsasResp = empResps.filter(r => r.review_status === 'Falsa');
        const malRevisadasResp = empResps.filter(r => r.review_status === 'Mal Revisada');
        
        const procesadasResp = empResps.filter(r => ['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status));
        const revisadasAltasCount = procesadasResp.filter(r => (r.finalScoreCalculated || 0) >= 80).length;

        let sumScore = 0;
        let countScore = 0;
        empResps.forEach(r => {
        if (r.review_status === 'Revisado' || r.review_status === 'Certificada') {
        sumScore += (r.finalScoreCalculated || 0);
        countScore++;
        }
        });

        return {
        name: emp.name || "Sin Nombre",
        job: emp.puesto || "N/A",
        dept: getDept(emp),
        area: getArea(emp),
        totalResp,
        totalAssigned: Math.max(totalAssigned, totalResp),
        reviewedCount: reviewedResp.length,
        certificadasCount: certificadasResp.length,
        falsasCount: falsasResp.length,
        malRevisadasCount: malRevisadasResp.length,
        revisadasAltasCount: revisadasAltasCount,
        sumScore: sumScore,
        countScore: countScore,
        incompleto: (obligatoryCompleted < obligatoryAssigned)
        };
    }).filter(emp => emp.totalAssigned > 0 || emp.totalResp > 0);

    empStats.sort((a,b) => {
        if (a.incompleto !== b.incompleto) return a.incompleto ? 1 : -1;
        
        const assA = a.totalAssigned || 0;
        const assB = b.totalAssigned || 0;
        let valA = 0;
        let valB = 0;

        if (window.currentStatsSortCriterion === 'participacion') {
            valA = assA > 0 ? a.totalResp / assA : 0;
            valB = assB > 0 ? b.totalResp / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas') {
            valA = assA > 0 ? a.reviewedCount / assA : 0;
            valB = assB > 0 ? b.reviewedCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas_altas') {
            valA = assA > 0 ? a.revisadasAltasCount / assA : 0;
            valB = assB > 0 ? b.revisadasAltasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'certificadas') {
            valA = assA > 0 ? a.certificadasCount / assA : 0;
            valB = assB > 0 ? b.certificadasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'falsas') {
            valA = assA > 0 ? a.falsasCount / assA : 0;
            valB = assB > 0 ? b.falsasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'mal_revisadas') {
        valA = assA > 0 ? a.malRevisadasCount / assA : 0;
        valB = assB > 0 ? b.malRevisadasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'calificacion') {
        valA = a.countScore > 0 ? (a.sumScore / a.countScore) : 0;
        valB = b.countScore > 0 ? (b.sumScore / b.countScore) : 0;
        }

        if (valB !== valA) return valB - valA;
        const partA = assA > 0 ? a.totalResp / assA : 0;
        const partB = assB > 0 ? b.totalResp / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });

    const safeDept = window.sanitizeForHTML(deptName);
    const safeSup = window.sanitizeForHTML(supName);

    let html = `
    <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:10px;">
             <button onclick="verStatsDetalleDepto(this.dataset.dept)" data-dept="${safeDept}" style="background:#f1f5f9; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; color:#475569; font-weight:bold;">Volver</button>
            <span style="font-weight:bold; color:#1e293b; font-size:1rem;">Grupo de ${safeSup}</span>
        </div>
        <div style="font-size:0.75rem; color:#64748b; margin-left:5px;">Subordinados evaluados: ${empStats.length}</div>
    </div>
    <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:5px; border-bottom:2px solid #e2e8f0; min-height:165px;" class="hide-scrollbar">`;

    if (empStats.length === 0) {
        html += `<div style="padding:15px; text-align:center; color:#94a3b8; font-style:italic; width:100%;">No se encontraron subordinados activos en esta categoría.</div>`;
    } else {
        empStats.forEach(emp => {
            const totalProcesadas = emp.reviewedCount + emp.certificadasCount + emp.falsasCount + emp.malRevisadasCount;
            const revisadasAltas = emp.revisadasAltasCount || 0;
            
            const pctParticipacion = Math.min(100, emp.totalAssigned > 0 ? Math.round((emp.totalResp / emp.totalAssigned) * 100) : 0);
            const avgScore = emp.countScore > 0 ? Math.round(emp.sumScore / emp.countScore) : 0;
            const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados

            const partColor = '#3b82f6';
            const revColor = '#10b981';
            const certColor = '#eab308';
            const falsaColor = '#ef4444';
            const malRevColor = '#a855f7';
            const opacity = emp.incompleto ? '0.6' : '1';

            const safeName = window.sanitizeForHTML(emp.name);
            const safeJob = window.sanitizeForHTML(emp.job);
            const safeDeptUser = window.sanitizeForHTML(emp.dept);
            const safeArea = window.sanitizeForHTML(emp.area);

            html += `
            <div title="${safeName}&#10;📍 Área: ${safeArea}&#10;Departamento: ${safeDeptUser}&#10;Puesto: ${safeJob}&#10;Asignadas: ${emp.totalAssigned}&#10;Respuestas: ${emp.totalResp}&#10;Revisadas: ${emp.reviewedCount}&#10;Certificadas: ${emp.certificadasCount}&#10;Falsas/Anuladas: ${emp.falsasCount}&#10;Mal Revisadas: ${emp.malRevisadasCount}&#10;⭐ Calificación: ${avgScore}%${emp.incompleto ? '&#10;¡Faltan Obligatorias!' : ''}" 
            class="stats-columna" style="cursor:default; opacity:${opacity};" 
            onmouseover="this.style.background='#f8fafc'; this.style.transform='translateY(-2px)';" 
            onmouseout="this.style.background='transparent'; this.style.transform='none';">

            <div style="font-size:0.65rem; color:#64748b; margin-bottom:4px; text-align:center; font-weight:700; line-height:1.2; display:flex; justify-content:center; gap:8px;">
            <div>
            <div style="color:${partColor}">${pctParticipacion}%</div>
            <div style="color:${revColor}; font-size:0.6rem;">${Math.min(100, emp.totalAssigned > 0 ? Math.round((totalProcesadas / emp.totalAssigned) * 100) : 0)}%</div>
            </div>
            ${emp.countScore > 0 ? `
            <div style="display:flex; align-items:flex-end;">
            <div style="color:${colorScore}; font-size:0.65rem; font-weight:800;">${avgScore}%</div>
            </div>` : ''}
            </div>

            <div style="display:flex; align-items:flex-end; height:90px; width:100%; justify-content:center; gap:4px;">

            <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Flujo de Revisión">
            <div style="position:absolute; bottom:0; left:0; width:100%; height:${pctParticipacion}%; background:${partColor}; display:flex; flex-direction:column; justify-content:flex-end;">
            ${totalProcesadas > 0 ? `
            <div style="width:100%; height:${(totalProcesadas / emp.totalResp) * 100}%; background:${revColor}; display:flex; flex-direction:column; justify-content:flex-end;">
            ${(Math.max(0, revisadasAltas - emp.certificadasCount - emp.falsasCount - emp.malRevisadasCount)) > 0 ? `<div style="width:100%; height:${(Math.max(0, revisadasAltas - emp.certificadasCount - emp.falsasCount - emp.malRevisadasCount) / totalProcesadas) * 100}%; background:#047857;"></div>` : ''}
            ${emp.certificadasCount > 0 ? `<div style="width:100%; height:${(emp.certificadasCount / totalProcesadas) * 100}%; background:${certColor};"></div>` : ''}
            ${emp.falsasCount > 0 ? `<div style="width:100%; height:${(emp.falsasCount / totalProcesadas) * 100}%; background:${falsaColor};"></div>` : ''}
            ${emp.malRevisadasCount > 0 ? `<div style="width:100%; height:${(emp.malRevisadasCount / totalProcesadas) * 100}%; background:${malRevColor};"></div>` : ''}
            </div>
            ` : ''}
            </div>
            </div>

            <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Calificación Promedio">
            ${emp.countScore > 0 ? `<div style="position:absolute; bottom:0; left:0; width:100%; height:${avgScore}%; background:${colorScore};"></div>` : ''}
            </div>

            </div>

            <div style="margin-top:8px; text-align:center; width:100%; padding:0 2px; height:55px; display:flex; flex-direction:column; justify-content:flex-start;">
            <div style="font-size:0.6rem; font-weight:bold; color:#1e293b; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.1; word-break:break-word;">${safeName}</div>
            <div style="font-size:0.5rem; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;" title="${safeJob}">${safeJob}</div>
            <div style="font-size:0.5rem; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeDeptUser}">${safeDeptUser}</div>
            <div style="font-size:0.45rem; color:#94a3b8; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeArea}">📍 ${safeArea}</div>
            </div>
            </div>`;
        });
    }
    html += `</div>`;
    document.getElementById('dept-list-container').innerHTML = html;
};

window.verStatsDetallePuesto = (puestoName) => {
    window.actualizarRadarDOM(null, null, puestoName);
    
    const data = window.encuestasStatsCacheForDrilldown;
    const allEmps = window.todosLosEmpleadosData;
    const responses = data.cleanResponses || [];
    const activeEvals = data.activeEvalsList || [];
    const getPuesto = (e) => (e.puesto || e.Puesto || "").trim() || "Sin Puesto";
    const getDept = (e) => (e.department || e.departamento || e.dept || "Sin Departamento").trim();
    
    const getArea = (e) => {
        if (e.areas && e.areas.name) return e.areas.name;
        if (e.area && typeof e.area === 'object' && e.area.name) return e.area.name;
        if (e.area && typeof e.area === 'string' && e.area.trim() !== '') return e.area.trim();
        return "Sin Área";
    };
    
    const employeesInRole = allEmps.filter(e => e.isActive !== false && getPuesto(e) === puestoName);

    let empStats = employeesInRole.map(emp => {
        const empPuestoNorm = puestoName.toUpperCase();
        const empDeptoNorm = getDept(emp).toUpperCase();
        
        let totalAssigned = 0;
        let obligatoryAssigned = 0;
        let obligatoryCompleted = 0;

        activeEvals.forEach(ev => {
            let targets = ['ALL'];
            if (ev.target_positions) {
                 if(Array.isArray(ev.target_positions)) targets=ev.target_positions;
                 else if(typeof ev.target_positions==='string') try{targets=JSON.parse(ev.target_positions)}catch(e){}
            }
            let targetDeptos = ['ALL'];
            if (ev.target_departments) {
                 if(Array.isArray(ev.target_departments)) targetDeptos=ev.target_departments;
                 else if(typeof ev.target_departments==='string') try{targetDeptos=JSON.parse(ev.target_departments)}catch(e){}
            }
            
            const isObligatory = (ev.is_obligatory !== false);
            const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
            const deptosNorm = targetDeptos.map(t => String(t).toUpperCase().trim());

            const matchesPuesto = targetsNorm.includes('ALL') || targetsNorm.includes(empPuestoNorm);
            const matchesDepto = deptosNorm.includes('ALL') || deptosNorm.includes(empDeptoNorm);

            if (matchesPuesto && matchesDepto) {
                totalAssigned++;
                if (isObligatory) {
                    obligatoryAssigned++;
                    const hasResponded = responses.some(r => String(r.employee_id) === String(emp.id) && String(r.evaluation_id) === String(ev.id));
                    if (hasResponded) obligatoryCompleted++;
                }
            }
        });

        const empResps = responses.filter(r => String(r.employee_id) === String(emp.id));
        const totalResp = empResps.length;
        
        const reviewedResp = empResps.filter(r => r.review_status === 'Revisado');
        const certificadasResp = empResps.filter(r => r.review_status === 'Certificada');
        const falsasResp = empResps.filter(r => r.review_status === 'Falsa');
        const malRevisadasResp = empResps.filter(r => r.review_status === 'Mal Revisada');
        
        const procesadasResp = empResps.filter(r => ['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status));
        const revisadasAltasCount = procesadasResp.filter(r => (r.finalScoreCalculated || 0) >= 80).length;

        let sumScore = 0;
        let countScore = 0;
        empResps.forEach(r => {
        if (r.review_status === 'Revisado' || r.review_status === 'Certificada') {
        sumScore += (r.finalScoreCalculated || 0);
        countScore++;
        }
        });

        return {
        name: emp.name || "Sin Nombre",
        dept: getDept(emp),
        job: getPuesto(emp),
        area: getArea(emp),
        totalResp,
        totalAssigned: Math.max(totalAssigned, totalResp),
        reviewedCount: reviewedResp.length,
        certificadasCount: certificadasResp.length,
        falsasCount: falsasResp.length,
        malRevisadasCount: malRevisadasResp.length,
        revisadasAltasCount: revisadasAltasCount,
        sumScore: sumScore,
        countScore: countScore,
        incompleto: (obligatoryCompleted < obligatoryAssigned)
        };
    }).filter(emp => emp.totalAssigned > 0 || emp.totalResp > 0);

    empStats.sort((a,b) => {
        if (a.incompleto !== b.incompleto) return a.incompleto ? 1 : -1;
        
        const assA = a.totalAssigned || 0;
        const assB = b.totalAssigned || 0;
        let valA = 0;
        let valB = 0;

        if (window.currentStatsSortCriterion === 'participacion') {
            valA = assA > 0 ? a.totalResp / assA : 0;
            valB = assB > 0 ? b.totalResp / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas') {
            valA = assA > 0 ? a.reviewedCount / assA : 0;
            valB = assB > 0 ? b.reviewedCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'revisadas_altas') {
            valA = assA > 0 ? a.revisadasAltasCount / assA : 0;
            valB = assB > 0 ? b.revisadasAltasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'certificadas') {
            valA = assA > 0 ? a.certificadasCount / assA : 0;
            valB = assB > 0 ? b.certificadasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'falsas') {
            valA = assA > 0 ? a.falsasCount / assA : 0;
            valB = assB > 0 ? b.falsasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'mal_revisadas') {
        valA = assA > 0 ? a.malRevisadasCount / assA : 0;
        valB = assB > 0 ? b.malRevisadasCount / assB : 0;
        } else if (window.currentStatsSortCriterion === 'calificacion') {
        valA = a.countScore > 0 ? (a.sumScore / a.countScore) : 0;
        valB = b.countScore > 0 ? (b.sumScore / b.countScore) : 0;
        }

        if (valB !== valA) return valB - valA;
        const partA = assA > 0 ? a.totalResp / assA : 0;
        const partB = assB > 0 ? b.totalResp / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });

    const safePuesto = window.sanitizeForHTML(puestoName);

    let html = `
    <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:10px;">
             <button onclick="document.getElementById('puesto-list-container').innerHTML = window.renderPuestoDetailed(window.encuestasStatsCacheForDrilldown.puestoCache); window.actualizarRadarDOM();" style="background:#f1f5f9; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; color:#475569; font-weight:bold;">Volver</button>
            <span style="font-weight:bold; color:#1e293b; font-size:1rem;">${safePuesto}</span>
        </div>
        <div style="font-size:0.75rem; color:#64748b; margin-left:5px;">Personal evaluado: ${empStats.length}</div>
    </div>
    <div style="display:flex; align-items:flex-end; gap:4px; overflow-x:auto; padding-bottom:5px; border-bottom:2px solid #e2e8f0; min-height:165px;" class="hide-scrollbar">`;

    if (empStats.length === 0) {
        html += `<div style="padding:15px; text-align:center; color:#94a3b8; font-style:italic; width:100%;">No se encontraron colaboradores activos en esta categoría.</div>`;
    } else {
        empStats.forEach(emp => {
            const totalProcesadas = emp.reviewedCount + emp.certificadasCount + emp.falsasCount + emp.malRevisadasCount;
            const revisadasAltas = emp.revisadasAltasCount || 0;
            
            const pctParticipacion = Math.min(100, emp.totalAssigned > 0 ? Math.round((emp.totalResp / emp.totalAssigned) * 100) : 0);
            const avgScore = emp.countScore > 0 ? Math.round(emp.sumScore / emp.countScore) : 0;
            const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados

            const partColor = '#3b82f6';
            const revColor = '#10b981';
            const certColor = '#eab308';
            const falsaColor = '#ef4444';
            const malRevColor = '#a855f7';
            const opacity = emp.incompleto ? '0.6' : '1';

            const safeName = window.sanitizeForHTML(emp.name);
            const safeDept = window.sanitizeForHTML(emp.dept);
            const safeJob = window.sanitizeForHTML(emp.job);
            const safeArea = window.sanitizeForHTML(emp.area);

            html += `
            <div title="${safeName}&#10;📍 Área: ${safeArea}&#10;Departamento: ${safeDept}&#10;Puesto: ${safeJob}&#10;Asignadas: ${emp.totalAssigned}&#10;Respuestas: ${emp.totalResp}&#10;Revisadas: ${emp.reviewedCount}&#10;Certificadas: ${emp.certificadasCount}&#10;Falsas/Anuladas: ${emp.falsasCount}&#10;Mal Revisadas: ${emp.malRevisadasCount}&#10;⭐ Calificación: ${avgScore}%${emp.incompleto ? '&#10;¡Faltan Obligatorias!' : ''}" 
            class="stats-columna" style="cursor:default; opacity:${opacity};" 
            onmouseover="this.style.background='#f8fafc'; this.style.transform='translateY(-2px)';" 
            onmouseout="this.style.background='transparent'; this.style.transform='none';">

            <div style="font-size:0.65rem; color:#64748b; margin-bottom:4px; text-align:center; font-weight:700; line-height:1.2; display:flex; justify-content:center; gap:8px;">
            <div>
            <div style="color:${partColor}">${pctParticipacion}%</div>
            <div style="color:${revColor}; font-size:0.6rem;">${Math.min(100, emp.totalAssigned > 0 ? Math.round((totalProcesadas / emp.totalAssigned) * 100) : 0)}%</div>
            </div>
            ${emp.countScore > 0 ? `
            <div style="display:flex; align-items:flex-end;">
            <div style="color:${colorScore}; font-size:0.65rem; font-weight:800;">${avgScore}%</div>
            </div>` : ''}
            </div>

            <div style="display:flex; align-items:flex-end; height:90px; width:100%; justify-content:center; gap:4px;">

            <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Flujo de Revisión">
            <div style="position:absolute; bottom:0; left:0; width:100%; height:${pctParticipacion}%; background:${partColor}; display:flex; flex-direction:column; justify-content:flex-end;">
            ${totalProcesadas > 0 ? `
            <div style="width:100%; height:${(totalProcesadas / emp.totalResp) * 100}%; background:${revColor}; display:flex; flex-direction:column; justify-content:flex-end;">
            ${(Math.max(0, revisadasAltas - emp.certificadasCount - emp.falsasCount - emp.malRevisadasCount)) > 0 ? `<div style="width:100%; height:${(Math.max(0, revisadasAltas - emp.certificadasCount - emp.falsasCount - emp.malRevisadasCount) / totalProcesadas) * 100}%; background:#047857;"></div>` : ''}
            ${emp.certificadasCount > 0 ? `<div style="width:100%; height:${(emp.certificadasCount / totalProcesadas) * 100}%; background:${certColor};"></div>` : ''}
            ${emp.falsasCount > 0 ? `<div style="width:100%; height:${(emp.falsasCount / totalProcesadas) * 100}%; background:${falsaColor};"></div>` : ''}
            ${emp.malRevisadasCount > 0 ? `<div style="width:100%; height:${(emp.malRevisadasCount / totalProcesadas) * 100}%; background:${malRevColor};"></div>` : ''}
            </div>
            ` : ''}
            </div>
            </div>

            <div style="width:12px; height:100%; background:#f1f5f9; border-radius:3px 3px 0 0; position:relative; overflow:hidden;" title="Calificación Promedio">
            ${emp.countScore > 0 ? `<div style="position:absolute; bottom:0; left:0; width:100%; height:${avgScore}%; background:${colorScore};"></div>` : ''}
            </div>

            </div>

            <div style="margin-top:8px; text-align:center; width:100%; padding:0 2px; height:55px; display:flex; flex-direction:column; justify-content:flex-start;">
            <div style="font-size:0.6rem; font-weight:bold; color:#1e293b; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.1; word-break:break-word;">${safeName}</div>
            <div style="font-size:0.5rem; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;" title="${safeJob}">${safeJob}</div>
            <div style="font-size:0.5rem; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeDept}">${safeDept}</div>
            <div style="font-size:0.45rem; color:#94a3b8; font-style:italic; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeArea}">📍 ${safeArea}</div>
            </div>
            </div>`;
        });
    }
    html += `</div>`;
    document.getElementById('puesto-list-container').innerHTML = html;
};

console.log("✅ Evaluaciones Stats v63: BARRA INDEPENDIENTE PARA CERTIFICADAS");
