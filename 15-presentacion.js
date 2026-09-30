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
//     El mejor sale de quien tiene algo calificado; el menor desempeño, también
//     de quien no contestó nada, que es el peor resultado posible.
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
// tiene que ser el mismo todas las semanas, y el de la cifra cambiaría—. Detrás
// de cada clasificación, si esa semana dejó fotos de evidencia, va la de sus
// evidencias. Cada una lleva su `id`, que es por lo que se sabe cuál se está
// mirando: la clasificación y sus evidencias comparten `clave`.
window.diapositivasDeSemana = (i) => {
    const r = window.resultadoDeSemana(i);
    const fotos = window.evidenciasDeSemana(i);
    const mazo = [{ id: '', clave: '' }];
    r.clasificaciones.slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .forEach(c => {
            mazo.push({ id: c.clave, clave: c.clave });
            if (fotos && fotos[c.clave] && fotos[c.clave].length) {
                mazo.push({ id: `evidencias:${c.clave}`, clave: c.clave, evidencias: true });
            }
        });
    return mazo;
};

// La diapositiva que toca a una entrada del mazo.
window.laminaDe = (i, d, numero, cuantas) => d.evidencias
    ? window.diapositivaDeEvidencias(i, d.clave, numero, cuantas)
    : window.diapositiva(i, d.clave, numero, cuantas);

// --- LAS EVIDENCIAS DE LA SEMANA ---
//
// Las fotos que dejaron las preguntas de evidencia fotográfica en la semana que
// se mira, por clasificación. No vienen con las respuestas de la tarjeta —ésas
// se piden sin `answers_json`, que es lo que más pesa de una fila—, así que se
// piden aparte y **sólo las de la semana que se mira**, cuando se mira: son las
// encuestas que tienen alguna pregunta de foto y las respuestas de esos siete
// días. Mientras llegan, la semana se enseña sin ellas y se repinta al llegar.
//
// Ante cualquier problema no hay diapositiva de evidencias, y no se guarda:
// la siguiente vez que se mire esa semana se vuelve a intentar.
window.MAX_EVIDENCIAS_POR_DIAPOSITIVA = 8;
window.MAX_RESPUESTAS_EVIDENCIA = 500;
let promesaPreguntasDeFoto = null;
window.preguntasDeFotoDeLaPresentacion = () => {
    if (!promesaPreguntasDeFoto) {
        promesaPreguntasDeFoto = sb.from('evaluation_questions')
            .select('id, evaluation_id, question_text, question_type')
            .eq('question_type', window.TIPO_PREGUNTA_FOTO)
            .then(({ data, error }) => { if (error) throw error; return data || []; })
            .catch(() => { promesaPreguntasDeFoto = null; return null; });
    }
    return promesaPreguntasDeFoto;
};

// Lo que ya llegó de una semana, `{ clave: [foto, …] }`, o null mientras no.
window.evidenciasDeSemana = (i) => {
    const p = window.presentacion;
    return (p.evidencias && p.evidencias[i]) || null;
};

window.cargarEvidenciasDeSemana = (i) => {
    const p = window.presentacion;
    p.evidencias = p.evidencias || {};
    p.promesasEvidencias = p.promesasEvidencias || {};
    if (p.evidencias[i]) return Promise.resolve(p.evidencias[i]);
    if (p.promesasEvidencias[i]) return p.promesasEvidencias[i];
    const semana = p.semanas[i];
    const promesa = (async () => {
        try {
            const encuestas = new Map((window.filasDeLaTarjeta || []).map(f => [String(f.ev.id), f.ev]));
            const preguntas = await window.preguntasDeFotoDeLaPresentacion();
            if (!preguntas) return null;
            const porEncuesta = {};
            preguntas.filter(q => encuestas.has(String(q.evaluation_id))).forEach(q => {
                (porEncuesta[q.evaluation_id] = porEncuesta[q.evaluation_id] || []).push(q);
            });
            const ids = Object.keys(porEncuesta);
            const resultado = {};
            if (ids.length) {
                const hasta = semana.actual ? new Date() : semana.fin;
                const { data, error } = await sb.from('evaluation_responses')
                    .select('id, evaluation_id, employee_id, submitted_at, review_status, grades_json, employee_area, answers_json')
                    .in('evaluation_id', ids)
                    .gte('submitted_at', semana.inicio.toISOString())
                    .lt('submitted_at', hasta.toISOString())
                    .order('submitted_at', { ascending: false })
                    .limit(window.MAX_RESPUESTAS_EVIDENCIA);
                if (error || !data) return null;
                const plantilla = window.todosLosEmpleadosData || [];
                data.forEach(r => {
                    // Una respuesta anulada también entra: su foto es justo lo
                    // que hay que ver para entender por qué se anuló. Va con su
                    // píldora de «Anulada» en vez del resultado.
                    const anulada = r.review_status === 'Falsa';
                    const ev = encuestas.get(String(r.evaluation_id));
                    let respuestas = r.answers_json;
                    if (typeof respuestas === 'string') { try { respuestas = JSON.parse(respuestas); } catch (e) { respuestas = null; } }
                    if (!ev || !respuestas) return;
                    const emp = plantilla.find(e => String(e.id) === String(r.employee_id));
                    const clave = window.normalizarClasificacion(ev.category || '');
                    // Dónde se tomó y cómo salió: el área es la que guardó la
                    // respuesta ese día —la de la ficha sólo si no la trae—, el
                    // departamento el de hoy, y el resultado el de la respuesta
                    // entera, con la misma regla que el resto de la presentación.
                    const guardada = String(r.employee_area || '').trim();
                    const deFicha = emp && window.areaDeEmpleado ? window.areaDeEmpleado(emp) : '';
                    const area = (guardada && guardada !== 'Sin Área') ? guardada
                        : (deFicha && deFicha !== 'Sin Área' ? deFicha : '');
                    const depto = emp && window.deptDeEmpleado ? window.deptDeEmpleado(emp) : '';
                    const puntaje = window.puntajeDeRespuesta(r);
                    porEncuesta[r.evaluation_id].forEach(q => {
                        const url = respuestas[q.id];
                        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return;
                        (resultado[clave] = resultado[clave] || []).push({
                            url, pregunta: String(q.question_text || '').trim() || String(ev.title || '').trim(),
                            encuesta: String(ev.title || '').trim(),
                            respuesta: r.id, empleado: String(r.employee_id), nombre: emp ? emp.name : '',
                            fecha: new Date(r.submitted_at),
                            area, departamento: depto === 'Sin Departamento' ? '' : depto,
                            puntaje: !anulada && typeof puntaje === 'number' && !isNaN(puntaje) ? puntaje : null,
                            anulada
                        });
                    });
                });
            }
            p.evidencias[i] = resultado;
            return resultado;
        } catch (e) {
            return null;
        } finally {
            delete p.promesasEvidencias[i];
        }
    })();
    p.promesasEvidencias[i] = promesa;
    return promesa;
};

