// ==========================================
// GESTIONAR INFORMACIÓN
// ==========================================
// El personal, los departamentos, los puestos, los encargos, las áreas, las
// plantas con sus líneas y la cadena de mando: todo lo que la aplicación da por
// sabido cuando decide a quién le toca una encuesta, quién la califica o quién
// firma un registro. Hasta ahora eso se editaba —cuando se podía— desde el
// panel de refacciones, que es otro documento y otra pantalla, o no se editaba
// en ningún sitio: un departamento mal escrito partía en dos las estadísticas y
// la única salida era el editor SQL de Supabase.
//
// Se entra por «👥 Gestionar información» del panel de administración.
//
// **Es una hoja con muchas pantallas, no muchas hojas.** Se dibujan todas en
// `#cuerpo-gestion` y el encabezado dice en cuál se está, como la hoja de
// evaluaciones y la de consumo: apilar hojas dejaría dos tiradores a la vista,
// que es lo que esta aplicación no hace en ningún sitio. Por dónde se ha
// pasado lo lleva `window.rutaGestion`, una pila, y de ahí sale la flecha de
// volver del encabezado.
//
// **Nada se decide dos veces.** Lo que comparte con la pantalla de refacciones
// —cómo se consulta la tabla de empleados, cómo se leen sus columnas de lista y
// qué se barre al eliminar a alguien— vive en `1-config.js`, no aquí: dos
// copias de esa lista dejarían historial sin dueño en cuanto una se quedara
// atrás.
//
// **Y toda escritura cuenta las filas del `.select()`.** PostgREST responde con
// éxito a un update o un delete que las políticas de RLS rechazan: simplemente
// afecta a cero filas, y sin ese conteo la pantalla diría «guardado» mientras
// el cambio nunca llegó a la base. Las políticas van por operación, así que una
// tabla puede dejar actualizar y no borrar.

// Lo que se está mirando. Lo llena `window.cargarDatosGestion` y lo leen todas
// las pantallas, que dibujan desde aquí sin volver a consultar.
window.gestionDatos = null;

// La pila de pantallas: la última es la que se ve. Cada una es
// `{ tipo, … }` y `window.PANTALLAS_GESTION` dice cómo se dibuja.
window.rutaGestion = [];

// Lo tecleado en el buscador del encabezado, que vive fuera del cuerpo que se
// repinta: dentro, cada letra se llevaría el foco por delante.
window.filtroGestion = '';

// Lo que se está editando en la ficha de una persona y no cabe en un campo:
// los encargos y las líneas, que son listas y se marcan a golpe de chip.
window.fichaGestion = null;

// Los valores del catálogo que se está mirando, por índice: la clasificación,
// el puesto o el encargo son texto libre y pueden traer comillas, así que a los
// `onclick` va su posición y no su nombre. Es lo mismo que hace la lista de
// clasificaciones del panel de inicio.
window.valoresGestion = [];

// Y los encargos que la ficha está ofreciendo, por índice y por lo mismo.
window.encargosDeLaFicha = [];

// Si la tabla `lineas` todavía no tiene la columna `planta_id` —el script
// sql/linea-empleados.sql no se ha corrido— las líneas se listan igual, sólo
// que sin planta que deducir ni que asignar.
window.lineasConPlanta = true;

// =========================================================
// --- LOS DATOS ---
// =========================================================

window.cargarDatosGestion = async () => {
    const [resEmp, resAreas, resPlantas] = await Promise.all([
        window.consultarEmpleados(
            'id, employee_id, name, department, puesto, encargos, lineas_ids, supervisor_id, hiring_date, is_active, avatar_url, area_id',
            'name'),
        sb.from('areas').select('id, nombre, activa').order('nombre'),
        sb.from('plantas').select('id, nombre').order('nombre')
    ]);

    // Sin la tabla de empleados no hay nada que gestionar; sin las otras tres
    // sí: cada pantalla dice lo suyo y las demás siguen en pie.
    if (resEmp.error) throw resEmp.error;

    // La columna de la planta la añade un script de sql/ que se corre a mano, y
    // pedirle a PostgREST una columna que no existe revienta la consulta
    // entera: se repite sin ella.
    let resLineas = await sb.from('lineas').select('id, nombre, planta_id').order('nombre');
    window.lineasConPlanta = !resLineas.error;
    if (resLineas.error) {
        console.warn('Las líneas todavía no tienen planta:', resLineas.error.message);
        resLineas = await sb.from('lineas').select('id, nombre').order('nombre');
    }

    window.gestionDatos = {
        empleados: resEmp.data || [],
        areas: resAreas.error ? [] : (resAreas.data || []),
        plantas: resPlantas.error ? [] : (resPlantas.data || []),
        lineas: resLineas.error ? [] : (resLineas.data || [])
    };
};

// Después de escribir. La hoja se rehace con lo que hay en la base, y con ella
// el panel de detrás: la plantilla decide quién ve qué, así que dejarlo con la
// caché vieja es enseñar el organigrama de antes hasta la próxima recarga.
window.recargarGestion = async () => {
    await window.cargarDatosGestion();
    // El listado del login se arma una vez por carga; vaciarlo basta para que
    // se rehaga cuando haga falta.
    window.empleadosLoginCache = [];
    if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();
};

// =========================================================
// --- AYUDANTES DE LECTURA ---
// =========================================================

window.empleadosGestion = () => (window.gestionDatos ? window.gestionDatos.empleados : []);
window.activoGestion = (emp) => !!emp && emp.is_active !== false;
window.empleadoGestion = (id) => window.empleadosGestion().find(e => String(e.id) === String(id)) || null;

// La cadena de mando guarda el `employee_id` de texto del jefe, no el id
// numérico de su fila: así lo resuelve el resto de la aplicación.
window.empleadoPorNumeroGestion = (numero) => {
    const n = String(numero == null ? '' : numero).trim();
    if (!n) return null;
    return window.empleadosGestion().find(e => String(e.employee_id || '').trim() === n) || null;
};

window.subordinadosGestion = (numero) => {
    const n = String(numero == null ? '' : numero).trim();
    if (!n) return [];
    return window.empleadosGestion().filter(e => String(e.supervisor_id || '').trim() === n);
};

window.areaGestion = (id) => (window.gestionDatos ? window.gestionDatos.areas : []).find(a => String(a.id) === String(id)) || null;
window.plantaGestion = (id) => (window.gestionDatos ? window.gestionDatos.plantas : []).find(p => String(p.id) === String(id)) || null;
window.lineaGestion = (id) => (window.gestionDatos ? window.gestionDatos.lineas : []).find(l => String(l.id) === String(id)) || null;

window.lineasDeEmpleadoGestion = (emp) =>
    window.normalizarIdsLineas(emp && (emp.lineas_ids || emp.lineasIds))
        .map(id => window.lineaGestion(id))
        .filter(l => l);

window.gentePorLineaGestion = (idLinea) => window.empleadosGestion()
    .filter(e => window.normalizarIdsLineas(e.lineas_ids).some(id => String(id) === String(idLinea)));

window.gentePorAreaGestion = (idArea) => window.empleadosGestion()
    .filter(e => String(e.area_id || '') === String(idArea));

// Cómo se llama cada catálogo de texto libre. No hay tabla que los respalde:
// el valor viaja en la propia fila del empleado, así que renombrar uno es
// reescribir todas las fichas que lo llevan.
window.CATALOGOS_GESTION = {
    department: { icono: '🏢', nombre: 'Departamentos', singular: 'departamento', vacio: 'Sin departamento' },
    puesto:     { icono: '🪪', nombre: 'Puestos',       singular: 'puesto',       vacio: 'Sin puesto' },
    encargos:   { icono: '🎓', nombre: 'Encargos extra', singular: 'encargo',     vacio: 'Sin encargos' }
};

// Qué lleva cada persona de ese catálogo. Los encargos son una lista y los
// otros dos un valor suelto, así que se responde siempre con una lista.
window.valoresDeEmpleadoGestion = (emp, campo) => {
    if (campo === 'encargos') return window.normalizarEncargos(emp.encargos);
    const v = String(emp[campo] || '').trim();
    return v ? [v] : [];
};

// Los valores que hay, con su gente. El orden es alfabético; lo que no tiene
// valor se cuenta aparte, porque no es un valor sino su ausencia.
window.catalogoGestion = (campo) => {
    const porValor = new Map();
    const sinValor = [];
    window.empleadosGestion().forEach(emp => {
        const suyos = window.valoresDeEmpleadoGestion(emp, campo);
        if (suyos.length === 0) { sinValor.push(emp); return; }
        suyos.forEach(v => {
            if (!porValor.has(v)) porValor.set(v, []);
            porValor.get(v).push(emp);
        });
    });
    const valores = Array.from(porValor.entries())
        .map(([valor, gente]) => ({ valor, gente }))
        .sort((a, b) => a.valor.localeCompare(b.valor, 'es'));
    return { valores, sinValor };
};

window.personasDeValorGestion = (campo, valor) => {
    if (!valor) return window.catalogoGestion(campo).sinValor;
    const fila = window.catalogoGestion(campo).valores.find(v => v.valor === valor);
    return fila ? fila.gente : [];
};

