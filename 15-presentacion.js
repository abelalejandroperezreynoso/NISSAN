// ==========================================
// 15-presentacion.js — LA PRESENTACIÓN SEMANAL
// ==========================================
// Una diapositiva con el resultado general de la planta, que la aplicación
// arma sola para cada semana con los mismos datos de la tarjeta del panel: no
// hay que generarla ni guardarla, y la de la semana pasada sigue ahí si se va
// hacia atrás. Se ve dentro de una hoja y se descarga como `.pptx`.
//
// Se entra por el botón del final de la tarjeta de encuestas, que sólo sale en
// modo administrador: es la cifra de la empresa y sólo esa tarjeta la tiene.
//
// **La diapositiva se describe una sola vez** (`diapositivaDePlanta`), como una
// lista de rectángulos, textos, líneas y círculos en un lienzo de 960×540, y
// de esa lista salen las dos cosas: el SVG que se ve en la hoja y el PowerPoint
// que se descarga. Así no pueden decir cosas distintas. La escala es la de
// PowerPoint: 960 px son sus 13.33 pulgadas a 72 por pulgada, y un texto de
// 20 px son 15 pt.
//
// Cuatro cosas que hay que mantener:
//
//   - **Las cifras salen de las mismas funciones que la tarjeta**
//     (`resumenDeEncuestaAdmin`, `totalDeEncuestasAdmin`,
//     `promedioDeClasificaciones`), con el mismo padrón ya calculado: una
//     presentación que dijera otra cifra que el panel sería peor que ninguna.
//   - **Cada semana es la foto de su cierre**, la misma de los puntos pequeños
//     de la gráfica; la que corre, la de ahora. Por eso la primera semana de un
//     mes sale baja: las mensuales vuelven a estar sin contestar.
//   - **Quién destacó se mide con la regla de la planta, persona por persona**
//     (`desempenoDePersonasEn`): su última respuesta de cada encuesta en su
//     periodo, cero en lo que no contestó y cada clasificación pesando igual.
//     Sólo entra quien tiene algo calificado.
//   - **PptxGenJS se pide al pulsar descargar**, con `cargarLibreria` y sin
//     `?v=`, como SheetJS: son 470 KB que no tiene por qué pagar quien sólo mira.

window.LIBRERIA_PRESENTACIONES = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
window.MESES_EN_LA_TENDENCIA = 12;

// Lo que se está mirando: las semanas que se pueden enseñar y cuál.
window.presentacion = { semanas: [], indice: 0, resultados: {} };

// ¿Se puede ofrecer? Sólo con la tarjeta del administrador dibujada y sin haber
// llegado al tope de respuestas, que es cuando la historia está entera.
window.hayPresentacion = () => !!window.tarjetaDeEncuestasEsAdmin
    && (window.filasDeLaTarjeta || []).length > 0
    && (window.periodosDeLaTarjeta || []).length > 0;

// El botón del final de la tarjeta. Sin tarjeta de administrador, nada.
window.botonDePresentacion = () => {
    if (!window.hayPresentacion()) return '';
    return `
        <button type="button" class="tarjeta-presentacion" onclick="window.abrirPresentacion()">
            <span class="tarjeta-presentacion-icono" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                    <path d="M12 16v4M8 20h8M7 12l3-3 2 2 4-4" fill="none" stroke="currentColor" stroke-width="2"
                          stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </span>
            <span class="tarjeta-presentacion-texto">
                <b>Presentación de la semana</b>
                <span>Resultado general de la planta</span>
            </span>
            <span class="fila-ios-chevron">›</span>
        </button>`;
};

// Las respuestas de la presentación. La gráfica mira hasta doce meses atrás y la
// tarjeta del panel se trae seis, así que **se reusan las suyas sólo si ya
// llegan hasta ahí** —pasa cuando hay alguna encuesta de «única vez», que
// arrastra la consulta hasta el principio— y sin haber tocado el tope; si no,
// se piden las que faltan una sola vez por sesión (se guarda la promesa).
// `cubreDesde` es desde cuándo están enteras: con el tope, las más viejas que
// llegaron, que lo de antes vino a medias.
window.respuestasDeLaPresentacion = null;
window.cargarRespuestasDeLaPresentacion = () => {
    const encuestas = (window.filasDeLaTarjeta || []).map(f => f.ev);
    const ahora = new Date();
    const hacenFalta = window.desdeDeRespuestasDeTodos(encuestas, ahora, null, window.MESES_EN_LA_TENDENCIA);
    const trajoLaTarjeta = window.desdeDeRespuestasDeTodos(encuestas, ahora, null, window.PERIODOS_EN_LA_GRAFICA);
    const deHoy = window.diaLocal ? window.diaLocal(ahora) : ahora.toDateString();
    const clave = encuestas.map(e => e.id).join(',') + '|' + deHoy;

    if (!window.topeDeLaTarjeta && trajoLaTarjeta && hacenFalta && trajoLaTarjeta <= hacenFalta) {
        return Promise.resolve({ respuestas: window.respuestasAsignadas || [], cubreDesde: trajoLaTarjeta });
    }
    const guardada = window.respuestasDeLaPresentacion;
    if (guardada && guardada.clave === clave) return guardada.promesa;

    const promesa = window.respuestasDelPeriodoDeTodos(encuestas, ahora, null, window.MESES_EN_LA_TENDENCIA)
        .then(r => {
            let cubreDesde = r.desde;
            if (r.tope && r.respuestas.length) {
                cubreDesde = new Date(r.respuestas[r.respuestas.length - 1].submitted_at);
            }
            return { respuestas: r.respuestas, cubreDesde };
        })
        .catch(e => { window.respuestasDeLaPresentacion = null; throw e; });
    window.respuestasDeLaPresentacion = { clave, promesa };
    return promesa;
};

// Las respuestas con las que se calcula todo: las de la presentación, o las de
// la tarjeta mientras no haya otras.
window.respuestasParaPresentar = () => window.presentacion.respuestas || window.respuestasAsignadas;

// Las semanas que tienen datos: desde doce meses atrás —o desde donde las
// respuestas están enteras— hasta la que corre, de la más vieja a la más nueva. La que corre se mira con la hora de
// ahora, que su cierre todavía no ha llegado.
window.semanasDeLaPresentacion = (cubreDesde) => {
    const meses = window.periodosDeClasificacion(
        [{ frequency: 'monthly' }], window.MESES_EN_LA_TENDENCIA);
    let desde = meses.length ? meses[meses.length - 1].inicio : null;
    if (!(desde instanceof Date)) return [];
    if (cubreDesde instanceof Date && cubreDesde > desde) desde = cubreDesde;

    const cuantas = Math.ceil((Date.now() - desde.getTime()) / (7 * 86400000)) + 1;
    const ahora = new Date();
    return window.periodosDeClasificacion([{ frequency: 'weekly' }], cuantas)
        .filter(p => p.inicio instanceof Date && p.inicio >= desde)
        .map(p => ({
            inicio: p.inicio,
            fin: p.fin,
            actual: !!p.actual,
            referencia: (p.actual || (p.referencia && p.referencia > ahora)) ? ahora : p.referencia
        }))
        .reverse();
};

