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

// --- DESDE CUÁNDO LE CORRÍA EL PENDIENTE ---
// La base no guarda en ningún lado el momento en que una encuesta apareció en
// el panel de pendientes de alguien: los pendientes se calculan al vuelo cada
// vez que se abre el panel. No hace falta guardarlo, porque el inicio es
// determinista: una encuesta mensual arranca el día 1, una semanal el lunes.
// Es el mismo `window.periodoVigente` de 7-pendientes.js, que es justo la
// definición con la que el panel decide qué te muestra.
//
// El origen real de cada persona es el más tardío de tres fechas: el inicio
// del periodo, el alta de la encuesta —antes no existía— y el alta del
// empleado —antes no estaba para contestarla—.
window.origenDelPendiente = (frecuencia, altaEncuesta, empObj, fechaRespuesta) => {
    const periodo = window.periodoVigente ? window.periodoVigente(frecuencia, fechaRespuesta) : null;
    let origen = periodo ? new Date(periodo.inicio) : null;

    if (altaEncuesta) {
        const alta = new Date(altaEncuesta);
        if (!isNaN(alta) && (!origen || alta > origen)) origen = alta;
    }
    if (window.fechaDeAltaEmpleado) {
        const altaEmp = window.fechaDeAltaEmpleado(empObj);
        if (altaEmp && !isNaN(altaEmp) && origen && altaEmp > origen) origen = altaEmp;
    }
    if (!origen || isNaN(origen)) return null;

    return { origen: origen, cierre: periodo ? periodo.fin : null };
};

// --- REPARTO EN CUADROS (TREEMAP) ---
// El mismo dibujo que el mapa de activos, pero aquí la geometría se calcula a
// mano en lugar de con d3: el mapa es una pantalla aparte que ya carga la
// librería entera, y el panel principal no la carga para nada más. Traerla por
// este único gráfico serían 280 KB en el arranque de todos los días.
//
// El algoritmo es squarify (Bruls, Huizing y van Wijk), el mismo que hay
// detrás de d3.treemapSquarify: va formando filas contra el lado corto del
// rectángulo que queda libre y cierra la fila en cuanto añadir un cuadro más
// empeoraría la peor proporción de la fila.
window.repartirEnCuadros = (valores, ancho, alto) => {
    const items = valores
        .map((v, i) => ({ indice: i, valor: Math.max(Number(v) || 0, 0) }))
        .filter(it => it.valor > 0)
        .sort((a, b) => b.valor - a.valor);

    if (items.length === 0 || ancho <= 0 || alto <= 0) return [];

    const suma = items.reduce((a, it) => a + it.valor, 0);
    const escala = (ancho * alto) / suma;
    items.forEach(it => { it.area = it.valor * escala; });

    // Peor proporción (lado largo entre lado corto) de una fila de área total
    // `sumaFila` apoyada sobre un lado de longitud `lado`.
    const peorProporcion = (fila, lado, sumaFila) => {
        if (sumaFila <= 0) return Infinity;
        const grosor = sumaFila / lado;
        let peor = 1;
        fila.forEach(it => {
            const largo = it.area / grosor;
            peor = Math.max(peor, largo / grosor, grosor / largo);
        });
        return peor;
    };

    const cuadros = [];
    let x = 0, y = 0, libreAncho = ancho, libreAlto = alto;
    let fila = [], sumaFila = 0;

    const cerrarFila = () => {
        const lado = Math.min(libreAncho, libreAlto);
        const grosor = sumaFila / lado;
        let avance = 0;
        fila.forEach(it => {
            const largo = it.area / grosor;
            if (libreAncho >= libreAlto) {
                // Fila en columna, pegada al borde izquierdo de lo que queda.
                cuadros.push({ indice: it.indice, x: x, y: y + avance, ancho: grosor, alto: largo });
            } else {
                cuadros.push({ indice: it.indice, x: x + avance, y: y, ancho: largo, alto: grosor });
            }
            avance += largo;
        });
        if (libreAncho >= libreAlto) { x += grosor; libreAncho -= grosor; }
        else { y += grosor; libreAlto -= grosor; }
        fila = []; sumaFila = 0;
    };

    items.forEach(it => {
        const lado = Math.min(libreAncho, libreAlto);
        if (fila.length > 0 &&
            peorProporcion(fila.concat(it), lado, sumaFila + it.area) > peorProporcion(fila, lado, sumaFila)) {
            cerrarFila();
        }
        fila.push(it);
        sumaFila += it.area;
    });
    if (fila.length > 0) cerrarFila();

    return cuadros;
};

// --- CUESTIONARIO DE REFERENCIA DE UN PERIODO ---
// Una encuesta se edita: se agrega una pregunta, se borra otra. Las respuestas
// viejas siguen guardando su calificación bajo el id de las preguntas que
// tenían, así que un periodo puede traer respuestas de dos cuestionarios
// distintos y el radar acabaría dibujando ejes de preguntas que ya no existen.
//
// La regla es la del periodo: lo contestado antes de la edición vale para su
// periodo con el cuestionario que había entonces, y del periodo siguiente en
// adelante manda el cuestionario actualizado. Aquí se decide cuál de los dos
// rige lo que se está mirando: si en el periodo hay aunque sea una respuesta
// del cuestionario de hoy, es que la edición ya ocurrió y manda el de hoy; si
// no hay ninguna, el periodo es anterior a la edición y manda el suyo, el que
// más respuestas tenga.
//
// No hace falta ninguna columna nueva: el juego de preguntas calificadas es la
// huella de la versión con la que se contestó. Lo que no distingue es un
// cambio de enunciado, que conserva el id de la pregunta.
window.cuestionarioDeReferencia = (respuestas, preguntasVigentes) => {
    const firmaDe = (r) => Object.keys(r.grades_json || {}).sort().join('|');

    const vigentes = (preguntasVigentes || []).filter(p => p && p.id);
    const firmaVigente = vigentes.map(p => String(p.id)).sort().join('|');

    // Sin calificar no hay huella: esas respuestas no dicen de qué versión son.
    const conNotas = (respuestas || []).filter(r => Object.keys(r.grades_json || {}).length > 0);

    const conteoFirmas = {};
    conNotas.forEach(r => {
        const f = firmaDe(r);
        conteoFirmas[f] = (conteoFirmas[f] || 0) + 1;
    });

    let firmaElegida = '';
    if (firmaVigente && conteoFirmas[firmaVigente]) {
        firmaElegida = firmaVigente;
    } else {
        let mejor = 0;
        Object.keys(conteoFirmas).forEach(f => {
            if (conteoFirmas[f] > mejor) { mejor = conteoFirmas[f]; firmaElegida = f; }
        });
    }

    let preguntas;
    if (firmaElegida && firmaElegida === firmaVigente) {
        preguntas = vigentes.map(p => ({ id: String(p.id), texto: p.texto || '' }));
    } else {
        // El cuestionario de ese periodo ya no está en la base. Se reconstruye
        // con las llaves de las respuestas y con el enunciado que ellas mismas
        // guardaron al calificarse.
        const textos = {};
        conNotas.forEach(r => {
            Object.entries(r.grades_json || {}).forEach(([qKey, g]) => {
                if (textos[qKey]) return;
                if (g && typeof g === 'object') textos[qKey] = g.question || g.title || g.text || g.label || '';
            });
        });
        preguntas = (firmaElegida ? firmaElegida.split('|') : []).map(id => ({ id: id, texto: textos[id] || '' }));
    }

    return {
        preguntas: preguntas,
        esElVigente: !!firmaVigente && firmaElegida === firmaVigente,
        totalCalificadas: conNotas.length,
        deOtraVersion: conNotas.filter(r => firmaDe(r) !== firmaElegida).length
    };
};