// Cuántos y cuántos de baja, que es lo que se lee de un vistazo en cada fila.
window.cuentaGestion = (gente) => {
    const total = gente.length;
    const bajas = gente.filter(e => !window.activoGestion(e)).length;
    if (total === 0) return 'Nadie';
    const texto = total === 1 ? '1 persona' : `${total} personas`;
    return bajas ? `${texto} · ${bajas} de baja` : texto;
};

// La cadena de mando de alguien, de su jefe hacia arriba. Se corta al repetir a
// alguien: un ciclo es un dato de la pantalla de supervisores, no un cuelgue.
window.cadenaDeMandoGestion = (numero) => {
    const cadena = [];
    const vistos = new Set();
    let actual = window.empleadoPorNumeroGestion(numero);
    while (actual) {
        const clave = String(actual.id);
        if (vistos.has(clave)) return { cadena, ciclo: true };
        vistos.add(clave);
        cadena.push(actual);
        actual = window.empleadoPorNumeroGestion(actual.supervisor_id);
    }
    return { cadena, ciclo: false };
};

// =========================================================
// --- ABRIR, CERRAR Y NAVEGAR ---
// =========================================================

window.abrirGestionDatos = async () => {
    if (!window.checkAdmin()) return;
    const hoja = document.getElementById('modal-gestion');
    if (!hoja) return;

    window.rutaGestion = [{ tipo: 'menu' }];
    window.filtroGestion = '';
    hoja.style.display = 'flex';
    window.pintarGestion('<div class="gestion-cargando"><div class="spinner"></div>Cargando la información…</div>');

    try {
        await window.cargarDatosGestion();
    } catch (e) {
        console.error('No se pudo cargar la información:', e);
        window.pintarGestion(`<div class="gestion-cargando">No se pudo cargar la información: ${window.sanitizeForHTML(e.message || String(e))}</div>`);
        return;
    }
    window.pintarGestion();
};

window.cerrarGestionDatos = () => {
    const hoja = document.getElementById('modal-gestion');
    if (hoja) hoja.style.display = 'none';
    // El cuerpo se vacía al cerrar, como todas las hojas que se arman con
    // innerHTML: los ids de dentro existen sólo mientras está a la vista.
    const cuerpo = document.getElementById('cuerpo-gestion');
    if (cuerpo) cuerpo.innerHTML = '';
    window.rutaGestion = [];
    window.fichaGestion = null;
    window.filtroGestion = '';
};

window.pantallaGestionActual = () => window.rutaGestion[window.rutaGestion.length - 1] || { tipo: 'menu' };

window.irAGestion = (pantalla) => {
    window.rutaGestion.push(pantalla);
    window.filtroGestion = '';
    const cuerpo = document.getElementById('cuerpo-gestion');
    if (cuerpo) cuerpo.scrollTop = 0;
    window.pintarGestion();
};

window.volverEnGestion = () => {
    if (window.rutaGestion.length > 1) window.rutaGestion.pop();
    window.filtroGestion = '';
    const cuerpo = document.getElementById('cuerpo-gestion');
    if (cuerpo) cuerpo.scrollTop = 0;
    window.pintarGestion();
};

window.filtrarGestion = (texto) => {
    window.filtroGestion = texto || '';
    window.pintarGestion();
};

// Lo que la pantalla está haciendo. Los botones del encabezado son de icono y
// no tienen texto donde decirlo, así que va al subtítulo, como en el resto de
// las hojas de la aplicación.
window.estadoGestion = (texto) => {
    const el = document.getElementById('subtitulo-gestion');
    if (el) el.innerText = texto || '';
};

// El buscador ignora acentos —nadie los teclea buscando— y mayúsculas.
window.claveBusquedaGestion = (t) => String(t == null ? '' : t)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

window.coincideGestion = (partes) => {
    const filtro = window.claveBusquedaGestion(window.filtroGestion);
    if (!filtro) return true;
    return partes.some(p => window.claveBusquedaGestion(p).includes(filtro));
};

// El pintado. Con `html` se dibuja lo que sea —cargando, un fallo— sin pantalla
// detrás; sin él, la que toque de la pila.
window.pintarGestion = (html) => {
    const cuerpo = document.getElementById('cuerpo-gestion');
    if (!cuerpo) return;

    const titulo = document.getElementById('titulo-gestion');
    const subtitulo = document.getElementById('subtitulo-gestion');
    const buscador = document.getElementById('buscador-gestion');
    const entrada = document.getElementById('inp-busqueda-gestion');
    const contador = document.getElementById('contador-gestion');
    const botones = {
        volver: document.getElementById('btn-volver-gestion'),
        borrar: document.getElementById('btn-borrar-gestion'),
        mas: document.getElementById('btn-mas-gestion'),
        guardar: document.getElementById('btn-guardar-gestion')
    };

    // Se esconden con el atributo `hidden`, y `.ios-boton-icono` es un flex: sin
    // la regla `.ios-boton-icono[hidden]` de estilos.css se verían siempre. Es
    // la trampa de `.tipos-pregunta`.
    const equipar = (btn, accion) => {
        if (!btn) return;
        btn.hidden = !accion;
        btn.onclick = accion ? accion.hacer : null;
        if (!accion) return;
        btn.title = accion.etiqueta;
        btn.setAttribute('aria-label', accion.etiqueta);
    };

    if (html !== undefined) {
        Object.values(botones).forEach(b => equipar(b, null));
        if (buscador) buscador.hidden = true;
        if (titulo) titulo.innerText = 'Gestionar información';
        if (subtitulo) subtitulo.innerText = '';
        cuerpo.innerHTML = html;
        return;
    }
    if (!window.gestionDatos) return;

    const pantalla = window.pantallaGestionActual();
    // A una ficha se puede volver desde más adentro —el equipo de esa persona,
    // y de ahí la ficha de otra—, así que lo que se está editando puede ser de
    // alguien distinto del que toca dibujar. Se repone antes de pintar.
    if (pantalla.tipo === 'ficha' &&
        (!window.fichaGestion || String(window.fichaGestion.id || '') !== String(pantalla.id || ''))) {
        window.prepararFichaGestion(pantalla.id);
    }
    const dibujar = window.PANTALLAS_GESTION[pantalla.tipo] || window.PANTALLAS_GESTION.menu;
    const vista = dibujar(pantalla);

    if (titulo) titulo.innerText = vista.titulo;
    if (subtitulo) subtitulo.innerText = vista.subtitulo || '';

    equipar(botones.volver, window.rutaGestion.length > 1
        ? { hacer: window.volverEnGestion, etiqueta: 'Volver' } : null);
    equipar(botones.borrar, vista.borrar);
    equipar(botones.mas, vista.mas);
    equipar(botones.guardar, vista.guardar);

    if (buscador) {
        buscador.hidden = !vista.buscar;
        if (vista.buscar) {
            if (entrada) {
                entrada.placeholder = vista.buscar;
                if (entrada.value !== window.filtroGestion) entrada.value = window.filtroGestion;
            }
            if (contador) contador.innerText = vista.contador || '';
        }
    }

    cuerpo.innerHTML = vista.html;
    // Las listas de chips se repintan solas cuando se marca uno, así que no
    // pueden depender de que la ficha entera se vuelva a dibujar: lo que hay
    // escrito en los campos se perdería.
    if (pantalla.tipo === 'ficha') {
        window.pintarEncargosFicha();
        window.pintarLineasFicha();
    }
};

// =========================================================
// --- LOS LADRILLOS DEL MARCADO ---
// =========================================================

window.filaGestion = (fila) => `
    <button type="button" class="gestion-fila${fila.apagado ? ' esta-apagado' : ''}" onclick="${fila.accion}">
        ${fila.figura || (fila.icono ? `<span class="gestion-fila-icono" aria-hidden="true">${fila.icono}</span>` : '')}
        <span class="gestion-fila-texto">
            <span class="gestion-fila-titulo">${fila.titulo}</span>
            ${fila.detalle ? `<span class="gestion-fila-detalle">${fila.detalle}</span>` : ''}
        </span>
        ${fila.chapa || ''}
        <span class="gestion-fila-chevron" aria-hidden="true">›</span>
    </button>`;

window.listaGestion = (filas, vacio) => filas.length
    ? `<div class="gestion-lista">${filas.join('')}</div>`
    : `<div class="gestion-vacio">${vacio || 'No hay nada que enseñar aquí.'}</div>`;

window.avatarGestion = (emp) => {
    const inicial = window.sanitizeForHTML((emp.name || '?').charAt(0).toUpperCase());
    const foto = emp.avatar_url && window.procesarUrlImagen
        ? `<img src="${window.sanitizeForHTML(window.procesarUrlImagen(emp.avatar_url))}" alt="">`
        : inicial;
    return `<span class="gestion-avatar${window.activoGestion(emp) ? '' : ' esta-de-baja'}">${foto}</span>`;
};

window.chapaBajaGestion = (emp) => window.activoGestion(emp)
    ? '' : '<span class="gestion-chapa gestion-chapa--baja">Baja</span>';

