// ==========================================
// 14-vacaciones.js — CARGAR VACACIONES Y NOMBRAR RELEVO
// ==========================================
// La hoja donde cada quien carga sus vacaciones —una o dos semanas completas,
// de lunes a domingo— y nombra a quien lo releva. Las reglas de qué cambia con
// eso viven en `1-config.js` (`periodoRelevado`, `apoyosDelRelevo`…); aquí sólo
// está la pantalla.
//
// Se entra por el botón del encabezado de «Mis Pendientes» y por el aviso que
// sale arriba de esa lista mientras haya vacaciones cargadas. La carga el
// propio usuario, **sin que el relevo tenga que aceptar**, y la revierte él
// mismo desde aquí mientras no hayan terminado.
//
// Tres cosas que hay que mantener:
//
//   - **El buscador vive fuera del cuerpo que se repinta**, como el de la hoja
//     de gestión y por lo mismo: dentro, cada letra se llevaría el foco.
//   - **La acción principal va en el encabezado**, con su `.ios-boton-icono`:
//     esta hoja tiene un desplegable, y al pie del formulario el botón de
//     guardar queda en el camino del dedo que va a la rueda.
//   - **El estado va al subtítulo**, nunca con `innerText` sobre el botón, que
//     borraría su `<svg>`.

window.hojaVacaciones = { desde: '', semanas: 1, relevoId: null, busqueda: '', guardando: false, hayTabla: true };

// El lunes de la semana de una fecha, a medianoche.
window.lunesDe = (fecha) => {
    const d = new Date(fecha || new Date());
    d.setHours(0, 0, 0, 0);
    const dia = d.getDay() || 7;          // lunes = 1 … domingo = 7
    d.setDate(d.getDate() - dia + 1);
    return d;
};

// Las semanas que se ofrecen: la que corre y las doce siguientes. La que corre
// entra porque las vacaciones pueden empezar hoy mismo —se carga el lunes a
// primera hora, o el martes porque se olvidó—.
window.lunesDisponibles = (cuantos = 13) => {
    const primero = window.lunesDe(new Date());
    return Array.from({ length: cuantos }, (_, i) => {
        const d = new Date(primero);
        d.setDate(d.getDate() + 7 * i);
        return d;
    });
};

const MESES_VAC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaCorto = (d) => `${d.getDate()} ${MESES_VAC[d.getMonth()]}`;

// «5 – 18 oct», o «28 sep – 4 oct» si cruza de mes. El fin que se dice es el
// domingo, no el lunes siguiente que es el fin exclusivo.
window.textoDeTramoVacaciones = (inicio, semanas) => {
    const domingo = new Date(inicio);
    domingo.setDate(domingo.getDate() + 7 * (Number(semanas) || 1) - 1);
    return inicio.getMonth() === domingo.getMonth()
        ? `${inicio.getDate()} – ${diaCorto(domingo)}`
        : `${diaCorto(inicio)} – ${diaCorto(domingo)}`;
};

const yoMismo = () => {
    try { return JSON.parse(localStorage.getItem('usuarioLogueado') || 'null'); } catch (e) { return null; }
};

// El aviso de arriba de «Mis Pendientes» mientras haya vacaciones cargadas
// —corriendo o por venir—: sin él, quien las cargó no tendría dónde ver que
// quedaron puestas ni por dónde revertirlas sin buscar el botón.
window.bannerDeVacaciones = (empleadoId) => {
    const vigentes = window.vacacionesVigentesDe ? window.vacacionesVigentesDe(empleadoId) : [];
    if (vigentes.length === 0) return '';
    const renglones = vigentes.map(v => {
        const inicio = window.inicioDeVacaciones(v);
        const enCurso = inicio <= new Date();
        const quien = v.relevo_id != null ? window.nombresDeEmpleados([v.relevo_id]) : '';
        return `<div><b>${enCurso ? 'De vacaciones' : 'Vacaciones'}</b> ${window.textoDeTramoVacaciones(inicio, v.semanas)}${quien ? ` · te releva ${window.sanitizeForHTML(quien)}` : ''}</div>`;
    }).join('');
    return `
        <button type="button" class="aviso-vacaciones" onclick="window.abrirHojaVacaciones()">
            <span class="aviso-vacaciones-texto">${renglones}</span>
            <span class="fila-ios-chevron">›</span>
        </button>`;
};

