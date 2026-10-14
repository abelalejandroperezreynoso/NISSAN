// ==========================================
// 16-cursos.js — PROGRAMAR EL CURSO QUE FALTA Y ELEGIR JEFE INMEDIATO
// ==========================================
// Las dos hojas que abre el panel de pendientes para lo que no es contestar ni
// calificar. Las reglas viven en `1-config.js` (`registrarSinCurso`,
// `programarCursoPrevio`, `elegirJefeInmediato`…); aquí sólo están las
// pantallas.
//
//   - **«Programar curso»**, del jefe: la gente de su equipo directo que dijo
//     que no ha tomado el curso de una encuesta. Sólo se le pregunta **a quién
//     ya tiene programado y para qué día** —sin hora y sin instructor—, y ese
//     día la encuesta le vuelve a salir para contestarla. **No hace falta marcarlos a todos**: lo normal es mandarlos
//     en grupos de pocos y en días distintos, y los que no se marquen siguen
//     esperando —la tarjeta del panel se queda mientras quede alguno—.
//   - **«Elige a tu jefe inmediato»**, de quien no lo tiene o lo tiene dado de
//     baja: sin ese dato el curso que le falte no le llega a nadie, ni se sabe
//     quién califica sus encuestas.
//
// Las dos van **encima de la hoja de pendientes** (z-index 2000 sobre 1900),
// como la de vacaciones, que también se abre desde ahí: es lo que hay que
// resolver del pendiente que se acaba de tocar, y al cerrarla se vuelve a él.
//
// Tres cosas que hay que mantener:
//
//   - **La acción principal va en el encabezado**, con su `.ios-boton-icono`:
//     la hoja de programar tiene un campo de fecha, que abre una rueda, y
//     al pie del formulario el botón quedaría en el camino del dedo.
//   - **El estado va al subtítulo**, nunca con `innerText` sobre el botón, que
//     borraría su `<svg>`.
//   - **El buscador de jefe vive fuera de la lista que se repinta**, como el de
//     vacaciones y por lo mismo: dentro, cada letra se llevaría el foco.

const yoEnCursos = () => {
    try { return JSON.parse(localStorage.getItem('usuarioLogueado') || 'null'); } catch (e) { return null; }
};

const primerNombre = (emp) => String((emp && emp.name) || '').trim().split(' ')[0];

// Lo que hay detrás cambia en cuanto se programa un curso o se elige jefe: el
// panel de pendientes, el badge de la foto y la tarjeta de encuestas del inicio.
const alCambiarCursos = () => {
    const yo = yoEnCursos();
    const hojaPendientes = document.getElementById('modal-pendientes');
    if (hojaPendientes && hojaPendientes.style.display !== 'none' && window.mostrandoPendientes) {
        window.cargarVistaPendientes('PROPIOS');
    }
    if (window.refrescarTarjetaDeEncuestas) window.refrescarTarjetaDeEncuestas();
    if (yo && window.calcularPendientesBatch) window.calcularPendientesBatch([yo.id]);
};

// ==========================================
// PROGRAMAR EL CURSO
// ==========================================
window.hojaCurso = { evId: null, elegidos: new Set(), guardando: false };