// La fila de una persona, que lleva siempre a su ficha. Es la misma en las seis
// pantallas que listan gente: si dijera cosas distintas en cada una, encontrar
// a alguien dependería de por dónde se hubiera entrado.
window.filaPersonaGestion = (emp) => {
    const detalle = [emp.employee_id, emp.puesto, emp.department]
        .filter(v => v && String(v).trim() !== '')
        .map(v => window.sanitizeForHTML(v)).join(' · ');
    return window.filaGestion({
        figura: window.avatarGestion(emp),
        titulo: window.sanitizeForHTML(emp.name || 'Sin nombre'),
        detalle: detalle,
        chapa: window.chapaBajaGestion(emp),
        apagado: !window.activoGestion(emp),
        accion: `window.abrirFichaGestion(${emp.id})`
    });
};

window.listaPersonasGestion = (gente, vacio) => window.listaGestion(
    gente.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))
        .map(e => window.filaPersonaGestion(e)),
    vacio || 'Nadie.');

// Un aviso de los que explican en vez de reclamar: por qué una fila no se puede
// borrar, qué script falta, qué se va a cambiar en cuántas fichas.
window.notaGestion = (texto, tono) =>
    `<div class="gestion-nota${tono ? ' gestion-nota--' + tono : ''}">${texto}</div>`;

// Un `<select>` con su botón de crear al lado y el campo de texto que ese botón
// enseña. Va así y no con `prompt()`, que en iOS capitaliza la primera letra y
// se dibuja como un aviso del navegador encima de la aplicación instalada.
window.campoConNuevoGestion = (idSelect, opciones, idNuevo, marcador) => `
    <div class="gestion-campo-doble">
        <select id="${idSelect}">${opciones}</select>
        <button type="button" class="gestion-btn-mas" onclick="window.alternarNuevoGestion('${idNuevo}')"
                title="${window.sanitizeForHTML(marcador)}" aria-label="${window.sanitizeForHTML(marcador)}">+</button>
    </div>
    <input type="text" id="${idNuevo}" class="gestion-nuevo" hidden placeholder="${window.sanitizeForHTML(marcador)}" autocomplete="off">`;

// Lo escrito en el campo nuevo manda sobre lo elegido en el desplegable: quien
// se molestó en escribirlo es porque no estaba en la lista.
window.valorDeCampoGestion = (idSelect, idNuevo) => {
    const nuevo = document.getElementById(idNuevo);
    if (nuevo && !nuevo.hidden && String(nuevo.value || '').trim() !== '') return nuevo.value.trim();
    const sel = document.getElementById(idSelect);
    return sel ? String(sel.value || '').trim() : '';
};

window.alternarNuevoGestion = (idNuevo) => {
    const campo = document.getElementById(idNuevo);
    if (!campo) return;
    campo.hidden = !campo.hidden;
    if (!campo.hidden) campo.focus(); else campo.value = '';
};

// =========================================================
// --- LAS PANTALLAS ---
// =========================================================

window.PANTALLAS_GESTION = {};

// --- El índice ---
window.PANTALLAS_GESTION.menu = () => {
    const d = window.gestionDatos;
    const gente = window.empleadosGestion();
    const bajas = gente.filter(e => !window.activoGestion(e)).length;

    const cat = (campo) => {
        const { valores, sinValor } = window.catalogoGestion(campo);
        const nombre = window.CATALOGOS_GESTION[campo].nombre.toLowerCase();
        return `${valores.length} ${nombre}` + (sinValor.length ? ` · ${sinValor.length} sin asignar` : '');
    };

    const areasActivas = d.areas.filter(a => a.activa !== false).length;
    const areasApagadas = d.areas.length - areasActivas;

    const jefes = new Set();
    let sinSupervisor = 0;
    gente.forEach(e => {
        const sup = String(e.supervisor_id || '').trim();
        if (sup) jefes.add(sup);
        else if (window.activoGestion(e)) sinSupervisor++;
    });

    const filas = [
        window.filaGestion({
            icono: '👥', titulo: 'Personal',
            detalle: `${gente.length} ficha${gente.length === 1 ? '' : 's'}` + (bajas ? ` · ${bajas} de baja` : ''),
            accion: 'window.abrirPersonalGestion()'
        }),
        window.filaGestion({
            icono: window.CATALOGOS_GESTION.department.icono, titulo: 'Departamentos',
            detalle: cat('department'), accion: "window.abrirCatalogoGestion('department')"
        }),
        window.filaGestion({
            icono: window.CATALOGOS_GESTION.puesto.icono, titulo: 'Puestos',
            detalle: cat('puesto'), accion: "window.abrirCatalogoGestion('puesto')"
        }),
        window.filaGestion({
            icono: window.CATALOGOS_GESTION.encargos.icono, titulo: 'Encargos extra',
            detalle: cat('encargos'), accion: "window.abrirCatalogoGestion('encargos')"
        }),
        window.filaGestion({
            icono: '📍', titulo: 'Áreas',
            detalle: `${areasActivas} activa${areasActivas === 1 ? '' : 's'}` + (areasApagadas ? ` · ${areasApagadas} apagada${areasApagadas === 1 ? '' : 's'}` : ''),
            accion: 'window.abrirAreasGestion()'
        }),
        window.filaGestion({
            icono: '🏭', titulo: 'Plantas y líneas',
            detalle: `${d.plantas.length} planta${d.plantas.length === 1 ? '' : 's'} · ${d.lineas.length} línea${d.lineas.length === 1 ? '' : 's'}`,
            accion: 'window.abrirLineasGestion()'
        }),
        window.filaGestion({
            icono: '🧭', titulo: 'Supervisores',
            detalle: `${jefes.size} con gente a cargo` + (sinSupervisor ? ` · ${sinSupervisor} sin supervisor` : ''),
            accion: 'window.abrirSupervisoresGestion()'
        })
    ];

    return {
        titulo: 'Gestionar información',
        subtitulo: 'Modo administrador',
        html: window.listaGestion(filas) + window.notaGestion(
            'Todo lo que se cambia aquí es lo que la aplicación usa para decidir a quién le toca una encuesta, quién la califica y quién firma un registro.')
    };
};

// --- El personal ---
window.abrirPersonalGestion = () => window.irAGestion({ tipo: 'personal' });

window.PANTALLAS_GESTION.personal = () => {
    const gente = window.empleadosGestion();
    const visibles = gente.filter(e => window.coincideGestion([
        e.name, e.employee_id, e.puesto, e.department,
        window.normalizarEncargos(e.encargos).join(' '),
        window.lineasDeEmpleadoGestion(e).map(l => l.nombre).join(' ')
    ]));

    // Los de baja al final: lo que se busca casi siempre es alguien que está.
    const orden = visibles.slice().sort((a, b) => {
        const va = window.activoGestion(a) ? 0 : 1;
        const vb = window.activoGestion(b) ? 0 : 1;
        if (va !== vb) return va - vb;
        return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });

    return {
        titulo: 'Personal',
        subtitulo: `${gente.length} ficha${gente.length === 1 ? '' : 's'}`,
        buscar: 'Buscar por nombre, número, puesto…',
        contador: `${orden.length} de ${gente.length}`,
        mas: { etiqueta: 'Nueva ficha', hacer: () => window.abrirFichaGestion(null) },
        html: window.listaGestion(orden.map(e => window.filaPersonaGestion(e)),
            'Nadie coincide con la búsqueda.')
    };
};

// --- La ficha de una persona ---
// Lo que no cabe en un campo —los encargos y las líneas, que son listas— vive
// en `window.fichaGestion` mientras la ficha está a la vista: sus chips se
// repintan solos sin rehacer el formulario, o lo escrito y sin guardar se
// perdería a cada toque.
window.prepararFichaGestion = (id) => {
    const emp = id ? window.empleadoGestion(id) : null;
    window.fichaGestion = {
        id: emp ? emp.id : null,
        encargos: new Set(emp ? window.normalizarEncargos(emp.encargos) : []),
        lineas: new Set(emp ? window.normalizarIdsLineas(emp.lineas_ids).map(String) : []),
        encargosNuevos: []
    };
    return emp;
};

window.abrirFichaGestion = (id) => {
    const emp = window.prepararFichaGestion(id);
    window.irAGestion({ tipo: 'ficha', id: emp ? emp.id : null });
};

