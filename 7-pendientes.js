// ==========================================
// 7-pendientes.js (BANDEJA DE ENTRADA UNIFICADA - V19: FIX DISPLAY BLOCK + TIEMPO TRANSCURRIDO)
// ==========================================

window.mostrarModalFirmaPendiente = async (id) => {
    try {
        let modal = document.getElementById('modal-detalle-independiente');
        if (!modal) {
            const modalHTML = `
            <div id="modal-detalle-independiente" class="hoja-overlay" style="z-index:2500;">
                <div class="form-content hoja-contenido" style="max-width: 600px; background: #f8fafc; overflow: hidden; padding: 12px 0 0;">
                    <div class="hoja-encabezado-lista">
                        <h3 id="titulo-modal-detalle" class="hoja-titulo">Detalles de la evidencia</h3>
                        <button onclick="document.getElementById('modal-detalle-independiente').style.display='none'" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                    </div>
                    <div id="contenido-modal-detalle" style="flex:1; overflow-y: auto; padding: 20px;"></div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('modal-detalle-independiente');
        }

        const content = document.getElementById('contenido-modal-detalle');
        const titleEl = document.getElementById('titulo-modal-detalle');
        
        modal.style.display = 'flex';
        content.innerHTML = '<div style="text-align:center; padding:40px;"><div class="spinner" style="margin: 0 auto 15px auto;"></div><p style="color:#64748b;">Cargando evidencia...</p></div>';

        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        const data = window.incidentCache[id];
        
        if (!data) {
            content.innerHTML = '<div style="text-align:center; padding:40px; color:#ef4444;">⚠️ Datos no encontrados en caché.</div>';
            return;
        }

        titleEl.innerText = data.title;
        const parentId = data.linked_incident_id;
        let imageHtml = '';
        
        if (data.image_url) {
            const safeUrl = window.procesarUrlImagen ? window.procesarUrlImagen(data.image_url) : data.image_url;
            imageHtml = `<img src="${safeUrl}" onclick="if(window.abrirVisor) window.abrirVisor('${id}')" style="width:100%; border-radius:12px; margin-bottom:15px; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.05);" title="Toca para ampliar">`;
        } else if (parentId) {
            const { data: parentData } = await sb.from('incidents').select('image_url').eq('id', parentId).single();
            if(parentData && parentData.image_url) {
                 const safeParentUrl = window.procesarUrlImagen ? window.procesarUrlImagen(parentData.image_url) : parentData.image_url;
                 imageHtml = `<img src="${safeParentUrl}" onclick="if(window.abrirVisor) window.abrirVisor('${id}')" style="width:100%; border-radius:12px; margin-bottom:10px; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.05);" title="Toca para ampliar">`;
                 imageHtml += `<div style="text-align:center; font-size:0.8rem; color:#64748b; margin-bottom:15px;">(Imagen vinculada de la Capacitación principal)</div>`;
            }
        }

        if (data.tipo === 'Capacitación' && !parentId) {
            content.innerHTML = imageHtml || '<p style="text-align:center; color:#64748b;">Sin imágenes registradas.</p>';
            return;
        }

        const { data: signatures } = await sb.from('incident_signatures').select('employee_id').eq('incident_id', id);
        const myIdStr = String(user.id);
        const signedIds = new Set(signatures ? signatures.map(s => String(s.employee_id)) : []);
        const yaFirme = signedIds.has(myIdStr);
        
        const myPuesto = user.puesto ? user.puesto.trim().toUpperCase() : "";
        const exentoDeFirmar = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"].includes(myPuesto);

        let html = imageHtml;
        if(parentId) html += `<div style="background:#eff6ff; padding:10px; border-radius:8px; color:#1e40af; font-size:0.85rem; margin-bottom:15px; border:1px dashed #bfdbfe;">🔗 <b>Imágenes vinculadas.</b></div>`;

        if (!yaFirme && !exentoDeFirmar && data.tipo !== 'Capacitación') {
            html += `
            <div style="background:#f0fdf4; border:2px dashed #4ade80; padding:25px; border-radius:16px; text-align:center; margin-bottom:20px;">
                <p style="margin-top:0; margin-bottom:8px; color:#166534; font-size:1.2rem; font-weight:bold;">¿Confirmas de enterado?</p>
                <p style="color:#15803d; font-size:0.9rem; margin-bottom:20px; margin-top:0;">He revisado la evidencia y estoy de acuerdo.</p>
                <button onclick="if(window.abrirFirma) window.abrirFirma('${id}')" style="background:#22c55e; color:white; border:none; padding:14px 35px; border-radius:50px; font-weight:bold; cursor:pointer; font-size:1.1rem; box-shadow:0 4px 6px -1px rgba(34,197,94,0.4); transition: transform 0.2s;">Firmar de enterado</button>
            </div>`;
        } else if (yaFirme) {
            html += `<div style="text-align:center; padding:15px; background:#f1f5f9; border-radius:12px; color:#475569; font-weight:bold;">✅ Ya has firmado este registro</div>`;
        }

        content.innerHTML = html;

    } catch(e) {
        console.error(e);
        alert("Ocurrió un error al cargar el detalle: " + e.message);
    }
};

// Función auxiliar para calcular el tiempo transcurrido
const obtenerTiempoTranscurrido = (fechaStr) => {
    if (!fechaStr) return 'Desconocido';
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    let fechaObj;
    if (fechaStr.includes('T')) {
        fechaObj = new Date(fechaStr.split('T')[0]);
    } else {
        const partes = fechaStr.split('-');
        if(partes.length === 3) {
            fechaObj = new Date(partes[0], partes[1] - 1, partes[2]);
        } else {
            return 'Desconocido';
        }
    }
    fechaObj.setHours(0,0,0,0);
    
    const diffTime = hoy - fechaObj;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Hoy';
    if (diffDays === 1) return 'Hace 1 día';
    if (diffDays < 30) return `Hace ${diffDays} días`;
    const meses = Math.floor(diffDays / 30);
    if (meses < 12) return `Hace ${meses} mes${meses > 1 ? 'es' : ''}`;
        const anios = Math.floor(diffDays / 365);
        return `Hace ${anios} año${anios > 1 ? 's' : ''}`;
    };

    // Días antes del cierre del periodo a partir de los cuales una encuesta sin
    // contestar deja de ser un aviso informativo y pasa a "por vencer".
    const AVISO_CIERRE = {
        weekly: 2, biweekly: 3, monthly: 7, quarterly: 15,
        semiannual: 30, yearly: 45, biennial: 60
    };

    // Devuelve el periodo natural vigente para una frecuencia: desde cuándo
    // corre, cuándo cierra y cómo se le llama en la interfaz. El fin es
    // exclusivo (el instante en que arranca el periodo siguiente).
    window.periodoVigente = (frecuencia, referencia) => {
        const inicio = new Date(referencia);
        inicio.setHours(0,0,0,0);

        switch (frecuencia) {
            case 'weekly': {
                const diaSemana = referencia.getDay() || 7; // lunes = 1 … domingo = 7
                inicio.setDate(referencia.getDate() - diaSemana + 1);
                const fin = new Date(inicio);
                fin.setDate(inicio.getDate() + 7);
                return { inicio, fin, nombre: 'esta semana' };
            }
            case 'biweekly': {
                const primeraQuincena = referencia.getDate() <= 15;
                inicio.setDate(primeraQuincena ? 1 : 16);
                const fin = new Date(inicio);
                if (primeraQuincena) fin.setDate(16);
                else fin.setMonth(inicio.getMonth() + 1, 1);
                return { inicio, fin, nombre: 'esta quincena' };
            }
            case 'monthly': {
                inicio.setMonth(referencia.getMonth(), 1);
                const fin = new Date(inicio);
                fin.setMonth(inicio.getMonth() + 1, 1);
                return { inicio, fin, nombre: 'este mes' };
            }
            case 'quarterly': {
                const trimestre = Math.floor(referencia.getMonth() / 3);
                inicio.setMonth(trimestre * 3, 1);
                const fin = new Date(inicio);
                fin.setMonth(trimestre * 3 + 3, 1);
                return { inicio, fin, nombre: 'este trimestre' };
            }
            case 'semiannual': {
                const semestre = Math.floor(referencia.getMonth() / 6);
                inicio.setMonth(semestre * 6, 1);
                const fin = new Date(inicio);
                fin.setMonth(semestre * 6 + 6, 1);
                return { inicio, fin, nombre: 'este semestre' };
            }
            case 'yearly': {
                inicio.setMonth(0, 1);
                const fin = new Date(inicio);
                fin.setFullYear(inicio.getFullYear() + 1, 0, 1);
                return { inicio, fin, nombre: 'este año' };
            }
            case 'biennial': {
                // Se vuelve a pedir cuando han pasado dos años naturales completos,
                // así que el periodo vigente abarca el año anterior y el actual.
                inicio.setFullYear(referencia.getFullYear() - 1, 0, 1);
                const fin = new Date(inicio);
                fin.setFullYear(referencia.getFullYear() + 1, 0, 1);
                return { inicio, fin, nombre: 'este periodo bienal' };
            }
        }
        return null;
    };

    // Cómo se nombra cada periodo al contar la racha de omisiones.
    const NOMBRE_OMISION = {
        weekly:     ['semana', 'semanas'],
        biweekly:   ['quincena', 'quincenas'],
        monthly:    ['mes', 'meses'],
        quarterly:  ['trimestre', 'trimestres'],
        semiannual: ['semestre', 'semestres'],
        yearly:     ['año', 'años'],
        biennial:   ['periodo', 'periodos']
    };

    // Cuenta cuántos periodos completos cerraron sin respuesta entre 'desde' y el
    // periodo vigente. Quedan fuera de la cuenta el periodo en curso, que todavía
    // está a tiempo, y el periodo de origen (aquel donde cae 'desde'), porque solo
    // corrió en parte. La cuenta se queda corta antes que exagerar el atraso.
    window.periodosOmitidos = (frecuencia, desde, periodoActual) => {
        if (!desde || !periodoActual || isNaN(desde)) return 0;

        let omitidos = 0;
        let cursor = periodoActual.inicio;

        // Tope de seguridad: más allá de esto el número ya no aporta nada.
        while (omitidos < 60) {
            const anterior = window.periodoVigente(frecuencia, new Date(cursor.getTime() - 1));
            if (!anterior || desde >= anterior.inicio) break;
            omitidos++;
            cursor = anterior.inicio;
        }
        return omitidos;
    };

    window.textoOmisiones = (frecuencia, cantidad) => {
        const nombres = NOMBRE_OMISION[frecuencia];
        if (!nombres || !cantidad) return '';
        return `${cantidad} ${cantidad === 1 ? nombres[0] : nombres[1]} sin contestar`;
    };

    // 'fechaAlta' (el created_at de la encuesta) sirve de origen para contar la
    // racha cuando el empleado no la ha contestado nunca.
    window.esEvaluacionPendiente = (respuestas, evalId, frecuencia, fechaAlta) => {
        const resps = respuestas ? respuestas.filter(r => r.evaluation_id === evalId) : [];

        // Sin frecuencia repetitiva ('once', o sin dato) no hay periodos que contar.
        const now = new Date();
        const periodo = AVISO_CIERRE.hasOwnProperty(frecuencia) ? window.periodoVigente(frecuencia, now) : null;

        if (resps.length === 0) {
            // Nunca contestada: la racha corre desde que se dio de alta la encuesta.
            const omitidos = (periodo && fechaAlta) ? window.periodosOmitidos(frecuencia, new Date(fechaAlta), periodo) : 0;
            return { mostrar: true, diasFaltantes: 0, vencida: true, tipoAviso: 'nunca', ultimaFecha: null, periodosOmitidos: omitidos, frecuencia: frecuencia };
        }

        resps.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
        const ultima = resps[0].submitted_at;

        if (resps[0].review_status === 'Mal Revisada') return { mostrar: true, diasFaltantes: 0, vencida: true, tipoAviso: 'mal_revisada', ultimaFecha: ultima, periodosOmitidos: 0, frecuencia: frecuencia };

        // Contestada al menos una vez y sin frecuencia repetitiva: no se pide más.
        if (!periodo) return { mostrar: false };

        const subDate = new Date(ultima);

        // El periodo natural es la única referencia: si ya la contestó dentro del
        // periodo vigente no se le vuelve a pedir, hayan pasado los días que hayan
        // pasado desde entonces.
        if (subDate >= periodo.inicio) return { mostrar: false };

        const omitidos = window.periodosOmitidos(frecuencia, subDate, periodo);

        // Si dejó cerrar al menos un periodo completo sin contestar, está vencida.
        if (omitidos > 0) {
            return { mostrar: true, diasFaltantes: 0, vencida: true, tipoAviso: 'vencida', ultimaFecha: ultima, periodosOmitidos: omitidos, frecuencia: frecuencia };
        }

        const diasRestantes = Math.ceil((periodo.fin - now) / 86400000);

        if (diasRestantes <= AVISO_CIERRE[frecuencia]) {
            return { mostrar: true, diasFaltantes: diasRestantes, vencida: false, tipoAviso: 'por_vencer', ultimaFecha: ultima, periodosOmitidos: 0, frecuencia: frecuencia };
        }

        return { mostrar: true, diasFaltantes: diasRestantes, vencida: false, tipoAviso: 'falta_periodo', nombrePeriodo: periodo.nombre, ultimaFecha: ultima, periodosOmitidos: 0, frecuencia: frecuencia };
    };

    window.cargarVistaPendientes = async (modo = 'PROPIOS') => {
    
    if (document.getElementById('init-load-container')) document.getElementById('init-load-container').style.display = 'block';
    if (document.getElementById('top-pendientes-container')) document.getElementById('top-pendientes-container').style.display = 'flex';
    if (document.getElementById('container-ultimos-incidentes')) document.getElementById('container-ultimos-incidentes').style.display = 'block';
    if (document.getElementById('quick-team-view') && document.getElementById('quick-team-view').innerHTML !== '') {
        document.getElementById('quick-team-view').style.display = 'flex';
    }
    
    if (document.getElementById('btn-volver')) document.getElementById('btn-volver').style.display = 'none';
    if (document.getElementById('container-incidentes')) document.getElementById('container-incidentes').style.display = 'none';
    if (document.getElementById('container-evaluaciones')) document.getElementById('container-evaluaciones').style.display = 'none';
    if (document.getElementById('container-evaluaciones-historial')) document.getElementById('container-evaluaciones-historial').style.display = 'none';
    if (document.getElementById('search-bar-container')) document.getElementById('search-bar-container').style.display = 'none';
    if (document.getElementById('global-stats')) document.getElementById('global-stats').style.display = 'none';

    // 🔥 FIX: USAMOS BLOCK EN LUGAR DE FLEX PARA PRESERVAR EL DISEÑO
    setTimeout(() => {
        const header = document.getElementById('main-user-header');
        if (header) {
            header.style.display = 'block';
            header.classList.remove('hidden');
        }
        const radar = document.getElementById('header-radar-container');
        if (radar && radar.innerHTML.trim() !== '') {
            radar.style.display = 'block';
        }
    }, 50);

    window.mostrandoPendientes = (modo === 'PROPIOS');
    window.mostrandoPendientesEquipo = (modo === 'EQUIPO');

    const modal = document.getElementById('modal-pendientes');
    const container = document.getElementById('contenido-modal-pendientes');
    const tituloContenedor = document.getElementById('titulo-modal-pendientes');

    if (!modal || !container || !tituloContenedor) {
        console.error("Falta agregar el HTML de 'modal-pendientes'.");
        return;
    }

    modal.style.display = 'flex';
    container.innerHTML = `
        <div style="text-align:center; padding:40px; color:#64748b;">
            <div class="spinner" style="margin: 0 auto 15px auto;"></div>
            <p>Buscando pendientes...</p>
        </div>`;

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    const colorTheme = modo === 'EQUIPO' ? '#7c3aed' : '#ea580c';
        const bgTheme = modo === 'EQUIPO' ? '#f3e8ff' : '#fff7ed';
        const borderTheme = modo === 'EQUIPO' ? '#e9d5ff' : '#ffedd5';
        const tituloTexto = modo === 'EQUIPO' ? '👥 Pendientes de mi Equipo' : '⚠️ Mis Pendientes';

        tituloContenedor.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px; width: 100%;">
                <h2 class="hoja-titulo">${tituloTexto}</h2>
                <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.85rem;">
                    <span id="badge-total" style="background:${bgTheme}; color:${colorTheme}; padding: 4px 12px; border-radius: 12px; font-weight: 700; border: 1px solid ${borderTheme};">Total: ...</span>
                    <span id="badge-vencidos" style="background:#fee2e2; color:#b91c1c; padding: 4px 12px; border-radius: 12px; font-weight: 700; border: 1px solid #fecaca; display:none;">Vencidos / Urgentes: ...</span>
                    <span id="badge-anticipados" style="background:#fef9c3; color:#a16207; padding: 4px 12px; border-radius: 12px; font-weight: 700; border: 1px solid #fef08a; display:none;">Anticipados: ...</span>
                </div>
            </div>
        `;

        let items = [];

            try {
                if (modo === 'PROPIOS') {
            const myPuesto = user.puesto ? user.puesto.trim().toUpperCase() : "SIN PUESTO";
            const exentoDeFirmar = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"].includes(myPuesto);

            if (!exentoDeFirmar) {
                const { data: rpcData } = await sb.rpc('get_pending_incidents', { p_employee_id: user.id });
                
                if(rpcData && rpcData.length > 0) {
                    const { data: incidentsData } = await sb.from('incidents')
                        .select('*, incident_signatures(employee_id)')
                        .in('id', rpcData.map(d => d.id))
                        .neq('tipo', 'Capacitación')
                        .order('date', { ascending: false });
                    
                    if(incidentsData) {
                        const myFullData = window.todosLosEmpleadosData.find(e => String(e.id) === String(user.id));
                        const miFechaIngreso = myFullData ? new Date(myFullData.date) : new Date(0);
                        miFechaIngreso.setHours(0,0,0,0);

                        const validIncidents = incidentsData.filter(inc => {
                            if (!inc.date) return false;
                            const [y, m, d] = inc.date.split('-');
                            const incDate = new Date(y, m - 1, d);
                            return incDate >= miFechaIngreso;
                        });

                        items = [...items, ...validIncidents];
                    }
                }
            }

            const { data: activeEvalsDb } = await sb.from('evaluations')
                        .select('id, title, target_positions, target_departments, target_employees, mode, is_obligatory, active, frequency, created_at')
                        .eq('active', true);
            
            // Removemos el filtro .filter() para que también pasen las encuestas con mode === 'boss'
const activeEvals = activeEvalsDb ? activeEvalsDb : [];
                
            const { data: myResponses } = await sb.from('evaluation_responses')
                .select('evaluation_id, submitted_at')
                .eq('employee_id', user.id);

            if (activeEvals && activeEvals.length > 0) {
                            // Obtenemos el puesto y departamento del usuario actual
                // Preparamos los datos del usuario actual
                                const myPuestoEval = user.puesto ? user.puesto.trim().toUpperCase() : "SIN PUESTO";
                                // Buscamos con ambos nombres
                                const myDeptoEval = (user.department || user.dept || "GENERAL").trim().toUpperCase();

                activeEvals.forEach(ev => {
                                                const esObligatoria = (ev.is_obligatory !== false && String(ev.is_obligatory) !== 'false');

                                                let targetEmps = ev.target_employees;
                                                if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                                                if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];

                                                let esParaMi = false;

                                                if (targetEmps.length > 0 && !targetEmps.includes('ALL')) {
                                                    esParaMi = targetEmps.includes(String(user.id));
                                                } else {
                                                    // 1. VALIDACIÓN DE PUESTO
                                                    let targets = ev.target_positions;
                                                    if (typeof targets === 'string') { try { targets = JSON.parse(targets); } catch(e) { targets = ['ALL']; } }
                                                    if (!Array.isArray(targets)) targets = ['ALL'];
                                                    const targetsNorm = targets.map(t => String(t).toUpperCase().trim());
                                                    const esParaMiPuesto = targets.length === 0 || targets.includes('ALL') || targetsNorm.includes(myPuestoEval);

                                                    // 2. VALIDACIÓN DE DEPARTAMENTO
                                                    let targetsDeptos = ev.target_departments;
                                                    if (typeof targetsDeptos === 'string') { try { targetsDeptos = JSON.parse(targetsDeptos); } catch(e) { targetsDeptos = ['ALL']; } }
                                                    if (!Array.isArray(targetsDeptos)) targetsDeptos = ['ALL'];
                                                    const targetsNormDeptos = targetsDeptos.map(t => String(t).toUpperCase().trim());
                                                    const esParaMiDepto = targetsDeptos.length === 0 || targetsDeptos.includes('ALL') || targetsNormDeptos.includes(myDeptoEval);

                                                    esParaMi = esParaMiPuesto && esParaMiDepto;
                                                }

                                                // Solo agregamos la encuesta si hace match
                                                if (esObligatoria && esParaMi) {
                                                    const requiereRespuesta = window.esEvaluacionPendiente(myResponses, ev.id, ev.frequency, ev.created_at);
                                    if (requiereRespuesta.mostrar) {
    if (ev.mode === 'boss') {
        // Generamos un item especial para indicar que el usuario está esperando a su jefe
        items.push({
            id: `waiting_boss_${ev.id}`, title: `Esperando evaluación: ${ev.title}`,
            date: ev.created_at ? ev.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
            tipo: 'Aviso', grado: 'Pendiente Jefe', original_data: ev, virtual_type: 'waiting_boss',
            vencimiento: requiereRespuesta
        });
    } else {
        // Comportamiento normal para las encuestas que el usuario sí debe contestar ('self')
        items.push({
            id: ev.id, title: ev.title,
            date: ev.created_at ? ev.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
            tipo: 'Encuesta', grado: 'Por realizar', original_data: ev, virtual_type: 'survey',
            vencimiento: requiereRespuesta
        });
    }
}
                                }
                            });
                        }

            // --- NUEVO: Buscar las encuestas del usuario marcadas como Mal Revisadas ---
            const { data: misMalRevisadas } = await sb.from('evaluation_responses')
                .select('id, submitted_at, evaluation_id, review_status, evaluations(title)')
                .eq('employee_id', user.id)
                .eq('review_status', 'Mal Revisada');

            if (misMalRevisadas) {
                misMalRevisadas.forEach(e => {
                    items.push({
                        id: 'malrev_' + e.id, 
                        title: `Mal Revisada: ${e.evaluations?.title || 'Evaluación'}`, 
                        date: e.submitted_at.split('T')[0],
                        tipo: 'Encuesta', 
                        grado: 'Rechazada', 
                        original_data: e, 
                        virtual_type: 'user_mal_revisada'
                    });
                });
            }

            const misDirectosFull = window.todosLosEmpleadosData.filter(e => String(e.supId) === String(user.id));
            const equipoDirectoIds = misDirectosFull.map(e => String(e.id));
            
            if (equipoDirectoIds.length > 0) {
                const teamObligatorias = activeEvalsDb ? activeEvalsDb.filter(ev => ev.is_obligatory !== false && String(ev.is_obligatory) !== 'false') : [];
                
                if (teamObligatorias.length > 0) {
                    const { data: teamResponsesEvals } = await sb.from('evaluation_responses')
                        .select('evaluation_id, employee_id, submitted_at')
                        .in('employee_id', equipoDirectoIds)
                        .in('evaluation_id', teamObligatorias.map(e => e.id));

                    teamObligatorias.forEach(ev => {
                                                                let targetEmps = ev.target_employees;
                                                                if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                                                                if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];

                                                                let targetsPuestos = ev.target_positions;
                                                                if (typeof targetsPuestos === 'string') { try { targetsPuestos = JSON.parse(targetsPuestos); } catch(e) { targetsPuestos = ['ALL']; } }
                                                                if (!Array.isArray(targetsPuestos)) targetsPuestos = ['ALL'];
                                                                const targetsNormPuestos = targetsPuestos.map(t => String(t).toUpperCase().trim());

                                                                let targetsDeptos = ev.target_departments;
                                                                if (typeof targetsDeptos === 'string') { try { targetsDeptos = JSON.parse(targetsDeptos); } catch(e) { targetsDeptos = ['ALL']; } }
                                                                if (!Array.isArray(targetsDeptos)) targetsDeptos = ['ALL'];
                                                                const targetsNormDeptos = targetsDeptos.map(t => String(t).toUpperCase().trim());

                                                                misDirectosFull.forEach(sub => {
                                                                    let aplicaSub = false;

                                                                    if (targetEmps.length > 0 && !targetEmps.includes('ALL')) {
                                                                        aplicaSub = targetEmps.includes(String(sub.id));
                                                                    } else {
                                                                        const subPuesto = (sub.puesto || "").trim().toUpperCase();
                                                                        const subDepto = (sub.department || sub.dept || "GENERAL").trim().toUpperCase();

                                                                        const aplicaPuesto = targetsNormPuestos.length === 0 || targetsNormPuestos.includes('ALL') || targetsNormPuestos.includes(subPuesto);
                                                                        const aplicaDepto = targetsNormDeptos.length === 0 || targetsNormDeptos.includes('ALL') || targetsNormDeptos.includes(subDepto);

                                                                        aplicaSub = aplicaPuesto && aplicaDepto;
                                                                    }

                                                                   if (aplicaSub) {
                                                    const subResps = teamResponsesEvals ? teamResponsesEvals.filter(r => String(r.employee_id) === String(sub.id)) : [];
                                                                       const requiresResponse = window.esEvaluacionPendiente(subResps, ev.id, ev.frequency, ev.created_at);
                                                    
                                                    if (requiresResponse.mostrar) {
                                                        if (ev.mode === 'boss') {
                                                            items.push({
                                                                id: `boss_${ev.id}_${sub.id}`, real_eval_id: ev.id,
                                                                title: `Evaluar a ${sub.name.split(' ')[0]}`, description: ev.title,
                                                                date: ev.created_at ? ev.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                                                                tipo: 'Evaluación de Líder',
                                                                grado: 'Pendiente', sub_id: sub.id, sub_name: sub.name,
                                                                original_data: ev, virtual_type: 'boss_eval',
                                                                vencimiento: requiresResponse
                                                            });
                                                        } else {
                                                            items.push({
                                                                id: `missing_survey_${ev.id}_${sub.id}`, title: ev.title,
                                                                date: ev.created_at ? ev.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                                                                tipo: 'Encuesta Atrasada',
                                                                grado: 'Atrasada', sub_name: sub.name, sub_puesto: sub.puesto || 'Colaborador',
                                                                virtual_type: 'team_missing_survey',
                                                                vencimiento: requiresResponse
                                                            });
                                                        }
                                                    }
                                                }
                                            });
                                        });
                }

                const { data: evalsPorRevisar } = await sb.from('evaluation_responses')
                    .select('id, submitted_at, employee_id, evaluation_id, answers_json, grades_json, review_status, evaluations(title, category)')
                    .in('review_status', ['Pendiente', 'Mal Revisada'])
                    .in('employee_id', equipoDirectoIds)
                    .order('submitted_at', { ascending: true });

                if (evalsPorRevisar) {
                    evalsPorRevisar.forEach(e => {
                        const prefijo = e.review_status === 'Mal Revisada' ? '⚠️ Corregir:' : 'Revisión:';
                        items.push({
                            id: e.id, title: `${prefijo} ${e.evaluations?.title || 'Evaluación'}`, date: e.submitted_at.split('T')[0],
                            tipo: 'Evaluación', grado: e.review_status, employee_id: e.employee_id,
                            original_data: e, virtual_type: 'review'
                        });
                    });
                }
            }

        } else {
            if(window.obtenerJerarquiaCompleta) {
                const hierarchyIds = window.obtenerJerarquiaCompleta(user.id);
                const teamIds = Array.from(hierarchyIds).filter(id => id !== String(user.id));
                
                if (teamIds.length > 0) {
                    const { data: idsPendientes } = await sb.rpc('obtener_ids_pendientes_equipo', { lista_equipo_ids: teamIds });
                    if (idsPendientes && idsPendientes.length > 0) {
                        const { data: teamIncidents } = await sb.from('incidents')
                            .select('*, incident_signatures(employee_id)')
                            .in('id', idsPendientes)
                            .order('date', { ascending: false });
                        
                        if(teamIncidents) {
                            const validTeamIncidents = teamIncidents.filter(inc => {
                                if (!inc.date) return false;
                                const [y, m, d] = inc.date.split('-');
                                const incDate = new Date(y, m - 1, d);
                                
                                const equipoElegible = window.todosLosEmpleadosData.filter(e => {
                                    if (!teamIds.includes(String(e.id))) return false;
                                    const empPuesto = e.puesto ? e.puesto.trim().toUpperCase() : "";
                                    if (["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"].includes(empPuesto)) return false;
                                    const empDate = new Date(e.date);
                                    empDate.setHours(0,0,0,0);
                                    return empDate <= incDate;
                                });
                                
                                if(equipoElegible.length === 0) return false;
                                const signedIds = inc.incident_signatures ? inc.incident_signatures.map(s => String(s.employee_id)) : [];
                                const faltanFirmas = equipoElegible.some(e => !signedIds.includes(String(e.id)));
                                return faltanFirmas;
                            });

                            items = validTeamIncidents;
                        }
                    }

                    // Agregado 'created_at'
                    const { data: activeEvalsDb } = await sb.from('evaluations')
                        .select('id, title, target_positions, target_departments, frequency, mode, is_obligatory, created_at')
                        .eq('active', true);
                    
                    const selfEvals = activeEvalsDb ? activeEvalsDb.filter(ev => (ev.mode || 'self') === 'self' && ev.is_obligatory !== false && String(ev.is_obligatory) !== 'false') : [];

                    if (selfEvals.length > 0) {
                        const { data: teamResponses } = await sb.from('evaluation_responses')
                            .select('evaluation_id, employee_id, submitted_at')
                            .in('employee_id', teamIds);

                        const myFullTeam = window.todosLosEmpleadosData.filter(e => teamIds.includes(String(e.id)));

                        selfEvals.forEach(ev => {
                                                                            let targetEmps = ev.target_employees;
                                                                            if (typeof targetEmps === 'string') { try { targetEmps = JSON.parse(targetEmps); } catch(e) { targetEmps = ['ALL']; } }
                                                                            if (!Array.isArray(targetEmps)) targetEmps = ['ALL'];

                                                                            let targetsPuestos = ev.target_positions;
                                                                            if (typeof targetsPuestos === 'string') { try { targetsPuestos = JSON.parse(targetsPuestos); } catch(e) { targetsPuestos = ['ALL']; } }
                                                                            if (!Array.isArray(targetsPuestos)) targetsPuestos = ['ALL'];
                                                                            const targetsNormPuestos = targetsPuestos.map(t => String(t).toUpperCase().trim());

                                                                            let targetsDeptos = ev.target_departments;
                                                                            if (typeof targetsDeptos === 'string') { try { targetsDeptos = JSON.parse(targetsDeptos); } catch(e) { targetsDeptos = ['ALL']; } }
                                                                            if (!Array.isArray(targetsDeptos)) targetsDeptos = ['ALL'];
                                                                            const targetsNormDeptos = targetsDeptos.map(t => String(t).toUpperCase().trim());

                                                                            myFullTeam.forEach(sub => {
                                                                                let aplicaSub = false;

                                                                                if (targetEmps.length > 0 && !targetEmps.includes('ALL')) {
                                                                                    aplicaSub = targetEmps.includes(String(sub.id));
                                                                                } else {
                                                                                    const subPuesto = (sub.puesto || "").trim().toUpperCase();
                                                                                    const subDepto = (sub.department || sub.dept || "GENERAL").trim().toUpperCase();

                                                                                    const aplicaPuesto = targetsNormPuestos.length === 0 || targetsNormPuestos.includes('ALL') || targetsNormPuestos.includes(subPuesto);
                                                                                    const aplicaDepto = targetsNormDeptos.length === 0 || targetsNormDeptos.includes('ALL') || targetsNormDeptos.includes(subDepto);

                                                                                    aplicaSub = aplicaPuesto && aplicaDepto;
                                                                                }

                                                                                if (aplicaSub) {
                                                            const subResps = teamResponses ? teamResponses.filter(r => String(r.employee_id) === String(sub.id)) : [];
                                                                                    const requiresResponse = window.esEvaluacionPendiente(subResps, ev.id, ev.frequency, ev.created_at);
                                                            
                                                            if (requiresResponse.mostrar) {
                                                                items.push({
                                                                    id: `hierarchy_missing_${ev.id}_${sub.id}`,
                                                                    title: ev.title,
                                                                    date: ev.created_at ? ev.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                                                                    tipo: 'Encuesta Atrasada', grado: 'Atrasada', sub_name: sub.name,
                                                                    sub_puesto: sub.puesto || 'Colaborador', virtual_type: 'team_missing_survey',
                                                                    vencimiento: requiresResponse
                                                                });
                                                            }
                                                        }
                                                    });
                                                });
                    }
                }
            }
        }

        container.innerHTML = '';

        if (items.length === 0) {
                    const badgeTotal = document.getElementById('badge-total');
                    const badgeVencidos = document.getElementById('badge-vencidos');
                    const badgeAnticipados = document.getElementById('badge-anticipados');
                    
                    if (badgeTotal) badgeTotal.innerText = "Total: 0";
                    if (badgeVencidos) { badgeVencidos.innerText = "Vencidos: 0"; badgeVencidos.style.display = 'inline-flex'; }
                    if (badgeAnticipados) { badgeAnticipados.innerText = "Anticipados: 0"; badgeAnticipados.style.display = 'inline-flex'; }

                    container.insertAdjacentHTML('beforeend', `
                        <div style="text-align:center; padding:40px; color:#64748b;">
                            <div style="font-size:3rem; margin-bottom:10px;">🎉</div>
                            <p style="margin:0; font-weight:bold;">¡Todo al día!</p>
                        </div>
                    `);
                    return;
                }

        items.sort((a,b) => new Date(b.date) - new Date(a.date));

        const htmlPromises = items.map(async (item) => {
            
           // 🔥 SE CALCULA Y GENERA LA ETIQUETA DE TIEMPO TRANSCURRIDO 🔥
            const textoTiempo = obtenerTiempoTranscurrido(item.date);
            let badgeTiempoHtml = `<span style="background:#fee2e2; color:#b91c1c; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:6px; border: 1px solid #fecaca;">⏳ ${textoTiempo}</span>`;
            
            let txtEstado = "¡Pendiente!";
            let colorEstado = "#ea580c";
            
            // Racha de periodos que cerraron sin respuesta. Se muestra aparte del
            // estado para que el atraso acumulado quede a la vista.
            let badgeOmisionesHtml = '';
            if (item.vencimiento && item.vencimiento.periodosOmitidos > 0) {
                const textoRacha = window.textoOmisiones(item.vencimiento.frecuencia, item.vencimiento.periodosOmitidos);
                if (textoRacha) {
                    badgeOmisionesHtml = `<span style="background:#fef2f2; color:#991b1b; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:2px; border: 1px solid #fca5a5;">📉 ${textoRacha}</span>`;
                }
            }

            if (item.vencimiento) {
                if (item.vencimiento.vencida) {
                    const etiquetaVencida = item.vencimiento.tipoAviso === 'nunca' ? 'Nunca contestada' : 'Vencida';
                    badgeTiempoHtml = `<span style="background:#fee2e2; color:#b91c1c; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:6px; border: 1px solid #fecaca;">🚨 ${etiquetaVencida}</span>`;
                    txtEstado = "¡Vencida!";
                    colorEstado = "#b91c1c";
                } else if (item.vencimiento.tipoAviso === 'falta_periodo') {
                    badgeTiempoHtml = `<span style="background:#e0f2fe; color:#0369a1; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:6px; border: 1px solid #bae6fd;">📅 Falta ${item.vencimiento.nombrePeriodo}</span>`;
                    txtEstado = "¡Actualiza tu registro!";
                    colorEstado = "#0369a1";
                } else {
                    const d = item.vencimiento.diasFaltantes;
                    let txt = '';
                    if (d === 1) txt = 'mañana';
                    else if (d < 7) txt = `en ${d} días`;
                    else if (d < 30) txt = `en ${Math.floor(d / 7)} sem.`;
                    else txt = `en ${Math.floor(d / 30)} mes${Math.floor(d / 30)>1?'es':''}`;
                    
                    badgeTiempoHtml = `<span style="background:#fef9c3; color:#a16207; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:6px; border: 1px solid #fef08a;">⏳ Vence ${txt}</span>`;
                    txtEstado = "¡Por vencer!";
                    colorEstado = "#a16207";
                }
            }

            if (item.virtual_type === 'team_missing_survey') {
                
                let textoUltima = "Nunca contestada";
                if (item.vencimiento && item.vencimiento.ultimaFecha) {
                    const fechaUltima = new Date(item.vencimiento.ultimaFecha);
                    const d = String(fechaUltima.getDate()).padStart(2, '0');
                    const m = String(fechaUltima.getMonth() + 1).padStart(2, '0');
                    const y = fechaUltima.getFullYear();
                    textoUltima = `Última vez: ${d}/${m}/${y}`;
                }

                let freqText = "";
                if (item.original_data && item.original_data.frequency) {
                    const fMap = { 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual', 'quarterly': 'Trimestral', 'semiannual': 'Semestral', 'yearly': 'Anual', 'biennial': 'Bienal' };
                    freqText = fMap[item.original_data.frequency] || item.original_data.frequency;
                }
                const badgeFreqHtml = freqText ? `<span style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:2px; border: 1px solid #e2e8f0;">⏱️ ${freqText}</span>` : '';
                
                return `
                <div class="incident-card" style="border-left: 5px solid #ef4444;">
                    <div class="card-header" style="align-items: flex-start;">
                        <div class="thumb-container" style="background:#fef2f2; border:1px solid #fecaca; margin-top:4px;">
                            <span style="font-size:1.5rem;">⚠️</span>
                        </div>
                        <div class="card-info" style="flex: 1;">
                            <h3 class="card-title" style="margin-bottom:6px; font-size:1.05rem;">${item.title}</h3>
                            
                            <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px; margin-top:0;">
                                <span class="badge-type" style="background-color:#ef4444">Falta Contestar</span>
                                ${badgeFreqHtml}
                                ${badgeTiempoHtml}
                                ${badgeOmisionesHtml}
                            </div>
                            
                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:6px;">
                                <div style="display:flex; align-items:center; gap:6px; font-size:0.85rem; color:#334155;">
                                    <span style="font-weight:bold;">👤 ${item.sub_name}</span>
                                    <span style="color:#94a3b8;">|</span>
                                    <span>${item.sub_puesto}</span>
                                </div>
                                <div style="font-size:0.75rem; color:#64748b; display:flex; align-items:center; gap:4px;">
                                    <span>🔄</span> <span style="font-weight:600;">${textoUltima}</span>
                                </div>
                            </div>
                        </div>
                        <div class="card-actions" style="align-self: center;">
                            <button class="btn-firmar" onclick="alert('Pídele a ${item.sub_name.split(' ')[0]} que complete esta encuesta desde su panel de pendientes.')" style="color:#ef4444; border-color:#ef4444; background:white;">Recordar</button>
                        </div>
                    </div>
                </div>`;
            }

            if (item.virtual_type === 'boss_eval') {
                            const safeTitle = (item.description || "Evaluación").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                
                let textoUltima = "Nunca evaluado";
                if (item.vencimiento && item.vencimiento.ultimaFecha) {
                    const fechaUltima = new Date(item.vencimiento.ultimaFecha);
                    const d = String(fechaUltima.getDate()).padStart(2, '0');
                    const m = String(fechaUltima.getMonth() + 1).padStart(2, '0');
                    const y = fechaUltima.getFullYear();
                    textoUltima = `Última vez: ${d}/${m}/${y}`;
                }

                let freqText = "";
                if (item.original_data && item.original_data.frequency) {
                    const fMap = { 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual', 'quarterly': 'Trimestral', 'semiannual': 'Semestral', 'yearly': 'Anual', 'biennial': 'Bienal' };
                    freqText = fMap[item.original_data.frequency] || item.original_data.frequency;
                }
                const badgeFreqHtml = freqText ? `<span style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:2px; border: 1px solid #e2e8f0;">⏱️ ${freqText}</span>` : '';

                return `
                <div class="incident-card" style="border-left: 5px solid #be185d;">
                    <div class="card-header" style="align-items: flex-start;">
                        <div class="thumb-container" style="background:#fdf2f8; border:1px solid #fbcfe8; margin-top:4px;">
                            <span style="font-size:1.5rem;">👑</span>
                        </div>
                        <div class="card-info" onclick="window.confirmarEvaluacionSub('${item.real_eval_id}', '${safeTitle}', '${item.sub_id}', '${item.sub_name}', 'boss')" style="cursor:pointer; flex:1;">
                            <h3 class="card-title" style="margin-bottom:6px; font-size:1.05rem;">${item.title}</h3>
                            
                            <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px; margin-top:0;">
                                <span class="badge-type" style="background-color:#be185d">Desempeño</span>
                                <span style="color:#ea580c; font-weight:bold; font-size:0.8rem;">¡Falta evaluar!</span>
                                ${badgeFreqHtml}
                                ${badgeTiempoHtml}
                                ${badgeOmisionesHtml}
                            </div>
                            
                            <div style="background:#fdf2f8; border:1px solid #fce7f3; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:6px;">
                                <div style="font-size:0.85rem; color:#831843; font-weight:700;">
                                    📝 ${item.description}
                                </div>
                                <div style="font-size:0.75rem; color:#9d174d; display:flex; align-items:center; gap:4px;">
                                    <span>🔄</span> <span style="font-weight:600;">${textoUltima}</span>
                                </div>
                            </div>
                        </div>
                        <div class="card-actions" style="align-self: center;">
                            <button class="btn-firmar" onclick="window.confirmarEvaluacionSub('${item.real_eval_id}', '${safeTitle}', '${item.sub_id}', '${item.sub_name}', 'boss')" style="color:white; background:#be185d; border:none;">Evaluar</button>
                        </div>
                    </div>
                </div>`;
            }

if (item.virtual_type === 'waiting_boss') {
    return `
    <div class="incident-card" style="border-left: 5px solid #a855f7;">
        <div class="card-header" style="align-items: flex-start;">
            <div class="thumb-container" style="background:#f3e8ff; border:1px solid #d8b4fe; margin-top:4px;">
                <span style="font-size:1.5rem;">👑</span>
            </div>
            <div class="card-info" style="flex: 1;">
                <h3 class="card-title" style="margin-bottom:6px; font-size:1.05rem;">${item.title}</h3>
                
                <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px; margin-top:0;">
                    <span class="badge-type" style="background-color:#a855f7">Evaluación de Líder</span>
                    <span style="color:#7e22ce; font-weight:bold; font-size:0.8rem;">Pendiente de tu Jefe</span>
                    ${badgeTiempoHtml}
                </div>
                
                <div style="background:#f3e8ff; border:1px solid #e9d5ff; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:6px;">
                    <div style="font-size:0.85rem; color:#6b21a8;">
                        Tu supervisor debe acceder a su panel de pendientes para evaluar tu desempeño en esta categoría.
                    </div>
                </div>
            </div>
            <div class="card-actions" style="align-self: center;">
                <button class="btn-firmar" onclick="alert('Notificación enviada. Pídele a tu jefe inmediato que revise su bandeja de pendientes para completar tu evaluación.')" style="color:#7e22ce; border-color:#a855f7; background:white;">Recordar</button>
            </div>
        </div>
    </div>`;
}

            if (item.virtual_type === 'user_mal_revisada') {
                return `
                <div class="incident-card" style="border-left: 5px solid #a855f7;">
                    <div class="card-header">
                        <div class="thumb-container" style="background:#f3e8ff; border:1px solid #d8b4fe;">
                            <span style="font-size:1.5rem;">⚠️</span>
                        </div>
                        <div class="card-info" onclick="alert('Esta encuesta fue auditada y marcada como Mal Revisada.\\n\\nPor favor, contacta a tu jefe inmediato para pedirle que la vuelva a revisar y calificar correctamente en su bandeja de pendientes.')" style="cursor:pointer;">
                            <h3 class="card-title">${item.title}</h3>
                            <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-top:4px;">
                                <span class="badge-type" style="background-color:#a855f7">Atención</span>
                                <span style="color:#7e22ce; font-weight:bold;">Mal Revisada</span>
                                ${badgeTiempoHtml}
                            </div>
                            <div style="font-size:0.75rem; color:#64748b; margin-top:5px;">Pídele a tu jefe que la corrija.</div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-firmar" onclick="alert('Esta encuesta fue auditada y marcada como Mal Revisada.\\n\\nPor favor, contacta a tu jefe inmediato para pedirle que la vuelva a revisar y calificar correctamente en su bandeja de pendientes.')" style="color:#7e22ce; border-color:#a855f7; background:#f3e8ff;">Aviso</button>
                        </div>
                    </div>
                </div>`;
            }

            if (item.virtual_type === 'review') {
                const nombreEmp = window.employeeNameMap[item.employee_id] || "Usuario";
                const jsonString = JSON.stringify(item.original_data).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                
                const isMalRev = item.grado === 'Mal Revisada';
                const borderColor = isMalRev ? '#a855f7' : '#8b5cf6';
                const bgColor = isMalRev ? '#f3e8ff' : '#f3e8ff';
                const iconColor = isMalRev ? '#d8b4fe' : '#d8b4fe';
                const badgeColor = isMalRev ? '#a855f7' : '#8b5cf6';
                const subtitle = isMalRev ? '⚠️ Corrige tu calificación' : 'Requiere tu calificación';

                return `
                <div class="incident-card" style="border-left: 5px solid ${borderColor};">
                    <div class="card-header">
                        <div class="thumb-container" style="background:${bgColor}; border:1px solid ${iconColor};">
                            <span style="font-size:1.5rem;">📝</span>
                        </div>
                        <div class="card-info" onclick='window.verDetalleRespuesta(${jsonString})' style="cursor:pointer;">
                            <h3 class="card-title">${item.title}</h3>
                            <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-top:4px;">
                                <span class="badge-type" style="background-color:${badgeColor}">${isMalRev ? 'Mal Revisada' : 'Evaluación'}</span>
                                <span>👤 ${nombreEmp}</span>
                                ${badgeTiempoHtml}
                            </div>
                            <div style="font-size:0.75rem; color:#6b7280; margin-top:5px; font-weight:${isMalRev ? 'bold' : 'normal'};">${subtitle}</div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-firmar" onclick='window.verDetalleRespuesta(${jsonString})' style="color:${borderColor}; border-color:${borderColor};">🔍 Revisar</button>
                        </div>
                    </div>
                </div>`;
            }

            if (item.virtual_type === 'survey') {
                            const safeTitle = (item.title || "Evaluación").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
                
                let textoPeriodo = "Asignada a tu puesto"; 
                
                if (item.original_data && item.original_data.frequency) {
                    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const fechaActual = new Date();
                    const mesActual = meses[fechaActual.getMonth()];
                    const freq = item.original_data.frequency;
                    
                    if (freq === 'monthly') textoPeriodo = `Correspondiente a: ${mesActual}`;
                    else if (freq === 'biweekly') textoPeriodo = `Quincena actual (${fechaActual.getDate() <= 15 ? '1ra' : '2da'} de ${mesActual})`;
                    else if (freq === 'quarterly') textoPeriodo = `Trimestre actual (Q${Math.floor(fechaActual.getMonth() / 3) + 1})`;
                    else if (freq === 'semiannual') textoPeriodo = `Semestre actual (S${Math.floor(fechaActual.getMonth() / 6) + 1})`;
                    else if (freq === 'yearly') textoPeriodo = `Correspondiente al año ${fechaActual.getFullYear()}`;
                    else if (freq === 'weekly') textoPeriodo = `Correspondiente a esta semana`;
                }

                let textoUltima = "Nunca contestada";
                if (item.vencimiento && item.vencimiento.ultimaFecha) {
                    const fechaUltima = new Date(item.vencimiento.ultimaFecha);
                    const d = String(fechaUltima.getDate()).padStart(2, '0');
                    const m = String(fechaUltima.getMonth() + 1).padStart(2, '0');
                    const y = fechaUltima.getFullYear();
                    textoUltima = `Última vez: ${d}/${m}/${y}`;
                }

                let freqText = "";
                if (item.original_data && item.original_data.frequency) {
                    const fMap = { 'weekly': 'Semanal', 'biweekly': 'Quincenal', 'monthly': 'Mensual', 'quarterly': 'Trimestral', 'semiannual': 'Semestral', 'yearly': 'Anual', 'biennial': 'Bienal' };
                    freqText = fMap[item.original_data.frequency] || item.original_data.frequency;
                }
                const badgeFreqHtml = freqText ? `<span style="background:#f1f5f9; color:#475569; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; margin-left:2px; border: 1px solid #e2e8f0;">⏱️ ${freqText}</span>` : '';

                return `
                <div class="incident-card" style="border-left: 5px solid #2563eb;">
                    <div class="card-header" style="align-items: flex-start;">
                        <div class="thumb-container" style="background:#eff6ff; border:1px solid #bfdbfe; margin-top:4px;">
                            <span style="font-size:1.5rem;">✍️</span>
                        </div>
                        <div class="card-info" onclick="window.responderDirecto('${item.id}', '${safeTitle}')" style="cursor:pointer; flex:1;">
                            <h3 class="card-title" style="margin-bottom:6px; font-size:1.05rem;">${item.title}</h3>
                            
                            <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:8px; margin-top:0;">
                                <span class="badge-type" style="background-color:#2563eb">Encuesta</span>
                                <span style="color:${colorEstado}; font-weight:bold; font-size:0.8rem;">${txtEstado}</span>
                                ${badgeFreqHtml}
                                ${badgeTiempoHtml}
                                ${badgeOmisionesHtml}
                            </div>
                            
                            <div style="background:#eff6ff; border:1px solid #dbeafe; border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:6px;">
                                <div style="font-size:0.85rem; color:#1e40af; font-weight:700;">
                                    📅 ${textoPeriodo}
                                </div>
                                <div style="font-size:0.75rem; color:#1e3a8a; display:flex; align-items:center; gap:4px;">
                                    <span>🔄</span> <span style="font-weight:600;">${textoUltima}</span>
                                </div>
                            </div>
                        </div>
                        <div class="card-actions" style="align-self: center;">
                            <button class="btn-firmar" onclick="window.responderDirecto('${item.id}', '${safeTitle}')" style="color:white; background:#2563eb; border:none;">Responder</button>
                        </div>
                    </div>
                </div>`;
            }
                    

            window.incidentCache[item.id] = item;
            
            const tipo = item.tipo || 'Incidente';
            let colorClase = tipo === 'Difusión' ? 'type-difusion' : 'type-incidente';
            let badgeColor = tipo === 'Difusión' ? '#3b82f6' : '#ef4444';
            const gradoHtml = (tipo === 'Incidente') ? `<span style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">${item.grado||'General'}</span>` : '';
            
            let nombreIcono = 'Difusion.png';
            if (tipo === 'Incidente') nombreIcono = 'Incidente.png';

            let thumbHtml = `
                <div class="thumb-container" style="background:white; border:1px solid #e2e8f0;">
                    <img src="${nombreIcono}" class="thumb-img" style="object-fit: contain; padding: 2px;">
                </div>`;

            let isSigned = false;
            if (modo === 'PROPIOS') {
                isSigned = item.incident_signatures ? item.incident_signatures.some(s => String(s.employee_id) === String(user.id)) : false;
                if (isSigned) return null;
            }

            let btnHtml = isSigned
                            ? `<button class="btn-firmar btn-firmado" disabled>✅ Enterado</button>`
                            : `<button class="btn-firmar" id="btn-sign-${item.id}" onclick="window.abrirDetalleIndependiente('${item.id}')" style="background:#f0fdf4; color:#166534; border-color:#4ade80; font-weight:bold;">👁️ Ver y Firmar</button>`;

                        let progressHtml = '';
                        if (modo === 'EQUIPO') {
                            const hierarchyIds = window.obtenerJerarquiaCompleta(user.id);
                            const myFullTeam = window.todosLosEmpleadosData.filter(e => hierarchyIds.has(String(e.id)));
                            
                            const [y, m, d] = item.date.split('-');
                            const fechaInc = new Date(y, m - 1, d);

                            const eligibleTeam = myFullTeam.filter(e => {
                                const empPuesto = e.puesto ? e.puesto.trim().toUpperCase() : "";
                                if (["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"].includes(empPuesto)) return false;

                                const empDate = new Date(e.date);
                                empDate.setHours(0,0,0,0);
                                return empDate <= fechaInc;
                            });
                            
                            const totalTarget = eligibleTeam.length;
                            let signedCount = 0;
                            if (totalTarget > 0 && item.incident_signatures) {
                                const signaturesSet = new Set(item.incident_signatures.map(s => String(s.employee_id)));
                                signedCount = eligibleTeam.filter(e => signaturesSet.has(String(e.id))).length;
                            }
                            const pct = totalTarget > 0 ? Math.round((signedCount / totalTarget) * 100) : 0;
                            
                            progressHtml = `<div class="progress-section"><div class="progress-info"><span>Mi Estructura: ${signedCount} / ${totalTarget}</span><strong>${pct}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
                        }

                        return `
                        <div class="incident-card ${colorClase}" id="card-${item.id}" style="border-left: none;">
                            <div class="card-header">
                                ${thumbHtml}
                                <div class="card-info" onclick="window.abrirDetalleIndependiente('${item.id}')">
                        <h3 class="card-title">${item.title}</h3>
                        <div class="card-meta" style="display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin-top:4px;">
                            <span class="badge-type" style="background-color:${badgeColor}">${tipo}</span>
                            ${gradoHtml} • ${item.date}
                            ${badgeTiempoHtml}
                        </div>
                        ${progressHtml}
                    </div>
                    <div class="card-actions">
                        ${btnHtml}
                    </div>
                </div>
            </div>`;
                    });

        const cards = await Promise.all(htmlPromises);
                            
                            let total = 0;
                            let vencidos = 0;
                            let anticipados = 0;

                            const validCards = cards.filter((c, index) => {
                                if (c !== null) {
                                    total++;
                                    const item = items[index];
                                    
                                    // Lógica para clasificar contadores:
                                    // Si tiene "vencida: false" es un aviso anticipado o de cambio de periodo.
                                    if (item.vencimiento && item.vencimiento.vencida === false) {
                                        anticipados++;
                                    } else {
                                        // Las firmas de enterado de incidentes, encuestas vencidas matemáticamente y mal revisadas,
                                        // se agrupan en Vencidos / Urgentes porque requieren acción obligatoria e inmediata.
                                        vencidos++;
                                    }
                                    return true;
                                }
                                return false;
                            });
                            
                            container.insertAdjacentHTML('beforeend', validCards.join(''));
                            
                            const badgeTotal = document.getElementById('badge-total');
                            const badgeVencidos = document.getElementById('badge-vencidos');
                            const badgeAnticipados = document.getElementById('badge-anticipados');

                            if (badgeTotal) badgeTotal.innerText = `Total: ${total}`;
                            
                            if (badgeVencidos) {
                                badgeVencidos.innerText = `Vencidos / Urgentes: ${vencidos}`;
                                badgeVencidos.style.display = 'inline-flex';
                            }
                            if (badgeAnticipados) {
                                badgeAnticipados.innerText = `Anticipados: ${anticipados}`;
                                badgeAnticipados.style.display = 'inline-flex';
                            }

                        } catch (e) {
                    console.error(e);
                    container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Error al cargar pendientes: ${e.message}</div>`;
                }
};

window.cerrarModalPendientes = () => {
    document.getElementById('modal-pendientes').style.display = 'none';
    window.mostrandoPendientes = false;
    window.mostrandoPendientesEquipo = false;

    // 🔥 FIX: USAMOS BLOCK EN LUGAR DE FLEX PARA PRESERVAR EL DISEÑO
    const header = document.getElementById('main-user-header');
    if (header) {
        header.style.display = 'block';
        header.classList.remove('hidden');
    }

    // 🔄 ACTUALIZACIÓN DE BADGES DEL DASHBOARD
    // Al cerrar el panel, recalculamos los pendientes para actualizar el contador de la foto
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if (user && typeof window.calcularPendientesBatch === 'function') {
        // Forzamos la limpieza de la caché para obtener los números reales de la base de datos
        if (typeof window.invalidarCacheDashboard === 'function') {
            window.invalidarCacheDashboard();
        }
        // Llamamos al cálculo batch para el usuario (esto actualiza el badge de la foto)
        window.calcularPendientesBatch([user.id]);
    }
    
    const userInfo = document.getElementById('header-user-info');
    if (userInfo && userInfo.innerHTML.trim() === '' && typeof window.volverAlDashboard === 'function') {
        window.volverAlDashboard();
    }
};

console.log("✅ Pendientes v19: Display Block Integrado + Tiempo transcurrido");