// Ejes del radar cuando se mira una sola encuesta: uno por cada pregunta del
// cuestionario de referencia y en su orden, no uno por cada llave que aparezca
// en las respuestas. Una pregunta que nadie ha contestado todavía no dibuja
// eje: valdría cero y se leería como que todos la fallaron.
window.ejesPorPregunta = (referencia, mapaPreguntas, textoUsuarios) => {
    const labels = [], puntos = [], usuarios = [], completos = [];
    let n = 1;
    referencia.preguntas.forEach(p => {
        const d = mapaPreguntas[p.id];
        if (!d || d.count === 0) { n++; return; }
        const enunciado = p.texto || d.labelText || '';
        let label = enunciado && enunciado.length <= 40 ? enunciado : `Pregunta ${n}`;
        if (!enunciado && String(p.id).match(/^[0-9a-fA-F-]+$/)) label = `P${n}`;
        labels.push(label);
        puntos.push(Math.round(d.sum / d.count));
        usuarios.push(textoUsuarios(d));
        completos.push(enunciado || p.id);
        n++;
    });
    return { labels, puntos, usuarios, completos };
};

// Aviso bajo el título del radar cuando el periodo mezcla versiones.
window.avisoDeVersion = (referencia) => {
    const el = document.getElementById('aviso-version-encuesta');
    if (!el) return;
    if (!referencia || referencia.deOtraVersion === 0) { el.style.display = 'none'; el.innerText = ''; return; }
    const n = referencia.deOtraVersion;
    el.style.display = 'block';
    el.innerText = `${n} de ${referencia.totalCalificadas} respuestas se contestaron con otra versión del cuestionario y no entran en la gráfica; sí cuentan en participación y calificación.`;
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

        // El cuestionario de hoy. Las respuestas guardan la calificación bajo
        // el id de la pregunta, así que sin esta lista no hay forma de saber
        // cuáles de esas preguntas siguen existiendo.
        const p3 = sb.from('evaluation_questions').select('id, evaluation_id, question_text, order_index').order('order_index');

        const [_, resEvals, rawResponses, resPreguntas] = await Promise.all([p1, p2, fetchTodasLasRespuestas(), p3]);

        if (resEvals.error) throw new Error("Error evaluaciones: " + resEvals.error.message);

        const evalsList = resEvals.data || [];

        const catSet = new Set();
        evalsList.forEach(e => catSet.add(e.category || 'General'));
        const categories = Array.from(catSet).sort();

        // Si la consulta falla, el mapa queda vacío y la pantalla se comporta
        // como antes: los ejes salen de las respuestas y no del cuestionario.
        const preguntasPorEncuesta = {};
        (resPreguntas && resPreguntas.data ? resPreguntas.data : []).forEach(q => {
            const clave = String(q.evaluation_id);
            if (!preguntasPorEncuesta[clave]) preguntasPorEncuesta[clave] = [];
            preguntasPorEncuesta[clave].push({ id: String(q.id), texto: q.question_text || '' });
        });

        window.encuestasRawData = {
            evalsList,
            rawResponses,
            categories,
            preguntasPorEncuesta
        };

        window.renderizarPanelEstadisticas('GLOBAL');

    } catch (e) {
        console.error("Error fatal en stats:", e);
        container.innerHTML = `<div style="text-align:center; padding:40px;"><h3 style="color:#ef4444;">Error de Conexión</h3><p>${e.message}</p></div>`;
    }
};


// Una respuesta está procesada en cuanto alguien la calificó, sea cual sea el
// veredicto: revisada, certificada, falsa o mal revisada. Lo que queda fuera
// son las que nadie ha tocado todavía.
window.procesadasDe = (d) => (d.reviewed || 0) + (d.certificadas || 0)
    + (d.falsas || 0) + (d.malRevisadas || 0);

// El porcentaje que se lee en pantalla. `Math.round` decía 100% con 478 de
// 480 —faltando dos— y 0% con 1 de 480, que son las dos cifras que nadie
// quiere ver mal: el 100% es el cierre total y el 0% es no haber empezado.
// Así que los dos extremos se reservan para lo exacto y lo de en medio se
// aparca en 99 y en 1.
//
// Admite las dos formas en que aparece la medida por la pantalla: una
// proporción ya hecha —`pctTexto(0.995)`— o la cuenta y su total
// —`pctTexto(478, 480)`—.
//
// Sólo vale para el texto. La geometría —el alto de un relleno, el de una
// barra— se sigue calculando con la proporción sin redondear, que para eso
// no tiene que caber en dos cifras.
window.pctTexto = (parte, total) => {
    const p = total === undefined
        ? Number(parte)
        : (Number(total) > 0 ? Number(parte) / Number(total) : 0);

    if (!isFinite(p) || p <= 0) return 0;
    if (p >= 1) return 100;

    const pct = Math.round(p * 100);
    if (pct >= 100) return 99;  // Le falta algo: no es cierre total.
    if (pct <= 0) return 1;     // Algo hay: no es no haber empezado.
    return pct;
};