window.PANTALLAS_GESTION.ficha = (p) => {
    const emp = p.id ? window.empleadoGestion(p.id) : null;
    const d = window.gestionDatos;

    const opciones = (valores, elegido, vacio) => {
        let html = `<option value="">${window.sanitizeForHTML(vacio)}</option>`;
        valores.forEach(v => {
            const marcado = String(v.valor) === String(elegido == null ? '' : elegido) ? ' selected' : '';
            html += `<option value="${window.sanitizeForHTML(v.valor)}"${marcado}>${window.sanitizeForHTML(v.texto)}</option>`;
        });
        return html;
    };

    const deCatalogo = (campo) => {
        const valores = window.catalogoGestion(campo).valores.map(v => ({ valor: v.valor, texto: v.valor }));
        const actual = emp ? String(emp[campo] || '').trim() : '';
        // El valor que ya tiene se ofrece aunque no lo lleve nadie más, o abrir
        // su ficha se lo borraría sin querer.
        if (actual && !valores.some(v => v.valor === actual)) valores.push({ valor: actual, texto: actual });
        valores.sort((a, b) => a.valor.localeCompare(b.valor, 'es'));
        return valores;
    };

    // El supervisor se elige por su `employee_id`, que es lo que guarda la
    // columna. Se listan los activos con número, más el que ya tuviera aunque
    // esté de baja: si no, guardar la ficha se lo quitaría en silencio.
    const supActual = emp ? String(emp.supervisor_id || '').trim() : '';
    const jefes = window.empleadosGestion()
        .filter(e => e.employee_id && (!emp || String(e.id) !== String(emp.id)))
        .filter(e => window.activoGestion(e) || String(e.employee_id).trim() === supActual)
        .map(e => ({
            valor: String(e.employee_id).trim(),
            texto: e.name + (window.activoGestion(e) ? '' : ' (de baja)')
        }))
        .sort((a, b) => a.texto.localeCompare(b.texto, 'es'));

    const areas = d.areas
        .filter(a => a.activa !== false || (emp && String(emp.area_id || '') === String(a.id)))
        .map(a => ({ valor: String(a.id), texto: a.nombre + (a.activa === false ? ' (apagada)' : '') }));

    const aCargo = emp && emp.employee_id ? window.subordinadosGestion(emp.employee_id) : [];

    const html = `
        <div class="hoja-grupo-titulo">Datos</div>
        <div class="hoja-grupo">
            <div class="form-group">
                <label for="gest-emp-nombre">Nombre</label>
                <input type="text" id="gest-emp-nombre" value="${window.sanitizeForHTML(emp ? emp.name : '')}" placeholder="Ej. Juan Pérez López" autocomplete="off">
            </div>
            <div class="form-group">
                <label for="gest-emp-numero">Número de empleado</label>
                <input type="text" id="gest-emp-numero" value="${window.sanitizeForHTML(emp ? emp.employee_id : '')}" placeholder="Ej. 10452" autocomplete="off">
            </div>
            <div class="form-group">
                <label for="gest-emp-ingreso">Fecha de ingreso</label>
                <input type="date" id="gest-emp-ingreso" value="${window.sanitizeForHTML(emp ? (emp.hiring_date || '') : '')}">
            </div>
            <label class="eval-opcion">
                <input type="checkbox" id="gest-emp-activo" ${!emp || window.activoGestion(emp) ? 'checked' : ''}>
                <span class="eval-opcion-texto">
                    <span class="eval-opcion-titulo">Activo</span>
                    <span class="eval-opcion-ayuda">Dar de baja conserva todo su historial y lo saca de los pendientes, de las encuestas y de los conteos.</span>
                </span>
            </label>
        </div>

        <div class="hoja-grupo-titulo">Puesto y departamento</div>
        <div class="hoja-grupo">
            <div class="form-group">
                <label for="gest-emp-puesto">Puesto</label>
                ${window.campoConNuevoGestion('gest-emp-puesto',
                    opciones(deCatalogo('puesto'), emp ? emp.puesto : '', 'Sin puesto'),
                    'gest-emp-puesto-nuevo', 'Nombre del nuevo puesto')}
            </div>
            <div class="form-group">
                <label for="gest-emp-departamento">Departamento</label>
                ${window.campoConNuevoGestion('gest-emp-departamento',
                    opciones(deCatalogo('department'), emp ? emp.department : '', 'Sin departamento'),
                    'gest-emp-departamento-nuevo', 'Nombre del nuevo departamento')}
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Encargos extra</label>
                <div class="gestion-campo-doble">
                    <input type="text" id="gest-emp-encargo-nuevo" placeholder="Agregar un encargo" autocomplete="off"
                           onkeypress="if (event.key === 'Enter') { event.preventDefault(); window.agregarEncargoFicha(); }">
                    <button type="button" class="gestion-btn-mas" onclick="window.agregarEncargoFicha()" title="Agregar encargo" aria-label="Agregar encargo">+</button>
                </div>
                <div id="gestion-encargos" class="gestion-chips"></div>
            </div>
        </div>

        <div class="hoja-grupo-titulo">Organización</div>
        <div class="hoja-grupo">
            <div class="form-group">
                <label for="gest-emp-supervisor">Supervisor</label>
                <select id="gest-emp-supervisor">${opciones(jefes, supActual, 'Sin supervisor')}</select>
            </div>
            <div class="form-group">
                <label for="gest-emp-area">Área</label>
                ${window.campoConNuevoGestion('gest-emp-area',
                    opciones(areas, emp ? emp.area_id : '', 'Sin área'),
                    'gest-emp-area-nueva', 'Nombre de la nueva área')}
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label>Líneas</label>
                <div id="gestion-lineas" class="gestion-chips"></div>
                <div id="gestion-planta-derivada" class="gestion-pie"></div>
            </div>
        </div>

        ${emp ? `
        <div class="hoja-grupo-titulo">A su cargo</div>
        ${window.listaGestion([window.filaGestion({
            icono: '🧭',
            titulo: 'Su equipo',
            detalle: aCargo.length ? window.cuentaGestion(aCargo) : 'Nadie le reporta',
            accion: `window.abrirEquipoGestion('${window.sanitizeForHTML(emp.employee_id || '')}')`
        })])}` : ''}
    `;

    return {
        titulo: emp ? (emp.name || 'Ficha') : 'Nueva ficha',
        subtitulo: emp ? `#${emp.employee_id || 'sin número'}` : 'Alta de personal',
        guardar: { etiqueta: 'Guardar la ficha', hacer: window.guardarFichaGestion },
        borrar: emp ? { etiqueta: 'Eliminar a esta persona', hacer: window.borrarFichaGestion } : null,
        html: html
    };
};

// Los chips de los encargos. Se repintan solos, sin rehacer la ficha: dentro
// hay campos escritos y sin guardar.
window.pintarEncargosFicha = () => {
    const contenedor = document.getElementById('gestion-encargos');
    if (!contenedor || !window.fichaGestion) return;

    const todos = new Set();
    window.fichaGestion.encargos.forEach(v => todos.add(v));
    window.fichaGestion.encargosNuevos.forEach(v => todos.add(v));
    window.catalogoGestion('encargos').valores.forEach(v => todos.add(v.valor));

    const lista = Array.from(todos).sort((a, b) => a.localeCompare(b, 'es'));
    window.encargosDeLaFicha = lista;

    if (lista.length === 0) {
        contenedor.innerHTML = '<span class="gestion-pie">Todavía no hay encargos; el primero se escribe arriba.</span>';
        return;
    }
    contenedor.innerHTML = lista.map((v, i) => {
        const puesto = window.fichaGestion.encargos.has(v);
        return `<button type="button" class="gestion-chip${puesto ? ' esta-puesto' : ''}" onclick="window.alternarEncargoFicha(${i})">${window.sanitizeForHTML(v)}${puesto ? ' ✕' : ''}</button>`;
    }).join('');
};

window.alternarEncargoFicha = (i) => {
    const valor = (window.encargosDeLaFicha || [])[i];
    if (!valor || !window.fichaGestion) return;
    if (window.fichaGestion.encargos.has(valor)) window.fichaGestion.encargos.delete(valor);
    else window.fichaGestion.encargos.add(valor);
    window.pintarEncargosFicha();
};

window.agregarEncargoFicha = () => {
    const campo = document.getElementById('gest-emp-encargo-nuevo');
    if (!campo || !window.fichaGestion) return;
    const valor = String(campo.value || '').trim();
    if (!valor) return;
    if (!window.fichaGestion.encargosNuevos.includes(valor)) window.fichaGestion.encargosNuevos.push(valor);
    window.fichaGestion.encargos.add(valor);
    campo.value = '';
    window.pintarEncargosFicha();
};