const ICONO_GUARDAR = `
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6"
              stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;

window.montarHojaProgramarCurso = () => {
    let overlay = document.getElementById('modal-programar-curso');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'modal-programar-curso';
    overlay.className = 'hoja-overlay';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="hoja-contenido" style="max-width:500px; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Programar curso</h3>
                    <div class="hoja-subtitulo" id="subtitulo-programar-curso"></div>
                </div>
                <div class="hoja-acciones">
                    <button id="btn-programar-curso" type="button" onclick="window.guardarHojaProgramarCurso()"
                            class="ios-boton-icono" title="Programar" aria-label="Programar">${ICONO_GUARDAR}</button>
                    <button type="button" onclick="window.cerrarHojaProgramarCurso()" class="ios-boton-icono ios-boton-cerrar"
                            title="Cerrar" aria-label="Cerrar"></button>
                </div>
            </div>
            <div class="hoja-cuerpo-formulario">
                <div class="hoja-grupo-titulo">Quién ya está programado</div>
                <div id="curso-gente" class="lista-ios"></div>
                <button type="button" id="curso-marcar-todos" class="curso-marcar-todos"
                        onclick="window.marcarTodosHojaProgramarCurso()"></button>

                <div class="hoja-grupo-titulo">Para qué fecha</div>
                <div class="hoja-grupo">
                    <div class="form-group" style="margin:0;">
                        <label for="curso-fecha">Fecha del curso</label>
                        <input id="curso-fecha" type="date" class="curso-fecha-campo"
                               onchange="window.pintarResumenProgramarCurso()" oninput="window.pintarResumenProgramarCurso()">
                    </div>
                </div>

                <div id="curso-resumen" class="vac-resumen"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return overlay;
};

// El grupo que dejó armado el panel de pendientes (`window.cursosPorProgramar`):
// la encuesta, el nombre del curso, quién espera y a quién ya se le programó.
const grupoDelCurso = () => (window.cursosPorProgramar || {})[String(window.hojaCurso.evId)] || null;

window.abrirHojaProgramarCurso = (evaluationId) => {
    const estado = window.hojaCurso;
    estado.evId = String(evaluationId);
    estado.guardando = false;
    const grupo = grupoDelCurso();
    if (!grupo) return;

    // Con una sola persona esperando no hay nada que elegir: ya va marcada. Con
    // varias no se marca nadie, que lo normal es repartirlas en grupos.
    estado.elegidos = new Set(grupo.esperan.length === 1 && grupo.programados.length === 0
        ? [String(grupo.esperan[0].emp.id)] : []);

    const overlay = window.montarHojaProgramarCurso();
    const fecha = document.getElementById('curso-fecha');
    if (fecha) fecha.value = '';
    overlay.style.display = 'flex';
    window.pintarHojaProgramarCurso();
};

window.cerrarHojaProgramarCurso = () => {
    const overlay = document.getElementById('modal-programar-curso');
    if (overlay) overlay.style.display = 'none';
};

window.alternarPersonaCurso = (id) => {
    const elegidos = window.hojaCurso.elegidos;
    const clave = String(id);
    if (elegidos.has(clave)) elegidos.delete(clave); else elegidos.add(clave);
    window.pintarHojaProgramarCurso();
};

// «Marcar a todos» alcanza sólo a los que esperan: a quien ya tiene fecha se le
// reprograma marcándolo a mano, que es moverle un curso que ya sabe que tiene.
window.marcarTodosHojaProgramarCurso = () => {
    const grupo = grupoDelCurso();
    if (!grupo) return;
    const estado = window.hojaCurso;
    const todos = grupo.esperan.map(x => String(x.emp.id));
    const yaTodos = todos.every(id => estado.elegidos.has(id));
    todos.forEach(id => { if (yaTodos) estado.elegidos.delete(id); else estado.elegidos.add(id); });
    window.pintarHojaProgramarCurso();
};

window.pintarHojaProgramarCurso = () => {
    const grupo = grupoDelCurso();
    const caja = document.getElementById('curso-gente');
    const sub = document.getElementById('subtitulo-programar-curso');
    if (!grupo || !caja) return;
    const estado = window.hojaCurso;
    if (sub && !estado.guardando) sub.innerText = grupo.curso;

    const fila = ({ emp, fila: f }, programado) => {
        const marcado = estado.elegidos.has(String(emp.id));
        let detalle;
        if (programado) detalle = `Programado: ${window.textoDeFechaCurso(f.fecha_programada)}`;
        else if (f.fecha_fallida) detalle = `No lo tomó el ${window.textoDeFechaCurso(f.fecha_fallida)}`;
        else detalle = [emp.puesto, emp.dept].filter(Boolean).join(' · ');
        const miniatura = window.miniaturaDeEmpleado ? window.miniaturaDeEmpleado(emp, 34) : '';
        return `
            <button type="button" class="fila-ios${marcado ? ' esta-elegido' : ''}" onclick="window.alternarPersonaCurso('${emp.id}')">
                ${miniatura}
                <span class="fila-ios-texto">
                    <span class="fila-ios-titulo">${window.sanitizeForHTML(emp.name || '')}</span>
                    <span class="fila-ios-detalle" style="${f.fecha_fallida && !programado ? 'color:#b91c1c;' : ''}">${window.sanitizeForHTML(detalle)}</span>
                </span>
                <span class="fila-ios-marca" aria-hidden="true">${marcado ? '✓' : ''}</span>
            </button>`;
    };

    caja.innerHTML = grupo.esperan.map(x => fila(x, false)).join('') +
        grupo.programados.map(x => fila(x, true)).join('');

    const todos = document.getElementById('curso-marcar-todos');
    if (todos) {
        const ids = grupo.esperan.map(x => String(x.emp.id));
        todos.hidden = ids.length < 2;
        todos.innerText = ids.every(id => estado.elegidos.has(id)) ? 'Desmarcar a todos' : 'Marcar a todos los que esperan';
    }
    window.pintarResumenProgramarCurso();
};

// El día elegido, a la medianoche local: desde ese instante la encuesta le
// vuelve a salir (`estadoDeCursoPrevio` sólo la esconde mientras la fecha está
// por venir). Con `fechaDeRegistro`, que `new Date('2026-10-15')` se lee en UTC
// y la zona horaria lo correría un día hacia atrás.
const fechaDelCampoCurso = () => {
    const campo = document.getElementById('curso-fecha');
    if (!campo || !/^\d{4}-\d{2}-\d{2}$/.test(campo.value || '')) return null;
    const d = window.fechaDeRegistro(campo.value);
    return d && !isNaN(d) ? d : null;
};

window.pintarResumenProgramarCurso = () => {
    const grupo = grupoDelCurso();
    const caja = document.getElementById('curso-resumen');
    const btn = document.getElementById('btn-programar-curso');
    if (!grupo || !caja) return;
    const estado = window.hojaCurso;
    const cuantos = estado.elegidos.size;
    const fecha = fechaDelCampoCurso();
    const hayFecha = !!fecha;

    const quedan = grupo.esperan.filter(x => !estado.elegidos.has(String(x.emp.id))).length;
    const partes = [];
    if (cuantos === 0) {
        partes.push('Marca a quién ya tiene el curso programado.');
    } else {
        const quien = cuantos === 1
            ? window.sanitizeForHTML(String((grupo.esperan.concat(grupo.programados)
                .find(x => estado.elegidos.has(String(x.emp.id))) || {}).emp?.name || '').trim())
            : `${cuantos} personas`;
        const le = cuantos === 1 ? 'le' : 'les';
        if (!hayFecha) {
            partes.push(`<b>${quien}</b>: falta la fecha del curso.`);
        } else if (fecha > new Date()) {
            partes.push(`<b>${quien}</b> ${cuantos === 1 ? 'tiene' : 'tienen'} el curso el <b>${window.textoDeFechaCurso(fecha)}</b>. Ese día ${le} vuelve a salir la encuesta para contestarla.`);
        } else {
            partes.push(`<b>${quien}</b>: ${window.diaLocal(fecha) === window.diaLocal(new Date()) ? 'el curso es hoy' : 'esa fecha ya pasó'}, así que la encuesta ${le} sale ya para contestarla.`);
        }
    }
    if (quedan > 0 && cuantos > 0) {
        partes.push(quedan === 1
            ? '1 sigue esperando: puedes programarlo otro día.'
            : `${quedan} siguen esperando: puedes programarlos otro día.`);
    }
    caja.innerHTML = partes.map(p => `<p>${p}</p>`).join('');
    if (btn) btn.disabled = estado.guardando || cuantos === 0 || !hayFecha;
};

window.guardarHojaProgramarCurso = async () => {
    const grupo = grupoDelCurso();
    const estado = window.hojaCurso;
    const yo = yoEnCursos();
    if (!grupo || !yo || estado.guardando) return;

    const fecha = fechaDelCampoCurso();
    if (estado.elegidos.size === 0) { alert('Marca a quién ya tiene el curso programado.'); return; }
    if (!fecha) { alert('Pon la fecha del curso.'); return; }

    const sub = document.getElementById('subtitulo-programar-curso');
    const btn = document.getElementById('btn-programar-curso');
    estado.guardando = true;
    if (btn) btn.disabled = true;
    if (sub) sub.innerText = 'Programando…';
    try {
        await window.programarCursoPrevio(grupo.ev.id, Array.from(estado.elegidos), fecha, '', yo.id);
        window.cerrarHojaProgramarCurso();
        alCambiarCursos();
    } catch (e) {
        alert('No se pudo programar el curso: ' + e.message);
    } finally {
        estado.guardando = false;
        if (sub) sub.innerText = grupo.curso;
        window.pintarResumenProgramarCurso();
    }
};

// ==========================================
// ELEGIR JEFE INMEDIATO
// ==========================================
window.hojaJefe = { busqueda: '', guardando: false };

window.montarHojaElegirJefe = () => {
    let overlay = document.getElementById('modal-elegir-jefe');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'modal-elegir-jefe';
    overlay.className = 'hoja-overlay';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="hoja-contenido" style="max-width:500px; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Tu jefe inmediato</h3>
                    <div class="hoja-subtitulo" id="subtitulo-elegir-jefe"></div>
                </div>
                <button type="button" onclick="window.cerrarHojaElegirJefe()" class="ios-boton-icono ios-boton-cerrar"
                        title="Cerrar" aria-label="Cerrar"></button>
            </div>
            <div class="hoja-cuerpo-formulario">
                <p class="jefe-explicacion">Elige a quién le reportas directamente. Es quien califica tus encuestas, ve tus pendientes y te programa los cursos que te falten.</p>
                <input id="jefe-buscar" type="search" autocomplete="off" placeholder="Buscar por nombre…"
                       oninput="window.hojaJefe.busqueda = this.value; window.pintarCandidatosAJefe();"
                       style="width:100%; box-sizing:border-box; font-size:16px; padding:10px; border:1px solid #cbd5e1; border-radius:10px;">
                <div id="jefe-candidatos-titulo" class="hoja-grupo-titulo"></div>
                <div id="jefe-candidatos" class="lista-ios"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return overlay;
};

window.abrirHojaElegirJefe = async () => {
    const overlay = window.montarHojaElegirJefe();
    window.hojaJefe.busqueda = '';
    window.hojaJefe.guardando = false;
    const buscador = document.getElementById('jefe-buscar');
    if (buscador) buscador.value = '';
    const sub = document.getElementById('subtitulo-elegir-jefe');
    if (sub) sub.innerText = '';
    overlay.style.display = 'flex';
    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }
    window.pintarCandidatosAJefe();
};

window.cerrarHojaElegirJefe = () => {
    const overlay = document.getElementById('modal-elegir-jefe');
    if (overlay) overlay.style.display = 'none';
};

// Quién puede ser su jefe: gente activa que no sea él mismo **ni dependa de
// él** —la cadena de mando no se puede morder la cola—. Sin buscar se proponen
// los jefes de su departamento, que es donde casi siempre está; buscando,
// cualquiera.
window.candidatosAJefe = () => {
    const yo = yoEnCursos();
    if (!yo) return { lista: [], sugeridos: false };
    const gente = window.todosLosEmpleadosData || [];

    // Su equipo entero, hacia abajo: ninguno puede ser su jefe.
    const debajo = new Set([String(yo.id)]);
    const cola = [String(yo.id)];
    while (cola.length) {
        const actual = cola.shift();
        gente.forEach(e => {
            if (String(e.supId) === actual && !debajo.has(String(e.id))) {
                debajo.add(String(e.id));
                cola.push(String(e.id));
            }
        });
    }
    const posibles = gente.filter(e => window.empleadoActivo(e) && !debajo.has(String(e.id)));

    const texto = (window.hojaJefe.busqueda || '').trim();
    const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (texto) {
        const clave = sinAcentos(texto);
        return { lista: posibles.filter(e => sinAcentos(e.name).includes(clave)).slice(0, 12), sugeridos: false };
    }

    const miFicha = gente.find(e => String(e.id) === String(yo.id));
    const miDepto = String((miFicha && miFicha.dept) || '').trim().toUpperCase();
    const tienenEquipo = new Set(gente.filter(e => window.empleadoActivo(e)).map(e => String(e.supId || '')));
    const sugeridos = posibles
        .filter(e => tienenEquipo.has(String(e.id)) && String(e.dept || '').trim().toUpperCase() === miDepto)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))
        .slice(0, 12);
    return { lista: sugeridos, sugeridos: true };
};

window.pintarCandidatosAJefe = () => {
    const caja = document.getElementById('jefe-candidatos');
    const titulo = document.getElementById('jefe-candidatos-titulo');
    if (!caja) return;
    const { lista, sugeridos } = window.candidatosAJefe();
    const buscando = !!(window.hojaJefe.busqueda || '').trim();

    if (titulo) {
        titulo.innerText = buscando ? 'Resultados' : (lista.length ? 'Jefes de tu departamento' : '');
        titulo.style.display = titulo.innerText ? '' : 'none';
    }
    if (lista.length === 0) {
        caja.innerHTML = `<div class="fila-ios" style="cursor:default; color:#64748b; font-size:0.9rem;">
            ${buscando ? 'Nadie se llama así.' : 'Escribe el nombre de tu jefe inmediato.'}</div>`;
        return;
    }
    caja.innerHTML = lista.map(e => {
        const miniatura = window.miniaturaDeEmpleado ? window.miniaturaDeEmpleado(e, 34) : '';
        return `
            <button type="button" class="fila-ios" onclick="window.elegirJefeDeLaHoja('${e.id}')">
                ${miniatura}
                <span class="fila-ios-texto">
                    <span class="fila-ios-titulo">${window.sanitizeForHTML(e.name || '')}</span>
                    <span class="fila-ios-detalle">${window.sanitizeForHTML([e.puesto, e.dept].filter(Boolean).join(' · '))}</span>
                </span>
                <span class="fila-ios-chevron">›</span>
            </button>`;
    }).join('');
    // Sin sugerencias y sin buscar, el renglón de arriba pide el nombre; con
    // ellas, se dice además que se puede buscar a cualquiera.
    if (sugeridos) {
        caja.insertAdjacentHTML('beforeend', `<div class="fila-ios" style="cursor:default; color:#64748b; font-size:0.85rem;">¿No está aquí? Búscalo por su nombre.</div>`);
    }
};

window.elegirJefeDeLaHoja = async (jefeId) => {
    const yo = yoEnCursos();
    const estado = window.hojaJefe;
    if (!yo || estado.guardando) return;
    const jefe = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(jefeId));
    if (!jefe) return;
    if (!confirm(`¿${String(jefe.name || '').trim()} es tu jefe inmediato?\n\nVerá tus pendientes, calificará tus encuestas y te programará los cursos que te falten.`)) return;

    const sub = document.getElementById('subtitulo-elegir-jefe');
    estado.guardando = true;
    if (sub) sub.innerText = 'Guardando…';
    try {
        await window.elegirJefeInmediato(yo.id, jefe.id);
        window.cerrarHojaElegirJefe();
        alert(`Listo: ${primerNombre(jefe)} es tu jefe inmediato.`);
        alCambiarCursos();
    } catch (e) {
        alert('No se pudo guardar: ' + e.message);
    } finally {
        estado.guardando = false;
        if (sub) sub.innerText = '';
    }
};