// Lo que mide el desglose. Ordena las barras y es lo que pintan y dicen los
// cuadros, así que el conmutador del encabezado gobierna las dos formas.
// `valor` devuelve una proporción de 0 a 1 sobre las encuestas asignadas; la
// calificación es la excepción, que ya viene en porcentaje.
window.CRITERIOS_STATS = [
    { clave: 'participacion', etiqueta: 'Participación', nombre: 'contestadas', color: '#3b82f6', relleno: '#bfdbfe',
      extremo: 'El que menos contesta',
      valor: (d) => d.assignedCount > 0 ? (d.responses || 0) / d.assignedCount : 0 },
    // Cuánto lleva revisado quien califica, de todo lo que ya le contestaron.
    // Es el único criterio que no se mide sobre las asignadas: una encuesta
    // sin contestar no se le puede revisar a nadie, así que meterla en el
    // denominador volvería a medir participación en lugar del trabajo del
    // revisor. Por lo mismo, quien no tiene ni una respuesta no dice 0% sino
    // «sin contestar», y queda fuera del renglón del peor.
    { clave: 'avance_revision', etiqueta: 'Avance de revisión', nombre: 'de lo contestado', color: '#0891b2', relleno: '#a5f3fc',
      extremo: 'El que menos lleva revisado',
      valor: (d) => (d.responses || 0) > 0 ? window.procesadasDe(d) / d.responses : 0,
      texto: (d) => (d.responses || 0) > 0
          ? `${window.pctTexto(window.procesadasDe(d), d.responses)}% · ${window.procesadasDe(d)}/${d.responses}`
          : 'sin contestar' },
    { clave: 'revisadas_altas', etiqueta: 'Revisadas ≥80%', nombre: 'revisadas ≥80%', color: '#047857', relleno: '#6ee7b7',
      extremo: 'El que menos revisadas altas tiene',
      valor: (d) => d.assignedCount > 0 ? (d.revisadasAltas || 0) / d.assignedCount : 0 },
    { clave: 'certificadas', etiqueta: 'Certificadas', nombre: 'certificadas', color: '#eab308', relleno: '#fde68a',
      extremo: 'El que menos certifica',
      valor: (d) => d.assignedCount > 0 ? (d.certificadas || 0) / d.assignedCount : 0 },
    // En falsas y mal revisadas lo malo es tener muchas, así que el señalado
    // es el de arriba y no el de abajo.
    { clave: 'falsas', etiqueta: 'Falsas', nombre: 'falsas', color: '#ef4444', relleno: '#fecaca',
      extremo: 'El que más falsas tiene', peorEsAlto: true,
      valor: (d) => d.assignedCount > 0 ? (d.falsas || 0) / d.assignedCount : 0 },
    { clave: 'mal_revisadas', etiqueta: 'Mal rev.', nombre: 'mal revisadas', color: '#a855f7', relleno: '#e9d5ff',
      extremo: 'El que más mal revisadas tiene', peorEsAlto: true,
      valor: (d) => d.assignedCount > 0 ? (d.malRevisadas || 0) / d.assignedCount : 0 },
    { clave: 'calificacion', etiqueta: 'Calificación', nombre: 'de calificación', color: '#16a34a', relleno: '#86efac',
      extremo: 'El de peor calificación',
      valor: (d) => d.countScore > 0 ? (d.sumScore / d.countScore) / 100 : 0 },
    // Prontitud: qué parte del plazo quedaba sin gastar al contestar. Lleno es
    // pronto. Dentro del cuadro no se enseña esa proporción sino los días, que
    // es lo que se entiende sin explicación.
    { clave: 'prontitud', etiqueta: 'Prontitud', nombre: 'de prontitud', color: '#6366f1', relleno: '#c7d2fe',
      extremo: 'El más lento', escalaRelativa: true,
      valor: (d) => d.countProntitud > 0 ? d.sumProntitud / d.countProntitud : 0,
      texto: (d) => d.countDias > 0 ? window.textoDias(d.sumDias / d.countDias) : 'sin datos' }
];

// Días con una cifra, y en horas cuando es menos de un día: «4.2 días» dice
// poco de una encuesta que se contesta la misma mañana.
window.textoDias = (dias) => {
    if (dias === null || dias === undefined || isNaN(dias)) return 'sin datos';
    if (dias < 1) {
        const horas = Math.round(dias * 24);
        return horas <= 1 ? 'menos de 1 h' : `${horas} h`;
    }
    return `${dias.toFixed(1)} días`;
};

// Cuál de los cuadros es el que hay que mirar. Un treemap coloca por tamaño y
// no por medida, así que con valores parecidos todos los rellenos se ven
// iguales y no hay forma de ver quién va peor: eso lo dice este renglón.
window.extremoDelCriterio = (nodos) => {
    const criterio = window.criterioStats();
    const conDatos = (nodos || []).filter(n => {
        if (criterio.clave === 'prontitud') return n.datos.countProntitud > 0;
        if (criterio.clave === 'calificacion') return n.datos.countScore > 0;
        // Sin respuestas no hay revisión atrasada que reprocharle a nadie.
        if (criterio.clave === 'avance_revision') return (n.datos.responses || 0) > 0;
        return (n.datos.assignedCount || 0) > 0;
    });
    if (conDatos.length < 2) return null;

    const peor = conDatos.reduce((a, b) => {
        const va = criterio.valor(a.datos), vb = criterio.valor(b.datos);
        if (criterio.peorEsAlto) return vb > va ? b : a;
        return vb < va ? b : a;
    });

    return {
        nombre: peor.nombre,
        cifra: window.cifraDelCriterio(peor.datos)
    };
};

// La cifra de una fila según el criterio: los días en prontitud, el porcentaje
// en los demás.
window.cifraDelCriterio = (fila) => {
    const criterio = window.criterioStats();
    if (criterio.texto) return criterio.texto(fila);
    return `${window.pctTexto(criterio.valor(fila))}% ${criterio.nombre}`;
};

window.criterioStats = () => window.CRITERIOS_STATS.find(c => c.clave === window.currentStatsSortCriterion)
    || window.CRITERIOS_STATS[0];

