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
// Tres cosas que hay que mantener:
//
//   - **Las cifras salen de las mismas funciones que la tarjeta**
//     (`resumenDeEncuestaAdmin`, `totalDeEncuestasAdmin`,
//     `promedioDeClasificaciones`), con el mismo padrón ya calculado: una
//     presentación que dijera otra cifra que el panel sería peor que ninguna.
//   - **Cada semana es la foto de su cierre**, la misma de los puntos pequeños
//     de la gráfica; la que corre, la de ahora. Por eso la primera semana de un
//     mes sale baja: las mensuales vuelven a estar sin contestar.
//   - **PptxGenJS se pide al pulsar descargar**, con `cargarLibreria` y sin
//     `?v=`, como SheetJS: son 470 KB que no tiene por qué pagar quien sólo mira.

window.LIBRERIA_PRESENTACIONES = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
window.SEMANAS_EN_LA_TENDENCIA = 8;

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

// Las semanas que tienen datos: desde la primera del eje de la gráfica —que es
// desde donde la consulta de la tarjeta se trajo respuestas— hasta la que
// corre, de la más vieja a la más nueva. La que corre se mira con la hora de
// ahora, que su cierre todavía no ha llegado.
window.semanasDeLaPresentacion = () => {
    const meses = window.periodosDeClasificacion(
        [{ frequency: window.RITMO_GRAFICA_EMPRESA }], window.PERIODOS_EN_LA_GRAFICA);
    const desde = meses.length ? meses[meses.length - 1].inicio : null;
    if (!(desde instanceof Date)) return [];

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
            resumen: window.resumenDeEncuestaAdmin(f.ev, window.respuestasAsignadas, referencia,
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

    // La cifra grande y lo que la acompaña.
    texto(40, 136, 360, 22, 'Resultado general', 15, '#64748b');
    texto(40, 160, 360, 110, r.promedio === null ? '—' : `${r.promedio}%`, 96, color(r.promedio), { negrita: true });
    texto(40, 272, 360, 22,
        r.total > 0 ? `${r.contestaron}/${r.total} respuestas · ${r.encuestas} encuestas` : `${r.contestaron} respuestas`,
        15, '#475569');
    if (anterior && anterior.promedio !== null && r.promedio !== null) {
        const d = r.promedio - anterior.promedio;
        const t = d === 0 ? 'Igual que la semana anterior'
            : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} pts vs. semana anterior`;
        texto(40, 298, 360, 22, t, 15, d > 0 ? '#16a34a' : (d < 0 ? '#dc2626' : '#64748b'), { negrita: true });
    }

    // La tendencia de las últimas semanas, hasta la que se está mirando.
    const desde = Math.max(0, i - window.SEMANAS_EN_LA_TENDENCIA + 1);
    const tramo = [];
    for (let k = desde; k <= i; k++) tramo.push({ k, r: window.resultadoDeSemana(k), s: window.presentacion.semanas[k] });
    texto(40, 338, 360, 20, `Últimas ${tramo.length} semanas`, 12, '#94a3b8', { negrita: true });
    const gx = 60, gw = 320, gy = 366, gh = 100;
    const px = (j) => gx + (tramo.length === 1 ? gw / 2 : gw * j / (tramo.length - 1));
    const py = (v) => gy + gh * (1 - v / 100);
    el.push({ tipo: 'rect', x: 40, y: 358, w: 360, h: 140, relleno: '#f8fafc', radio: 10 });
    el.push({ tipo: 'linea', x1: gx, y1: py(window.UMBRAL_CERTIFICACION), x2: gx + gw, y2: py(window.UMBRAL_CERTIFICACION),
              color: '#86efac', grosor: 1, guiones: true });
    let previo = null;
    tramo.forEach((t, j) => {
        if (t.r.promedio === null) { previo = null; return; }
        const punto = [px(j), py(t.r.promedio)];
        if (previo) el.push({ tipo: 'linea', x1: previo[0], y1: previo[1], x2: punto[0], y2: punto[1], color: '#2563eb', grosor: 2.5 });
        previo = punto;
    });
    tramo.forEach((t, j) => {
        const d = t.s.inicio;
        texto(px(j) - 22, 474, 44, 16, `${d.getDate()} ${window.MESES_CORTOS[d.getMonth()]}`, 10,
            t.k === i ? '#0f172a' : '#94a3b8', { alinear: 'center', negrita: t.k === i });
        if (t.r.promedio === null) return;
        el.push({ tipo: 'circulo', cx: px(j), cy: py(t.r.promedio), r: t.k === i ? 6 : 4,
                  relleno: color(t.r.promedio), borde: '#ffffff' });
    });

    // Una barra por clasificación, de la mejor a la peor.
    texto(440, 136, 480, 22, 'Por clasificación', 15, '#0f172a', { negrita: true });
    const lista = r.clasificaciones;
    const alto = Math.min(52, 322 / Math.max(lista.length, 1));
    const tam = Math.max(9, Math.min(14, alto * 0.38));
    const bx = 640, bw = 220;
    lista.forEach((c, j) => {
        const y = 168 + j * alto;
        const limite = Math.floor(190 / (tam * 0.56));
        const nombre = c.nombre.length > limite ? c.nombre.slice(0, limite - 1) + '…' : c.nombre;
        texto(440, y, 196, alto, nombre, tam, '#334155', { negrita: true });
        const hb = Math.max(6, alto * 0.36);
        el.push({ tipo: 'rect', x: bx, y: y + (alto - hb) / 2, w: bw, h: hb, relleno: '#f1f5f9', radio: hb / 2 });
        if (c.promedio !== null && c.promedio > 0) {
            el.push({ tipo: 'rect', x: bx, y: y + (alto - hb) / 2, w: Math.max(hb, bw * c.promedio / 100), h: hb,
                      relleno: color(c.promedio), radio: hb / 2 });
        }
        texto(866, y, 54, alto, c.promedio === null ? '—' : `${c.promedio}%`, tam + 1, color(c.promedio),
            { negrita: true, alinear: 'right' });
    });
    if (lista.length) {
        const xm = bx + bw * window.UMBRAL_CERTIFICACION / 100;
        el.push({ tipo: 'linea', x1: xm, y1: 164, x2: xm, y2: 168 + lista.length * alto + 2, color: '#22c55e', grosor: 1, guiones: true });
    }

    // Pie.
    const hoy = new Date();
    texto(40, 508, 880, 18,
        `Cada clasificación pesa igual en el resultado general · meta ${window.UMBRAL_CERTIFICACION}% · ` +
        `generada el ${hoy.getDate()} ${window.MESES_CORTOS[hoy.getMonth()]} ${hoy.getFullYear()}, ` +
        `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`,
        11, '#94a3b8');
    return el;
};

// --- DE LA LISTA AL SVG ---
window.svgDeDiapositiva = (elementos) => {
    const esc = window.sanitizeForHTML;
    const partes = elementos.map(e => {
        if (e.tipo === 'rect') return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.radio || 0}" fill="${e.relleno}"/>`;
        if (e.tipo === 'linea') return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${e.color}" stroke-width="${e.grosor}"${e.guiones ? ' stroke-dasharray="5 4"' : ''} stroke-linecap="round"/>`;
        if (e.tipo === 'circulo') return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${e.relleno}"${e.borde ? ` stroke="${e.borde}" stroke-width="2"` : ''}/>`;
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
                <div id="diapositiva-presentacion" class="presentacion-diapositiva"></div>
                <p class="presentacion-nota">Se arma sola cada semana con los datos del momento: no hay que generarla ni
                    guardarla. La semana en curso cambia conforme la gente contesta; las cerradas son la foto de su domingo.</p>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return overlay;
};

window.abrirPresentacion = () => {
    if (!window.hayPresentacion()) return;
    const semanas = window.semanasDeLaPresentacion();
    if (semanas.length === 0) return;
    window.presentacion = { semanas, indice: semanas.length - 1, resultados: {} };
    window.montarHojaPresentacion().style.display = 'flex';
    window.pintarPresentacion();
};

window.cerrarPresentacion = () => {
    const overlay = document.getElementById('modal-presentacion');
    if (overlay) overlay.style.display = 'none';
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
        window.agregarDiapositivaPptx(pptx, window.diapositivaDePlanta(p.indice));
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
