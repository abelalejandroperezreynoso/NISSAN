// ==========================================
// 4b-evaluaciones-stats.js (V63: BARRA INDEPENDIENTE PARA CERTIFICADAS)
// ==========================================

window.encuestasRawData = null;
window.encuestasStatsCacheForDrilldown = null;
window.statsRadarChart = null;

// `window.sanitizeForHTML` vivía aquí, pero lo usan también las pantallas del
// administrador de `4-evaluaciones-admin.js`, que se carga antes: se mudó a
// `1-config.js`, que es el primero de todos.

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

// Cuántos renglones aguanta el rótulo de una punta del radar antes de
// recortarse. Con el porcentaje debajo son cuatro líneas de 10px.
window.MAX_LINEAS_ROTULO_RADAR = 3;

// El rótulo de una punta del radar, partido en renglones. Antes se partía de
// tres palabras en tres —'de responsabilidades' ya se salía— y el enunciado de
// más de 40 caracteres ni se intentaba: se sustituía entero por «Pregunta 3»,
// que es lo que dejaba media gráfica sin decir qué se estaba midiendo. Se
// reparte por ancho, no por palabras, y sólo se recorta con «…» lo que pase de
// los renglones que caben.
window.rotuloDeEje = (texto, anchoLienzo) => {
    // El presupuesto por renglón va atado al ancho real del lienzo: en un
    // teléfono, dos rótulos de 21 caracteres a los lados dejan al polígono sin
    // sitio donde dibujarse.
    const porLinea = (anchoLienzo && anchoLienzo < 360) ? 15 : 21;
    const maxLineas = window.MAX_LINEAS_ROTULO_RADAR;
    // Una palabra sola puede pasarse un poco del presupuesto sin estorbar a
    // nadie: el presupuesto es para que no se junten dos, y partir
    // 'Responsabilidades' por la mitad se lee peor que dejarla sobresalir.
    const topeDePalabra = Math.round(porLinea * 1.4);

    const palabras = String(texto == null ? '' : texto).trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [''];

    const lineas = [];
    let actual = '';
    palabras.forEach(palabra => {
        let resto = palabra;
        // Una sola palabra más larga que el renglón se parte: contar palabras
        // no impide que un 'responsabilidades' se salga del ancho.
        while (resto.length > topeDePalabra) {
            if (actual) { lineas.push(actual); actual = ''; }
            lineas.push(resto.slice(0, porLinea));
            resto = resto.slice(porLinea);
        }
        if (resto.length > porLinea) {
            // Cabe, pero sólo ella: se lleva su renglón entero.
            if (actual) { lineas.push(actual); actual = ''; }
            lineas.push(resto);
            return;
        }
        if (!resto) return;
        if (!actual) actual = resto;
        else if (actual.length + 1 + resto.length <= porLinea) actual += ' ' + resto;
        else { lineas.push(actual); actual = resto; }
    });
    if (actual) lineas.push(actual);

    if (lineas.length <= maxLineas) return lineas;
    const corte = lineas.slice(0, maxLineas);
    let ultima = corte[maxLineas - 1];
    if (ultima.length > topeDePalabra - 1) ultima = ultima.slice(0, topeDePalabra - 1);
    corte[maxLineas - 1] = ultima.replace(/[\s,;.]+$/, '') + '…';
    return corte;
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
        // El enunciado va entero: quien lo recorta para que quepa en la
        // gráfica es `rotuloDeEje`, al dibujar. `Pregunta N` es sólo para la
        // que no tiene enunciado —una borrada, calificada antes de que la
        // calificación guardara el texto—, y N es su posición en el
        // cuestionario, contando también las que no dibujan eje.
        const label = enunciado || `Pregunta ${n}`;
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

        // La última foto de cada área. Se piden sólo las respuestas que traen
        // una —el filtro por la llave del jsonb— y ordenadas de la más
        // reciente: la primera de cada área es la que se enseña. El tope de 400
        // es para que esto no crezca con el historial; con más áreas que ésas
        // habría que cortar por fecha.
        const p4 = sb.from('evaluation_responses')
            .select('employee_area, submitted_at, answers_json')
            .not(`answers_json->>${window.LLAVE_FOTO_AREA}`, 'is', null)
            .order('submitted_at', { ascending: false })
            .limit(400);

        const [_, resEvals, rawResponses, resPreguntas, resFotos] = await Promise.all([p1, p2, fetchTodasLasRespuestas(), p3, p4]);

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

        // Si la consulta falla —una base sin ese filtro, o sin el bucket
        // todavía— la sección de áreas se dibuja igual, sin foto.
        const fotosPorArea = {};
        if (resFotos && resFotos.error) {
            console.warn('No se pudieron traer las fotos de área:', resFotos.error.message);
        } else {
            (resFotos && resFotos.data ? resFotos.data : []).forEach(r => {
                const clave = window.claveDeArea(r.employee_area);
                if (!clave || fotosPorArea[clave]) return;   // ya vienen ordenadas: la primera es la última
                const url = window.fotoDeArea(r);
                if (url) fotosPorArea[clave] = { url, fecha: r.submitted_at };
            });
        }

        window.encuestasRawData = {
            evalsList,
            rawResponses,
            categories,
            preguntasPorEncuesta,
            fotosPorArea
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

// Cumplir el mínimo **en cada una** de sus encuestas no es lo mismo que
// cumplirlo en el promedio, y ésa es toda la diferencia entre este criterio y
// «Revisadas ≥80%»: quien saca un 100 y un 60 promedia 80 y aun así reprobó
// una. Se mira sobre lo que ya está calificado —las mismas respuestas
// procesadas que cuenta `revisadasAltas`—, porque una encuesta que nadie ha
// revisado todavía no dice nada de quien la contestó, y meterla aquí volvería
// a medir participación en lugar de puntaje. Quien no tiene ni una calificada
// no cumple ni deja de cumplir: queda fuera de la cuenta.
window.cumpleMinimoEnTodas = (fila) => {
    const procesadas = window.procesadasDe(fila);
    return procesadas > 0 && (fila.revisadasAltas || 0) >= procesadas;
};

// Los dos contadores del criterio puestos en una fila que **es** una persona:
// la de un colaborador y la de cada figura del gráfico de personas. En las
// cachés por departamento, supervisor y puesto no se derivan —ahí no se puede,
// porque el grupo suma respuestas y no gente—: los suma el motor persona a
// persona cuando ya están contadas todas las respuestas.
window.conMinimoEnTodas = (fila) => {
    fila.personasEvaluadas = window.procesadasDe(fila) > 0 ? 1 : 0;
    fila.personasAlMinimo = window.cumpleMinimoEnTodas(fila) ? 1 : 0;
    return fila;
};

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
          : 'sin contestar',
      // En una columna no cabe todo de una línea, así que el conteo baja al
      // segundo renglón.
      corto: (d) => (d.responses || 0) > 0
          ? { cifra: `${window.pctTexto(window.procesadasDe(d), d.responses)}%`, detalle: `${window.procesadasDe(d)}/${d.responses}` }
          : { cifra: '—', detalle: 'sin contestar' } },
    { clave: 'revisadas_altas', etiqueta: 'Revisadas ≥80%', nombre: 'revisadas ≥80%', color: '#047857', relleno: '#6ee7b7',
      extremo: 'El que menos revisadas altas tiene',
      valor: (d) => d.assignedCount > 0 ? (d.revisadasAltas || 0) / d.assignedCount : 0 },
    // El mismo 80%, pero persona a persona y en **todas** sus encuestas: aquí
    // no basta con que el promedio llegue. Por eso se mide sobre la gente
    // —cuántos de los que ya tienen algo calificado no bajaron del mínimo en
    // ninguna— y no sobre las encuestas, que es lo que ya dice el criterio de
    // arriba. Quien no tiene ni una calificada dice «sin calificar» y queda
    // fuera del renglón del peor, igual que en avance de revisión.
    { clave: 'minimo_en_todas', etiqueta: '80% Líderes', nombre: 'al mínimo en todas', color: '#0f766e', relleno: '#99f6e4',
      extremo: 'El que menos gente tiene al mínimo',
      valor: (d) => (d.personasEvaluadas || 0) > 0 ? (d.personasAlMinimo || 0) / d.personasEvaluadas : 0,
      texto: (d) => {
          const evaluadas = d.personasEvaluadas || 0;
          if (evaluadas === 0) return 'sin calificar';
          // Un cuadro que es una persona —el último nivel del desglose, y cada
          // figura del gráfico de personas— no puede decir «100% · 1/1
          // personas»: ahí se cumple o no se cumple.
          if (evaluadas === 1) return (d.personasAlMinimo || 0) > 0 ? 'cumple en todas' : 'no cumple en todas';
          return `${window.pctTexto(d.personasAlMinimo || 0, evaluadas)}% · ${d.personasAlMinimo || 0}/${evaluadas} personas`;
      },
      corto: (d) => {
          const evaluadas = d.personasEvaluadas || 0;
          if (evaluadas === 0) return { cifra: '—', detalle: 'sin calificar' };
          if (evaluadas === 1) return { cifra: (d.personasAlMinimo || 0) > 0 ? 'Sí' : 'No', detalle: 'en todas' };
          return { cifra: `${window.pctTexto(d.personasAlMinimo || 0, evaluadas)}%`, detalle: `${d.personasAlMinimo || 0}/${evaluadas}` };
      } },
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
        // Ni nada que reprocharle a quien todavía no tiene una calificada.
        if (criterio.clave === 'minimo_en_todas') return (n.datos.personasEvaluadas || 0) > 0;
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

// La cifra de una columna. Es estrecha —78px en un teléfono—, así que lo que
// no cabe de una línea baja al segundo renglón. En un cuadro hay sitio para
// una sola línea larga y de eso se encarga `cifraDelCriterio`.
// La cifra pelada, para el renglón de dentro de un cuadro: sólo el número.
// Ahí al lado ya está el nombre del departamento y encima el título del
// gráfico dice qué se mide, así que repetir «contestadas» en cada cuadro
// gasta el ancho que necesita el nombre —y en avance de revisión el
// «798/800» de detrás llegaba a partir el renglón en dos—.
//
// «5.0 días» y «sin contestar» no son una palabra de adorno detrás de un
// número sino la medida entera, y se quedan.
window.cifraDesnudaDelCriterio = (fila) => {
    const { cifra, detalle } = window.cifraCortaDelCriterio(fila);
    return cifra === '—' ? detalle : cifra;
};

window.cifraCortaDelCriterio = (fila) => {
    const criterio = window.criterioStats();
    if (criterio.corto) return criterio.corto(fila);
    if (criterio.texto) return { cifra: criterio.texto(fila), detalle: '' };
    return { cifra: `${window.pctTexto(criterio.valor(fila))}%`, detalle: '' };
};

// La escala con la que se llena un nivel. Casi siempre es la absoluta, de 0 a
// 1. Prontitud es la excepción (`escalaRelativa`): en un mes de 31 días,
// contestar en 6 o en 7 son 81% y 77%, y en absoluto todos salían igual de
// llenos. Con la escala del nivel, el más rápido llena y el más lento vacía.
// Si van todos igual —menos de dos puntos entre el mejor y el peor— no se
// estira nada: amplificar ese ruido diría que uno va mal cuando no va peor
// que nadie.
window.escalaDelNivel = (filas) => {
    const criterio = window.criterioStats();
    if (!criterio.escalaRelativa) return null;

    const valores = (filas || [])
        .filter(d => criterio.clave !== 'prontitud' || (d.countProntitud || 0) > 0)
        .map(d => criterio.valor(d));
    if (valores.length < 2) return null;

    const min = Math.min.apply(null, valores);
    const max = Math.max.apply(null, valores);
    return (max - min > 0.02) ? { min: min, max: max } : null;
};

// Cuánto se llena una fila, de 0 a 100. Es geometría, así que va sin
// redondear: el rótulo es quien tiene que decir 99% cuando falta algo.
window.alturaDeCriterio = (fila, escala) => {
    const valor = window.criterioStats().valor(fila) || 0;
    const bruto = escala
        ? (valor - escala.min) / (escala.max - escala.min) * 100
        : valor * 100;
    return Math.min(100, Math.max(bruto, 0));
};

// La columna de un colaborador. Su fila usa otros nombres de campo, así que
// pasa por `filaCanonica`, y su rótulo lleva cuatro renglones —nombre, puesto,
// departamento y área— en lugar de uno. Es el último nivel: no se entra a
// ningún sitio desde aquí, y por eso no es clicable.
window.columnaDeColaborador = (emp, escala) => {
    const fila = window.filaCanonica(emp);
    const safeName = window.sanitizeForHTML(emp.name);
    const safeJob = window.sanitizeForHTML(emp.job);
    const safeDept = window.sanitizeForHTML(emp.dept);
    const safeArea = window.sanitizeForHTML(emp.area);

    return window.columnaDeCriterio({
        fila: fila,
        escala: escala,
        clicable: false,
        // Atenuado y con una línea más en el globo cuando le faltan
        // obligatorias, que es lo que la lista venía señalando.
        opacidad: emp.incompleto ? '0.6' : '',
        titulo: window.globoDeFila(`${safeName}&#10;📍 Área: ${safeArea}&#10;Departamento: ${safeDept}&#10;Puesto: ${safeJob}`, fila)
            + (emp.incompleto ? '&#10;¡Faltan Obligatorias!' : ''),
        rotulo: `<div class="stats-columna-rotulo-persona">
                <div class="stats-columna-persona-nombre">${safeName}</div>
                <div class="stats-columna-persona-puesto" title="${safeJob}">${safeJob}</div>
                <div class="stats-columna-persona-depto" title="${safeDept}">${safeDept}</div>
                <div class="stats-columna-persona-area" title="${safeArea}">📍 ${safeArea}</div>
            </div>`
    });
};

// Una columna del desglose en barras: la cifra del criterio arriba, una sola
// barra —la del criterio, como en los cuadros— y el rótulo debajo. La
// comparten los cinco niveles (departamento, puesto, supervisores y las dos
// listas de colaboradores), que antes repetían cada uno el mismo bloque de
// marcado con dos barras y cinco colores dentro.
window.columnaDeCriterio = ({ fila, escala, atributos, titulo, rotulo, opacidad, clicable = true }) => {
    const criterio = window.criterioStats();
    const { cifra, detalle } = window.cifraCortaDelCriterio(fila);
    const alto = window.alturaDeCriterio(fila, escala);

    const estilo = (clicable ? '' : 'cursor:default;') + (opacidad ? `opacity:${opacidad};` : '');

    return `
        <div ${atributos || ''} title="${titulo}" class="stats-columna"${estilo ? ` style="${estilo}"` : ''}
            onmouseover="this.style.background='#f8fafc'; this.style.transform='translateY(-2px)';"
            onmouseout="this.style.background='transparent'; this.style.transform='none';">
            <div class="stats-columna-cifra" style="color:${criterio.color};">
                ${cifra}
                ${detalle ? `<span class="stats-columna-detalle">${detalle}</span>` : ''}
            </div>
            <div class="stats-columna-barra">
                <div class="stats-columna-relleno" style="height:${alto}%; background:${criterio.color};"></div>
            </div>
            ${rotulo}
        </div>`;
};

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
        const f = e.frequency || 'once';
        if (freqWeight[f] > freqWeight[maxFreq]) maxFreq = f;

        evalMap[e.id] = {
            // La fila entera, para las reglas que necesitan `mode`,
            // `target_employees` y demás campos que este resumen no copia. A
            // quién le toca la encuesta lo decide `leTocaEstaEncuesta` desde
            // aquí, así que el resumen no vuelve a parsear los destinatarios.
            encuesta: e,
            title: e.title,
            category: e.category || "General",
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

    const statsCache = {};
    const puestoCache = {};
    // Una fila por persona, con su ficha y sus mismos contadores. Es lo que
    // convierte cada figura del gráfico de personas en alguien con nombre: el
    // cuadro guarda la lista de ids y el dibujo saca de aquí a quién le toca
    // cada figura, cuánto lleva y qué decir en el globo.
    const porEmpleado = {};
    const getDept = (e) => (e.department || e.departamento || e.dept || "Sin Departamento").trim();
    const getSup = (e) => (e.sup || e.supervisor || e.supervisor_name || "Sin Supervisor").trim();
    const getPuesto = (e) => (e.puesto || e.Puesto || "").trim() || "Sin Puesto";
    const getAreaEmp = (e) => {
        if (e.areas && e.areas.name) return e.areas.name;
        if (e.area && typeof e.area === 'object' && e.area.name) return e.area.name;
        if (e.area && typeof e.area === 'string' && e.area.trim() !== '') return e.area.trim();
        return "Sin Área";
    };

    let totalAsignadasGlobal = 0;
    const radarGroupingUsersAssigned = {};

    window.todosLosEmpleadosData.forEach(e => {
        if (e.isActive === false) return; // <-- NUEVO: Excluir inactivos del universo asignado
        const dept = getDept(e);
        const sup = getSup(e);
        const empId = String(e.id);

        // NUEVO: Agregado contador "certificadas", "malRevisadas" y "revisadasAltas"
        // `personasAsignadas` es la gente de la que habla el gráfico de personas:
        // los que tienen al menos una encuesta de este filtro. No es la
        // plantilla entera (`employeesCount`) a propósito: a quien no le toca
        // ninguna encuesta no le puede tocar ninguna respuesta, así que su
        // figura no podría colorearse nunca y sólo engordaría el gris.
        if (!statsCache[dept]) statsCache[dept] = { employeesCount: 0, personasAsignadas: 0, assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0, malRevisadas: 0, revisadasAltas: 0, personasAlMinimo: 0, personasEvaluadas: 0, sumScore: 0, countScore: 0, empleados: [], supervisors: {} };
        if (!statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup] = { employeesCount: 0, personasAsignadas: 0, assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0, malRevisadas: 0, revisadasAltas: 0, personasAlMinimo: 0, personasEvaluadas: 0, sumScore: 0, countScore: 0, empleados: [] };

        statsCache[dept].employeesCount++;
        statsCache[dept].supervisors[sup].employeesCount++;

        let empAssignments = 0;

        const empPuestoKey = getPuesto(e);
        if (!puestoCache[empPuestoKey]) puestoCache[empPuestoKey] = { employeesCount: 0, personasAsignadas: 0, assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0, malRevisadas: 0, revisadasAltas: 0, personasAlMinimo: 0, personasEvaluadas: 0, sumScore: 0, countScore: 0, empleados: [] };
        puestoCache[empPuestoKey].employeesCount++;

        porEmpleado[empId] = {
            nombre: e.name || e.nombre || 'Sin nombre',
            departamento: dept, supervisor: sup, puesto: empPuestoKey, area: getAreaEmp(e),
            assignedCount: 0, responses: 0, reviewed: 0, certificadas: 0, falsas: 0,
            malRevisadas: 0, revisadasAltas: 0, personasAlMinimo: 0, personasEvaluadas: 0, sumScore: 0, countScore: 0,
            sumDias: 0, countDias: 0, sumProntitud: 0, countProntitud: 0
        };
        
        // Se calcula una vez por persona y no por encuesta: `tieneEquipoDirecto`
        // recorre la plantilla entera.
        const tieneEquipoEste = window.tieneEquipoDirecto(e.id);

        evalsList.forEach(ev => {
             const info = evalMap[ev.id];

             if (window.leTocaEstaEncuesta(ev, e, tieneEquipoEste)) {
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

        porEmpleado[empId].assignedCount = empAssignments;

        // Sólo entra en la lista quien tiene algo asignado: son las figuras
        // que se van a dibujar, y su cuenta es `personasAsignadas`.
        if (empAssignments > 0) {
            statsCache[dept].personasAsignadas++;
            statsCache[dept].supervisors[sup].personasAsignadas++;
            puestoCache[empPuestoKey].personasAsignadas++;
            statsCache[dept].empleados.push(empId);
            statsCache[dept].supervisors[sup].empleados.push(empId);
            puestoCache[empPuestoKey].empleados.push(empId);
        }
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

            if (!window.leTocaEstaEncuesta(info.encuesta, empObj, window.tieneEquipoDirecto(empObj.id))) {
                return; // ⛔ Contestó, pero la encuesta no iba dirigida a esta persona. Se ignora.
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

        // La fila de la persona lleva los mismos contadores que su
        // departamento, y se incrementa al lado de ellos: es la que rellena su
        // propia figura en el gráfico de personas y la que cuenta su globo.
        const suya = porEmpleado[empId];

        if (statsCache[dept]) {
            statsCache[dept].responses++;
            if (statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].responses++;
        }
        
        if (puestoCache[empPuestoKey]) {
            puestoCache[empPuestoKey].responses++;
        }
        if (suya) suya.responses++;

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
        sumarTiempos(suya);
        if (r.diasAtencion !== null) { totalDiasAtencion += r.diasAtencion; countDiasAtencion++; }

        if(!evalPerfMap[title]) evalPerfMap[title] = { sum: 0, countRevisadas: 0, countTotal: 0 };
        evalPerfMap[title].countTotal++;
        
        // Clasificación detallada para las barras
        if (r.review_status === 'Falsa') {
            if (statsCache[dept]) { statsCache[dept].falsas++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].falsas++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].falsas++;
            if (suya) suya.falsas++;
        } else if (r.review_status === 'Certificada') {
            if (statsCache[dept]) { statsCache[dept].certificadas++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].certificadas++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].certificadas++;
            if (suya) suya.certificadas++;
        } else if (r.review_status === 'Revisado') {
            if (statsCache[dept]) { statsCache[dept].reviewed++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].reviewed++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].reviewed++;
            if (suya) suya.reviewed++;
        } else if (r.review_status === 'Mal Revisada') {
            if (statsCache[dept]) { statsCache[dept].malRevisadas++; if(statsCache[dept].supervisors[sup]) statsCache[dept].supervisors[sup].malRevisadas++; }
            if (puestoCache[empPuestoKey]) puestoCache[empPuestoKey].malRevisadas++;
            if (suya) suya.malRevisadas++;
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
            if (suya) suya.revisadasAltas++;
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
        if (suya) { suya.sumScore += finalScore; suya.countScore++; }
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

    // Quién cumple el mínimo en todas sus encuestas es una cuenta de **gente**,
    // no de respuestas, así que se hace aquí, cuando ya están contadas todas:
    // cada persona se resuelve con lo suyo y suma uno en su departamento, en su
    // supervisor y en su puesto. Sumarlo dentro del bucle de respuestas contaría
    // a la misma persona una vez por encuesta.
    Object.values(porEmpleado).forEach(ficha => {
        window.conMinimoEnTodas(ficha);
        if (!ficha.personasEvaluadas) return;

        const dep = statsCache[ficha.departamento];
        [dep, dep && dep.supervisors[ficha.supervisor], puestoCache[ficha.puesto]].forEach(fila => {
            if (!fila) return;
            fila.personasEvaluadas = (fila.personasEvaluadas || 0) + 1;
            fila.personasAlMinimo = (fila.personasAlMinimo || 0) + ficha.personasAlMinimo;
        });
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
        porEmpleado,
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
                    <button data-forma="personas" onclick="window.cambiarFormaDesglose('personas')">Personas</button>
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
            
            // El ancho del lienzo decide cuánto texto cabe por renglón, así
            // que se mide antes de partir los rótulos.
            const anchoRadar = ctx && ctx.parentElement ? ctx.parentElement.clientWidth : 0;
            const formattedLabels = radarLabels.map((label, idx) => {
                const lines = window.rotuloDeEje(label, anchoRadar);
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
                                // El rótulo de la punta puede venir recortado;
                                // aquí es donde se lee el enunciado entero.
                                title: function(items) {
                                    if (!items || items.length === 0) return '';
                                    return radarFullLabels[items[0].dataIndex] || '';
                                },
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
        cache.activeEvalsList.forEach(ev => {
             if (window.leTocaEstaEncuesta(ev, e, window.tieneEquipoDirecto(e.id))) {
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
    const radarFullLabels = [];
    
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
        radarFullLabels.push(...ejes.completos);

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
            radarFullLabels.push(key);
            
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
        
        const anchoRadar = ctx && ctx.parentElement ? ctx.parentElement.clientWidth : 0;
        const formattedLabels = radarLabels.map((label, idx) => {
            const lines = window.rotuloDeEje(label, anchoRadar);
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
                            title: function(items) {
                                if (!items || items.length === 0) return '';
                                return radarFullLabels[items[0].dataIndex] || '';
                            },
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

window.renderAreaStats=(areaMap,fotosPorArea)=>{
const fotos=fotosPorArea||(window.encuestasRawData&&window.encuestasRawData.fotosPorArea)||{};
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
// La última foto que se tomó de esta área, si alguna evaluación la pidió. Es
// lo que convierte una cifra en algo que se puede mirar.
const foto=fotos[window.claveDeArea(k)];
let fotoHtml='';
if(foto&&foto.url){
const fecha=new Date(foto.fecha).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
fotoHtml=`
<div style="position:relative; margin:-15px -15px 12px; border-radius:10px 10px 0 0; overflow:hidden;">
<img src="${window.sanitizeForHTML(foto.url)}" alt="Última fotografía de ${window.sanitizeForHTML(k)}" loading="lazy"
onclick="window.abrirVisorImagen&&window.abrirVisorImagen('${window.sanitizeForHTML(foto.url)}')"
style="width:100%; height:130px; object-fit:cover; display:block; cursor:pointer;" title="Toca para ampliar">
<span style="position:absolute; right:6px; bottom:6px; background:rgba(15,23,42,0.65); color:white; font-size:0.68rem; font-weight:600; padding:2px 7px; border-radius:20px;">${fecha}</span>
</div>`;
}
h+=`
<div class="stats-area" style="border-left-color:${col}; opacity:${d.count>0?'1':'0.6'}; overflow:hidden;">
${fotoHtml}
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

// Las tres formas del desglose. `personas` es el mismo treemap que `cuadros`
// —la misma geometría, el mismo orden y los mismos toques—, pero en vez de
// subir un relleno liso pinta figuras: cada cuadro se llena de gente y las de
// color son la parte que mide el criterio. Un relleno al 62% y otro al 71% se
// ven casi iguales; catorce figuras de veinte contra dieciséis, no.
window.FORMAS_DESGLOSE = ['cuadros', 'personas', 'barras'];

// Nadie lee `window.formaDesglose` a pelo: `sessionStorage` puede traer una
// forma de una versión anterior, y todo lo que no sea de la lista es cuadros.
window.formaDesgloseActual = () =>
    window.FORMAS_DESGLOSE.indexOf(window.formaDesglose) >= 0 ? window.formaDesglose : 'cuadros';

window.cambiarDimensionDesglose = (dimension) => {
    window.dimensionDesglose = dimension === 'puesto' ? 'puesto' : 'departamento';
    sessionStorage.setItem('dimensionDesglose', window.dimensionDesglose);
    window.pintarDesglose();
};

window.cambiarFormaDesglose = (forma) => {
    window.formaDesglose = window.FORMAS_DESGLOSE.indexOf(forma) >= 0 ? forma : 'cuadros';
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
    const forma = window.formaDesgloseActual();

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

    cont.innerHTML = encabezado + window.lienzoDeCuadros();
    window.dibujarCuadros(nodos, esPuesto ? window.verStatsDetallePuesto : window.verStatsDetalleDepto);
};

// El lienzo donde se reparten los cuadros. En personas necesita más alto: una
// figura por debajo de `MIN_ALTO_PERSONA` deja de leerse, así que en un lienzo
// bajo los cuadros pequeños no cabría ninguna y caerían al relleno liso.
window.lienzoDeCuadros = () => '<div id="desglose-treemap" class="stats-treemap'
    + (window.formaDesgloseActual() === 'personas' ? ' stats-treemap--personas' : '')
    + '"></div>';

// Ancho de un texto por cada píxel de fuente, medido con un lienzo suelto.
// Se mide una sola vez por texto: dibujar los cuadros llama a esto para cada
// palabra de cada nombre.
// Encabezado del gráfico: qué se está midiendo y, debajo, a quién hay que
// mirar. Lo comparten el nivel de arriba y los de dentro.
window.encabezadoDelGrafico = (forma, nodos) => {
    const criterio = window.criterioStats();
    const peor = window.extremoDelCriterio(nodos);

    // En personas la nota va antes que la de la escala relativa: ahí cada
    // figura se llena con lo suyo en absoluto, así que «del más rápido al más
    // lento» —que habla de la escala del nivel— no describiría el dibujo.
    const nota = forma === 'barras' ? 'ordena las columnas'
        : forma === 'personas' ? 'una figura es una persona'
        : criterio.escalaRelativa ? 'del más rápido al más lento'
        : 'llena los cuadros';

    return '<div class="stats-grafico-titulo">' +
            `<span class="stats-grafico-punto" style="background:${criterio.color};"></span>` +
            criterio.etiqueta +
            `<span class="stats-grafico-nota">${nota}</span>` +
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
        window.encabezadoDelGrafico(window.formaDesgloseActual(), nodos) +
        '<div class="stats-migas">' +
            '<button type="button" id="btn-volver-cuadros">Volver</button>' +
            `<span class="stats-migas-titulo">${window.sanitizeForHTML(titulo)}</span>` +
            (subtitulo ? `<span class="stats-migas-sub">${window.sanitizeForHTML(subtitulo)}</span>` : '') +
        '</div>' +
        window.lienzoDeCuadros();

    document.getElementById('btn-volver-cuadros').onclick = volver;
    window.dibujarCuadros(nodos, alTocar);
};

// Las filas por colaborador no usan los mismos nombres que las cachés por
// departamento y por puesto, así que se traducen antes de medirlas o dibujarlas.
// La ficha de un colaborador con la forma que espera el gráfico de personas:
// la identidad que va al globo y los contadores con los que se llena su figura.
// Sus campos se llaman de otra manera que en las cachés, y de traducirlos se
// encarga `filaCanonica`, que es por donde pasa.
// Los contadores de «80% Líderes» los pone `conMinimoEnTodas`: una fila de
// colaborador es una persona, así que se resuelve con lo suyo y no hay nada
// que sumar.
window.fichaDeColaborador = (emp) => window.conMinimoEnTodas({
    nombre: emp.name,
    departamento: emp.dept,
    puesto: emp.job,
    area: emp.area,
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

window.filaCanonica = (emp) => window.conMinimoEnTodas({
    // Una fila de colaborador es una persona, así que su cuadro lleva una
    // figura —ella misma— y se llena por partes con lo que haya hecho.
    personasAsignadas: 1,
    gente: [window.fichaDeColaborador(emp)],
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
// Las fichas de la gente de una fila de caché. La fila guarda sólo los ids
// —una lista por departamento, por supervisor y por puesto— y las fichas viven
// una sola vez en `porEmpleado`. Una fila que ya venga con las fichas puestas
// —la de un colaborador, que es una persona— se devuelve tal cual.
window.genteDeLaFila = (d) => {
    if (Array.isArray(d.gente)) return d.gente;
    const fichas = window.encuestasStatsCacheForDrilldown
        && window.encuestasStatsCacheForDrilldown.porEmpleado;
    if (!fichas || !Array.isArray(d.empleados)) return [];
    return d.empleados.map(id => fichas[id]).filter(Boolean);
};

window.nodosDeCuadros = (mapa) => {
    const nodos = [];
    Object.keys(mapa).forEach(nombre => {
        const d = mapa[nombre];
        const asignadas = d.assignedCount || 0;
        if (asignadas === 0 && (d.responses || 0) === 0) return;
        nodos.push({
            nombre: nombre,
            datos: d,
            // Cuánta gente hay detrás de este cuadro y quiénes son. Es lo que
            // cuenta y lo que dibuja el gráfico de personas: una figura por
            // persona, ni una más, y cada una con su nombre y lo suyo.
            personas: d.personasAsignadas || 0,
            gente: window.genteDeLaFila(d),
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

// --- EL GRÁFICO DE PERSONAS ---
// Es el mismo treemap de siempre: el tamaño del cuadro sigue siendo lo
// asignado y el toque sigue llevando al nivel de abajo. Lo que cambia es el
// relleno: en vez de una banda lisa que sube, el cuadro se llena de figuras y
// se pintan de color las que le tocan al criterio. Un 62% y un 71% dan dos
// bandas casi iguales; catorce figuras de veinte contra dieciséis se cuentan
// de un vistazo.

// La proporción de la figura (ancho entre alto) y los dos tamaños entre los
// que se mueve: por debajo del mínimo deja de leerse como una persona y se ve
// como una mota; por encima del máximo, el cuadro de una sola persona sacaría
// un monigote gigante.
window.ASPECTO_PERSONA = 10 / 24;
window.MIN_ALTO_PERSONA = 10;
// El máximo es alto a propósito: en el último nivel cada cuadro es **una**
// persona, así que el tamaño común lo marca el cuadro más pequeño de ese
// nivel y no la cantidad de gente. Con un tope bajo, esos cuadros salían con
// un monigote diminuto perdido en el centro. Donde hay mucha gente el tope no
// llega a tocarse nunca: manda el cuadro más apretado.
window.MAX_ALTO_PERSONA = 72;
window.COLOR_PERSONA_VACIA = '#cbd5e1';

// --- UNA FIGURA ES UNA PERSONA ---
// No es un relleno con forma de gente: **el número de figuras de un cuadro es
// el número de personas que hay detrás de él** —las del departamento, las del
// grupo del supervisor, las del puesto—, y en el último nivel, donde el cuadro
// ES una persona, hay exactamente una. Sin eso, las figuras eran decoración:
// se dibujaban las que cupieran, así que dos cuadros con la misma plantilla
// enseñaban distinta gente según lo grandes que hubieran salido.
//
// Lo que se cuenta es la gente **a la que le toca alguna encuesta del filtro**
// (`personasAsignadas`) y no la plantilla entera: a quien no le toca ninguna
// no le puede tocar ninguna respuesta, así que su figura no podría colorearse
// nunca y sólo engordaría el gris.

// El tamaño sigue siendo **uno solo para todo el lienzo**, y ahora además
// tiene que dar cabida al conteo de cada cuadro: es el mayor tamaño al que
// todos los cuadros meten a su gente entera.
//
// Un cuadro que no la mete ni al tamaño mínimo **queda fuera del acuerdo** y
// cae al relleno liso de siempre: arrastrar a los demás con él dejaría el
// gráfico entero en figuras diminutas por culpa de uno.
window.celdaDeTodosLosCuadros = (cajas) => {
    let celda = window.MAX_ALTO_PERSONA;
    (cajas || []).forEach(c => {
        const cabe = window.celdaQueCabe(c.ancho, c.alto, c.personas);
        if (cabe >= window.MIN_ALTO_PERSONA && cabe < celda) celda = cabe;
    });
    return Math.max(window.MIN_ALTO_PERSONA, Math.min(window.MAX_ALTO_PERSONA, celda));
};

// El mayor tamaño de celda al que `personas` figuras enteras caben en una
// caja. Se prueba renglón a renglón: con `filas` renglones hacen falta
// `ceil(personas / filas)` columnas, y la celda más grande es la menor de las
// dos que consienten el alto y el ancho. El mejor de esos repartos es la
// respuesta; son treinta vueltas como mucho.
window.celdaQueCabe = (ancho, alto, personas) => {
    if (!(personas > 0) || ancho <= 0 || alto <= 0) return 0;

    let mejor = 0;
    const tope = Math.max(1, Math.floor(alto / window.MIN_ALTO_PERSONA));
    for (let filas = 1; filas <= tope; filas++) {
        const columnas = Math.ceil(personas / filas);
        const celda = Math.min(alto / filas, (ancho / columnas) / window.ASPECTO_PERSONA);
        if (celda > mejor) mejor = celda;
    }
    return mejor;
};

window.SVG_PERSONA_ID = 'stats-icono-persona';

// La figura vive una sola vez en el documento y cada cuadro la reusa con
// `<use>`: son cientos de figuras por pantalla y repetir el trazado en todas
// engordaría el marcado sin ganar nada. Va colgada de `<body>` y no del
// contenedor del desglose, que se reescribe entero con `innerHTML` a cada
// repintado y se la llevaría por delante.
window.montarIconoPersona = () => {
    if (document.getElementById('stats-sprite-persona')) return;
    const caja = document.createElement('div');
    caja.id = 'stats-sprite-persona';
    caja.setAttribute('aria-hidden', 'true');
    caja.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden;';
    // La figura se arma con primitivas —cabeza, tronco con brazos y dos
    // piernas— en lugar de un trazado suelto: se lee igual y se puede
    // retocar sin recalcular ninguna curva. Ninguna lleva `fill`, así que
    // heredan el color que le ponga cada `<use>`.
    caja.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">' +
            '<symbol id="' + window.SVG_PERSONA_ID + '" viewBox="0 0 10 24">' +
                '<circle cx="5" cy="2.9" r="2.7"/>' +
                '<rect x="1.3" y="6.4" width="7.4" height="9.2" rx="3.1"/>' +
                '<rect x="2.85" y="13.4" width="1.9" height="10.6" rx="0.95"/>' +
                '<rect x="5.25" y="13.4" width="1.9" height="10.6" rx="0.95"/>' +
            '</symbol>' +
        '</svg>';
    document.body.appendChild(caja);
};

// Cómo se colocan las `personas` de un cuadro con la celda que ya trae
// decidida el lienzo. Aquí no se elige el tamaño ni la cantidad: las figuras
// son las que son, y lo único que se reparte es en cuántos renglones caben.
//
// Devuelve null cuando no caben todas. Ese cuadro se pinta con el relleno liso
// de siempre: enseñar veinte figuras donde hay treinta personas sería mentir,
// y es justo lo que este gráfico vino a arreglar.
window.rejillaDePersonas = (ancho, alto, altoCelda, personas) => {
    if (!(personas > 0)) return null;

    // Los tres `floor` van con una pizca de holgura, y hace falta: el tamaño
    // común es **exactamente** el que consiente el cuadro más apretado, así que
    // ahí la división da 2.0000 y la coma flotante la deja en 1.9999999. Sin la
    // holgura, el único cuadro que se quedaba sin figuras era justamente el que
    // había fijado el tamaño de todos los demás.
    const anchoCelda = altoCelda * window.ASPECTO_PERSONA;
    const topeColumnas = Math.floor(ancho / anchoCelda + 1e-6);
    const topeFilas = Math.floor(alto / altoCelda + 1e-6);
    if (topeColumnas < 1 || topeFilas < 1 || topeColumnas * topeFilas < personas) return null;

    // **La figura no se estira, pero el hueco entre figuras sí.** El tamaño es
    // el mismo en todo el gráfico —eso es lo que se compara—, y con él fijo lo
    // único que queda por decidir es en cuántos renglones se reparte la gente.
    // Amontonarla contra el suelo dejaba medio cuadro en blanco: el tamaño
    // único lo manda el cuadro más apretado de todos, así que a los demás les
    // sobra sitio por definición. El hueco no mide nada, así que puede crecer.
    //
    // Se elige el reparto **menos desproporcionado**: el que deja los huecos
    // igual de anchos que de altos. Con 64 personas en una caja de 205×116,
    // tres renglones dejan el doble de aire por arriba que por los lados y
    // cuatro lo dejan parejo; los dos llenan la caja igual de bien, pero uno
    // se lee como una rejilla y el otro como tres tiras sueltas.
    let mejor = null;
    for (let filas = 1; filas <= topeFilas; filas++) {
        const columnas = Math.ceil(personas / filas);
        if (columnas > topeColumnas) continue;

        const pasoX = ancho / columnas;
        const pasoY = alto / filas;
        const holguraX = pasoX / anchoCelda;
        const holguraY = pasoY / altoCelda;
        const desproporcion = Math.max(holguraX, holguraY) / Math.min(holguraX, holguraY);
        // A igualdad de proporción, el reparto que desperdicia menos sitios.
        const sobran = filas * columnas - personas;

        if (mejor && (desproporcion > mejor.desproporcion + 1e-9 ||
            (desproporcion > mejor.desproporcion - 1e-9 && sobran >= mejor.sobran))) continue;

        mejor = {
            filas: filas, columnas: columnas, total: personas,
            pasoX: pasoX, pasoY: pasoY, altoCelda: altoCelda, anchoCelda: anchoCelda,
            desproporcion: desproporcion, sobran: sobran
        };
    }

    return mejor;
};

// El lienzo de figuras de un cuadro. Se pintan de abajo arriba, que es como
// subía el relleno: lo que queda en gris es exactamente lo que falta.
// Cuánto se ve de una figura a medio llenar cuando la medida no da ni para
// eso: por debajo, esa persona no se distingue de las que no han hecho nada.
window.MINIMO_VISIBLE_PERSONA = 0.12;

window.__nRecortePersona = 0;

// Lo que cada figura lleva llena, de 0 a 1: **lo suyo**, no un trozo del
// promedio del grupo. Es lo que hace que el globo pueda decir un nombre y un
// porcentaje sin contradecir al dibujo: la figura de Luis está llena hasta
// donde llega Luis.
//
// Aquí el criterio se mide siempre en absoluto, también prontitud, que en los
// cuadros y en las barras se estira con la escala del nivel (`escalaRelativa`).
// Esa escala existe para separar promedios de departamento que se parecen
// demasiado; entre personas no hace falta —varían de sobra— y encima
// aplastaría a media plantilla contra el 0 o el 100 según con quién le tocara
// compartir cuadro.
window.llenadoDeLaPersona = (ficha) => {
    const valor = window.criterioStats().valor(ficha);
    return Math.max(0, Math.min(1, valor || 0));
};

// Lo que dice el globo de una figura: quién es, de dónde y cómo va.
window.globoDePersona = (ficha) => {
    const criterio = window.criterioStats();
    const calificacion = ficha.countScore > 0
        ? window.pctTexto(ficha.sumScore / ficha.countScore / 100) : null;

    return [
        ficha.nombre || 'Sin nombre',
        ficha.puesto ? 'Puesto: ' + ficha.puesto : '',
        ficha.departamento ? 'Departamento: ' + ficha.departamento : '',
        ficha.area ? '📍 Área: ' + ficha.area : '',
        criterio.etiqueta + ': ' + window.cifraDelCriterio(ficha),
        'Asignadas: ' + (ficha.assignedCount || 0) + ' · Contestadas: ' + (ficha.responses || 0),
        calificacion === null ? '' : '⭐ Calificación: ' + calificacion + '%'
    ].filter(Boolean).join('\n');
};

// El lienzo de figuras de un cuadro: una por persona, cada una llena hasta
// donde llegue esa persona y con su globo.
//
// Van ordenadas de más llena a menos y se colocan de abajo arriba, así que el
// cuadro se sigue leyendo como se leía el relleno liso —lo de arriba es lo que
// falta—, sólo que ahora se puede señalar quién es cada cual.
window.lienzoDeGente = (rejilla, ancho, alto, gente, color) => {
    window.montarIconoPersona();

    const ordenada = (gente || []).slice()
        .sort((a, b) => window.llenadoDeLaPersona(b) - window.llenadoDeLaPersona(a));

    // La rejilla ocupa la caja entera; cada figura va centrada en su hueco.
    const altoFigura = rejilla.altoCelda * 0.86;
    const anchoFigura = altoFigura * window.ASPECTO_PERSONA;

    const figura = (x, y, relleno, globo) => '<use href="#' + window.SVG_PERSONA_ID + '"'
        + ' x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"'
        + ' width="' + anchoFigura.toFixed(1) + '" height="' + altoFigura.toFixed(1) + '"'
        + ' fill="' + relleno + '">'
        + (globo ? '<title>' + window.sanitizeForHTML(globo) + '</title>' : '')
        + '</use>';

    let figuras = '';
    let recortes = '';

    for (let i = 0; i < rejilla.total; i++) {
        // Se llena de abajo arriba y de izquierda a derecha, que es como subía
        // el relleno liso. El renglón de arriba es el que puede quedar a
        // medias de figuras.
        const fila = Math.floor(i / rejilla.columnas);
        const columna = i % rejilla.columnas;
        const x = columna * rejilla.pasoX + (rejilla.pasoX - anchoFigura) / 2;
        const y = alto - (fila + 1) * rejilla.pasoY + (rejilla.pasoY - altoFigura) / 2;

        const ficha = ordenada[i];
        const globo = ficha ? window.globoDePersona(ficha) : '';
        let llena = ficha ? window.llenadoDeLaPersona(ficha) : 0;
        if (llena > 0) llena = Math.max(llena, window.MINIMO_VISIBLE_PERSONA);
        if (llena < 1) llena = Math.min(llena, 1 - window.MINIMO_VISIBLE_PERSONA);

        if (llena >= 1) {
            figuras += figura(x, y, color, globo);
        } else if (llena > 0) {
            // La persona a medias: la figura gris entera y encima la de color
            // recortada por abajo, que es como se llena un vaso.
            //
            // El recorte va sobre un `<g>` que envuelve al `<use>`, y no como
            // degradado sobre el propio `<use>`: un `<symbol>` con `viewBox`
            // abre su propio sistema de coordenadas, así que dentro de él
            // `userSpaceOnUse` se resuelve contra la caja del icono
            // (0 0 10 24) y no contra la del lienzo. El degradado caía entero
            // fuera de esa caja y la figura salía toda del color de la última
            // parada: gris, siempre, pasara lo que pasara con la medida. El
            // `<g>` sí vive en las coordenadas del lienzo.
            const alturaLlena = altoFigura * llena;
            const id = 'persona-parcial-' + (++window.__nRecortePersona);
            recortes += '<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse">'
                + '<rect x="' + x.toFixed(1) + '" y="' + (y + altoFigura - alturaLlena).toFixed(1) + '"'
                + ' width="' + anchoFigura.toFixed(1) + '" height="' + alturaLlena.toFixed(1) + '"/>'
                + '</clipPath>';
            figuras += figura(x, y, window.COLOR_PERSONA_VACIA, globo)
                + '<g clip-path="url(#' + id + ')">' + figura(x, y, color, globo) + '</g>';
        } else {
            figuras += figura(x, y, window.COLOR_PERSONA_VACIA, globo);
        }
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'stats-cuadro-gente');
    svg.setAttribute('viewBox', '0 0 ' + ancho + ' ' + alto);
    // El lienzo mide exactamente lo que el cuadro, así que la caja de vista va
    // 1:1 y `none` sólo evita que un redondeo de medio píxel escale las
    // figuras.
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = (recortes ? '<defs>' + recortes + '</defs>' : '') + figuras;
    return { svg: svg, total: rejilla.total };
};

// De qué tamaño va el rótulo de un cuadro y si le cabe el renglón de la cifra.
// Vive aparte porque lo necesitan dos: el dibujo, para escribirlo, y la
// búsqueda de la altura del lienzo, para estimar cuánto sitio se lleva antes
// de que exista ningún cuadro.
window.medidasDelRotulo = (w, h, nombre, enPersonas) => {
    const area = w * h;

    // En personas el título va mucho más pequeño y de un solo renglón: cada
    // píxel que se lleva la chapa es una fila de figuras menos, y en esta
    // forma lo que hay que leer es la gente. En cuadros el nombre es lo único
    // que hay dentro y se queda como estaba.
    const tam = enPersonas
        ? Math.max(8, Math.min(11, Math.sqrt(area) / 11))
        : Math.max(8, Math.min(20, Math.sqrt(area) / 7));

    // El nombre se parte entre palabras, nunca a media palabra: la fuente se
    // encoge hasta que la palabra más larga cabe de ancho. Sin esto,
    // «MANTENIMIENTO» se leía «MANTENIMIENT / O». En personas no hace falta:
    // el título va en un renglón y lo que no cabe lo recorta el navegador con
    // puntos suspensivos. El entero sigue en el globo.
    const palabras = String(nombre == null ? '' : nombre).split(/\s+/).filter(Boolean);
    const anchoUtil = Math.max(w - 9, 4);
    const anchoPalabra = palabras.reduce((m, p) => Math.max(m, window.anchoPorPixelDeTexto(p)), 0.01);

    return {
        tam: tam,
        tamTitulo: enPersonas ? tam : Math.max(6, Math.min(tam, anchoUtil / anchoPalabra)),
        // El renglón de abajo sólo cabe en los cuadros grandes. En personas se
        // piden además 70px de ancho: por debajo de eso la cifra se queda en
        // tres letras y unos puntos suspensivos, y ese renglón vale menos que
        // la fila de figuras que se está comiendo.
        hayDato: area >= 2600 && h >= 44 && (!enPersonas || w >= 70),
        tamDato: enPersonas ? Math.max(7, tam * 0.8) : Math.max(8, tam * 0.62)
    };
};

// --- LA ALTURA DEL LIENZO EN PERSONAS NO ES FIJA ---
// Las otras dos formas viven con la altura que les da la hoja de estilos. En
// personas no conviene: el reparto en cuadros depende de la proporción del
// lienzo, y una altura que no le sienta bien produce cuadros largos y
// estrechos donde la gente no cabe en filas enteras. Con un lienzo más bajo,
// el mismo reparto sale con otras proporciones y las figuras entran más
// grandes —o entran, a secas, en un cuadro que si no se quedaba con el relleno
// liso—.
//
// Sólo puede **encoger** desde el alto de la hoja de estilos, nunca crecer: ese
// alto es el techo que la pantalla puede dedicarle.
window.MINIMO_ALTO_LIENZO_PERSONAS = 190;
window.PASO_ALTO_LIENZO = 8;

// El rótulo aquí se **estima** —el de verdad se mide, en la segunda pasada del
// dibujo—: para elegir la altura hay que valorar decenas de repartos que
// todavía no existen en el documento, y medir cada uno costaría un recálculo
// de maqueta por cada uno. Como en personas el título y la cifra van a un solo
// renglón cada uno, la cuenta se queda muy cerca; y aunque se pase, lo único
// que hay en juego es cuál de dos alturas parecidas se elige.
window.altoRotuloEstimado = (w, h, nombre) => {
    const m = window.medidasDelRotulo(w, h, nombre, true);
    return m.tamTitulo * 1.2 + (m.hayDato ? m.tamDato * 1.25 : 0) + 7;
};

// Cómo de bien sale el reparto a una altura dada: cuántos cuadros se quedarían
// sin poder enseñar a su gente y de qué tamaño saldrían las figuras.
window.balanceDeReparto = (nodos, pesos, ancho, alto) => {
    const cuadros = window.repartirEnCuadros(pesos, ancho, alto);
    let sinFiguras = 0;
    let celda = window.MAX_ALTO_PERSONA;

    cuadros.forEach(c => {
        const n = nodos[c.indice];
        const w = Math.max(c.ancho - 1, 1);
        const h = Math.max(c.alto - 1, 1);
        const region = h - window.altoRotuloEstimado(w, h, n.nombre);
        const cabe = window.celdaQueCabe(w, region, n.personas || 0);

        if (!(n.personas > 0)) return;
        if (cabe < window.MIN_ALTO_PERSONA) { sinFiguras++; return; }
        if (cabe < celda) celda = cabe;
    });

    return { sinFiguras: sinFiguras, celda: Math.min(celda, window.MAX_ALTO_PERSONA) };
};

// La mejor altura, probando de la más alta a la más baja. Manda que nadie se
// quede sin figuras; después, que las figuras salgan lo más grandes posible.
// Como se recorre de arriba abajo y sólo se cambia de campeón ante una mejora
// clara, en un empate gana la altura mayor: encoger sin ganar nada sería
// quitarle sitio al gráfico por gusto.
window.alturaDeLienzoPersonas = (nodos, pesos, ancho, altoTecho) => {
    const suelo = Math.max(window.MINIMO_ALTO_LIENZO_PERSONAS, Math.round(altoTecho * 0.55));
    if (ancho <= 0 || altoTecho <= suelo) return altoTecho;

    let mejor = null;
    for (let alto = altoTecho; alto >= suelo; alto -= window.PASO_ALTO_LIENZO) {
        const b = window.balanceDeReparto(nodos, pesos, ancho, alto);
        const gana = !mejor
            || b.sinFiguras < mejor.sinFiguras
            || (b.sinFiguras === mejor.sinFiguras && b.celda > mejor.celda * 1.02);
        if (gana) mejor = { alto: alto, sinFiguras: b.sinFiguras, celda: b.celda };
    }
    return mejor ? mejor.alto : altoTecho;
};

window.dibujarCuadros = (nodos, alTocar) => {
    window.__redibujarCuadros = () => window.dibujarCuadros(nodos, alTocar);

    const lienzo = document.getElementById('desglose-treemap');
    if (!lienzo) return;

    // Se le quita el alto que pudiera haberle puesto un dibujo anterior antes
    // de medirlo: si no, cada repintado —girar el teléfono, cambiar de
    // criterio— encogería un poco más sobre lo ya encogido hasta dejar el
    // gráfico en nada.
    lienzo.style.height = '';
    const ancho = lienzo.clientWidth;
    let alto = lienzo.clientHeight;
    lienzo.innerHTML = '';
    if (ancho <= 0 || alto <= 0) return;

    const criterio = window.criterioStats();
    const enPersonas = window.formaDesgloseActual() === 'personas';

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

    // Prontitud se llena en relativo; los días de dentro y el puesto siguen
    // siendo los absolutos, que es lo que da la medida de verdad. La misma
    // escala rige las barras.
    const escala = window.escalaDelNivel(ordenados.map(n => n.datos));

    // Qué mide el tamaño del cuadro. En cuadros, lo asignado, como siempre.
    // **En personas, la gente**, que es lo único coherente con lo que se
    // dibuja dentro: si el cuadro midiera lo asignado, un departamento con
    // muchas encuestas por cabeza saldría enorme y medio vacío, y el de al
    // lado saldría pequeño y a reventar. Midiendo la gente, todos los cuadros
    // salen igual de llenos y las figuras caben a un tamaño mayor.
    //
    // No es la misma repartición que en cuadros, y eso se ve al cambiar de
    // forma: son dos gráficos que miden dos cosas. Lo asignado sigue en el
    // globo.
    const peso = (n) => enPersonas ? (n.personas || 0) : n.asignadas;

    // Un departamento sin encuestas asignadas no puede desaparecer del todo o
    // no habría manera de abrirlo; se le deja un peso mínimo y queda diminuto.
    const mayor = nodos.reduce((m, n) => Math.max(m, peso(n)), 0);
    const pesos = nodos.map(n => Math.max(peso(n), mayor * 0.02, 0.5));

    // En personas el alto de la hoja de estilos es un techo, no una medida: si
    // un lienzo más bajo reparte mejor a la gente, se encoge hasta ahí.
    if (enPersonas) {
        const mejorAlto = window.alturaDeLienzoPersonas(nodos, pesos, ancho, alto);
        if (mejorAlto < alto) {
            lienzo.style.height = mejorAlto + 'px';
            alto = mejorAlto;
        }
    }

    const cuadros = window.repartirEnCuadros(pesos, ancho, alto);

    // En personas el dibujo va en dos pasadas. La primera monta los cuadros
    // con su rótulo; la segunda mide lo que ese rótulo acabó ocupando y
    // reparte la gente en el hueco que queda debajo. Estimar el alto del
    // rótulo no vale: la cifra («#2 · 93% contestadas») cabe de un renglón en
    // un cuadro ancho y de tres en uno estrecho, y por catorce píxeles de más
    // la primera fila de figuras se queda escondida detrás.
    //
    // Todas las escrituras van en la primera pasada y todas las lecturas en la
    // segunda, así que el navegador recalcula la maqueta una sola vez y no una
    // por cuadro.
    const pendientes = [];

    cuadros.forEach(c => {
        const n = nodos[c.indice];
        // 1px de separación, que es el blanco de la tarjeta asomando.
        const w = Math.max(c.ancho - 1, 1);
        const h = Math.max(c.alto - 1, 1);
        const area = w * h;

        const pctCriterio = window.alturaDeCriterio(n.datos, escala);

        const el = document.createElement('div');
        el.className = 'stats-cuadro' + (enPersonas ? ' stats-cuadro--personas' : '');
        el.style.left = c.x + 'px';
        el.style.top = c.y + 'px';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.dataset.nombre = n.nombre;
        if (alTocar) el.onclick = () => alTocar(n.nombre);
        else el.style.cursor = 'default';

        // --- El rótulo, que es quien decide cuánto sitio le queda a la gente ---
        const { tamTitulo, tamDato, hayDato } = window.medidasDelRotulo(w, h, n.nombre, enPersonas);

        el.title = `${n.nombre}\nAsignadas: ${n.asignadas}\nContestadas: ${n.respuestas}`
            + `\nRevisadas: ${n.procesadas}` + (n.calificacion === null ? '' : `\n⭐ Calificación: ${n.calificacion}%`)
            + `\n${criterio.etiqueta}: ${window.cifraDelCriterio(n.datos)} (puesto ${puesto[n.nombre]} de ${nodos.length})`;

        // Un cuadro, una medida: la del criterio elegido y nada más.
        // Participación llevaba encima una segunda banda con lo ya revisado,
        // de cuando no había dónde más verlo; hoy eso es «Avance de revisión»
        // y su propio cuadro, así que aquí sólo estorbaba —dos rellenos
        // midiendo cosas distintas sobre el mismo cuadro no se comparan con
        // los de al lado—.
        //
        // La proporción va sin redondear: con el 99% redondeado a 100 el
        // cuadro se vería lleno sin estarlo. Las figuras sí se cuentan
        // enteras, y ahí `lienzoDeGente` reserva los dos extremos para lo
        // exacto.
        if (!enPersonas) {
            const relleno = document.createElement('div');
            relleno.className = 'stats-cuadro-relleno';
            relleno.style.background = criterio.relleno;
            relleno.style.height = pctCriterio + '%';
            el.appendChild(relleno);
        }

        const cuerpo = document.createElement('div');
        cuerpo.className = 'stats-cuadro-cuerpo' + (enPersonas ? ' stats-cuadro-cuerpo--personas' : '');

        const titulo = document.createElement('div');
        titulo.className = 'stats-cuadro-titulo';
        titulo.style.fontSize = tamTitulo + 'px';
        titulo.innerText = n.nombre;

        // En personas el rótulo no puede ir centrado sobre las figuras: se
        // sube a una chapa translúcida pegada al techo del cuadro, que es
        // justo el hueco que dejó libre `altoRotulo`.
        const chapa = enPersonas ? document.createElement('div') : null;
        if (chapa) chapa.className = 'stats-cuadro-chapa';
        const destino = chapa || cuerpo;
        destino.appendChild(titulo);

        if (hayDato) {
            const dato = document.createElement('div');
            dato.className = 'stats-cuadro-dato';
            dato.style.fontSize = tamDato + 'px';
            dato.innerText = `#${puesto[n.nombre]} · ` + window.cifraDesnudaDelCriterio(n.datos);
            destino.appendChild(dato);
        }
        if (chapa) {
            cuerpo.appendChild(chapa);
            pendientes.push({ el: el, chapa: chapa, cuerpo: cuerpo, w: w, h: h,
                pct: pctCriterio, personas: n.personas || 0, gente: n.gente || [] });
        }

        el.appendChild(cuerpo);
        lienzo.appendChild(el);
    });

    // Segunda pasada. Primero se miden **todas** las chapas y sólo después se
    // dibuja: el tamaño de la figura es uno solo para el lienzo entero y sale
    // de la caja más apretada de todas, así que no se puede saber hasta tener
    // medida la última. Con las lecturas juntas y por delante de las
    // escrituras, el navegador recalcula la maqueta una vez y no una por
    // cuadro.
    pendientes.forEach(pd => { pd.alto = pd.h - pd.chapa.offsetHeight; });
    const altoCelda = window.celdaDeTodosLosCuadros(
        pendientes.map(pd => ({ ancho: pd.w, alto: pd.alto, personas: pd.personas })));

    pendientes.forEach(pd => {
        const rejilla = window.rejillaDePersonas(pd.w, pd.alto, altoCelda, pd.personas);
        if (rejilla) {
            const gente = window.lienzoDeGente(rejilla, pd.w, pd.h, pd.gente, criterio.color);
            pd.el.title += `\n👥 ${gente.total} ${gente.total === 1 ? 'persona' : 'personas'}`
                + ' (pasa el cursor por una para ver quién es)';
            pd.el.insertBefore(gente.svg, pd.cuerpo);
        } else {
            // Su gente no cabe entera ni al tamaño mínimo. Enseñar veinte
            // figuras donde hay treinta personas sería mentir, así que ese
            // cuadro se queda con el relleno liso.
            const relleno = document.createElement('div');
            relleno.className = 'stats-cuadro-relleno';
            relleno.style.background = criterio.relleno;
            relleno.style.height = pd.pct + '%';
            pd.el.insertBefore(relleno, pd.cuerpo);
        }
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

// El globo de una fila, el mismo en barras y en cuadros: el detalle completo
// y, al final, lo que mide el criterio elegido. El encabezado va aparte
// porque las filas de colaborador cuelgan de él su área, departamento y
// puesto.
window.globoDeFila = (encabezado, fila) => {
    const criterio = window.criterioStats();
    const calificacion = fila.countScore > 0 ? window.pctTexto(fila.sumScore / fila.countScore / 100) : null;

    return `${encabezado}`
        + `&#10;Asignadas: ${fila.assignedCount || 0}`
        + `&#10;Contestadas: ${fila.responses || 0}`
        + `&#10;Revisadas: ${window.procesadasDe(fila)}`
        + `&#10;Certificadas: ${fila.certificadas || 0}`
        + `&#10;Falsas/Anuladas: ${fila.falsas || 0}`
        + `&#10;Mal Revisadas: ${fila.malRevisadas || 0}`
        + (calificacion === null ? '' : `&#10;⭐ Calificación: ${calificacion}%`)
        + `&#10;${criterio.etiqueta}: ${window.cifraDelCriterio(fila)}`;
};

// El gráfico de barras de un mapa {nombre: fila}. Departamento y puesto sólo
// se diferencian en a dónde lleva el toque, así que comparten esto entero.
window.renderCacheDetailed = (dataMap, funcionAlTocar) => {
    const keys = Object.keys(dataMap)
        .filter(k => (dataMap[k].assignedCount || 0) > 0 || (dataMap[k].responses || 0) > 0)
        .sort((a, b) => {
            const dA = dataMap[a], dB = dataMap[b];
            const valA = window.valorDeCriterio(dA), valB = window.valorDeCriterio(dB);
            if (valB !== valA) return valB - valA;
            // Rompe empates con la participación base y, si sigue el empate,
            // con el tamaño.
            const assA = dA.assignedCount || 0, assB = dB.assignedCount || 0;
            const partA = assA > 0 ? dA.responses / assA : 0;
            const partB = assB > 0 ? dB.responses / assB : 0;
            if (partB !== partA) return partB - partA;
            return assB - assA;
        });

    if (keys.length === 0) return '<div style="padding:10px; font-size:0.8rem; color:#94a3b8;">Sin datos.</div>';

    const escala = window.escalaDelNivel(keys.map(k => dataMap[k]));

    const columnas = keys.map(k => {
        const safeK = window.sanitizeForHTML(k);
        return window.columnaDeCriterio({
            fila: dataMap[k],
            escala: escala,
            atributos: `onclick="${funcionAlTocar}(this.dataset.name)" data-name="${safeK}"`,
            titulo: window.globoDeFila(safeK, dataMap[k]),
            rotulo: `<div class="stats-columna-rotulo">${safeK}</div>`
        });
    }).join('');

    return `<div style="display:flex; flex-direction:column; width:100%;">
        <div class="stats-barras hide-scrollbar">${columnas}</div>
    </div>`;
};

window.renderDeptDetailed = (dataMap) => window.renderCacheDetailed(dataMap, 'verStatsDetalleDepto');
window.renderPuestoDetailed = (dataMap) => window.renderCacheDetailed(dataMap, 'verStatsDetallePuesto');

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
    <div class="stats-barras hide-scrollbar">`;
    
    if (supList.length === 0) {
        html += `<div style="padding:15px; text-align:center; color:#94a3b8; font-style:italic; width:100%;">No se encontraron supervisores.</div>`;
    } else {
        const visibles = supList.filter(sup => (sup.assignedCount || 0) > 0 || (sup.responses || 0) > 0);
        const escala = window.escalaDelNivel(visibles);

        visibles.forEach(sup => {
            const safeSup = window.sanitizeForHTML(sup.name);
            html += window.columnaDeCriterio({
                fila: sup,
                escala: escala,
                atributos: `onclick="verStatsDetalleSupervisor(this.dataset.dept, this.dataset.sup)" data-dept="${safeDept}" data-sup="${safeSup}"`,
                titulo: window.globoDeFila(`Grupo de ${safeSup}`, sup),
                rotulo: `<div class="stats-columna-rotulo">Grupo de ${safeSup}</div>`
            });
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
        let totalAssigned = 0;
        let obligatoryAssigned = 0;
        let obligatoryCompleted = 0;
        const tieneEquipoEsteEmp = window.tieneEquipoDirecto(emp.id);

        activeEvals.forEach(ev => {
            const isObligatory = (ev.is_obligatory !== false);

            if (window.leTocaEstaEncuesta(ev, emp, tieneEquipoEsteEmp)) {
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
    <div class="stats-barras hide-scrollbar">`;

    if (empStats.length === 0) {
        html += `<div style="padding:15px; text-align:center; color:#94a3b8; font-style:italic; width:100%;">No se encontraron subordinados activos en esta categoría.</div>`;
    } else {
        const escala = window.escalaDelNivel(empStats.map(emp => window.filaCanonica(emp)));
        empStats.forEach(emp => { html += window.columnaDeColaborador(emp, escala); });
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
        let totalAssigned = 0;
        let obligatoryAssigned = 0;
        let obligatoryCompleted = 0;
        const tieneEquipoEsteEmp = window.tieneEquipoDirecto(emp.id);

        activeEvals.forEach(ev => {
            const isObligatory = (ev.is_obligatory !== false);

            if (window.leTocaEstaEncuesta(ev, emp, tieneEquipoEsteEmp)) {
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
    <div class="stats-barras hide-scrollbar">`;

    if (empStats.length === 0) {
        html += `<div style="padding:15px; text-align:center; color:#94a3b8; font-style:italic; width:100%;">No se encontraron colaboradores activos en esta categoría.</div>`;
    } else {
        const escala = window.escalaDelNivel(empStats.map(emp => window.filaCanonica(emp)));
        empStats.forEach(emp => { html += window.columnaDeColaborador(emp, escala); });
    }
    html += `</div>`;
    document.getElementById('desglose-container').innerHTML = html;
};

console.log("✅ Evaluaciones Stats v63: BARRA INDEPENDIENTE PARA CERTIFICADAS");