// «Semana del 28 sep al 4 oct 2026». El fin que se dice es el domingo.
window.textoDeSemana = (semana) => {
    const meses = window.MESES_CORTOS;
    const a = semana.inicio;
    const b = new Date(semana.fin ? semana.fin.getTime() - 1 : a.getTime() + 6 * 86400000);
    const deA = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${meses[a.getMonth()]}`;
    return `Semana del ${deA} al ${b.getDate()} ${meses[b.getMonth()]} ${b.getFullYear()}`;
};

// El resultado de la planta en un instante: el general —cada clasificación
// pesa lo mismo— y el de cada clasificación. Lo que en ese instante todavía no
// existía no entra, igual que en la tarjeta.
window.resultadoDePlantaEn = (referencia) => {
    const filas = (window.filasDeLaTarjeta || [])
        .filter(f => window.encuestaExistiaEn(f.ev, referencia))
        .map(f => ({
            ev: f.ev,
            resumen: window.resumenDeEncuestaAdmin(f.ev, window.respuestasParaPresentar(), referencia,
                (window.padronesDeLaTarjeta || {})[f.ev.id])
        }));

    const porClave = {};
    const grupos = [];
    filas.forEach(f => {
        const clave = window.normalizarClasificacion(f.ev.category || '');
        if (!porClave[clave]) {
            porClave[clave] = { nombre: String(f.ev.category || 'General').trim() || 'General', filas: [] };
            grupos.push(porClave[clave]);
        }
        porClave[clave].filas.push(f);
    });

    const clasificaciones = grupos.map(g => {
        const t = window.totalDeEncuestasAdmin(g.filas);
        return { nombre: g.nombre, promedio: t.promedio, contestaron: t.contestaron, total: t.total };
    }).sort((a, b) => (b.promedio === null ? -1 : b.promedio) - (a.promedio === null ? -1 : a.promedio)
        || a.nombre.localeCompare(b.nombre, 'es'));

    const total = window.totalDeEncuestasAdmin(filas);
    return {
        promedio: window.promedioDeClasificaciones(filas),
        contestaron: total.contestaron,
        total: total.total,
        encuestas: filas.length,
        clasificaciones
    };
};

// Con memoria: la tendencia pregunta por las ocho semanas de atrás y cambiar
// de semana volvería a preguntar por siete de ellas.
window.resultadoDeSemana = (i) => {
    const p = window.presentacion;
    if (!p.resultados[i]) p.resultados[i] = window.resultadoDePlantaEn(p.semanas[i].referencia);
    return p.resultados[i];
};

// Cuántas semanas mira el desempate: la que se mira y las tres de antes.
window.SEMANAS_DEL_DESEMPATE = 4;

// Las personas de una semana, con memoria: el desempate de cada semana pregunta
// por las tres de antes, y cambiar de semana volvería a calcularlas.
window.personasDeSemana = (i) => {
    const r = window.resultadoDeSemana(i);
    if (!r.personas) r.personas = window.desempenoDePersonasEn(window.presentacion.semanas[i].referencia);
    return r.personas;
};

// El resultado en un instante cualquiera, con memoria: los puntos de los meses
// se repiten de una semana a la siguiente.
window.resultadoEnInstante = (fecha) => {
    const p = window.presentacion;
    p.porInstante = p.porInstante || {};
    const k = fecha.getTime();
    if (!p.porInstante[k]) p.porInstante[k] = window.resultadoDePlantaEn(fecha);
    return p.porInstante[k];
};

// Los meses de la tendencia de la semana `i`: hasta doce, terminando en el mes
// de esa semana, y **sólo los que tienen resultado** a partir del primero que
// lo tiene. Cada mes es la foto de su cierre —la misma de los puntos grandes de
// la gráfica del panel— y el de la semana que se mira, la de su domingo: así
// el último punto es la cifra grande de la diapositiva.
window.mesesDeLaTendencia = (i) => {
    const p = window.presentacion;
    const semana = p.semanas[i];
    const hasta = semana.referencia;
    const meses = window.periodosDeClasificacion([{ frequency: 'monthly' }], window.MESES_EN_LA_TENDENCIA, hasta)
        // Un mes que empieza antes de donde las respuestas están enteras saldría
        // a medias —más bajo de lo que fue—, así que no se dibuja.
        .filter(m => m.inicio instanceof Date && !(p.cubreDesde instanceof Date && m.inicio < p.cubreDesde))
        .reverse()
        .map(m => {
            const ref = (m.referencia && m.referencia < hasta) ? m.referencia : hasta;
            return { inicio: m.inicio, actual: ref === hasta, r: window.resultadoEnInstante(ref) };
        });
    const primero = meses.findIndex(m => m.r.promedio !== null);
    return primero < 0 ? [] : meses.slice(primero);
};

// Los destacados sólo los pide la semana que se está mirando, no la tendencia.
// A cada persona se le pone su promedio de las últimas semanas —sólo las que
// tuvo algo calificado, como la cifra de cada semana—, que es el primer
// desempate.
window.destacadosDeSemana = (i) => {
    const r = window.resultadoDeSemana(i);
    if (!r.destacados) {
        const historia = {};
        for (let k = Math.max(0, i - window.SEMANAS_DEL_DESEMPATE + 1); k <= i; k++) {
            window.personasDeSemana(k).forEach(p => {
                const id = String(p.emp.id);
                (historia[id] = historia[id] || []).push(p.promedio);
            });
        }
        const personas = window.personasDeSemana(i).map(p => {
            const vals = historia[String(p.emp.id)] || [p.promedio];
            return Object.assign({}, p, {
                promedioReciente: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
                semanasRecientes: vals.length
            });
        });
        r.destacados = window.destacadosDeLaSemana(personas);
    }
    return r.destacados;
};

// Cómo le fue a cada persona en un instante, con la misma regla que la cifra
// de la planta: su última respuesta de cada encuesta en el periodo de esa
// encuesta (`ultimaDeCadaUnoEnPeriodo`, la misma que usa el resumen), lo que no
// contestó vale cero y cada clasificación pesa igual
// (`promedioPorClasificacion`, la misma del renglón de quien contesta).
//
// **Sólo entra quien tiene algo calificado.** A principio de mes media planta
// está en cero porque las mensuales vuelven a estar sin contestar, y el «menor
// desempeño» saldría de sortear entre cuarenta ceros a alguien que no ha hecho
// nada todavía —ni mal ni bien—. Lo contestado y sin calificar tampoco puntúa,
// como en todas partes: su cero sería el atraso del revisor.
window.desempenoDePersonasEn = (referencia) => {
    const porPersona = {};
    (window.filasDeLaTarjeta || [])
        .filter(f => window.encuestaExistiaEn(f.ev, referencia))
        .forEach(f => {
            const padron = (window.padronesDeLaTarjeta || {})[f.ev.id] || window.padronDeLaEncuesta(f.ev);
            const ultimas = window.ultimaDeCadaUnoEnPeriodo(f.ev, window.respuestasParaPresentar(), referencia);
            padron.forEach(emp => {
                const id = String(emp.id);
                const p = porPersona[id] || (porPersona[id] =
                    { emp, filas: [], asignadas: 0, contestadas: 0, calificadas: 0, terminoEn: 0, sumaDias: 0, conDias: 0 });
                p.asignadas++;
                const r = ultimas[id];
                if (!r) { p.filas.push({ ev: f.ev, puntaje: 0 }); return; }
                p.contestadas++;
                // Cuándo terminó: la más tardía de las respuestas que cuentan.
                const enviada = new Date(r.submitted_at).getTime();
                if (!isNaN(enviada) && enviada > p.terminoEn) p.terminoEn = enviada;
                // Cuánto tardó desde que le apareció como pendiente: la misma
                // medida que «Prontitud» en las estadísticas (`origenDelPendiente`).
                const marca = window.origenDelPendiente
                    ? window.origenDelPendiente(f.ev.frequency, window.inicioDeEncuesta(f.ev), emp, new Date(r.submitted_at))
                    : null;
                if (marca && !isNaN(enviada)) {
                    p.sumaDias += Math.max(0, enviada - marca.origen.getTime()) / 86400000;
                    p.conDias++;
                }
                const puntaje = window.puntajeDeRespuesta(r);
                if (puntaje === null) return;
                p.calificadas++;
                p.filas.push({ ev: f.ev, puntaje });
            });
        });
    return Object.values(porPersona)
        .filter(p => p.calificadas > 0)
        .map(p => Object.assign(p, {
            promedio: window.promedioPorClasificacion(p.filas),
            diasDeRespuesta: p.conDias ? p.sumaDias / p.conDias : null
        }))
        .filter(p => p.promedio !== null);
};

// El mejor y el peor, y con cuántos empataron esa semana. El empate se
// deshace en este orden, que es el mismo para los dos, al revés:
//
//   1. El promedio de las últimas cuatro semanas (`promedioReciente`): quien
//      sostiene el resultado semana tras semana va delante de quien lo tuvo una.
//   2. Cuántas encuestas tiene calificadas: un 100% sobre nueve dice más que
//      sobre dos. Para el peor, cuántas dejó sin contestar.
//   3. Quién terminó antes de contestar la semana. Para el peor, quién después.
//   4. El nombre, sólo para que el resultado no dependa del orden de la consulta.
//
// Con una sola persona no hay «peor» que enseñar.
window.destacadosDeLaSemana = (personas) => {
    if (!personas.length) return { mejor: null, peor: null };
    const nombre = (p) => String(p.emp.name || '');
    const reciente = (p) => p.promedioReciente === undefined ? p.promedio : p.promedioReciente;
    const mejores = personas.slice().sort((a, b) => b.promedio - a.promedio
        || reciente(b) - reciente(a)
        || b.calificadas - a.calificadas
        || (a.terminoEn || 0) - (b.terminoEn || 0)
        || nombre(a).localeCompare(nombre(b), 'es'));
    const peores = personas.slice().sort((a, b) => a.promedio - b.promedio
        || reciente(a) - reciente(b)
        || (b.asignadas - b.contestadas) - (a.asignadas - a.contestadas)
        || (b.terminoEn || 0) - (a.terminoEn || 0)
        || nombre(a).localeCompare(nombre(b), 'es'));
    const empates = (p) => personas.filter(q => q !== p && q.promedio === p.promedio).length;
    const mejor = mejores[0];
    const peor = personas.length > 1 ? peores[0] : null;
    return {
        mejor: Object.assign({ empates: empates(mejor) }, mejor),
        peor: peor ? Object.assign({ empates: empates(peor) }, peor) : null
    };
};

// Parte un texto en renglones de hasta `max` letras, por palabras, y recorta
// con «…» lo que no quepa en `lineas`. La diapositiva no sabe partir sola: es
// una lista de cajas y cada renglón es la suya.
window.partirEnRenglones = (texto, max, lineas) => {
    const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
    const salida = [];
    let actual = '';
    palabras.forEach(p => {
        const junto = actual ? actual + ' ' + p : p;
        if (junto.length <= max || !actual) actual = junto;
        else { salida.push(actual); actual = p; }
    });
    if (actual) salida.push(actual);
    if (salida.length > lineas) {
        salida.length = lineas;
        salida[lineas - 1] = salida[lineas - 1].slice(0, max - 1).trimEnd() + '…';
    }
    return salida.map(r => r.length > max ? r.slice(0, max - 1) + '…' : r);
};

// «0.4 días», «1 día», «12 días». Por debajo de un día se dicen horas, que
// «0.2 días» no se lee de un vistazo.
window.textoDeDias = (dias) => {
    if (dias < 1) {
        const horas = Math.max(1, Math.round(dias * 24));
        return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    }
    const redondo = dias < 10 ? Math.round(dias * 10) / 10 : Math.round(dias);
    return `${redondo} ${redondo === 1 ? 'día' : 'días'}`;
};

window.inicialesDe = (nombre) => String(nombre || '').trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';

// --- LA DIAPOSITIVA, DESCRITA UNA VEZ ---
//
// Una lista de elementos sobre 960×540. Cada uno dice su caja en píxeles de
// ese lienzo; el SVG los pinta tal cual y el PowerPoint los pasa a pulgadas.
window.ANCHO_DIAPOSITIVA = 960;
window.ALTO_DIAPOSITIVA = 540;

window.diapositivaDePlanta = (i) => {
    const semana = window.presentacion.semanas[i];
    const r = window.resultadoDeSemana(i);
    const anterior = i > 0 ? window.resultadoDeSemana(i - 1) : null;
    const color = (v) => v === null ? '#94a3b8' : window.getColorScore(v);
    const el = [];
    const texto = (x, y, w, h, t, tam, col, extra) =>
        el.push(Object.assign({ tipo: 'texto', x, y, w, h, texto: t, tam, color: col }, extra || {}));

    el.push({ tipo: 'rect', x: 0, y: 0, w: 960, h: 540, relleno: '#ffffff' });
    el.push({ tipo: 'rect', x: 0, y: 0, w: 960, h: 8, relleno: '#2563eb' });

    // Encabezado.
    texto(40, 30, 640, 42, 'Resultado general de la planta', 30, '#0f172a', { negrita: true });
    texto(40, 74, 640, 24, window.textoDeSemana(semana) + (semana.actual ? ' · en curso' : ''), 16, '#64748b');
    texto(620, 36, 300, 22, 'Panel de Mantenimiento', 13, '#94a3b8', { alinear: 'right' });
    el.push({ tipo: 'linea', x1: 40, y1: 114, x2: 920, y2: 114, color: '#e2e8f0', grosor: 1 });

    // Tres columnas: la cifra y su tendencia, las clasificaciones y quién
    // destacó. La cifra grande y lo que la acompaña.
    texto(40, 136, 270, 22, 'Resultado general', 15, '#64748b');
    texto(40, 160, 270, 110, r.promedio === null ? '—' : `${r.promedio}%`, 88, color(r.promedio), { negrita: true });
    texto(40, 272, 270, 22,
        r.total > 0 ? `${r.contestaron}/${r.total} respuestas · ${r.encuestas} encuestas` : `${r.contestaron} respuestas`,
        13, '#475569');
    if (anterior && anterior.promedio !== null && r.promedio !== null) {
        const d = r.promedio - anterior.promedio;
        const t = d === 0 ? 'Igual que la semana anterior'
            : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} pts vs. semana anterior`;
        texto(40, 298, 270, 22, t, 13, d > 0 ? '#16a34a' : (d < 0 ? '#dc2626' : '#64748b'), { negrita: true });
    }

    // La tendencia de los últimos meses —hasta doce, los que tengan resultado—,
    // terminando en el de la semana que se mira.
    const tramo = window.mesesDeLaTendencia(i);
    texto(40, 338, 270, 20, tramo.length === 1 ? 'Este mes' : `Últimos ${tramo.length} meses`, 12, '#94a3b8', { negrita: true });
    const gx = 62, gw = 226, gy = 366, gh = 100;
    const px = (j) => gx + (tramo.length === 1 ? gw / 2 : gw * j / (tramo.length - 1));
    const py = (v) => gy + gh * (1 - v / 100);
    el.push({ tipo: 'rect', x: 40, y: 358, w: 270, h: 140, relleno: '#f8fafc', radio: 10 });
    el.push({ tipo: 'linea', x1: gx, y1: py(window.UMBRAL_CERTIFICACION), x2: gx + gw, y2: py(window.UMBRAL_CERTIFICACION),
              color: '#86efac', grosor: 1, guiones: true });
    let previo = null;
    tramo.forEach((t, j) => {
        if (t.r.promedio === null) { previo = null; return; }
        const punto = [px(j), py(t.r.promedio)];
        if (previo) el.push({ tipo: 'linea', x1: previo[0], y1: previo[1], x2: punto[0], y2: punto[1], color: '#2563eb', grosor: 2.5 });
        previo = punto;
    });
    // Doce rótulos no caben en 226 px: con más de seis van alternos, siempre
    // con el del mes que se mira. El de enero lleva el año, que es donde cambia.
    const saltoRotulo = tramo.length > 6 ? 2 : 1;
    tramo.forEach((t, j) => {
        const d = t.inicio;
        const ultimo = j === tramo.length - 1;
        if ((tramo.length - 1 - j) % saltoRotulo === 0) {
            const rotulo = window.MESES_CORTOS[d.getMonth()] + (d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : '');
            texto(px(j) - 22, 474, 44, 16, rotulo, 10,
                ultimo ? '#0f172a' : '#94a3b8', { alinear: 'center', negrita: ultimo });
        }
        if (t.r.promedio === null) return;
        el.push({ tipo: 'circulo', cx: px(j), cy: py(t.r.promedio), r: ultimo ? 6 : 4,
                  relleno: color(t.r.promedio), borde: '#ffffff' });
    });

    // Una barra por clasificación, de la mejor a la peor.
    texto(340, 136, 300, 22, 'Por clasificación', 15, '#0f172a', { negrita: true });
    const lista = r.clasificaciones;
    const alto = Math.min(52, 322 / Math.max(lista.length, 1));
    const tam = Math.max(9, Math.min(13, alto * 0.36));
    const bx = 462, bw = 128;
    lista.forEach((c, j) => {
        const y = 168 + j * alto;
        const renglones = window.partirEnRenglones(c.nombre, Math.floor(116 / (tam * 0.56)), alto >= tam * 2.6 ? 2 : 1);
        renglones.forEach((t, n) => texto(340, y + (alto - renglones.length * tam * 1.2) / 2 + n * tam * 1.2,
            118, tam * 1.2, t, tam, '#334155', { negrita: true }));
        const hb = Math.max(6, alto * 0.32);
        el.push({ tipo: 'rect', x: bx, y: y + (alto - hb) / 2, w: bw, h: hb, relleno: '#f1f5f9', radio: hb / 2 });
        if (c.promedio !== null && c.promedio > 0) {
            el.push({ tipo: 'rect', x: bx, y: y + (alto - hb) / 2, w: Math.max(hb, bw * c.promedio / 100), h: hb,
                      relleno: color(c.promedio), radio: hb / 2 });
        }
        texto(592, y, 48, alto, c.promedio === null ? '—' : `${c.promedio}%`, tam + 1, color(c.promedio),
            { negrita: true, alinear: 'right' });
    });
    if (lista.length) {
        const xm = bx + bw * window.UMBRAL_CERTIFICACION / 100;
        el.push({ tipo: 'linea', x1: xm, y1: 164, x2: xm, y2: 168 + lista.length * alto + 2, color: '#22c55e', grosor: 1, guiones: true });
    }

    // Quién destacó: la mejor y la peor persona de la semana.
    const { mejor, peor } = window.destacadosDeSemana(i);
    const tarjetaDePersona = (p, y, rotulo, acento, vacio) => {
        const x = 670, w = 250, h = 176;
        el.push({ tipo: 'rect', x, y, w, h, relleno: '#f8fafc', radio: 12 });
        el.push({ tipo: 'rect', x, y: y + 14, w: 4, h: 20, relleno: acento });
        texto(x + 16, y + 14, w - 32, 20, rotulo, 12, acento, { negrita: true });
        if (!p) {
            vacio.forEach((t, n) => texto(x + 16, y + 48 + n * 18, w - 32, 18, t, 13, '#94a3b8'));
            return;
        }
        const emp = p.emp;
        el.push({ tipo: 'imagen', x: x + 16, y: y + 44, w: 68, h: 68,
                  url: emp.avatar ? window.procesarUrlImagen(emp.avatar) : '',
                  iniciales: window.inicialesDe(emp.name), fondo: '#e2e8f0' });
        let yt = y + 44;
        window.partirEnRenglones(emp.name, 17, 2).forEach(t => {
            texto(x + 96, yt, w - 108, 18, t, 14, '#0f172a', { negrita: true });
            yt += 18;
        });
        const depto = String(emp.dept || emp.department || '').trim() || 'Sin departamento';
        const puesto = String(emp.puesto || '').trim() || 'Sin puesto';
        texto(x + 96, yt + 2, w - 108, 16, window.partirEnRenglones(depto, 22, 1)[0], 12, '#475569');
        texto(x + 96, yt + 18, w - 108, 16, window.partirEnRenglones(puesto, 22, 1)[0], 12, '#64748b');
        texto(x + 16, y + 122, 90, 40, `${p.promedio}%`, 32, color(p.promedio), { negrita: true });
        // Cuatro renglones cortos a la derecha de la cifra: lo calificado, la
        // velocidad de respuesta, el promedio de las últimas semanas —que es lo
        // que decide un empate, así que se dice siempre— y con cuántos empató.
        const detalle = [[`${p.calificadas}/${p.asignadas} encuestas calificadas`, '#475569']];
        if (p.diasDeRespuesta !== null) {
            detalle.push([`Responde en ${window.textoDeDias(p.diasDeRespuesta)}`, '#475569']);
        }
        if (p.semanasRecientes > 1) {
            detalle.push([`Últimas ${p.semanasRecientes} semanas: ${p.promedioReciente}%`, '#475569']);
        }
        if (p.empates > 0) detalle.push([`Empató con ${p.empates}`, '#94a3b8']);
        const arriba = y + 140 - detalle.length * 13 / 2;
        detalle.forEach(([t, col], n) => texto(x + 110, arriba + n * 13, w - 122, 13, t, 10.5, col));
    };
    const nadie = ['Todavía nadie tiene', 'resultados calificados.'];
    tarjetaDePersona(mejor, 136, 'MEJOR DESEMPEÑO', '#16a34a', nadie);
    tarjetaDePersona(peor, 324, 'MENOR DESEMPEÑO', '#dc2626',
        mejor ? ['Sólo una persona tiene', 'resultados calificados.'] : nadie);

    // Pie.
    const hoy = new Date();
    texto(40, 508, 880, 18,
        `Cada clasificación pesa igual · meta ${window.UMBRAL_CERTIFICACION}% · desempeño sobre lo ya calificado · ` +
        `generada el ${hoy.getDate()} ${window.MESES_CORTOS[hoy.getMonth()]} ${hoy.getFullYear()}, ` +
        `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`,
        11, '#94a3b8');
    return el;
};

