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
// **La diapositiva se describe una sola vez** (`diapositiva`), como una
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
            porClave[clave] = { clave, nombre: String(f.ev.category || 'General').trim() || 'General', filas: [] };
            grupos.push(porClave[clave]);
        }
        porClave[clave].filas.push(f);
    });

    const clasificaciones = grupos.map(g => {
        const t = window.totalDeEncuestasAdmin(g.filas);
        // Sus encuestas, para la diapositiva de la clasificación: cada una con
        // su cifra, la misma del renglón de la tarjeta.
        const encuestas = g.filas.map(f => ({
            nombre: String(f.ev.title || 'Sin título').trim(), promedio: f.resumen.promedio,
            contestaron: f.resumen.contestaron, total: f.resumen.total
        })).sort((a, b) => (b.promedio === null ? -1 : b.promedio) - (a.promedio === null ? -1 : a.promedio)
            || a.nombre.localeCompare(b.nombre, 'es'));
        return { clave: g.clave, nombre: g.nombre, promedio: t.promedio, contestaron: t.contestaron, total: t.total, encuestas };
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

// Lo que dice una diapositiva de un resultado: la planta entera (`clave`
// vacía) o una clasificación. Las dos se dibujan igual, así que se les da la
// misma forma: la cifra, las respuestas, cuántas encuestas y las filas de la
// columna del centro —las clasificaciones de la planta, o las encuestas de una
// clasificación—. Una clasificación que en ese instante no existía da null.
window.vistaDe = (r, clave) => {
    if (!r) return null;
    if (!clave) {
        return { nombre: 'Resultado de la planta', promedio: r.promedio, contestaron: r.contestaron, total: r.total,
                 encuestas: r.encuestas, filas: r.clasificaciones, rotuloFilas: 'Por clasificación' };
    }
    const c = r.clasificaciones.find(x => x.clave === clave);
    if (!c) return null;
    return { nombre: c.nombre, promedio: c.promedio, contestaron: c.contestaron, total: c.total,
             encuestas: c.encuestas.length, filas: c.encuestas, rotuloFilas: 'Por encuesta' };
};

// Las diapositivas de una semana: la de la planta y detrás una por cada
// clasificación que existía entonces, por nombre —en una presentación el orden
// tiene que ser el mismo todas las semanas, y el de la cifra cambiaría—.
window.diapositivasDeSemana = (i) => {
    const r = window.resultadoDeSemana(i);
    return [{ clave: '' }].concat(r.clasificaciones.slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map(c => ({ clave: c.clave })));
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
window.personasDeSemana = (i, clave) => {
    const r = window.resultadoDeSemana(i);
    r.personas = r.personas || {};
    const k = clave || '';
    if (!r.personas[k]) r.personas[k] = window.desempenoDePersonasEn(window.presentacion.semanas[i].referencia, k);
    return r.personas[k];
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

// El ritmo del eje de la tendencia. La planta va en meses, como la gráfica de
// la tarjeta; una clasificación va **al de su frecuencia mínima**: la encuesta
// que se contesta menos a menudo (`PESO_FRECUENCIA` más bajo) es la que tarda
// más en cerrar un periodo completo, así que con un eje más fino que ése los
// puntos se repetirían o saldrían en dientes de sierra —la mensual vuelve a
// estar sin contestar cada semana—. Las de «única vez» no tienen ritmo y no
// cuentan; sin ninguna periódica, meses.
window.ritmoDeLaTendencia = (clave) => {
    if (!clave) return 'monthly';
    const peso = window.PESO_FRECUENCIA;
    let ritmo = null;
    (window.filasDeLaTarjeta || []).forEach(f => {
        if (window.normalizarClasificacion(f.ev.category || '') !== clave) return;
        const fr = f.ev.frequency || 'once';
        if (fr === 'once' || !(fr in peso)) return;
        if (!ritmo || peso[fr] < peso[ritmo]) ritmo = fr;
    });
    return ritmo || 'monthly';
};

// Cómo se dice en plural el periodo de un ritmo, para el rótulo de la gráfica.
// El tercero dice si es femenino: «Esta semana», «Últimas 12 semanas».
window.PLURAL_DE_PERIODO = {
    weekly: ['semana', 'semanas', true], biweekly: ['quincena', 'quincenas', true], monthly: ['mes', 'meses'],
    quarterly: ['trimestre', 'trimestres'], semiannual: ['semestre', 'semestres'],
    yearly: ['año', 'años'], biennial: ['bienio', 'bienios']
};

// Los periodos de la tendencia de la semana `i`: hasta doce del ritmo que toque,
// terminando en el de esa semana, y **sólo los que tienen resultado** a partir
// del primero que lo tiene. Cada uno es la foto de su cierre —la misma de los
// puntos grandes de la gráfica del panel— y el de la semana que se mira, la de
// su domingo: así el último punto es la cifra grande de la diapositiva.
window.MESES_EN_LA_TENDENCIA = 12;
window.mesesDeLaTendencia = (i, clave) => {
    const p = window.presentacion;
    const semana = p.semanas[i];
    const hasta = semana.referencia;
    const ritmo = window.ritmoDeLaTendencia(clave);
    const periodos = window.periodosDeClasificacion([{ frequency: ritmo }], window.MESES_EN_LA_TENDENCIA, hasta)
        // Un periodo que empieza antes de donde las respuestas están enteras
        // saldría a medias —más bajo de lo que fue—, así que no se dibuja.
        .filter(m => m.inicio instanceof Date && !(p.cubreDesde instanceof Date && m.inicio < p.cubreDesde))
        .reverse()
        .map(m => {
            const ref = (m.referencia && m.referencia < hasta) ? m.referencia : hasta;
            const v = window.vistaDe(window.resultadoEnInstante(ref), clave);
            return { inicio: m.inicio, actual: ref === hasta, valor: v ? v.promedio : null, ritmo };
        });
    const primero = periodos.findIndex(m => m.valor !== null);
    return primero < 0 ? [] : periodos.slice(primero);
};

// El rótulo de un punto del eje: el de la gráfica del panel (`etiquetasDeEje`),
// y en meses el de enero con el año, que es donde cambia.
window.rotuloDePeriodo = (inicio, ritmo) => {
    if (ritmo === 'monthly') {
        return window.MESES_CORTOS[inicio.getMonth()] + (inicio.getMonth() === 0 ? ` ${String(inicio.getFullYear()).slice(2)}` : '');
    }
    return (window.etiquetasDeEje ? window.etiquetasDeEje(inicio, ritmo).corta : '') || window.MESES_CORTOS[inicio.getMonth()];
};

// Los destacados sólo los pide la semana que se está mirando, no la tendencia.
// A cada persona se le pone su promedio de las últimas semanas —sólo las que
// tuvo algo calificado, como la cifra de cada semana—, que es el primer
// desempate.
window.destacadosDeSemana = (i, clave) => {
    const r = window.resultadoDeSemana(i);
    r.destacados = r.destacados || {};
    const llave = clave || '';
    if (!r.destacados[llave]) {
        const historia = {};
        for (let k = Math.max(0, i - window.SEMANAS_DEL_DESEMPATE + 1); k <= i; k++) {
            window.personasDeSemana(k, clave).forEach(p => {
                const id = String(p.emp.id);
                (historia[id] = historia[id] || []).push(p.promedio);
            });
        }
        const personas = window.personasDeSemana(i, clave).map(p => {
            const vals = historia[String(p.emp.id)] || [p.promedio];
            return Object.assign({}, p, {
                promedioReciente: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
                semanasRecientes: vals.length
            });
        });
        r.destacados[llave] = window.destacadosDeLaSemana(personas);
    }
    return r.destacados[llave];
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
// Con `clave`, sólo las encuestas de esa clasificación: el mejor de
// «Seguridad» es el mejor en «Seguridad», no el mejor de la planta.
window.desempenoDePersonasEn = (referencia, clave) => {
    const porPersona = {};
    (window.filasDeLaTarjeta || [])
        .filter(f => window.encuestaExistiaEn(f.ev, referencia))
        .filter(f => !clave || window.normalizarClasificacion(f.ev.category || '') === clave)
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

// El estilo es el de iOS: mucho blanco, la tipografía del sistema, los colores
// del sistema (`COLORES_IOS`) y las tarjetas agrupadas sobre el gris de sus
// listas. La cifra general es un anillo de actividad, como los de Salud, y los
// rótulos de sección van en versalitas grises, como los encabezados de una
// lista de Ajustes. Los cortes de color son los de siempre —80 y 60, los de
// `getColorScore`—, sólo que con los tonos de iOS.
window.COLORES_IOS = {
    texto: '#1C1C1E', secundario: '#8E8E93', terciario: '#AEAEB2', separador: '#E5E5EA',
    agrupado: '#F2F2F7', verde: '#34C759', naranja: '#FF9500', rojo: '#FF3B30', azul: '#007AFF'
};
window.colorIOS = (v) => {
    const c = window.COLORES_IOS;
    if (v === null || v === undefined) return c.terciario;
    return v >= window.UMBRAL_CERTIFICACION ? c.verde : (v >= 60 ? c.naranja : c.rojo);
};
// El mismo color sobre blanco, aclarado: la pista del anillo y el fondo de una
// píldora. Va mezclado a mano y no con transparencia, que PowerPoint no la
// entiende en todas partes.
window.tinteIOS = (hex, cuanto) => {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const mezcla = (c) => Math.round(c + (255 - c) * (cuanto === undefined ? 0.82 : cuanto));
    const r = mezcla(n >> 16), g = mezcla((n >> 8) & 255), b = mezcla(n & 255);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
};

// La de la planta es una diapositiva más, la de la clave vacía.
window.diapositivaDePlanta = (i) => window.diapositiva(i, '');

window.diapositiva = (i, clave, numero, cuantas) => {
    const C = window.COLORES_IOS;
    const semana = window.presentacion.semanas[i];
    const r = window.vistaDe(window.resultadoDeSemana(i), clave)
        || { nombre: '', promedio: null, contestaron: 0, total: 0, encuestas: 0, filas: [], rotuloFilas: '' };
    const anterior = i > 0 ? window.vistaDe(window.resultadoDeSemana(i - 1), clave) : null;
    const color = window.colorIOS;
    const el = [];
    const texto = (x, y, w, h, t, tam, col, extra) =>
        el.push(Object.assign({ tipo: 'texto', x, y, w, h, texto: t, tam, color: col }, extra || {}));
    const rotulo = (x, y, w, t) => texto(x, y, w, 16, t.toUpperCase(), 11, C.secundario, { peso: 600, espaciado: 0.6 });

    el.push({ tipo: 'rect', x: 0, y: 0, w: 960, h: 540, relleno: '#ffffff' });

    // Encabezado: la semana en gris encima y el título grande debajo, como el
    // de una pantalla de iOS. Sin barras ni líneas.
    texto(48, 38, 600, 18, (window.textoDeSemana(semana) + (semana.actual ? ' · en curso' : '')), 14, C.secundario, { peso: 500 });
    texto(48, 58, 700, 44, window.partirEnRenglones(r.nombre, 36, 1)[0], 34, C.texto, { peso: 700 });
    texto(612, 40, 300, 16, 'Panel de Mantenimiento', 12, C.terciario, { alinear: 'right', peso: 500 });

    // Columna 1: el anillo, lo que lo acompaña y la tendencia.
    rotulo(48, 132, 260, clave ? 'Resultado' : 'Resultado general');
    const cx = 128, cy = 232, radio = 64;
    el.push({ tipo: 'anillo', cx, cy, r: radio, grosor: 16,
              proporcion: r.promedio === null ? 0 : r.promedio / 100,
              color: color(r.promedio), pista: window.tinteIOS(r.promedio === null ? C.terciario : color(r.promedio)) });
    texto(cx - 60, cy - 24, 120, 40, r.promedio === null ? '—' : `${r.promedio}%`, 34, C.texto, { peso: 700, alinear: 'center' });
    texto(cx - 60, cy + 14, 120, 16, clave ? 'promedio' : 'general', 12, C.secundario, { alinear: 'center' });

    texto(212, 196, 100, 22, `${r.contestaron}`, 20, C.texto, { peso: 700 });
    texto(212, 218, 100, 14, r.total > 0 ? `de ${r.total} respuestas` : 'respuestas', 11, C.secundario);
    texto(212, 244, 100, 22, `${r.encuestas}`, 20, C.texto, { peso: 700 });
    texto(212, 266, 100, 14, r.encuestas === 1 ? 'encuesta' : 'encuestas', 11, C.secundario);

    if (anterior && anterior.promedio !== null && r.promedio !== null) {
        const d = r.promedio - anterior.promedio;
        const tono = d > 0 ? C.verde : (d < 0 ? C.rojo : C.secundario);
        const t = d === 0 ? 'Igual que la semana anterior'
            : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} ${Math.abs(d) === 1 ? 'punto' : 'puntos'} vs. semana anterior`;
        const ancho = Math.min(260, t.length * 6.4 + 24);
        el.push({ tipo: 'rect', x: 48, y: 318, w: ancho, h: 24, relleno: window.tinteIOS(tono, 0.86), radio: 12 });
        texto(48, 318, ancho, 24, t, 11.5, tono, { peso: 600, alinear: 'center' });
    }

    // La tendencia de los últimos meses —hasta doce, los que tengan resultado—,
    // terminando en el de la semana que se mira. Una línea azul fina y sólo el
    // último punto en grande, con el color de su cifra.
    const tramo = window.mesesDeLaTendencia(i, clave);
    const plural = window.PLURAL_DE_PERIODO[window.ritmoDeLaTendencia(clave)] || ['periodo', 'periodos'];
    rotulo(48, 372, 260, tramo.length === 1 ? `${plural[2] ? 'Esta' : 'Este'} ${plural[0]}`
        : `${plural[2] ? 'Últimas' : 'Últimos'} ${tramo.length} ${plural[1]}`);
    const gx = 56, gw = 244, gy = 398, gh = 70;
    const px = (j) => gx + (tramo.length === 1 ? gw / 2 : gw * j / (tramo.length - 1));
    const py = (v) => gy + gh * (1 - v / 100);
    el.push({ tipo: 'linea', x1: gx, y1: py(window.UMBRAL_CERTIFICACION), x2: gx + gw, y2: py(window.UMBRAL_CERTIFICACION),
              color: window.tinteIOS(C.verde, 0.55), grosor: 1, guiones: true });
    el.push({ tipo: 'linea', x1: gx, y1: gy + gh, x2: gx + gw, y2: gy + gh, color: C.separador, grosor: 1 });
    let previo = null;
    tramo.forEach((t, j) => {
        if (t.valor === null) { previo = null; return; }
        const punto = [px(j), py(t.valor)];
        if (previo) el.push({ tipo: 'linea', x1: previo[0], y1: previo[1], x2: punto[0], y2: punto[1], color: C.azul, grosor: 2 });
        previo = punto;
    });
    // Doce rótulos no caben: con más de seis van alternos, siempre con el del
    // mes que se mira. El de enero lleva el año, que es donde cambia.
    const saltoRotulo = tramo.length > 6 ? 2 : 1;
    tramo.forEach((t, j) => {
        const d = t.inicio;
        const ultimo = j === tramo.length - 1;
        if ((tramo.length - 1 - j) % saltoRotulo === 0) {
            const rot = window.rotuloDePeriodo(d, t.ritmo);
            texto(px(j) - 22, 476, 44, 14, rot, 10, ultimo ? C.texto : C.terciario, { alinear: 'center', peso: ultimo ? 600 : 400 });
        }
        if (t.valor === null) return;
        el.push(ultimo
            ? { tipo: 'circulo', cx: px(j), cy: py(t.valor), r: 5, relleno: color(t.valor), borde: '#ffffff' }
            : { tipo: 'circulo', cx: px(j), cy: py(t.valor), r: 2.2, relleno: C.azul });
    });

    // Columna 2: una fila por clasificación, de la mejor a la peor. El nombre y
    // la cifra en un renglón y debajo una cápsula fina, como las de Tiempo en
    // pantalla; la marca gris de cada cápsula es la meta.
    rotulo(348, 132, 280, r.rotuloFilas);
    // Caben catorce; si hay más, las de abajo se cuentan en un renglón.
    const MAX_FILAS = 14;
    const lista = r.filas.slice(0, MAX_FILAS);
    const sobran = r.filas.length - lista.length;
    const alto = Math.min(44, (sobran > 0 ? 312 : 330) / Math.max(lista.length, 1));
    const tam = Math.max(10, Math.min(13, alto * 0.32));
    const bx = 348, bw = 268;
    // Con muchas filas no caben dos renglones: el nombre, la cápsula y la cifra
    // van en uno.
    const compacta = alto < 30;
    lista.forEach((c, j) => {
        if (compacta) {
            const y = 160 + j * alto, hb = 5, yb = y + alto / 2 - 2.5;
            const nombre = window.partirEnRenglones(c.nombre, Math.floor(138 / (tam * 0.56)), 1)[0];
            texto(bx, y, 140, alto, nombre, tam, C.texto, { peso: 600 });
            el.push({ tipo: 'rect', x: bx + 146, y: yb, w: 76, h: hb, relleno: C.agrupado, radio: 2.5 });
            if (c.promedio !== null && c.promedio > 0) {
                el.push({ tipo: 'rect', x: bx + 146, y: yb, w: Math.max(hb, 76 * c.promedio / 100), h: hb,
                          relleno: color(c.promedio), radio: 2.5 });
            }
            texto(bx + bw - 44, y, 44, alto, c.promedio === null ? '—' : `${c.promedio}%`, tam, color(c.promedio),
                { peso: 700, alinear: 'right' });
            return;
        }
        const y = 160 + j * alto;
        const hb = Math.max(4, Math.min(6, alto * 0.14));
        const yb = y + alto * 0.62;
        const nombre = window.partirEnRenglones(c.nombre, Math.floor(210 / (tam * 0.58)), 1)[0];
        texto(bx, yb - tam * 1.5 - 2, 216, tam * 1.3, nombre, tam, C.texto, { peso: 600 });
        texto(bx + bw - 60, yb - tam * 1.5 - 2, 60, tam * 1.3, c.promedio === null ? '—' : `${c.promedio}%`, tam, color(c.promedio),
            { peso: 700, alinear: 'right' });
        el.push({ tipo: 'rect', x: bx, y: yb, w: bw, h: hb, relleno: C.agrupado, radio: hb / 2 });
        if (c.promedio !== null && c.promedio > 0) {
            el.push({ tipo: 'rect', x: bx, y: yb, w: Math.max(hb, bw * c.promedio / 100), h: hb,
                      relleno: color(c.promedio), radio: hb / 2 });
        }
        const xm = bx + bw * window.UMBRAL_CERTIFICACION / 100;
        el.push({ tipo: 'linea', x1: xm, y1: yb - 2, x2: xm, y2: yb + hb + 2, color: C.terciario, grosor: 1 });
    });
    if (sobran > 0) texto(bx, 160 + lista.length * alto + 2, bw, 16, `y ${sobran} más`, 11, C.secundario);

    // Columna 3: quién destacó, en dos tarjetas agrupadas.
    const { mejor, peor } = window.destacadosDeSemana(i, clave);
    const tarjetaDePersona = (p, y, titulo, acento, vacio) => {
        const x = 660, w = 252, h = 172;
        el.push({ tipo: 'rect', x, y, w, h, relleno: C.agrupado, radio: 18 });
        el.push({ tipo: 'circulo', cx: x + 20, cy: y + 22, r: 4, relleno: acento });
        texto(x + 30, y + 14, w - 46, 16, titulo.toUpperCase(), 11, acento, { peso: 600, espaciado: 0.6 });
        if (!p) {
            vacio.forEach((t, n) => texto(x + 16, y + 48 + n * 18, w - 32, 18, t, 13, C.secundario));
            return;
        }
        const emp = p.emp;
        el.push({ tipo: 'imagen', x: x + 16, y: y + 42, w: 60, h: 60,
                  url: emp.avatar ? window.procesarUrlImagen(emp.avatar) : '',
                  iniciales: window.inicialesDe(emp.name), fondo: '#E5E5EA' });
        let yt = y + 42;
        window.partirEnRenglones(emp.name, 19, 2).forEach(t => {
            texto(x + 88, yt, w - 100, 18, t, 14, C.texto, { peso: 700 });
            yt += 18;
        });
        const depto = String(emp.dept || emp.department || '').trim() || 'Sin departamento';
        const puesto = String(emp.puesto || '').trim() || 'Sin puesto';
        texto(x + 88, yt + 2, w - 100, 15, window.partirEnRenglones(depto, 24, 1)[0], 11.5, C.secundario);
        texto(x + 88, yt + 17, w - 100, 15, window.partirEnRenglones(puesto, 24, 1)[0], 11.5, C.secundario);
        texto(x + 16, y + 116, 90, 40, `${p.promedio}%`, 30, color(p.promedio), { peso: 700 });
        // Hasta cuatro renglones cortos a la derecha de la cifra: lo calificado,
        // la velocidad de respuesta, el promedio de las últimas semanas —que es
        // lo que decide un empate, así que se dice siempre— y con cuántos empató.
        const detalle = [`${p.calificadas}/${p.asignadas} encuestas calificadas`];
        if (p.diasDeRespuesta !== null) detalle.push(`Responde en ${window.textoDeDias(p.diasDeRespuesta)}`);
        if (p.semanasRecientes > 1) detalle.push(`Últimas ${p.semanasRecientes} semanas: ${p.promedioReciente}%`);
        if (p.empates > 0) detalle.push(`Empató con ${p.empates}`);
        const arriba = y + 136 - detalle.length * 13 / 2;
        detalle.forEach((t, n) => texto(x + 108, arriba + n * 13, w - 120, 13, t, 10.5, C.secundario));
    };
    const nadie = ['Todavía nadie tiene', 'resultados calificados.'];
    tarjetaDePersona(mejor, 132, 'Mejor desempeño', C.verde, nadie);
    tarjetaDePersona(peor, 320, 'Menor desempeño', C.rojo,
        mejor ? ['Sólo una persona tiene', 'resultados calificados.'] : nadie);

    // Pie, en el gris más claro.
    const hoy = new Date();
    if (numero) texto(812, 506, 100, 16, `${numero} / ${cuantas}`, 10, C.terciario, { alinear: 'right', peso: 600 });
    texto(48, 506, 760, 16,
        (clave ? 'Cada encuesta pesa según a cuánta gente le toca' : 'Cada clasificación pesa igual') +
        ` · meta ${window.UMBRAL_CERTIFICACION}% · desempeño sobre lo ya calificado · ` +
        `generada el ${hoy.getDate()} ${window.MESES_CORTOS[hoy.getMonth()]} ${hoy.getFullYear()}, ` +
        `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`,
        10, C.terciario);
    return el;
};

// --- DE LA LISTA AL SVG ---
// Cada foto lleva su propio recorte, y los ids no pueden repetirse en el
// documento: la hoja repinta la diapositiva a cada cambio de semana.
window.contadorRecortesDiapositiva = 0;
// La del sistema en un iPhone o una Mac —San Francisco— y la más parecida en
// lo demás. PowerPoint sólo admite un nombre, y va Helvetica Neue: en una Mac
// está, y en Windows PowerPoint la sustituye solo.
window.FUENTE_DIAPOSITIVA = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
window.FUENTE_PPTX = 'Helvetica Neue';
window.svgDeDiapositiva = (elementos) => {
    const esc = window.sanitizeForHTML;
    const partes = elementos.map(e => {
        if (e.tipo === 'rect') return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radio || 0}" fill="${e.relleno}"/>`;
        if (e.tipo === 'linea') return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${e.color}" stroke-width="${e.grosor}"${e.guiones ? ' stroke-dasharray="5 4"' : ''} stroke-linecap="round"/>`;
        if (e.tipo === 'circulo') return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${e.relleno}"${e.borde ? ` stroke="${e.borde}" stroke-width="2"` : ''}/>`;
        if (e.tipo === 'anillo') {
            // La pista entera y encima el arco, con los extremos redondos de los
            // anillos de Salud. Empieza arriba y va en el sentido del reloj.
            const largo = 2 * Math.PI * e.r;
            const p = Math.max(0, Math.min(1, e.proporcion));
            return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="none" stroke="${e.pista}" stroke-width="${e.grosor}"/>`
                + (p > 0 ? `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="none" stroke="${e.color}" stroke-width="${e.grosor}"
                      stroke-linecap="round" stroke-dasharray="${largo * p} ${largo}"
                      transform="rotate(-90 ${e.cx} ${e.cy})"/>` : '');
        }
        if (e.tipo === 'imagen') {
            // Las iniciales van debajo y la foto encima, recortada en círculo:
            // si la foto no carga, el SVG no dibuja nada y quedan las iniciales.
            const id = `recorte-foto-${++window.contadorRecortesDiapositiva}`;
            const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
            return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="${e.fondo}"/>
                <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(e.w * 0.36)}"
                      font-weight="600" fill="#8E8E93">${esc(e.iniciales)}</text>
                ${e.url ? `<image href="${esc(e.url)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"
                      preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : ''}
                <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="#ffffff" stroke-width="2"/>`;
        }
        if (e.tipo === 'texto') {
            const ancla = e.alinear === 'right' ? 'end' : (e.alinear === 'center' ? 'middle' : 'start');
            const x = e.alinear === 'right' ? e.x + e.w : (e.alinear === 'center' ? e.x + e.w / 2 : e.x);
            return `<text x="${x}" y="${e.y + e.h / 2}" text-anchor="${ancla}" dominant-baseline="central"
                          font-size="${e.tam}" font-weight="${e.peso || (e.negrita ? 700 : 400)}"${e.espaciado ? ` letter-spacing="${e.espaciado}"` : ''}
                          fill="${e.color}">${esc(e.texto)}</text>`;
        }
        return '';
    }).join('');
    return `<svg viewBox="0 0 ${window.ANCHO_DIAPOSITIVA} ${window.ALTO_DIAPOSITIVA}" role="img"
                 aria-label="Resultado general de la planta"
                 style="width:100%; height:auto; display:block; font-family:${window.FUENTE_DIAPOSITIVA};">${partes}</svg>`;
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
        } else if (e.tipo === 'anillo') {
            // La pista es un círculo con borde grueso; el arco, un `blockArc`,
            // que PowerPoint mide en grados desde las tres del reloj en el
            // sentido de las agujas: empezar arriba es empezar en 270. Sus
            // extremos no se redondean, así que se les pone un círculo encima.
            const p = Math.max(0, Math.min(1, e.proporcion));
            s.addShape(pptx.ShapeType.ellipse, {
                x: pulg(e.cx - e.r), y: pulg(e.cy - e.r), w: pulg(e.r * 2), h: pulg(e.r * 2),
                fill: { type: 'none' }, line: { color: hex(e.pista), width: e.grosor * 0.75 }
            });
            if (p >= 0.999) {
                s.addShape(pptx.ShapeType.ellipse, {
                    x: pulg(e.cx - e.r), y: pulg(e.cy - e.r), w: pulg(e.r * 2), h: pulg(e.r * 2),
                    fill: { type: 'none' }, line: { color: hex(e.color), width: e.grosor * 0.75 }
                });
            } else if (p > 0) {
                const fuera = e.r + e.grosor / 2;
                s.addShape(pptx.ShapeType.blockArc, {
                    x: pulg(e.cx - fuera), y: pulg(e.cy - fuera), w: pulg(fuera * 2), h: pulg(fuera * 2),
                    fill: { color: hex(e.color) }, line: { color: hex(e.color), width: 0 },
                    angleRange: [270, (270 + 360 * p) % 360], arcThicknessRatio: e.grosor / fuera
                });
                [0, p].forEach(q => {
                    const a = -Math.PI / 2 + 2 * Math.PI * q;
                    const x = e.cx + e.r * Math.cos(a), y = e.cy + e.r * Math.sin(a), rr = e.grosor / 2;
                    s.addShape(pptx.ShapeType.ellipse, {
                        x: pulg(x - rr), y: pulg(y - rr), w: pulg(rr * 2), h: pulg(rr * 2),
                        fill: { color: hex(e.color) }, line: { color: hex(e.color), width: 0 }
                    });
                });
            }
        } else if (e.tipo === 'imagen') {
            s.addShape(pptx.ShapeType.ellipse, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fill: { color: hex(e.fondo) }, line: { color: hex(e.fondo), width: 0 }
            });
            s.addText(e.iniciales, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fontFace: window.FUENTE_PPTX, fontSize: Math.round(e.w * 0.36 * 0.75), color: '8E8E93',
                bold: true, align: 'center', valign: 'middle', margin: 0
            });
            // `datos` lo deja puesto `fotosParaPptx`: la foto ya recortada en
            // círculo. Sin él quedan las iniciales, que es lo que se ve también
            // en la hoja cuando la foto no carga.
            if (e.datos) s.addImage({ data: e.datos, x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h) });
        } else if (e.tipo === 'texto') {
            s.addText(e.texto, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fontFace: window.FUENTE_PPTX, fontSize: Math.round(e.tam * 0.75 * 10) / 10, color: hex(e.color),
                bold: !!e.negrita || (e.peso || 0) >= 600, align: e.alinear || 'left', valign: 'middle', margin: 0,
                charSpacing: e.espaciado ? e.espaciado * 0.75 : undefined
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
                <div id="diapositiva-presentacion" class="presentacion-lista"></div>
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
    window.presentacion = { semanas, indice: semanas.length - 1, resultados: {}, clave: '',
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
        <div id="semana-completa" class="presentacion-semana-flotante">
            <button type="button" id="btn-completa-semana-anterior" onclick="window.moverSemanaPresentacion(-1)"
                    title="Semana anterior" aria-label="Semana anterior">
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none"
                     stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span id="semana-completa-texto"></span>
            <button type="button" id="btn-completa-semana-siguiente" onclick="window.moverSemanaPresentacion(1)"
                    title="Semana siguiente" aria-label="Semana siguiente">
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none"
                     stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>
        <span id="contador-completa" class="presentacion-contador"></span>
        <button type="button" id="btn-completa-anterior" class="presentacion-completa-flecha"
                onclick="window.moverDiapositivaPresentacion(-1)" title="Diapositiva anterior" aria-label="Diapositiva anterior">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none"
                 stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" id="btn-completa-siguiente" class="presentacion-completa-flecha"
                onclick="window.moverDiapositivaPresentacion(1)" title="Diapositiva siguiente" aria-label="Diapositiva siguiente">
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none"
                 stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
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
        // Izquierda y derecha pasan de diapositiva, como en Keynote; arriba y
        // abajo, de semana.
        if (e.key === 'ArrowLeft') window.moverDiapositivaPresentacion(-1);
        if (e.key === 'ArrowRight' || e.key === ' ') window.moverDiapositivaPresentacion(1);
        if (e.key === 'ArrowUp') { e.preventDefault(); window.moverSemanaPresentacion(-1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); window.moverSemanaPresentacion(1); }
    });
    return capa;
};

window.pintarPresentacionCompleta = () => {
    const capa = document.getElementById('modal-presentacion-completa');
    if (!capa || capa.style.display !== 'block') return;
    const p = window.presentacion;
    const mazo = window.diapositivasDeSemana(p.indice);
    const k = Math.max(0, mazo.findIndex(d => d.clave === p.clave));
    p.clave = mazo[k].clave;
    document.getElementById('lamina-presentacion-completa').innerHTML =
        window.svgDeDiapositiva(window.diapositiva(p.indice, p.clave, k + 1, mazo.length));
    document.getElementById('btn-completa-anterior').disabled = k === 0;
    document.getElementById('btn-completa-siguiente').disabled = k === mazo.length - 1;
    document.getElementById('contador-completa').innerText = `${k + 1} / ${mazo.length}`;
    const semana = p.semanas[p.indice];
    const d = semana.inicio;
    document.getElementById('semana-completa-texto').dataset.corto = `${d.getDate()}\n${window.MESES_CORTOS[d.getMonth()]}`;
    document.getElementById('semana-completa-texto').dataset.largo = window.textoDeSemana(semana).replace('Semana del ', '');
    document.getElementById('btn-completa-semana-anterior').disabled = p.indice === 0;
    document.getElementById('btn-completa-semana-siguiente').disabled = p.indice === p.semanas.length - 1;
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
    window.colocarFlechasPresentacion();
};

// Las flechas de semana van **donde no tapan nada**: en el hueco que deja la
// lámina sin ampliar. Con el teléfono de lado —o en un escritorio— sobra a los
// lados y van ahí, a media altura; con el teléfono derecho sobra arriba y
// abajo, y van juntas debajo de la lámina. La fecha no la repiten: la dice la
// propia diapositiva. Ampliada, la lámina puede pasar por debajo, y por eso
// se atenúan (`.esta-ampliada`).
window.colocarFlechasPresentacion = () => {
    const ant = document.getElementById('btn-completa-anterior');
    const sig = document.getElementById('btn-completa-siguiente');
    const semana = document.getElementById('semana-completa');
    const texto = document.getElementById('semana-completa-texto');
    const contador = document.getElementById('contador-completa');
    if (!ant || !sig || !semana) return;
    const lado = 36;
    const W = window.innerWidth, H = window.innerHeight;
    const anchoBase = window.anchoBasePresentacion();
    const altoBase = anchoBase * window.ALTO_DIAPOSITIVA / window.ANCHO_DIAPOSITIVA;
    const libreX = (W - anchoBase) / 2, libreY = (H - altoBase) / 2;
    const arribaLamina = H / 2 - altoBase / 2;
    if (libreX >= lado + 12 || libreY < lado + 24) {
        // De lado: las flechas de diapositiva a media altura, el contador
        // debajo de la de la derecha y la semana arriba a la izquierda, de pie.
        const x = Math.max(6, libreX / 2 - lado / 2);
        const y = H / 2 - lado / 2;
        Object.assign(ant.style, { left: `${x}px`, top: `${y}px` });
        Object.assign(sig.style, { left: `${W - x - lado}px`, top: `${y}px` });
        Object.assign(contador.style, { left: `${W - libreX / 2 - 24}px`, top: `${y + lado + 8}px`, width: '48px' });
        semana.classList.add('vertical');
        texto.innerText = texto.dataset.corto || '';
        Object.assign(semana.style, { left: `${Math.max(6, libreX / 2 - 20)}px`, top: `${Math.max(12, arribaLamina)}px`,
                                      transform: 'none' });
    } else {
        // Derecho: los controles se van a los bordes, que ahí sobra alto y la
        // lámina se queda sola en el centro. La semana arriba, a la altura de
        // la cruz; las flechas de diapositiva y el contador abajo, apartados del
        // indicador de inicio. Pegados a la lámina se leían como parte de ella.
        const abajo = `calc(100% - ${lado + 20}px - env(safe-area-inset-bottom))`;
        Object.assign(ant.style, { left: `${W / 2 - lado - 34}px`, top: abajo });
        Object.assign(sig.style, { left: `${W / 2 + 34}px`, top: abajo });
        Object.assign(contador.style, { left: `${W / 2 - 24}px`, width: '48px',
                                        top: `calc(100% - ${lado / 2 + 28}px - env(safe-area-inset-bottom))` });
        semana.classList.remove('vertical');
        texto.innerText = texto.dataset.largo || '';
        Object.assign(semana.style, { left: '50%', top: 'calc(12px + env(safe-area-inset-top))',
                                      transform: 'translateX(-50%)' });
    }
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
    const esBoton = (e) => e.target.closest && e.target.closest('button');

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
            gesto.dx = dx; gesto.dy = dy;
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
        // Sin zoom, deslizar de lado pasa de diapositiva, como en Fotos.
        if (gesto.tipo === 'mover' && gesto.movio && window.zoomPresentacion.escala <= 1.01
            && Math.abs(gesto.dx || 0) > 60 && Math.abs(gesto.dx) > 1.5 * Math.abs(gesto.dy || 0)) {
            window.moverDiapositivaPresentacion(gesto.dx < 0 ? 1 : -1);
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

// `k` es la diapositiva de la semana por la que se entra; sin él, la que se
// estuviera mirando.
window.abrirPresentacionCompleta = (k) => {
    const p = window.presentacion;
    if (!p.semanas.length) return;
    if (typeof k === 'number') {
        const mazo = window.diapositivasDeSemana(p.indice);
        if (mazo[k]) p.clave = mazo[k].clave;
    }
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

window.moverDiapositivaPresentacion = (paso) => {
    const p = window.presentacion;
    const mazo = window.diapositivasDeSemana(p.indice);
    const k = Math.max(0, mazo.findIndex(d => d.clave === p.clave)) + paso;
    if (k < 0 || k >= mazo.length) return;
    p.clave = mazo[k].clave;
    window.pintarPresentacionCompleta();
};

// Al cambiar de semana se queda en la misma clasificación; si en esa semana
// no existía, vuelve a la de la planta (`pintarPresentacionCompleta`).
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
    // En la hoja van todas, una debajo de otra; tocar una la abre a pantalla
    // completa, que es donde se pasa de una a otra.
    const mazo = window.diapositivasDeSemana(p.indice);
    caja.innerHTML = mazo.map((d, k) => `
        <div class="presentacion-diapositiva" role="button" tabindex="0" title="Ver en pantalla completa"
             onclick="window.abrirPresentacionCompleta(${k})">
            ${window.svgDeDiapositiva(window.diapositiva(p.indice, d.clave, k + 1, mazo.length))}
        </div>`).join('');
    const rotulo = window.textoDeSemana(semana) + (semana.actual ? ' · en curso' : '');
    document.getElementById('semana-presentacion').innerText = rotulo;
    document.getElementById('subtitulo-presentacion').innerText =
        `La planta y ${mazo.length - 1} ${mazo.length - 1 === 1 ? 'clasificación' : 'clasificaciones'}`;
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
        pptx.title = `Resultado de la planta · ${window.textoDeSemana(semana)}`;
        // Todas las de la semana, en el orden de la hoja.
        const mazo = window.diapositivasDeSemana(p.indice);
        const hojas = mazo.map((d, k) => window.diapositiva(p.indice, d.clave, k + 1, mazo.length));
        await window.fotosParaPptx([].concat(...hojas));
        hojas.forEach(elementos => window.agregarDiapositivaPptx(pptx, elementos));
        const d = semana.inicio;
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        await pptx.writeFile({ fileName: `Resultado-planta-semana-${dia}.pptx` });
    } catch (e) {
        alert('No se pudo preparar la presentación: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
        if (sub) window.pintarPresentacion();
    }
};