// Los chips de las líneas, agrupados por su planta: leer «Planta CIVAC: Línea
// 1, Línea 2» de corrido es lo que dice de un vistazo dónde trabaja alguien.
window.pintarLineasFicha = () => {
    const contenedor = document.getElementById('gestion-lineas');
    const pie = document.getElementById('gestion-planta-derivada');
    if (!contenedor || !window.fichaGestion) return;

    const lineas = window.gestionDatos.lineas;
    if (lineas.length === 0) {
        contenedor.innerHTML = '<span class="gestion-pie">No hay líneas registradas. Se dan de alta en «Plantas y líneas».</span>';
        if (pie) pie.innerText = '';
        return;
    }

    const grupos = new Map();
    lineas.forEach(l => {
        const planta = window.plantaGestion(l.planta_id);
        const clave = planta ? planta.nombre : 'Sin planta';
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(l);
    });
    const ordenados = Array.from(grupos.entries()).sort((a, b) => {
        if (a[0] === 'Sin planta') return 1;
        if (b[0] === 'Sin planta') return -1;
        return a[0].localeCompare(b[0], 'es');
    });

    contenedor.innerHTML = ordenados.map(([planta, suyas]) => `
        <div class="gestion-grupo-chips">
            <div class="gestion-grupo-chips-titulo">${window.sanitizeForHTML(planta)}</div>
            <div>${suyas.map(l => {
                const puesta = window.fichaGestion.lineas.has(String(l.id));
                return `<button type="button" class="gestion-chip${puesta ? ' esta-puesto' : ''}" onclick="window.alternarLineaFicha('${l.id}')">${window.sanitizeForHTML(l.nombre)}${puesta ? ' ✕' : ''}</button>`;
            }).join('')}</div>
        </div>`).join('');

    // La planta no se elige: se deduce de las líneas marcadas, así que las dos
    // no pueden contradecirse.
    if (pie) {
        const suyas = lineas.filter(l => window.fichaGestion.lineas.has(String(l.id)));
        const plantas = [...new Set(suyas.map(l => (window.plantaGestion(l.planta_id) || {}).nombre).filter(n => n))]
            .sort((a, b) => a.localeCompare(b, 'es'));
        if (suyas.length === 0) pie.innerText = 'La planta se toma de las líneas que marques.';
        else if (plantas.length === 0) pie.innerText = 'Ninguna de sus líneas tiene planta asignada.';
        else pie.innerText = (plantas.length === 1 ? 'Planta: ' : 'Plantas: ') + plantas.join(', ');
    }
};

window.alternarLineaFicha = (id) => {
    if (!window.fichaGestion) return;
    const clave = String(id);
    if (window.fichaGestion.lineas.has(clave)) window.fichaGestion.lineas.delete(clave);
    else window.fichaGestion.lineas.add(clave);
    window.pintarLineasFicha();
};

// --- Un catálogo de texto libre: departamentos, puestos, encargos ---
window.abrirCatalogoGestion = (campo) => window.irAGestion({ tipo: 'catalogo', campo });

window.PANTALLAS_GESTION.catalogo = (p) => {
    const cat = window.CATALOGOS_GESTION[p.campo];
    const { valores, sinValor } = window.catalogoGestion(p.campo);
    const visibles = valores.filter(v => window.coincideGestion([v.valor]));
    window.valoresGestion = visibles.map(v => v.valor);

    const filas = visibles.map((v, i) => window.filaGestion({
        icono: cat.icono,
        titulo: window.sanitizeForHTML(v.valor),
        detalle: window.cuentaGestion(v.gente),
        accion: `window.abrirValorGestion(${i})`
    }));

    if (sinValor.length && !window.filtroGestion) {
        filas.push(window.filaGestion({
            icono: '—',
            titulo: window.sanitizeForHTML(cat.vacio),
            detalle: window.cuentaGestion(sinValor),
            accion: 'window.abrirValorGestion(-1)'
        }));
    }

    return {
        titulo: cat.nombre,
        subtitulo: `${valores.length} en uso`,
        buscar: `Buscar ${cat.singular}…`,
        contador: `${visibles.length} de ${valores.length}`,
        html: window.listaGestion(filas, `Ningún ${cat.singular} coincide con la búsqueda.`) +
            window.notaGestion(`No hay catálogo que respalde esto: el ${cat.singular} viaja en la ficha de cada persona, así que aquí sólo salen los que alguien lleva puestos. Uno nuevo se escribe en la ficha.`)
    };
};

// El índice −1 es la fila de los que no llevan ninguno, que no es un valor sino
// su ausencia: se puede mirar quiénes son, pero no renombrarla ni quitarla.
window.abrirValorGestion = (i) => {
    const pantalla = window.pantallaGestionActual();
    const valor = i < 0 ? '' : (window.valoresGestion[i] || '');
    if (i >= 0 && !valor) return;
    window.irAGestion({ tipo: 'valor', campo: pantalla.campo, valor });
};

window.PANTALLAS_GESTION.valor = (p) => {
    const cat = window.CATALOGOS_GESTION[p.campo];
    const gente = window.personasDeValorGestion(p.campo, p.valor);

    const encabezado = p.valor ? `
        <div class="hoja-grupo-titulo">Nombre</div>
        <div class="hoja-grupo">
            <div class="form-group" style="margin-bottom:0;">
                <label for="gest-valor-nombre">Cómo se llama</label>
                <input type="text" id="gest-valor-nombre" value="${window.sanitizeForHTML(p.valor)}" autocomplete="off">
            </div>
        </div>
        ${window.notaGestion(`Renombrarlo lo cambia en las ${gente.length} ficha${gente.length === 1 ? '' : 's'} que lo llevan. Si escribes el nombre de otro ${cat.singular} que ya existe, los dos quedan fusionados en uno.`)}
        ` : window.notaGestion(`Esta gente no lleva ${p.campo === 'encargos' ? 'ningún encargo' : cat.singular}. Se le pone entrando a su ficha.`);

    return {
        titulo: p.valor || cat.vacio,
        subtitulo: window.cuentaGestion(gente),
        guardar: p.valor ? { etiqueta: `Guardar el nombre del ${cat.singular}`, hacer: window.guardarValorGestion } : null,
        borrar: p.valor && gente.length ? { etiqueta: `Quitar el ${cat.singular} a todos`, hacer: window.quitarValorGestion } : null,
        html: encabezado +
            `<div class="hoja-grupo-titulo">Quién lo lleva</div>` +
            window.listaPersonasGestion(gente)
    };
};

// --- Las áreas ---
window.abrirAreasGestion = () => window.irAGestion({ tipo: 'areas' });

window.PANTALLAS_GESTION.areas = () => {
    const areas = window.gestionDatos.areas
        .filter(a => window.coincideGestion([a.nombre]));

    const filas = areas.map(a => {
        const gente = window.gentePorAreaGestion(a.id);
        return window.filaGestion({
            icono: '📍',
            titulo: window.sanitizeForHTML(a.nombre),
            detalle: window.cuentaGestion(gente),
            chapa: a.activa === false ? '<span class="gestion-chapa">Apagada</span>' : '',
            apagado: a.activa === false,
            accion: `window.abrirAreaGestion(${a.id})`
        });
    });

    return {
        titulo: 'Áreas',
        subtitulo: `${window.gestionDatos.areas.length} en la base`,
        buscar: 'Buscar área…',
        contador: `${areas.length} de ${window.gestionDatos.areas.length}`,
        mas: { etiqueta: 'Nueva área', hacer: () => window.abrirAreaGestion(null) },
        html: window.listaGestion(filas, 'Ninguna área coincide con la búsqueda.') +
            window.notaGestion('El área es una tabla de verdad, así que un área apagada deja de ofrecerse en las fichas y en las encuestas sin tocar a quien ya la tenía puesta.')
    };
};

window.abrirAreaGestion = (id) => window.irAGestion({ tipo: 'area', id: id || null });

window.PANTALLAS_GESTION.area = (p) => {
    const area = p.id ? window.areaGestion(p.id) : null;
    const gente = area ? window.gentePorAreaGestion(area.id) : [];

    return {
        titulo: area ? area.nombre : 'Nueva área',
        subtitulo: area ? window.cuentaGestion(gente) : 'Alta de área',
        guardar: { etiqueta: 'Guardar el área', hacer: window.guardarAreaGestion },
        // Se borra sólo la que no lleva a nadie: con gente dentro, apagarla es
        // lo que hay que hacer —el área de una respuesta ya contestada sigue
        // diciendo dónde se contestó—.
        borrar: area && gente.length === 0 ? { etiqueta: 'Eliminar el área', hacer: window.borrarAreaGestion } : null,
        html: `
            <div class="hoja-grupo-titulo">Datos</div>
            <div class="hoja-grupo">
                <div class="form-group">
                    <label for="gest-area-nombre">Nombre</label>
                    <input type="text" id="gest-area-nombre" value="${window.sanitizeForHTML(area ? area.nombre : '')}" placeholder="Ej. Planta 1" autocomplete="off">
                </div>
                <label class="eval-opcion">
                    <input type="checkbox" id="gest-area-activa" ${!area || area.activa !== false ? 'checked' : ''}>
                    <span class="eval-opcion-texto">
                        <span class="eval-opcion-titulo">Activa</span>
                        <span class="eval-opcion-ayuda">Apagada deja de ofrecerse al elegir área, pero no se le quita a nadie ni desaparece de lo ya contestado.</span>
                    </span>
                </label>
            </div>
            ${area && gente.length ? window.notaGestion(`Con ${gente.length} persona${gente.length === 1 ? '' : 's'} dentro no se puede eliminar: apágala, que es lo que la retira sin borrar de dónde salió cada respuesta.`) : ''}
            ${area ? `<div class="hoja-grupo-titulo">Quién está en ella</div>${window.listaPersonasGestion(gente)}` : ''}
        `
    };
};

// --- Las plantas y sus líneas ---
window.abrirLineasGestion = () => window.irAGestion({ tipo: 'lineas' });