// --- DE LA LISTA AL SVG ---
// Cada foto lleva su propio recorte, y los ids no pueden repetirse en el
// documento: la hoja repinta la diapositiva a cada cambio de semana.
window.contadorRecortesDiapositiva = 0;
window.svgDeDiapositiva = (elementos) => {
    const esc = window.sanitizeForHTML;
    const partes = elementos.map(e => {
        if (e.tipo === 'rect') return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radio || 0}" fill="${e.relleno}"/>`;
        if (e.tipo === 'linea') return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${e.color}" stroke-width="${e.grosor}"${e.guiones ? ' stroke-dasharray="5 4"' : ''} stroke-linecap="round"/>`;
        if (e.tipo === 'circulo') return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${e.relleno}"${e.borde ? ` stroke="${e.borde}" stroke-width="2"` : ''}/>`;
        if (e.tipo === 'imagen') {
            // Las iniciales van debajo y la foto encima, recortada en círculo:
            // si la foto no carga, el SVG no dibuja nada y quedan las iniciales.
            const id = `recorte-foto-${++window.contadorRecortesDiapositiva}`;
            const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
            return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="${e.fondo}"/>
                <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(e.w * 0.36)}"
                      font-weight="700" fill="#64748b">${esc(e.iniciales)}</text>
                ${e.url ? `<image href="${esc(e.url)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"
                      preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : ''}
                <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="#ffffff" stroke-width="2"/>`;
        }
        if (e.tipo === 'texto') {
            const ancla = e.alinear === 'right' ? 'end' : (e.alinear === 'center' ? 'middle' : 'start');
            const x = e.alinear === 'right' ? e.x + e.w : (e.alinear === 'center' ? e.x + e.w / 2 : e.x);
            return `<text x="${x}" y="${e.y + e.h / 2}" text-anchor="${ancla}" dominant-baseline="central"
                          font-size="${e.tam}" font-weight="${e.negrita ? 700 : 400}" fill="${e.color}">${esc(e.texto)}</text>`;
        }
        return '';
    }).join('');
    return `<svg viewBox="0 0 ${window.ANCHO_DIAPOSITIVA} ${window.ALTO_DIAPOSITIVA}" role="img"
                 aria-label="Resultado general de la planta"
                 style="width:100%; height:auto; display:block; font-family:Arial, Helvetica, sans-serif;">${partes}</svg>`;
};