window.currentStatsSortCriterion = sessionStorage.getItem('criterioStats') || 'participacion';

window.cambiarOrdenStats = (criterio) => {
    window.currentStatsSortCriterion = criterio;
    sessionStorage.setItem('criterioStats', criterio);
    // Sólo hay que repintar el desglose: los totales de arriba y el radar no
    // dependen del criterio.
    window.pintarDesglose();
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
            frequency: f,
            alta: e.created_at || null
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
    let totalDiasAtencion = 0;
    let countDiasAtencion = 0;
    
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

        // Cuánto tardó en atenderla desde que le apareció como pendiente, y qué
        // parte del plazo le quedaba sin gastar al enviarla. Se guardan en la
        // respuesta como el puntaje, para que los desgloses por colaborador no
        // tengan que volver a calcularlos.
        r.diasAtencion = null;
        r.prontitud = null;
        const marca = window.origenDelPendiente(evalInfo.frequency, evalInfo.alta, empObj, new Date(r.submitted_at));
        if (marca) {
            const transcurrido = new Date(r.submitted_at) - marca.origen;
            r.diasAtencion = Math.max(0, transcurrido) / 86400000;
            if (marca.cierre) {
                const plazo = marca.cierre - marca.origen;
                // Sin plazo no hay prontitud que medir: las encuestas de una
                // sola vez no tienen periodo que gastar.
                if (plazo > 0) r.prontitud = Math.max(0, Math.min(1, 1 - Math.max(0, transcurrido) / plazo));
            }
        }

        if (statsCache[dept]) {
            statsCache[dept].responses++;
            if (statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].responses++;
        }
        
        if (puestoCache[empPuestoKey]) {
            puestoCache[empPuestoKey].responses++;
        }

        const sumarTiempos = (fila) => {
            if (!fila) return;
            if (r.diasAtencion !== null) {
                fila.sumDias = (fila.sumDias || 0) + r.diasAtencion;
                fila.countDias = (fila.countDias || 0) + 1;
            }
            if (r.prontitud !== null) {
                fila.sumProntitud = (fila.sumProntitud || 0) + r.prontitud;
                fila.countProntitud = (fila.countProntitud || 0) + 1;
            }
        };
        sumarTiempos(statsCache[dept]);
        if (statsCache[dept]) sumarTiempos(statsCache[dept].supervisors[sup]);
        sumarTiempos(puestoCache[empPuestoKey]);
        if (r.diasAtencion !== null) { totalDiasAtencion += r.diasAtencion; countDiasAtencion++; }

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
    let referenciaCuestionario=null;
    if(isSingleEvalMode){
    const evalTitle=evalsList[0].title;
    referenciaCuestionario=window.cuestionarioDeReferencia(
        dataset.filter(r=>r.review_status==='Revisado'||r.review_status==='Certificada'),
        raw.preguntasPorEncuesta?raw.preguntasPorEncuesta[String(evalsList[0].id)]:[]
    );
    const uniqueAssigned=radarGroupingUsersAssigned[evalTitle]?radarGroupingUsersAssigned[evalTitle].size:0;
    const ejes=window.ejesPorPregunta(referenciaCuestionario,radarQuestionsMap,
        (d)=>`${d.users.size} de ${uniqueAssigned} usuarios`);
    radarLabels.push(...ejes.labels);
    radarDataPoints.push(...ejes.puntos);
    radarUserStats.push(...ejes.usuarios);
    radarFullLabels.push(...ejes.completos);
    }else{
    Object.keys(radarPerfMap).sort().forEach(key=>{
    const d=radarPerfMap[key];
    const avg=d.count>0?window.pctTexto(d.sum/d.count/100):0;
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
        const participacionGlobal = window.pctTexto(totalContestadas, totalAsignadasGlobal);
        const porcentajeRevision = window.pctTexto(totalRevisadas, totalContestadas);
        const globalAvgScore = totalRevisadas > 0 ? window.pctTexto(totalScoreSum / totalRevisadas / 100) : 0;
        const promedioDias = countDiasAtencion > 0 ? (totalDiasAtencion / countDiasAtencion) : null;
        
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
            <div class="stats-tarjeta">
                <div class="stats-tarjeta-rotulo">Tiempo de Atención</div>
                <div class="stats-tarjeta-cifra" style="color:#6366f1;">${window.textoDias(promedioDias).replace(/ (días|h)$/, '<span> $1</span>')}</div>
                <div class="stats-tarjeta-pie">${countDiasAtencion > 0 ? 'Desde que abre el periodo' : 'Sin datos en este periodo'}</div>
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
                <h3 class="stats-seccion-titulo">Desglose</h3>
                <div class="stats-conmutador" id="conmutador-dimension">
                    <button data-dimension="departamento" onclick="window.cambiarDimensionDesglose('departamento')">Departamento</button>
                    <button data-dimension="puesto" onclick="window.cambiarDimensionDesglose('puesto')">Puesto</button>
                </div>
                <div class="stats-conmutador" id="conmutador-forma">
                    <button data-forma="cuadros" onclick="window.cambiarFormaDesglose('cuadros')">Cuadros</button>
                    <button data-forma="barras" onclick="window.cambiarFormaDesglose('barras')">Barras</button>
                </div>
                <div class="stats-conmutador stats-conmutador--desliza hide-scrollbar" id="conmutador-criterio">
                    ${window.CRITERIOS_STATS.map(c => `<button data-criterio="${c.clave}" onclick="window.cambiarOrdenStats('${c.clave}')">${c.etiqueta}</button>`).join('')}
                </div>
            </div>
            <div id="desglose-container"></div>
        </div>

        <div class="stats-seccion" id="stats-seccion-radar">
            <div style="border-bottom:1px solid #f1f5f9; padding-bottom:12px; margin-bottom:15px;">
                <h3 id="titulo-radar-text" class="stats-seccion-titulo">Panorama de cumplimiento</h3>
            </div>

            <div id="stats-radar-wrapper" style="width: 100%; max-width: 400px; margin: 0 auto; display:block;">
                <h4 id="radar-title" style="text-align:center; color:#64748b; font-size:0.85rem; text-transform:uppercase; margin-bottom:10px;">
                    ${categoriaFiltro === 'GLOBAL' ? 'Promedio por categoría' : 'Detalle de Evaluaciones: ' + categoriaFiltro}
                </h4>
                <div id="aviso-version-encuesta" style="display:none; background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:0.75rem; line-height:1.35; border-radius:8px; padding:8px 10px; margin-bottom:10px;"></div>
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
        window.avisoDeVersion(referenciaCuestionario);
        window.pintarDesglose();

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

    const respuestasDelRecorte = [];
    cache.cleanResponses.forEach(r => {
        if (r.review_status !== 'Revisado' && r.review_status !== 'Certificada') return;
        const evalInfo = activeEvalsMap[r.evaluation_id];
        if (!evalInfo) return;
        if (!validEmpIds.has(String(r.employee_id))) return;
        respuestasDelRecorte.push(r);

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
    
    let referenciaCuestionario = null;
    if (isSingleEvalMode) {
        const evalTitle = evalsInCat[0].title;
        const preguntasDeLaBase = window.encuestasRawData && window.encuestasRawData.preguntasPorEncuesta
            ? window.encuestasRawData.preguntasPorEncuesta[String(evalsInCat[0].id)]
            : [];
        referenciaCuestionario = window.cuestionarioDeReferencia(respuestasDelRecorte, preguntasDeLaBase);

        const uniqueAssigned = assignedMap[evalTitle] ? assignedMap[evalTitle].size : 0;
        const ejes = window.ejesPorPregunta(referenciaCuestionario, radarQuestionsMap,
            (d) => `${d.users.size} de ${uniqueAssigned} usuarios`);
        radarLabels.push(...ejes.labels);
        radarDataPoints.push(...ejes.puntos);
        radarUserStats.push(...ejes.usuarios);

        referenciaCuestionario.preguntas.forEach(p => {
            const d = radarQuestionsMap[p.id];
            if (d) d.users.forEach(u => totalU.add(u));
        });
        if (assignedMap[evalTitle]) assignedMap[evalTitle].forEach(u => totalA.add(u));
    } else {
        Object.keys(radarMap).sort().forEach(key => {
            const d = radarMap[key];
            const avg = d.count > 0 ? window.pctTexto(d.sum / d.count / 100) : 0;
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
    window.avisoDeVersion(referenciaCuestionario);

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
                    const avg = conteoRecorte > 0 ? window.pctTexto(sumaRecorte / conteoRecorte / 100) : 0;

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
        const avg = window.pctTexto(d.sum / d.countRevisadas / 100);
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
const avg=d.count>0?window.pctTexto(d.sum/d.count/100):0;
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
const uAvg=window.pctTexto(u.sum/u.count/100);
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

// --- DESGLOSE POR DEPARTAMENTO O POR PUESTO ---
// Un solo bloque con dos conmutadores: por qué se corta —departamento o
// puesto— y con qué forma se dibuja —cuadros o barras—. Antes eran dos
// secciones con el mismo gráfico repetido, una debajo de la otra.
//
// Ambas elecciones se recuerdan mientras dure la sesión, no en localStorage:
// son formas de mirar, no preferencias que valga la pena guardar para siempre.
window.dimensionDesglose = sessionStorage.getItem('dimensionDesglose') || 'departamento';
window.formaDesglose = sessionStorage.getItem('formaDesglose') || 'cuadros';

window.cambiarDimensionDesglose = (dimension) => {
    window.dimensionDesglose = dimension === 'puesto' ? 'puesto' : 'departamento';
    sessionStorage.setItem('dimensionDesglose', window.dimensionDesglose);
    window.pintarDesglose();
};

window.cambiarFormaDesglose = (forma) => {
    window.formaDesglose = forma === 'barras' ? 'barras' : 'cuadros';
    sessionStorage.setItem('formaDesglose', window.formaDesglose);
    window.pintarDesglose();
};

// Pinta el desglose como esté elegido y devuelve el radar a la vista general.
// Es también lo que llaman los botones «Volver», para no salirse del modo.
window.pintarDesglose = () => {
    const cont = document.getElementById('desglose-container');
    const cache = window.encuestasStatsCacheForDrilldown;
    if (!cont || !cache) return;

    const esPuesto = window.dimensionDesglose === 'puesto';
    const forma = window.formaDesglose === 'barras' ? 'barras' : 'cuadros';

    document.querySelectorAll('#conmutador-dimension button').forEach(b => {
        b.setAttribute('aria-pressed', String((b.dataset.dimension === 'puesto') === esPuesto));
    });
    document.querySelectorAll('#conmutador-forma button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.forma === forma));
    });

    const criterio = window.criterioStats();
    document.querySelectorAll('#conmutador-criterio button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.criterio === criterio.clave));
    });

    // Volver al nivel de arriba también devuelve el radar a la vista general:
    // lo que se estuviera mirando ya no está en pantalla.
    window.actualizarRadarDOM();

    // El gráfico dice de entrada qué está midiendo. El conmutador lo marca,
    // pero se desplaza y el elegido puede quedar fuera de la vista; además,
    // dentro de los cuadros pequeños no cabe ningún texto.
    const nodos = window.nodosDeCuadros(esPuesto ? cache.puestoCache : cache.statsCache);
    const encabezado = window.encabezadoDelGrafico(forma, nodos);

    if (forma === 'barras') {
        cont.innerHTML = encabezado +
            (esPuesto
                ? window.renderPuestoDetailed(cache.puestoCache)
                : window.renderDeptDetailed(cache.statsCache));
        return;
    }

    cont.innerHTML = encabezado + '<div id="desglose-treemap" class="stats-treemap"></div>';
    window.dibujarCuadros(nodos, esPuesto ? window.verStatsDetallePuesto : window.verStatsDetalleDepto);
};

// Ancho de un texto por cada píxel de fuente, medido con un lienzo suelto.
// Se mide una sola vez por texto: dibujar los cuadros llama a esto para cada
// palabra de cada nombre.
// Encabezado del gráfico: qué se está midiendo y, debajo, a quién hay que
// mirar. Lo comparten el nivel de arriba y los de dentro.
window.encabezadoDelGrafico = (forma, nodos) => {
    const criterio = window.criterioStats();
    const peor = window.extremoDelCriterio(nodos);

    return '<div class="stats-grafico-titulo">' +
            `<span class="stats-grafico-punto" style="background:${criterio.color};"></span>` +
            criterio.etiqueta +
            (forma === 'barras'
                ? '<span class="stats-grafico-nota">ordena las columnas</span>'
                : `<span class="stats-grafico-nota">${criterio.escalaRelativa ? 'del más rápido al más lento' : 'llena los cuadros'}</span>`) +
        '</div>' +
        (peor
            ? '<div class="stats-grafico-extremo">' +
                  `${criterio.extremo || 'El más bajo'}: ` +
                  `<b>${window.sanitizeForHTML(peor.nombre)}</b> · ${window.sanitizeForHTML(peor.cifra)}` +
              '</div>'
            : '');
};

// Un nivel de dentro del desglose dibujado en cuadros: encabezado con
// «Volver», el nombre de lo que se está mirando y el lienzo. Es lo que ven
// los supervisores de un departamento y los colaboradores de un supervisor o
// de un puesto cuando la forma elegida son cuadros.
window.vistaCuadrosDentro = ({ titulo, subtitulo, volver, nodos, alTocar }) => {
    const cont = document.getElementById('desglose-container');
    if (!cont) return;

    cont.innerHTML =
        window.encabezadoDelGrafico('cuadros', nodos) +
        '<div class="stats-migas">' +
            '<button type="button" id="btn-volver-cuadros">Volver</button>' +
            `<span class="stats-migas-titulo">${window.sanitizeForHTML(titulo)}</span>` +
            (subtitulo ? `<span class="stats-migas-sub">${window.sanitizeForHTML(subtitulo)}</span>` : '') +
        '</div>' +
        '<div id="desglose-treemap" class="stats-treemap"></div>';

    document.getElementById('btn-volver-cuadros').onclick = volver;
    window.dibujarCuadros(nodos, alTocar);
};

// Las filas por colaborador no usan los mismos nombres que las cachés por
// departamento y por puesto, así que se traducen antes de medirlas o dibujarlas.
window.filaCanonica = (emp) => ({
    assignedCount: emp.totalAssigned || 0,
    responses: emp.totalResp || 0,
    reviewed: emp.reviewedCount || 0,
    certificadas: emp.certificadasCount || 0,
    falsas: emp.falsasCount || 0,
    malRevisadas: emp.malRevisadasCount || 0,
    revisadasAltas: emp.revisadasAltasCount || 0,
    sumScore: emp.sumScore || 0,
    countScore: emp.countScore || 0,
    sumDias: emp.sumDias || 0,
    countDias: emp.countDias || 0,
    sumProntitud: emp.sumProntitud || 0,
    countProntitud: emp.countProntitud || 0
});

window.nodosDeColaboradores = (empStats) => {
    const mapa = {};
    empStats.forEach(emp => { mapa[emp.name] = window.filaCanonica(emp); });
    return window.nodosDeCuadros(mapa);
};

// Con qué se ordena cualquier desglose: el criterio elegido, midiendo la fila
// venga de donde venga. Antes cada nivel repetía la misma cadena de ifs, y
// añadir un criterio obligaba a tocar las cinco.
window.valorDeCriterio = (fila) => {
    if (!fila) return 0;
    const d = (fila.totalAssigned !== undefined || fila.totalResp !== undefined)
        ? window.filaCanonica(fila) : fila;
    return window.criterioStats().valor(d) || 0;
};

window.anchoPorPixelDeTexto = (() => {
    const medidor = document.createElement('canvas').getContext('2d');
    const cache = {};
    return (texto) => {
        if (cache[texto] === undefined) {
            medidor.font = '800 10px -apple-system, BlinkMacSystemFont, sans-serif';
            cache[texto] = medidor.measureText(texto).width / 10;
        }
        return cache[texto];
    };
})();

// Convierte un mapa {nombre: fila} en los nodos que dibuja el treemap. La
// fila tiene que traer los nombres canónicos de las cachés
// (`assignedCount`, `responses`, `reviewed`…), que son los que mide cada
// criterio de CRITERIOS_STATS.
window.nodosDeCuadros = (mapa) => {
    const nodos = [];
    Object.keys(mapa).forEach(nombre => {
        const d = mapa[nombre];
        const asignadas = d.assignedCount || 0;
        if (asignadas === 0 && (d.responses || 0) === 0) return;
        nodos.push({
            nombre: nombre,
            datos: d,
            asignadas: asignadas,
            respuestas: d.responses || 0,
            procesadas: window.procesadasDe(d),
            calificacion: d.countScore > 0 ? window.pctTexto(d.sumScore / d.countScore / 100) : null
        });
    });
    return nodos;
};

// Quién repinta al girar el teléfono. Lo deja puesto el último dibujo, así
// que la rotación conserva el nivel en el que se esté y no vuelve al de
// arriba.
window.__redibujarCuadros = null;

window.dibujarCuadrosDesglose = () => {
    const cache = window.encuestasStatsCacheForDrilldown;
    if (!cache) return;
    const esPuesto = window.dimensionDesglose === 'puesto';
    window.dibujarCuadros(
        window.nodosDeCuadros(esPuesto ? cache.puestoCache : cache.statsCache),
        esPuesto ? window.verStatsDetallePuesto : window.verStatsDetalleDepto
    );
};

window.dibujarCuadros = (nodos, alTocar) => {
    window.__redibujarCuadros = () => window.dibujarCuadros(nodos, alTocar);

    const lienzo = document.getElementById('desglose-treemap');
    if (!lienzo) return;

    const ancho = lienzo.clientWidth;
    const alto = lienzo.clientHeight;
    lienzo.innerHTML = '';
    if (ancho <= 0 || alto <= 0) return;

    const criterio = window.criterioStats();

    if (nodos.length === 0) {
        lienzo.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#94a3b8; font-size:0.85rem;">Sin datos para este periodo.</div>';
        return;
    }

    // Puesto de cada nodo según el criterio: 1 es el mejor. Con rellenos tan
    // parecidos, el número es lo único que dice de un vistazo quién va último.
    const ordenados = nodos.slice().sort((a, b) => {
        const va = criterio.valor(a.datos), vb = criterio.valor(b.datos);
        return criterio.peorEsAlto ? va - vb : vb - va;
    });
    const puesto = {};
    ordenados.forEach((n, i) => { puesto[n.nombre] = i + 1; });

    // Prontitud se llena en relativo. En un mes de 31 días, contestar en 6 o en
    // 7 son 81% y 77%: en absoluto los ocho cuadros salían igual de llenos y no
    // se distinguía al ágil del lento. Así, el más rápido del nivel llena el
    // cuadro y el más lento lo deja vacío. Los días de dentro y el puesto
    // siguen siendo los de verdad, que es lo que da la medida absoluta.
    let escala = null;
    if (criterio.escalaRelativa) {
        const valores = ordenados
            .filter(n => criterio.clave !== 'prontitud' || n.datos.countProntitud > 0)
            .map(n => criterio.valor(n.datos));
        if (valores.length > 1) {
            const min = Math.min.apply(null, valores);
            const max = Math.max.apply(null, valores);
            // Si van todos igual no hay nada que estirar: amplificar esa
            // diferencia diría que uno va mal cuando no va peor que nadie.
            if (max - min > 0.02) escala = { min: min, max: max };
        }
    }

    // Un departamento sin encuestas asignadas no puede desaparecer del todo o
    // no habría manera de abrirlo; se le deja un peso mínimo y queda diminuto.
    const mayor = nodos.reduce((m, n) => Math.max(m, n.asignadas), 0);
    const cuadros = window.repartirEnCuadros(nodos.map(n => Math.max(n.asignadas, mayor * 0.02, 0.5)), ancho, alto);

    cuadros.forEach(c => {
        const n = nodos[c.indice];
        // 1px de separación, que es el blanco de la tarjeta asomando.
        const w = Math.max(c.ancho - 1, 1);
        const h = Math.max(c.alto - 1, 1);
        const area = w * h;

        const valorCriterio = criterio.valor(n.datos);
        const pctCriterio = escala
            ? Math.min(100, Math.max((valorCriterio - escala.min) / (escala.max - escala.min) * 100, 0))
            : Math.min(100, Math.max(valorCriterio * 100, 0));

        const el = document.createElement('div');
        el.className = 'stats-cuadro';
        el.style.left = c.x + 'px';
        el.style.top = c.y + 'px';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.dataset.nombre = n.nombre;
        el.title = `${n.nombre}\nAsignadas: ${n.asignadas}\nContestadas: ${n.respuestas}`
            + `\nRevisadas: ${n.procesadas}` + (n.calificacion === null ? '' : `\n⭐ Calificación: ${n.calificacion}%`)
            + `\n${criterio.etiqueta}: ${window.cifraDelCriterio(n.datos)} (puesto ${puesto[n.nombre]} de ${nodos.length})`;
        if (alTocar) el.onclick = () => alTocar(n.nombre);
        else el.style.cursor = 'default';

        // Un cuadro, una banda: la del criterio elegido y nada más. Participación
        // llevaba encima una segunda con lo ya revisado, de cuando no había
        // dónde más verlo; hoy eso es «Avance de revisión» y su propio cuadro,
        // así que aquí sólo estorbaba —dos rellenos midiendo cosas distintas
        // sobre el mismo cuadro no se comparan con los de al lado—.
        //
        // El relleno lleva la proporción sin redondear: con el 99% redondeado
        // a 100 el cuadro se vería lleno sin estarlo.
        const relleno = document.createElement('div');
        relleno.className = 'stats-cuadro-relleno';
        relleno.style.background = criterio.relleno;
        relleno.style.height = pctCriterio + '%';
        el.appendChild(relleno);

        const cuerpo = document.createElement('div');
        cuerpo.className = 'stats-cuadro-cuerpo';

        const tam = Math.max(8, Math.min(20, Math.sqrt(area) / 7));

        // El nombre se parte entre palabras, nunca a media palabra: la fuente
        // se encoge hasta que la palabra más larga cabe de ancho. Sin esto,
        // «MANTENIMIENTO» se leía «MANTENIMIENT / O».
        const palabras = String(n.nombre).split(/\s+/).filter(Boolean);
        const anchoUtil = Math.max(w - 9, 4);
        const anchoPalabra = palabras.reduce((m, p) => Math.max(m, window.anchoPorPixelDeTexto(p)), 0.01);
        const tamTitulo = Math.max(6, Math.min(tam, anchoUtil / anchoPalabra));

        const titulo = document.createElement('div');
        titulo.className = 'stats-cuadro-titulo';
        titulo.style.fontSize = tamTitulo + 'px';
        titulo.innerText = n.nombre;
        cuerpo.appendChild(titulo);

        // Los renglones de abajo sólo caben en los cuadros grandes.
        if (area >= 2600 && h >= 44) {
            const dato = document.createElement('div');
            dato.className = 'stats-cuadro-dato';
            dato.style.fontSize = Math.max(8, tam * 0.62) + 'px';
            dato.innerText = `#${puesto[n.nombre]} · ` + window.cifraDelCriterio(n.datos);
            cuerpo.appendChild(dato);
        }
        el.appendChild(cuerpo);
        lienzo.appendChild(el);
    });
};

// El reparto se calcula en píxeles, así que al girar el teléfono hay que
// rehacerlo. El oyente se pone una sola vez.
if (!window.__cuadrosDesgloseEscucha) {
    window.__cuadrosDesgloseEscucha = true;
    let temporizador = null;
    window.addEventListener('resize', () => {
        if (!document.getElementById('desglose-treemap')) return;
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            if (window.__redibujarCuadros) window.__redibujarCuadros();
        }, 150);
    });
}

window.renderDeptDetailed = (dataMap) => {
    const keys = Object.keys(dataMap).sort((a,b) => {
        const dA = dataMap[a];
        const dB = dataMap[b];
        const assA = dA.assignedCount || 0;
        const assB = dB.assignedCount || 0;

        const valA = window.valorDeCriterio(dA);
        const valB = window.valorDeCriterio(dB);

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

        const pctParticipacion = window.pctTexto(responses, assigned);
        const pctRevision = window.pctTexto(totalProcesadas, assigned);
        const avgScore = d.countScore > 0 ? window.pctTexto(d.sumScore / d.countScore / 100) : 0;
        const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados

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

        const valA = window.valorDeCriterio(dA);
        const valB = window.valorDeCriterio(dB);

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

        const pctParticipacion = window.pctTexto(responses, assigned);
        const pctRevision = window.pctTexto(totalProcesadas, assigned);
        const avgScore = d.countScore > 0 ? window.pctTexto(d.sumScore / d.countScore / 100) : 0;
        const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados

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
        const valA = window.valorDeCriterio(a);
        const valB = window.valorDeCriterio(b);

        if (valB !== valA) return valB - valA;
        
        const partA = assA > 0 ? a.responses / assA : 0;
        const partB = assB > 0 ? b.responses / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });
    
    if (window.formaDesglose !== 'barras') {
        window.vistaCuadrosDentro({
            titulo: deptName,
            subtitulo: `${supList.length} supervisores`,
            volver: () => window.pintarDesglose(),
            nodos: window.nodosDeCuadros(data.supervisors),
            alTocar: (supName) => window.verStatsDetalleSupervisor(deptName, supName)
        });
        return;
    }

    const safeDept = window.sanitizeForHTML(deptName);
    
    let html = `
    <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:10px;">
            <button onclick="window.pintarDesglose();" style="background:#f1f5f9; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; color:#475569; font-weight:bold;">Volver</button>
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
                        
            const pctParticipacion = window.pctTexto(responses, assigned);
            const pctRevision = window.pctTexto(totalProcesadas, assigned);
            const avgScore = sup.countScore > 0 ? window.pctTexto(sup.sumScore / sup.countScore / 100) : 0;
            const colorScore = '#86efac'; // Color verde claro fijo para la barra de resultados

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
    document.getElementById('desglose-container').innerHTML = html;
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
        let sumDias = 0, countDias = 0, sumProntitud = 0, countProntitud = 0;
        empResps.forEach(r => {
        if (r.review_status === 'Revisado' || r.review_status === 'Certificada') {
        sumScore += (r.finalScoreCalculated || 0);
        countScore++;
        }
        // Los tiempos ya vienen sellados en la respuesta desde el cálculo
        // principal, así que aquí sólo se suman.
        if (r.diasAtencion !== null && r.diasAtencion !== undefined) { sumDias += r.diasAtencion; countDias++; }
        if (r.prontitud !== null && r.prontitud !== undefined) { sumProntitud += r.prontitud; countProntitud++; }
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
        sumDias: sumDias,
        countDias: countDias,
        sumProntitud: sumProntitud,
        countProntitud: countProntitud,
        incompleto: (obligatoryCompleted < obligatoryAssigned)
        };
    }).filter(emp => emp.totalAssigned > 0 || emp.totalResp > 0);

    empStats.sort((a,b) => {
        if (a.incompleto !== b.incompleto) return a.incompleto ? 1 : -1;
        
        const assA = a.totalAssigned || 0;
        const assB = b.totalAssigned || 0;
        const valA = window.valorDeCriterio(a);
        const valB = window.valorDeCriterio(b);

        if (valB !== valA) return valB - valA;
        const partA = assA > 0 ? a.totalResp / assA : 0;
        const partB = assB > 0 ? b.totalResp / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });

    if (window.formaDesglose !== 'barras') {
        window.vistaCuadrosDentro({
            titulo: `Grupo de ${supName}`,
            subtitulo: `${empStats.length} evaluados`,
            volver: () => window.verStatsDetalleDepto(deptName),
            nodos: window.nodosDeColaboradores(empStats),
            alTocar: null
        });
        return;
    }

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
            
            const pctParticipacion = window.pctTexto(emp.totalResp, emp.totalAssigned);
            const avgScore = emp.countScore > 0 ? window.pctTexto(emp.sumScore / emp.countScore / 100) : 0;
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
            <div style="color:${revColor}; font-size:0.6rem;">${window.pctTexto(totalProcesadas, emp.totalAssigned)}%</div>
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
    document.getElementById('desglose-container').innerHTML = html;
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
        let sumDias = 0, countDias = 0, sumProntitud = 0, countProntitud = 0;
        empResps.forEach(r => {
        if (r.review_status === 'Revisado' || r.review_status === 'Certificada') {
        sumScore += (r.finalScoreCalculated || 0);
        countScore++;
        }
        // Los tiempos ya vienen sellados en la respuesta desde el cálculo
        // principal, así que aquí sólo se suman.
        if (r.diasAtencion !== null && r.diasAtencion !== undefined) { sumDias += r.diasAtencion; countDias++; }
        if (r.prontitud !== null && r.prontitud !== undefined) { sumProntitud += r.prontitud; countProntitud++; }
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
        sumDias: sumDias,
        countDias: countDias,
        sumProntitud: sumProntitud,
        countProntitud: countProntitud,
        incompleto: (obligatoryCompleted < obligatoryAssigned)
        };
    }).filter(emp => emp.totalAssigned > 0 || emp.totalResp > 0);

    empStats.sort((a,b) => {
        if (a.incompleto !== b.incompleto) return a.incompleto ? 1 : -1;
        
        const assA = a.totalAssigned || 0;
        const assB = b.totalAssigned || 0;
        const valA = window.valorDeCriterio(a);
        const valB = window.valorDeCriterio(b);

        if (valB !== valA) return valB - valA;
        const partA = assA > 0 ? a.totalResp / assA : 0;
        const partB = assB > 0 ? b.totalResp / assB : 0;
        if (partB !== partA) return partB - partA;
        return assB - assA;
    });

    if (window.formaDesglose !== 'barras') {
        window.vistaCuadrosDentro({
            titulo: puestoName,
            subtitulo: `${empStats.length} evaluados`,
            volver: () => window.pintarDesglose(),
            nodos: window.nodosDeColaboradores(empStats),
            alTocar: null
        });
        return;
    }

    const safePuesto = window.sanitizeForHTML(puestoName);

    let html = `
    <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:5px;">
        <div style="display:flex; align-items:center; gap:10px;">
             <button onclick="window.pintarDesglose();" style="background:#f1f5f9; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; color:#475569; font-weight:bold;">Volver</button>
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
            
            const pctParticipacion = window.pctTexto(emp.totalResp, emp.totalAssigned);
            const avgScore = emp.countScore > 0 ? window.pctTexto(emp.sumScore / emp.countScore / 100) : 0;
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
            <div style="color:${revColor}; font-size:0.6rem;">${window.pctTexto(totalProcesadas, emp.totalAssigned)}%</div>
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
    document.getElementById('desglose-container').innerHTML = html;
};

console.log("✅ Evaluaciones Stats v63: BARRA INDEPENDIENTE PARA CERTIFICADAS");