window.PANTALLAS_GESTION.lineas = () => {
    const d = window.gestionDatos;

    const bloqueDePlanta = (planta, suyas) => {
        const filas = suyas
            .filter(l => window.coincideGestion([l.nombre, planta ? planta.nombre : 'Sin planta']))
            .map(l => window.filaGestion({
                icono: '⚙️',
                titulo: window.sanitizeForHTML(l.nombre),
                detalle: window.cuentaGestion(window.gentePorLineaGestion(l.id)),
                accion: `window.abrirLineaGestion(${l.id})`
            }));
        if (filas.length === 0 && window.filtroGestion) return '';
        const titulo = planta
            ? `<button type="button" class="gestion-grupo-titulo" onclick="window.abrirPlantaGestion(${planta.id})">
                   <span>${window.sanitizeForHTML(planta.nombre)}</span><span class="gestion-grupo-editar">Editar ›</span>
               </button>`
            : '<div class="hoja-grupo-titulo">Sin planta</div>';
        return titulo + window.listaGestion(filas, planta ? 'Esta planta todavía no tiene líneas.' : 'Ninguna línea suelta.');
    };

    const conPlanta = d.plantas.map(planta =>
        bloqueDePlanta(planta, d.lineas.filter(l => String(l.planta_id || '') === String(planta.id))));
    const huerfanas = d.lineas.filter(l => !window.plantaGestion(l.planta_id));

    return {
        titulo: 'Plantas y líneas',
        subtitulo: `${d.plantas.length} planta${d.plantas.length === 1 ? '' : 's'} · ${d.lineas.length} línea${d.lineas.length === 1 ? '' : 's'}`,
        buscar: 'Buscar línea o planta…',
        html: `
            <div class="gestion-acciones">
                <button type="button" class="admin-btn" onclick="window.abrirPlantaGestion(null)"><span aria-hidden="true">🏭</span><span data-texto>Nueva planta</span></button>
                <button type="button" class="admin-btn" onclick="window.abrirLineaGestion(null)"><span aria-hidden="true">⚙️</span><span data-texto>Nueva línea</span></button>
            </div>
            ${conPlanta.join('')}
            ${huerfanas.length ? bloqueDePlanta(null, huerfanas) : ''}
            ${window.lineasConPlanta ? '' : window.notaGestion('La tabla de líneas todavía no tiene la columna de planta: ejecuta <b>sql/linea-empleados.sql</b> en Supabase para poder agruparlas.', 'aviso')}
        `
    };
};

window.abrirPlantaGestion = (id) => window.irAGestion({ tipo: 'planta', id: id || null });

window.PANTALLAS_GESTION.planta = (p) => {
    const planta = p.id ? window.plantaGestion(p.id) : null;
    const suyas = planta ? window.gestionDatos.lineas.filter(l => String(l.planta_id || '') === String(planta.id)) : [];

    return {
        titulo: planta ? planta.nombre : 'Nueva planta',
        subtitulo: planta ? `${suyas.length} línea${suyas.length === 1 ? '' : 's'}` : 'Alta de planta',
        guardar: { etiqueta: 'Guardar la planta', hacer: window.guardarPlantaGestion },
        borrar: planta && suyas.length === 0 ? { etiqueta: 'Eliminar la planta', hacer: window.borrarPlantaGestion } : null,
        html: `
            <div class="hoja-grupo-titulo">Datos</div>
            <div class="hoja-grupo">
                <div class="form-group" style="margin-bottom:0;">
                    <label for="gest-planta-nombre">Nombre</label>
                    <input type="text" id="gest-planta-nombre" value="${window.sanitizeForHTML(planta ? planta.nombre : '')}" placeholder="Ej. Planta CIVAC" autocomplete="off">
                </div>
            </div>
            ${planta && suyas.length ? window.notaGestion(`No se puede eliminar mientras tenga ${suyas.length} línea${suyas.length === 1 ? '' : 's'}: cámbialas antes de planta.`) : ''}
            ${planta ? `<div class="hoja-grupo-titulo">Sus líneas</div>${window.listaGestion(suyas.map(l => window.filaGestion({
                icono: '⚙️',
                titulo: window.sanitizeForHTML(l.nombre),
                detalle: window.cuentaGestion(window.gentePorLineaGestion(l.id)),
                accion: `window.abrirLineaGestion(${l.id})`
            })), 'Todavía ninguna.')}` : ''}
        `
    };
};

window.abrirLineaGestion = (id) => window.irAGestion({ tipo: 'linea', id: id || null });

window.PANTALLAS_GESTION.linea = (p) => {
    const linea = p.id ? window.lineaGestion(p.id) : null;
    const gente = linea ? window.gentePorLineaGestion(linea.id) : [];
    const plantas = window.gestionDatos.plantas
        .map(pl => ({ valor: String(pl.id), texto: pl.nombre }));

    let opciones = '<option value="">Sin planta</option>';
    plantas.forEach(pl => {
        const marcado = linea && String(linea.planta_id || '') === pl.valor ? ' selected' : '';
        opciones += `<option value="${pl.valor}"${marcado}>${window.sanitizeForHTML(pl.texto)}</option>`;
    });

    return {
        titulo: linea ? linea.nombre : 'Nueva línea',
        subtitulo: linea ? window.cuentaGestion(gente) : 'Alta de línea',
        guardar: { etiqueta: 'Guardar la línea', hacer: window.guardarLineaGestion },
        // Con gente que la atiende, borrarla dejaría su `lineas_ids` apuntando a
        // una línea que ya no existe: primero se les quita.
        borrar: linea && gente.length === 0 ? { etiqueta: 'Eliminar la línea', hacer: window.borrarLineaGestion } : null,
        html: `
            <div class="hoja-grupo-titulo">Datos</div>
            <div class="hoja-grupo">
                <div class="form-group">
                    <label for="gest-linea-nombre">Nombre</label>
                    <input type="text" id="gest-linea-nombre" value="${window.sanitizeForHTML(linea ? linea.nombre : '')}" placeholder="Ej. Línea 3" autocomplete="off">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label for="gest-linea-planta">Planta</label>
                    <select id="gest-linea-planta" ${window.lineasConPlanta ? '' : 'disabled'}>${opciones}</select>
                </div>
            </div>
            ${window.lineasConPlanta ? '' : window.notaGestion('La planta no se puede guardar todavía: ejecuta <b>sql/linea-empleados.sql</b> en Supabase.', 'aviso')}
            ${linea && gente.length ? window.notaGestion(`La atienden ${gente.length} persona${gente.length === 1 ? '' : 's'}, así que no se puede eliminar: quítasela primero desde su ficha.`) : ''}
            ${linea ? `<div class="hoja-grupo-titulo">Quién la atiende</div>${window.listaPersonasGestion(gente)}` : ''}
        `
    };
};

// --- La cadena de mando ---
window.abrirSupervisoresGestion = () => window.irAGestion({ tipo: 'supervisores' });

window.PANTALLAS_GESTION.supervisores = () => {
    const gente = window.empleadosGestion();

    const jefes = [];
    gente.forEach(e => {
        if (!e.employee_id) return;
        const suyos = window.subordinadosGestion(e.employee_id);
        if (suyos.length) jefes.push({ jefe: e, suyos });
    });
    jefes.sort((a, b) => b.suyos.length - a.suyos.length ||
        String(a.jefe.name || '').localeCompare(String(b.jefe.name || ''), 'es'));

    const sinSupervisor = gente.filter(e => window.activoGestion(e) && !String(e.supervisor_id || '').trim());
    // Un supervisor de baja no sale en ninguna lista pero sigue mandando: sus
    // encuestas de modo jefe no las contesta nadie.
    const jefesDeBaja = jefes.filter(j => !window.activoGestion(j.jefe));
    // Y un jefe que no está en la plantilla es un número que quedó escrito y no
    // apunta a nadie: quien lo lleve se comporta como si no tuviera supervisor.
    const numerosVivos = new Set(gente.map(e => String(e.employee_id || '').trim()).filter(n => n));
    const jefeFantasma = gente.filter(e => {
        const sup = String(e.supervisor_id || '').trim();
        return sup && !numerosVivos.has(sup);
    });
    const enCiclo = gente.filter(e => e.employee_id && window.cadenaDeMandoGestion(e.employee_id).ciclo);

    const avisos = [];
    if (enCiclo.length) avisos.push(window.notaGestion(
        `⚠️ ${enCiclo.length} ficha${enCiclo.length === 1 ? '' : 's'} en un ciclo de mando: alguien acaba siendo jefe de su propio jefe. Entra a su ficha y cámbiale el supervisor.`, 'aviso'));
    if (jefesDeBaja.length) avisos.push(window.notaGestion(
        `${jefesDeBaja.length} supervisor${jefesDeBaja.length === 1 ? '' : 'es'} está${jefesDeBaja.length === 1 ? '' : 'n'} de baja y sigue${jefesDeBaja.length === 1 ? '' : 'n'} con gente a cargo: lo que califican ellos no lo califica nadie.`, 'aviso'));
    if (jefeFantasma.length) avisos.push(window.notaGestion(
        `${jefeFantasma.length} ficha${jefeFantasma.length === 1 ? '' : 's'} apunta${jefeFantasma.length === 1 ? '' : 'n'} a un número de supervisor que no está en la plantilla; se comportan como si no tuvieran ninguno.`, 'aviso'));

    const visibles = jefes.filter(j => window.coincideGestion([j.jefe.name, j.jefe.employee_id, j.jefe.puesto, j.jefe.department]));

    const filas = visibles.map(j => window.filaGestion({
        figura: window.avatarGestion(j.jefe),
        titulo: window.sanitizeForHTML(j.jefe.name || 'Sin nombre'),
        detalle: `${j.suyos.length} a su cargo` + (j.jefe.puesto ? ' · ' + window.sanitizeForHTML(j.jefe.puesto) : ''),
        chapa: window.chapaBajaGestion(j.jefe),
        apagado: !window.activoGestion(j.jefe),
        accion: `window.abrirEquipoGestion('${window.sanitizeForHTML(j.jefe.employee_id || '')}')`
    }));

    if (sinSupervisor.length && !window.filtroGestion) {
        filas.push(window.filaGestion({
            icono: '—',
            titulo: 'Sin supervisor',
            detalle: window.cuentaGestion(sinSupervisor),
            accion: "window.abrirEquipoGestion('')"
        }));
    }

    return {
        titulo: 'Supervisores',
        subtitulo: `${jefes.length} con gente a cargo`,
        buscar: 'Buscar supervisor…',
        contador: `${visibles.length} de ${jefes.length}`,
        html: avisos.join('') + window.listaGestion(filas, 'Ningún supervisor coincide con la búsqueda.') +
            window.notaGestion('Quién califica cada encuesta sale de aquí cuando la encuesta no nombra revisores propios ni los hereda de su clasificación: la califica el jefe inmediato.')
    };
};