// --- DE LA LISTA AL POWERPOINT ---
// 72 px por pulgada, que es lo que hace que 960×540 sea el panorámico de
// PowerPoint (13.33 × 7.5). Los colores van sin la almohadilla.
window.agregarDiapositivaPptx = (pptx, elementos) => {
    const s = pptx.addSlide();
    const pulg = (v) => v / 72;
    const hex = (c) => String(c || '#000000').replace('#', '');
    elementos.forEach(e => {
        if (e.tipo === 'rect') {
            s.addShape(e.radio ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fill: { color: hex(e.relleno) }, line: { color: hex(e.relleno), width: 0 },
                rectRadius: e.radio ? pulg(e.radio) : undefined
            });
        } else if (e.tipo === 'linea') {
            // Una línea de PowerPoint es una caja con su diagonal: la que baja
            // de izquierda a derecha es la normal y la que sube va volteada.
            const x = Math.min(e.x1, e.x2), y = Math.min(e.y1, e.y2);
            const sube = (e.x2 - e.x1) * (e.y2 - e.y1) < 0;
            s.addShape(pptx.ShapeType.line, {
                x: pulg(x), y: pulg(y), w: pulg(Math.abs(e.x2 - e.x1)), h: pulg(Math.abs(e.y2 - e.y1)),
                flipV: sube,
                line: { color: hex(e.color), width: e.grosor * 0.75, dashType: e.guiones ? 'dash' : 'solid' }
            });
        } else if (e.tipo === 'circulo') {
            s.addShape(pptx.ShapeType.ellipse, {
                x: pulg(e.cx - e.r), y: pulg(e.cy - e.r), w: pulg(e.r * 2), h: pulg(e.r * 2),
                fill: { color: hex(e.relleno) },
                line: { color: hex(e.borde || e.relleno), width: e.borde ? 1.5 : 0 }
            });
        } else if (e.tipo === 'imagen') {
            s.addShape(pptx.ShapeType.ellipse, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fill: { color: hex(e.fondo) }, line: { color: hex(e.fondo), width: 0 }
            });
            s.addText(e.iniciales, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fontFace: 'Arial', fontSize: Math.round(e.w * 0.36 * 0.75), color: '64748B',
                bold: true, align: 'center', valign: 'middle', margin: 0
            });
            // `datos` lo deja puesto `fotosParaPptx`: la foto ya recortada en
            // círculo. Sin él quedan las iniciales, que es lo que se ve también
            // en la hoja cuando la foto no carga.
            if (e.datos) s.addImage({ data: e.datos, x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h) });
        } else if (e.tipo === 'texto') {
            s.addText(e.texto, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fontFace: 'Arial', fontSize: Math.round(e.tam * 0.75 * 10) / 10, color: hex(e.color),
                bold: !!e.negrita, align: e.alinear || 'left', valign: 'middle', margin: 0
            });
        }
    });
    return s;
};