window.montarHojaVacaciones = () => {
    let overlay = document.getElementById('modal-vacaciones');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'modal-vacaciones';
    overlay.className = 'hoja-overlay';
    overlay.style.zIndex = '2000';
    overlay.innerHTML = `
        <div class="hoja-contenido" style="max-width:500px; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Vacaciones</h3>
                    <div class="hoja-subtitulo" id="subtitulo-vacaciones"></div>
                </div>
                <div class="hoja-acciones">
                    <button id="btn-guardar-vacaciones" type="button" onclick="window.guardarHojaVacaciones()"
                            class="ios-boton-icono" title="Cargar vacaciones" aria-label="Cargar vacaciones">
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6"
                                  stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <button type="button" onclick="window.cerrarHojaVacaciones()" class="ios-boton-icono ios-boton-cerrar"
                            title="Cerrar" aria-label="Cerrar"></button>
                </div>
            </div>
            <div class="hoja-cuerpo-formulario">
                <div id="vacaciones-vigentes"></div>

                <div class="hoja-grupo-titulo">Nuevas vacaciones</div>
                <div class="hoja-grupo">
                    <div class="form-group">
                        <label for="vac-desde">Semana en que empiezan</label>
                        <select id="vac-desde" onchange="window.hojaVacaciones.desde = this.value; window.pintarResumenVacaciones();"
                                style="width:100%; box-sizing:border-box; font-size:16px; padding:10px; border:1px solid #cbd5e1; border-radius:10px; background:white;"></select>
                    </div>
                    <div class="form-group">
                        <label>Duración</label>
                        <div class="vac-duracion" id="vac-duracion">
                            <button type="button" data-semanas="1" onclick="window.elegirSemanasVacaciones(1)">1 semana</button>
                            <button type="button" data-semanas="2" onclick="window.elegirSemanasVacaciones(2)">2 semanas</button>
                        </div>
                    </div>
                </div>

                <div class="hoja-grupo-titulo">Quién te releva</div>
                <div class="hoja-grupo">
                    <input id="vac-buscar-relevo" type="search" autocomplete="off" placeholder="Buscar por nombre…"
                           oninput="window.hojaVacaciones.busqueda = this.value; window.pintarRelevosVacaciones();"
                           style="width:100%; box-sizing:border-box; font-size:16px; padding:10px; border:1px solid #cbd5e1; border-radius:10px;">
                    <div id="vac-relevos" class="lista-ios" style="margin-top:10px;"></div>
                </div>

                <div id="vac-resumen" class="vac-resumen"></div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    return overlay;
};

window.abrirHojaVacaciones = async () => {
    const overlay = window.montarHojaVacaciones();
    const estado = window.hojaVacaciones;
    estado.relevoId = null;
    estado.busqueda = '';
    estado.semanas = 1;
    const semanas = window.lunesDisponibles();
    estado.desde = window.diaLocal(semanas[0]);

    const select = document.getElementById('vac-desde');
    select.innerHTML = semanas.map((d, i) =>
        `<option value="${window.diaLocal(d)}">${i === 0 ? 'Esta semana' : (i === 1 ? 'La próxima' : `Semana del ${diaCorto(d)}`)} · ${window.textoDeTramoVacaciones(d, 1)}</option>`
    ).join('');
    select.value = estado.desde;
    const buscador = document.getElementById('vac-buscar-relevo');
    if (buscador) buscador.value = '';

    overlay.style.display = 'flex';
    window.pintarHojaVacaciones();

    // La plantilla para elegir relevo y las vacaciones de todos —las propias,
    // y las del relevo para avisar si está fuera esas mismas semanas—.
    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }
    estado.hayTabla = await window.hayTablaVacaciones();
    await window.cargarVacaciones(true);
    window.pintarHojaVacaciones();
};

window.cerrarHojaVacaciones = () => {
    const overlay = document.getElementById('modal-vacaciones');
    if (overlay) overlay.style.display = 'none';
};

window.elegirSemanasVacaciones = (n) => {
    window.hojaVacaciones.semanas = n === 2 ? 2 : 1;
    window.pintarHojaVacaciones();
};

window.elegirRelevoVacaciones = (id) => {
    window.hojaVacaciones.relevoId = String(id);
    window.pintarHojaVacaciones();
};

window.pintarHojaVacaciones = () => {
    window.pintarVigentesVacaciones();
    document.querySelectorAll('#vac-duracion button').forEach(b =>
        b.classList.toggle('esta-elegido', Number(b.dataset.semanas) === window.hojaVacaciones.semanas));
    window.pintarRelevosVacaciones();
    window.pintarResumenVacaciones();
};

window.pintarVigentesVacaciones = () => {
    const caja = document.getElementById('vacaciones-vigentes');
    const yo = yoMismo();
    if (!caja || !yo) return;
    const vigentes = window.vacacionesVigentesDe(yo.id);
    if (vigentes.length === 0) { caja.innerHTML = ''; return; }
    caja.innerHTML = `
        <div class="hoja-grupo-titulo">Cargadas</div>
        <div class="lista-ios" style="margin-bottom:20px;">
            ${vigentes.map(v => {
                const inicio = window.inicioDeVacaciones(v);
                const enCurso = inicio <= new Date();
                const quien = v.relevo_id != null ? window.nombresDeEmpleados([v.relevo_id]) : 'sin relevo';
                return `
                <div class="fila-ios" style="cursor:default;">
                    <span class="fila-ios-texto">
                        <span class="fila-ios-titulo">${window.textoDeTramoVacaciones(inicio, v.semanas)}${enCurso ? ' · en curso' : ''}</span>
                        <span class="fila-ios-detalle">Te releva ${window.sanitizeForHTML(quien)}</span>
                    </span>
                    <button type="button" class="vac-revertir" onclick="window.revertirHojaVacaciones('${v.id}')">Revertir</button>
                </div>`;
            }).join('')}
        </div>`;
};

// Quién puede relevar: gente activa que no sea uno mismo. Sin buscar, se
// proponen los del mismo puesto y departamento —el relevo natural— y el jefe
// inmediato; buscando, cualquiera.
window.candidatosARelevo = () => {
    const yo = yoMismo();
    const gente = (window.todosLosEmpleadosData || [])
        .filter(e => window.empleadoActivo(e) && (!yo || String(e.id) !== String(yo.id)));
    const texto = (window.hojaVacaciones.busqueda || '').trim();
    const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    if (texto) {
        const clave = sinAcentos(texto);
        return gente.filter(e => sinAcentos(e.name).includes(clave)).slice(0, 8);
    }

    const miFicha = yo ? (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(yo.id)) : null;
    if (!miFicha) return [];
    const mismo = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
    const depto = (e) => e.department || e.dept;
    const sugeridos = gente.filter(e => mismo(e.puesto, miFicha.puesto) && mismo(depto(e), depto(miFicha)));
    const jefe = gente.find(e => String(e.id) === String(miFicha.supId));
    if (jefe && !sugeridos.includes(jefe)) sugeridos.push(jefe);
    return sugeridos.slice(0, 8);
};

window.pintarRelevosVacaciones = () => {
    const caja = document.getElementById('vac-relevos');
    if (!caja) return;
    const estado = window.hojaVacaciones;
    let lista = window.candidatosARelevo();
    // El elegido se queda a la vista aunque la búsqueda ya no lo encuentre.
    const elegido = estado.relevoId
        ? (window.todosLosEmpleadosData || []).find(e => String(e.id) === estado.relevoId) : null;
    if (elegido && !lista.includes(elegido)) lista = [elegido, ...lista];

    if (lista.length === 0) {
        caja.innerHTML = `<div class="fila-ios" style="cursor:default; color:#64748b; font-size:0.9rem;">
            ${estado.busqueda ? 'Nadie se llama así.' : 'Escribe el nombre de quien te va a relevar.'}</div>`;
        return;
    }

    caja.innerHTML = lista.map(e => {
        const marcado = String(e.id) === estado.relevoId;
        const miniatura = window.miniaturaDeEmpleado ? window.miniaturaDeEmpleado(e, 34) : '';
        return `
            <button type="button" class="fila-ios${marcado ? ' esta-elegido' : ''}" onclick="window.elegirRelevoVacaciones('${e.id}')">
                ${miniatura}
                <span class="fila-ios-texto">
                    <span class="fila-ios-titulo">${window.sanitizeForHTML(e.name || '')}</span>
                    <span class="fila-ios-detalle">${window.sanitizeForHTML([e.puesto, e.department || e.dept].filter(Boolean).join(' · '))}</span>
                </span>
                <span class="vac-marca" aria-hidden="true">${marcado ? '✓' : ''}</span>
            </button>`;
    }).join('');
};

// Si dos tramos de vacaciones se pisan.
const sePisan = (desdeA, semanasA, v) => {
    const inicioA = window.fechaDeRegistro(desdeA);
    const finA = new Date(inicioA);
    finA.setDate(finA.getDate() + 7 * semanasA);
    return inicioA < window.finDeVacaciones(v) && window.inicioDeVacaciones(v) < finA;
};

window.pintarResumenVacaciones = () => {
    const caja = document.getElementById('vac-resumen');
    const sub = document.getElementById('subtitulo-vacaciones');
    const btn = document.getElementById('btn-guardar-vacaciones');
    const estado = window.hojaVacaciones;
    if (!caja) return;

    if (!estado.hayTabla) {
        caja.innerHTML = `<div class="vac-aviso">Falta correr <b>sql/vacaciones.sql</b> en la base para poder cargar vacaciones.</div>`;
        if (btn) btn.disabled = true;
        return;
    }
    if (!estado.guardando && sub) sub.innerText = '';

    const inicio = window.fechaDeRegistro(estado.desde);
    if (!inicio) { caja.innerHTML = ''; return; }
    const relevo = estado.relevoId
        ? (window.todosLosEmpleadosData || []).find(e => String(e.id) === estado.relevoId) : null;

    const avisos = [];
    const yo = yoMismo();
    const pisaLasMias = !!yo && window.vacacionesVigentesDe(yo.id).some(v => sePisan(estado.desde, estado.semanas, v));
    if (pisaLasMias) avisos.push('Ya tienes vacaciones cargadas en esas semanas.');
    if (relevo && window.vacacionesDe(relevo.id).some(v => sePisan(estado.desde, estado.semanas, v))) {
        avisos.push(`${window.sanitizeForHTML(String(relevo.name || '').split(' ')[0])} también está de vacaciones en esas semanas.`);
    }

    const tramo = window.textoDeTramoVacaciones(inicio, estado.semanas);
    caja.innerHTML = `
        ${avisos.map(a => `<div class="vac-aviso">${a}</div>`).join('')}
        <p><b>${tramo}</b>${relevo ? ` · te releva <b>${window.sanitizeForHTML(relevo.name || '')}</b>` : ''}.</p>
        <p>Tus encuestas semanales de esas semanas no te cuentan: las contesta ${relevo ? 'tu relevo' : 'quien te releve'} y le cuentan a él. Lo mensual o más largo lo pones al corriente al volver, igual que las revisiones.</p>`;

    // Que el relevo también esté fuera sólo se avisa: puede ser a propósito.
    if (btn) btn.disabled = estado.guardando || !relevo || pisaLasMias;
};

window.guardarHojaVacaciones = async () => {
    const estado = window.hojaVacaciones;
    const yo = yoMismo();
    if (!yo || estado.guardando) return;

    if (!estado.relevoId) { alert('Elige quién te va a relevar.'); return; }
    if (String(estado.relevoId) === String(yo.id)) { alert('No puedes relevarte a ti mismo.'); return; }
    if (window.vacacionesVigentesDe(yo.id).some(v => sePisan(estado.desde, estado.semanas, v))) {
        alert('Ya tienes vacaciones cargadas en esas semanas. Revierte las anteriores si quieres cambiarlas.');
        return;
    }

    const sub = document.getElementById('subtitulo-vacaciones');
    const btn = document.getElementById('btn-guardar-vacaciones');
    estado.guardando = true;
    if (btn) btn.disabled = true;
    if (sub) sub.innerText = 'Guardando…';
    try {
        await window.guardarVacaciones({
            empleadoId: yo.id, relevoId: estado.relevoId,
            desde: estado.desde, semanas: estado.semanas
        });
        estado.relevoId = null;
        estado.busqueda = '';
        const buscador = document.getElementById('vac-buscar-relevo');
        if (buscador) buscador.value = '';
        window.alCambiarVacaciones();
    } catch (e) {
        alert('No se pudieron cargar las vacaciones: ' + e.message);
    } finally {
        estado.guardando = false;
        if (sub) sub.innerText = '';
        window.pintarHojaVacaciones();
    }
};

window.revertirHojaVacaciones = async (id) => {
    const v = (window.VACACIONES || []).find(x => String(x.id) === String(id));
    if (!v) return;
    const tramo = window.textoDeTramoVacaciones(window.inicioDeVacaciones(v), v.semanas);
    if (!confirm(`¿Revertir tus vacaciones del ${tramo}?\n\nTus encuestas de esas semanas te vuelven a tocar a ti, y a tu relevo se le quitan.`)) return;

    const sub = document.getElementById('subtitulo-vacaciones');
    if (sub) sub.innerText = 'Revirtiendo…';
    try {
        await window.revertirVacaciones(id);
        window.alCambiarVacaciones();
    } catch (e) {
        alert('No se pudieron revertir: ' + e.message);
    } finally {
        if (sub) sub.innerText = '';
        window.pintarHojaVacaciones();
    }
};

// Lo que hay detrás de la hoja habla de otra cosa en cuanto cambian las
// vacaciones: los pendientes, el badge y la tarjeta de encuestas del inicio.
window.alCambiarVacaciones = () => {
    const yo = yoMismo();
    const hojaPendientes = document.getElementById('modal-pendientes');
    if (hojaPendientes && hojaPendientes.style.display !== 'none' && window.mostrandoPendientes) {
        window.cargarVistaPendientes('PROPIOS');
    }
    if (window.refrescarTarjetaDeEncuestas) window.refrescarTarjetaDeEncuestas();
    if (yo && window.calcularPendientesBatch) window.calcularPendientesBatch([yo.id]);
};