window.abrirEquipoGestion = (numero) => window.irAGestion({ tipo: 'equipo', numero: String(numero || '') });

window.PANTALLAS_GESTION.equipo = (p) => {
    const jefe = p.numero ? window.empleadoPorNumeroGestion(p.numero) : null;
    const suyos = p.numero
        ? window.subordinadosGestion(p.numero)
        : window.empleadosGestion().filter(e => window.activoGestion(e) && !String(e.supervisor_id || '').trim());

    const cadena = jefe ? window.cadenaDeMandoGestion(jefe.supervisor_id) : { cadena: [], ciclo: false };
    const arriba = cadena.cadena.map(e => window.sanitizeForHTML(e.name || '')).join(' → ');

    return {
        titulo: jefe ? (jefe.name || 'Equipo') : 'Sin supervisor',
        subtitulo: window.cuentaGestion(suyos),
        html: (jefe && arriba ? window.notaGestion(`Por encima: ${arriba}${cadena.ciclo ? ' ⚠️ (la cadena se muerde la cola)' : ''}`) : '') +
            (jefe ? '' : window.notaGestion('Nadie los califica cuando la encuesta no nombra revisores. Se les pone supervisor entrando a su ficha.')) +
            window.listaPersonasGestion(suyos)
    };
};

// =========================================================
// --- LAS ESCRITURAS ---
// =========================================================

// Toda escritura pasa por aquí, y no es un adorno: PostgREST responde con éxito
// a un update o un delete que las políticas de RLS rechazan —simplemente afecta
// a cero filas— y sin este conteo la pantalla diría «guardado» mientras el
// cambio nunca llegó a la base.
window.escribirGestion = async (consulta, queEs) => {
    const { data, error } = await consulta;
    if (error) throw error;
    if (!data || data.length === 0) {
        throw new Error(`La base no aplicó el cambio (${queEs}): no se tocó ninguna fila. Suele ser una política de RLS que no deja escribir en esa tabla; van por operación, así que una tabla puede dejar actualizar y no borrar.`);
    }
    // Devuelve las filas y no su cuenta: quien da de alta necesita el id que
    // acaba de nacer —el área nueva de una ficha, sin ir más lejos—.
    return data;
};

// El envoltorio de las cuatro cosas que hace toda pantalla al guardar: apagar
// los botones, decir en qué va, recargar y volver a la pantalla de atrás.
window.hacerEnGestion = async (queEs, trabajo, alTerminar) => {
    const botones = ['btn-guardar-gestion', 'btn-borrar-gestion', 'btn-mas-gestion']
        .map(id => document.getElementById(id)).filter(b => b);
    botones.forEach(b => { b.disabled = true; });
    window.estadoGestion(queEs);

    try {
        const seguir = await trabajo();
        if (seguir === false) return false;
        window.estadoGestion('Actualizando…');
        await window.recargarGestion();
        if (typeof alTerminar === 'function') alTerminar();
        else window.volverEnGestion();
        return true;
    } catch (e) {
        console.error('No se pudo ' + queEs.toLowerCase() + ':', e);
        alert(window.mensajeDeFalloGestion(e));
        return false;
    } finally {
        botones.forEach(b => { b.disabled = false; });
        // El subtítulo lo repone la pantalla al pintarse; si no llegó a
        // repintarse —un fallo— se limpia a mano.
        if (document.getElementById('modal-gestion') &&
            document.getElementById('modal-gestion').style.display !== 'none') {
            const p = window.pantallaGestionActual();
            if (p) window.pintarGestion();
        }
    }
};

window.mensajeDeFalloGestion = (e) => {
    const texto = String((e && e.message) || e || '');
    if (e && (e.code === '23505' || texto.includes('duplicate'))) {
        return 'Ya existe otro registro con ese nombre o ese número. Ponle uno distinto.';
    }
    if (e && (e.code === '23503' || texto.includes('foreign key'))) {
        return 'La base no deja hacerlo porque hay registros que dependen de esto. Quítalos primero o desactívalo en vez de borrarlo.';
    }
    if (window.COLUMNAS_OPCIONALES_EMPLEADO.some(c => texto.includes(c))) {
        return 'A la base le falta una columna nueva de la ficha del empleado. Ejecuta en Supabase los scripts de la carpeta sql/ y vuelve a intentarlo.';
    }
    return 'No se pudo: ' + (texto || 'la base no dijo por qué.');
};

// --- Guardar una ficha ---
window.guardarFichaGestion = () => {
    const ficha = window.fichaGestion;
    if (!ficha) return;

    const nombre = String((document.getElementById('gest-emp-nombre') || {}).value || '').trim();
    const numero = String((document.getElementById('gest-emp-numero') || {}).value || '').trim();
    if (!nombre || !numero) {
        alert('El nombre y el número de empleado son obligatorios.');
        return;
    }

    const supervisor = String((document.getElementById('gest-emp-supervisor') || {}).value || '').trim();
    // Nadie es jefe de su propio jefe: la cadena se recorrería para siempre y
    // media aplicación decide por ella —quién califica, quién ve el equipo—.
    if (supervisor) {
        if (supervisor === numero) {
            alert('Nadie puede ser su propio supervisor.');
            return;
        }
        const arriba = window.cadenaDeMandoGestion(supervisor).cadena;
        if (ficha.id && arriba.some(e => String(e.id) === String(ficha.id))) {
            alert('Esa persona ya depende de ésta, así que ponerla de supervisor cerraría la cadena de mando sobre sí misma.');
            return;
        }
    }

    const campos = {
        name: nombre,
        employee_id: numero,
        puesto: window.valorDeCampoGestion('gest-emp-puesto', 'gest-emp-puesto-nuevo') || null,
        department: window.valorDeCampoGestion('gest-emp-departamento', 'gest-emp-departamento-nuevo') || null,
        encargos: Array.from(ficha.encargos),
        supervisor_id: supervisor || null,
        hiring_date: String((document.getElementById('gest-emp-ingreso') || {}).value || '') || null,
        // Las plantas no se guardan: se deducen de las líneas. Los ids van como
        // números porque la columna es bigint[].
        lineas_ids: Array.from(ficha.lineas).map(Number).filter(n => !isNaN(n)),
        is_active: !!(document.getElementById('gest-emp-activo') || {}).checked
    };

    // El área puede ser una que se acabe de escribir, y entonces hay que darla
    // de alta antes: la columna guarda su id, no su nombre.
    return window.hacerEnGestion('Guardando la ficha…', async () => {
        const areaNueva = document.getElementById('gest-emp-area-nueva');
        if (areaNueva && !areaNueva.hidden && String(areaNueva.value || '').trim() !== '') {
            // El área es una tabla de verdad y la ficha guarda su id, así que
            // hay que darla de alta antes de poder apuntarla.
            const filas = await window.escribirGestion(
                sb.from('areas').insert([{ nombre: areaNueva.value.trim() }]).select('id'),
                'dar de alta el área');
            campos.area_id = filas[0].id;
        } else {
            campos.area_id = String((document.getElementById('gest-emp-area') || {}).value || '') || null;
        }

        if (ficha.id) {
            await window.escribirGestion(
                sb.from('employees').update(campos).eq('id', ficha.id).select('id'), 'guardar la ficha');
        } else {
            await window.escribirGestion(
                sb.from('employees').insert([campos]).select('id'), 'dar de alta la ficha');
        }
    });
};