// PowerPoint no sabe de URLs de otro sitio ni de recortes en círculo: la foto
// tiene que ir dentro del archivo, y ya redonda. Se pide con `crossOrigin` —el
// almacenamiento de Supabase manda la cabecera— y se recorta en un lienzo,
// centrada como el `slice` del SVG. Si algo falla —sin red, sin la cabecera,
// una foto borrada— se queda sin `datos` y salen las iniciales: una foto de
// menos no puede tumbar la descarga.
window.fotoRedondaParaPptx = (url, lado) => new Promise(resolve => {
    if (!url || url.startsWith('data:')) return resolve(null);
    const img = new Image();
    const plazo = setTimeout(() => resolve(null), 8000);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        clearTimeout(plazo);
        try {
            const c = document.createElement('canvas');
            c.width = c.height = lado;
            const ctx = c.getContext('2d');
            ctx.beginPath();
            ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2);
            ctx.clip();
            const m = Math.min(img.naturalWidth, img.naturalHeight);
            ctx.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, lado, lado);
            resolve(c.toDataURL('image/png'));
        } catch (e) { resolve(null); }
    };
    img.onerror = () => { clearTimeout(plazo); resolve(null); };
    img.src = url;
});

window.fotosParaPptx = (elementos) => Promise.all(elementos
    .filter(e => e.tipo === 'imagen' && e.url)
    .map(async e => { e.datos = await window.fotoRedondaParaPptx(e.url, 240); }));