// Cuáles caben en la diapositiva: de la más reciente a la más vieja, pero
// **una por persona antes de repetir a nadie** —ocho fotos del mismo turno
// dicen menos del área que ocho turnos distintos—.
window.evidenciasParaDiapositiva = (fotos, cuantas) => {
    const vistas = new Set();
    const primero = [], despues = [];
    fotos.forEach(f => {
        if (vistas.has(f.empleado)) despues.push(f);
        else { vistas.add(f.empleado); primero.push(f); }
    });
    return primero.concat(despues).slice(0, cuantas);
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
            return { inicio: m.inicio, ref, actual: ref === hasta, valor: v ? v.promedio : null, ritmo };
        });
    const primero = periodos.findIndex(m => m.valor !== null);
    return primero < 0 ? [] : periodos.slice(primero);
};

// Las semanas que caen entre dos periodos de la tendencia, cada una con el
// resultado de su cierre: son los puntos pequeños de la gráfica de la tarjeta
// del panel, y dibujan los mismos dientes de sierra —al empezar el mes las
// mensuales vuelven a estar sin contestar—. Cada una se coloca por su fecha
// entre los dos periodos que la encierran; las de antes del primero no tienen
// dónde ir y la que se mira ya es el último punto. Con el eje en semanas no hay
// nada entre punto y punto.
window.puntosSemanalesDeLaTendencia = (i, clave, tramo, px) => {
    const p = window.presentacion;
    if (tramo.length < 2 || tramo[0].ritmo === 'weekly') return [];
    const salida = [];
    for (let k = 0; k < i; k++) {
        const r = p.semanas[k].referencia;
        const j = tramo.findIndex((t, n) => n > 0 && r > tramo[n - 1].ref && r < t.ref);
        if (j < 0) continue;
        const a = tramo[j - 1].ref.getTime(), b = tramo[j].ref.getTime();
        const v = window.vistaDe(window.resultadoDeSemana(k), clave);
        if (!v || v.promedio === null) continue;
        salida.push({ x: px(j - 1) + (px(j) - px(j - 1)) * (r.getTime() - a) / (b - a), valor: v.promedio });
    }
    return salida;
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
// A cada persona se le pone su promedio de las últimas semanas —las que tuvo
// algo asignado, con el cero de las que no contestó—, que es el primer
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
// **Entra también quien no contestó nada**, con un cero: no participar es el
// peor resultado posible, y dejarlo fuera ponía de «menor desempeño» a alguien
// al 100% mientras otros ni la habían abierto. Lo que no entra es lo contestado
// y sin calificar, como en todas partes: su cero sería el atraso del revisor,
// así que quien sólo tiene eso se queda sin promedio. El mejor, en cambio, sale
// sólo de quien tiene algo calificado (`destacadosDeLaSemana`).
// Con `clave`, sólo las encuestas de esa clasificación: el mejor de
// «Seguridad» es el mejor en «Seguridad», no el mejor de la planta.
//
// **Y a quien revisa le cuenta lo que deja sin calificar** (`atrasoDeRevision`),
// pero sólo en contra: calificar es su trabajo y no un mérito, así que tenerlo
// todo al día no le suma nada; tener respuestas esperándolo sí le resta. Entra
// como una clasificación más de su promedio —la parte de lo que le tocaba
// calificar que sí calificó— y sólo cuando hay atraso.
window.desempenoDePersonasEn = (referencia, clave) => {
    const porPersona = {};
    const nueva = (emp) => ({ emp, filas: [], asignadas: 0, contestadas: 0, calificadas: 0, terminoEn: 0,
                              sumaDias: 0, conDias: 0, porCalificar: 0, debioCalificar: 0 });
    const filasEnJuego = (window.filasDeLaTarjeta || [])
        .filter(f => window.encuestaExistiaEn(f.ev, referencia))
        .filter(f => !clave || window.normalizarClasificacion(f.ev.category || '') === clave);
    filasEnJuego
        .forEach(f => {
            const padron = (window.padronesDeLaTarjeta || {})[f.ev.id] || window.padronDeLaEncuesta(f.ev);
            const ultimas = window.ultimaDeCadaUnoEnPeriodo(f.ev, window.respuestasParaPresentar(), referencia);
            padron.forEach(emp => {
                const id = String(emp.id);
                const p = porPersona[id] || (porPersona[id] = nueva(emp));
                p.asignadas++;
                const r = ultimas[id];
                if (!r) { p.filas.push({ ev: f.ev, puntaje: 0 }); return; }
                p.contestadas++;
                // Cuándo terminó: la más tardía de las respuestas que cuentan.
                const enviada = new Date(r.submitted_at).getTime();
                if (!isNaN(enviada) && enviada > p.terminoEn) p.terminoEn = enviada;
                const puntaje = window.puntajeDeRespuesta(r);
                if (puntaje === null) return;
                p.calificadas++;
                p.filas.push({ ev: f.ev, puntaje });
            });
        });
    // Cuánto tarda en resolver un pendiente, **últimamente**: cada respuesta
    // enviada en las últimas `SEMANAS_DEL_DESEMPATE` semanas, desde que esa
    // encuesta le apareció como pendiente hasta que la contestó —la misma
    // medida que «Prontitud» en las estadísticas (`origenDelPendiente`)—.
    // No sale de `ultimas`: ahí una de «única vez» trae la respuesta de hace
    // meses, y su retraso de entonces se quedaba pegado a la cifra para siempre.
    const hasta = new Date(referencia).getTime();
    const desde = hasta - window.SEMANAS_DEL_DESEMPATE * 7 * 86400000;
    const recientes = (window.respuestasPropias || (x => x))(window.respuestasParaPresentar() || [])
        .filter(r => { const t = new Date(r.submitted_at).getTime(); return t > desde && t <= hasta; });
    filasEnJuego.forEach(f => {
        if (!window.origenDelPendiente) return;
        recientes.forEach(r => {
            if (String(r.evaluation_id) !== String(f.ev.id)) return;
            const p = porPersona[String(r.employee_id)];
            if (!p) return;
            const enviada = new Date(r.submitted_at);
            const marca = window.origenDelPendiente(f.ev.frequency, window.inicioDeEncuesta(f.ev), p.emp, enviada);
            if (!marca || !marca.origen) return;
            p.sumaDias += Math.max(0, enviada.getTime() - marca.origen.getTime()) / 86400000;
            p.conDias++;
        });
    });
    const atraso = window.atrasoDeRevision(filasEnJuego.map(f => f.ev), referencia);
    Object.keys(atraso).forEach(id => {
        const a = atraso[id];
        if (a.pendientes === 0) return;
        const p = porPersona[id] || (porPersona[id] = nueva(a.emp));
        p.porCalificar = a.pendientes;
        p.debioCalificar = a.debidas;
        p.filas.push({ ev: { category: window.CLASIFICACION_DE_REVISION },
                       puntaje: Math.round(100 * (a.debidas - a.pendientes) / a.debidas) });
    });
    return Object.values(porPersona)
        .map(p => Object.assign(p, {
            promedio: window.promedioPorClasificacion(p.filas),
            diasDeRespuesta: p.conDias ? p.sumaDias / p.conDias : null
        }))
        .filter(p => p.promedio !== null);
};

// Lo que cada revisor tenía por calificar en un instante: las respuestas de
// esas encuestas que le tocan (`revisoresDeLaRespuesta`, o su jefe inmediato si
// la encuesta no nombra a nadie, que es la regla de `leTocaRevisar`), enviadas
// hace más de `DIAS_PARA_CALIFICAR` y todavía sin calificar entonces —«Pendiente»
// o «Mal Revisada» hoy, o calificadas después de ese instante si la base guarda
// cuándo (`reviewed_at`)—. Lo que se calificó solo o se anuló no se le pedía a
// nadie y queda fuera. Los plazos de gracia existen para no acusar a nadie de
// lo que acaba de llegar.
window.DIAS_PARA_CALIFICAR = 7;
window.CLASIFICACION_DE_REVISION = '__revision_de_respuestas__';
window.atrasoDeRevision = (encuestas, referencia) => {
    const porId = {};
    (encuestas || []).forEach(ev => { porId[String(ev.id)] = ev; });
    const limite = referencia.getTime() - window.DIAS_PARA_CALIFICAR * 86400000;
    const plantilla = {};
    (window.todosLosEmpleadosData || []).forEach(e => { plantilla[String(e.id)] = e; });
    const salida = {};
    (window.respuestasParaPresentar() || []).forEach(r => {
        const ev = porId[String(r.evaluation_id)];
        if (!ev) return;
        const enviada = new Date(r.submitted_at).getTime();
        if (isNaN(enviada) || enviada > limite) return;
        if (r.review_status === 'Falsa') return;
        const revisadaDespues = r.reviewed_at && new Date(r.reviewed_at).getTime() > referencia.getTime();
        const pendiente = r.review_status === 'Pendiente' || r.review_status === 'Mal Revisada' || revisadaDespues;
        if (!pendiente && window.selloDeRevision(r).estado === 'sola') return;
        let responsables = window.revisoresDeLaRespuesta(ev, r.employee_id);
        if (responsables.length === 0) {
            const quien = plantilla[String(r.employee_id)];
            responsables = quien && quien.supId ? [String(quien.supId)] : [];
        }
        responsables.forEach(id => {
            const emp = plantilla[String(id)];
            if (!emp || !window.empleadoActivo(emp)) return;
            const a = salida[String(id)] || (salida[String(id)] = { emp, debidas: 0, pendientes: 0 });
            a.debidas++;
            if (pendiente) a.pendientes++;
        });
    });
    return salida;
};

// El mejor y el peor, y con cuántos empataron esa semana. El empate se
// deshace en este orden, que es el mismo para los dos, al revés:
//
//   1. El promedio de las últimas cuatro semanas (`promedioReciente`): quien
//      sostiene el resultado semana tras semana va delante de quien lo tuvo una.
//      Entre quienes no contestaron nada, va delante quien tampoco contestó
//      las semanas anteriores.
//   2. Cuántas encuestas tiene calificadas: un 100% sobre nueve dice más que
//      sobre dos. Para el peor, cuántas dejó sin contestar.
//   3. Quién terminó antes de contestar la semana. Para el peor, quién después.
//   4. El nombre, sólo para que el resultado no dependa del orden de la consulta.
//
// El mejor sólo puede salir de quien tiene algo calificado; el peor, de
// cualquiera —también de quien no contestó nada—, menos del propio mejor. Sin
// nadie calificado no hay ninguno de los dos: no hay contra qué comparar.
window.destacadosDeLaSemana = (todas) => {
    const personas = todas.filter(p => p.calificadas > 0);
    if (!personas.length) return { mejor: null, peor: null };
    const nombre = (p) => String(p.emp.name || '');
    const reciente = (p) => p.promedioReciente === undefined ? p.promedio : p.promedioReciente;
    const mejores = personas.slice().sort((a, b) => b.promedio - a.promedio
        || reciente(b) - reciente(a)
        || b.calificadas - a.calificadas
        || (a.terminoEn || 0) - (b.terminoEn || 0)
        || nombre(a).localeCompare(nombre(b), 'es'));
    const peores = todas.slice().sort((a, b) => a.promedio - b.promedio
        || reciente(a) - reciente(b)
        || (b.asignadas - b.contestadas) - (a.asignadas - a.contestadas)
        || (b.terminoEn || 0) - (a.terminoEn || 0)
        || nombre(a).localeCompare(nombre(b), 'es'));
    const mejor = mejores[0];
    const empates = (p, grupo) => grupo.filter(q => q !== p && q.promedio === p.promedio).length;
    const peor = peores.find(p => p !== mejor) || null;
    return {
        mejor: Object.assign({ empates: empates(mejor, personas) }, mejor),
        peor: peor ? Object.assign({ empates: empates(peor, todas) }, peor) : null
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
    // terminando en el de la semana que se mira. Se dibuja igual que la gráfica
    // de la tarjeta del panel (`graficaDeLinea`): la escala 0 / 50 / 100, cada
    // periodo con un punto del color de su cifra y, entre periodo y periodo,
    // cada semana en pequeño (`puntosSemanalesDeLaTendencia`), con la línea
    // pasando por todos. El último punto es la cifra grande de la diapositiva.
    const tramo = window.mesesDeLaTendencia(i, clave);
    const plural = window.PLURAL_DE_PERIODO[window.ritmoDeLaTendencia(clave)] || ['periodo', 'periodos'];
    rotulo(48, 372, 260, tramo.length === 1 ? `${plural[2] ? 'Esta' : 'Este'} ${plural[0]}`
        : `${plural[2] ? 'Últimas' : 'Últimos'} ${tramo.length} ${plural[1]}`);
    const gx = 72, gw = 228, gy = 398, gh = 70;
    const px = (j) => gx + (tramo.length === 1 ? gw / 2 : gw * j / (tramo.length - 1));
    const py = (v) => gy + gh * (1 - v / 100);
    [0, 50, 100].forEach(v => {
        el.push({ tipo: 'linea', x1: gx, y1: py(v), x2: gx + gw, y2: py(v), color: v === 0 ? C.separador : C.agrupado, grosor: 1 });
        texto(gx - 30, py(v) - 7, 24, 14, String(v), 9, C.terciario, { alinear: 'right' });
    });
    el.push({ tipo: 'linea', x1: gx, y1: py(window.UMBRAL_CERTIFICACION), x2: gx + gw, y2: py(window.UMBRAL_CERTIFICACION),
              color: window.tinteIOS(C.verde, 0.55), grosor: 1, guiones: true });
    const semanales = window.puntosSemanalesDeLaTendencia(i, clave, tramo, px);
    // La línea pasa por los periodos y las semanas, ordenados por su sitio en
    // el eje; un periodo sin resultado la corta, como en la tarjeta.
    const recorrido = tramo.map((t, j) => ({ x: px(j), valor: t.valor }))
        .concat(semanales)
        .sort((a, b) => a.x - b.x);
    let previo = null;
    recorrido.forEach(q => {
        if (q.valor === null) { previo = null; return; }
        const punto = [q.x, py(q.valor)];
        if (previo) el.push({ tipo: 'linea', x1: previo[0], y1: previo[1], x2: punto[0], y2: punto[1], color: C.azul, grosor: 2 });
        previo = punto;
    });
    semanales.forEach(q => el.push({ tipo: 'circulo', cx: q.x, cy: py(q.valor), r: 2, relleno: color(q.valor) }));
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
        el.push({ tipo: 'circulo', cx: px(j), cy: py(t.valor), r: ultimo ? 5 : 3.6, relleno: color(t.valor), borde: '#ffffff' });
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

    // Lo que queda debajo de las filas, en la de una clasificación, se llena
    // con la foto de evidencia más reciente de la semana: con pocas encuestas
    // la columna se quedaba casi vacía. Sólo si cabe una foto que se lea.
    if (clave) {
        const fotos = ((window.evidenciasDeSemana(i) || {})[clave]) || [];
        const f = window.evidenciasParaDiapositiva(fotos, 1)[0];
        const desde = 160 + lista.length * alto + (sobran > 0 ? 20 : 0) + 20;
        const hf = Math.min(Math.round(bw * 3 / 4), 494 - desde - 16 - 36);
        if (f && hf >= 96) {
            rotulo(bx, desde, bw, 'Evidencia de la semana');
            const yf = desde + 22;
            window.fotoDeEvidenciaEnDiapositiva(el, f, bx, yf, bw, hf);
        }
    }

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
        // Quien no contestó nada lo dice con esas palabras: «0/5 calificadas»
        // se leería como un atraso del revisor.
        const detalle = [];
        if (p.asignadas > 0) detalle.push(p.contestadas === 0
            ? (p.asignadas === 1 ? 'No contestó su encuesta' : `No contestó ninguna de ${p.asignadas}`)
            : `${p.calificadas}/${p.asignadas} encuestas calificadas`);
        // Lo que tiene sin calificar como revisor, que es lo que le baja la cifra.
        if (p.porCalificar > 0) detalle.push(`${p.porCalificar} ${p.porCalificar === 1 ? 'respuesta' : 'respuestas'} sin calificar`);
        if (p.diasDeRespuesta !== null) detalle.push(`Resuelve en ${window.textoDeDias(p.diasDeRespuesta)}`);
        if (p.semanasRecientes > 1) detalle.push(`Últimas ${p.semanasRecientes} semanas: ${p.promedioReciente}%`);
        if (p.empates > 0) detalle.push(`Empató con ${p.empates}`);
        detalle.length = Math.min(detalle.length, 4);
        const arriba = y + 136 - detalle.length * 13 / 2;
        detalle.forEach((t, n) => texto(x + 108, arriba + n * 13, w - 120, 13, t, 10.5, C.secundario));
    };
    const nadie = ['Todavía nadie tiene', 'resultados calificados.'];
    tarjetaDePersona(mejor, 132, 'Mejor desempeño', C.verde, nadie);
    tarjetaDePersona(peor, 320, 'Menor desempeño', C.rojo,
        mejor ? ['Sólo una persona tiene', 'encuestas asignadas.'] : nadie);

    // Pie, en el gris más claro.
    const hoy = new Date();
    if (numero) texto(812, 506, 100, 16, `${numero} / ${cuantas}`, 10, C.terciario, { alinear: 'right', peso: 600 });
    texto(48, 506, 760, 16,
        (clave ? 'Cada encuesta pesa según a cuánta gente le toca' : 'Cada clasificación pesa igual') +
        ` · meta ${window.UMBRAL_CERTIFICACION}% · lo no contestado cuenta como cero · ` +
        `generada el ${hoy.getDate()} ${window.MESES_CORTOS[hoy.getMonth()]} ${hoy.getFullYear()}, ` +
        `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`,
        10, C.terciario);
    return el;
};

// Una foto de evidencia con lo que la acompaña: el resultado en una píldora de
// color macizo sobre su esquina —debajo puede haber cualquier cosa, y un tinte
// claro no se lee— y debajo, lo que se pedía (con `conPregunta`), el área y el
// departamento, y quién y cuándo. La usan la diapositiva de evidencias y el
// hueco de la de una clasificación, que así no pueden decir cosas distintas.
window.fotoDeEvidenciaEnDiapositiva = (el, f, x, y, w, h, conPregunta) => {
    const C = window.COLORES_IOS;
    const meses = window.MESES_CORTOS;
    const texto = (tx, ty, tw, th, t, tam, col, extra) =>
        el.push(Object.assign({ tipo: 'texto', x: tx, y: ty, w: tw, h: th, texto: t, tam, color: col }, extra || {}));
    el.push({ tipo: 'foto', x, y, w, h, radio: 12, url: window.procesarUrlImagen(f.url), fondo: C.agrupado });
    const letras = Math.floor(w / 6);
    let yt = y + h + 6;
    if (conPregunta) {
        texto(x + 2, yt, w - 4, 16, window.partirEnRenglones(f.pregunta, letras, 1)[0], 12, C.texto, { peso: 600 });
        yt += 17;
    }
    const quien = String(f.nombre || '').trim() || 'Sin nombre';
    const cuando = isNaN(f.fecha) ? '' : ` · ${f.fecha.getDate()} ${meses[f.fecha.getMonth()]}`;
    const donde = [f.area, f.departamento].filter(Boolean).join(' · ') || 'Sin área';
    texto(x + 2, yt, w - 4, 14, window.partirEnRenglones(donde, letras + 4, 1)[0], 10.5, C.texto);
    texto(x + 2, yt + 16, w - 4, 14,
        window.partirEnRenglones(quien, Math.max(8, letras + 4 - cuando.length), 1)[0] + cuando, 10.5, C.secundario);

    const rotulo = f.anulada ? 'Anulada'
        : (f.puntaje === null ? 'Sin calificar' : `${window.pctTexto(f.puntaje / 100)}%`);
    const tam = 11;
    const pw = Math.ceil(rotulo.length * tam * 0.62) + 16, ph = 20;
    const px = x + w - pw - 8, py = y + 8;
    el.push({ tipo: 'rect', x: px, y: py, w: pw, h: ph, radio: ph / 2, relleno: f.anulada ? C.texto : window.colorIOS(f.puntaje) });
    texto(px, py, pw, ph, rotulo, tam, '#ffffff', { alinear: 'center', peso: 700 });

    // Encima de todo, la foto con su pie como un solo blanco del dedo: el
    // administrador lo mantiene pulsado para abrir la respuesta. Sólo existe
    // en el SVG; el PowerPoint no sabe qué es y lo salta.
    if (f.respuesta !== undefined && f.respuesta !== null) {
        el.push({ tipo: 'zona', x, y, w, h: yt + 30 - y, respuesta: String(f.respuesta) });
    }
};

// La diapositiva de las evidencias de una clasificación: las fotos de la
// semana en una rejilla, cada una con lo que se pedía fotografiar y quién y
// cuándo la tomó, de qué área y departamento es y qué resultado sacó la
// respuesta —en una píldora sobre la esquina de la foto—. Hasta ocho —cuatro por dos—; con tres o menos, en un solo
// renglón y más grandes. El mismo encabezado y el mismo pie que las demás.
window.diapositivaDeEvidencias = (i, clave, numero, cuantas) => {
    const C = window.COLORES_IOS;
    const semana = window.presentacion.semanas[i];
    const r = window.vistaDe(window.resultadoDeSemana(i), clave);
    const todas = ((window.evidenciasDeSemana(i) || {})[clave]) || [];
    const fotos = window.evidenciasParaDiapositiva(todas, window.MAX_EVIDENCIAS_POR_DIAPOSITIVA);
    const personas = new Set(todas.map(f => f.empleado)).size;
    const el = [];
    const texto = (x, y, w, h, t, tam, col, extra) =>
        el.push(Object.assign({ tipo: 'texto', x, y, w, h, texto: t, tam, color: col }, extra || {}));

    el.push({ tipo: 'rect', x: 0, y: 0, w: 960, h: 540, relleno: '#ffffff' });
    texto(48, 38, 600, 18, (window.textoDeSemana(semana) + (semana.actual ? ' · en curso' : '')), 14, C.secundario, { peso: 500 });
    texto(48, 58, 700, 44, window.partirEnRenglones(r ? r.nombre : '', 36, 1)[0], 34, C.texto, { peso: 700 });
    texto(612, 40, 300, 16, 'Panel de Mantenimiento', 12, C.terciario, { alinear: 'right', peso: 500 });
    texto(48, 106, 500, 16, 'EVIDENCIA FOTOGRÁFICA', 11, C.secundario, { peso: 600, espaciado: 0.6 });
    texto(512, 106, 400, 16,
        `${todas.length} ${todas.length === 1 ? 'foto' : 'fotos'} de ${personas} ${personas === 1 ? 'persona' : 'personas'}`,
        11, C.secundario, { alinear: 'right' });

    const meses = window.MESES_CORTOS;
    const pocas = fotos.length <= 3;
    const columnas = pocas ? Math.max(1, fotos.length) : 4;
    const hueco = 16, izquierda = 48, ancho = 864;
    const w = pocas ? Math.min(360, (ancho - hueco * (columnas - 1)) / columnas) : (ancho - hueco * 3) / 4;
    const h = pocas ? Math.min(260, w * 3 / 4) : 108;
    const x0 = izquierda + (ancho - (w * columnas + hueco * (columnas - 1))) / 2;
    const alto = h + 58;
    fotos.forEach((f, n) => {
        const x = x0 + (n % columnas) * (w + hueco);
        const y = 130 + Math.floor(n / columnas) * (alto + hueco);
        window.fotoDeEvidenciaEnDiapositiva(el, f, x, y, w, h, true);
    });

    const sobran = todas.length - fotos.length;
    const hoy = new Date();
    if (numero) texto(812, 506, 100, 16, `${numero} / ${cuantas}`, 10, C.terciario, { alinear: 'right', peso: 600 });
    texto(48, 506, 760, 16,
        (sobran > 0 ? `y ${sobran} ${sobran === 1 ? 'foto más' : 'fotos más'} en la aplicación · ` : '') +
        'Una por persona antes de repetir, de la más reciente a la más vieja · ' +
        `generada el ${hoy.getDate()} ${meses[hoy.getMonth()]} ${hoy.getFullYear()}, ` +
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
        if (e.tipo === 'zona') {
            return `<rect class="zona-evidencia" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="transparent"
                          data-respuesta="${esc(e.respuesta)}"><title>Mantén pulsada la foto para abrir su evaluación</title></rect>`;
        }
        if (e.tipo === 'foto') {
            // Una foto rectangular con sus esquinas redondas, rellenando la
            // caja como un `object-fit: cover`. Sobre el gris, que es lo que
            // queda si no carga.
            const id = `recorte-foto-${++window.contadorRecortesDiapositiva}`;
            return `<clipPath id="${id}"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radio || 0}"/></clipPath>
                <rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radio || 0}" fill="${e.fondo}"/>
                ${e.url ? `<image href="${esc(e.url)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"
                      preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : ''}`;
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
        } else if (e.tipo === 'foto') {
            s.addShape(pptx.ShapeType.roundRect, {
                x: pulg(e.x), y: pulg(e.y), w: pulg(e.w), h: pulg(e.h),
                fill: { color: hex(e.fondo) }, line: { color: hex(e.fondo), width: 0 },
                rectRadius: pulg(e.radio || 0)
            });
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

// Una foto de evidencia, recortada a su caja —centrada, como el `slice` del
// SVG— y con las esquinas redondas sobre blanco, que es el fondo de la
// diapositiva: en JPEG no hay transparencia y así pesa una fracción del PNG.
window.fotoRecortadaParaPptx = (url, w, h, radio) => new Promise(resolve => {
    if (!url || url.startsWith('data:')) return resolve(null);
    const img = new Image();
    const plazo = setTimeout(() => resolve(null), 10000);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        clearTimeout(plazo);
        try {
            const escala = 2;
            const c = document.createElement('canvas');
            c.width = Math.round(w * escala); c.height = Math.round(h * escala);
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            const rr = (radio || 0) * escala;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(0, 0, c.width, c.height, rr); else ctx.rect(0, 0, c.width, c.height);
            ctx.clip();
            const proporcion = c.width / c.height;
            let sw = img.naturalWidth, sh = img.naturalHeight;
            if (sw / sh > proporcion) sw = sh * proporcion; else sh = sw / proporcion;
            ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { resolve(null); }
    };
    img.onerror = () => { clearTimeout(plazo); resolve(null); };
    img.src = url;
});

window.fotosParaPptx = (elementos) => Promise.all(elementos
    .filter(e => (e.tipo === 'imagen' || e.tipo === 'foto') && e.url)
    .map(async e => {
        e.datos = e.tipo === 'foto'
            ? await window.fotoRecortadaParaPptx(e.url, e.w, e.h, e.radio)
            : await window.fotoRedondaParaPptx(e.url, 240);
    }));

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
    // Si en esta semana esa clasificación no dejó evidencias, su propia
    // diapositiva; si ni existía, la de la planta.
    let k = mazo.findIndex(d => d.id === p.clave);
    if (k < 0) k = mazo.findIndex(d => d.id === String(p.clave || '').replace(/^evidencias:/, ''));
    k = Math.max(0, k);
    p.clave = mazo[k].id;
    document.getElementById('lamina-presentacion-completa').innerHTML =
        window.svgDeDiapositiva(window.laminaDe(p.indice, mazo[k], k + 1, mazo.length));
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
        if (mazo[k]) p.clave = mazo[k].id;
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
    const k = Math.max(0, mazo.findIndex(d => d.id === p.clave)) + paso;
    if (k < 0 || k >= mazo.length) return;
    p.clave = mazo[k].id;
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
            ${window.svgDeDiapositiva(window.laminaDe(p.indice, d, k + 1, mazo.length))}
        </div>`).join('');
    const rotulo = window.textoDeSemana(semana) + (semana.actual ? ' · en curso' : '');
    document.getElementById('semana-presentacion').innerText = rotulo;
    const clasificaciones = mazo.filter(d => d.id && !d.evidencias).length;
    const conFotos = mazo.filter(d => d.evidencias).length;
    document.getElementById('subtitulo-presentacion').innerText =
        `La planta y ${clasificaciones} ${clasificaciones === 1 ? 'clasificación' : 'clasificaciones'}` +
        (conFotos ? ` · ${conFotos} con evidencias` : '');
    document.getElementById('btn-semana-anterior').disabled = p.indice === 0;
    document.getElementById('btn-semana-siguiente').disabled = p.indice === p.semanas.length - 1;
    window.pintarPresentacionCompleta();

    // Las evidencias de esta semana, si todavía no llegaron. Al llegar se
    // repinta, sólo si se sigue mirando la misma semana en la misma hoja.
    if (!window.evidenciasDeSemana(p.indice)) {
        const indice = p.indice;
        window.cargarEvidenciasDeSemana(indice).then(fotos => {
            const hoja = document.getElementById('modal-presentacion');
            if (!fotos || window.presentacion !== p || p.indice !== indice || !hoja || hoja.style.display !== 'flex') return;
            if (Object.keys(fotos).length) window.pintarPresentacion();
        });
    }
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
        // Todas las de la semana, en el orden de la hoja, con sus evidencias:
        // si todavía no habían llegado, se esperan aquí.
        await window.cargarEvidenciasDeSemana(p.indice);
        const mazo = window.diapositivasDeSemana(p.indice);
        const hojas = mazo.map((d, k) => window.laminaDe(p.indice, d, k + 1, mazo.length));
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


// --- DE LA FOTO A SU EVALUACIÓN ---
//
// El administrador mantiene pulsada una foto de evidencia —en la hoja o a
// pantalla completa— y se abre la respuesta donde aparece, con la hoja de
// detalle de siempre (`verDetalleRespuesta`). Mantener y no tocar: un toque en
// la hoja abre la pantalla completa, y a pantalla completa el dedo pasa de
// diapositiva y amplía.
//
// Al cerrar el detalle se vuelve a la presentación, a la misma diapositiva
// (`volverAPresentacion`, que lee `cancelarRespuesta`). La pantalla completa se
// cierra antes de abrirlo: con `requestFullscreen` puesto, nada fuera de la
// capa se ve.
window.MS_PULSACION_EVIDENCIA = 550;
window.abrirEvaluacionDeEvidencia = async (idRespuesta) => {
    if (!window.modoAdminActivo || !idRespuesta) return;
    const volverACompleta = (document.getElementById('modal-presentacion-completa') || {}).style?.display === 'block';
    try {
        const { data, error } = await sb.from('evaluation_responses').select('*').eq('id', idRespuesta).single();
        if (error || !data) throw error || new Error('sin datos');
        if (volverACompleta) window.cerrarPresentacionCompleta();
        window.volverAPresentacion = { completa: volverACompleta, respuesta: String(data.id) };
        await window.verDetalleRespuesta(data);
    } catch (e) {
        window.volverAPresentacion = null;
        alert('No se pudo abrir la evaluación de esta foto.');
    }
};

(() => {
    let pulsacion = null, tragarHasta = 0;
    const zonaDe = (objetivo) => {
        const z = objetivo && objetivo.closest && objetivo.closest('.zona-evidencia');
        return z && z.closest('#modal-presentacion, #modal-presentacion-completa') ? z : null;
    };
    const empezar = (objetivo, x, y) => {
        const zona = zonaDe(objetivo);
        if (!zona || !window.modoAdminActivo) return;
        cancelar();
        pulsacion = { x, y, disparo: false, id: zona.getAttribute('data-respuesta') };
        pulsacion.temporizador = setTimeout(() => {
            if (!pulsacion) return;
            pulsacion.disparo = true;
            if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* nada */ } }
            window.abrirEvaluacionDeEvidencia(pulsacion.id);
        }, window.MS_PULSACION_EVIDENCIA);
    };
    const mover = (x, y) => {
        if (pulsacion && !pulsacion.disparo && Math.hypot(x - pulsacion.x, y - pulsacion.y) > 10) cancelar();
    };
    function cancelar() {
        if (pulsacion) clearTimeout(pulsacion.temporizador);
        pulsacion = null;
    }
    // Al soltar tras el disparo, el click que venga detrás no puede abrir la
    // pantalla completa. El plazo empieza al soltar, como el del monitor de
    // datos, y caduca pronto para no comerse el toque siguiente.
    const soltar = (e) => {
        if (pulsacion && pulsacion.disparo) {
            if (e && e.cancelable) e.preventDefault();
            tragarHasta = Date.now() + 400;
        }
        cancelar();
    };

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { cancelar(); return; }
        empezar(e.target, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) { cancelar(); return; }
        mover(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    document.addEventListener('touchend', soltar, { passive: false });
    document.addEventListener('touchcancel', cancelar, { passive: true });
    document.addEventListener('mousedown', (e) => { if (e.button === 0) empezar(e.target, e.clientX, e.clientY); });
    document.addEventListener('mousemove', (e) => mover(e.clientX, e.clientY));
    document.addEventListener('mouseup', soltar);
    document.addEventListener('click', (e) => {
        if (Date.now() < tragarHasta) { e.stopPropagation(); e.preventDefault(); tragarHasta = 0; }
    }, true);
    // El menú de mantener pulsado —«Guardar imagen» en iOS, el contextual en
    // Android— se lo lleva la foto; en un escritorio, el botón derecho abre la
    // evaluación directamente.
    document.addEventListener('contextmenu', (e) => {
        const zona = zonaDe(e.target);
        if (!zona || !window.modoAdminActivo) return;
        e.preventDefault();
        if (pulsacion) return;   // la pulsación larga ya se encarga
        if (e.pointerType === 'touch' || Date.now() < tragarHasta) return;
        window.abrirEvaluacionDeEvidencia(zona.getAttribute('data-respuesta'));
    });
})();