window.borrarFichaGestion = async () => {
    const ficha = window.fichaGestion;
    const emp = ficha && ficha.id ? window.empleadoGestion(ficha.id) : null;
    if (!emp) return;

    const btn = document.getElementById('btn-borrar-gestion');
    if (btn) btn.disabled = true;
    const seFue = await window.eliminarEmpleadoConHistorial(emp, window.estadoGestion);
    if (btn) btn.disabled = false;
    if (!seFue) { window.pintarGestion(); return; }

    window.estadoGestion('Actualizando…');
    await window.recargarGestion();
    window.volverEnGestion();
};

// --- Renombrar o quitar un valor de catálogo ---
// Renombrar es reescribir todas las fichas que lo llevan: no hay tabla detrás.
// Los encargos van uno a uno porque son una lista dentro de la fila, y ahí no
// vale un update en bloque.
window.guardarValorGestion = () => {
    const p = window.pantallaGestionActual();
    const cat = window.CATALOGOS_GESTION[p.campo];
    const campo = document.getElementById('gest-valor-nombre');
    const nuevo = String((campo || {}).value || '').trim();

    if (!nuevo) { alert(`El ${cat.singular} no puede quedarse sin nombre. Si lo que quieres es quitárselo a todos, usa el bote de basura del encabezado.`); return; }
    if (nuevo === p.valor) { window.volverEnGestion(); return; }

    const gente = window.personasDeValorGestion(p.campo, p.valor);
    const otros = window.catalogoGestion(p.campo).valores
        .map(v => v.valor).filter(v => v !== p.valor);
    const yaExiste = otros.includes(nuevo);
    // Y el que se escribe casi igual, que es de lo que va esta pantalla: la
    // comparación de la aplicación es exacta, así que «PRODUCCION» y
    // «Producción» son dos departamentos distintos y las estadísticas los
    // cuentan por separado. Si lo que se quería era fusionarlos, hay que
    // escribirlo clavado.
    const parecidos = yaExiste ? [] : otros.filter(v =>
        window.claveBusquedaGestion(v) === window.claveBusquedaGestion(nuevo));

    const aviso = `Se cambiará «${p.valor}» por «${nuevo}» en ${gente.length} ficha${gente.length === 1 ? '' : 's'}.` +
        (yaExiste ? `\n\nYa hay otro ${cat.singular} que se llama así, de modo que los dos quedarán fusionados en uno.` : '') +
        (parecidos.length ? `\n\n⚠️ Ya hay otro que se escribe casi igual: «${parecidos.join('», «')}». La aplicación los compara letra por letra, así que quedarán como ${cat.singular}s distintos; para fusionarlos hay que escribirlo exactamente igual.` : '') +
        '\n\n¿Seguir?';
    if (!confirm(aviso)) return;

    // Al terminar se vuelve al catálogo, que es lo que hace `hacerEnGestion` por
    // su cuenta: la pantalla que se estaba mirando habla de un valor que con ese
    // nombre ya no existe.
    return window.hacerEnGestion('Renombrando…', async () => {
        if (p.campo === 'encargos') {
            for (const emp of gente) {
                const suyos = window.normalizarEncargos(emp.encargos)
                    .map(v => (v === p.valor ? nuevo : v));
                // Fusionar puede dejarlo repetido dentro de la misma ficha.
                const sinRepetir = Array.from(new Set(suyos));
                await window.escribirGestion(
                    sb.from('employees').update({ encargos: sinRepetir }).eq('id', emp.id).select('id'),
                    'renombrar el encargo');
            }
            return;
        }
        const parche = {}; parche[p.campo] = nuevo;
        await window.escribirGestion(
            sb.from('employees').update(parche).in('id', gente.map(e => e.id)).select('id'),
            `renombrar el ${cat.singular}`);
    });
};

window.quitarValorGestion = () => {
    const p = window.pantallaGestionActual();
    const cat = window.CATALOGOS_GESTION[p.campo];
    const gente = window.personasDeValorGestion(p.campo, p.valor);
    if (!gente.length) return;

    if (!confirm(`Se le quitará el ${cat.singular} «${p.valor}» a ${gente.length} persona${gente.length === 1 ? '' : 's'}.\n\nNo se borra ninguna ficha ni ningún historial: sólo se quedan sin ${cat.singular}.\n\n¿Seguir?`)) return;

    return window.hacerEnGestion('Quitándolo…', async () => {
        if (p.campo === 'encargos') {
            for (const emp of gente) {
                const suyos = window.normalizarEncargos(emp.encargos).filter(v => v !== p.valor);
                await window.escribirGestion(
                    sb.from('employees').update({ encargos: suyos }).eq('id', emp.id).select('id'),
                    'quitar el encargo');
            }
            return;
        }
        const parche = {}; parche[p.campo] = null;
        await window.escribirGestion(
            sb.from('employees').update(parche).in('id', gente.map(e => e.id)).select('id'),
            `quitar el ${cat.singular}`);
    });
};

// --- Áreas ---
window.guardarAreaGestion = () => {
    const p = window.pantallaGestionActual();
    const nombre = String((document.getElementById('gest-area-nombre') || {}).value || '').trim();
    const activa = !!(document.getElementById('gest-area-activa') || {}).checked;
    if (!nombre) { alert('El área necesita un nombre.'); return; }

    return window.hacerEnGestion('Guardando el área…', async () => {
        if (p.id) {
            await window.escribirGestion(
                sb.from('areas').update({ nombre, activa }).eq('id', p.id).select('id'), 'guardar el área');
        } else {
            await window.escribirGestion(
                sb.from('areas').insert([{ nombre, activa }]).select('id'), 'dar de alta el área');
        }
    });
};

window.borrarAreaGestion = () => {
    const p = window.pantallaGestionActual();
    const area = p.id ? window.areaGestion(p.id) : null;
    if (!area) return;
    if (window.gentePorAreaGestion(area.id).length) return;
    if (!confirm(`¿Eliminar el área «${area.nombre}»?\n\nNo la tiene nadie puesta. Si alguna respuesta antigua la nombra, seguirá diciendo su nombre.`)) return;

    return window.hacerEnGestion('Eliminando el área…', async () => {
        await window.escribirGestion(
            sb.from('areas').delete().eq('id', area.id).select('id'), 'eliminar el área');
    });
};

// --- Plantas ---
window.guardarPlantaGestion = () => {
    const p = window.pantallaGestionActual();
    const nombre = String((document.getElementById('gest-planta-nombre') || {}).value || '').trim();
    if (!nombre) { alert('La planta necesita un nombre.'); return; }

    return window.hacerEnGestion('Guardando la planta…', async () => {
        if (p.id) {
            await window.escribirGestion(
                sb.from('plantas').update({ nombre }).eq('id', p.id).select('id'), 'guardar la planta');
        } else {
            await window.escribirGestion(
                sb.from('plantas').insert([{ nombre }]).select('id'), 'dar de alta la planta');
        }
    });
};

window.borrarPlantaGestion = () => {
    const p = window.pantallaGestionActual();
    const planta = p.id ? window.plantaGestion(p.id) : null;
    if (!planta) return;
    if (window.gestionDatos.lineas.some(l => String(l.planta_id || '') === String(planta.id))) return;
    if (!confirm(`¿Eliminar la planta «${planta.nombre}»? No tiene líneas.`)) return;

    return window.hacerEnGestion('Eliminando la planta…', async () => {
        await window.escribirGestion(
            sb.from('plantas').delete().eq('id', planta.id).select('id'), 'eliminar la planta');
    });
};

// --- Líneas ---
window.guardarLineaGestion = () => {
    const p = window.pantallaGestionActual();
    const nombre = String((document.getElementById('gest-linea-nombre') || {}).value || '').trim();
    if (!nombre) { alert('La línea necesita un nombre.'); return; }

    const campos = { nombre };
    // Sin la columna de planta no se le manda: la consulta entera fallaría.
    if (window.lineasConPlanta) {
        campos.planta_id = String((document.getElementById('gest-linea-planta') || {}).value || '') || null;
    }

    return window.hacerEnGestion('Guardando la línea…', async () => {
        if (p.id) {
            await window.escribirGestion(
                sb.from('lineas').update(campos).eq('id', p.id).select('id'), 'guardar la línea');
        } else {
            await window.escribirGestion(
                sb.from('lineas').insert([campos]).select('id'), 'dar de alta la línea');
        }
    });
};

window.borrarLineaGestion = () => {
    const p = window.pantallaGestionActual();
    const linea = p.id ? window.lineaGestion(p.id) : null;
    if (!linea) return;
    if (window.gentePorLineaGestion(linea.id).length) return;
    if (!confirm(`¿Eliminar la línea «${linea.nombre}»?\n\nNo la atiende nadie. Los equipos que estén dados de alta en ella se quedarán sin línea.`)) return;

    return window.hacerEnGestion('Eliminando la línea…', async () => {
        await window.escribirGestion(
            sb.from('lineas').delete().eq('id', linea.id).select('id'), 'eliminar la línea');
    });
};