// --- LA HOJA ---
window.montarHojaPresentacion = () => {
    let overlay = document.getElementById('modal-presentacion');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'modal-presentacion';
    overlay.className = 'hoja-overlay';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="hoja-contenido" style="max-width:760px; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Presentación semanal</h3>
                    <div class="hoja-subtitulo" id="subtitulo-presentacion"></div>
                </div>
                <div class="hoja-acciones">
                    <button type="button" onclick="window.abrirPresentacionCompleta()" class="ios-boton-icono"
                            title="Pantalla completa" aria-label="Pantalla completa">
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.4"
                                  stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <button id="btn-descargar-presentacion" type="button" onclick="window.descargarPresentacion()"
                            class="ios-boton-icono" title="Descargar en PowerPoint" aria-label="Descargar en PowerPoint">
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4"
                                  stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <button type="button" onclick="window.cerrarPresentacion()" class="ios-boton-icono ios-boton-cerrar"
                            title="Cerrar" aria-label="Cerrar"></button>
                </div>
            </div>
            <div class="hoja-cuerpo-formulario">
                <div class="presentacion-nav">
                    <button type="button" id="btn-semana-anterior" onclick="window.moverSemanaPresentacion(-1)"
                            title="Semana anterior" aria-label="Semana anterior">‹</button>
                    <span id="semana-presentacion"></span>
                    <button type="button" id="btn-semana-siguiente" onclick="window.moverSemanaPresentacion(1)"
                            title="Semana siguiente" aria-label="Semana siguiente">›</button>
                </div>
                <div id="diapositiva-presentacion" class="presentacion-diapositiva" role="button" tabindex="0"
                     title="Ver en pantalla completa" onclick="window.abrirPresentacionCompleta()"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return overlay;
};

window.abrirPresentacion = async () => {
    if (!window.hayPresentacion()) return;
    const hoja = window.montarHojaPresentacion();
    hoja.style.display = 'flex';
    const sub = document.getElementById('subtitulo-presentacion');
    const caja = document.getElementById('diapositiva-presentacion');
    // Si hay que pedir el último año se dice, en el subtítulo como todo estado
    // de una hoja, y la diapositiva espera en blanco.
    sub.innerText = 'Cargando el último año…';
    caja.innerHTML = '<div class="presentacion-cargando"></div>';
    let datos;
    try {
        datos = await window.cargarRespuestasDeLaPresentacion();
    } catch (e) {
        sub.innerText = 'No se pudieron cargar las respuestas.';
        caja.innerHTML = '';
        return;
    }
    if (hoja.style.display !== 'flex') return;
    const semanas = window.semanasDeLaPresentacion(datos.cubreDesde);
    if (semanas.length === 0) { sub.innerText = 'Todavía no hay semanas que enseñar.'; caja.innerHTML = ''; return; }
    window.presentacion = { semanas, indice: semanas.length - 1, resultados: {},
                            respuestas: datos.respuestas, cubreDesde: datos.cubreDesde };
    window.pintarPresentacion();
};

window.cerrarPresentacion = () => {
    window.cerrarPresentacionCompleta();
    const overlay = document.getElementById('modal-presentacion');
    if (overlay) overlay.style.display = 'none';
};

// --- PANTALLA COMPLETA ---
//
// La diapositiva sola, sobre el gris del visor de imágenes y con su mismo botón
// flotante de cerrar: es para proyectarla o enseñarla en una junta. **No se
// gira sola**: se ajusta a como esté el teléfono, y quien la quiera grande lo
// pone de lado. Girarla por su cuenta dejaba la letra de lado con el teléfono
// derecho, que es justo lo que no se pidió.
//
// **Se amplía con los dedos**, como el visor de imágenes: dos dedos, doble
// toque —que amplía donde se tocó y vuelve al tamaño— y, en un escritorio,
// ctrl (o ⌘) con la rueda, doble click y arrastrar. Ampliada, un dedo la
// mueve. El zoom se hace cambiando el tamaño de la lámina y no con un
// `scale()`: el SVG se vuelve a dibujar a su tamaño y la letra sale nítida en
// vez de ampliada como una foto.
//
// Donde el navegador deja pedir pantalla completa de verdad (escritorio,
// Android) se pide también, para quitar además la barra del navegador; salir
// de ella con Esc cierra la vista. En iOS no existe para un `<div>` y basta
// con la capa.
window.montarPresentacionCompleta = () => {
    let capa = document.getElementById('modal-presentacion-completa');
    if (capa) return capa;
    capa = document.createElement('div');
    capa.id = 'modal-presentacion-completa';
    capa.innerHTML = `
        <div id="lamina-presentacion-completa" class="presentacion-lamina"></div>
        <div class="presentacion-completa-nav">
            <button type="button" id="btn-completa-anterior" onclick="window.moverSemanaPresentacion(-1)"
                    title="Semana anterior" aria-label="Semana anterior">‹</button>
            <span id="semana-completa"></span>
            <button type="button" id="btn-completa-siguiente" onclick="window.moverSemanaPresentacion(1)"
                    title="Semana siguiente" aria-label="Semana siguiente">›</button>
        </div>
        <button type="button" onclick="window.cerrarPresentacionCompleta()"
                class="ios-boton-icono ios-boton-cerrar presentacion-completa-cerrar"
                title="Salir de pantalla completa" aria-label="Salir de pantalla completa"></button>`;
    document.body.appendChild(capa);
    // Al girar el teléfono cambia todo el marco: se vuelve al tamaño.
    window.addEventListener('resize', window.reiniciarZoomPresentacion);
    window.engancharZoomPresentacion(capa);
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && capa.style.display === 'block') window.cerrarPresentacionCompleta();
    });
    document.addEventListener('keydown', (e) => {
        if (capa.style.display !== 'block') return;
        if (e.key === 'Escape') window.cerrarPresentacionCompleta();
        if (e.key === 'ArrowLeft') { window.moverSemanaPresentacion(-1); }
        if (e.key === 'ArrowRight') { window.moverSemanaPresentacion(1); }
    });
    return capa;
};

window.pintarPresentacionCompleta = () => {
    const capa = document.getElementById('modal-presentacion-completa');
    if (!capa || capa.style.display !== 'block') return;
    const p = window.presentacion;
    document.getElementById('lamina-presentacion-completa').innerHTML =
        window.svgDeDiapositiva(window.diapositivaDePlanta(p.indice));
    const semana = p.semanas[p.indice];
    document.getElementById('semana-completa').innerText =
        window.textoDeSemana(semana).replace('Semana del ', '') + (semana.actual ? ' · en curso' : '');
    document.getElementById('btn-completa-anterior').disabled = p.indice === 0;
    document.getElementById('btn-completa-siguiente').disabled = p.indice === p.semanas.length - 1;
    window.ajustarPresentacionCompleta();
};

// Cuánto se amplía y hacia dónde se ha movido, en píxeles de pantalla desde el
// centro. Se vuelve a 1 al abrir, al cerrar y al girar el teléfono.
window.MAX_ZOOM_PRESENTACION = 5;
window.zoomPresentacion = { escala: 1, x: 0, y: 0 };

// El tamaño que llena la pantalla sin ampliar: el mayor 16:9 que cabe.
window.anchoBasePresentacion = () => {
    const margen = 12;
    const W = window.innerWidth - margen * 2, H = window.innerHeight - margen * 2;
    return Math.min(W, H * window.ANCHO_DIAPOSITIVA / window.ALTO_DIAPOSITIVA);
};

// La lámina no se sale de la pantalla: ampliada sólo se mueve hasta que su
// borde llega al de la pantalla, o se perdería de vista sin manera de traerla.
window.acotarZoomPresentacion = () => {
    const z = window.zoomPresentacion;
    const ancho = window.anchoBasePresentacion() * z.escala;
    const alto = ancho * window.ALTO_DIAPOSITIVA / window.ANCHO_DIAPOSITIVA;
    const mx = Math.max(0, (ancho - window.innerWidth) / 2 + 12);
    const my = Math.max(0, (alto - window.innerHeight) / 2 + 12);
    z.x = Math.max(-mx, Math.min(mx, z.x));
    z.y = Math.max(-my, Math.min(my, z.y));
};

window.ajustarPresentacionCompleta = () => {
    const lamina = document.getElementById('lamina-presentacion-completa');
    if (!lamina) return;
    const z = window.zoomPresentacion;
    window.acotarZoomPresentacion();
    const ancho = window.anchoBasePresentacion() * z.escala;
    lamina.style.width = `${ancho}px`;
    lamina.style.height = `${ancho * window.ALTO_DIAPOSITIVA / window.ANCHO_DIAPOSITIVA}px`;
    lamina.style.left = `calc(50% + ${z.x}px)`;
    lamina.style.top = `calc(50% + ${z.y}px)`;
    const capa = document.getElementById('modal-presentacion-completa');
    if (capa) capa.classList.toggle('esta-ampliada', z.escala > 1.01);
};

// Pone el zoom a `escala` dejando quieto el punto de la pantalla `punto`
// ({x, y} en píxeles de la ventana): lo que está debajo del dedo se queda
// debajo del dedo.
window.ponerZoomPresentacion = (escala, punto) => {
    const z = window.zoomPresentacion;
    const nueva = Math.max(1, Math.min(window.MAX_ZOOM_PRESENTACION, escala));
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const px = punto ? punto.x - cx : 0, py = punto ? punto.y - cy : 0;
    // El punto, en coordenadas de la lámina sin ampliar.
    const ux = (px - z.x) / z.escala, uy = (py - z.y) / z.escala;
    z.escala = nueva;
    z.x = nueva <= 1.01 ? 0 : px - ux * nueva;
    z.y = nueva <= 1.01 ? 0 : py - uy * nueva;
    window.ajustarPresentacionCompleta();
};

window.alternarZoomPresentacion = (punto) => {
    window.ponerZoomPresentacion(window.zoomPresentacion.escala > 1.01 ? 1 : 2.5, punto);
};

window.reiniciarZoomPresentacion = () => {
    window.zoomPresentacion = { escala: 1, x: 0, y: 0 };
    window.ajustarPresentacionCompleta();
};

// Los gestos. **Toque y no puntero**, y el `touchmove` no pasivo: es la única
// manera de parar el desplazamiento del navegador a media pellizcada, igual que
// en el visor y en el gesto de las hojas. El doble click que el teléfono
// sintetiza detrás de un doble toque se descarta, o ampliaría y reduciría en el
// mismo gesto.
window.engancharZoomPresentacion = (capa) => {
    let gesto = null, ultimoToque = 0, ultimoTap = 0, tapEn = null;
    const distancia = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const medio = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    const esBoton = (e) => e.target.closest && e.target.closest('button, .presentacion-completa-nav');

    capa.addEventListener('touchstart', (e) => {
        if (esBoton(e)) return;
        ultimoToque = Date.now();
        const z = window.zoomPresentacion;
        if (e.touches.length === 2) {
            gesto = { tipo: 'pellizco', d0: distancia(e.touches[0], e.touches[1]), e0: z.escala,
                      m0: medio(e.touches[0], e.touches[1]), x0: z.x, y0: z.y };
        } else if (e.touches.length === 1) {
            const t = e.touches[0];
            gesto = { tipo: 'mover', sx: t.clientX, sy: t.clientY, x0: z.x, y0: z.y, movio: false };
        }
    }, { passive: false });

    capa.addEventListener('touchmove', (e) => {
        if (!gesto) return;
        e.preventDefault();
        const z = window.zoomPresentacion;
        if (gesto.tipo === 'pellizco' && e.touches.length === 2) {
            const m = medio(e.touches[0], e.touches[1]);
            const nueva = Math.max(1, Math.min(window.MAX_ZOOM_PRESENTACION,
                gesto.e0 * distancia(e.touches[0], e.touches[1]) / gesto.d0));
            const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
            const ux = (gesto.m0.x - cx - gesto.x0) / gesto.e0, uy = (gesto.m0.y - cy - gesto.y0) / gesto.e0;
            z.escala = nueva;
            z.x = m.x - cx - ux * nueva;
            z.y = m.y - cy - uy * nueva;
            window.ajustarPresentacionCompleta();
        } else if (gesto.tipo === 'mover' && e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - gesto.sx, dy = t.clientY - gesto.sy;
            if (Math.abs(dx) + Math.abs(dy) > 6) gesto.movio = true;
            if (z.escala > 1.01) {
                z.x = gesto.x0 + dx;
                z.y = gesto.y0 + dy;
                window.ajustarPresentacionCompleta();
            }
        }
    }, { passive: false });

    capa.addEventListener('touchend', (e) => {
        if (!gesto) return;
        if (gesto.tipo === 'pellizco') {
            // Al soltar un dedo del pellizco, el otro sigue moviendo.
            if (e.touches.length === 1) {
                const t = e.touches[0], z = window.zoomPresentacion;
                gesto = { tipo: 'mover', sx: t.clientX, sy: t.clientY, x0: z.x, y0: z.y, movio: true };
                return;
            }
            if (window.zoomPresentacion.escala <= 1.01) window.reiniciarZoomPresentacion();
            gesto = null;
            return;
        }
        if (gesto.tipo === 'mover' && !gesto.movio && e.changedTouches.length) {
            const t = e.changedTouches[0];
            const ahora = Date.now();
            if (ahora - ultimoTap < 300 && tapEn && Math.hypot(t.clientX - tapEn.x, t.clientY - tapEn.y) < 40) {
                e.preventDefault();
                window.alternarZoomPresentacion({ x: t.clientX, y: t.clientY });
                ultimoTap = 0;
            } else {
                ultimoTap = ahora;
                tapEn = { x: t.clientX, y: t.clientY };
            }
        }
        gesto = null;
    }, { passive: false });

    // Escritorio: doble click, ctrl/⌘ con la rueda (que es también el pellizco
    // del trackpad) y arrastrar con el ratón.
    capa.addEventListener('dblclick', (e) => {
        if (esBoton(e) || Date.now() - ultimoToque < 800) return;
        window.alternarZoomPresentacion({ x: e.clientX, y: e.clientY });
    });
    capa.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        window.ponerZoomPresentacion(window.zoomPresentacion.escala * Math.exp(-e.deltaY / 200),
            { x: e.clientX, y: e.clientY });
    }, { passive: false });
    let arrastre = null;
    capa.addEventListener('mousedown', (e) => {
        if (esBoton(e) || window.zoomPresentacion.escala <= 1.01) return;
        const z = window.zoomPresentacion;
        arrastre = { sx: e.clientX, sy: e.clientY, x0: z.x, y0: z.y };
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!arrastre) return;
        const z = window.zoomPresentacion;
        z.x = arrastre.x0 + e.clientX - arrastre.sx;
        z.y = arrastre.y0 + e.clientY - arrastre.sy;
        window.ajustarPresentacionCompleta();
    });
    window.addEventListener('mouseup', () => { arrastre = null; });
};

window.abrirPresentacionCompleta = () => {
    if (!window.presentacion.semanas.length) return;
    const capa = window.montarPresentacionCompleta();
    capa.style.display = 'block';
    window.zoomPresentacion = { escala: 1, x: 0, y: 0 };
    window.pintarPresentacionCompleta();
    try {
        if (capa.requestFullscreen && !document.fullscreenElement) capa.requestFullscreen().catch(() => {});
    } catch (e) { /* sin pantalla completa del navegador basta la capa */ }
};

window.cerrarPresentacionCompleta = () => {
    const capa = document.getElementById('modal-presentacion-completa');
    if (capa) capa.style.display = 'none';
    window.zoomPresentacion = { escala: 1, x: 0, y: 0 };
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* nada */ }
};

window.moverSemanaPresentacion = (paso) => {
    const p = window.presentacion;
    const nuevo = p.indice + paso;
    if (nuevo < 0 || nuevo >= p.semanas.length) return;
    p.indice = nuevo;
    window.pintarPresentacion();
};

window.pintarPresentacion = () => {
    const p = window.presentacion;
    const semana = p.semanas[p.indice];
    const caja = document.getElementById('diapositiva-presentacion');
    if (!semana || !caja) return;
    caja.innerHTML = window.svgDeDiapositiva(window.diapositivaDePlanta(p.indice));
    const rotulo = window.textoDeSemana(semana) + (semana.actual ? ' · en curso' : '');
    document.getElementById('semana-presentacion').innerText = rotulo;
    document.getElementById('subtitulo-presentacion').innerText = 'Resultado general de la planta';
    document.getElementById('btn-semana-anterior').disabled = p.indice === 0;
    document.getElementById('btn-semana-siguiente').disabled = p.indice === p.semanas.length - 1;
    window.pintarPresentacionCompleta();
};

// El nombre del archivo va sin acentos: con uno, Chromium descarta el nombre
// entero y guarda «download».
window.descargarPresentacion = async () => {
    const p = window.presentacion;
    const semana = p.semanas[p.indice];
    const btn = document.getElementById('btn-descargar-presentacion');
    const sub = document.getElementById('subtitulo-presentacion');
    if (!semana || (btn && btn.disabled)) return;
    if (btn) btn.disabled = true;
    if (sub) sub.innerText = 'Preparando el PowerPoint…';
    try {
        await window.cargarLibreria(window.LIBRERIA_PRESENTACIONES);
        const pptx = new window.PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.title = `Resultado general de la planta · ${window.textoDeSemana(semana)}`;
        const elementos = window.diapositivaDePlanta(p.indice);
        await window.fotosParaPptx(elementos);
        window.agregarDiapositivaPptx(pptx, elementos);
        const d = semana.inicio;
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await pptx.writeFile({ fileName: `Resultado-planta-semana-${dia}.pptx` });
    } catch (e) {
        alert('No se pudo preparar la presentación: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
        if (sub) sub.innerText = 'Resultado general de la planta';
    }
};
