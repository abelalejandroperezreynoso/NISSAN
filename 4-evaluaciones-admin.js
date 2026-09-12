// ==========================================
// 4-evaluaciones-admin.js (V52: INTEGRACIÓN DE EDICIÓN Y REVISIÓN EN UNA SOLA VISTA)
// ==========================================

// Variable global para caché de preguntas
window.preguntasCacheActual = null;

// --- HELPER: VERIFICAR SUPERVISOR DIRECTO (NO RECURSIVO) ---
// La comparación vive en `1-config.js`, que la necesita para preguntarlo de
// cualquiera; aquí sólo se le pone el usuario de la sesión.
window.esSupervisorDirecto = (empleadoId) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    return !!user && window.esSupervisorDirectoDe(empleadoId, user.id);
};

// ==========================================
// QUIÉN PUEDE CALIFICAR UNA RESPUESTA
// ==========================================
// La regla está en `1-config.js` (`window.leTocaRevisar`): el jefe inmediato,
// salvo que la encuesta nombre a sus propios revisores. Lo que hace falta aquí
// es la encuesta de la respuesta, que no siempre está a mano: a esta pantalla
// se llega también desde el panel de pendientes, sin haber abierto la lista de
// encuestas.
window.cacheEncuestasRevision = {};

window.encuestaEnCache = (evaluationId) => {
    if (!evaluationId) return null;
    const id = String(evaluationId);
    if (window.evalCache && window.evalCache.evals) {
        const enCache = window.evalCache.evals.find(e => String(e.id) === id);
        if (enCache) return enCache;
    }
    return window.cacheEncuestasRevision[id] || null;
};

window.encuestaDeLaRespuesta = async (evaluationId) => {
    if (!evaluationId) return null;

    // Quién revisa puede venir de la clasificación, y esa pregunta se contesta
    // sin poder esperar: la caché se llena antes de que nadie la haga. Va antes
    // del atajo de la caché de encuestas, que si no se saltaría con la primera.
    await window.cargarRevisoresDeClasificaciones();

    const yaEsta = window.encuestaEnCache(evaluationId);
    if (yaEsta) return yaEsta;

    // Lo que hace falta para saber quién la revisa —la clasificación va porque
    // de ella se heredan los revisores—, el instante del último relanzamiento
    // —a este panel se llega también desde el inicio, sin haber pasado por la
    // lista, y es donde se dice cuándo se relanzó— y **a quién va dirigida**.
    //
    // Esos cuatro últimos campos no estaban, y es la trampa de siempre: una
    // columna que no se pidió llega `undefined`, y `leTocaEstaEncuesta` lee eso
    // como «no acota nada». Con la encuesta traída por aquí, una dirigida a
    // doce personas le tocaba a la plantilla entera: el pase de lista decía «4
    // de 455» y el botón de «Responder Encuesta» le salía a todo el que la
    // abriera desde el inicio. Por la lista no se notaba —`evalCache` se trae
    // la fila entera con `select('*')`—, así que dependía de por dónde se
    // hubiera entrado.
    //
    // Y por lo mismo va **`frequency`**, que es de donde sale el periodo: sin
    // ella, `periodoDeEncuesta` resuelve cualquier encuesta traída por aquí
    // como de «única vez» —«alguna vez», desde el origen del tiempo—, así que
    // su pantalla la titulaba «Única vez» mientras su renglón de la lista decía
    // «Mensual», el recuadro de la empresa contaba **todas** las respuestas que
    // ha tenido nunca —«126/126 · 78%» donde el mes en curso iba por «44/95 ·
    // 36%», con los de baja sumando como ajenos— y cada punto de su gráfica
    // salía acumulado en vez de ser el de su periodo, o sea una línea que sólo
    // sube. `created_at` va con ella, que es lo que decide si la encuesta ya
    // existía en el periodo que dibuja cada punto.
    //
    // `description` y `evaluates_area` son del recuadro gris de esa misma
    // pantalla: sin pedirlas, una encuesta con descripción no la enseñaba y
    // una que mide por área no lo decía.
    const campos = await window.camposConVigencia(await window.camposConRelanzamiento(await window.camposConRevisores(
        'id, title, mode, category, frequency, created_at, description, evaluates_area, '
        + 'is_obligatory, target_employees, target_positions, target_departments')));
    const { data } = await sb.from('evaluations').select(campos).eq('id', evaluationId).single();
    if (data) window.cacheEncuestasRevision[String(evaluationId)] = data;
    return data || null;
};

// Con la encuesta ya en la mano. El modo administrador puede con todo.
window.puedeCalificar = (ev, empleadoQueContesto) => {
    if (window.modoAdminActivo) return true;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    if (!user) return false;
    return window.leTocaRevisar(ev, empleadoQueContesto, user.id);
};

// --- 1. HISTORIAL Y LISTA DE RESPUESTAS ---
window.abrirHistorialEvaluacion = async (evalId, title, maintainScroll = false) => {
    window.evalIdRespondiendo = evalId;
    window.evalTituloRespondiendo = title;
    
    const container = document.getElementById('contenido-modal-evaluaciones');
    
    // CORRECCIÓN: Solo reseteamos el scroll del modal interno, NO el de la ventana de fondo
    if (!maintainScroll) {
        if (container) container.scrollTop = 0;
    }

    if (container) container.style.display = 'block';
    
    const { data: qs } = await sb.from('evaluation_questions').select('*').eq('evaluation_id', evalId).order('order_index');
    window.preguntasCacheActual = qs || [];

    // El pase de lista necesita el padrón, y a esta hoja se llega también desde
    // el inicio con la plantilla todavía sin cargar. Sólo si hay alguna
    // pregunta de asistencia: no se le cobra la consulta a quien abre una
    // encuesta que no pasa lista.
    //
    // Administrando hace falta igual, y por lo mismo: de la plantilla sale el
    // padrón sobre el que se reparten el «Resultado de la empresa» y cada punto
    // de su gráfica. Sin ella el divisor es cero, el recuadro cae a promediar
    // sólo lo calificado y la línea no se dibuja.
    if (((qs || []).some(q => window.esPreguntaDeAsistencia(q)) || window.modoAdminActivo) &&
        (window.todosLosEmpleadosData || []).length === 0 && window.cargarDatosEmpleados) {
        await window.cargarDatosEmpleados();
    }

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    // Hace falta antes de filtrar: es lo que dice si a esta persona le toca
    // revisar la encuesta aunque no sea jefe de nadie.
    const encuestaDeLaLista = await window.encuestaDeLaRespuesta(evalId);

    // Lo que llena el recuadro de la empresa y su gráfica, **lanzado aquí y
    // esperado abajo**: esta pantalla se pinta entera al final, así que una
    // consulta más en serie sería una espera más antes del primer fotograma.
    // Corre en paralelo con el material y con las respuestas y no cuesta nada.
    //
    // Y con su `catch` puesto desde ya: una promesa lanzada y esperada cinco
    // líneas más abajo pasa un rato sin nadie que la atienda, y si la red falla
    // ahí el rechazo se llevaría por delante la pantalla entera —hoy, sin esta
    // consulta, esa hoja se dibuja igual—. Sin respuestas se cae a las que la
    // pantalla ya tiene, que es exactamente lo de antes.
    const ritmoDelEje = window.ritmoDelEjeDeEncuesta
        ? window.ritmoDelEjeDeEncuesta(encuestaDeLaLista) : null;
    const empresaPendiente = (window.modoAdminActivo && encuestaDeLaLista
        && window.respuestasDelPeriodoDeTodos)
        ? window.respuestasDelPeriodoDeTodos([encuestaDeLaLista], new Date(), ritmoDelEje)
            .catch(() => null)
        : null;

    // El material de apoyo. Va aquí y no en paralelo con lo demás porque una
    // tabla que todavía no existe deja el recuadro sin dibujar y no puede
    // llevarse por delante el resto de la hoja.
    await window.cargarMaterialesEncuesta(evalId);

    let responses = [];
    const { data: todasLasRespuestas } = await sb.from('evaluation_responses').select('*').eq('evaluation_id', evalId).order('submitted_at', {ascending: false});
    if (window.modoAdminActivo) {
        responses = todasLasRespuestas || [];
    } else if (todasLasRespuestas) {
        // Quien revisa la encuesta las ve todas aunque no le toque calificar
        // cada una: con destinatarios asignados, la respuesta la califica quien
        // asignó a esa persona, pero el resto de los revisores tiene que poder
        // seguir viendo cómo va la encuesta que imparte.
        responses = todasLasRespuestas.filter(r =>
            r.employee_id === user.id ||
            window.esSupervisorDirecto(r.employee_id) ||
            window.revisoresDeEncuesta(encuestaDeLaLista).includes(String(user.id)) ||
            window.leTocaRevisar(encuestaDeLaLista, r.employee_id, user.id)
        );
    }
    
    window.respuestasCacheActual = responses || [];

    
    
    let infoHtml = '';
    let revisoresHtml = '';
    let subtituloHoja = '';
    let evalData = encuestaDeLaLista;

    if (evalData) {
        const desc = evalData.description ? `<div style="margin-bottom:5px;"><b>Descripción:</b> ${evalData.description}</div>` : '';
        
        // La frecuencia se va al subtítulo del encabezado, debajo del nombre de
        // la encuesta: es de la encuesta entera y ahí se lee sin gastar un
        // recuadro —ni la palabra «Frecuencia», que al lado del título sobra—.
        subtituloHoja = window.textoDeFrecuencia(evalData.frequency);
        const obligHtml = (evalData.is_obligatory === false) ? `<div style="font-size:0.8rem; color:#22c55e; font-weight:bold; margin-top:4px;">Encuesta Opcional</div>` : '';
        const areaHtml = (evalData.evaluates_area === true) ? `<div style="font-size:0.8rem; color:#be185d; font-weight:bold; margin-top:4px;">Mide resultados por Área</div>` : '';

        // Quién la califica se enseña **como en la hoja de detalle de una
        // clasificación** —la cara con el nombre de pila debajo— y no como un
        // renglón de texto: es el mismo dato, y leerlo de dos maneras distintas
        // en dos pantallas de la misma aplicación no lo hace más claro. Una
        // cara se reconoce antes que un nombre completo, y aquí además el
        // renglón se comía tres líneas con tres revisores.
        //
        // `filaDeRevisores` habla de un grupo de encuestas; aquí el grupo es
        // una sola, así que su `title` dice «revisa esta encuesta». Sin
        // revisores nombrados no dibuja nada: ahí califica el jefe inmediato de
        // cada quien, que es lo de siempre.
        //
        // Debajo estuvo un renglón que contaba que con destinatarios asignados
        // cada revisor califica a los suyos. Se quitó: son dos renglones de
        // letra pequeña explicando un reparto que quien revisa ya ve —le salen
        // unas respuestas y no otras—, y las caras de encima no lo necesitan
        // para leerse. Con él se fue el segundo argumento de `filaDeRevisores`.
        revisoresHtml = window.filaDeRevisores({ filas: [{ ev: evalData }] });

        // Con la frecuencia en el subtítulo y los revisores en su propio
        // recuadro, éste puede quedarse sin nada que decir: entonces no se
        // dibuja, o sería una caja gris vacía.
        if (desc || obligHtml || areaHtml) {
            infoHtml = `<div style="font-size:0.9rem; color:#475569; margin-top:5px; margin-bottom:15px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">${desc}${obligHtml}${areaHtml}</div>`;
        }
    }

    // --- LÓGICA DEL BANNER Y BOTÓN DE RESPONDER ---
    const mode = evalData ? (evalData.mode || 'self') : 'self';
    const safeTitle = title.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
    
    // Los tres van **sueltos**, sin la tarjeta blanca que los envolvía: era un
    // recuadro con borde y sombra alrededor de un botón que ya es un bloque de
    // color a todo lo ancho, o sea un marco por encima del elemento más visible
    // de la pantalla. Lo que los separa hoy es el hueco de `.eval-acciones`.
    let actionButtonHtml = '';
    if (mode === 'boss') {
        actionButtonHtml = `<button onclick="window.abrirSeleccionSubordinado('${evalId}', '${safeTitle}', 'boss')" class="eval-accion eval-accion--jefe">Evaluar a un Colaborador...</button>`;
    } else if (window.leTocaEstaEncuesta(evalData, user, window.tieneEquipoDirecto(user.id))) {
        // Sin `modoAdminActivo ||` a propósito: administrando no se está
        // mirando la encuesta de nadie en particular, y ese «||» le ofrecía
        // «Responder Encuesta» al administrador en **todas** —también en las
        // que no van dirigidas a él—, que es contestar por alguien a quien no
        // le tocaba. Si de verdad le toca, la regla de siempre se lo da igual.
        const misRespuestas = responses.filter(r => String(r.employee_id) === String(user.id));
        const btnText = misRespuestas.length > 0 ? "Volver a Responder" : "Responder Encuesta";
        actionButtonHtml = `<button onclick="window.targetUserForEval=null; window.responderDirecto('${evalId}', '${safeTitle}', 'self')" class="eval-accion eval-accion--responder">${btnText}</button>`;
    } else if (window.revisoresDeEncuesta(evalData).includes(String(user.id))) {
        // Se está aquí para calificarla, no para contestarla: la encuesta no va
        // dirigida a esta persona y el botón de responder sobra.
        actionButtonHtml = `<div class="eval-aviso-revisar">Te toca revisar esta encuesta.</div>`;
    }

    // Corregir a quién va dirigida no depende de cuál de los botones de arriba
    // haya salido: quien revisa la encuesta —el instructor que la imparte—
    // puede hacerlo tanto si además le toca contestarla como si no. Antes
    // colgaba del aviso de «te toca revisar», así que al revisor al que la
    // encuesta también le tocaba —que es lo normal— nunca le aparecía.
    //
    // Va debajo de la acción principal y con menos peso que ella: aquí se
    // viene a responder, y esto es lo secundario.
    let destinatariosBtnHtml = '';
    if (evalData && (window.modoAdminActivo || window.puedeEditarDestinatarios(evalData, user.id))) {
        destinatariosBtnHtml = `
            <button onclick="window.cerrarModalEvaluaciones(); window.editarDestinatariosEncuesta('${evalId}')"
                    class="eval-accion-secundaria">
                Editar a quién va dirigida
            </button>`;
    }

    // --- LO ÚLTIMO QUE SACÓ ESTA PERSONA AQUÍ ---
    // Es lo que viene a mirar quien abre su propia encuesta, y estaba enterrado
    // en la lista de respuestas de todo el equipo. `responses` ya viene ordenada
    // de la más reciente a la más vieja.
    //
    // **Administrando no se enseña lo suyo sino lo de la empresa**: con el modo
    // encendido no se está mirando el panel de nadie en particular, y «Tu
    // último resultado» ponía ahí el 100% de quien inició sesión como si fuera
    // el de la encuesta. Es la misma cifra de la tarjeta del panel —el promedio
    // repartido sobre el padrón, con quien no contestó en cero— y sale de la
    // misma función, que si no las dos pantallas discreparían.
    const miUltima = responses.find(r => String(r.employee_id) === String(user.id));
    // La cifra se va al encabezado, pegada al título, y su fecha al subtítulo,
    // detrás de la frecuencia: era un recuadro de 60px con un número, un rótulo
    // y una fecha, justo encima del botón que es a lo que se entra. Lo que no
    // cabe en una cifra —el rótulo y lo que explicaba su `title`— va al `title`
    // y al `aria-label` del propio número.
    let resultadoHoja = null;
    let graficaHtml = '';

    if (window.modoAdminActivo) {
        // La cifra de la empresa y su gráfica salen de **su propia consulta**,
        // acotada al eje que se va a dibujar y paginada
        // (`respuestasDelPeriodoDeTodos`), y no de las respuestas que esta
        // pantalla ya tiene a mano: aquéllas se piden con un `select('*')` sin
        // acotar y PostgREST las corta en mil, así que de una encuesta con casi
        // tres mil respuestas al mes el recuadro decía «1000/3237» mientras la
        // tarjeta del panel decía «2887/3237» de lo mismo. Es además la misma
        // función que llena esa tarjeta, así que las dos pantallas no pueden
        // discrepar.
        const ahora = new Date();
        const traidas = (empresaPendiente ? await empresaPendiente : null)
            || { respuestas: responses, tope: false };

        // Sin la ficha de la encuesta no hay padrón que repartir, y ahí no se
        // cae al resultado personal: enseñarle al administrador su propio 100%
        // como el de la encuesta es justo lo que se vino a quitar.
        const resumen = evalData && window.resumenDeEncuestaAdmin
            ? window.resumenDeEncuestaAdmin(evalData, traidas.respuestas, ahora) : null;
        const periodo = evalData ? window.periodoDeEncuesta(evalData, ahora) : null;

        // Y debajo del recuadro, cómo se ha comportado la encuesta periodo a
        // periodo: el recuadro dice dónde está hoy y la línea, si va a mejor.
        // Es la misma `graficaDeLinea` de la tarjeta del panel y el mismo
        // `historialDeRevision` que la alimenta, con una sola encuesta en vez
        // de las de la empresa, así que el último punto es —por construcción—
        // la cifra que se lee encima.
        //
        // **El eje es el de esta encuesta**, no el de meses de la tarjeta: aquí
        // no hay que mezclar frecuencias, así que una semanal se lee por semanas
        // y una trimestral por trimestres. Y **no se dibuja si la consulta llegó
        // al tope**, que es la regla de siempre: las respuestas vienen de la más
        // nueva, así que lo que se queda fuera son los periodos de atrás y la
        // línea saldría subiendo desde un suelo falso.
        if (resumen && !traidas.tope && window.historialDeRevision && window.graficaDeLinea) {
            graficaHtml = window.graficaDeLinea(window.historialDeRevision(
                { filas: [{ ev: evalData }] }, traidas.respuestas,
                { sobrePadron: true, frecuencia: ritmoDelEje }));
        }
        if (resumen) {
            const colorScore = resumen.promedio === null ? '#94a3b8' : window.getColorScore(resumen.promedio);

            // Una encuesta de «única vez» no tiene periodo —`periodoDeEncuesta`
            // la resuelve como «alguna vez»— y ahí no se dice: eso ya lo cuenta
            // la frecuencia del subtítulo, y «23/40 respuestas · alguna vez» no
            // se lee.
            const cuando = periodo && periodo.fin ? (periodo.nombre || '') : '';

            // Sin padrón no hay sobre qué repartir y la cifra sería la de lo
            // entregado, que no es lo que promete el rótulo: ahí se dice «—»,
            // como en una respuesta sin calificar.
            resultadoHoja = {
                texto: resumen.promedio === null ? '—' : `${resumen.promedio}%`,
                color: colorScore,
                etiqueta: `Resultado de la empresa. Quien no contestó cuenta como 0.${resumen.promedioContestadas !== null ? ` ${resumen.promedioContestadas}% entre quienes la contestaron.` : ''}${resumen.ajenos > 0 ? ` ${resumen.ajenos} de las respuestas son de gente que ya no está en la lista de hoy y cuentan aparte.` : ''}`
            };

            // Y lo que decía el renglón de debajo de la cifra —cuánta gente
            // contestó y de qué periodo— se va al subtítulo, detrás de la
            // frecuencia: son datos cortos y ahí se leen del tirón. Una de
            // «única vez» no lleva periodo, que eso ya lo dice la frecuencia.
            subtituloHoja = [subtituloHoja, window.textoDeRespuestasAdmin(resumen), cuando]
                .map(x => String(x || '').trim()).filter(Boolean).join(' · ');
        }
    } else if (miUltima) {
        // «Calificada» pide además que haya algo calificado: una encuesta hecha
        // sólo de firmas —o de evidencias en modo jefe— se guarda ya 'Revisado'
        // con `grades_json` vacío, y ahí `calcularScoreRespuesta` devuelve 0,
        // que se leería como haberla fallado entera. Es la misma comprobación
        // que hace `puntajeDeRespuesta` para la tarjeta del panel.
        const calificada = ['Revisado', 'Certificada'].includes(miUltima.review_status)
            && window.tieneCalificaciones(miUltima);
        const score = window.calcularScoreRespuesta(miUltima);
        const colorScore = calificada ? window.getColorScore(score) : '#94a3b8';
        const fecha = new Date(miUltima.submitted_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Va al encabezado y sigue llevando a su respuesta: el enganche es una
        // función y no un `onclick` escrito en el marcado, así que aquí ya no
        // hay nada que escapar.
        resultadoHoja = {
            texto: calificada ? `${score}%` : '—',
            color: colorScore,
            etiqueta: calificada
                ? `Tu último resultado, del ${fecha}`
                : `Tu última respuesta, del ${fecha}: todavía sin calificar`,
            alTocar: () => window.verDetalleRespuesta(miUltima)
        };

        // Y la fecha, detrás de la frecuencia. Es lo que decía el renglón de
        // debajo de la cifra, y ahí no gasta ningún recuadro.
        subtituloHoja = [subtituloHoja, fecha]
            .map(x => String(x || '').trim()).filter(Boolean).join(' · ');
    }

    // La gráfica se queda con su recuadro —es un dibujo y necesita fondo—; los
    // botones no, que ya son bloques de color a todo lo ancho. Sin ninguno de
    // los dos no se escribe nada: un contenedor vacío deja su margen.
    const bannerHtml = `
        ${graficaHtml ? `<div class="eval-grafica">${graficaHtml}</div>` : ''}
        ${(actionButtonHtml || destinatariosBtnHtml)
            ? `<div class="eval-acciones">${actionButtonHtml}${destinatariosBtnHtml}</div>` : ''}
    `;

    // El nombre de la encuesta manda en el encabezado de la hoja. La cruz se
    // vuelve la flecha de volver sólo si se llegó por la lista: dentro de una
    // encuesta a la que se entró desde ahí, lo que quiere el dedo es retroceder;
    // si se entró derecho desde el inicio, no hay lista a la que volver.
    // Y en modo administrador, el lápiz para editarla: es la pantalla que sabe
    // de qué encuesta se trata.
    window.encabezadoHojaEvaluaciones(title, window.volverALaListaDeEncuestas
        ? window.volverALaListaDeEncuestas() : () => window.cargarVistaEvaluaciones(),
        evalId, subtituloHoja, resultadoHoja);

    // La lista arranca plegada: quien abre su encuesta viene a ver lo suyo y a
    // responder, no las respuestas de los demás. Se despliega sola cuando hay
    // algo esperando la calificación de quien mira, que es el caso en el que la
    // lista sí es a lo que vino.
    const cuantasMeTocan = (window.respuestasCacheActual || []).filter(r =>
        r.review_status !== 'Revisado' && r.review_status !== 'Falsa' && r.review_status !== 'Certificada' &&
        window.puedeCalificar(window.encuestaEnCache(r.evaluation_id), r.employee_id)
    ).length;

    const avisoRevision = cuantasMeTocan > 0
        ? `<span style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; border-radius:20px; padding:2px 8px; font-size:0.72rem; font-weight:700;">${cuantasMeTocan} por revisar</span>`
        : '';

    // Cuántos de cuántos fueron. Se cuenta sobre **todas** las respuestas y no
    // sobre `responses`, que va filtrada por a quién le toca calificar cada
    // una: un pase de lista a medias no es un pase de lista. Los nombres —y
    // poder pasar lista a mano—, en cambio, sólo para quien la imparte.
    //
    // El estado se deja puesto para la hoja de pasar lista, que dibuja lo mismo
    // desde los mismos datos: así marcar a alguien no obliga a volver a
    // consultar nada.
    // Quién ve los nombres del pase de lista: el administrador y quien la
    // revisa, que son quienes la imparten.
    const imparte = window.modoAdminActivo || (evalData && window.puedeEditarDestinatarios(evalData, user.id));

    // **Aquí el material sólo se lee.** Agregarlo y quitarlo se hace en la hoja
    // de editar la encuesta, que es donde se escribe todo lo demás de ella; en
    // ésta quedan la portada de arriba —que abre el visor con todo lo
    // convertido— y, abajo, los archivos sueltos, que no entran en el visor.
    window.materialDeLaHoja = { id: evalId };
    // Se decide **antes** de armar el recuadro, que es quien la mira para no
    // repetir arriba y abajo el mismo documento. La portada se monta después,
    // cuando ya hay encabezado en el documento donde insertarla.
    window.hayPortadaEnLaHoja = window.documentosConPortada(window.materialesEncuesta).length > 0;
    const materialHtml = `<div id="material-encuesta">${window.bloqueDeMaterial(evalId, false)}</div>`;

    window.paseDeLista = {
        ev: evalData,
        preguntas: qs || [],
        respuestas: todasLasRespuestas || [],
        verNombres: imparte,
        pregunta: null,
        huboCambios: false
    };
    const paseDeListaHtml = window.bloqueDePaseDeLista(
        evalData, qs, todasLasRespuestas || [], window.paseDeLista.verNombres);

    // --- CONSTRUCCIÓN DEL CONTENEDOR FINAL ---
        container.innerHTML = `
            ${infoHtml}
            ${revisoresHtml}

        ${bannerHtml}
        ${materialHtml}
        ${paseDeListaHtml}
        <div id="stats-dashboard" style="display:none; margin-top:20px;"></div>
        <details id="lista-wrapper" class="hoja-plegable" ${cuantasMeTocan > 0 ? 'open' : ''}>
            <summary class="hoja-plegable-resumen">
                <span>Respuestas (<span id="contador-respuestas">${window.respuestasCacheActual.length}</span>)</span>
                ${avisoRevision}
            </summary>
            <div class="hoja-plegable-cuerpo">
                <input type="text" id="buscador-historial" placeholder="Buscar usuario..." oninput="window.renderizarListaRespuestas()" style="width:100%; box-sizing:border-box; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:16px; outline:none; background:#f8fafc; margin:12px 0;">
                <div id="lista-respuestas-historial">Cargando...</div>
            </div>
        </details>
    `;
    
    window.renderizarListaRespuestas();

    // La primera página del material, de portada de la hoja. Va al final y no
    // con el encabezado porque `encabezadoHojaEvaluaciones` quita la anterior:
    // puesta antes, se la llevaría por delante.
    window.pintarPortadaDeLaHoja();

    if(maintainScroll && window.lastScrollPosition) window.scrollTo(0, window.lastScrollPosition);
};


// ==========================================
// EL PASE DE LISTA, EN LA HOJA DE LA ENCUESTA
// ==========================================
// Una encuesta de asistencia se contesta con un solo toque, así que lo que se
// viene a saber de ella no es qué contestó nadie sino **cuántos de cuántos
// fueron**, y eso no estaba en ninguna pantalla: había que abrir la lista de
// respuestas y contarlas a mano contra un padrón que tampoco se enseñaba.
//
// El «N de M» sale de `window.pasoDeLista`, que cruza quién registró contra
// `padronDeLaEncuesta` —la misma regla que decide a quién le toca—, así que no
// puede discrepar de lo que cada quien ve en su panel.
//
// Va un recuadro por pregunta de asistencia: pedir dos pases de lista es
// agregar dos preguntas, y cada una es de su evento.
//
// **La cifra la ve cualquiera; los nombres, sólo quien la imparte.** Saber
// cuánta gente fue a la junta no es de nadie en particular, pero la lista de
// quién faltó es el acta, y ésa es del administrador y de quien revisa la
// encuesta —los mismos que pueden corregir a quién va dirigida—.
// Lo que están mirando la tarjeta y la hoja de pasar lista, que son la misma
// cosa dibujada dos veces: la encuesta, sus preguntas, **todas** sus respuestas
// y si quien mira puede tocarlas. Lo deja puesto `abrirHistorialEvaluacion` y
// lo van corrigiendo los toques, para que no haya que volver a consultar tras
// cada marca.
window.paseDeLista = null;

window.bloqueDePaseDeLista = (ev, preguntas, respuestas, verNombres) => {
    const deAsistencia = (preguntas || []).filter(q => window.esPreguntaDeAsistencia(q));
    if (deAsistencia.length === 0) return '';
    // Sin la plantilla cargada no hay padrón, y un «0 de 0» diría que no fue
    // nadie: es preferible no dibujar nada.
    if ((window.todosLosEmpleadosData || []).length === 0) return '';

    return deAsistencia.map(q => {
        const lista = window.pasoDeLista(ev, q, respuestas);
        if (lista.total === 0) return '';

        const pct = window.pctTexto(lista.cuantos, lista.total);
        const est = window.estadoDeAsistencia(q);
        const cuando = window.fechaDelEvento(q);

        // El aviso de `1-config.js` está escrito para quien la contesta —«Tienes
        // hasta las…»—; aquí se habla del evento y no de lo que le toca a nadie.
        let nota = 'Sin hora fijada: se puede registrar en cualquier momento';
        if (est.estado === 'antes') nota = `Todavía no empieza · ${window.fechaYHoraLegible(cuando)}`;
        else if (est.estado === 'abierta') nota = `Pasando lista ahora · hasta las ${window.horaLegible(est.fin)}`;
        else if (est.estado === 'cerrada') nota = `${window.fechaYHoraLegible(cuando)} · el plazo ya cerró`;

        // Antes del evento el «0 de 30» no dice que faltara nadie: no ha pasado
        // todavía nada que confirmar.
        const cifraHtml = est.estado === 'antes'
            ? `<div class="pase-cifra"><span class="pase-cifra-nadie">Sin registros todavía</span></div>`
            : `<div class="pase-cifra">
                   <span class="pase-cifra-numero">${lista.cuantos}</span>
                   <span class="pase-cifra-total">de ${lista.total}</span>
                   <span class="pase-cifra-pct">${pct}%</span>
               </div>
               <div class="pase-barra"><div class="pase-barra-relleno" style="width:${Math.round(lista.proporcion * 100)}%;"></div></div>`;

        // Quien registró y ya no está en el padrón fue igual: va con los
        // presentes, que es donde le toca.
        const presentes = lista.presentes.concat(lista.ajenos);
        const nombresHtml = verNombres
            ? window.listaDePaseDeLista('Asistieron', presentes, 'asistio') +
              window.listaDePaseDeLista('Faltaron', lista.ausentes, 'falto')
            : '';

        // Pasar lista a mano es de quien la imparte, como los nombres: la
        // casilla de quien contesta ya no puede —el plazo cerró—, y alguien
        // tiene que poder corregir el registro y apuntar a quien fue sin tener
        // la encuesta asignada.
        const editarHtml = verNombres
            ? `<button type="button" class="pase-editar" onclick="window.abrirPaseDeLista('${q.id}')">Pasar lista</button>`
            : '';

        return `
            <div class="pase-tarjeta">
                <div class="pase-rotulo">Pase de lista</div>
                <div class="pase-evento">${window.sanitizeForHTML(q.question_text || 'Registro de asistencia')}</div>
                <div class="pase-nota">${window.sanitizeForHTML(nota)}</div>
                ${cifraHtml}
                ${editarHtml}
                ${nombresHtml}
            </div>`;
    }).join('');
};

// Cada mitad del pase de lista, plegada: lo que se mira primero es la cifra, y
// los nombres son para cuando hay que ir a buscar a alguien. Vacía no se
// dibuja —«Faltaron (0)» sin nadie dentro es un plegable que no abre nada—.
window.listaDePaseDeLista = (rotulo, gente, clase) => {
    if (!gente || gente.length === 0) return '';

    const filas = gente.map(emp => `
        <div class="pase-persona">
            ${window.miniaturaDeEmpleado(emp, 26)}
            <div class="pase-persona-texto">
                <div class="pase-persona-nombre">${window.sanitizeForHTML(emp.name || `ID ${emp.id}`)}</div>
                ${emp.puesto ? `<div class="pase-persona-puesto">${window.sanitizeForHTML(emp.puesto)}</div>` : ''}
            </div>
        </div>`).join('');

    // El `<summary>` es un flex con `gap`, así que el rótulo y su contador van
    // envueltos en un solo `<span>` o el «(12)» se separa del texto.
    return `
        <details class="pase-plegable pase-plegable--${clase}">
            <summary class="pase-plegable-resumen">
                <span>${rotulo} (${gente.length})</span>
                <span class="pase-chevron" aria-hidden="true">›</span>
            </summary>
            <div class="pase-plegable-cuerpo">${filas}</div>
        </details>`;
};

// ==========================================
// EL MATERIAL DE UNA ENCUESTA
// ==========================================
// La presentación que se dio, el formato en Excel, el procedimiento en PDF.
// Quien la imparte los sube desde la hoja de la encuesta y quien la contesta
// los abre desde ahí mismo, que es donde va a estar mirando antes de responder.
//
// Los archivos viven en el bucket y sus fichas en `materiales_encuesta`, cuyo
// script se corre a mano. **Sin la tabla el recuadro no se dibuja**, y quien
// intente subir algo se entera de qué falta: es lo mismo que hacen las demás
// columnas y tablas que añade un script de `sql/`.
//
// El estado va aparte del pase de lista porque son dos cosas de la misma hoja
// que se repintan por su cuenta.
window.materialesEncuesta = null;

// Se piden al abrir la hoja. Una tabla que todavía no existe no revienta nada:
// se deja en `null` y el recuadro no sale.
window.cargarMaterialesEncuesta = async (evaluationId) => {
    // Lo que se estuviera convirtiendo era de la encuesta anterior: se descarta
    // aquí y no al cerrar la hoja, que a ésta se llega por varios caminos. Si
    // no, sus miniaturas —y sus blobs— aparecerían en el recuadro de otra.
    if (window.materialPorGuardar && window.materialPorGuardar.evalId !== String(evaluationId)) {
        window.descartarMaterialPendiente();
    }

    const { data, error } = await sb.from('materiales_encuesta')
        .select('*').eq('evaluation_id', String(evaluationId))
        .order('subido_en', { ascending: true });

    window.materialesEncuesta = error ? null : (data || []);
    return window.materialesEncuesta;
};

// --- DE FILAS A DOCUMENTOS ---
//
// La tabla guarda una fila por página y la pantalla enseña documentos: las
// páginas de una misma carpeta del bucket son un documento, y ésa es toda la
// agrupación —no hace falta ninguna columna nueva—.
//
// Lo subido antes de que el material se convirtiera en imágenes son archivos
// sueltos, sin carpeta: cada uno es su propio documento y se sigue enseñando
// como el enlace que era. Ni se convierten solos ni se borran: quien quiera
// bajarlos de peso los vuelve a subir y quita el viejo.
window.documentosDeMaterial = (materiales) => {
    const porClave = new Map();

    (materiales || []).forEach(m => {
        const carpeta = window.documentoDeRuta(m.archivo);
        const clave = carpeta || ('suelto-' + m.id);
        if (!porClave.has(clave)) {
            porClave.set(clave, {
                clave,
                nombre: m.nombre,
                esArchivo: !carpeta,
                subido_por: m.subido_por,
                subido_en: m.subido_en,
                paginas: [],
                bytes: 0
            });
        }
        const doc = porClave.get(clave);
        doc.paginas.push(m);
        doc.bytes += Number(m.bytes) || 0;
    });

    const documentos = Array.from(porClave.values());
    documentos.forEach(d => d.paginas.sort((a, b) =>
        (window.numeroDePagina(a.archivo) - window.numeroDePagina(b.archivo)) || (a.id - b.id)));
    return documentos;
};

// Lo que dice el renglón de un documento debajo de su nombre.
window.detalleDeDocumento = (doc) => {
    const quien = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(doc.subido_por));
    const paginas = doc.esArchivo
        ? ''
        : (doc.paginas.length === 1 ? '1 página' : `${doc.paginas.length} páginas`);
    return [paginas, window.pesoLegible(doc.bytes), quien && quien.name ? quien.name.split(' ')[0] : '']
        .filter(Boolean).join(' · ');
};

window.notaDeMaterial = () =>
    `Imágenes, PDF o PowerPoint. Se guardan como imágenes comprimidas: un documento de doce páginas no llega a 1 MB.`;

// El recuadro. Se dibuja en dos sitios y no en uno, y cada uno enseña una
// mitad:
//
//   - **En la hoja de la encuesta, sólo de lectura** (`puedeSubir` en false):
//     la portada de arriba abre el visor con todo lo convertido, así que ahí
//     abajo quedan sólo los archivos sueltos, que no entran en el visor. Sin
//     ninguno no se dibuja nada.
//   - **En la hoja de editar la encuesta, con sus botones**: agregar, revisar
//     lo convertido antes de guardarlo y quitar es parte de escribir la
//     encuesta —como sus preguntas o a quién va dirigida—, no de contestarla, y
//     en la hoja de la encuesta se llevaba media pantalla por encima del pase
//     de lista para enseñarle a quien sólo lee la misma portada que ya tiene
//     arriba.
//
// Ahí va **desnudo** (`opciones.desnudo`): sin la tarjeta blanca ni el rótulo
// «Material», que los pone la sección plegable que lo envuelve, y una tarjeta
// dentro de otra no se lee como nada.
//
// **Sin material y sin permiso para subirlo no se dibuja nada**: un recuadro
// vacío que dice «no hay material» ocupa lo mismo que uno lleno y no cuenta
// nada. Quien lo puede subir sí ve el recuadro vacío, que es su puerta.
window.bloqueDeMaterial = (evalId, puedeSubir, opciones = {}) => {
    const materiales = window.materialesEncuesta;
    if (materiales === null) return '';
    // Lo que está a medio convertir es de quien lo subió: en el recuadro de
    // sólo lectura no pinta nada, y sin esto una conversión dejada a medias en
    // la hoja de edición le sacaba a quien sólo lee sus miniaturas con los
    // botones de guardar y descartar.
    const pendiente = puedeSubir ? window.materialPorGuardar : null;
    if (materiales.length === 0 && !puedeSubir && !pendiente) return '';

    // Lo que ya está arriba no se repite aquí. A quien sólo lee le sobra: la
    // portada abre el visor con todas las páginas de todos los documentos
    // convertidos, así que el recuadro se le quedaría en una copia del primero.
    // A quien puede subirlos no: éste es el sitio donde se agregan y se quitan,
    // y ahí hacen falta todos. Y los archivos sueltos se quedan siempre, que
    // ésos no entran en el visor.
    const documentos = window.documentosDeMaterial(materiales)
        .filter(d => puedeSubir || !window.hayPortadaEnLaHoja || d.esArchivo);

    if (documentos.length === 0 && !puedeSubir && !pendiente) return '';

    // El que está de portada baja a renglón compacto: a tamaño de tarjeta sería
    // la misma imagen dos veces en la misma pantalla, y eso se lee como un
    // fallo. Los demás sí se quedan con su portada, que es el único sitio donde
    // se ven.
    const conPortada = window.documentosConPortada(materiales);
    const deLaHoja = (window.hayPortadaEnLaHoja && conPortada.length > 0) ? conPortada[0].clave : null;

    const filas = documentos.map(doc => {
        const detalle = window.detalleDeDocumento(doc);
        const borrar = puedeSubir
            ? `<button type="button" class="material-quitar" onclick="window.quitarMaterial('${window.sanitizeForHTML(doc.clave)}')"
                       title="Quitar este material" aria-label="Quitar «${window.sanitizeForHTML(doc.nombre)}»">✕</button>`
            : '';

        // El pie va **debajo** de la portada, no a su lado: es lo que convierte
        // el renglón en una tarjeta con su imagen arriba a todo lo ancho.
        const pie = `
            <span class="material-pie">
                <span class="material-texto">
                    <span class="material-nombre">${window.sanitizeForHTML(doc.nombre)}</span>
                    ${detalle ? `<span class="material-detalle">${window.sanitizeForHTML(detalle)}</span>` : ''}
                </span>
                <span class="material-flecha" aria-hidden="true">&rsaquo;</span>
            </span>`;

        // Lo convertido son imágenes y se leen dentro de la aplicación, con la
        // primera página **de portada a todo lo ancho**. Lo que se subió antes
        // de esto es un archivo, no tiene página que enseñar y se queda con el
        // renglón compacto de siempre: su `sin-portada` es el mismo al que cae
        // una portada que no carga. Y sigue siendo un enlace con
        // `target="_blank"`, que es lo que se espera de un documento: iOS
        // enseña el PDF y ofrece abrir la presentación con la app que toque.
        const cuerpo = doc.esArchivo
            ? `<a class="material-enlace" href="${window.sanitizeForHTML(doc.paginas[0].url)}" target="_blank" rel="noopener">
                   <span class="material-icono" aria-hidden="true">${window.iconoDeMaterial(doc.nombre)}</span>
                   ${pie}
               </a>`
            : `<button type="button" class="material-enlace" onclick="window.abrirDocumentoMaterial('${window.sanitizeForHTML(doc.clave)}')">
                   <img class="material-portada" src="${window.sanitizeForHTML(doc.paginas[0].url)}" alt="" loading="lazy"
                        onerror="window.portadaRota(this)">
                   ${pie}
               </button>`;

        const compacta = doc.esArchivo || doc.clave === deLaHoja;
        return `<div class="material-fila${compacta ? ' sin-portada' : ''}">${cuerpo}${borrar}</div>`;
    }).join('');

    // El campo se abre con un `<label for>` y no con un `.click()` sobre el
    // input escondido: en iOS ese click programático es indistinguible del
    // toque fantasma que sintetizan las ruedas al cerrarse.
    //
    // Con algo esperando a que se guarde, la puerta se cierra: dos documentos a
    // medio convertir a la vez no cabrían en un solo `materialPorGuardar`, y la
    // conversión es lo bastante lenta como para que dé tiempo a tocar otra vez.
    const subirHtml = (puedeSubir && !pendiente) ? `
        <input type="file" id="inp-material-eval" accept="${window.aceptaDeMaterial()}"
               style="display:none;" onchange="window.agregarMaterial(this, '${evalId}')">
        <label for="inp-material-eval" id="btn-material-eval" class="material-agregar">
            Agregar material
        </label>
        <div class="material-nota" id="nota-material">${window.notaDeMaterial()}</div>` : '';

    const vacio = (materiales.length === 0 && !pendiente)
        ? `<div class="material-vacio">Todavía no hay material.</div>` : '';

    const desnudo = !!opciones.desnudo;
    return `
        <div class="material-tarjeta${desnudo ? ' material-tarjeta--desnuda' : ''}">
            ${desnudo ? '' : '<div class="material-rotulo">Material</div>'}
            ${filas}${vacio}${pendiente ? window.bloqueDeConversion() : ''}${subirHtml}
        </div>`;
};

// ==========================================
// LA PORTADA DE LA HOJA
// ==========================================
// El material no es un renglón más de la encuesta: es lo que hay que mirar
// antes de contestarla, y enterrado en un recuadro a media hoja se lo saltaba
// todo el mundo. La primera página del primer documento pasa a ser **la portada
// de la hoja**: lo primero que se ve al abrirla, a sangre y con las esquinas
// redondeadas de arriba, con el botón de cerrar flotando en su esquina.
//
// Y es la puerta a todo lo demás: tocarla abre el visor con **todas** las
// páginas de **todos** los documentos convertidos, una debajo de otra. Por eso
// abajo no se repiten —quien sólo lee ya no ve el recuadro de los que tienen
// portada—, y el recuadro se queda para quien puede subirlos y quitarlos, que
// es su consola, y para los archivos sueltos, que no se pueden abrir ahí.
window.hayPortadaEnLaHoja = false;

// Los documentos que tienen página que enseñar: los convertidos. Lo que se
// subió antes de que el material fueran imágenes son archivos sueltos, y ésos
// ni tienen portada ni se pueden abrir en el visor.
window.documentosConPortada = (materiales) =>
    window.documentosDeMaterial(materiales)
        .filter(d => !d.esArchivo && d.paginas.length > 0);

window.paginasDeLaPortada = () =>
    window.documentosConPortada(window.materialesEncuesta)
        .reduce((todas, d) => todas.concat(d.paginas.map(p => p.url)), []);

window.abrirPortadaMaterial = () => {
    const urls = window.paginasDeLaPortada();
    if (urls.length > 0) window.abrirVisorImagenes(urls);
};

// La monta y le presta el botón de cerrar. Se llama **después** de
// `encabezadoHojaEvaluaciones`, que es quien la quita: si no, la del anterior
// seguiría puesta.
window.pintarPortadaDeLaHoja = () => {
    const docs = window.documentosConPortada(window.materialesEncuesta);
    if (docs.length === 0) return;

    const hoja = document.querySelector('#modal-evaluaciones-flotante .hoja-contenido');
    const encabezado = hoja && hoja.querySelector('.hoja-encabezado-lista');
    if (!hoja || !encabezado) return;

    const portada = document.createElement('div');
    portada.id = 'portada-hoja-evaluaciones';
    portada.className = 'hoja-portada';
    portada.innerHTML = `
        <button type="button" class="hoja-portada-imagen" onclick="window.abrirPortadaMaterial()"
                title="Ver el material" aria-label="Ver el material de esta encuesta">
            <img src="${window.sanitizeForHTML(docs[0].paginas[0].url)}" alt=""
                 onerror="window.portadaDeLaHojaRota()">
        </button>`;

    // Va **antes** del encabezado y no dentro del cuerpo: es lo que la deja
    // pegada al borde de arriba, recortada por las esquinas de la hoja.
    hoja.insertBefore(portada, encabezado);
    hoja.classList.add('con-portada');
    window.hayPortadaEnLaHoja = true;

    const btn = document.getElementById('btn-hoja-evaluaciones');
    if (btn) { btn.classList.add('portada-boton'); portada.appendChild(btn); }
};

// La portada no carga —sin red, o borrada desde Storage—. Se quita, y con ella
// se rehace el recuadro de abajo: sin este segundo paso, quien sólo lee se
// quedaría sin portada y sin recuadro, o sea sin manera de abrir el material.
window.portadaDeLaHojaRota = () => {
    window.quitarPortadaDeLaHoja();
    window.pintarMaterialEncuesta();
};

// Sin red, o con el archivo borrado desde Storage, la portada deja el icono de
// imagen rota del navegador ocupando la mitad de la tarjeta. Se cambia por el
// emoji de siempre —lo que había antes de que hubiera portadas— y la tarjeta
// **vuelve al renglón compacto**: una caja de proporción fija con un emoji
// centrado dentro no se lee como nada.
window.portadaRota = (img) => {
    const icono = document.createElement('span');
    icono.className = 'material-icono';
    icono.setAttribute('aria-hidden', 'true');
    icono.textContent = '🖼️';
    const fila = img.closest('.material-fila');
    img.replaceWith(icono);
    if (fila) fila.classList.add('sin-portada');
};

// Las páginas de un documento, una debajo de otra y a pantalla completa. Es el
// visor de imágenes de siempre, que es lo único de esta aplicación que va a
// pantalla completa a propósito.
window.abrirDocumentoMaterial = (clave) => {
    const doc = window.documentosDeMaterial(window.materialesEncuesta)
        .find(d => d.clave === clave);
    if (!doc) return;
    window.abrirVisorImagenes(doc.paginas.map(p => p.url));
};

// ==========================================
// LO CONVERTIDO, ANTES DE GUARDARLO
// ==========================================
// Entre elegir el archivo y guardar las páginas hay un paso, y no es un adorno:
//
//   - Una presentación se dibuja **de manera aproximada** —ver
//     `paginasDePresentacion`—, así que quien la sube tiene que poder ver cómo
//     quedó antes de que sea lo que lea la plantilla entera.
//   - Un PDF de veinte páginas son veinte imágenes y su peso: aquí se dice
//     cuánto va a ocupar antes de ocuparlo, que es de lo que iba todo esto.
//   - Y se puede quitar la portada en blanco, la última diapositiva de
//     «Gracias» o la página que no venía al caso.
//
// Vive en memoria y en el propio recuadro, no en otra hoja: apilar una hoja
// sobre la de la encuesta dejaría dos tiradores a la vista. Las miniaturas son
// `URL.createObjectURL` de los blobs ya comprimidos —lo que se ve es
// exactamente lo que se va a subir— y se sueltan al guardar o al descartar.
window.materialPorGuardar = null;

window.bloqueDeConversion = () => {
    const p = window.materialPorGuardar;
    if (!p) return '';

    if (p.convirtiendo) {
        // Con «Cancelar» a la vista, que un documento largo tarda: son decenas
        // de páginas dibujadas una por una en el teléfono.
        return `
            <div class="material-previa">
                <div class="material-previa-titulo">${window.sanitizeForHTML(p.nombre)}</div>
                <div class="material-nota" id="nota-conversion">${window.sanitizeForHTML(p.aviso || 'Convirtiendo…')}</div>
                <div class="material-acciones">
                    <button type="button" class="material-descartar" onclick="window.descartarMaterialPendiente()">Cancelar</button>
                </div>
            </div>`;
    }

    const hojas = p.paginas.map((pag, i) => `
        <div class="material-hoja">
            <img src="${pag.vista}" alt="Página ${i + 1}" loading="lazy">
            <span class="material-hoja-numero">${i + 1}</span>
            <button type="button" class="material-hoja-quitar" onclick="window.quitarPaginaPendiente(${i})"
                    title="Quitar la página ${i + 1}" aria-label="Quitar la página ${i + 1}">✕</button>
        </div>`).join('');

    const bytes = p.paginas.reduce((t, pag) => t + pag.blob.size, 0);
    const cuantas = p.paginas.length === 1 ? '1 página' : `${p.paginas.length} páginas`;
    const recorte = p.recorte
        ? `<div class="material-nota">Sólo se convirtieron las primeras ${window.MAX_PAGINAS_MATERIAL} de ${p.recorte} páginas.</div>`
        : '';
    // Una presentación se dibuja aproximada y hay que decirlo justo aquí, que
    // es donde se está mirando lo que salió.
    const aviso = p.via === 'presentacion'
        ? `<div class="material-nota material-nota--ojo">Una presentación se convierte de forma aproximada: las fuentes y algunas tablas o gráficos pueden cambiar. Si algo no se ve bien, expórtala a PDF desde PowerPoint y súbela así.</div>`
        : '';

    return `
        <div class="material-previa">
            <div class="material-previa-titulo">${window.sanitizeForHTML(p.nombre)}</div>
            <div class="material-previa-detalle">${cuantas} · ${window.pesoLegible(bytes) || '0 KB'} · todavía sin guardar</div>
            <div class="material-hojas">${hojas}</div>
            ${recorte}${aviso}
            <div class="material-acciones">
                <button type="button" class="material-descartar" onclick="window.descartarMaterialPendiente()">Descartar</button>
                <button type="button" class="material-guardar" id="btn-guardar-material" onclick="window.guardarMaterialPendiente()">Guardar ${cuantas}</button>
            </div>
        </div>`;
};

// Convierte el archivo elegido y lo deja esperando. **No sube nada todavía**:
// hasta que no se pulsa «Guardar» no se toca ni el bucket ni la tabla, así que
// arrepentirse no deja basura en ningún sitio.
window.agregarMaterial = async (input, evalId) => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    const tope = window.MAX_MB_MATERIAL * 1024 * 1024;
    if (file.size > tope) {
        alert(`«${file.name}» pesa ${window.pesoLegible(file.size)} y el tope para convertir son ${window.MAX_MB_MATERIAL} MB.\n\nUna presentación con muchas fotos se baja de peso exportándola a PDF, o subiendo sólo las diapositivas que hagan falta.`);
        return;
    }

    const via = window.puertaDeMaterial(file.name);
    if (!via) {
        const ext = window.extensionDeArchivo(file.name);
        alert(ext === 'ppt'
            ? `«${file.name}» es del formato antiguo de PowerPoint (.ppt), que el navegador no sabe abrir.\n\nÁbrela y guárdala como .pptx, o expórtala a PDF.`
            : `«${file.name}» no se puede convertir a imágenes.\n\nSe pueden subir imágenes, PDF y presentaciones .pptx; un Excel o un Word se exportan a PDF y se suben así.`);
        return;
    }

    // La marca identifica **esta** conversión y no el archivo: cancelar y volver
    // a elegir el mismo se distingue igual, que por el nombre serían la misma y
    // la primera acabaría metiendo sus páginas en la segunda.
    const marca = Date.now() + '-' + Math.random();
    window.materialPorGuardar = {
        marca, evalId: String(evalId), nombre: file.name, via,
        convirtiendo: true, aviso: 'Preparando…', paginas: [], recorte: 0
    };
    window.pintarMaterialEncuesta();

    // El aviso se escribe en su renglón y no repintando el recuadro entero:
    // veinte repintados seguidos en un teléfono se ven como un parpadeo.
    //
    // Y es además por donde se cancela: quien pulsa «Cancelar» deja el
    // pendiente en null, y este aviso —que la conversión llama antes de cada
    // página— revienta a propósito para que el bucle no siga dibujando páginas
    // que ya no quiere nadie. Es la única manera de pararlo sin meterle una
    // bandera a cada conversor.
    const avisar = (texto) => {
        const p = window.materialPorGuardar;
        if (!p || p.marca !== marca) {
            const corte = new Error('Conversión cancelada');
            corte.cancelada = true;
            throw corte;
        }
        p.aviso = texto;
        const nota = document.getElementById('nota-conversion');
        if (nota) nota.innerText = texto;
    };

    try {
        const blobs = await window.paginasDeArchivo(file, avisar);
        // Se pudo descartar mientras convertía, o haberse abierto otra
        // encuesta: lo convertido ya no es de nadie. Un archivo de una sola
        // página no llega a pasar por `avisar` más de una vez, así que aquí es
        // donde de verdad se comprueba.
        if (!window.materialPorGuardar || window.materialPorGuardar.marca !== marca) return;

        window.materialPorGuardar.convirtiendo = false;
        window.materialPorGuardar.recorte = blobs.recorte || 0;
        window.materialPorGuardar.paginas = blobs.map(b => ({ blob: b, vista: URL.createObjectURL(b) }));
        window.pintarMaterialEncuesta();
    } catch (e) {
        // Cancelar no es un fallo: el recuadro ya se repintó al pulsarlo y no
        // hay nada que contarle a nadie.
        if (e && e.cancelada) return;
        console.error(e);
        window.materialPorGuardar = null;
        window.pintarMaterialEncuesta();
        alert('No se pudo convertir el archivo: ' + (e.message || e));
    }
};

window.quitarPaginaPendiente = (indice) => {
    const p = window.materialPorGuardar;
    if (!p || p.guardando || !p.paginas[indice]) return;
    URL.revokeObjectURL(p.paginas[indice].vista);
    p.paginas.splice(indice, 1);
    if (p.paginas.length === 0) return window.descartarMaterialPendiente();
    window.pintarMaterialEncuesta();
};

// Descartar no vale a mitad del guardado: esas páginas se están subiendo, y
// soltar sus miniaturas dejaría el recuadro contando una historia distinta de
// la que está pasando. El botón se apaga, pero la puerta se cierra aquí.
window.descartarMaterialPendiente = () => {
    const p = window.materialPorGuardar;
    if (p && p.guardando) return;
    if (p) p.paginas.forEach(pag => URL.revokeObjectURL(pag.vista));
    window.materialPorGuardar = null;
    window.pintarMaterialEncuesta();
};

// Sube las páginas y guarda sus fichas. El orden importa: **primero los
// archivos y después las filas**. Al revés, una fila cuya subida falle
// apuntaría a un archivo que no existe; así, lo peor que puede pasar es un
// archivo en el bucket sin nadie que lo nombre, que no le miente a nadie —y que
// además se retira desde «Consumo», que sabe reconocer a los huérfanos de este
// bucket—.
window.guardarMaterialPendiente = async () => {
    const p = window.materialPorGuardar;
    if (!p || p.convirtiendo || p.paginas.length === 0) return;

    const user = JSON.parse(localStorage.getItem("usuarioLogueado") || 'null');
    const btn = document.getElementById('btn-guardar-material');
    p.guardando = true;
    if (btn) { btn.disabled = true; btn.innerText = 'Guardando…'; }
    const descartar = document.querySelector('.material-descartar');
    if (descartar) descartar.disabled = true;

    try {
        const carpeta = window.carpetaDeMaterial(p.evalId, p.nombre);
        const fichas = [];

        for (let i = 0; i < p.paginas.length; i++) {
            if (btn) btn.innerText = `Guardando ${i + 1} de ${p.paginas.length}…`;
            const blob = p.paginas[i].blob;
            const ruta = window.rutaDePagina(carpeta, i, blob.extensionSugerida);
            const { archivo, url } = await window.subirPaginaMaterial(blob, ruta);
            fichas.push({
                evaluation_id: p.evalId,
                nombre: p.nombre,
                archivo: archivo,
                url: url,
                tipo: blob.type || 'image/webp',
                bytes: blob.size,
                subido_por: user ? String(user.id) : null
            });
        }

        // Contar las filas del `.select()`: aquí escribe alguien que no es
        // administrador y una política de RLS que lo rechace no da error, sólo
        // afecta a cero filas.
        const { data, error } = await sb.from('materiales_encuesta').insert(fichas).select();
        if (error) throw error;
        if (!data || data.length === 0) {
            alert("Las páginas se subieron, pero la base no aceptó sus fichas: no se guardó ninguna fila. Pide a un administrador que revise los permisos de `materiales_encuesta`.");
            return;
        }

        window.materialesEncuesta = (window.materialesEncuesta || []).concat(data);
        p.guardando = false;
        window.descartarMaterialPendiente();
    } catch (e) {
        console.error(e);
        p.guardando = false;
        alert("No se pudo guardar el material: " + (e.message || e));
        // Se repinta entero: el botón dice otra vez lo que hace y el de
        // descartar vuelve a estar vivo, que puede ser justo lo que se quiera
        // hacer después de un fallo.
        window.pintarMaterialEncuesta();
    }
};

// **Primero las fichas y después los archivos**, que es el orden de lo que no
// tiene vuelta atrás: si la base rechaza el borrado no se ha perdido nada; al
// revés, los archivos se habrían ido dejando en pie unas filas que apuntan al
// vacío. Un archivo que se quede en el bucket sin ficha no lo ve nadie, y se
// avisa para poder limpiarlo desde «Consumo».
window.quitarMaterial = async (clave) => {
    const doc = window.documentosDeMaterial(window.materialesEncuesta)
        .find(d => d.clave === clave);
    if (!doc) return;

    const cuantas = doc.esArchivo ? '' :
        (doc.paginas.length === 1 ? ' (1 página)' : ` (${doc.paginas.length} páginas)`);
    if (!confirm(`¿Quitar «${doc.nombre}»${cuantas} del material de esta encuesta?`)) return;

    const ids = doc.paginas.map(m => m.id);
    const { data, error } = await sb.from('materiales_encuesta')
        .delete().in('id', ids).select();

    if (error || !data || data.length === 0) {
        alert("La base no aceptó el borrado: no se quitó ninguna fila. Pide a un administrador que revise los permisos de `materiales_encuesta`.");
        return;
    }

    const { error: errArchivo } = await sb.storage
        .from(window.BUCKET_MATERIALES).remove(doc.paginas.map(m => m.archivo));
    if (errArchivo) {
        console.error(errArchivo);
        alert(`Se quitó «${doc.nombre}» de la encuesta, pero sus archivos siguen en el bucket '${window.BUCKET_MATERIALES}': se retiran desde «Consumo», que los reconoce como huérfanos.`);
    }

    const borrados = new Set(ids.map(String));
    window.materialesEncuesta = (window.materialesEncuesta || []).filter(m => !borrados.has(String(m.id)));
    window.pintarMaterialEncuesta();
};

// El recuadro se repinta solo, sin rehacer la hoja entera: subir un archivo no
// cambia nada de lo que hay alrededor.
//
// **Son dos huecos y se repintan los dos.** La hoja de la encuesta no se vacía
// al cerrarse —`cerrarModalEvaluaciones` sólo la esconde—, así que su
// `#material-encuesta` sigue en el documento mientras se edita la encuesta: con
// un solo id, `getElementById` habría devuelto el de la hoja escondida y lo que
// se acaba de subir no se vería en la que está delante. Cada uno se dibuja con
// lo suyo: el de la encuesta sin botones, el de la edición con ellos.
window.pintarMaterialEncuesta = () => {
    // El de la hoja de la encuesta sólo mientras no haya una edición delante:
    // las dos hojas no se ven a la vez —quien abre la de edición cierra ésta—,
    // y ahí `hayPortadaEnLaHoja` está en false para que el recuadro de edición
    // los enseñe todos, así que repintarlo con eso puesto le metería a la hoja
    // escondida el mismo documento que ya tiene de portada. Se rehace entero al
    // volver a abrirla, que es por donde se pasa siempre.
    const hoja = document.getElementById('material-encuesta');
    if (hoja && window.materialDeLaHoja && !window.materialEnEdicion) {
        hoja.innerHTML = window.bloqueDeMaterial(window.materialDeLaHoja.id, false);
    }
    const edicion = document.getElementById('material-edicion');
    if (edicion && window.materialEnEdicion) {
        edicion.innerHTML = window.bloqueDeMaterial(
            window.materialEnEdicion.id, true, { desnudo: true });
    }
};

// ==========================================
// PASAR LISTA A MANO
// ==========================================
// La casilla que enseña la encuesta es de quien asiste y sólo vale dentro de su
// hora: pasado el plazo, un registro que faltó ya no lo puede arreglar nadie, y
// quien fue sin tener la encuesta asignada nunca tuvo dónde apuntarse. Eso lo
// resuelve quien la imparte desde aquí —el administrador y quien la revisa, los
// mismos que ven los nombres—.
//
// **El plazo no se comprueba, y es a propósito**: existe para que nadie se
// registre solo al día siguiente, no para atarle las manos a quien pasa lista.
// Justo después de cerrarse es cuando hay que corregir la lista.
//
// Va en su propia hoja y no dentro del recuadro porque el padrón puede ser la
// plantilla entera: hace falta buscador, y ahí es además donde se agrega a
// quien no estaba.
window.abrirPaseDeLista = (idPregunta) => {
    const estado = window.paseDeLista;
    if (!estado || !estado.verNombres) return;

    const pregunta = (estado.preguntas || []).find(q => String(q.id) === String(idPregunta));
    if (!pregunta) return;

    estado.pregunta = pregunta;
    const hoja = document.getElementById('modal-pase-lista');
    if (!hoja) return;

    const buscador = document.getElementById('buscador-pase-lista');
    if (buscador) buscador.value = '';

    window.pintarHojaPaseDeLista();
    hoja.style.display = 'flex';
};

window.cerrarPaseDeLista = () => {
    const hoja = document.getElementById('modal-pase-lista');
    if (hoja) hoja.style.display = 'none';
    const cuerpo = document.getElementById('cuerpo-pase-lista');
    if (cuerpo) cuerpo.innerHTML = '';

    // La hoja corrigió respuestas, así que lo que hay detrás —el recuadro, la
    // lista de «Respuestas (N)» y el último resultado— habla de otra cosa: se
    // vuelve a dibujar entero, manteniendo el scroll.
    const estado = window.paseDeLista;
    if (estado && estado.huboCambios) {
        estado.huboCambios = false;
        window.abrirHistorialEvaluacion(estado.ev.id, estado.ev.title || '', true);
    }
};

// Una fila por persona, con su marca. Quien está en el padrón sale siempre;
// quien no, sólo si registró asistencia —ahí se le apuntó a mano— o si se le
// está buscando por su nombre, que es como se agrega a alguien nuevo.
window.pintarHojaPaseDeLista = () => {
    const estado = window.paseDeLista;
    const cuerpo = document.getElementById('cuerpo-pase-lista');
    if (!estado || !estado.pregunta || !cuerpo) return;

    const q = estado.pregunta;
    const lista = window.pasoDeLista(estado.ev, q, estado.respuestas);
    const presentes = new Set(lista.presentes.concat(lista.ajenos).map(e => String(e.id)));

    const subtitulo = document.getElementById('subtitulo-pase-lista');
    if (subtitulo) {
        subtitulo.innerText = `${lista.cuantos} de ${lista.total} · ${q.question_text || 'Registro de asistencia'}`;
    }

    // Se busca sin acentos, que nadie los teclea, y con el mismo criterio que
    // el resto de los buscadores de la aplicación: por nombre.
    const clave = (t) => String(t == null ? '' : t)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const buscador = document.getElementById('buscador-pase-lista');
    const buscado = clave(buscador ? buscador.value : '');
    const casa = (emp) => !buscado || clave(emp.name).includes(buscado) || clave(emp.puesto).includes(buscado);

    // El padrón, más quien se apuntó a mano sin estar en él: son los que ya
    // salen en el recuadro, y los que se marcan y desmarcan.
    const enLaLista = lista.presentes.concat(lista.ajenos).concat(lista.ausentes).filter(casa);
    const yaEstan = new Set(lista.presentes.concat(lista.ajenos).concat(lista.ausentes).map(e => String(e.id)));

    // Y cualquier otra persona de la plantilla, sólo mientras se la busca: es
    // como se agrega a quien fue sin tener la encuesta asignada. Sin buscar no
    // se listan cuatrocientas personas que no vienen a cuento.
    const otras = buscado
        ? (window.todosLosEmpleadosData || [])
            .filter(emp => !yaEstan.has(String(emp.id)) && window.empleadoActivo(emp) && casa(emp))
            .slice(0, 30)
        : [];

    // La lista de destinatarios concretos: sólo se puede quitar a alguien de
    // ella cuando la encuesta va dirigida por nombre. Si va por puesto o
    // departamento, quién la tiene lo deciden esos dos campos.
    const porNombre = window.destinatariosConcretos(estado.ev);

    const dato = (emp) => `
        ${window.miniaturaDeEmpleado(emp, 30)}
        <span class="pase-fila-texto">
            <span class="pase-persona-nombre">${window.sanitizeForHTML(emp.name || `ID ${emp.id}`)}</span>
            ${emp.puesto ? `<span class="pase-persona-puesto">${window.sanitizeForHTML(emp.puesto)}</span>` : ''}
        </span>`;

    // Un id de empleado va en el `onclick`, así que se escapa la comilla: son
    // números, pero nada garantiza que lo sigan siendo.
    const arg = (emp) => String(emp.id).replace(/'/g, "\\'");

    // En la lista, la fila marca la asistencia y la «×» quita a esa persona de
    // los destinatarios. Son dos botones hermanos y no uno dentro de otro, que
    // no vale en HTML.
    const filaDeLaLista = (emp) => {
        const marcado = presentes.has(String(emp.id));
        const quitar = porNombre && porNombre.includes(String(emp.id))
            ? `<button type="button" class="pase-quitar" onclick="window.quitarDelPadron('${arg(emp)}')"
                       title="Quitar de la lista" aria-label="Quitar de la lista">✕</button>`
            : '';
        return `
            <div class="pase-fila${marcado ? ' esta-presente' : ''}">
                <button type="button" class="pase-fila-principal" onclick="window.alternarAsistencia('${arg(emp)}')"
                        title="${marcado ? 'Quitar la asistencia' : 'Marcar que asistió'}">
                    ${dato(emp)}
                    <span class="pase-marca" aria-hidden="true">${marcado ? '✓' : ''}</span>
                </button>
                ${quitar}
            </div>`;
    };

    // Fuera de la lista, la fila hace una sola cosa: agregar a esa persona a
    // los destinatarios. **No le marca la asistencia**, que es otra cosa y se
    // decide después con su círculo: se agrega a quien tenía que ir, haya ido o
    // no.
    const filaDeFuera = (emp) => `
        <div class="pase-fila">
            <button type="button" class="pase-fila-principal" onclick="window.agregarAlPadron('${arg(emp)}')"
                    title="Agregar a la lista">
                ${dato(emp)}
                <span class="pase-marca pase-marca--agregar" aria-hidden="true">+</span>
            </button>
        </div>`;

    const seccion = (rotulo, gente, nota, comoFila) => gente.length === 0 ? '' : `
        <div class="pase-seccion">
            <div class="pase-seccion-rotulo">${rotulo}</div>
            ${nota ? `<div class="pase-seccion-nota">${nota}</div>` : ''}
            ${gente.map(comoFila).join('')}
        </div>`;

    const vacio = enLaLista.length === 0 && otras.length === 0
        ? `<div class="pase-hoja-vacio">Nadie coincide con lo que buscas.</div>` : '';

    cuerpo.innerHTML =
        seccion('A quién va dirigida', enLaLista, '', filaDeLaLista) +
        seccion('Otras personas', otras,
            'Agregarlas las pone en la lista; que asistieran o no se marca después.', filaDeFuera) +
        vacio;
};

// Agregar a alguien a la lista es escribir `target_employees`: es a quién va
// dirigida la encuesta, y **no tiene nada que ver con si asistió**. Se agrega a
// quien tenía que ir; la asistencia se marca aparte, con su círculo.
//
// Quien agrega se queda con la revisión de esa persona, con las mismas reglas
// que la hoja de destinatarios: es el mismo gesto por otra puerta.
window.agregarAlPadron = async (idEmpleado) => {
    const estado = window.paseDeLista;
    if (!estado || estado.escribiendo) return;

    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(idEmpleado));
    if (!emp) return;

    const actuales = window.destinatariosConcretos(estado.ev);
    let lista;
    if (actuales) {
        if (actuales.includes(String(emp.id))) return;
        lista = actuales.concat(String(emp.id));
    } else {
        // La encuesta va dirigida por puesto o departamento, así que quién la
        // tiene se decide solo: alguien que cambie de puesto la gana o la
        // pierde. Escribir una lista de nombres la congela, y eso no se hace a
        // espaldas de quien lo pide.
        const padron = window.padronDeLaEncuesta(estado.ev).map(e => String(e.id));
        const aviso = `Esta encuesta va dirigida por puesto o departamento, así que quién la tiene se decide solo.\n\n` +
            `Agregar a ${emp.name} la convierte en una lista fija de ${padron.length + 1} personas: ` +
            `de aquí en adelante, quien cambie de puesto o de departamento ya no la ganará ni la perderá.\n\n¿Continuar?`;
        if (!confirm(aviso)) return;
        lista = [...new Set(padron.concat(String(emp.id)))];
    }

    await window.guardarPadron(lista, String(emp.id));
};

window.quitarDelPadron = async (idEmpleado) => {
    const estado = window.paseDeLista;
    if (!estado || estado.escribiendo) return;

    const actuales = window.destinatariosConcretos(estado.ev);
    if (!actuales || !actuales.includes(String(idEmpleado))) return;

    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(idEmpleado));
    const nombre = emp && emp.name ? emp.name : `ID ${idEmpleado}`;

    // Quitar al último dejaría la encuesta sin nadie a quien acotar, y entonces
    // le tocaría a todo el mundo: no es lo que pide quien quita a una persona.
    if (actuales.length === 1) {
        alert(`${nombre} es la única persona a la que va dirigida. Quitarla dejaría la encuesta sin destinatarios, y entonces le tocaría a todo el mundo.`);
        return;
    }
    if (!confirm(`¿Quitar a ${nombre} de a quién va dirigida esta encuesta?`)) return;

    await window.guardarPadron(actuales.filter(id => id !== String(idEmpleado)));
};

// La escritura de los destinatarios desde el pase de lista. `agregado` es a
// quién se acaba de poner, para apuntar que lo dirigió quien está mirando.
window.guardarPadron = async (lista, agregado) => {
    const estado = window.paseDeLista;
    const ev = estado.ev;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado") || 'null');

    let asignaciones = agregado
        ? window.conApunteDeAsignacion(ev, agregado, user && user.id)
        : window.asignacionesDeEncuesta(ev);
    asignaciones = window.asignacionesVigentes(asignaciones, lista, window.revisoresDeEncuesta(ev));

    const cambios = { target_employees: lista };
    // Sin la columna se guardan sólo los destinatarios y el pendiente se
    // reparte entre todos los revisores, como antes de que existiera.
    if (await window.hayColumnaAsignador()) cambios.assigned_by = asignaciones;

    estado.escribiendo = true;
    try {
        // Aquí escribe alguien que no es administrador, y una política de RLS
        // que lo rechace no da error: sólo afecta a cero filas.
        const { data, error } = await sb.from('evaluations')
            .update(cambios).eq('id', ev.id).select('id');
        if (error || !data || data.length === 0) {
            alert("La base no aceptó el cambio: no se modificó ninguna fila. Pide a un administrador que revise los permisos de la tabla de encuestas.");
            return;
        }
    } finally {
        estado.escribiendo = false;
    }

    // La encuesta que hay en memoria es la misma que la de `cacheEncuestasRevision`,
    // así que corregirla aquí basta para que el padrón se recalcule; la lista de
    // encuestas sí se vuelve a pedir, que se trae la fila entera.
    ev.target_employees = lista;
    if (cambios.assigned_by) ev.assigned_by = asignaciones;
    window.evalCache = null;
    estado.huboCambios = true;
    if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

    // Quien acaba de entrar en la lista ya no es «otra persona»: se limpia el
    // buscador para que se le vea en su sitio.
    const buscador = document.getElementById('buscador-pase-lista');
    if (agregado && buscador) buscador.value = '';
    window.pintarHojaPaseDeLista();
};

// Marcar y desmarcar es escribir y borrar la respuesta de esa persona, que es
// donde vive «Asistí»: no hay otra tabla que diga quién fue.
//
// **Sólo se toca la llave de esta pregunta.** Una encuesta puede llevar más, y
// borrar la fila entera se llevaría por delante lo que esa persona contestó; la
// fila se borra únicamente cuando lo de asistencia era lo único que tenía.
window.alternarAsistencia = async (idEmpleado) => {
    const estado = window.paseDeLista;
    if (!estado || !estado.pregunta || estado.escribiendo) return;

    const q = estado.pregunta;
    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(idEmpleado));
    if (!emp) return;

    // Las de la vuelta en curso: una encuesta relanzada nombra otro evento, y
    // los registros de la vuelta anterior no son de ésta.
    const suyas = window.respuestasTrasRelanzar(estado.ev, estado.respuestas)
        .filter(r => String(r.employee_id) === String(idEmpleado));
    const marcada = (r) => String(((r && r.answers_json) || {})[q.id] || '').trim() === window.TEXTO_ASISTENCIA;
    const presente = suyas.some(marcada);

    estado.escribiendo = true;
    try {
        const hecho = presente
            ? await window.borrarAsistencia(q, suyas.filter(marcada))
            : await window.apuntarAsistencia(q, emp, suyas[0] || null);
        if (!hecho) return;

        estado.huboCambios = true;
        // Una asistencia recién apuntada cierra —o reabre— el pendiente de esa
        // persona y mueve los conteos del panel.
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();
    } finally {
        estado.escribiendo = false;
    }

    window.pintarHojaPaseDeLista();
};

// La calificación es la misma que se pone sola al enviarla: pasar lista no
// tiene respuesta buena ni mala, haberla confirmado es todo lo que se
// preguntaba.
window.calificacionDeAsistencia = (q) => ({
    type: 'standard', status: 'correct', question: q.question_text || '', auto: true
});

window.apuntarAsistencia = async (q, emp, respuestaExistente) => {
    if (respuestaExistente) {
        const answers = { ...(respuestaExistente.answers_json || {}), [q.id]: window.TEXTO_ASISTENCIA };
        const grades = { ...(respuestaExistente.grades_json || {}), [q.id]: window.calificacionDeAsistencia(q) };
        // Contar las filas del `.select()`: aquí escribe alguien que no es
        // administrador y una política de RLS que lo rechace no da error,
        // simplemente no afecta a ninguna fila.
        const { data, error } = await sb.from('evaluation_responses')
            .update({ answers_json: answers, grades_json: grades })
            .eq('id', respuestaExistente.id).select();
        if (error || !data || data.length === 0) {
            alert("No se pudo guardar la asistencia. Puede que la base no te deje escribir esa respuesta.");
            return false;
        }
        Object.assign(respuestaExistente, data[0]);
        return true;
    }

    // La hora del registro es la del evento, no la de ahora: es cuando esa
    // persona asistió, y es lo que deja la respuesta en el periodo que le toca.
    // Sin fecha en la pregunta no hay otra que el momento en que se apunta.
    const cuando = window.fechaDelEvento(q) || new Date();
    const { data, error } = await sb.from('evaluation_responses').insert({
        evaluation_id: window.paseDeLista.ev.id,
        employee_id: emp.id,
        employee_area: emp.area || null,
        answers_json: { [q.id]: window.TEXTO_ASISTENCIA },
        grades_json: { [q.id]: window.calificacionDeAsistencia(q) },
        // Una encuesta que sólo pasa lista queda calificada al apuntarla, como
        // cuando la contesta su destinatario: no hay nada que revisar.
        review_status: 'Revisado',
        submitted_at: cuando.toISOString()
    }).select();

    if (error || !data || data.length === 0) {
        alert("No se pudo apuntar la asistencia. Puede que la base no te deje escribir esa respuesta.");
        return false;
    }
    window.paseDeLista.respuestas.push(data[0]);
    return true;
};

window.borrarAsistencia = async (q, respuestas) => {
    // Las llaves de una respuesta son ids de pregunta, siempre numéricos; las
    // reservadas —los motivos, la foto del área— empiezan por `__` y no cuentan
    // como algo contestado.
    const quedaAlgo = (answers) => Object.keys(answers || {}).some(k => /^\d+$/.test(k));

    for (const r of respuestas) {
        const answers = { ...(r.answers_json || {}) };
        const grades = { ...(r.grades_json || {}) };
        delete answers[q.id];
        delete grades[q.id];

        if (quedaAlgo(answers)) {
            const { data, error } = await sb.from('evaluation_responses')
                .update({ answers_json: answers, grades_json: grades }).eq('id', r.id).select();
            if (error || !data || data.length === 0) {
                alert("No se pudo quitar la asistencia. Puede que la base no te deje escribir esa respuesta.");
                return false;
            }
            Object.assign(r, data[0]);
        } else {
            // Lo de asistencia era todo lo que tenía: la respuesta entera se va.
            // Las políticas de RLS van por operación, así que una tabla puede
            // dejar actualizar y no borrar; se cuentan las filas igual.
            const { data, error } = await sb.from('evaluation_responses')
                .delete().eq('id', r.id).select();
            if (error || !data || data.length === 0) {
                alert("No se pudo quitar la asistencia. Puede que la base no te deje borrar esa respuesta.");
                return false;
            }
            const i = window.paseDeLista.respuestas.indexOf(r);
            if (i >= 0) window.paseDeLista.respuestas.splice(i, 1);
        }
    }
    return true;
};

window.renderizarListaRespuestas = () => {
    const listContainer = document.getElementById('lista-respuestas-historial');
    // La lista no existe si el administrador llegó desde el expediente por
    // empleado; sin esta guarda el redibujado revienta con TypeError.
    if (!listContainer) return;
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    const searchInput = document.getElementById('buscador-historial');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let responses = window.respuestasCacheActual || [];
    
    if (searchTerm) {
        responses = responses.filter(r => {
            const empData = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(r.employee_id)) : null;
            const nombreEmp = (empData ? empData.name : (window.employeeNameMap && window.employeeNameMap[r.employee_id] ? window.employeeNameMap[r.employee_id] : `ID: ${r.employee_id}`)).toLowerCase();
            const evalName = window.evalCache && window.evalCache.evals ? (window.evalCache.evals.find(e => e.id === r.evaluation_id)?.title || '').toLowerCase() : '';
            return nombreEmp.includes(searchTerm) || evalName.includes(searchTerm);
        });
    }

    const contadorElement = document.getElementById('contador-respuestas');
    if (contadorElement) {
        contadorElement.innerText = responses.length;
    }

    if (!responses || responses.length === 0) { 
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">No se encontraron coincidencias.</div>'; 
        return; 
    }
    
    listContainer.innerHTML = '';
    
    const crearCardHtml = (resp, index) => {
        const fecha = new Date(resp.submitted_at).toLocaleDateString();
        const empData = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(resp.employee_id)) : null;
        const nombreEmp = empData ? empData.name : (window.employeeNameMap && window.employeeNameMap[resp.employee_id] ? window.employeeNameMap[resp.employee_id] : `ID: ${resp.employee_id}`);
        
        const originalIndex = window.respuestasCacheActual.findIndex(orig => orig.id === resp.id);
        let tituloCard = `Tu respuesta #${window.respuestasCacheActual.length - originalIndex}`;
        
        if (resp.employee_id !== user.id) tituloCard = `<b>${nombreEmp}</b>`;

        // Aquí iba el nombre de la encuesta cuando esta misma lista servía al
        // historial global; hoy la lista sale siempre dentro de una encuesta y
        // el nombre lo dice el encabezado de la hoja.

        let scoreBadge = '';
        if(resp.review_status === 'Revisado' || resp.review_status === 'Certificada') {
             const score = window.calcularScoreRespuesta(resp);
             const pct = score;
             const color = pct >= 80 ? '#166534' : (pct >= 60 ? '#b45309' : '#991b1b');
             const bg = pct >= 80 ? '#dcfce7' : (pct >= 60 ? '#fef3c7' : '#fee2e2');
             scoreBadge = `<span style="margin-left:5px; font-weight:bold; color:${color}; background:${bg}; padding:2px 6px; border-radius:6px; font-size:0.8rem;">${pct}%</span>`;
        }
        
        const isRevisado = resp.review_status === 'Revisado';
        const isFalsa = resp.review_status === 'Falsa';
        const isCertificada = resp.review_status === 'Certificada';
        const isMalRevisada = resp.review_status === 'Mal Revisada';
        const safeJson = JSON.stringify(resp).replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        
        let colorBorde = isCertificada ? '#3b82f6' : (isRevisado ? '#22c55e' : (isFalsa ? '#ef4444' : (isMalRevisada ? '#a855f7' : '#f97316')));
        
        let textoEstado = isCertificada ? '<span style="color:#1d4ed8; font-weight:bold; font-size:0.75rem;">Certificada</span>' :
                         (isRevisado ? '<span style="color:#166534; font-weight:bold; font-size:0.75rem;">Revisado</span>' : 
                         (isFalsa ? '<span style="color:#991b1b; font-weight:bold; font-size:0.75rem;">Falsa / Anulada</span>' : 
                         (isMalRevisada ? '<span style="color:#7e22ce; font-weight:bold; font-size:0.75rem;">Mal Revisada</span>' : 
                         '<span style="color:#ea580c; font-weight:bold; font-size:0.75rem;">En espera</span>')));
        
        return `<div class="incident-card" style="border-left: 5px solid ${colorBorde}; padding: 15px; cursor:pointer;" onclick='verDetalleRespuesta(${safeJson})'><div style="display:flex; justify-content:space-between; align-items:center;"><div><div style="color:#334155; font-size:1rem; margin-bottom:4px;">${tituloCard} ${scoreBadge}</div><div class="card-meta">${fecha} • ${textoEstado}</div></div><div style="color:#cbd5e1; font-size:1.4rem; line-height:1;">&rsaquo;</div></div></div>`;
    };

    const pendientesDeRevisar = responses.filter(r =>
        r.review_status !== 'Revisado' && r.review_status !== 'Falsa' && r.review_status !== 'Certificada' &&
        window.puedeCalificar(window.encuestaEnCache(r.evaluation_id), r.employee_id)
    );
    
    const resto = responses.filter(r => !pendientesDeRevisar.includes(r));

    if (pendientesDeRevisar.length > 0) {
        listContainer.insertAdjacentHTML('beforeend', `<div style="margin:20px 0 10px 0; color:#ea580c; font-weight:bold; font-size:0.9rem; background:#fff7ed; padding:8px; border-radius:6px; border:1px dashed #fdba74;">Requieren tu revisión (${pendientesDeRevisar.length})</div>`);
        pendientesDeRevisar.forEach((r, i) => listContainer.insertAdjacentHTML('beforeend', crearCardHtml(r, i)));
    }
    if (resto.length > 0) {
        listContainer.insertAdjacentHTML('beforeend', `<div style="margin:30px 0 10px 0; color:#166534; font-weight:bold; font-size:0.9rem; border-bottom:2px solid #bbf7d0; padding-bottom:5px;">Historial / Míos / Equipo</div>`);
        resto.forEach((r, i) => listContainer.insertAdjacentHTML('beforeend', crearCardHtml(r, i)));
    }
};

window.verDetalleRespuesta = async (resp) => {
    window.gradingResponseId = resp.id;
    window.gradesTemp = resp.grades_json || {};
    const modal = document.getElementById('modal-responder-eval');
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));

    // Quién revisa esto no siempre es el jefe: la encuesta puede haber
    // nombrado a los suyos. Se pide antes de dibujar nada.
    const encuestaDeLaRespuesta = await window.encuestaDeLaRespuesta(resp.evaluation_id);
    const puedeCalificar = window.puedeCalificar(encuestaDeLaRespuesta, resp.employee_id);
    const esMiRespuesta = (String(resp.employee_id) === String(user.id));
    const esAdminTotal = window.modoAdminActivo;

    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    // Igual que al responder: la clase .hoja-overlay viene de index.html y
    // aquí sólo se enciende la hoja.
    modal.style.cssText = 'display:flex; z-index:999999;';
    
    let saveButton = '', dateInputHtml = '', deleteButton = '', invalidarButton = '';

    if(puedeCalificar) {
        saveButton = `<button id="btn-save-grades" onclick="guardarCalificacionAdmin()" style="width:100%; background:#22c55e; color:white; padding:15px; border:none; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; box-shadow:0 4px 6px -1px rgba(34, 197, 94, 0.3); margin-top:30px; transition: transform 0.1s;">Guardar Revisión</button>`;
        const d = new Date(resp.submitted_at); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        const dateDisabledAttr = esAdminTotal ? '' : 'disabled';
        dateInputHtml = `<div style="margin-top:10px;"><label style="font-size:0.85rem; color:#64748b; display:block; margin-bottom:4px;">Fecha de Realización:</label><input type="date" id="admin-edit-date" value="${d.toISOString().slice(0,10)}" ${dateDisabledAttr} style="padding:8px; border:1px solid #cbd5e1; border-radius:6px; width:100%; box-sizing:border-box;"></div>`;
    } else {
        dateInputHtml = `<div style="margin-top:5px; color:#64748b; font-size:0.9rem;">Fecha: ${new Date(resp.submitted_at).toLocaleDateString()}</div>`;
        if (resp.review_status !== 'Revisado' && resp.review_status !== 'Certificada' && !esMiRespuesta) {
             // Decir quién sí puede ahorra la pregunta: con revisores
             // nombrados, el supervisor directo ya no es la respuesta.
             const nombrados = window.revisoresDeLaRespuesta(encuestaDeLaRespuesta, resp.employee_id);
             const quien = nombrados.length > 0
                ? 'Esta encuesta la revisa ' + window.sanitizeForHTML(window.nombresDeEmpleados(nombrados))
                : 'Solo el supervisor directo puede calificar';
             dateInputHtml += `<div style="margin-top:10px; padding:10px; background:#fef3c7; color:#b45309; border-radius:6px; font-size:0.85rem;">Nota: ${quien}.</div>`;
        }
    }

    if (esAdminTotal) {
            deleteButton = `<button onclick="borrarRespuestaIndividual('${resp.id}')" style="width:100%; background:white; color:#ef4444; padding:15px; border:1px solid #ef4444; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">🗑️ Eliminar esta respuesta</button>`;

            // Calculamos el puntaje actual
            const scoreActual = window.calcularScoreRespuesta(resp);
            let adminOptions = [];

            // Si está alterada, permitir restaurar
            if (resp.review_status === 'Falsa' || resp.review_status === 'Certificada' || resp.review_status === 'Mal Revisada') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Revisado')" style="width:100%; background:#dcfce7; color:#166534; padding:15px; border:1px solid #22c55e; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">✅ Restaurar a Validada</button>`);
            }
            
            // Certificar solo si tiene >= 80 y no está certificada
            if (scoreActual >= 80 && resp.review_status !== 'Certificada') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Certificada')" style="width:100%; background:#eff6ff; color:#1d4ed8; padding:15px; border:1px solid #3b82f6; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">⭐ Certificar Respuesta (Auditoría)</button>`);
            }
            
            // Botones de rechazo
            if (resp.review_status !== 'Mal Revisada') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Mal Revisada')" style="width:100%; background:#f3e8ff; color:#7e22ce; padding:15px; border:1px solid #a855f7; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">⚠️ Marcar como Mal Revisada (Requiere corrección)</button>`);
            }
            if (resp.review_status !== 'Falsa') {
                adminOptions.push(`<button onclick="cambiarEstadoRespuesta('${resp.id}', 'Falsa')" style="width:100%; background:#fee2e2; color:#991b1b; padding:15px; border:1px solid #ef4444; border-radius:12px; font-size:1.1rem; font-weight:bold; cursor:pointer; margin-top:15px;">🚫 Marcar como Falsa (Anular)</button>`);
            }

            invalidarButton = adminOptions.join("");
        }

    let descHtml = '';
        let evaluatesArea = false; // Agregamos una bandera para saber si la encuesta mide por áreas
        
        if (window.evalCache && window.evalCache.evals) {
            const found = window.evalCache.evals.find(e => e.id === resp.evaluation_id);
            if (found) {
                if (found.description) {
                    descHtml = `<div style="font-size:0.9rem; color:#475569; margin:10px 0 20px 0; background:#f1f5f9; padding:12px; border-radius:8px; border-left:4px solid #cbd5e1;"><b>Instrucciones:</b> ${found.description}</div>`;
                }
                // Revisamos si la evaluación realmente requería medir el área
                if (found.evaluates_area === true) {
                    evaluatesArea = true;
                }
            }
        }

    const recordedArea = (resp.employee_area && resp.employee_area !== 'Sin Área') ? resp.employee_area : '';
        let areaInfoHtml = '';
        
        if (evaluatesArea) {
            if (esAdminTotal) {
                // Consultamos las áreas oficiales a la base de datos
                const { data: areasData } = await sb.from('areas').select('nombre').eq('activa', true).order('nombre');
                let optionsHtml = '<option value="">Sin Área</option>';
                
                let areaEncontrada = false;
                if (areasData) {
                    areasData.forEach(a => {
                        const isSelected = (a.nombre === recordedArea) ? 'selected' : '';
                        if (isSelected) areaEncontrada = true;
                        optionsHtml += `<option value="${a.nombre}" ${isSelected}>${a.nombre}</option>`;
                    });
                }
                
                // Si el registro histórico tiene un área que ya fue borrada/desactivada, la mantenemos visible en la lista
                if (recordedArea && !areaEncontrada) {
                    optionsHtml += `<option value="${recordedArea}" selected>${recordedArea} (No activa)</option>`;
                }

                // El administrador ahora elige de una lista desplegable
                areaInfoHtml = `<span style="background:#fdf4ff; color:#be185d; padding:2px 8px; border-radius:6px; font-size:0.8rem; border:1px solid #fbcfe8; margin-left:8px; font-weight:bold; display:inline-flex; align-items:center;">
                    📍 Área Evaluada: 
                    <select id="admin-edit-area" style="margin-left:5px; padding:2px 5px; border-radius:4px; border:1px solid #fbcfe8; outline:none; font-family:inherit; font-size:0.8rem; color:#be185d; background:white; cursor:pointer;">
                        ${optionsHtml}
                    </select>
                </span>`;
            } else if (recordedArea) {
                // Vista de solo lectura para el empleado o supervisor
                areaInfoHtml = `<span style="background:#fdf4ff; color:#be185d; padding:2px 8px; border-radius:6px; font-size:0.8rem; border:1px solid #fbcfe8; margin-left:8px; font-weight:bold;">📍 Área Evaluada: ${recordedArea}</span>`;
            }
        }

        // --- NUEVO: CÁLCULO Y GLOBO DE CALIFICACIÓN ---
        let badgeCalificacionHtml = '';
        if (resp.review_status === 'Revisado' || resp.review_status === 'Certificada' || resp.review_status === 'Falsa' || resp.review_status === 'Mal Revisada') {
            // Obtenemos el score actual
            const scoreActual = window.calcularScoreRespuesta(resp);
            // Coloreamos según desempeño
            let bgBadge = scoreActual >= 80 ? '#22c55e' : (scoreActual >= 60 ? '#f59e0b' : '#ef4444');
            
            if (resp.review_status === 'Falsa') bgBadge = '#64748b'; // Gris si fue anulada
            if (resp.review_status === 'Mal Revisada') bgBadge = '#a855f7'; // Morado si fue mal revisada
            
            badgeCalificacionHtml = `<span style="background:${bgBadge}; color:white; padding:4px 12px; border-radius:12px; font-size:1rem; font-weight:bold; box-shadow: 0 2px 4px rgba(0,0,0,0.1); letter-spacing:-0.5px; white-space:nowrap;">${scoreActual}%</span>`;
        } else {
            // Mostrar pendiente si se está calificando
            badgeCalificacionHtml = `<span style="background:#f1f5f9; color:#64748b; border: 1px solid #cbd5e1; padding:4px 12px; border-radius:12px; font-size:0.85rem; font-weight:bold; white-space:nowrap;">Calificando...</span>`;
        }

        // La foto del área, en las respuestas que la traen. Va arriba del todo:
        // es el contexto con el que se leen las respuestas de abajo. Ya no se
        // toma ninguna nueva —lo que haya que fotografiar se pide con una
        // pregunta de evidencia—, así que esto es sólo para lo ya contestado:
        // sin foto, el recuadro no se dibuja.
        const urlFoto = window.fotoDeArea(resp);
        const fotoAreaHtml = urlFoto ? `
                <div style="margin-bottom:20px; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px;">
                    <div style="font-size:0.8rem; font-weight:700; color:#be185d; margin-bottom:8px;">📷 Fotografía del área</div>
                    <img src="${window.sanitizeForHTML(urlFoto)}" alt="Fotografía del área"
                         onclick="window.abrirVisorImagen('${window.sanitizeForHTML(urlFoto)}')"
                         style="width:100%; border-radius:10px; display:block; cursor:pointer;" title="Toca para ampliar">
                </div>` : '';

        modal.innerHTML = `
            <div class="hoja-contenido" style="max-width:900px; background:#f8fafc; overflow:hidden; padding:12px 0 0;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h2 class="hoja-titulo">Detalle de respuesta</h2>
                    <div class="hoja-subtitulo">Empleado: <b>${window.employeeNameMap[resp.employee_id] || resp.employee_id}</b> ${areaInfoHtml}</div>
                </div>
                <div class="hoja-acciones">
                    ${badgeCalificacionHtml}
                    <button onclick="cancelarRespuesta('history')" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                </div>
            </div>
            <div id="simple-form-container" style="flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y; padding: 14px 15px calc(25px + env(safe-area-inset-bottom)); box-sizing: border-box;">
                <div style="margin-bottom:20px;">
                    ${dateInputHtml}
                </div>
                ${fotoAreaHtml}
                ${descHtml}
                <div id="responder-questions-list"></div>
                ${saveButton}${invalidarButton}${deleteButton}
            </div>
            </div>
        `;
    
    const container = document.getElementById('responder-questions-list');
    let questions = window.preguntasCacheActual;
    
    if(!questions || questions.length === 0 || questions[0].evaluation_id !== resp.evaluation_id) {
        container.innerHTML = 'Cargando preguntas...';
        const { data: qs } = await sb.from('evaluation_questions').select('*').eq('evaluation_id', resp.evaluation_id).order('order_index');
        questions = qs; window.preguntasCacheActual = qs;
        container.innerHTML = '';
    }
    
    window.respuestasTempAdmin = resp.answers_json || {};
    const responseDate = new Date(resp.submitted_at);

    // Cuándo se registró la asistencia: es cuando se envió la respuesta, así
    // que la pregunta no tiene que guardar ninguna hora suya.
    const diaDeLaRespuesta = isNaN(responseDate.getTime())
        ? ''
        : responseDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    if(questions) questions.forEach((q, index) => {
        if (q.created_at) {
            const questionDate = new Date(q.created_at);
            if (questionDate.getTime() > (responseDate.getTime() + 60000) && !window.respuestasTempAdmin[q.id]) {
                return;
            }
        }

        const rawRespuesta = (resp.answers_json || {})[q.id];
        const isListMatch = q.question_type === 'list_match';
        const isRange = q.question_type === 'range';
        
        let contentHtml = ""; 
        const gradeObj = window.gradesTemp[q.id];
        let resultBadgeId = `badge-${q.id}`;
        let resultBadge = '';

        // Pre-calcular el badge y el estado para usarlo en la cabecera
        if (isListMatch) {
            const currentItems = Array.isArray(rawRespuesta) ? rawRespuesta : (typeof rawRespuesta === 'string' ? rawRespuesta.split('\n') : []);
            let modelLen = 0;
            try { const parsed = JSON.parse(q.correct_answer_text); if(Array.isArray(parsed)) modelLen = parsed.length; else if (typeof parsed === 'string') modelLen = 1; } catch(e) { if (q.correct_answer_text) { modelLen = q.correct_answer_text.split(/\n/).filter(s => s.trim() !== "").length; } }
            if (modelLen === 0 && q.correct_answer_text && q.correct_answer_text.includes(',')) { modelLen = q.correct_answer_text.split(',').filter(s => s.trim() !== "").length; }
            
            const totalEsperado = modelLen > 0 ? modelLen : currentItems.length;
            if (!gradeObj || !gradeObj.type || gradeObj.type !== 'list_match') { window.gradesTemp[q.id] = { type: 'list_match', items: currentItems.map(txt => ({ text: txt, status: 'pending' })) }; }
            if(window.gradesTemp[q.id].items.length !== currentItems.length) { window.gradesTemp[q.id].items = currentItems.map(txt => ({ text: txt, status: 'pending' })); }
            window.gradesTemp[q.id].totalExpected = totalEsperado;

            const aciertos = window.gradesTemp[q.id].items.filter(i=>i.status==='correct').length;
            let warningText = '';
            if (currentItems.length < totalEsperado) { warningText = `<div style="margin-top:5px; color:#ef4444; font-size:0.75rem; font-weight:bold;">⚠️ Faltaron ${totalEsperado - currentItems.length} elementos</div>`; }
            let color = '#64748b', bg = '#f1f5f9';
            if(totalEsperado > 0 && aciertos === totalEsperado) { color='#166534'; bg='#dcfce7'; }
            else if(aciertos > 0) { color='#b45309'; bg='#fef3c7'; }
            
            resultBadge = `<div style="text-align:right;"><span id="${resultBadgeId}" data-total="${totalEsperado}" style="background:${bg}; color:${color}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${aciertos}/${totalEsperado} Aciertos</span>${warningText}</div>`;

        } else if (gradeObj && gradeObj.type === 'numeric_score') {
            const val = gradeObj.value;
            const max = gradeObj.max || 5;
            const pct = gradeObj.percentage || 0;
            let color = '#166534', bg = '#dcfce7';
            if(pct < 80) { color = '#b45309'; bg = '#fef3c7'; }
            if(pct < 60) { color = '#991b1b'; bg = '#fee2e2'; }
            resultBadge = `<span id="${resultBadgeId}" style="float:right; background:${bg}; color:${color}; padding:3px 10px; border-radius:12px; font-size:0.85rem; font-weight:bold;">${val}/${max} (${pct}%)</span>`;
        } else if (window.esPreguntaDeFirma(q)) {
            // Una firma no se califica —no puntúa—, así que «PENDIENTE» sobre
            // ella diría que alguien tiene que hacer algo con ella. O está
            // firmada o no lo está.
            const firmada = typeof rawRespuesta === 'string' && rawRespuesta.trim() !== '';
            resultBadge = `<span id="${resultBadgeId}" style="float:right; background:${firmada?'#f5f3ff':'#f1f5f9'}; color:${firmada?'#6d28d9':'#64748b'}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${firmada?'FIRMADA':'SIN FIRMAR'}</span>`;
        } else if (window.esPreguntaDeAsistencia(q)) {
            // Aquí no se acierta ni se falla: o se registró o no. «CORRECTO»
            // sobre una asistencia se lee como si hubiera habido algo que
            // calificar.
            const registrada = (gradeObj && gradeObj.status === 'correct') || rawRespuesta === window.TEXTO_ASISTENCIA;
            resultBadge = `<span id="${resultBadgeId}" style="float:right; background:${registrada?'#dcfce7':'#f1f5f9'}; color:${registrada?'#166534':'#64748b'}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${registrada?'REGISTRADA':'SIN REGISTRAR'}</span>`;
        } else {
            let status = "pending";
            if (typeof gradeObj === 'string') status = gradeObj;
            else if (gradeObj && gradeObj.status) status = gradeObj.status;
            
            resultBadge = `<span id="${resultBadgeId}" style="float:right; background:${status==='correct'?'#dcfce7':(status==='incorrect'?'#fee2e2':'#f1f5f9')}; color:${status==='correct'?'#166534':(status==='incorrect'?'#991b1b':'#64748b')}; padding:3px 10px; border-radius:12px; font-size:0.75rem; font-weight:bold;">${status==='correct'?'CORRECTO':(status==='incorrect'?'INCORRECTO':'PENDIENTE')}</span>`;
        }

        // Una asistencia no se lee ni se califica: se confirmó al enviarla y
        // eso es todo lo que había que saber. Ni siquiera en modo
        // administrador aparece un campo para editarla —lo que se corregiría
        // sería que alguien fue o no fue, y eso se arregla borrando la
        // respuesta, no reescribiéndola—; `guardarCalificacionAdmin` parte de
        // una copia de `answers_json`, así que el valor sobrevive intacto.
        if (window.esPreguntaDeAsistencia(q)) {
            const registrada = rawRespuesta === window.TEXTO_ASISTENCIA;

            // Cuándo era el evento, si la pregunta lo dice: es lo que explica
            // que alguien no la tenga registrada.
            const cuando = window.fechaDelEvento(q);
            const lineaEvento = cuando
                ? `<div style="font-size:0.8rem; color:#64748b; margin-top:8px;">📅 El evento fue el ${window.sanitizeForHTML(window.fechaYHoraLegible(cuando))}, con ${window.MINUTOS_PARA_REGISTRAR_ASISTENCIA} minutos para registrarlo</div>`
                : '';

            contentHtml = (registrada
                ? `<div style="display:flex; align-items:center; gap:10px; background:#f0fdf4; border:1px solid #bbf7d0; padding:14px; border-radius:10px; color:#15803d; font-weight:600;">
                       <span style="font-size:1.2rem;">🙋</span>
                       <span>Asistencia registrada${diaDeLaRespuesta ? ` · ${window.sanitizeForHTML(diaDeLaRespuesta)}` : ''}</span>
                   </div>`
                : `<div style="background:#f8fafc; padding:15px; border-radius:8px; color:#94a3b8; font-size:0.95rem; border:1px solid #cbd5e1;">(Sin registrar)</div>`) + lineaEvento;
        }
        // Una firma se mira y ya: es la constancia de que esa persona contestó,
        // no una respuesta que se acierte o se falle, así que va sin los
        // botones de correcto e incorrecto que sí lleva la evidencia. Ni en
        // modo administrador se ofrece un campo para editarla —lo que se
        // corregiría es quién firmó, y eso se arregla borrando la respuesta—;
        // `guardarCalificacionAdmin` parte de una copia de `answers_json`, así
        // que la URL sobrevive intacta.
        else if (window.esPreguntaDeFirma(q)) {
            const urlFirma = typeof rawRespuesta === 'string' ? rawRespuesta.trim() : '';
            contentHtml = urlFirma
                ? `<div style="background:white; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                       <img src="${window.sanitizeForHTML(urlFirma)}" alt="Firma"
                            onclick="window.abrirVisorImagen && window.abrirVisorImagen('${window.sanitizeForHTML(urlFirma)}')"
                            style="width:100%; border-radius:6px; display:block; cursor:pointer;" title="Toca para ampliar">
                       <div style="font-size:0.75rem; color:#94a3b8; margin-top:8px;">Firmado${diaDeLaRespuesta ? ` el ${window.sanitizeForHTML(diaDeLaRespuesta)}` : ''} &middot; no cuenta para la calificación</div>
                   </div>`
                : `<div style="background:#f8fafc; padding:15px; border-radius:8px; color:#94a3b8; font-size:0.95rem; border:1px solid #cbd5e1;">(Sin firmar)</div>`;
        }
        // Una evidencia se mira, no se lee: su respuesta es la URL de la foto y
        // se pinta igual se pueda calificar o no. Editarla desde aquí no tiene
        // sentido —habría que volver a tomarla—, así que ni el administrador
        // ve un campo de texto con la URL dentro.
        else if (window.esPreguntaDeFoto(q)) {
            const urlEvidencia = typeof rawRespuesta === 'string' ? rawRespuesta : '';
            contentHtml = urlEvidencia
                ? `<img src="${window.sanitizeForHTML(urlEvidencia)}" alt="Evidencia"
                        onclick="window.abrirVisorImagen && window.abrirVisorImagen('${window.sanitizeForHTML(urlEvidencia)}')"
                        style="width:100%; border-radius:10px; display:block; cursor:pointer;" title="Toca para ampliar">`
                : `<div style="background:#f8fafc; padding:15px; border-radius:8px; color:#94a3b8; font-size:0.95rem; border:1px solid #cbd5e1;">(Sin evidencia)</div>`;

            // Y su calificación, que es la misma de correcto/incorrecto que
            // llevan las de texto: mismas clases y mismo marcado, que es de lo
            // que se agarra `setGrade` para apagar el botón contrario.
            if (puedeCalificar) {
                const estadoFoto = (gradeObj && gradeObj.status) || (typeof gradeObj === 'string' ? gradeObj : 'pending');
                contentHtml += `
                    <div style="margin-top:15px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">Calificación:</div>
                        <div style="display:flex; gap:8px;">
                            <button class="grade-btn ${estadoFoto==='correct'?'selected-correct':''}" onclick="setGrade('${q.id}', 'correct', this)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #22c55e; background:${estadoFoto==='correct'?'#22c55e':'white'}; color:${estadoFoto==='correct'?'white':'#22c55e'}; cursor:pointer; font-weight:bold; transition:all 0.2s;">Correcto</button>
                            <button class="grade-btn ${estadoFoto==='incorrect'?'selected-incorrect':''}" onclick="setGrade('${q.id}', 'incorrect', this)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ef4444; background:${estadoFoto==='incorrect'?'#ef4444':'white'}; color:${estadoFoto==='incorrect'?'white':'#ef4444'}; cursor:pointer; font-weight:bold; transition:all 0.2s;">Incorrecto</button>
                        </div>
                    </div>`;
            }
        }
        // Construir la vista Integrada (Editable/Calificable) vs la vista de Sólo Lectura
        else if (puedeCalificar) {
            const readOnlyAttr = esAdminTotal ? '' : 'readonly disabled';
            const displayEditOpts = esAdminTotal ? 'flex' : 'none';
            const bgEditable = esAdminTotal ? 'white' : '#f8fafc';

            if (isListMatch) {
                let modelItems = [];
                try { const parsed = JSON.parse(q.correct_answer_text); if(Array.isArray(parsed)) modelItems = parsed; else if (typeof parsed === 'string') modelItems = [parsed]; } catch(e) { if (q.correct_answer_text) { modelItems = q.correct_answer_text.split(/\n/).map(s => s.trim()).filter(s => s !== ""); } }
                if (modelItems.length === 0 && q.correct_answer_text && q.correct_answer_text.includes(',')) { modelItems = q.correct_answer_text.split(',').map(s => s.trim()).filter(s => s !== ""); }
                let modelLen = modelItems.length;
                let correctModelHtml = modelLen > 0 ? modelItems.map(item => `<div style="background:#eff6ff; border:1px solid #bfdbfe; border-left:3px solid #3b82f6; padding:6px 10px; margin-bottom:4px; border-radius:4px; color:#1e3a8a; font-size:0.85rem;">${item}</div>`).join("") : '<div style="color:#94a3b8; font-style:italic; padding:5px; font-size:0.85rem;">Sin respuesta modelo</div>';
                
                const totalEsperado = window.gradesTemp[q.id].totalExpected;
                const gItems = window.gradesTemp[q.id].items;

                let inputsHtml = `<div id="admin-edit-list-${q.id}" style="display:flex; flex-direction:column; gap:6px;">`;
                gItems.forEach((it, idx) => {
                     const st = it.status;
                     const btnOkClass = st === 'correct' ? 'opacity:1; transform:scale(1.1); filter:grayscale(0);' : 'opacity:0.4; filter:grayscale(1);';
                     const btnBadClass = st === 'incorrect' ? 'opacity:1; transform:scale(1.1); filter:grayscale(0);' : 'opacity:0.4; filter:grayscale(1);';
                     
                     inputsHtml += `<div class="list-item-row" style="display:flex; gap:8px; align-items:center;">
                         <textarea class="admin-edit-list-item-${q.id} auto-resize-text" ${readOnlyAttr} oninput="window.gradesTemp['${q.id}'].items[${idx}].text = this.value; this.style.height='auto'; this.style.height=this.scrollHeight+'px';" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem; background:${bgEditable}; resize:none; overflow-y:hidden; min-height:38px; font-family:inherit; line-height:1.4;">${it.text}</textarea>
                         <div style="display:flex; background:#f1f5f9; padding:4px; border-radius:6px; gap:4px; border:1px solid #e2e8f0;">
                             <button id="btn-ok-${q.id}-${idx}" onclick="setItemGrade('${q.id}', ${idx}, 'correct', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; ${btnOkClass}" title="Marcar Correcto">✅</button>
                             <button id="btn-bad-${q.id}-${idx}" onclick="setItemGrade('${q.id}', ${idx}, 'incorrect', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; ${btnBadClass}" title="Marcar Incorrecto">❌</button>
                         </div>
                         <button onclick="this.closest('.list-item-row').remove(); window.recalcListMatch('${q.id}');" style="display:${displayEditOpts}; color:#ef4444; border:none; background:#fee2e2; width:28px; height:28px; border-radius:6px; cursor:pointer; font-weight:bold; align-items:center; justify-content:center;" title="Eliminar ítem">✕</button>
                     </div>`;
                });
                inputsHtml += `</div><button onclick="addAdminListInputAdvanced('${q.id}')" style="display:${displayEditOpts}; margin-top:10px; padding:6px 12px; font-size:0.8rem; font-weight:bold; color:#2563eb; background:#eff6ff; border:1px dashed #bfdbfe; border-radius:6px; cursor:pointer; width: fit-content;">+ Agregar Ítem</button>`;
                
                contentHtml = `
                <div style="display:flex; flex-wrap:wrap; gap: 20px;">
                    <div style="flex: 1; min-width:250px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Respuestas del Usuario (Editable y Calificable):</div>
                        ${inputsHtml}
                    </div>
                    <div style="width: 250px; flex-shrink:0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Modelo (${totalEsperado}):</div>
                        ${correctModelHtml}
                    </div>
                </div>`;

            } else if (['text', 'multiple', 'checklist'].includes(q.question_type)) {
                let editableInput = '';
                if (q.question_type === 'text') {
                    editableInput = `<textarea class="admin-edit-answer" data-qid="${q.id}" data-type="${q.question_type}" ${readOnlyAttr} oninput="this.style.height=''; this.style.height=this.scrollHeight+'px'" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-family:inherit; font-size:0.95rem; background:${bgEditable}; resize:none; overflow-y:hidden; min-height:80px;">${rawRespuesta||''}</textarea>`;
                } else if (q.question_type === 'multiple') {
                    let options = q.options || []; if(typeof options === 'string') try{options=JSON.parse(options)}catch(e){}
                    let optsHtml = `<option value="">(Sin selección)</option>`;
                    options.forEach(o => { optsHtml += `<option value="${o}" ${rawRespuesta===o?'selected':''}>${o}</option>`; });
                    editableInput = `<select class="admin-edit-answer" data-qid="${q.id}" data-type="multiple" ${readOnlyAttr} style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.95rem; background:${bgEditable};">${optsHtml}</select>`;
                } else if (q.question_type === 'checklist') {
                    let options = q.options || []; if(typeof options === 'string') try{options=JSON.parse(options)}catch(e){}
                    let checksHtml = ""; const currentArr = Array.isArray(rawRespuesta) ? rawRespuesta : [];
                    options.forEach(o => { checksHtml += `<label style="display:block; margin-bottom:6px; cursor:pointer;"><input type="checkbox" class="admin-edit-check-${q.id}" value="${o}" ${currentArr.includes(o)?'checked':''} ${readOnlyAttr} style="accent-color:#2563eb;"> <span style="font-size:0.95rem; color:#334155;">${o}</span></label>`; });
                    editableInput = `<div class="admin-edit-answer-check-group" data-qid="${q.id}" data-type="checklist" style="padding:10px; border:1px solid #cbd5e1; border-radius:6px; background:${bgEditable};">${checksHtml}</div>`;
                }

                // En una pregunta de opciones, la «respuesta modelo» son las
                // que se marcaron como correctas. Lo guardado antes de que eso
                // existiera era el arreglo con todas las opciones, que no dice
                // nada: ahí se sigue calificando a criterio de quien revisa.
                const correctasDeLaPregunta = window.opcionesCorrectas(q);
                const esDeOpciones = window.PREGUNTAS_CON_OPCIONES.includes(q.question_type);

                let modeloTitulo = "Respuesta Modelo:";
                let correctText = q.correct_answer_text || "A criterio del evaluador";

                if (correctasDeLaPregunta.length > 0) {
                    modeloTitulo = correctasDeLaPregunta.length === 1 ? "Opción correcta:" : "Opciones correctas:";
                    correctText = correctasDeLaPregunta
                        .map(o => `✔ ${window.sanitizeForHTML(o)}`).join('<br>');
                } else if (esDeOpciones) {
                    correctText = "A criterio del evaluador";
                }

                let status = "pending";
                if (typeof gradeObj === 'string') status = gradeObj;
                else if (gradeObj && gradeObj.status) status = gradeObj.status;
                
                const isCorrect = status === 'correct' ? 'selected-correct' : '';
                const isIncorrect = status === 'incorrect' ? 'selected-incorrect' : '';

                contentHtml = `
                <div style="display:flex; gap: 20px; flex-wrap:wrap;">
                    <div style="flex: 1; min-width: 250px;">
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Respuesta del Usuario:</div>
                        ${editableInput}
                    </div>
                    <div style="width: 250px; flex-shrink:0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px; display:flex; flex-direction:column; justify-content:space-between;">
                        <div>
                            <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">${modeloTitulo}</div>
                            <div style="background:#eff6ff; padding:8px 12px; border-radius:6px; font-size:0.9rem; color:#1e3a8a; border-left:3px solid #3b82f6; line-height:1.6;">${correctText}</div>
                        </div>
                        <div style="margin-top:15px;">
                            <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">Calificación:${(gradeObj && gradeObj.auto) ? ' <span style="font-weight:500; color:#16a34a;">se calificó sola</span>' : ''}</div>
                            <div style="display:flex; gap:8px;">
                                <button class="grade-btn ${isCorrect}" onclick="setGrade('${q.id}', 'correct', this)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #22c55e; background:${status==='correct'?'#22c55e':'white'}; color:${status==='correct'?'white':'#22c55e'}; cursor:pointer; font-weight:bold; transition:all 0.2s;">Correcto</button>
                                <button class="grade-btn ${isIncorrect}" onclick="setGrade('${q.id}', 'incorrect', this)" style="flex:1; padding:8px; border-radius:8px; border:1px solid #ef4444; background:${status==='incorrect'?'#ef4444':'white'}; color:${status==='incorrect'?'white':'#ef4444'}; cursor:pointer; font-weight:bold; transition:all 0.2s;">Incorrecto</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                
            } else if (q.question_type === 'range') {
                let min = 0, max = 5, step = 1;
                let opts = q.options;
                if(typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e){ opts=[]; } }
                if(Array.isArray(opts) && opts.length >= 2) { min = parseInt(opts[0]); max = parseInt(opts[1]); if(opts.length > 2 && (String(opts[2]) === '0.5')) step = 0.5; }
                
                let rangeHtml = '<div class="admin-edit-answer-range-group" data-qid="'+q.id+'" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">';
                for(let i = min; i <= max; i += step) {
                    const val = Math.round(i * 10) / 10;
                    const checked = String(rawRespuesta) === String(val);
                    const bg = checked ? '#2563eb' : 'white'; const col = checked ? 'white' : '#64748b';
                    rangeHtml += `<div onclick="this.parentElement.querySelectorAll('.rg-circle').forEach(c=>{c.style.background='white';c.style.color='#64748b';}); this.style.background='#2563eb'; this.style.color='white'; this.previousElementSibling.checked=true; window.syncGradeWithAnswer('${q.id}', ${val}, ${max});" class="rg-circle" style="width:38px; height:38px; border-radius:50%; border:1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:bold; background:${bg}; color:${col}; font-size:0.9rem; transition:all 0.2s;">${val}</div><input type="radio" name="adm-range-${q.id}" value="${val}" style="display:none" ${checked?'checked':''}>`;
                }
                rangeHtml += '</div>';

                const valActual = gradeObj ? gradeObj.value : (parseFloat(rawRespuesta)||0);

                contentHtml = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
                    <div>
                        <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px; font-weight:600;">Selección (Ajusta para calificar):</div>
                        ${rangeHtml}
                    </div>
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:15px; text-align:center; min-width:120px;">
                         <div style="font-size:0.85rem; color:#64748b; margin-bottom:6px; font-weight:600;">Puntaje Asignado:</div>
                         <div style="display:flex; justify-content:center; align-items:center; gap:5px;">
                             <input type="number" id="grade-input-${q.id}" step="${step}" min="${min}" max="${max}" value="${valActual}" oninput="window.updateNumericGrade('${q.id}', this.value, ${max}); this.parentElement.parentElement.previousElementSibling.querySelectorAll('.rg-circle').forEach(c=>{c.style.background='white';c.style.color='#64748b';}); const radios = this.parentElement.parentElement.previousElementSibling.querySelectorAll('input[type=radio]'); radios.forEach(r=>{ if(r.value==this.value){ r.checked=true; r.nextElementSibling.style.background='#2563eb'; r.nextElementSibling.style.color='white'; } })" style="width:60px; padding:6px; border:1px solid #cbd5e1; border-radius:6px; text-align:center; font-weight:bold; font-size:1rem; color:#0f172a;">
                             <span style="font-size:1rem; color:#64748b; font-weight:bold;">/ ${max}</span>
                         </div>
                    </div>
                </div>`;
            }

        } else {
            // SOLO LECTURA (Empleado viendo su respuesta evaluada)
            if(isListMatch && Array.isArray(rawRespuesta)) { contentHtml = rawRespuesta.map((r, i) => `<div style="background:#f1f5f9; padding:5px 10px; border-radius:6px; margin-bottom:4px; font-size:0.95rem;">${i+1}. ${r}</div>`).join(""); }
            else if (isRange) contentHtml = `<div style="font-size:1.5rem; font-weight:bold; color:#2563eb; text-align:center;">${rawRespuesta}</div>`;
            else if (Array.isArray(rawRespuesta)) contentHtml = rawRespuesta.join(", ");
            else contentHtml = rawRespuesta || "(Sin respuesta)";
            
            if (contentHtml) contentHtml = `<div style="background:#f8fafc; padding:15px; border-radius:8px; color:#334155; font-size:1rem; border:1px solid #cbd5e1;">${contentHtml}</div>`;
        }

        // Borde dinámico según si es correcto/incorrecto
        let cardBorderColor = '#e2e8f0';
        if (resultBadge.includes('INCORRECTO') || (resultBadge.includes('Aciertos') && !resultBadge.includes('dcfce7'))) {
            cardBorderColor = '#fecaca';
        } else if (resultBadge.includes('CORRECTO') || resultBadge.includes('dcfce7')) {
            cardBorderColor = '#bbf7d0';
        }

        // El porqué de una pregunta con opciones. Es lo que hay que leer para
        // calificarla, así que va pegado a la respuesta y no en otra pantalla.
        const motivo = window.motivoDePregunta(resp, q.id);
        let motivoHtml = '';
        if (motivo) {
            motivoHtml = `
                <div style="margin-top:12px; background:#faf5ff; border:1px solid #e9d5ff; border-left:3px solid #a855f7; border-radius:8px; padding:12px 14px;">
                    <div style="font-size:0.75rem; font-weight:700; color:#7e22ce; margin-bottom:4px;">💬 Comentario</div>
                    <div style="font-size:0.95rem; color:#334155; white-space:pre-wrap;">${window.sanitizeForHTML(motivo)}</div>
                </div>`;
        } else if (window.llevaMotivo(q) && rawRespuesta) {
            // Las respuestas anteriores a que se pidiera el motivo no lo traen;
            // decirlo evita buscarlo.
            motivoHtml = `<div style="margin-top:12px; font-size:0.8rem; color:#94a3b8; font-style:italic;">Sin explicación: se contestó antes de que se pidiera.</div>`;
        }

        // Quien califica una escala necesita el mismo criterio que quien la
        // contestó, así que la guía sale también aquí.
        const guiaHtml = window.bloqueGuiaEscala(q);

        container.insertAdjacentHTML('beforeend', `<div class="pregunta-detalle" style="margin-bottom:30px; background:white; padding:25px; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid ${cardBorderColor};"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;"><label style="font-weight:700; color:#1e293b; font-size:1.1rem; line-height:1.4; flex:1;">${index+1}. ${q.question_text}</label>${resultBadge}</div>${guiaHtml}${contentHtml}${motivoHtml}</div>`);
    });
    setTimeout(() => {
        document.querySelectorAll('.admin-edit-answer[data-type="text"], .auto-resize-text').forEach(ta => {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        });
    }, 150);
};

// Funciones Helper para agregar y recalcular en List Match Dinámico
window.addAdminListInputAdvanced = (qid) => {
    const container = document.getElementById(`admin-edit-list-${qid}`);
    const idx = container.children.length;
    window.gradesTemp[qid].items.push({ text: '', status: 'pending' });
    
    const div = document.createElement('div');
    div.className = "list-item-row";
    div.style.cssText = "display:flex; gap:8px; align-items:center;";
    div.innerHTML = `
        <textarea class="admin-edit-list-item-${qid} auto-resize-text" oninput="window.gradesTemp['${qid}'].items[${idx}].text = this.value; this.style.height='auto'; this.style.height=this.scrollHeight+'px';" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.9rem; resize:none; overflow-y:hidden; min-height:38px; font-family:inherit; line-height:1.4;"></textarea>
        <div style="display:flex; background:#f1f5f9; padding:4px; border-radius:6px; gap:4px; border:1px solid #e2e8f0;">
            <button id="btn-ok-${qid}-${idx}" onclick="setItemGrade('${qid}', ${idx}, 'correct', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; opacity:0.4; filter:grayscale(1);" title="Marcar Correcto">✅</button>
            <button id="btn-bad-${qid}-${idx}" onclick="setItemGrade('${qid}', ${idx}, 'incorrect', this)" style="border:none; background:none; cursor:pointer; font-size:1.1rem; transition:all 0.2s; opacity:0.4; filter:grayscale(1);" title="Marcar Incorrecto">❌</button>
        </div>
        <button onclick="this.closest('.list-item-row').remove(); window.recalcListMatch('${qid}');" style="display:flex; color:#ef4444; border:none; background:#fee2e2; width:28px; height:28px; border-radius:6px; cursor:pointer; font-weight:bold; align-items:center; justify-content:center;" title="Eliminar ítem">✕</button>
    `;
    container.appendChild(div);
};

window.recalcListMatch = (qid) => {
    const container = document.getElementById(`admin-edit-list-${qid}`);
    const newItems = [];
    container.querySelectorAll('.list-item-row').forEach((row, newIdx) => {
         const inp = row.querySelector(`textarea.auto-resize-text`) || row.querySelector(`input[type="text"]`);
         const text = inp ? inp.value : '';
         
         const btnOk = row.querySelector(`button[id^="btn-ok-"]`);
         let status = 'pending';
         if(btnOk && btnOk.style.opacity === '1') status = 'correct';
         else {
             const btnBad = row.querySelector(`button[id^="btn-bad-"]`);
             if(btnBad && btnBad.style.opacity === '1') status = 'incorrect';
         }
         
         newItems.push({ text, status });
         
         inp.setAttribute('oninput', `window.gradesTemp['${qid}'].items[${newIdx}].text = this.value`);
         if(btnOk) {
             btnOk.id = `btn-ok-${qid}-${newIdx}`;
             btnOk.setAttribute('onclick', `setItemGrade('${qid}', ${newIdx}, 'correct', this)`);
         }
         const btnBad = row.querySelector(`button[id^="btn-bad-"]`);
         if(btnBad) {
             btnBad.id = `btn-bad-${qid}-${newIdx}`;
             btnBad.setAttribute('onclick', `setItemGrade('${qid}', ${newIdx}, 'incorrect', this)`);
         }
    });
    
    window.gradesTemp[qid].items = newItems;
    
    const aciertos = newItems.filter(i => i.status === 'correct').length;
    const badge = document.getElementById(`badge-${qid}`);
    if(badge) {
        const total = parseInt(badge.dataset.total || newItems.length);
        let color = '#64748b', bg = '#f1f5f9';
        if(total > 0 && aciertos === total) { color='#166534'; bg='#dcfce7'; }
        else if(aciertos > 0) { color='#b45309'; bg='#fef3c7'; }
        badge.style.background = bg;
        badge.style.color = color;
        badge.innerText = `${aciertos}/${total} Aciertos`;
    }
};

// --- LOGICA DE CALIFICACIÓN (ADMIN) ---

window.updateBadgeVisual = (qid, val, max, pct) => {
    const badge = document.getElementById(`badge-${qid}`);
    if(badge) {
        let color = '#166534', bg = '#dcfce7';
        if(pct < 80) { color = '#b45309'; bg = '#fef3c7'; }
        if(pct < 60) { color = '#991b1b'; bg = '#fee2e2'; }
        
        badge.style.background = bg;
        badge.style.color = color;
        badge.innerText = `${val}/${max} (${Math.round(pct)}%)`;
        
        const card = badge.closest('div[style*="border-radius:16px"]');
        if(card) {
            let borderColor = '#bbf7d0';
            if(pct < 60) borderColor = '#fecaca';
            card.style.borderColor = borderColor;
        }
    }
}

window.syncGradeWithAnswer = (qid, val, max) => {
    const numericVal = parseFloat(val);
    if(isNaN(numericVal)) return;

    const pct = (numericVal / max) * 100;
    
    window.gradesTemp[qid] = {
        type: 'numeric_score',
        value: numericVal,
        max: max,
        percentage: Math.round(pct * 100) / 100
    };

    window.updateBadgeVisual(qid, numericVal, max, pct);

    const gradeInput = document.getElementById(`grade-input-${qid}`);
    if(gradeInput) gradeInput.value = numericVal;
};

window.updateNumericGrade = (questionId, newVal, max) => {
    const val = parseFloat(newVal);
    if(isNaN(val)) return;
    
    const pct = (val / max) * 100;
    
    window.gradesTemp[questionId] = {
        type: 'numeric_score',
        value: val,
        max: max,
        percentage: Math.round(pct * 100) / 100
    };

    window.updateBadgeVisual(questionId, val, max, pct);
};

window.setGrade = (questionId, status, btn) => {
    window.gradesTemp[questionId] = { status: status, type: 'standard' };
    
    const container = btn.closest('div');
    container.querySelectorAll('.grade-btn').forEach(b => {
        b.style.background = 'white';
        if(b.classList.contains('selected-correct')) b.style.color = '#22c55e';
        else b.style.color = '#ef4444';
    });
    
    btn.style.background = status === 'correct' ? '#22c55e' : '#ef4444';
    btn.style.color = 'white';
    
    const badge = document.getElementById(`badge-${questionId}`);
    if(badge) {
        badge.style.background = status === 'correct' ? '#dcfce7' : '#fee2e2';
        badge.style.color = status === 'correct' ? '#166534' : '#991b1b';
        badge.innerText = status === 'correct' ? 'CORRECTO' : 'INCORRECTO';

        // La tarjeta se busca por su clase. Antes se buscaba por el atributo
        // style (`div[style*="border-radius:16px"]`), y la primera calificación
        // lo rompía: al escribir `borderColor` el navegador reescribe el
        // atributo entero con espacios —`border-radius: 16px`—, así que a
        // partir de la segunda el selector ya no casaba, `closest` devolvía
        // null y el TypeError abortaba la función sin aviso.
        const tarjeta = badge.closest('.incident-card, .pregunta-detalle');
        if (tarjeta) tarjeta.style.borderColor = status === 'correct' ? '#bbf7d0' : '#fecaca';
    }
};

window.setItemGrade = (questionId, itemIndex, status, btn) => {
    if (!window.gradesTemp[questionId] || window.gradesTemp[questionId].type !== 'list_match') { return; }
    
    window.gradesTemp[questionId].items[itemIndex].status = status;
    
    const row = btn.closest('div');
    row.querySelectorAll('button[id^="btn-ok-"], button[id^="btn-bad-"]').forEach(b => { 
        b.style.opacity = '0.4'; 
        b.style.filter = 'grayscale(1)'; 
        b.style.transform = 'scale(1)'; 
    });
    btn.style.opacity = '1';
    btn.style.filter = 'grayscale(0)';
    btn.style.transform = 'scale(1.1)';

    const items = window.gradesTemp[questionId].items;
    const aciertos = items.filter(i => i.status === 'correct').length;
    const badge = document.getElementById(`badge-${questionId}`);
    if(badge) {
        const total = parseInt(badge.dataset.total || items.length);
        let color = '#64748b', bg = '#f1f5f9';
        if(total > 0 && aciertos === total) { color='#166534'; bg='#dcfce7'; }
        else if(aciertos > 0) { color='#b45309'; bg='#fef3c7'; }
        badge.style.background = bg;
        badge.style.color = color;
        badge.innerText = `${aciertos}/${total} Aciertos`;
    }
};

window.guardarCalificacionAdmin = async () => {
    const btn = document.getElementById('btn-save-grades');
    if(btn) { btn.disabled = true; btn.innerText = "Guardando..."; }
    
    try {
        const responseId = window.gradingResponseId;

        // El enunciado se copia dentro de la calificación. La llave de
        // grades_json es el id de la pregunta, así que si mañana se edita el
        // texto —o se borra la pregunta— esta respuesta seguiría sin poder
        // decir qué se preguntó. Con la copia, se lee sola.
        (window.preguntasCacheActual || []).forEach(q => {
            const g = window.gradesTemp[q.id];
            if (g && typeof g === 'object' && q.question_text) g.question = q.question_text;
        });

        const updates = {
            grades_json: window.gradesTemp,
            review_status: 'Revisado'
        };
        
        if (window.modoAdminActivo) {
                    const newAnswers = { ...window.respuestasTempAdmin };
                    document.querySelectorAll('.admin-edit-answer').forEach(el => { newAnswers[el.dataset.qid] = el.value; });
                    document.querySelectorAll('.admin-edit-answer-check-group').forEach(group => {
                        newAnswers[group.dataset.qid] = Array.from(group.querySelectorAll(`input[type="checkbox"]:checked`)).map(c => c.value);
                    });
                    document.querySelectorAll('div[id^="admin-edit-list-"]').forEach(listDiv => {
                        const items = [];
                        listDiv.querySelectorAll('textarea, input[type="text"]').forEach(inp => { if(inp.value.trim()) items.push(inp.value.trim()); });
                        newAnswers[listDiv.id.replace('admin-edit-list-', '')] = items;
                    });
                    document.querySelectorAll('.admin-edit-answer-range-group').forEach(group => {
                        const checked = group.querySelector(`input[type="radio"]:checked`);
                        if(checked) newAnswers[group.dataset.qid] = checked.value;
                    });

                    const dateInput = document.getElementById('admin-edit-date');
                    if(dateInput && dateInput.value) { updates.submitted_at = new Date(dateInput.value).toISOString(); }
                    
                    // NUEVO: Capturar el área editada si existe
                    const areaInput = document.getElementById('admin-edit-area');
                    if(areaInput) { updates.employee_area = areaInput.value.trim() || 'Sin Área'; }

                    updates.answers_json = newAnswers;
                }

        const { error } = await sb.from('evaluation_responses').update(updates).eq('id', responseId);
        if(error) throw error;
        
        // 🚀 NUEVO: Actualizar la memoria local para que la UI se refresque instantáneamente
        if (window.respuestasCacheActual) {
            // CORRECCIÓN: Usar String()
            const idx = window.respuestasCacheActual.findIndex(r => String(r.id) === String(responseId));
            if (idx !== -1) {
                window.respuestasCacheActual[idx] = { ...window.respuestasCacheActual[idx], ...updates };
            }
        }
        
        if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();
        
        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        if (user && window.calcularPendientesBatch) await window.calcularPendientesBatch([user.id]);

        alert("Calificación guardada correctamente.");
        window.evalCache = null;

        if (window.mostrandoPendientes === true || window.mostrandoPendientesEquipo === true) {
            document.getElementById('modal-responder-eval').style.display = 'none';
            document.body.style.overflow = '';
            window.targetUserForEval = null;
            
            const modoActual = window.mostrandoPendientesEquipo ? 'EQUIPO' : 'PROPIOS';
            setTimeout(() => {
                if (window.cargarVistaPendientes) window.cargarVistaPendientes(modoActual);
            }, 300);
            
        } else {
            // 🚀 NUEVO: Solo cerramos el modal y redibujamos la lista local actualizada
            document.getElementById('modal-responder-eval').style.display = 'none';
            document.body.style.overflow = '';
            if (window.renderizarListaRespuestas) window.renderizarListaRespuestas();
        }
        
    } catch (e) {
        alert("Error al guardar: " + e.message);
    } finally {
        if(btn) { btn.disabled = false; btn.innerText = "Guardar Revisión"; }
    }
};

window.borrarRespuestaIndividual = async (id) => {
    if(!confirm("¿Eliminar esta respuesta permanentemente?")) return;
    try {
        const { error } = await sb.from('evaluation_responses').delete().eq('id', id);
        if(error) throw error;
        alert("Respuesta eliminada");
        
        // 🚀 CORRECCIÓN: Usar String() para asegurar la coincidencia de tipos
        if (window.respuestasCacheActual) {
            window.respuestasCacheActual = window.respuestasCacheActual.filter(r => String(r.id) !== String(id));
        }

        if (window.mostrandoPendientes === true || window.mostrandoPendientesEquipo === true) {
             document.getElementById('modal-responder-eval').style.display = 'none';
             document.body.style.overflow = '';
             window.targetUserForEval = null;
             
             const modoActual = window.mostrandoPendientesEquipo ? 'EQUIPO' : 'PROPIOS';
             setTimeout(() => {
                 if (window.cargarVistaPendientes) window.cargarVistaPendientes(modoActual);
             }, 300);
             
        } else {
            window.evalCache = null;
            document.getElementById('modal-responder-eval').style.display = 'none';
            document.body.style.overflow = '';
            if (window.renderizarListaRespuestas) window.renderizarListaRespuestas();
        }
    } catch (e) { alert(e.message); }
};

window.cambiarEstadoRespuesta = async (id, nuevoEstado) => {
    let msg = "";
    if (nuevoEstado === 'Falsa') {
        msg = "¿Estás seguro de anular esta respuesta por datos falsos? Se conservará como evidencia pero no sumará a las estadísticas.";
    } else if (nuevoEstado === 'Certificada') {
        msg = "¿Quieres certificar esta respuesta? Esto indicará visualmente que ha sido auditada y es legítima.";
    } else if (nuevoEstado === 'Mal Revisada') {
        msg = "¿Marcar como 'Mal Revisada'? Esto indicará que el supervisor no calificó correctamente. La evaluación regresará a la bandeja de pendientes del supervisor.";
    } else {
        msg = `¿Cambiar el estado de esta evaluación a ${nuevoEstado}?`;
    }
        
    if(!confirm(msg)) return;
    
    try {
        const { error } = await sb.from('evaluation_responses')
            .update({ review_status: nuevoEstado })
            .eq('id', id);
            
        if(error) throw error;
        
        // 🚀 NUEVO: Actualizar la memoria local para vista instantánea
        if (window.respuestasCacheActual) {
            // CORRECCIÓN: Usar String()
            const idx = window.respuestasCacheActual.findIndex(r => String(r.id) === String(id));
            if (idx !== -1) {
                window.respuestasCacheActual[idx].review_status = nuevoEstado;
            }
        }
        
        alert(`La respuesta ha sido marcada como ${nuevoEstado}.`);
        
        window.evalCache = null; 
        if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        // 🚀 NUEVO: Solo cerramos el modal y redibujamos
        document.getElementById('modal-responder-eval').style.display = 'none';
        document.body.style.overflow = '';
        if (window.renderizarListaRespuestas) window.renderizarListaRespuestas();
        // Si el cambio salió de una ficha abierta desde el expediente por
        // empleado, hay que repintar esa pantalla y no la lista de la evaluación.
        if (window.expedienteActual && window.renderizarExpedienteEmpleado) window.renderizarExpedienteEmpleado();

    } catch (e) {
        alert("Ocurrió un error al cambiar el estado: " + e.message);
    }
};
window.cambiarEstadoFalso = window.cambiarEstadoRespuesta; // Compatibilidad

// --- 2B. EXPEDIENTE POR EMPLEADO (REVISIÓN EN LOTE) ---
// Acceso rápido del administrador: busca a una persona y trabaja todas sus
// respuestas de una sola vez, en lugar de entrar evaluación por evaluación.

window.expedienteActual = null;

// Reglas de qué estado admite cada respuesta. Son exactamente las mismas que
// ofrece la ficha individual, para que el lote no pueda hacer nada que no se
// pudiera hacer una por una.
window.motivoNoAplicable = (resp, nuevoEstado) => {
    const estado = resp.review_status;
    if (nuevoEstado === 'Certificada') {
        if (estado === 'Certificada') return 'ya está certificada';

        // El mínimo se puede apagar encuesta por encuesta. Sin la encuesta a
        // mano se exige, que es lo prudente.
        const ev = window.encuestaEnCache ? window.encuestaEnCache(resp.evaluation_id) : null;
        if (window.exigeMinimo(ev)
            && window.calcularScoreRespuesta(resp) < window.UMBRAL_CERTIFICACION) {
            return `califica por debajo de ${window.UMBRAL_CERTIFICACION}%`;
        }
        return null;
    }
    if (nuevoEstado === 'Mal Revisada') return estado === 'Mal Revisada' ? 'ya está marcada así' : null;
    if (nuevoEstado === 'Falsa') return estado === 'Falsa' ? 'ya está anulada' : null;
    if (nuevoEstado === 'Revisado') {
        return ['Falsa', 'Certificada', 'Mal Revisada'].includes(estado) ? null : 'no está anulada ni certificada';
    }
    return 'estado desconocido';
};

window.abrirRevisionPorEmpleado = async () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return;
    // Estas pantallas llevan su propia flecha en el cuerpo; el encabezado de
    // la hoja vuelve al de la lista para no quedarse con el título de la
    // encuesta que se estuviera viendo.
    window.encabezadoHojaEvaluaciones();

    // El expediente cruza a todos los empleados, así que es solo para admin.
    if (!window.modoAdminActivo) {
        alert("Esta vista está reservada para el modo administrador.");
        return;
    }

    container.scrollTop = 0;
    container.style.display = 'block';

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    // No se consulta nada todavía: solo se traen las respuestas de la gente que
    // el administrador realmente busque.
    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.expedienteActual=null; window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Volver a la lista">←</button>
            <div>
                <h2 style="margin:0; font-size:1.2rem; color:#0d9488;">🔎 Revisión por Empleado</h2>
                <div style="font-size:0.85rem; color:#64748b;">Busca a una persona y resuelve todas sus evaluaciones juntas</div>
            </div>
        </div>

        <input type="text" id="buscador-empleado-revision" placeholder="🔍 Nombre, puesto o departamento..." oninput="window.programarBusquedaEmpleado()"
               style="width:100%; box-sizing:border-box; padding:12px 14px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; margin-bottom:15px;">

        <div id="lista-empleados-revision"></div>
    `;

    window.buscarEmpleadosRevision();
    const buscador = document.getElementById('buscador-empleado-revision');
    if (buscador) buscador.focus();
};

// La búsqueda espera a que el administrador deje de teclear para no lanzar una
// consulta por cada letra.
window.programarBusquedaEmpleado = () => {
    clearTimeout(window.temporizadorBusquedaEmpleado);
    window.temporizadorBusquedaEmpleado = setTimeout(() => window.buscarEmpleadosRevision(), 300);
};

window.buscarEmpleadosRevision = async () => {
    const lista = document.getElementById('lista-empleados-revision');
    if (!lista) return;

    const input = document.getElementById('buscador-empleado-revision');
    const termino = input ? input.value.toLowerCase().trim() : '';

    const aviso = (texto) => { lista.innerHTML = `<div style="padding:30px; text-align:center; color:#94a3b8;">${texto}</div>`; };

    if (termino.length < 2) {
        aviso('Escribe al menos dos letras para buscar a un empleado.');
        return;
    }

    const coincidencias = (window.todosLosEmpleadosData || []).filter(e =>
        (e.name || '').toLowerCase().includes(termino) ||
        (e.puesto || '').toLowerCase().includes(termino) ||
        (e.dept || '').toLowerCase().includes(termino)
    );

    if (coincidencias.length === 0) {
        aviso('Ningún empleado coincide con la búsqueda.');
        return;
    }

    const recortadas = coincidencias.slice(0, 25);
    const sobran = coincidencias.length - recortadas.length;

    // Si el administrador siguió tecleando, esta respuesta ya no interesa.
    const token = (window.tokenBusquedaEmpleado || 0) + 1;
    window.tokenBusquedaEmpleado = token;

    lista.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Buscando sus respuestas...</div>';

    const { data: resumen } = await sb.from('evaluation_responses')
        .select('employee_id, review_status')
        .in('employee_id', recortadas.map(e => String(e.id)));

    if (window.tokenBusquedaEmpleado !== token) return;

    const conteos = {};
    (resumen || []).forEach(r => {
        const id = String(r.employee_id);
        if (!conteos[id]) conteos[id] = { total: 0, calificadas: 0, sinCalificar: 0 };
        conteos[id].total++;
        if (r.review_status === 'Revisado') conteos[id].calificadas++;
        else if (!['Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status)) conteos[id].sinCalificar++;
    });

    const conRespuestas = recortadas.filter(e => (conteos[String(e.id)] || {}).total);

    if (conRespuestas.length === 0) {
        aviso('Esos empleados todavía no tienen respuestas registradas.');
        return;
    }

    // Primero quien tiene trabajo esperando al administrador.
    conRespuestas.sort((a, b) => {
        const ca = conteos[String(a.id)], cb = conteos[String(b.id)];
        if (cb.calificadas !== ca.calificadas) return cb.calificadas - ca.calificadas;
        return (a.name || '').localeCompare(b.name || '');
    });

    lista.innerHTML = conRespuestas.map(e => {
        const c = conteos[String(e.id)];
        const inactivo = e.isActive === false ? ` <span style="background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:6px; font-size:0.7rem; margin-left:6px;">Inactivo</span>` : '';
        const chipCalificadas = c.calificadas > 0 ? `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:700;">${c.calificadas} calificada${c.calificadas === 1 ? '' : 's'}</span>` : '';
        const chipSinCalificar = c.sinCalificar > 0 ? `<span style="background:#fff7ed; color:#c2410c; padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:700;">${c.sinCalificar} sin calificar</span>` : '';

        return `
        <div class="incident-card" style="border-left:5px solid #0d9488; padding:14px; cursor:pointer; margin-bottom:10px;" onclick="window.abrirExpedienteEmpleado('${e.id}')">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="min-width:0;">
                    <div style="color:#0f172a; font-weight:700; font-size:1rem;">${e.name}${inactivo}</div>
                    <div style="color:#64748b; font-size:0.8rem; margin-top:2px;">${e.puesto || 'Sin puesto'} · ${e.dept || 'General'}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                        <span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:8px; font-size:0.75rem; font-weight:700;">${c.total} en total</span>
                        ${chipCalificadas}
                        ${chipSinCalificar}
                    </div>
                </div>
                <div style="color:#64748b; font-size:1.2rem; flex-shrink:0;">👉</div>
            </div>
        </div>`;
    }).join('') + (sobran > 0 ? `<div style="padding:12px; text-align:center; color:#94a3b8; font-size:0.85rem;">Hay ${sobran} coincidencia(s) más. Afina la búsqueda para verlas.</div>` : '');
};

window.abrirExpedienteEmpleado = async (empId) => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return;
    // El resumen por clasificación de más abajo lo pregunta sin poder esperar.
    await window.cargarCertificacionDeClasificaciones();
    // Estas pantallas llevan su propia flecha en el cuerpo; el encabezado de
    // la hoja vuelve al de la lista para no quedarse con el título de la
    // encuesta que se estuviera viendo.
    window.encabezadoHojaEvaluaciones();

    container.scrollTop = 0;
    container.innerHTML = '<div style="padding:40px; text-align:center;"><div class="spinner" style="margin: 0 auto 15px auto;"></div>Abriendo expediente...</div>';

    const empleado = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(empId));

    const { data: respuestas } = await sb.from('evaluation_responses')
        .select('*')
        .eq('employee_id', empId)
        .order('submitted_at', { ascending: false });

    // Título y clasificación se consultan aquí porque evalCache se invalida cada
    // vez que cambia un estado, y sin ellos las filas quedarían sin nombre.
    // `frequency` y `active` los pide la certificación por clasificación, que
    // necesita saber en qué periodo cae cada encuesta y cuáles ya no cuentan;
    // los de destinatarios, para no contarle a esta persona encuestas que no
    // van dirigidas a su puesto ni a su departamento.
    const camposEvals = await window.camposConMinimo(
        'id, title, category, frequency, active, mode, is_obligatory, target_employees, target_positions, target_departments');
    const { data: evaluaciones } = await sb.from('evaluations').select(camposEvals);
    const titulos = {};
    (evaluaciones || []).forEach(ev => {
        titulos[String(ev.id)] = { title: ev.title, category: (ev.category || 'General') };
    });

    window.expedienteActual = {
        empleado: empleado || { id: empId, name: (window.employeeNameMap || {})[empId] || `ID: ${empId}` },
        respuestas: respuestas || [],
        titulos: titulos,
        evaluaciones: evaluaciones || [],
        seleccion: []
    };
    // La ficha individual y cambiarEstadoRespuesta trabajan sobre esta caché.
    window.respuestasCacheActual = window.expedienteActual.respuestas;

    window.renderizarExpedienteEmpleado();
};

window.alternarSeleccionRespuesta = (id) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    const i = exp.seleccion.indexOf(id);
    if (i === -1) exp.seleccion.push(id); else exp.seleccion.splice(i, 1);
    window.renderizarExpedienteEmpleado();
};

window.seleccionarGrupoRespuestas = (ids, marcar) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    const lista = String(ids).split(',').filter(Boolean);
    lista.forEach(id => {
        const i = exp.seleccion.indexOf(id);
        if (marcar && i === -1) exp.seleccion.push(id);
        if (!marcar && i !== -1) exp.seleccion.splice(i, 1);
    });
    window.renderizarExpedienteEmpleado();
};

window.limpiarSeleccionExpediente = () => {
    if (!window.expedienteActual) return;
    window.expedienteActual.seleccion = [];
    window.renderizarExpedienteEmpleado();
};

window.verDetalleDesdeExpediente = (id) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    const resp = exp.respuestas.find(r => String(r.id) === String(id));
    if (resp) window.verDetalleRespuesta(resp);
};

window.renderizarExpedienteEmpleado = () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    const exp = window.expedienteActual;
    if (!container || !exp) return;

    const { empleado, respuestas, titulos, seleccion } = exp;

    // Solo se puede certificar a partir de 80%, así que las calificadas por
    // debajo van en su propio bloque en vez de mezclarse con las que sí aplican.
    const grupos = [
        { clave: 'porCertificar', titulo: '⭐ Listas para certificar', color: '#166534', fondo: '#dcfce7',
          filtro: r => r.review_status === 'Revisado' && window.calcularScoreRespuesta(r) >= 80 },
        { clave: 'bajoUmbral', titulo: '📉 Calificadas por debajo de 80%', color: '#b45309', fondo: '#fef3c7',
          nota: 'No se pueden certificar mientras no suban de 80%.',
          filtro: r => r.review_status === 'Revisado' && window.calcularScoreRespuesta(r) < 80 },
        { clave: 'sinCalificar', titulo: '⏳ Sin calificar todavía', color: '#c2410c', fondo: '#fff7ed',
          filtro: r => !['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status) },
        { clave: 'certificadas', titulo: '✅ Certificadas', color: '#1d4ed8', fondo: '#eff6ff',
          filtro: r => r.review_status === 'Certificada' },
        { clave: 'rechazadas', titulo: '🚫 Rechazadas o anuladas', color: '#7e22ce', fondo: '#faf5ff',
          filtro: r => r.review_status === 'Mal Revisada' || r.review_status === 'Falsa' }
    ];

    const datosEval = (r) => titulos[String(r.evaluation_id)] || { title: 'Evaluación', category: 'General' };

    const filaHtml = (r) => {
        const marcada = seleccion.includes(String(r.id));
        const fecha = new Date(r.submitted_at).toLocaleDateString();
        const titulo = datosEval(r).title;
        const calificada = ['Revisado', 'Certificada', 'Falsa', 'Mal Revisada'].includes(r.review_status);
        const score = calificada ? window.calcularScoreRespuesta(r) : null;
        const colorScore = score === null ? '#94a3b8' : (score >= 80 ? '#166534' : (score >= 60 ? '#b45309' : '#991b1b'));
        const fondoScore = score === null ? '#f1f5f9' : (score >= 80 ? '#dcfce7' : (score >= 60 ? '#fef3c7' : '#fee2e2'));
        const badgeScore = score === null ? '' : `<span style="color:${colorScore}; background:${fondoScore}; padding:2px 8px; border-radius:8px; font-size:0.8rem; font-weight:700;">${score}%</span>`;

        return `
        <div style="display:flex; align-items:center; gap:10px; background:${marcada ? '#f0fdfa' : 'white'}; border:1px solid ${marcada ? '#5eead4' : '#e2e8f0'}; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
            <input type="checkbox" ${marcada ? 'checked' : ''} onclick="event.stopPropagation(); window.alternarSeleccionRespuesta('${r.id}')"
                   style="width:20px; height:20px; flex-shrink:0; accent-color:#0d9488; cursor:pointer;">
            <div style="flex:1; min-width:0; cursor:pointer;" onclick="window.verDetalleDesdeExpediente('${r.id}')">
                <div style="color:#0f172a; font-weight:600; font-size:0.92rem;">${titulo}</div>
                <div style="color:#64748b; font-size:0.78rem; margin-top:3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span>${fecha}</span> ${badgeScore}
                </div>
            </div>
            <button onclick="window.verDetalleDesdeExpediente('${r.id}')" style="flex-shrink:0; background:#f1f5f9; border:none; color:#475569; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">Abrir</button>
        </div>`;
    };

    const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const botonSeleccion = (ids, color, textoMarcar, textoQuitar) => {
        const todasMarcadas = ids.every(id => seleccion.includes(id));
        return `<button onclick="window.seleccionarGrupoRespuestas('${ids.join(',')}', ${todasMarcadas ? 'false' : 'true'})"
                        style="background:white; border:1px solid ${color}; color:${color}; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; flex-shrink:0;">
                    ${todasMarcadas ? textoQuitar : textoMarcar}
                </button>`;
    };

    let cuerpo = '';
    grupos.forEach(g => {
        const filas = respuestas.filter(g.filtro);
        if (filas.length === 0) return;

        const ids = filas.map(r => String(r.id));

        // Dentro de cada estado, las evaluaciones se separan por clasificación.
        const porClasificacion = {};
        filas.forEach(r => {
            const cat = datosEval(r).category;
            if (!porClasificacion[cat]) porClasificacion[cat] = [];
            porClasificacion[cat].push(r);
        });

        const clasificaciones = Object.keys(porClasificacion).sort((a, b) => a.localeCompare(b));

        const bloques = clasificaciones.map(cat => {
            const deLaCat = porClasificacion[cat];
            const idsCat = deLaCat.map(r => String(r.id));

            // El atajo de certificar la clasificación entera sólo tiene sentido
            // en el bloque de las que están listas: es ahí donde el
            // administrador ve que ya se puede dar fe de todas.
            const btnCertificar = g.clave === 'porCertificar'
                ? `<button onclick="window.certificarClasificacionExpediente('${escapar(cat).replace(/'/g, "\\'")}')"
                           style="background:#eff6ff; border:1px solid #3b82f6; color:#1d4ed8; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; flex-shrink:0;"
                           title="Certificar de una vez todo lo certificable de esta clasificación en el periodo vigente">⭐ Certificar clasificación</button>`
                : '';

            return `
            <div class="clasificacion-expediente" data-grupo="${g.clave}" data-clasificacion="${escapar(cat)}" style="margin-top:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:0 4px 6px 4px; border-bottom:1px dashed #e2e8f0; margin-bottom:8px; flex-wrap:wrap;">
                    <span style="color:#475569; font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">${cat} (${deLaCat.length})</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${btnCertificar}
                        ${botonSeleccion(idsCat, g.color, 'Marcar', 'Quitar')}
                    </div>
                </div>
                ${deLaCat.map(filaHtml).join('')}
            </div>`;
        }).join('');

        const notaHtml = g.nota ? `<div style="font-size:0.75rem; color:${g.color}; padding:0 4px; margin-top:-4px;">${g.nota}</div>` : '';
        // El botón del bloque solo aporta cuando hay más de una clasificación.
        const botonBloque = clasificaciones.length > 1 ? botonSeleccion(ids, g.color, 'Marcar bloque', 'Quitar bloque') : '';

        cuerpo += `
        <div style="margin-top:18px;">
            <div class="cabecera-grupo-expediente" data-grupo="${g.clave}" style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:${g.fondo}; color:${g.color}; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem;">
                <span>${g.titulo} (${filas.length})</span>
                ${botonBloque}
            </div>
            ${notaHtml}
            ${bloques}
        </div>`;
    });

    if (respuestas.length === 0) {
        cuerpo = `<div style="padding:40px; text-align:center; color:#94a3b8;">Esta persona no tiene respuestas registradas.</div>`;
    }

    // Barra de acciones: solo aparece con algo seleccionado.
    let barraHtml = '';
    if (seleccion.length > 0) {
        const btn = (estado, texto, fondo, borde, color) =>
            `<button onclick="window.aplicarEstadoEnLote('${estado}')" style="flex:1 1 45%; background:${fondo}; color:${color}; border:1px solid ${borde}; padding:10px 8px; border-radius:10px; font-size:0.82rem; font-weight:700; cursor:pointer;">${texto}</button>`;

        barraHtml = `
        <div style="position:sticky; bottom:0; margin-top:20px; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px; box-shadow:0 -4px 12px rgba(0,0,0,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:700; color:#0f172a; font-size:0.9rem;">${seleccion.length} seleccionada${seleccion.length === 1 ? '' : 's'}</span>
                <button onclick="window.limpiarSeleccionExpediente()" style="background:none; border:none; color:#64748b; font-size:0.8rem; font-weight:700; cursor:pointer; text-decoration:underline;">Limpiar</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${btn('Certificada', '⭐ Certificar', '#eff6ff', '#3b82f6', '#1d4ed8')}
                ${btn('Mal Revisada', '⚠️ Mal revisada', '#f3e8ff', '#a855f7', '#7e22ce')}
                ${btn('Falsa', '🚫 Anular', '#fee2e2', '#ef4444', '#991b1b')}
                ${btn('Revisado', '↩️ Volver a Validada', '#dcfce7', '#22c55e', '#166534')}
            </div>
        </div>`;
    }

    const puesto = empleado.puesto ? `${empleado.puesto} · ${empleado.dept || 'General'}` : '';

    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:16px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.abrirRevisionPorEmpleado()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Volver a la búsqueda">←</button>
            <div style="min-width:0;">
                <h2 style="margin:0; font-size:1.15rem; color:#0d9488;">${empleado.name}</h2>
                <div style="font-size:0.82rem; color:#64748b;">${puesto}${puesto ? ' · ' : ''}${respuestas.length} respuesta${respuestas.length === 1 ? '' : 's'}</div>
            </div>
        </div>
        <div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
            Marca las que quieras y aplica el cambio a todas juntas. Toca el nombre de una evaluación para abrirla completa.
        </div>
        ${cuerpo}
        ${barraHtml}
    `;
};

window.aplicarEstadoEnLote = async (nuevoEstado) => {
    const exp = window.expedienteActual;
    if (!exp || exp.seleccion.length === 0) return;
    if (!window.modoAdminActivo) { alert("Solo el modo administrador puede cambiar el estado de las respuestas."); return; }

    const elegidas = exp.respuestas.filter(r => exp.seleccion.includes(String(r.id)));
    const aplicables = [];
    const descartadas = [];

    elegidas.forEach(r => {
        const motivo = window.motivoNoAplicable(r, nuevoEstado);
        if (motivo) descartadas.push({ resp: r, motivo: motivo });
        else aplicables.push(r);
    });

    if (aplicables.length === 0) {
        alert(`Ninguna de las ${elegidas.length} respuestas seleccionadas puede pasar a "${nuevoEstado}".\n\nMotivo: ${descartadas[0] ? descartadas[0].motivo : 'no aplica'}.`);
        return;
    }

    let msg = `Se van a marcar como "${nuevoEstado}" ${aplicables.length} respuesta(s) de ${exp.empleado.name}.`;
    if (descartadas.length > 0) {
        const detalle = descartadas.slice(0, 5)
            .map(d => `  • ${exp.titulos[String(d.resp.evaluation_id)] || 'Evaluación'}: ${d.motivo}`)
            .join('\n');
        msg += `\n\nSe omitirán ${descartadas.length}:\n${detalle}`;
        if (descartadas.length > 5) msg += `\n  • …y ${descartadas.length - 5} más`;
    }
    if (nuevoEstado === 'Mal Revisada') msg += `\n\nLas marcadas volverán a la bandeja de pendientes del supervisor.`;
    if (nuevoEstado === 'Falsa') msg += `\n\nLas anuladas se conservan como evidencia pero dejan de sumar a las estadísticas.`;
    if (nuevoEstado === 'Revisado') msg += `\n\nQuedarán como calificadas y válidas, sin certificación ni marca de anulada o mal revisada.`;
    msg += `\n\n¿Confirmas?`;

    if (!confirm(msg)) return;

    try {
        const ids = aplicables.map(r => r.id);
        const { error } = await sb.from('evaluation_responses')
            .update({ review_status: nuevoEstado })
            .in('id', ids);

        if (error) throw error;

        aplicables.forEach(r => { r.review_status = nuevoEstado; });
        exp.seleccion = [];

        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        alert(`Listo: ${aplicables.length} respuesta(s) marcada(s) como ${nuevoEstado}.`);
        window.renderizarExpedienteEmpleado();

    } catch (e) {
        alert("Ocurrió un error al aplicar el cambio en lote: " + e.message);
    }
};

// --- 2C. CERTIFICAR UNA CLASIFICACIÓN COMPLETA ---
// Certificar respuesta por respuesta no escala: una clasificación con seis
// encuestas son seis confirmaciones para una sola persona. Esto lo hace de una,
// y de paso deja constancia de quién dio fe y de qué periodo, que antes no
// quedaba en ningún lado.
//
// La verdad sigue estando en la respuesta: esto sella las que cubre a
// 'Certificada', igual que si se hubieran marcado a mano. El acta es lo que se
// añade, y por eso el badge del usuario se sigue calculando de las respuestas y
// no del acta: si mañana se anula una, la clasificación deja de estar
// certificada aunque el acta siga guardada.

// La fila del acta a partir de un resumen ya recalculado.
window.filaDeActa = ({ clasificacion, empleadoId, resumen, cubiertas, nota }) => {
    const periodo = resumen && resumen.periodoFechas;
    if (!periodo) return null;

    const aFecha = (d) => d ? new Date(d).toISOString().slice(0, 10) : null;
    const usuario = JSON.parse(localStorage.getItem('usuarioLogueado') || 'null');

    return {
        clasificacion: window.normalizarClasificacion(clasificacion),
        employee_id: empleadoId,
        periodo_inicio: aFecha(periodo.inicio),
        periodo_fin: aFecha(periodo.fin),
        periodo_nombre: resumen.periodo,
        certificado_por: usuario ? usuario.id : null,
        certificado_en: new Date().toISOString(),
        respuestas_cubiertas: cubiertas,
        nota: nota || null
    };
};

// Guarda las actas. Si la tabla todavía no existe —el script de `sql/` se corre
// a mano— no pasa nada: la certificación ya quedó hecha en las respuestas, que
// es lo que ve todo el mundo. Se avisa por consola y se sigue.
window.registrarActasCertificacion = async (filas) => {
    const utiles = (filas || []).filter(Boolean);
    if (utiles.length === 0) return { guardadas: 0, motivo: 'sin periodo' };

    try {
        // Se encadena `.select()` porque un insert que RLS rechaza responde con
        // éxito y cero filas: sin contar lo que vuelve, la pantalla diría que
        // guardó sin haber guardado.
        const { data, error } = await sb.from('certificaciones_clasificacion')
            .upsert(utiles, { onConflict: 'clasificacion,employee_id,periodo_inicio' })
            .select();

        if (error) throw error;
        const guardadas = (data || []).length;
        return { guardadas, motivo: guardadas ? '' : 'la base no dejó escribir' };
    } catch (e) {
        console.warn('No se pudo guardar el acta de certificación:', e.message);
        return { guardadas: 0, motivo: e.message };
    }
};

window.registrarActaCertificacion = async (datos) => {
    const res = await window.registrarActasCertificacion([window.filaDeActa(datos)]);
    return { guardada: res.guardadas > 0, motivo: res.motivo };
};

// Certifica de una vez todo lo certificable de una clasificación para la
// persona del expediente abierto.
window.certificarClasificacionExpediente = async (clasificacion) => {
    const exp = window.expedienteActual;
    if (!exp) return;
    if (!window.modoAdminActivo) { alert("Solo el modo administrador puede certificar."); return; }

    const clave = window.normalizarClasificacion(clasificacion);
    // Sólo las de esta clasificación **que le tocan a esta persona**: sin lo
    // segundo, una encuesta dirigida a otro puesto engordaba el total y el
    // aviso decía que quedaba una sin contestar que nunca le tocó.
    const encuestasDeLaCat = (exp.evaluaciones || [])
        .filter(ev => window.normalizarClasificacion(ev.category || 'General') === clave)
        .filter(ev => window.leTocaEstaEncuesta(ev, exp.empleado, window.tieneEquipoDirecto(exp.empleado.id)));

    const resumen = window.estadoCertificacion(encuestasDeLaCat, exp.respuestas);
    const E = window.ESTADOS_CERTIFICACION;

    if (resumen.estado === E.CERTIFICADA) {
        alert(`«${clasificacion}» ya está certificada por completo en ${resumen.periodo}.`);
        return;
    }
    if (resumen.certificables.length === 0) {
        alert(`No hay nada que certificar en «${clasificacion}» (${resumen.periodo}).\n\n`
            + `De ${resumen.total} encuesta(s): ${resumen.certificadas} ya certificada(s), `
            + `${resumen.sinContestar} sin contestar, ${resumen.sinCalificar} sin calificar, `
            + `${resumen.bajoUmbral} por debajo de ${window.UMBRAL_CERTIFICACION}% y `
            + `${resumen.observadas} observada(s).`);
        return;
    }

    // Certificar una clasificación no puede hacer nada que no se pudiera hacer
    // respuesta por respuesta, así que lo que no aplique se queda fuera y se
    // dice cuánto y por qué.
    const pendientesDeCubrir = resumen.total - resumen.certificadas - resumen.certificables.length;

    let msg = `Se van a certificar ${resumen.certificables.length} respuesta(s) de `
        + `${exp.empleado.name} en «${clasificacion}» (${resumen.periodo}).`;
    if (pendientesDeCubrir > 0) {
        msg += `\n\nQuedarán ${pendientesDeCubrir} sin cubrir:`;
        if (resumen.sinContestar) msg += `\n  • ${resumen.sinContestar} sin contestar`;
        if (resumen.sinCalificar) msg += `\n  • ${resumen.sinCalificar} sin calificar`;
        if (resumen.bajoUmbral) msg += `\n  • ${resumen.bajoUmbral} por debajo de ${window.UMBRAL_CERTIFICACION}%`;
        if (resumen.observadas) msg += `\n  • ${resumen.observadas} anulada(s) o mal revisada(s)`;
        msg += `\n\nLa clasificación no quedará certificada mientras falten.`;
    }
    msg += `\n\n¿Confirmas?`;

    if (!confirm(msg)) return;

    try {
        // El `.select()` no es opcional: un update que RLS rechaza responde con
        // éxito y cero filas.
        const { data, error } = await sb.from('evaluation_responses')
            .update({ review_status: 'Certificada' })
            .in('id', resumen.certificables)
            .select('id');

        if (error) throw error;

        const selladas = (data || []).length;
        if (selladas === 0) {
            alert("No se certificó ninguna respuesta: la base rechazó la escritura.");
            return;
        }

        const idsSellados = new Set((data || []).map(r => String(r.id)));
        exp.respuestas.forEach(r => {
            if (idsSellados.has(String(r.id))) r.review_status = 'Certificada';
        });

        // El acta se guarda con el estado ya recalculado, para que refleje lo
        // que de verdad quedó cubierto.
        const despues = window.estadoCertificacion(encuestasDeLaCat, exp.respuestas);
        const acta = await window.registrarActaCertificacion({
            clasificacion: clasificacion,
            empleadoId: exp.empleado.id,
            resumen: despues,
            cubiertas: despues.certificadas
        });

        exp.seleccion = [];
        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        let aviso = `Listo: ${selladas} respuesta(s) certificada(s) en «${clasificacion}».`;
        if (despues.estado === window.ESTADOS_CERTIFICACION.CERTIFICADA) {
            aviso += `\n\nLa clasificación queda certificada para ${exp.empleado.name} en ${despues.periodo}.`;
        }
        if (!acta.guardada) {
            aviso += `\n\n(No se pudo dejar constancia del acta: ${acta.motivo}. Las respuestas sí quedaron certificadas.)`;
        }
        alert(aviso);

        window.renderizarExpedienteEmpleado();

    } catch (e) {
        alert("Ocurrió un error al certificar la clasificación: " + e.message);
    }
};

// --- 2D. CERTIFICAR UNA CLASIFICACIÓN A VARIAS PERSONAS ---
// La transpuesta del expediente: en vez de una persona y todas sus
// clasificaciones, una clasificación y toda la gente a la que le toca. Es lo
// que quita el «uno por uno» cuando son cuarenta personas.

window.certificacionActual = null;

window.abrirCertificacionPorClasificacion = async () => {
    const container = document.getElementById('contenido-modal-evaluaciones');
    if (!container) return;
    // Estas pantallas llevan su propia flecha en el cuerpo; el encabezado de
    // la hoja vuelve al de la lista para no quedarse con el título de la
    // encuesta que se estuviera viendo.
    window.encabezadoHojaEvaluaciones();

    if (!window.modoAdminActivo) {
        alert("Esta vista está reservada para el modo administrador.");
        return;
    }

    container.scrollTop = 0;
    container.style.display = 'block';
    container.innerHTML = '<div style="padding:40px; text-align:center;"><div class="spinner" style="margin: 0 auto 15px auto;"></div>Cargando clasificaciones...</div>';

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    const camposParaCertificar = await window.camposConMinimo(
        'id, title, category, frequency, active, mode, is_obligatory, target_employees, target_positions, target_departments');
    const { data: evaluaciones, error } = await sb.from('evaluations').select(camposParaCertificar);

    if (error) {
        container.innerHTML = `<div style="padding:40px; text-align:center; color:#ef4444;">No se pudieron cargar las encuestas: ${error.message}</div>`;
        return;
    }

    // Qué clasificaciones se certifican: lo decide esta misma pantalla, así que
    // se relee al abrirla en vez de tirar de la caché de la sesión.
    const hayTabla = await window.cargarCertificacionDeClasificaciones(true);

    // Sólo las encendidas: una apagada no le aparece a nadie, así que tampoco
    // hay nada que certificarle.
    const activas = (evaluaciones || []).filter(window.encuestaActiva);
    const clasificaciones = Array.from(new Set(activas.map(ev => ev.category || 'General')))
        .sort((a, b) => a.localeCompare(b));

    window.certificacionActual = {
        evaluaciones: activas,
        clasificaciones: clasificaciones,
        elegida: '',
        filas: [],
        seleccion: [],
        busqueda: '',
        departamento: '',
        vista: 'pendientes',
        fecha: null,
        periodos: [],
        periodoElegido: null,
        actas: {},
        hayTablaClasificaciones: hayTabla
    };

    container.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:20px; flex-wrap: wrap; gap: 10px;">
            <button onclick="window.certificacionActual=null; window.cargarVistaEvaluaciones()" style="background:#f1f5f9; border:none; color:#334155; font-weight:bold; cursor:pointer; font-size:1.2rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;" title="Volver a la lista">←</button>
            <div style="min-width:0;">
                <h2 style="margin:0; font-size:1.2rem; color:#1d4ed8;">⭐ Certificar por clasificación</h2>
                <div style="font-size:0.85rem; color:#64748b;">Busca a la persona y da fe de su clasificación entera</div>
            </div>
        </div>

        <select id="selector-clasificacion-cert" onchange="window.cargarClasificacionParaCertificar(this.value)"
                style="width:100%; box-sizing:border-box; padding:12px 14px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; margin-bottom:15px; color:#0f172a; font-weight:600;">
            <option value="">Elige una clasificación…</option>
            ${clasificaciones.map(c => `<option value="${window.sanitizeForHTML(c)}">${window.sanitizeForHTML(c)}</option>`).join('')}
        </select>

        <div id="ajuste-clasificacion-cert" style="display:none; margin-bottom:15px;"></div>

        <div id="filtros-cert" style="display:none; gap:8px; flex-wrap:wrap; margin-bottom:15px;">
            <input type="text" id="buscador-cert" placeholder="🔍 Buscar empleado…"
                   oninput="window.filtrarEmpleadosCert(this.value)"
                   style="flex:1 1 100%; box-sizing:border-box; padding:12px 14px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white;">
            <select id="depto-cert" onchange="window.filtrarDeptoCert(this.value)"
                    style="flex:1 1 calc(50% - 4px); min-width:0; box-sizing:border-box; padding:12px 10px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; color:#0f172a;"></select>
            <select id="periodo-cert" onchange="window.cambiarPeriodoCert(this.value)"
                    style="flex:1 1 calc(50% - 4px); min-width:0; box-sizing:border-box; padding:12px 10px; border:1px solid #cbd5e1; border-radius:10px; font-size:16px; outline:none; background:white; color:#0f172a;"></select>
            <div class="stats-conmutador" style="flex:1 1 100%;" id="vista-cert">
                <button data-vista="pendientes" onclick="window.cambiarVistaCert('pendientes')">⭐ Por certificar</button>
                <button data-vista="certificadas" onclick="window.cambiarVistaCert('certificadas')">✅ Certificadas</button>
            </div>
        </div>

        <div id="cuerpo-certificacion"></div>
    `;

    if (clasificaciones.length === 0) {
        document.getElementById('cuerpo-certificacion').innerHTML =
            `<div style="padding:30px; text-align:center; color:#94a3b8;">No hay encuestas activas.</div>`;
    }
};

// El conmutador de «esta clasificación se certifica», debajo del selector. Es
// donde se decide, porque certificar es de una clasificación entera y no de una
// encuesta suelta.
window.pintarAjusteClasificacion = (clasificacion) => {
    const caja = document.getElementById('ajuste-clasificacion-cert');
    const estado = window.certificacionActual;
    if (!caja || !estado || !clasificacion) return;

    const seCertifica = window.clasificacionSeCertifica(clasificacion);
    const hayTabla = estado.hayTablaClasificaciones;
    const nombre = window.sanitizeForHTML(clasificacion);

    const avisoSinTabla = hayTabla ? '' :
        `<div style="font-size:0.78rem; color:#b45309; margin-top:8px;">Falta correr <code>sql/clasificaciones-certificacion.sql</code> en Supabase para poder cambiarlo.</div>`;

    caja.style.display = 'block';
    caja.innerHTML = `
        <div style="background:white; border:1px solid ${seCertifica ? '#bfdbfe' : '#e2e8f0'}; border-left:3px solid ${seCertifica ? '#2563eb' : '#94a3b8'}; border-radius:10px; padding:12px 14px;">
            <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:#334155; font-size:0.92rem;">
                        ${seCertifica ? '⭐ Se certifica' : '🚫 No se certifica'}
                    </div>
                    <div style="font-size:0.78rem; color:#94a3b8; margin-top:2px;">
                        ${seCertifica
                            ? 'Sus encuestas cuentan para certificar a cada persona.'
                            : 'Sus encuestas se contestan y califican igual, pero no certifican a nadie.'}
                    </div>
                </div>
                <button onclick="window.alternarCertificacionClasificacion('${nombre.replace(/'/g, "&apos;")}')"
                        ${hayTabla ? '' : 'disabled'}
                        style="flex-shrink:0; padding:8px 14px; border-radius:8px; cursor:${hayTabla ? 'pointer' : 'default'}; font-weight:700; font-size:0.85rem; border:1px solid ${seCertifica ? '#cbd5e1' : '#2563eb'}; background:${seCertifica ? 'white' : '#2563eb'}; color:${seCertifica ? '#64748b' : 'white'}; opacity:${hayTabla ? '1' : '0.5'};">
                    ${seCertifica ? 'No certificar' : 'Certificar'}
                </button>
            </div>
            ${avisoSinTabla}
        </div>`;
};

window.alternarCertificacionClasificacion = async (clasificacion) => {
    if (!window.modoAdminActivo) { alert('Requiere permisos de administrador'); return; }

    const seCertifica = window.clasificacionSeCertifica(clasificacion);
    const pregunta = seCertifica
        ? `¿Dejar de certificar «${clasificacion}»?\n\nSus encuestas se seguirán contestando y calificando, pero dejarán de contar para certificar a nadie.\n\nLo ya certificado se queda como está.`
        : `¿Volver a certificar «${clasificacion}»?`;
    if (!confirm(pregunta)) return;

    try {
        await window.guardarCertificacionDeClasificacion(clasificacion, seCertifica ? false : true);
        // El badge del usuario se calcula con la caché de encuestas, que ahora
        // diría otra cosa.
        window.evalCache = null;
        window.cargarClasificacionParaCertificar(clasificacion, window.certificacionActual ? window.certificacionActual.fecha : null);
    } catch (e) {
        console.error('No se pudo cambiar la certificación de la clasificación:', e);
        alert('No se pudo guardar: ' + (e.message || e));
    }
};

window.cargarClasificacionParaCertificar = async (clasificacion, fechaRef) => {
    const cuerpo = document.getElementById('cuerpo-certificacion');
    const estado = window.certificacionActual;
    if (!cuerpo || !estado) return;

    const buscador = document.getElementById('buscador-cert');
    const cajaFiltros = document.getElementById('filtros-cert');

    const cajaAjuste = document.getElementById('ajuste-clasificacion-cert');

    if (!clasificacion) {
        estado.elegida = ''; estado.filas = []; estado.seleccion = [];
        estado.busqueda = ''; estado.departamento = '';
        estado.vista = 'pendientes'; estado.fecha = null; estado.periodos = [];
        if (cajaFiltros) cajaFiltros.style.display = 'none';
        if (cajaAjuste) cajaAjuste.style.display = 'none';
        if (buscador) buscador.value = '';
        cuerpo.innerHTML = '';
        return;
    }

    // Lo primero es si esta clasificación se certifica: si no, no hay nada que
    // listar y lo único que se enseña es el conmutador para volver a encenderla.
    window.pintarAjusteClasificacion(clasificacion);
    if (!window.clasificacionSeCertifica(clasificacion)) {
        estado.elegida = clasificacion; estado.filas = []; estado.seleccion = [];
        if (cajaFiltros) cajaFiltros.style.display = 'none';
        cuerpo.innerHTML = `<div style="padding:30px; text-align:center; color:#64748b;">
            <div style="font-size:2rem; margin-bottom:8px;">🚫</div>
            <div style="font-weight:600; color:#334155;">«${window.sanitizeForHTML(clasificacion)}» no se certifica</div>
            <div style="font-size:0.9rem; margin-top:6px;">Sus encuestas se contestan y se califican igual, pero no cuentan para certificar a nadie.</div>
        </div>`;
        return;
    }

    if (cajaFiltros) cajaFiltros.style.display = 'flex';
    if (buscador) buscador.value = '';
    estado.busqueda = '';
    estado.departamento = '';

    cuerpo.innerHTML = '<div style="padding:30px; text-align:center;"><div class="spinner" style="margin: 0 auto 12px auto;"></div>Reuniendo respuestas…</div>';

    const clave = window.normalizarClasificacion(clasificacion);
    const encuestas = estado.evaluaciones
        .filter(ev => window.normalizarClasificacion(ev.category || 'General') === clave);

    // El periodo que se está mirando. Sin fecha es el que corre; con ella, uno
    // de atrás. Todo lo que sigue —qué respuestas se traen, en qué periodo cae
    // cada encuesta y qué acta se busca— cuelga de esta fecha.
    const periodos = window.periodosDeClasificacion(encuestas, 12);
    const fecha = fechaRef ? new Date(fechaRef) : (periodos[0] ? periodos[0].referencia : new Date());
    const periodoElegido = periodos.find(p => Math.abs(p.referencia - fecha) < 1000) || periodos[0] || null;

    // Sólo hacen falta las respuestas del periodo que se mira. Se acota por la
    // fecha más temprana de todos los periodos en juego, que en una
    // clasificación mensual son unas semanas en vez de todo el historial. Si hay
    // alguna de una sola vez no se puede acotar: su periodo es «desde siempre».
    let desde = null;
    let hasta = null;
    encuestas.forEach(ev => {
        const p = window.periodoDeEncuesta(ev, fecha);
        if (!p.fin) { desde = false; return; }          // una `once` manda
        if (desde === false) return;
        if (desde === null || p.inicio < desde) desde = p.inicio;
        if (hasta === null || p.fin > hasta) hasta = p.fin;
    });

    let consulta = sb.from('evaluation_responses')
        .select('id, evaluation_id, employee_id, review_status, grades_json, submitted_at')
        .in('evaluation_id', encuestas.map(ev => ev.id));
    if (desde) {
        consulta = consulta.gte('submitted_at', new Date(desde).toISOString());
        // Mirando atrás también hay que poner techo, o se traería todo lo
        // posterior para nada.
        if (hasta) consulta = consulta.lt('submitted_at', new Date(hasta).toISOString());
    }

    const { data: respuestas, error } = await consulta;

    if (error) {
        cuerpo.innerHTML = `<div style="padding:30px; text-align:center; color:#ef4444;">No se pudieron cargar las respuestas: ${error.message}</div>`;
        return;
    }

    const porEmpleado = {};
    (respuestas || []).forEach(r => {
        const id = String(r.employee_id);
        if (!porEmpleado[id]) porEmpleado[id] = [];
        porEmpleado[id].push(r);
    });

    // Un empleado dado de baja no cuenta: ni se le certifica ni se le reprocha.
    const filas = (window.todosLosEmpleadosData || [])
        .filter(window.empleadoActivo)
        .map(emp => {
            const suyas = encuestas.filter(ev =>
                window.leTocaEstaEncuesta(ev, emp, window.tieneEquipoDirecto(emp.id)));
            if (suyas.length === 0) return null;

            const resumen = window.estadoCertificacion(suyas, porEmpleado[String(emp.id)] || [], fecha);
            return { empleado: emp, resumen: resumen };
        })
        .filter(Boolean);

    estado.elegida = clasificacion;
    estado.encuestas = encuestas;
    estado.filas = filas;
    estado.fecha = fecha;
    estado.periodos = periodos;
    estado.periodoElegido = periodoElegido;
    estado.actas = await window.actasDeClasificacion(clave, periodoElegido);
    // Nada viene marcado de entrada: con el buscador de por medio, una
    // selección hecha antes de teclear acabaría certificando a gente que ya no
    // está a la vista.
    estado.seleccion = [];

    // Los departamentos salen de toda la gente a la que le toca la
    // clasificación, no sólo de los listos: así el desplegable no se vacía
    // según se van certificando.
    const deptos = Array.from(new Set(filas.map(f => window.deptoDeEmpleado(f.empleado))))
        .sort((a, b) => a.localeCompare(b));
    const selDepto = document.getElementById('depto-cert');
    if (selDepto) {
        selDepto.innerHTML = `<option value="">Todos los departamentos (${filas.length})</option>`
            + deptos.map(d => {
                const cuantos = filas.filter(f => window.deptoDeEmpleado(f.empleado) === d).length;
                return `<option value="${window.sanitizeForHTML(d)}">${window.sanitizeForHTML(d)} (${cuantos})</option>`;
            }).join('');
        selDepto.value = '';
    }

    const selPeriodo = document.getElementById('periodo-cert');
    if (selPeriodo) {
        selPeriodo.innerHTML = periodos.map(p =>
            `<option value="${p.referencia.getTime()}">${p.actual ? '⏳ Periodo actual' : '🕒 ' + window.sanitizeForHTML(p.etiqueta || p.nombre)}</option>`
        ).join('');
        if (periodoElegido) selPeriodo.value = String(periodoElegido.referencia.getTime());
    }

    window.renderizarCertificacionClasificacion();
};

window.alternarSeleccionEmpleadoCert = (empId) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    const i = estado.seleccion.indexOf(String(empId));
    if (i === -1) estado.seleccion.push(String(empId)); else estado.seleccion.splice(i, 1);
    window.renderizarCertificacionClasificacion();
};

window.seleccionarGrupoCert = (ids, marcar) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    String(ids).split(',').filter(Boolean).forEach(id => {
        const i = estado.seleccion.indexOf(id);
        if (marcar && i === -1) estado.seleccion.push(id);
        if (!marcar && i !== -1) estado.seleccion.splice(i, 1);
    });
    window.renderizarCertificacionClasificacion();
};

// El departamento tal como se agrupa en esta pantalla. Se saca aparte porque
// lo usan el desplegable y el filtrado, y tienen que coincidir.
// Las actas del periodo que se está mirando, indexadas por empleado. Son un
// extra: dicen quién dio fe y cuándo, que es lo único que no se puede deducir
// de las respuestas. Si la tabla todavía no existe —el script de `sql/` se
// corre a mano— se sigue sin ellas y la lista se dibuja igual.
window.actasDeClasificacion = async (clave, periodo) => {
    if (!periodo || !periodo.inicio) return {};
    const aFecha = (d) => new Date(d).toISOString().slice(0, 10);

    try {
        const { data, error } = await sb.from('certificaciones_clasificacion')
            .select('employee_id, certificado_por, certificado_en, respuestas_cubiertas, nota')
            .eq('clasificacion', clave)
            .eq('periodo_inicio', aFecha(periodo.inicio));

        if (error) throw error;

        const porEmpleado = {};
        (data || []).forEach(a => { porEmpleado[String(a.employee_id)] = a; });
        return porEmpleado;
    } catch (e) {
        console.warn('No se pudieron leer las actas de certificación:', e.message);
        return {};
    }
};

window.cambiarPeriodoCert = (referencia) => {
    const estado = window.certificacionActual;
    if (!estado || !estado.elegida) return Promise.resolve();
    // Se recarga porque cambian las respuestas que hay que traerse: las del
    // periodo nuevo, no las del que estaba. Se devuelve la promesa para que
    // quien la llame pueda esperar a que la lista esté puesta.
    return window.cargarClasificacionParaCertificar(estado.elegida, new Date(Number(referencia)));
};

window.cambiarVistaCert = (vista) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    estado.vista = vista === 'certificadas' ? 'certificadas' : 'pendientes';
    // Lo marcado es de la vista de certificar; al cambiar de vista se suelta
    // para que la barra de abajo no siga ofreciendo sellar lo que ya no se ve.
    estado.seleccion = [];
    window.renderizarCertificacionClasificacion();
};

window.deptoDeEmpleado = (emp) => String((emp && emp.dept) || '').trim() || 'Sin departamento';

window.filtrarEmpleadosCert = (termino) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    estado.busqueda = String(termino || '');
    // El buscador vive fuera de #cuerpo-certificacion, así que repintar la
    // lista no se lo lleva por delante y el foco aguanta entre letra y letra.
    window.renderizarCertificacionClasificacion();
};

window.filtrarDeptoCert = (depto) => {
    const estado = window.certificacionActual;
    if (!estado) return;
    estado.departamento = String(depto || '');
    window.renderizarCertificacionClasificacion();
};

// Certificar a una sola persona sin pasar por las casillas: es el camino
// normal —se busca a alguien y se le da fe—, y entra por la misma función que
// el lote para no tener dos maneras de certificar.
window.certificarSoloA = (empId) => {
    const estado = window.certificacionActual;
    if (!estado) return Promise.resolve();
    estado.seleccion = [String(empId)];
    // Se devuelve la promesa: sin ella nadie puede esperar a que termine ni
    // enterarse de un fallo, que es justo lo que hace una escritura.
    return window.certificarSeleccionClasificacion();
};

window.renderizarCertificacionClasificacion = () => {
    const cuerpo = document.getElementById('cuerpo-certificacion');
    const estado = window.certificacionActual;
    if (!cuerpo || !estado || !estado.elegida) return;

    const E = window.ESTADOS_CERTIFICACION;
    const { filas, seleccion } = estado;
    const safeClas = window.sanitizeForHTML(estado.elegida);
    const vista = estado.vista === 'certificadas' ? 'certificadas' : 'pendientes';
    const periodo = estado.periodoElegido;
    const nombrePeriodo = periodo
        ? (periodo.actual ? (periodo.nombre || 'el periodo actual') : (periodo.etiqueta || periodo.nombre))
        : 'el periodo actual';

    document.querySelectorAll('#vista-cert button').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
    });

    const termino = (estado.busqueda || '').toLowerCase().trim();
    const depto = estado.departamento || '';
    const buscando = termino.length > 0;

    const coincide = (f) => {
        const e = f.empleado;
        return (e.name || '').toLowerCase().includes(termino)
            || (e.puesto || '').toLowerCase().includes(termino)
            || (e.dept || '').toLowerCase().includes(termino);
    };
    const enDepto = (f) => !depto || window.deptoDeEmpleado(f.empleado) === depto;

    const listos = filas.filter(f => f.resumen.estado === E.LISTA);
    const certificadas = filas.filter(f => f.resumen.estado === E.CERTIFICADA);

    const cuenta = {
        listos: listos.length,
        proceso: filas.filter(f => f.resumen.estado === E.PROCESO).length,
        observaciones: filas.filter(f => f.resumen.estado === E.OBSERVACIONES).length,
        certificadas: certificadas.length,
        sinActividad: filas.filter(f => f.resumen.estado === E.VACIO).length
    };

    const rotuloPeriodo = `<span style="display:inline-block; background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; padding:2px 8px; border-radius:20px; font-size:0.7rem; font-weight:700;">${window.sanitizeForHTML(nombrePeriodo)}</span>`;

    // --- Vista de certificadas: quién ya tiene la clasificación cerrada ---
    if (vista === 'certificadas') {
        const visibles = buscando
            ? certificadas.filter(coincide)
            : certificadas.filter(enDepto);

        const encabezado = `
            <div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
                Quien tiene «${safeClas}» <b>certificada por completo</b> en ${rotuloPeriodo}.
                ${cuenta.certificadas > 0 ? `<div style="margin-top:6px;">${cuenta.certificadas} de ${filas.length} persona(s) a las que les toca.</div>` : ''}
            </div>`;

        if (visibles.length === 0) {
            const vacio = certificadas.length === 0
                ? `Todavía no hay nadie con «${safeClas}» certificada en ${window.sanitizeForHTML(nombrePeriodo)}.`
                : (buscando ? 'Ninguna de las certificadas coincide con la búsqueda.'
                            : `Nadie de ${window.sanitizeForHTML(depto)} tiene «${safeClas}» certificada en este periodo.`);
            cuerpo.innerHTML = encabezado + `<div style="padding:30px; text-align:center; color:#94a3b8;">${vacio}</div>`;
            return;
        }

        const nombreDe = (id) => {
            const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(id));
            return emp ? emp.name : null;
        };

        const filaCert = (f) => {
            const id = String(f.empleado.id);
            const acta = (estado.actas || {})[id];
            const safeName = window.sanitizeForHTML(f.empleado.name || 'Sin nombre');
            const puesto = window.sanitizeForHTML(
                [f.empleado.puesto, window.deptoDeEmpleado(f.empleado)].filter(Boolean).join(' · '));

            // El acta es lo único que dice quién dio fe y cuándo; sin ella —o
            // sin la tabla— se enseña igual, que la certificación vive en las
            // respuestas.
            let firma = `<span style="color:#64748b; font-size:0.75rem;">Certificada · ${f.resumen.total} encuesta${f.resumen.total === 1 ? '' : 's'}</span>`;
            if (acta) {
                const quien = nombreDe(acta.certificado_por);
                const cuando = acta.certificado_en ? new Date(acta.certificado_en).toLocaleDateString() : '';
                firma = `<span style="color:#64748b; font-size:0.75rem;">Dio fe ${quien ? '<b>' + window.sanitizeForHTML(quien) + '</b>' : 'alguien'}${cuando ? ' · ' + cuando : ''}</span>`;
            }

            return `
            <div style="background:white; border:1px solid #bfdbfe; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
                <div style="display:flex; align-items:flex-start; gap:10px;">
                    <span style="flex-shrink:0; font-size:1.1rem; margin-top:1px;">⭐</span>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#0f172a; font-weight:600; font-size:0.92rem; line-height:1.25; word-break:break-word;">${safeName}</div>
                        <div style="color:#64748b; font-size:0.78rem; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${puesto}</div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap;">
                    ${firma}
                    <button onclick="window.abrirExpedienteEmpleado('${id}')"
                            style="flex-shrink:0; background:#f1f5f9; border:none; color:#475569; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">Abrir</button>
                </div>
            </div>`;
        };

        cuerpo.innerHTML = encabezado + `
            <div style="margin-top:18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:#eff6ff; color:#1d4ed8; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem;">
                    <span>${buscando ? '🔍 Resultados' : '✅ Certificadas'} (${visibles.length}${!buscando && visibles.length !== certificadas.length ? ` de ${certificadas.length}` : ''})</span>
                </div>
                <div style="margin-top:8px;">${visibles.map(filaCert).join('')}</div>
            </div>`;
        return;
    }

    // --- Vista de por certificar ---
    // Buscando, aparece cualquiera y en el estado que sea: si escribes un
    // nombre es porque quieres ver a esa persona, no que te digan que no
    // califica. Sin búsqueda, la lista es la de los listos —acotada al
    // departamento elegido—, que es a lo que se entra a esta pantalla.
    const visibles = buscando ? filas.filter(coincide) : listos.filter(enDepto);

    const resto = [];
    if (cuenta.proceso) resto.push(`${cuenta.proceso} en proceso`);
    if (cuenta.observaciones) resto.push(`${cuenta.observaciones} con observaciones`);
    if (cuenta.certificadas) resto.push(`${cuenta.certificadas} ya certificada(s)`);
    if (cuenta.sinActividad) resto.push(`${cuenta.sinActividad} sin contestar`);

    const encabezado = buscando
        ? `<div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
               Buscando entre <b>las ${filas.length} personas</b> a las que les toca «${safeClas}», estén listas o no, en ${rotuloPeriodo}.
               ${depto ? '<div style="margin-top:4px;">El filtro de departamento no se aplica mientras buscas.</div>' : ''}
           </div>`
        : `<div style="font-size:0.8rem; color:#64748b; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
               Sólo aparece quien tiene <b>toda la clasificación revisada</b> y lista para certificar en ${rotuloPeriodo}.
               Busca por nombre para ver a cualquiera y saber qué le falta.
               ${resto.length ? `<div style="margin-top:6px;">Del resto: ${resto.join(' · ')}.</div>` : ''}
           </div>`;

    if (visibles.length === 0) {
        const vacio = buscando
            ? `Nadie de «${safeClas}» coincide con la búsqueda.`
            : (depto
                ? `Nadie de ${window.sanitizeForHTML(depto)} tiene «${safeClas}» lista para certificar.`
                : `Nadie tiene «${safeClas}» lista para certificar en ${window.sanitizeForHTML(nombrePeriodo)}.`);
        cuerpo.innerHTML = encabezado + `<div style="padding:30px; text-align:center; color:#94a3b8;">${vacio}</div>`;
        return;
    }

    const filaHtml = (f) => {
        const id = String(f.empleado.id);
        const marcada = seleccion.includes(id);
        const lista = f.resumen.estado === E.LISTA;
        const cuantas = f.resumen.certificables.length;
        const falta = window.faltaParaCertificar(f.resumen);
        const insignia = window.insigniaCertificacion(f.resumen);
        const safeName = window.sanitizeForHTML(f.empleado.name || 'Sin nombre');
        const puesto = window.sanitizeForHTML(
            [f.empleado.puesto, window.deptoDeEmpleado(f.empleado)].filter(Boolean).join(' · '));

        // A quien no está listo se le dice qué le falta y no se le ofrece
        // certificar: el botón daría fe de algo que todavía no está revisado.
        // Se resuelve entrando a su expediente, que es a donde lleva «Abrir».
        const abajo = lista
            ? `<span style="color:#166534; font-size:0.75rem; font-weight:700;">${cuantas} encuesta${cuantas === 1 ? '' : 's'} por certificar</span>`
            : (falta.length
                ? `<span style="color:#b45309; font-size:0.75rem; font-weight:700; min-width:0;">Falta: ${window.sanitizeForHTML(falta.join(' · '))}</span>`
                : `<span style="color:#1d4ed8; font-size:0.75rem; font-weight:700;">Ya está certificada</span>`);

        return `
        <div style="background:${marcada ? '#eff6ff' : 'white'}; border:1px solid ${marcada ? '#93c5fd' : '#e2e8f0'}; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
            <div style="display:flex; align-items:flex-start; gap:10px;">
                ${lista
                    ? `<input type="checkbox" ${marcada ? 'checked' : ''} onclick="window.alternarSeleccionEmpleadoCert('${id}')"
                              style="width:20px; height:20px; flex-shrink:0; margin-top:2px; accent-color:#1d4ed8; cursor:pointer;"
                              title="Marcar para certificar a varios de una vez">`
                    : `<span style="width:20px; flex-shrink:0;"></span>`}
                <div style="flex:1; min-width:0;">
                    <div style="color:#0f172a; font-weight:600; font-size:0.92rem; line-height:1.25; word-break:break-word;">${safeName}</div>
                    <div style="color:#64748b; font-size:0.78rem; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${puesto}</div>
                    ${(buscando && insignia && !lista)
                        ? `<div style="margin-top:6px;"><span style="display:inline-block; background:${insignia.fondo}; color:${insignia.color}; border:1px solid ${insignia.borde}; padding:3px 8px; border-radius:20px; font-size:0.68rem; font-weight:700;">${insignia.texto}</span></div>`
                        : ''}
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap;">
                ${abajo}
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button onclick="window.abrirExpedienteEmpleado('${id}')"
                            style="background:#f1f5f9; border:none; color:#475569; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">Abrir</button>
                    ${lista
                        ? `<button onclick="window.certificarSoloA('${id}')"
                                   style="background:#eff6ff; border:1px solid #3b82f6; color:#1d4ed8; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;">⭐ Certificar</button>`
                        : ''}
                </div>
            </div>
        </div>`;
    };

    // «Marcar todas» sólo alcanza a lo que se está viendo y sólo a los listos:
    // con un filtro puesto, marcar a los que quedaron fuera sería marcar a
    // ciegas.
    const idsMarcables = visibles.filter(f => f.resumen.estado === E.LISTA).map(f => String(f.empleado.id));
    const todasMarcadas = idsMarcables.length > 0 && idsMarcables.every(id => seleccion.includes(id));

    const rotulo = buscando
        ? `🔍 Resultados (${visibles.length})`
        : `⭐ Listas para certificar (${visibles.length}${depto && cuenta.listos !== visibles.length ? ` de ${cuenta.listos}` : ''})`;

    const lista = `
        <div style="margin-top:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; background:${buscando ? '#f1f5f9' : '#dcfce7'}; color:${buscando ? '#334155' : '#166534'}; padding:8px 12px; border-radius:8px; font-weight:700; font-size:0.85rem;">
                <span>${rotulo}</span>
                ${idsMarcables.length > 0
                    ? `<button onclick="window.seleccionarGrupoCert('${idsMarcables.join(',')}', ${todasMarcadas ? 'false' : 'true'})"
                               style="background:white; border:1px solid #166534; color:#166534; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer; flex-shrink:0;">
                           ${todasMarcadas ? 'Quitar' : 'Marcar todas'}
                       </button>`
                    : ''}
            </div>
            <div style="margin-top:8px;">${visibles.map(filaHtml).join('')}</div>
        </div>`;

    let barra = '';
    if (seleccion.length > 0) {
        const marcadas = filas.filter(f => seleccion.includes(String(f.empleado.id)));
        const cubiertas = marcadas.reduce((n, f) => n + f.resumen.certificables.length, 0);

        barra = `
        <div style="position:sticky; bottom:0; margin-top:20px; background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px; box-shadow:0 -4px 12px rgba(0,0,0,0.06);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-weight:700; color:#0f172a; font-size:0.9rem;">${seleccion.length} persona${seleccion.length === 1 ? '' : 's'} · ${cubiertas} respuesta${cubiertas === 1 ? '' : 's'}</span>
                <button onclick="window.seleccionarGrupoCert('${seleccion.join(',')}', false)" style="background:none; border:none; color:#64748b; font-size:0.8rem; font-weight:700; cursor:pointer; text-decoration:underline;">Limpiar</button>
            </div>
            <button onclick="window.certificarSeleccionClasificacion()"
                    style="width:100%; background:#eff6ff; color:#1d4ed8; border:1px solid #3b82f6; padding:12px; border-radius:10px; font-size:0.95rem; font-weight:700; cursor:pointer;">
                ⭐ Certificar «${safeClas}»
            </button>
        </div>`;
    }

    cuerpo.innerHTML = encabezado + lista + barra;
};

window.certificarSeleccionClasificacion = async () => {
    const estado = window.certificacionActual;
    if (!estado || estado.seleccion.length === 0) return;
    if (!window.modoAdminActivo) { alert("Solo el modo administrador puede certificar."); return; }

    const elegidas = estado.filas.filter(f => estado.seleccion.includes(String(f.empleado.id)));
    const idsRespuesta = elegidas.reduce((acc, f) => acc.concat(f.resumen.certificables), []);

    if (idsRespuesta.length === 0) {
        alert("Ninguna de las personas seleccionadas tiene respuestas que se puedan certificar.");
        return;
    }

    const incompletas = elegidas.filter(f => f.resumen.estado !== window.ESTADOS_CERTIFICACION.LISTA);

    const periodo = estado.periodoElegido;
    const deQuePeriodo = periodo && !periodo.actual
        ? ` del periodo ${periodo.etiqueta || periodo.nombre}`
        : '';

    let msg = `Se van a certificar ${idsRespuesta.length} respuesta(s) de ${elegidas.length} persona(s) `
        + `en «${estado.elegida}»${deQuePeriodo}.`;
    if (incompletas.length > 0) {
        msg += `\n\n${incompletas.length} quedará(n) sin cerrar porque todavía les falta algo:`;
        incompletas.slice(0, 5).forEach(f => {
            const r = f.resumen;
            const falta = [];
            if (r.sinContestar) falta.push(`${r.sinContestar} sin contestar`);
            if (r.sinCalificar) falta.push(`${r.sinCalificar} sin calificar`);
            if (r.bajoUmbral) falta.push(`${r.bajoUmbral} bajo ${window.UMBRAL_CERTIFICACION}%`);
            msg += `\n  • ${f.empleado.name}: ${falta.join(', ') || 'pendiente'}`;
        });
        if (incompletas.length > 5) msg += `\n  • …y ${incompletas.length - 5} más`;
    }
    msg += `\n\n¿Confirmas?`;

    if (!confirm(msg)) return;

    try {
        // El `.select()` no es opcional: un update que RLS rechaza responde con
        // éxito y cero filas.
        const { data, error } = await sb.from('evaluation_responses')
            .update({ review_status: 'Certificada' })
            .in('id', idsRespuesta)
            .select('id');

        if (error) throw error;

        const sellados = new Set((data || []).map(r => String(r.id)));
        if (sellados.size === 0) {
            alert("No se certificó ninguna respuesta: la base rechazó la escritura.");
            return;
        }

        // Se recalcula cada persona con lo que de verdad quedó sellado, y de ahí
        // sale el acta: así no dice haber cubierto más de lo que cubrió.
        let cerradas = 0;
        const actas = [];
        elegidas.forEach(f => {
            f.resumen.certificables.forEach(id => {
                if (!sellados.has(String(id))) return;
                f.resumen.certificadas++;
                f.resumen.calificadas--;
            });
            f.resumen.certificables = f.resumen.certificables.filter(id => !sellados.has(String(id)));
            if (f.resumen.certificadas === f.resumen.total) {
                f.resumen.estado = window.ESTADOS_CERTIFICACION.CERTIFICADA;
                cerradas++;
            }
            actas.push(window.filaDeActa({
                clasificacion: estado.elegida,
                empleadoId: f.empleado.id,
                resumen: f.resumen,
                cubiertas: f.resumen.certificadas
            }));
        });

        const acta = await window.registrarActasCertificacion(actas);

        // Las actas recién levantadas se meten en la caché para que la vista de
        // certificadas las enseñe sin recargar la pantalla.
        actas.filter(Boolean).forEach(a => {
            estado.actas = estado.actas || {};
            estado.actas[String(a.employee_id)] = a;
        });

        estado.seleccion = [];
        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        let aviso = `Listo: ${sellados.size} respuesta(s) certificada(s) en «${estado.elegida}».`;
        if (cerradas > 0) aviso += `\n\n${cerradas} persona(s) quedan con la clasificación certificada.`;
        if (acta.guardadas === 0) {
            aviso += `\n\n(No se pudo dejar constancia de las actas: ${acta.motivo}. Las respuestas sí quedaron certificadas.)`;
        }
        alert(aviso);

        window.renderizarCertificacionClasificacion();

    } catch (e) {
        alert("Ocurrió un error al certificar: " + e.message);
    }
};

// --- 3. CREAR Y EDITAR EVALUACIONES ---

// La misma hoja sirve para crear y para editar, así que lo que la distingue
// tiene que decirlo el encabezado: el título, el subtítulo y la etiqueta del
// botón de guardar, que al ser un botón de icono la lleva en el aria-label y
// en el title. Antes decía «Nueva evaluación» también al editar una existente.
// ==========================================
// REVISORES POR CLASIFICACIÓN
// ==========================================
// Nombrar revisores encuesta por encuesta obliga a repetir la misma lista en
// todas las de «Seguridad» y a acordarse de ponerla en la siguiente que se
// cree. Quien imparte una clasificación la imparte entera, así que aquí se dice
// una vez y todas sus encuestas la heredan.
//
// La precedencia la resuelve `window.revisoresDeEncuesta` en `1-config.js`: los
// revisores propios de la encuesta mandan, después los de su clasificación, y
// sin unos ni otros el jefe inmediato. Esta pantalla sólo escribe la tabla.
//
// Vive en la misma hoja con dos pantallas —la lista de clasificaciones y el
// editor de una—, como la de evaluaciones: el cuerpo se rearma con `innerHTML`,
// así que los ids del editor existen sólo mientras está a la vista.
window.clasificacionesParaRevisores = [];
window.clasificacionEditandoRevisores = null;

// Al editor de una clasificación se entra por dos caminos —la lista de esta
// misma hoja y el botón del detalle de una clasificación, en el panel de
// inicio—, así que el botón del encabezado lo decide el camino y no la pantalla
// que se dibuja: la flecha de volver sólo tiene sentido si hay lista detrás. Es
// la misma marca que `vengoDeLaListaDeEncuestas` y por lo mismo.
window.vengoDeLaListaDeClasificaciones = false;

window.volverAListaDeRevisores = () =>
    window.vengoDeLaListaDeClasificaciones ? (() => window.pintarListaRevisoresClasif()) : null;

// El encabezado de la hoja. Es el mismo patrón que
// `encabezadoHojaEvaluaciones`: el botón de la derecha es la cruz en la lista y
// la flecha de volver en el editor, y el de guardar sólo sale donde hay algo
// que guardar. La cruz la dibujan los pseudoelementos de `.ios-boton-cerrar`,
// así que cambiar de icono es quitarle la clase y meter el `<svg>`.
window.encabezadoRevisoresClasif = (titulo, subtitulo, alVolver, alGuardar) => {
    const h = document.getElementById('titulo-revisores-clasif');
    if (h) h.innerText = titulo || 'Revisores por clasificación';

    const sub = document.getElementById('subtitulo-revisores-clasif');
    if (sub) sub.innerText = subtitulo || '';

    const guardar = document.getElementById('btn-guardar-revisores-clasif');
    if (guardar) {
        guardar.hidden = typeof alGuardar !== 'function';
        guardar.disabled = false;
        guardar.onclick = typeof alGuardar === 'function' ? alGuardar : null;
    }

    const btn = document.getElementById('btn-cerrar-revisores-clasif');
    if (!btn) return;

    if (typeof alVolver === 'function') {
        btn.classList.remove('ios-boton-cerrar');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7"/></svg>';
        btn.title = 'Volver';
        btn.setAttribute('aria-label', 'Volver a la lista de clasificaciones');
        btn.onclick = alVolver;
    } else {
        btn.classList.add('ios-boton-cerrar');
        btn.innerHTML = '';
        btn.title = 'Cerrar';
        btn.setAttribute('aria-label', 'Cerrar');
        btn.onclick = window.cerrarRevisoresClasificacion;
    }
};

window.cerrarRevisoresClasificacion = () => {
    const modal = document.getElementById('modal-revisores-clasif');
    if (modal) modal.style.display = 'none';
    const cuerpo = document.getElementById('cuerpo-revisores-clasif');
    if (cuerpo) cuerpo.innerHTML = '';
    window.clasificacionEditandoRevisores = null;
};

window.abrirRevisoresPorClasificacion = async () => {
    const modal = document.getElementById('modal-revisores-clasif');
    const cuerpo = document.getElementById('cuerpo-revisores-clasif');
    if (!modal || !cuerpo) return;

    // Cómo se cierra la hoja al deslizarla hacia abajo: su botón del encabezado
    // no siempre es la cruz, y ese gesto cierra, no retrocede.
    modal.__cerrarHoja = () => window.cerrarRevisoresClasificacion();

    window.encabezadoRevisoresClasif('Revisores por clasificación', 'Modo administrador');
    cuerpo.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Cargando clasificaciones...</div>';
    modal.style.display = 'flex';

    // La tabla es la que se está a punto de editar, así que se relee: la caché
    // pudo llenarse al arrancar la aplicación y quedarse vieja.
    const hayTabla = await window.cargarRevisoresDeClasificaciones(true);

    const { data, error } = await sb.from('evaluations').select('category');
    if (error) {
        cuerpo.innerHTML = `<div style="text-align:center; padding:20px; color:#b91c1c;">No se pudieron leer las encuestas: ${window.sanitizeForHTML(error.message)}</div>`;
        return;
    }

    // Una clasificación por nombre normalizado, quedándose con cómo se escribió
    // la primera vez que aparece —la clasificación es texto libre y «Seguridad»
    // y «seguridad » son la misma—.
    const porClave = {};
    (data || []).forEach(ev => {
        const nombre = String(ev.category || '').trim();
        if (!nombre) return;
        const clave = window.normalizarClasificacion(nombre);
        if (!porClave[clave]) porClave[clave] = { clave: clave, nombre: nombre, encuestas: 0 };
        porClave[clave].encuestas++;
    });

    // Y las que tienen revisores nombrados pero ya no tienen encuestas: si no,
    // su fila se quedaría guardada sin manera de verla ni de vaciarla.
    Object.keys(window.REVISORES_POR_CLASIFICACION || {}).forEach(clave => {
        if (!porClave[clave]) porClave[clave] = { clave: clave, nombre: clave, encuestas: 0 };
    });

    window.clasificacionesParaRevisores = Object.values(porClave)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    window.pintarListaRevisoresClasif(hayTabla);
};

window.pintarListaRevisoresClasif = (hayTabla) => {
    const cuerpo = document.getElementById('cuerpo-revisores-clasif');
    if (!cuerpo) return;

    window.clasificacionEditandoRevisores = null;
    window.vengoDeLaListaDeClasificaciones = true;
    window.encabezadoRevisoresClasif('Revisores por clasificación', 'Modo administrador');

    const aviso = hayTabla === false
        ? `<div style="background:#fffbeb; border:1px solid #fde68a; color:#b45309; border-radius:12px; padding:12px; font-size:0.85rem; margin-bottom:12px;">
               Falta correr <code>sql/clasificaciones-revisores.sql</code> en Supabase. Mientras tanto los revisores se siguen nombrando encuesta por encuesta.
           </div>`
        : `<p style="font-size:0.82rem; color:#64748b; margin:0 0 12px; line-height:1.5;">
               Quien revisa una clasificación califica las respuestas de todas sus encuestas. Una encuesta que nombre a sus propios revisores se queda con ellos.
           </p>`;

    if (window.clasificacionesParaRevisores.length === 0) {
        cuerpo.innerHTML = aviso + '<div style="text-align:center; padding:20px; color:#64748b;">Todavía no hay ninguna clasificación.</div>';
        return;
    }

    const filas = window.clasificacionesParaRevisores.map((c, i) => {
        const ids = window.revisoresDeClasificacion(c.nombre);
        const quien = ids.length > 0
            ? `<span style="color:#6b21a8; font-weight:600;">${window.sanitizeForHTML(window.nombresDeEmpleados(ids))}</span>`
            : '<span style="color:#94a3b8;">La revisan los jefes inmediatos</span>';
        const cuantas = c.encuestas === 1 ? '1 encuesta' : `${c.encuestas} encuestas`;

        return `<div onclick="window.editarRevisoresDeClasificacion(${i})" style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer; display:flex; align-items:center; gap:10px;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; color:#1e293b; font-size:0.95rem;">${window.sanitizeForHTML(c.nombre)}</div>
                <div style="font-size:0.8rem; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${quien}</div>
                <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">${cuantas}</div>
            </div>
            <span style="color:#cbd5e1; font-size:1.3rem; line-height:1;">&rsaquo;</span>
        </div>`;
    }).join('');

    cuerpo.innerHTML = aviso + filas;
};

// La entrada desde la lista de esta hoja: la clasificación se dice por su
// posición y no por su nombre, que es texto libre y puede traer comillas.
window.editarRevisoresDeClasificacion = (indice) => {
    const c = window.clasificacionesParaRevisores[indice];
    if (c) window.pintarEditorRevisoresClasif(c);
};

window.pintarEditorRevisoresClasif = (c) => {
    const cuerpo = document.getElementById('cuerpo-revisores-clasif');
    if (!cuerpo || !c) return;

    window.clasificacionEditandoRevisores = c;

    cuerpo.innerHTML = `
        <label class="eval-opcion" style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:12px;">
            <input type="checkbox" id="chk-revisa-jefe-clasif" onchange="window.toggleSelectorPersonas('revisoresClasif')" checked>
            <span class="eval-opcion-texto">
                <span class="eval-opcion-titulo">👔 Las revisan los jefes inmediatos</span>
                <span class="eval-opcion-ayuda">Desmárcalo para nombrar a quién le toca calificar las encuestas de esta clasificación.</span>
            </span>
        </label>
        <div id="container-selector-revisores-clasif" class="eval-lista eval-lista--alta" style="display:none;">
            <div style="position:relative; margin-bottom:10px;">
                <span style="position:absolute; left:10px; top:9px; font-size:0.9rem;">🔍</span>
                <input type="text" id="inp-buscar-revisor-clasif" placeholder="Buscar por nombre o ID..." oninput="window.buscarPersonaEval('revisoresClasif', this.value)" autocomplete="off" style="padding-left:32px;">
            </div>
            <div id="lista-resultados-revisores-clasif" style="max-height:140px; overflow-y:auto; margin-bottom:12px; border-radius:6px;"></div>
            <div style="font-size:0.8rem; font-weight:bold; color:#475569; margin-bottom:8px; border-top:1px solid #e2e8f0; padding-top:10px;">Revisores:</div>
            <div id="lista-revisores-clasif-elegidos" style="display:flex; flex-wrap:wrap; gap:8px; min-height:30px;">
                <span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Ninguno seleccionado.</span>
            </div>
        </div>
        <p class="form-ayuda" style="margin-top:12px;">Lo que se nombre aquí lo heredan las ${c.encuestas === 1 ? 'encuesta' : `${c.encuestas} encuestas`} de esta clasificación, también las que se creen después. Una encuesta que nombre a sus propios revisores se queda con ellos.</p>
    `;

    window.prepararSelectorPersonas('revisoresClasif', window.revisoresDeClasificacion(c.nombre));

    window.encabezadoRevisoresClasif(c.nombre, 'Quién revisa esta clasificación',
        window.volverAListaDeRevisores(),
        () => window.guardarRevisoresClasificacionActual());
};

// La entrada directa, desde el detalle de una clasificación del panel de
// inicio. No monta la lista: lo que se viene a hacer es lo de esta
// clasificación, así que el botón del encabezado se queda en la cruz.
window.abrirRevisoresDeClasificacion = async (nombre, encuestas) => {
    const modal = document.getElementById('modal-revisores-clasif');
    const cuerpo = document.getElementById('cuerpo-revisores-clasif');
    if (!modal || !cuerpo) return;

    modal.__cerrarHoja = () => window.cerrarRevisoresClasificacion();
    window.vengoDeLaListaDeClasificaciones = false;

    // El encabezado se pone antes de la consulta, así que el primer fotograma
    // ya dice a dónde se entró.
    window.encabezadoRevisoresClasif(nombre, 'Quién revisa esta clasificación');
    cuerpo.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Cargando revisores...</div>';
    modal.style.display = 'flex';

    // Se relee: es la tabla que se está a punto de editar, y la caché pudo
    // llenarse al arrancar la aplicación y quedarse vieja.
    const hayTabla = await window.cargarRevisoresDeClasificaciones(true);
    if (!hayTabla) {
        cuerpo.innerHTML = `<div style="background:#fffbeb; border:1px solid #fde68a; color:#b45309; border-radius:12px; padding:12px; font-size:0.85rem;">
            Falta correr <code>sql/clasificaciones-revisores.sql</code> en Supabase para poder nombrar revisores de una clasificación entera.
        </div>`;
        return;
    }

    window.pintarEditorRevisoresClasif({
        clave: window.normalizarClasificacion(nombre),
        nombre: String(nombre || '').trim(),
        encuestas: Number(encuestas) || 0
    });
};

window.guardarRevisoresClasificacionActual = async () => {
    const c = window.clasificacionEditandoRevisores;
    if (!c) return;

    // El selector devuelve ['ALL'] con la casilla marcada y null si se desmarcó
    // sin elegir a nadie, que es un descuido. Las dos cosas significan aquí lo
    // mismo que no haber nombrado a nadie, pero el descuido se avisa.
    const ids = window.idsDelSelector('revisoresClasif');
    if (ids === null) {
        alert('⚠️ Elige al menos un revisor, o vuelve a marcar la casilla para dejarlo en los jefes inmediatos.');
        return;
    }
    const limpios = ids.filter(x => String(x).toUpperCase() !== 'ALL');

    const btn = document.getElementById('btn-guardar-revisores-clasif');
    if (btn) btn.disabled = true;

    try {
        await window.guardarRevisoresDeClasificacion(c.nombre, limpios);
        // La caché ya quedó corregida, así que la lista se repinta con lo nuevo
        // sin volver a preguntarle a la base. Y si no hay lista detrás —se entró
        // derecho desde el detalle de una clasificación— la hoja se cierra: lo
        // que se venía a hacer ya está hecho.
        const volver = window.volverAListaDeRevisores();
        if (volver) volver();
        else window.cerrarRevisoresClasificacion();
    } catch (e) {
        console.error(e);
        alert('❌ No se pudo guardar: ' + e.message);
        if (btn) btn.disabled = false;
    }
};

// Lo que hereda esta encuesta si no se nombra a nadie. Sin decirlo, un revisor
// heredado no se ve por ningún lado: la hoja enseñaría «la revisa el jefe
// inmediato» mientras la califica otro.
window.pintarNotaRevisoresClasificacion = () => {
    const nota = document.getElementById('nota-revisores-clasificacion');
    if (!nota) return;

    const chk = document.getElementById('chk-revisa-jefe');
    const inp = document.getElementById('eval-category-input');
    const clasificacion = inp ? String(inp.value || '').trim() : '';
    const ids = window.revisoresDeClasificacion(clasificacion);

    // Con revisores propios nombrados no se hereda nada, así que no hay nada
    // que contar: la nota acompaña a la casilla marcada.
    if (!clasificacion || ids.length === 0 || (chk && !chk.checked)) {
        nota.style.display = 'none';
        nota.innerText = '';
        return;
    }

    nota.style.display = 'block';
    nota.innerText = `Sin nombrar a nadie aquí, la revisan los revisores de «${clasificacion}»: ${window.nombresDeEmpleados(ids)}.`;
};

// ==========================================
// EL RESUMEN DE CADA SECCIÓN DE LA HOJA
// ==========================================
// Las cinco secciones de la hoja de crear y editar se pliegan, y su renglón
// dice lo que hay elegido dentro. Al editar, así la hoja entera cabe de un
// vistazo y se abre sólo lo que se va a cambiar; antes eran cinco tarjetas
// seguidas y encontrar la frecuencia era recorrer media pantalla de casillas.
//
// El resumen sale **de los propios campos**, no de la encuesta que se cargó:
// tiene que decir lo que hay puesto ahora mismo, incluido lo que se acaba de
// cambiar sin haber guardado todavía.

// El texto de la opción elegida de un `<select>`, que es lo que se lee en
// pantalla —«Sin repetición (Única vez)»— y no su valor.
window.textoElegido = (id) => {
    const sel = document.getElementById(id);
    if (!sel || sel.selectedIndex < 0) return '';
    return String(sel.options[sel.selectedIndex].text || '').trim();
};

// Los nombres de pila de una lista de gente, que es lo que cabe en un renglón:
// tres nombres completos se comen el resumen entero y se recortan a la mitad
// del primero. El completo se sigue leyendo dentro de la sección.
window.nombresCortos = (nombres) => (nombres || [])
    .map(n => String(n || '').trim().split(' ')[0]).filter(Boolean).join(', ');

const marcada = (id) => {
    const chk = document.getElementById(id);
    return !!chk && chk.checked;
};

// Cuántos elementos concretos tiene marcado un selector de casillas —puestos y
// departamentos—, o null si manda su «todos».
const cuantosMarcados = (idTodos, selector) => {
    if (marcada(idTodos)) return null;
    const n = document.querySelectorAll(selector).length;
    return n;
};

window.RESUMEN_DE_GRUPO = {
    datos: () => {
        const freq = document.getElementById('eval-frequency-input');
        const modo = document.getElementById('eval-mode-input');
        return [
            (document.getElementById('eval-title-input') || {}).value,
            (document.getElementById('eval-category-input') || {}).value,
            // Sin el emoji del desplegable: aquí hace falta la palabra, y
            // cuatro iconos en un renglón de 0.72rem son ruido. La frecuencia
            // la nombra el ayudante de siempre, que es quien manda.
            freq && window.textoDeFrecuencia ? window.textoDeFrecuencia(freq.value) : '',
            modo && modo.value === 'boss' ? 'La contesta el jefe' : 'Autoevaluación'
        ].map(x => String(x || '').trim()).filter(Boolean).join(' · ');
    },

    destinatarios: () => {
        const partes = [];
        const puestos = cuantosMarcados('chk-all-puestos', '.chk-puesto-item:checked');
        const deptos = cuantosMarcados('chk-all-deptos', '.chk-depto-item:checked');
        const personas = marcada('chk-all-empleados')
            ? null : (window.personasElegidas ? window.personasElegidas('destinatarios').length : 0);

        if (puestos !== null) partes.push(`${puestos} puesto${puestos === 1 ? '' : 's'}`);
        if (deptos !== null) partes.push(`${deptos} departamento${deptos === 1 ? '' : 's'}`);
        if (personas !== null) partes.push(`${personas} persona${personas === 1 ? '' : 's'}`);

        return partes.length > 0 ? partes.join(' · ') : 'Toda la plantilla';
    },

    revisores: () => {
        // Con la casilla marcada no se nombra a nadie, pero la encuesta puede
        // heredar los de su clasificación: decir «el jefe inmediato» cuando la
        // va a calificar otro sería justo lo que la nota de abajo desmiente.
        if (marcada('chk-revisa-jefe')) {
            const inp = document.getElementById('eval-category-input');
            const heredados = window.revisoresDeClasificacion
                ? window.revisoresDeClasificacion(inp ? inp.value : '') : [];
            return heredados.length > 0
                ? `Heredados: ${window.nombresCortos(heredados.map(id =>
                    window.nombresDeEmpleados([id])))}`
                : 'El jefe inmediato';
        }
        const elegidos = window.personasElegidas ? window.personasElegidas('revisores') : [];
        if (elegidos.length === 0) return 'Sin nombrar';
        return window.nombresCortos(elegidos.map(e => e.name));
    },

    opciones: () => {
        const partes = [];
        if (marcada('chk-eval-por-area')) partes.push('Por área');
        partes.push(marcada('chk-eval-obligatoria') ? 'Obligatoria' : 'Opcional');
        if (marcada('chk-eval-umbral')) partes.push('Exige 80%');
        const dias = parseInt((document.getElementById('eval-retry-days') || {}).value, 10);
        if (dias > 0) partes.push(`Repetir en ${dias} día${dias === 1 ? '' : 's'}`);
        if (!marcada('chk-eval-activa')) partes.push('Inactiva');
        // La fecha desde la que aplica sólo se dice si se puso: vacía es «desde
        // que se creó», que es lo de siempre y no hay que contarlo.
        const desde = window.fechaDeVigenciaDeLaHoja();
        if (desde) partes.push(`Desde ${window.fechaCortaDeVigencia(desde)}`);
        return partes.join(' · ');
    },

    escala: () => {
        const max = parseInt((document.getElementById('eval-max-scale') || {}).value, 10);
        if (!max || max <= 0) return '';
        return `0 a ${max}` + (marcada('eval-half-points') ? ' · con puntos medios' : '');
    },

    preguntas: () => {
        const n = document.querySelectorAll('#questions-container .pregunta-wrapper').length;
        return n === 0 ? 'Ninguna todavía' : `${n} pregunta${n === 1 ? '' : 's'}`;
    },

    // Sale de lo que hay cargado en la hoja, no de otra consulta: lo llena
    // `prepararMaterialEnEdicion` al abrirla y lo rehacen el guardado y el
    // quitado, que es justo cuando cambia.
    material: () => {
        if (!window.materialEnEdicion) return 'Al publicarla';
        const docs = window.documentosDeMaterial(window.materialesEncuesta);
        if (window.materialesEncuesta === null) return '';
        return docs.length === 0
            ? 'Ninguno' : `${docs.length} documento${docs.length === 1 ? '' : 's'}`;
    }
};

window.pintarResumenGrupos = () => {
    document.querySelectorAll('#modal-crear-eval [data-resumen]').forEach(nodo => {
        const calcular = window.RESUMEN_DE_GRUPO[nodo.getAttribute('data-resumen')];
        if (!calcular) return;
        let texto = '';
        try { texto = calcular() || ''; } catch (e) { texto = ''; }
        nodo.innerText = texto;
    });
};

// Abre una sección y la lleva a la vista. Lo llama el guardado antes de cada
// aviso: con todo plegado, «Faltan datos» no diría dónde falta.
window.abrirGrupoEval = (id) => {
    const grupo = document.getElementById(id);
    if (!grupo) return;
    grupo.open = true;
    if (typeof grupo.scrollIntoView === 'function') {
        grupo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
};

// Deja las secciones como toca al abrir la hoja: al **editar** todas plegadas
// —a eso se entra, a cambiar una cosa—, y al **crear** abiertas las dos que
// hay que llenar sí o sí, que si no la hoja nueva sale en blanco sin decir por
// dónde se empieza.
window.plegarGruposEval = (editando) => {
    ['grupo-datos', 'grupo-destinatarios', 'grupo-revisores',
     'grupo-opciones', 'grupo-material', 'grupo-preguntas'].forEach(id => {
        const grupo = document.getElementById(id);
        if (!grupo) return;
        grupo.open = !editando && (id === 'grupo-datos' || id === 'grupo-preguntas');
    });
};

// El resumen se rehace con cualquier toque de la hoja. Van los tres eventos:
// `input` para lo que se escribe, `change` para casillas y desplegables, y
// `click` para los selectores de personas, que cambian su lista desde el
// `onclick` de un botón y no disparan ninguno de los otros dos —el manejador
// propio corre antes de que el evento burbujee hasta aquí, así que para cuando
// se lee ya está actualizada—.
(() => {
    const hoja = document.getElementById('modal-crear-eval');
    if (!hoja) return;
    ['input', 'change', 'click'].forEach(evento =>
        hoja.addEventListener(evento, () => window.pintarResumenGrupos()));
})();

// ==========================================
// EL MATERIAL, EN LA HOJA DE EDICIÓN
// ==========================================
// Agregar material y quitarlo es escribir la encuesta —como sus preguntas o a
// quién va dirigida—, así que vive en la hoja donde se escribe todo lo demás de
// ella. En la hoja de la encuesta se quedan la portada, que es por donde se
// lee, y los archivos sueltos, que no entran en el visor.
//
// **Sólo sale al editar una que ya existe.** Un archivo cuelga de su encuesta
// —la carpeta del bucket lleva su id y cada fila la nombra—, así que sin fila
// no hay a qué colgarlo: al crear y al copiar la sección se esconde y dice qué
// falta. Una copia tampoco hereda el material de la original, igual que no
// hereda su fecha de vigencia y por lo mismo: es la vuelta de este mes.
window.materialEnEdicion = null;

window.prepararMaterialEnEdicion = async (id) => {
    const grupo = document.getElementById('grupo-material');
    const hueco = document.getElementById('material-edicion');
    const aviso = document.getElementById('aviso-material-sin-guardar');

    window.materialEnEdicion = id ? { id: String(id) } : null;
    if (hueco) hueco.innerHTML = '';
    if (aviso) aviso.style.display = id ? 'none' : 'block';
    if (!grupo) return;

    // Sin encuesta todavía la sección se queda, pero vacía y diciendo por qué:
    // esconderla entera dejaría a quien la busca sin saber que existe.
    if (!id) { window.pintarResumenGrupos(); return; }

    // Aquí no hay portada que evitar repetir: el recuadro de esta hoja los
    // enseña todos, que es su consola.
    window.hayPortadaEnLaHoja = false;
    await window.cargarMaterialesEncuesta(id);
    window.pintarMaterialEncuesta();
    window.pintarResumenGrupos();
};

window.prepararEncabezadoEval = (editando, soloDestinatarios = false) => {
    // El subtítulo que se escribe aquí es el bueno: si quedó apuntado el de
    // antes de un guardado, soltarlo ahora o se repondría encima de éste.
    window.subtituloAntesDeGuardar = null;
    const titulo = document.getElementById('titulo-crear-eval');
    const subtitulo = document.getElementById('subtitulo-crear-eval');
    const guardar = document.getElementById('btn-guardar-eval');
    const escala = document.getElementById('div-rango-labels');

    if (titulo) titulo.innerText = soloDestinatarios
        ? 'A quién va dirigida'
        : (editando ? 'Editar evaluación' : 'Nueva evaluación');
    if (subtitulo) subtitulo.innerText = soloDestinatarios
        ? 'Como revisor sólo cambias a quién le toca'
        : (editando
            ? 'Los cambios valen del periodo siguiente en adelante'
            : 'Define el cuestionario y a quién le toca');
    if (guardar) {
        const etiqueta = (editando || soloDestinatarios) ? 'Guardar cambios' : 'Publicar evaluación';
        guardar.title = etiqueta;
        guardar.setAttribute('aria-label', etiqueta);
    }

    // El bote de basura sólo tiene a qué apuntar cuando se está editando una
    // encuesta que ya existe: al crear no hay nada que borrar, una copia todavía
    // no es ninguna fila —`editarEvaluacion` la abre con `editando` en false— y
    // el revisor que corrige a quién va dirigida no puede eliminar nada. Se
    // esconde con `hidden`, así que depende de la regla
    // `.ios-boton-icono[hidden]` de estilos.css: es un flex y un `display` de
    // autor le gana al `[hidden]` del navegador.
    const borrar = document.getElementById('btn-borrar-eval');
    if (borrar) borrar.hidden = !(editando && !soloDestinatarios && window.modoAdminActivo);

    // La vista previa sí sale al crear y al copiar —es cuando más falta hace—,
    // pero no en el modo restringido del revisor: ahí el cuestionario ni se le
    // pide a la base, así que no hay preguntas que enseñar. Mismo `hidden` y
    // misma regla `.ios-boton-icono[hidden]` de estilos.css.
    const previa = document.getElementById('btn-vista-previa-eval');
    if (previa) previa.hidden = soloDestinatarios;
    // La escala arranca plegada; quien la necesite la abre, y al editar la
    // abre window.editarEvaluacion si la encuesta ya trae etiquetas.
    if (escala) escala.open = false;

    // Y las cinco secciones, que en este modo restringido no se ven: el
    // revisor sólo tiene delante «A quién va dirigida», así que se le abre.
    window.plegarGruposEval(editando && !soloDestinatarios);
    if (soloDestinatarios) {
        const dest = document.getElementById('grupo-destinatarios');
        if (dest) dest.open = true;
    }
    window.pintarResumenGrupos();
};

// --- VER LA ENCUESTA COMO LA VERÁ QUIEN LA CONTESTE ---
//
// Una encuesta se escribe en una hoja de campos y se contesta en otra pantalla
// muy distinta, y hasta publicarla no había manera de saber cómo iba a quedar:
// si la guía de la escala se lee, si el enunciado de una evidencia dice qué
// fotografiar, si una pregunta pide comentario. Enterarse después es corregirla
// cuando ya la contestó alguien, y editarla parte su historial en dos.
//
// Sale de la hoja y no de la base: lo que se quiere ver es lo que se acaba de
// escribir, todavía sin guardar. Por eso el cuestionario lo lee
// `window.preguntasDeLaHoja`, la misma lectura con la que se guarda —dos
// lecturas distintas dejarían la previa enseñando una encuesta que no es la que
// se va a publicar— y el resto de los campos se leen aquí al lado.
//
// Las preguntas nuevas no tienen id, así que se les pone uno de mentira: la
// pantalla de contestar lo usa para el `name` de cada grupo de opciones y para
// el id de cada tarjeta, y sin él dos preguntas nuevas compartirían controles.
// Nunca llegan a la base: la previa no escribe nada.
window.vistaPreviaEncuesta = () => {
    const preguntas = window.preguntasDeLaHoja();
    if (preguntas.length === 0) {
        window.abrirGrupoEval('grupo-preguntas');
        alert("Escribe al menos una pregunta para verla en la vista previa.");
        return;
    }

    const inpTitulo = document.getElementById('eval-title-input');
    const titulo = (inpTitulo ? inpTitulo.value.trim() : '') || 'Encuesta sin título';
    const inpDesc = document.getElementById('eval-desc-input');
    const desc = inpDesc ? inpDesc.value.trim() : '';
    const inpFreq = document.getElementById('eval-frequency-input');
    const freq = inpFreq ? inpFreq.value : 'once';
    const chkArea = document.getElementById('chk-eval-por-area');
    const evaluaArea = chkArea ? chkArea.checked : false;

    // Las etiquetas de la escala, como las lee el guardado: son de la encuesta
    // entera y van debajo de cada círculo.
    const inpMax = document.getElementById('eval-max-scale');
    const maxEscala = (inpMax && parseInt(inpMax.value)) || 5;
    const etiquetas = {};
    for (let i = 0; i <= maxEscala; i++) {
        const el = document.getElementById(`lbl-range-${i}`);
        if (el && el.value.trim()) etiquetas[i] = el.value.trim();
    }

    // La hoja de edición se aparta en vez de quedarse debajo: dos hojas
    // apiladas dejan dos tiradores a la vista, que es lo que esta aplicación no
    // hace en ningún sitio. Se guarda por dónde iba su cuerpo, o volver de la
    // previa dejaría el formulario arriba del todo.
    const hoja = document.getElementById('modal-crear-eval');
    const cuerpo = hoja ? hoja.querySelector('.hoja-cuerpo-formulario') : null;
    window.desplazamientoHojaEval = cuerpo ? cuerpo.scrollTop : 0;
    if (hoja) hoja.style.display = 'none';

    window.preguntasCacheActual = preguntas.map((q, i) =>
        Object.assign({}, q, { id: `previa-${i}` }));

    window.prepararRespuesta(null, titulo, etiquetas, desc, freq, evaluaArea, [],
        { vistaPrevia: true });
};

// El cierre lo comparten la cruz, el botón del pie y el gesto de deslizar hacia
// abajo, que pulsa esa misma cruz. No pasa por `cancelarRespuesta`: aquélla
// devuelve el panel de encuestas, y de aquí se vino de la hoja de edición.
window.cerrarVistaPrevia = () => {
    const modal = document.getElementById('modal-responder-eval');
    if (modal) { modal.style.display = 'none'; modal.innerHTML = ''; }
    document.body.style.overflow = '';

    // La previa dejó puesto un cuestionario de mentira, con ids que no existen
    // en la base: no puede sobrevivirle.
    window.preguntasCacheActual = [];
    window.evalIdRespondiendo = null;
    window.fotosPreguntaListas = {};
    window.trazosDeFirma = {};

    const hoja = document.getElementById('modal-crear-eval');
    if (hoja) {
        hoja.style.display = 'flex';
        const cuerpo = hoja.querySelector('.hoja-cuerpo-formulario');
        if (cuerpo) cuerpo.scrollTop = window.desplazamientoHojaEval || 0;
    }
};

// La misma hoja sirve para configurar la encuesta entera y para que un revisor
// corrija sólo a quién va dirigida. Lo que sobra se esconde en vez de armar una
// segunda hoja: así el selector de puestos, departamentos y personas —con su
// buscador y sus fichas— sigue siendo uno solo.
//
// El bloque de revisores se esconde siempre en este modo aunque
// `verificarRestriccionesModo` lo vuelva a mostrar: nombrar revisores es
// justamente lo que no le toca a un revisor.
window.SECCIONES_FUERA_DE_DESTINATARIOS = [
    'grupo-datos', 'grupo-datos-cuerpo',
    'grupo-revisores', 'grupo-revisores-cuerpo',
    'grupo-opciones', 'grupo-opciones-cuerpo',
    'grupo-material', 'grupo-material-cuerpo',
    'div-rango-labels',
    'grupo-preguntas', 'questions-container', 'btn-agregar-pregunta'
];

window.aplicarModoSoloDestinatarios = (activo) => {
    window.SECCIONES_FUERA_DE_DESTINATARIOS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = activo ? 'none' : '';
    });

    // Y su propio rótulo, que repetiría el título de la hoja: en este modo la
    // hoja entera se llama «A quién va dirigida». Se esconde **el renglón del
    // plegable y no la sección**: desde que cada una es un `<details>`,
    // esconder el `grupo-destinatarios` entero dejaría la hoja en blanco. Y se
    // abre a mano, que sin renglón no queda quién la despliegue.
    const grupo = document.getElementById('grupo-destinatarios');
    if (grupo) {
        const renglon = grupo.querySelector('summary');
        if (renglon) renglon.style.display = activo ? 'none' : '';
        if (activo) grupo.open = true;
    }
};

window.renderConfiguracionEscala = () => {
    const maxVal = parseInt(document.getElementById('eval-max-scale').value) || 5;
    const container = document.getElementById('dynamic-labels-container');
    container.innerHTML = '';

    for(let i=0; i<=maxVal; i++) {
        container.insertAdjacentHTML('beforeend',
            `<div style="display:flex; align-items:center; gap:5px;">
                <span style="width:20px; font-weight:bold; color:#be185d;">${i}:</span> 
                <input type="text" id="lbl-range-${i}" placeholder="Ej. Nivel ${i}" style="flex:1; padding:6px; border-radius:6px; border:1px solid #fbcfe8;">
            </div>`
        );
    }

    // Los recuadros de la guía de cada pregunta son uno por valor, así que
    // cambiar el máximo cambia cuántos hay.
    window.renderGuiasDeEscala();
};

// El «Puntaje máximo» de la hoja, puesto desde fuera sin perder las etiquetas
// ya escritas: `renderConfiguracionEscala` rehace los campos vacíos, así que
// hay que devolverles su valor.
window.ajustarMaximoDeEscala = (max) => {
    const inp = document.getElementById('eval-max-scale');
    if (!inp || !Number.isFinite(parseFloat(max))) return;
    if (parseFloat(inp.value) === parseFloat(max)) return;

    const previas = {};
    document.querySelectorAll('#dynamic-labels-container input[id^="lbl-range-"]').forEach(el => {
        if (el.value.trim()) previas[el.id] = el.value;
    });

    inp.value = max;
    window.renderConfiguracionEscala();

    Object.keys(previas).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = previas[id];
    });
};

// Sin la columna en la base no se puede nombrar a nadie: se deja la casilla
// como está —revisa el jefe— y se dice por qué, en lugar de ofrecer un
// selector que no va a guardar nada.
window.avisarSiFaltaColumnaRevisores = async () => {
    const aviso = document.getElementById('aviso-revisores-no-disponible');
    const hay = await window.hayColumnaRevisores();
    if (aviso) aviso.style.display = hay ? 'none' : 'block';

    const chk = document.getElementById('chk-revisa-jefe');
    if (chk) {
        chk.disabled = !hay;
        if (!hay) {
            chk.checked = true;
            window.toggleSelectorPersonas('revisores');
        }
    }
};

// Sin las columnas en la base no se pueden apagar: se dejan marcadas y se dice
// por qué, igual que con los revisores.
window.avisarSiFaltaColumnaCertificacion = async () => {
    const aviso = document.getElementById('aviso-certificacion-no-disponible');
    const hay = await window.hayColumna('evaluations', 'requires_min_score');
    if (aviso) aviso.style.display = hay ? 'none' : 'block';

    const chkUmbral = document.getElementById('chk-eval-umbral');
    if (chkUmbral) {
        chkUmbral.disabled = !hay;
        if (!hay) chkUmbral.checked = true;
    }

    const filaUmbral = document.getElementById('opcion-umbral-certificacion');
    if (filaUmbral) filaUmbral.style.opacity = hay ? '1' : '0.45';

    const inpReintento = document.getElementById('eval-retry-days');
    const filaReintento = document.getElementById('fila-reintento');
    if (inpReintento) {
        inpReintento.disabled = !hay;
        if (!hay) inpReintento.value = 0;
    }
    if (filaReintento) filaReintento.style.opacity = hay ? '1' : '0.45';
};

// Lo que hay escrito en el campo «Aplica desde», como Date de medianoche local,
// o null si está vacío. `fechaDeRegistro` lo arma a mano porque
// `new Date('2026-03-01')` se lee en UTC y la zona horaria lo corre un día.
window.fechaDeVigenciaDeLaHoja = () => {
    const inp = document.getElementById('eval-vigente-desde');
    const valor = inp ? String(inp.value || '').trim() : '';
    if (!valor) return null;
    const fecha = window.fechaDeRegistro(valor);
    return (fecha && !isNaN(fecha)) ? fecha : null;
};

// Como se escribe en el renglón plegado del grupo: corta, que ahí compite con
// «Obligatoria · Exige 80% · Repetir en 3 días».
window.fechaCortaDeVigencia = (fecha) =>
    fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Sin la columna en la base no se puede cambiar la fecha: se deja vacía y se
// dice qué script falta, igual que con los revisores y el umbral. Mientras
// tanto manda `created_at`, que es lo de siempre.
window.avisarSiFaltaColumnaVigencia = async () => {
    const hay = await window.hayColumnaVigencia();
    const aviso = document.getElementById('aviso-vigencia-no-disponible');
    if (aviso) aviso.style.display = hay ? 'none' : 'block';

    const inp = document.getElementById('eval-vigente-desde');
    if (inp) {
        inp.disabled = !hay;
        if (!hay) inp.value = '';
    }
    const fila = document.getElementById('fila-vigencia');
    if (fila) fila.style.opacity = hay ? '1' : '0.45';
};

window.verificarRestriccionesModo = () => {
    const modeEl = document.getElementById('eval-mode-input');
    const mode = modeEl ? modeEl.value : 'self';
    const allTypeSelects = document.querySelectorAll('.inp-tipo');
    // Por id, y no por `button[onclick="agregarCampoPregunta()"]`: aquel
    // selector comparaba el atributo carácter a carácter y se rompía con sólo
    // reordenar el marcado del botón.
    const btnAddQuestion = document.getElementById('btn-agregar-pregunta');
    const rangeLabelsDiv = document.getElementById('div-rango-labels');

    if(rangeLabelsDiv) {
        const container = document.getElementById('dynamic-labels-container');
        if(container && container.children.length === 0) window.renderConfiguracionEscala();
    }

    if (mode === 'boss') {
        const maxVal = document.getElementById('eval-max-scale') ? document.getElementById('eval-max-scale').value : 5;

        // Esta encuesta se guarda ya calificada al enviarla, así que sólo
        // admite lo que se puede puntuar solo —la escala— y la evidencia, que
        // no puntúa: es la constancia de lo que el jefe vio mientras evaluaba.
        // Un texto o unas opciones se quedarían sin calificar y sin nadie que
        // los revisara, porque la respuesta ya nace revisada.
        //
        // Se apagan las opciones que no valen en vez de bloquear el desplegable
        // entero, que es lo que antes dejaba «Rango Numérico» como única salida.
        allTypeSelects.forEach(sel => {
            Array.from(sel.options).forEach(op => {
                op.disabled = !window.TIPOS_EN_MODO_JEFE.includes(op.value);
            });
            sel.disabled = false;
            if (!window.TIPOS_EN_MODO_JEFE.includes(sel.value)) sel.value = 'range';
            window.toggleTipoPregunta(sel);
        });
        window.textoBoton(btnAddQuestion, `+ Agregar Pregunta (escala 1-${maxVal}, evidencia o firma)`);
    } else {
        allTypeSelects.forEach(sel => {
            Array.from(sel.options).forEach(op => { op.disabled = false; });
            sel.disabled = false;
        });
        window.textoBoton(btnAddQuestion, "+ Agregar Pregunta");
    }

    // La que contesta el jefe llega ya calificada —`4-evaluaciones-base.js` la
    // guarda como 'Revisado' al enviarla—, así que no hay nada que repartir y
    // el bloque de revisores sobra.
    const esModoJefe = (mode === 'boss');
    ['grupo-revisores', 'grupo-revisores-cuerpo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = esModoJefe ? 'none' : '';
    });
};

// ==========================================
// LAS CLASIFICACIONES QUE YA EXISTEN
// ==========================================
// La clasificación es texto libre —no hay catálogo—, así que el campo se
// escribe. Lo que hacía falta es poder ver las que ya hay: escribir «Juntas»
// donde el resto de la empresa puso «Junta» parte el grupo en dos, y ni las
// actas, ni los revisores heredados, ni la certificación se enteran.
//
// Lo enseñaba un `datalist`, que es justo lo que no se ve en el teléfono con
// el que se usa esto: Safari en iOS lo despacha con una tira minúscula sobre
// el teclado, cuando la enseña. Va como la lista de tipos de pregunta y por
// lo mismo —desplegada dentro del formulario que ya está abierto, no en otra
// hoja, que apilar una sobre `#modal-crear-eval` deja dos tiradores a la
// vista—.
//
// Cada una dice cuántas encuestas lleva: es lo que separa la clasificación de
// la casa del error de dedo que alguien dejó una vez.
window.clasificacionesExistentes = [];

// Para buscar, no para comparar: `normalizarClasificacion` es quien decide si
// dos nombres son el mismo, y ésa no quita acentos —tampoco debe—. Aquí sí,
// que nadie escribe «capacitación» con acento en un buscador.
const claveDeBusqueda = (texto) => String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/\s+/g, ' ');

// Lo tecleado desde que se abrió la lista, que no es lo mismo que lo que hay
// en el campo: al crear una encuesta el campo llega con «General» puesto, y
// eso es una elección y no una búsqueda —filtrando por ella, abrir la lista
// enseñaba una fila o ninguna—. En `null` no se filtra nada.
window.filtroClasificaciones = null;

window.listaDeClasificacionesHTML = () => {
    const input = document.getElementById('eval-category-input');
    const escrito = input ? String(input.value || '').trim() : '';
    const todas = window.clasificacionesExistentes || [];

    if (todas.length === 0) {
        return `<div class="clasificaciones-vacio">Todavía no hay ninguna clasificación. La que escribas será la primera.</div>`;
    }

    // Se filtra por lo tecleado: con veinte clasificaciones, recorrer la lista
    // entera es lo que el campo de texto ya ahorraba.
    const filtro = window.filtroClasificaciones;
    const buscado = filtro === null ? '' : claveDeBusqueda(filtro);
    const vistas = buscado
        ? todas.filter(c => claveDeBusqueda(c.nombre).includes(buscado))
        : todas;

    if (vistas.length === 0) {
        return `<div class="clasificaciones-vacio">Ninguna de las ${todas.length} que existen se llama «${window.sanitizeForHTML(String(filtro).trim())}»: al guardar se creará como clasificación nueva.</div>`;
    }

    // Con el campo vacío la encuesta se guarda como «General», así que ésa es
    // la que está elegida —es lo que hace `guardarNuevaEvaluacion`—.
    const clave = window.normalizarClasificacion(escrito);
    return vistas.map(c => {
        const elegida = window.normalizarClasificacion(c.nombre) === clave;
        // El nombre viaja en un `data-` y no dentro del `onclick`: es texto
        // libre y puede traer comillas.
        return `<button type="button" class="clasificacion-opcion${elegida ? ' es-elegida' : ''}"
                        ${elegida ? 'aria-current="true"' : ''}
                        data-nombre="${window.sanitizeForHTML(c.nombre)}"
                        onclick="window.elegirClasificacion(this)">
            <span class="clasificacion-opcion-nombre">${window.sanitizeForHTML(c.nombre)}</span>
            <span class="clasificacion-opcion-cuantas">${c.cuantas} encuesta${c.cuantas === 1 ? '' : 's'}</span>
            <span class="clasificacion-opcion-marca" aria-hidden="true">${elegida ? '✓' : ''}</span>
        </button>`;
    }).join('');
};

// La lista se rehace cada vez que se abre y con cada letra que se escribe: lo
// que enseña depende de lo que haya en el campo.
window.pintarListaClasificaciones = () => {
    const lista = document.getElementById('lista-clasificaciones');
    if (!lista || lista.hidden) return;
    lista.innerHTML = window.listaDeClasificacionesHTML();
};

window.alternarClasificaciones = (abrir) => {
    const lista = document.getElementById('lista-clasificaciones');
    const btn = document.getElementById('btn-clasificaciones');
    if (!lista) return;

    const abrirla = abrir === undefined ? lista.hidden : !!abrir;
    lista.hidden = !abrirla;
    // Se abre entera: lo que hubiera en el campo es lo elegido, no una
    // búsqueda. Se filtra a partir de la primera letra que se escriba.
    window.filtroClasificaciones = null;
    if (abrirla) {
        lista.innerHTML = window.listaDeClasificacionesHTML();
        // La suya, a la vista: con veinte clasificaciones la elegida puede
        // quedar debajo del tope de altura. Se mueve el scroll de la lista y no
        // con `scrollIntoView`, que arrastraría también el cuerpo de la hoja.
        const elegida = lista.querySelector('.clasificacion-opcion.es-elegida');
        if (elegida) {
            lista.scrollTop = Math.max(0,
                elegida.offsetTop - (lista.clientHeight - elegida.offsetHeight) / 2);
        }
    } else {
        lista.innerHTML = '';
    }
    if (btn) btn.setAttribute('aria-expanded', abrirla ? 'true' : 'false');
};

window.elegirClasificacion = (el) => {
    const input = document.getElementById('eval-category-input');
    if (!input) return;

    input.value = el.dataset.nombre || '';
    window.alternarClasificaciones(false);
    // Poner `.value` a mano no dispara el `oninput`, y de este campo cuelga la
    // nota de quién hereda la revisión. El renglón del grupo «Datos» sí se
    // rehace solo: el `click` de este botón burbujea hasta el oyente de la
    // hoja.
    window.pintarNotaRevisoresClasificacion();
};

window.prepararInputCategorias = async (currentValue = '') => {
    const input = document.getElementById('eval-category-input');
    if (input) {
        input.value = currentValue;
        window.alternarClasificaciones(false);
        // De qué clasificación se heredan los revisores lo dice este campo, así
        // que la nota del bloque de revisores se rehace con cada letra, y con
        // ella lo que la lista deja ver.
        input.oninput = () => {
            window.filtroClasificaciones = input.value;
            window.pintarNotaRevisoresClasificacion();
            window.pintarListaClasificaciones();
        };
        window.pintarNotaRevisoresClasificacion();

        // Quien crea sin ser administrador sólo puede hacerlo en la
        // clasificación que revisa, así que ahí el campo no se toca: si se
        // pudiera cambiar, el permiso sería decorativo. La comprobación de
        // verdad la hace `guardarNuevaEvaluacion`; esto es sólo la pantalla.
        const fija = String(window.clasificacionFijaParaCrear || '').trim();
        input.disabled = !!fija;
        input.style.opacity = fija ? '0.6' : '';
        // Sin el botón no se esconde nada: con el campo bloqueado, elegir otra
        // de la lista sería el mismo permiso decorativo por otra puerta.
        const btnLista = document.getElementById('btn-clasificaciones');
        if (btnLista) btnLista.hidden = !!fija;
        const nota = document.getElementById('nota-clasificacion-fija');
        if (nota) {
            nota.style.display = fija ? 'block' : 'none';
            nota.innerText = fija
                ? `Puedes crear encuestas en «${fija}» porque la revisas. Para otra clasificación, pídeselo al administrador.`
                : '';
        }
        // Se cuentan las encuestas de cada una por su nombre normalizado —que
        // es quien decide si dos son la misma— y se enseña el nombre tal como
        // está escrito en la primera que aparece.
        const { data } = await sb.from('evaluations').select('category');
        if (data) {
            const porClave = new Map();
            data.forEach(fila => {
                const nombre = String(fila.category || '').trim();
                if (!nombre) return;
                const clave = window.normalizarClasificacion(nombre);
                const ya = porClave.get(clave);
                if (ya) ya.cuantas++;
                else porClave.set(clave, { nombre, cuantas: 1 });
            });
            window.clasificacionesExistentes = [...porClave.values()]
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
            // La consulta llega después de que la hoja esté a la vista, así que
            // si a alguien le dio tiempo de abrir la lista hay que rehacerla.
            window.pintarListaClasificaciones();
        }
    }
};

window.renderizarSelectorPuestos = async (seleccionados = null) => {
    const container = document.getElementById('container-lista-puestos');
    const chkAll = document.getElementById('chk-all-puestos');
    
    if (!container) return;

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#64748b;">Cargando lista de puestos...</div>';
        if (window.cargarDatosEmpleados) {
            await window.cargarDatosEmpleados();
        }
    }

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#ef4444;">No hay empleados registrados.</div>';
        return;
    }

    container.innerHTML = '';

    const rawPuestos = window.todosLosEmpleadosData.map(e => {
        const p = e.puesto || e.Puesto || e.job || e.position;
        return p ? p.trim() : "Sin Puesto";
    });
    const uniquePuestos = [...new Set(rawPuestos)].sort();

    const isAll = (seleccionados === null || (Array.isArray(seleccionados) && seleccionados.includes('ALL')) || (Array.isArray(seleccionados) && seleccionados.length === 0));
    
    if(chkAll) {
        chkAll.checked = isAll;
        window.toggleSelectorPuestos();
    }

    uniquePuestos.forEach(puesto => {
        if(!puesto) return;
        
        const isChecked = !isAll && Array.isArray(seleccionados) && seleccionados.includes(puesto);

        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f8fafc;";
        div.innerHTML = `
            <input type="checkbox" class="chk-puesto-item" value="${puesto}" ${isChecked ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
            <span style="font-size:0.9rem; color:#475569;">${puesto}</span>
        `;
        container.appendChild(div);
    });
};

window.toggleSelectorPuestos = () => {
    const chkAll = document.getElementById('chk-all-puestos');
    const container = document.getElementById('container-lista-puestos');
    if (chkAll.checked) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
    }
};

window.renderizarSelectorDeptos = async (seleccionados = null) => {
    const container = document.getElementById('container-lista-deptos');
    const chkAll = document.getElementById('chk-all-deptos');
    if (!container) return;

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#64748b;">Cargando lista de departamentos...</div>';
        if (window.cargarDatosEmpleados) {
            await window.cargarDatosEmpleados();
        }
    }

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#ef4444;">No hay empleados registrados.</div>';
        return;
    }

    container.innerHTML = '';

    const rawDeptos = window.todosLosEmpleadosData.map(e => {
        const d = e.department || e.dept;
        return d ? d.trim() : "GENERAL";
    });
    const uniqueDeptos = [...new Set(rawDeptos)].sort();

    const isAll = (seleccionados === null || (Array.isArray(seleccionados) && seleccionados.includes('ALL')) || (Array.isArray(seleccionados) && seleccionados.length === 0));
    
    if(chkAll) {
        chkAll.checked = isAll;
        window.toggleSelectorDeptos();
    }

    uniqueDeptos.forEach(depto => {
        if(!depto) return;
        const isChecked = !isAll && Array.isArray(seleccionados) && seleccionados.includes(depto);
        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f8fafc;";
        div.innerHTML = `
            <input type="checkbox" class="chk-depto-item" value="${depto}" ${isChecked ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
            <span style="font-size:0.9rem; color:#475569;">${depto}</span>
        `;
        container.appendChild(div);
    });
};

window.toggleSelectorDeptos = () => {
    const chkAll = document.getElementById('chk-all-deptos');
    const container = document.getElementById('container-lista-deptos');
    if (chkAll.checked) {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
    }
};

window.abrirModalCrearEval = async (categoria) => {
    // De la clasificación se heredan los revisores, y el bloque de revisores lo
    // dice; la nota se pinta sin poder esperar, así que la caché va antes.
    window.cargarRevisoresDeClasificaciones();
    window.idEditandoEval = null;
    window.editandoSoloDestinatarios = false;
    window.aplicarModoSoloDestinatarios(false);
    document.getElementById('eval-title-input').value = '';
    
    const descInput = document.getElementById('eval-desc-input');
    if(descInput) descInput.value = '';
    const freqInput = document.getElementById('eval-frequency-input');
    if(freqInput) freqInput.value = 'once';

    const maxInput = document.getElementById('eval-max-scale');
        if(maxInput) maxInput.value = 5;
        window.renderConfiguracionEscala();
        
    const chkHalf = document.getElementById('eval-half-points');
    if(chkHalf) chkHalf.checked = false;
        
    await window.renderizarSelectorPuestos(null);
    await window.renderizarSelectorDeptos(null);
    
    const chkOblig = document.getElementById('chk-eval-obligatoria');
    if(chkOblig) chkOblig.checked = true;
    
    const chkArea = document.getElementById('chk-eval-por-area');
    if(chkArea) chkArea.checked = false;

    const chkActiva = document.getElementById('chk-eval-activa');
    if(chkActiva) chkActiva.checked = true;

    const chkUmbral = document.getElementById('chk-eval-umbral');
    if(chkUmbral) chkUmbral.checked = true;
    const inpReintento = document.getElementById('eval-retry-days');
    if(inpReintento) inpReintento.value = 0;
    const inpVigencia = document.getElementById('eval-vigente-desde');
    if(inpVigencia) inpVigencia.value = '';
    await window.avisarSiFaltaColumnaCertificacion();
    await window.avisarSiFaltaColumnaVigencia();

    window.encuestaEnEdicion = null;
    window.asignacionesEnEdicion = {};
    window.prepararSelectorPersonas('destinatarios', null);
        window.prepararSelectorPersonas('revisores', null);
        await window.avisarSiFaltaColumnaRevisores();
        await window.avisarSiFaltaColumnaAsignador();

        await window.prepararInputCategorias(String(categoria || '').trim() || 'General');
        const modeInput = document.getElementById('eval-mode-input');
    if(modeInput) { modeInput.value = 'self'; modeInput.onchange = window.verificarRestriccionesModo; }
    document.getElementById('questions-container').innerHTML = '';
    window.agregarCampoPregunta();
    // Todavía no hay encuesta a la que colgarle un archivo: la sección se queda
    // vacía diciendo que hay que publicarla primero.
    window.prepararMaterialEnEdicion(null);
    window.prepararEncabezadoEval(false);
    window.pintarResumenGrupos();
    document.getElementById('modal-crear-eval').style.display = 'flex';
    window.verificarRestriccionesModo();
};

// El segundo argumento la abre restringida: sólo el bloque de destinatarios,
// que es lo que puede tocar un revisor. Entra por ahí
// `window.editarDestinatariosEncuesta`, que además comprueba el permiso.
//
// El tercero la abre **como copia**: se llena con todo lo de la encuesta base
// pero la hoja no está editando ninguna, así que al guardar se inserta una
// nueva. Dos cosas lo sostienen, y las dos tienen que ir juntas:
//
//   - `idEditandoEval` se queda en null, que es lo que decide `insert` en vez
//     de `update` en `guardarNuevaEvaluacion`.
//   - **Las preguntas se montan sin su `data-id`**, que es lo que decide lo
//     mismo para cada una. Y no es sólo eso: una tarjeta con id lleva el botón
//     «🗑️ Eliminar», que borra esa pregunta **de la base**, o sea de la
//     encuesta original. En una copia eso sería destruir lo que se está
//     copiando.
// El nombre con el que nace una copia: el de la encuesta base y **la fecha de
// hoy** entre paréntesis. Antes decía «(copia)», que no distingue una de otra
// —la auditoría se repite cada mes y todas se llamarían igual— y encima envejece
// mal: al año siguiente la lista tiene cuatro «(copia)» sin decir de cuándo.
//
// Si el título ya traía una fecha suya —copiar una copia es lo normal aquí—, se
// **sustituye** en vez de encadenarse, o acabaría en «Junta (08/09/26)
// (09/10/26)». También se recoge el «(copia)» de las que ya se crearon así.
window.tituloDeCopia = (titulo, fecha) => {
    const d = (fecha instanceof Date && !isNaN(fecha)) ? fecha : new Date();
    const sello = d.toLocaleDateString('es-ES',
        { day: '2-digit', month: '2-digit', year: '2-digit' });

    const base = String(titulo || '').trim()
        .replace(/\s*\((?:copia|\d{2}\/\d{2}\/\d{2})\)\s*$/i, '')
        .trim();

    return `${base} (${sello})`;
};

window.editarEvaluacion = async (id, soloDestinatarios = false, comoCopia = false) => {
    // Los revisores que hereda de su clasificación se dicen en el bloque de
    // revisores, y esa nota se pinta sin poder esperar.
    window.cargarRevisoresDeClasificaciones();

    // Abrir una encuesta que ya existe suelta la clasificación: la marca es de
    // quien está creando. Una copia sí la conserva —copiar también es crear— y
    // por eso la puso `abrirNuevaEvaluacion` antes de llegar aquí.
    if (!comoCopia) window.clasificacionFijaParaCrear = '';

    let evaluacion = null;
    if (window.evalCache && window.evalCache.evals) {
        evaluacion = window.evalCache.evals.find(e => e.id === id);
    }
    if (!evaluacion) {
        const { data } = await sb.from('evaluations').select('*').eq('id', id).single();
        evaluacion = data;
    }
    if (!evaluacion) { alert("Error: No se encontró la evaluación."); return; }

    window.idEditandoEval = comoCopia ? null : id;
    window.editandoSoloDestinatarios = soloDestinatarios;
    window.aplicarModoSoloDestinatarios(soloDestinatarios);
    // Antes de tocar la escala: prepararEncabezadoEval la deja plegada y el
    // bloque de range_labels de más abajo la vuelve a abrir si hay etiquetas.
    window.prepararEncabezadoEval(!comoCopia, soloDestinatarios);

    // El material es de la encuesta que ya existe: una copia todavía no es
    // ninguna fila y el revisor que corrige a quién va dirigida tiene la
    // sección escondida, así que en los dos casos se limpia. Va sin `await`
    // —consulta la tabla y repinta su hueco cuando llega— para no retrasar el
    // resto de la hoja.
    window.prepararMaterialEnEdicion((!comoCopia && !soloDestinatarios) ? id : null);
    // Una copia nace con el nombre marcado: dos encuestas con el mismo título
    // en la misma clasificación no hay quien las distinga en ninguna lista.
    document.getElementById('eval-title-input').value = comoCopia
        ? window.tituloDeCopia(evaluacion.title)
        : evaluacion.title;

    const descInput = document.getElementById('eval-desc-input');
    if(descInput) descInput.value = evaluacion.description || '';
    const freqInput = document.getElementById('eval-frequency-input');
    if(freqInput) freqInput.value = evaluacion.frequency || 'once';

    let targetPositions = null;
    if (evaluacion.target_positions) {
        targetPositions = typeof evaluacion.target_positions === 'string'
            ? JSON.parse(evaluacion.target_positions)
            : evaluacion.target_positions;
    }
    await window.renderizarSelectorPuestos(targetPositions);

    let targetDepartments = null;
        if (evaluacion.target_departments) {
            targetDepartments = typeof evaluacion.target_departments === 'string'
                ? JSON.parse(evaluacion.target_departments)
                : evaluacion.target_departments;
        }
        await window.renderizarSelectorDeptos(targetDepartments);

        let targetEmployeesData = null;
        if (evaluacion.target_employees) {
            try {
                targetEmployeesData = typeof evaluacion.target_employees === 'string'
                    ? JSON.parse(evaluacion.target_employees)
                    : evaluacion.target_employees;
            } catch (e) { targetEmployeesData = null; }
        }
        // Antes de pintar las fichas: cada una dice quién asignó a esa
        // persona, y eso se lee de aquí.
        window.encuestaEnEdicion = evaluacion;
        window.asignacionesEnEdicion = { ...window.asignacionesDeEncuesta(evaluacion) };
        window.prepararSelectorPersonas('destinatarios', targetEmployeesData);

        // Un revisor sólo cambia a quién va dirigida: el resto de la hoja está
        // escondido, así que no hay nada más que llenar y el cuestionario ni se
        // le pide a la base. El subtítulo lleva el título de la encuesta porque
        // el campo que lo dice se queda fuera de la vista en este modo.
        if (soloDestinatarios) {
            const subtituloHoja = document.getElementById('subtitulo-crear-eval');
            if (subtituloHoja) subtituloHoja.innerText = evaluacion.title || '';
            // Las fichas se pintaron antes de que `editandoSoloDestinatarios`
            // pudiera decir de dónde salen los revisores, así que los sellos se
            // vuelven a pintar ya con esa respuesta.
            window.pintarPersonasEval('destinatarios');
            await window.avisarSiFaltaColumnaAsignador();
            window.pintarResumenGrupos();
            document.getElementById('modal-crear-eval').style.display = 'flex';
            return;
        }

        // Aquí van los revisores **propios**, no los efectivos: los de la
        // clasificación se heredan, y meterlos en el selector los escribiría en
        // la columna de esta encuesta al guardar, congelándolos —dejaría de
        // seguir a su clasificación con sólo abrir la hoja y guardar—.
        window.prepararSelectorPersonas('revisores', window.revisoresPropiosDeEncuesta(evaluacion));
        // Un sello sólo se enseña si quien asignó sigue siendo revisor, y eso
        // no se sabía hasta tener el selector de revisores puesto.
        window.pintarPersonasEval('destinatarios');
        await window.avisarSiFaltaColumnaRevisores();
        await window.avisarSiFaltaColumnaAsignador();

        const chkOblig = document.getElementById('chk-eval-obligatoria');
    if(chkOblig) {
        chkOblig.checked = (evaluacion.is_obligatory !== false);
    }
    
    const chkArea = document.getElementById('chk-eval-por-area');
    if(chkArea) { chkArea.checked = (evaluacion.evaluates_area === true); }

    const chkActiva = document.getElementById('chk-eval-activa');
    if(chkActiva) { chkActiva.checked = window.encuestaActiva(evaluacion); }

    const chkUmbral = document.getElementById('chk-eval-umbral');
    if(chkUmbral) { chkUmbral.checked = window.exigeMinimo(evaluacion); }
    const inpReintento = document.getElementById('eval-retry-days');
    if(inpReintento) { inpReintento.value = window.diasDeReintento(evaluacion); }
    // **Una copia no hereda la fecha de vigencia**, y es lo mismo que hace con
    // el título: la copia es la vuelta de este mes, no la del año pasado, así
    // que arrastrarle aquella fecha la metería en periodos que no son suyos.
    // Vacía vuelve a significar «desde que se cree», que para una copia es hoy.
    const inpVigencia = document.getElementById('eval-vigente-desde');
    if(inpVigencia) {
        const desde = (!comoCopia && evaluacion.vigente_desde) ? new Date(evaluacion.vigente_desde) : null;
        inpVigencia.value = (desde && !isNaN(desde))
            ? window.valorLocalDeFecha(desde).split('T')[0] : '';
    }
    await window.avisarSiFaltaColumnaCertificacion();
    await window.avisarSiFaltaColumnaVigencia();

    await window.prepararInputCategorias(evaluacion.category || 'General');

    let maxScale = 5;
    if(evaluacion.range_labels) {
        let labels = {};
        if(typeof evaluacion.range_labels === 'string') { try { labels = JSON.parse(evaluacion.range_labels); } catch(e){} }
        else { labels = evaluacion.range_labels; }
        const keys = Object.keys(labels).map(Number).filter(n => !isNaN(n));
                if(keys.length > 0) maxScale = Math.max(...keys);
                const maxInput = document.getElementById('eval-max-scale');
                if(maxInput) maxInput.value = maxScale;
                window.renderConfiguracionEscala();
                for(let i=0; i<=maxScale; i++) { const el = document.getElementById(`lbl-range-${i}`); if(el) el.value = labels[i] || ''; }
                // Ya hay etiquetas puestas: se despliega para que se vean.
                const escalaConEtiquetas = document.getElementById('div-rango-labels');
                if(escalaConEtiquetas && keys.length > 0) escalaConEtiquetas.open = true;
            } else {
        const maxInput = document.getElementById('eval-max-scale');
        if(maxInput) maxInput.value = 5;
        window.renderConfiguracionEscala();
    }

    const modeInput = document.getElementById('eval-mode-input');
    if(modeInput) {
        modeInput.value = evaluacion.mode || 'self';
        modeInput.onchange = window.verificarRestriccionesModo;
    }

    const container = document.getElementById('questions-container');
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Cargando preguntas...</div>';
    document.getElementById('modal-crear-eval').style.display = 'flex';

    const { data: qs, error } = await sb.from('evaluation_questions').select('*').eq('evaluation_id', id).order('order_index', { ascending: true });
        container.innerHTML = '';
        if (error) { alert("Error cargando preguntas"); return; }

        // La escala con la que se guardaron las preguntas manda sobre lo que
        // dijeran las etiquetas: `range_labels` es opcional y sin ellas el
        // máximo se quedaba en 5, de modo que guardar una encuesta del 0 al 8
        // la encogía sin avisar —y ahora, además, dejaría fuera los recuadros
        // de guía de los valores perdidos—.
        let hasHalfPoints = false, maxDeLasPreguntas = null;
        if (qs && qs.length > 0) {
            const rangeQ = qs.find(q => q.question_type === 'range');
            if (rangeQ) {
                const opts = window.opcionesDePregunta(rangeQ);
                if (opts.length > 2 && String(opts[2]) === '0.5') hasHalfPoints = true;
                const max = parseFloat(opts[1]);
                if (!isNaN(max) && max > 0) maxDeLasPreguntas = max;
            }
        }
        const chkHalfPoints = document.getElementById('eval-half-points');
        if(chkHalfPoints) chkHalfPoints.checked = hasHalfPoints;
        if (maxDeLasPreguntas !== null) window.ajustarMaximoDeEscala(maxDeLasPreguntas);

        if (qs && qs.length > 0) {
            qs.forEach(q => {
            let opts = q.options;
            if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e) { opts = []; } }
            if (q.question_type === 'list_match') {
                try { const parsed = JSON.parse(q.correct_answer_text); if (Array.isArray(parsed)) opts = parsed; } catch(e) { if (q.correct_answer_text) { opts = q.correct_answer_text.split(/\n|,/).map(s=>s.trim()).filter(s=>s!==""); } }
            }
            window.agregarCampoPregunta(q.question_text, q.correct_answer_text,
                comoCopia ? null : q.id, q.question_type, opts);
        });
    } else { window.agregarCampoPregunta(); }
    // Las preguntas llegan de una consulta posterior a enseñar la hoja, y su
    // resumen las cuenta: sin este repintado diría «Ninguna todavía».
    window.pintarResumenGrupos();
    setTimeout(window.verificarRestriccionesModo, 50);
};

// La puerta del revisor a la hoja de edición. Abre la misma hoja con todo
// escondido salvo «A quién va dirigida», que es lo único que puede cambiar
// quien imparte la encuesta sin ser administrador.
//
// La encuesta se pide con `window.encuestaDeLaRespuesta`, que es la que ya
// sabe traerla con sus revisores aguantando que la columna no exista todavía;
// aquí sólo hace falta para comprobar el permiso, y la hoja se la vuelve a
// buscar entera.
window.editarDestinatariosEncuesta = async (id) => {
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const evaluacion = await window.encuestaDeLaRespuesta(id);
    if (!evaluacion) { alert("Error: No se encontró la evaluación."); return; }

    if (!window.modoAdminActivo && !(user && window.puedeEditarDestinatarios(evaluacion, user.id))) {
        alert("Sólo quien revisa esta encuesta puede cambiar a quién va dirigida.");
        return;
    }

    // Las dos hojas comparten z-index, así que con la lista abierta la de
    // edición se quedaría detrás y sin manera de tocarla: manda el orden del
    // documento. Los botones que llaman aquí ya la cierran —así no hay
    // fotograma con las dos a la vista—, y esto es la red de seguridad.
    if (window.cerrarModalEvaluaciones) window.cerrarModalEvaluaciones();

    await window.editarEvaluacion(id, true);
};

// ==========================================
// DE DÓNDE SALE UNA ENCUESTA NUEVA
// ==========================================
// Dos caminos: desde cero o copiando una que ya existe. Copiar es lo normal
// cuando una clasificación ya tiene su forma —la misma escala, las mismas
// preguntas, la misma gente— y volver a escribirla entera es donde se cuelan
// las diferencias que después no cuadran al comparar periodos.
//
// La clasificación con la que se entró se guarda aquí y no se escapa en ningún
// atributo: es texto libre y puede traer comillas.
window.categoriaParaNuevaEncuesta = '';

window.cerrarOrigenDeEncuesta = () => {
    const overlay = document.getElementById('modal-origen-encuesta');
    if (!overlay) return;
    overlay.style.display = 'none';
    const cuerpo = document.getElementById('cuerpo-origen-encuesta');
    if (cuerpo) cuerpo.innerHTML = '';
};

window.crearEncuestaDesdeCero = () => {
    const categoria = window.categoriaParaNuevaEncuesta;
    window.cerrarOrigenDeEncuesta();
    if (window.abrirModalCrearEval) window.abrirModalCrearEval(categoria);
};

window.crearEncuestaComoCopia = async (id) => {
    window.cerrarOrigenDeEncuesta();
    if (window.editarEvaluacion) await window.editarEvaluacion(id, false, true);
};

window.abrirOrigenDeEncuesta = async (categoria) => {
    const overlay = document.getElementById('modal-origen-encuesta');
    const cuerpo = document.getElementById('cuerpo-origen-encuesta');
    const alaHoja = () => { if (window.abrirModalCrearEval) window.abrirModalCrearEval(categoria); };
    if (!overlay || !cuerpo) return alaHoja();

    window.categoriaParaNuevaEncuesta = categoria || '';
    const clave = window.normalizarClasificacion(categoria || '');

    // Se traen todas y se filtra aquí: la clasificación es texto libre y quien
    // decide si dos nombres son el mismo es `normalizarClasificacion`, no la
    // base. Las apagadas entran —copiar una encuesta retirada es de las razones
    // para tenerla guardada—.
    let candidatas = [];
    try {
        const { data } = await sb.from('evaluations')
            .select('id, title, category, frequency, active')
            .order('title');
        candidatas = (data || []).filter(ev =>
            !clave || window.normalizarClasificacion(ev.category) === clave);
    } catch (e) {
        console.warn('No se pudieron traer las encuestas para copiar:', e.message);
    }

    // Sin ninguna que copiar no hay dos caminos que ofrecer: se entra derecho a
    // la hoja, que es lo que hacía el botón antes de que existiera esta.
    if (candidatas.length === 0) return alaHoja();

    const sub = document.getElementById('subtitulo-origen-encuesta');
    if (sub) sub.innerText = categoria ? `En ${categoria}` : 'De cualquier clasificación';

    const filas = candidatas.map(ev => {
        const ritmo = window.textoDeFrecuencia ? window.textoDeFrecuencia(ev.frequency) : '';
        const apagada = !window.encuestaActiva(ev)
            ? ' · <span style="color:#94a3b8; font-weight:700;">Inactiva</span>' : '';
        const clasif = clave ? '' : ` · ${window.sanitizeForHTML(ev.category || 'General')}`;
        return `
            <div onclick="window.crearEncuestaComoCopia('${String(ev.id).replace(/'/g, "&apos;")}')"
                 style="display:flex; align-items:center; gap:12px; padding:12px 4px; border-top:1px solid #f1f5f9; cursor:pointer;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:#1e293b; font-size:0.95rem; line-height:1.25;">${window.sanitizeForHTML(ev.title || 'Sin título')}</div>
                    <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">${window.sanitizeForHTML(ritmo)}${clasif}${apagada}</div>
                </div>
                <span style="color:#cbd5e1; font-size:1.3rem; line-height:1; flex-shrink:0;">&rsaquo;</span>
            </div>`;
    }).join('');

    cuerpo.innerHTML = `
        <button onclick="window.crearEncuestaDesdeCero()"
                style="width:100%; padding:14px 20px; background:#2563eb; color:white; border:none; border-radius:12px; cursor:pointer; font-weight:bold; font-size:1rem;">
            Empezar desde cero
        </button>
        <div style="margin:22px 0 2px; font-size:0.8rem; color:#334155; font-weight:700;">O usar una como base</div>
        <div style="font-size:0.75rem; color:#94a3b8; margin-bottom:6px;">Se copian sus preguntas, su escala y a quién va dirigida. La original no se toca.</div>
        ${filas}`;

    overlay.style.display = 'flex';
};

window.agregarCampoPregunta = (t="",c="",id=null,tp="text",op=[]) => {
    const modeEl = document.getElementById('eval-mode-input');
    const isBoss = modeEl && modeEl.value === 'boss';

    const d=document.createElement('div'); d.className="pregunta-wrapper"; if(id)d.setAttribute('data-id',id);
    d.style.cssText="margin-bottom:20px;background:#f9fafb;padding:15px;border-radius:12px;border:1px solid #e2e8f0;";
    
    const btnDeleteHTML = id
        ? `<button onclick="borrarPreguntaDB('${id}', this)" style="margin-left:auto; color:red; border:none; background:#fee2e2; padding:4px 8px; border-radius:4px; cursor:pointer;" title="Borrar de la base de datos">🗑️ Eliminar</button>`
        : `<button onclick="this.closest('.pregunta-wrapper').remove(); window.renumerarPreguntas();" style="margin-left:auto; color:#64748b; border:none; cursor:pointer;">✕ Quitar</button>`;

    // La guía de una escala viaja en la cuarta posición de `options`; el resto
    // de los tipos no la tienen y el bloque va escondido. Los recuadros se
    // dibujan más abajo, cuando la tarjeta ya está en el documento: cuántos son
    // depende del máximo y de los puntos medios, que se leen de la hoja.
    const guiaGuardada = (tp === 'range') ? op[window.PLAZA_GUIA_ESCALA] : null;

    const showTextContainer = (tp === 'text');
    const showOptionsContainer = (tp === 'multiple' || tp === 'checklist' || tp === 'list_match');
    const showRangeInfo = (tp === 'range');
    const showPhotoInfo = (tp === 'photo');
    const showAttendanceInfo = (tp === window.TIPO_PREGUNTA_ASISTENCIA);
    const showSignatureInfo = (tp === window.TIPO_PREGUNTA_FIRMA);
    const optionsLabel = (tp === 'list_match') ? "Elementos Correctos (Respuesta Modelo):" : "Opciones:";

    d.innerHTML=`
    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        <span class="pregunta-numero" style="flex-shrink:0; width:24px; height:24px; border-radius:50%; background:#e2e8f0; color:#475569; font-size:0.8rem; font-weight:700; display:flex; align-items:center; justify-content:center;"></span>
        <button type="button" onclick="window.moverPregunta(this, -1)" class="mover-pregunta" title="Subir" aria-label="Subir esta pregunta" style="flex-shrink:0; width:30px; height:30px; border:1px solid #cbd5e1; background:white; color:#475569; border-radius:8px; cursor:pointer; font-size:0.9rem; line-height:1; padding:0;">↑</button>
        <button type="button" onclick="window.moverPregunta(this, 1)" class="mover-pregunta" title="Bajar" aria-label="Bajar esta pregunta" style="flex-shrink:0; width:30px; height:30px; border:1px solid #cbd5e1; background:white; color:#475569; border-radius:8px; cursor:pointer; font-size:0.9rem; line-height:1; padding:0;">↓</button>
        <select class="inp-tipo" style="display:none;" onchange="window.toggleTipoPregunta(this)" ${isBoss ? 'disabled' : ''}>
            ${window.TIPOS_DE_PREGUNTA.map(t => `<option value="${t.valor}" ${tp === t.valor ? 'selected' : ''}>${t.nombre}</option>`).join('')}
        </select>
        ${btnDeleteHTML}
    </div>
    <button type="button" class="tipo-pregunta-boton" onclick="window.alternarTiposPregunta(this)" aria-expanded="false"></button>
    <div class="tipos-pregunta" hidden></div>
    <input type="text" class="inp-pregunta" value="${t}" placeholder="${window.enunciadoDeTipo(tp)}" style="width:100%;padding:10px; border:1px solid #cbd5e1; border-radius:6px;">
    
    <div class="options-container" style="display:${showOptionsContainer?'block':'none'};margin-top:10px;">
        <label class="lbl-options" style="font-size:0.8rem; color:#64748b; margin-bottom:5px; display:block;">${optionsLabel}</label>
        <div class="ayuda-correctas" style="display:none; font-size:0.75rem; color:#16a34a; background:#f0fdf4; border:1px dashed #bbf7d0; border-radius:8px; padding:8px 10px; margin-bottom:8px;"></div>
        <div class="dynamic-options-list"></div>
        <button onclick="window.agregarInputOpcion(this.parentElement.querySelector('.dynamic-options-list'))" style="margin-top:5px; cursor:pointer; color:#2563eb; background:none; border:none; font-weight:bold;">+ Agregar Elemento</button>
    </div>
    
    <div class="text-container" style="display:${showTextContainer?'block':'none'};margin-top:10px;">
        <label style="font-size:0.8rem; color:#64748b; margin-bottom:3px; display:block;">Respuesta Modelo (Opcional):</label>
        <textarea class="inp-respuesta-correcta-text" placeholder='Texto esperado...' style="width:100%; padding:8px; border:1px solid #94a3b8; border-radius:6px; background:#f0f9ff; font-family:inherit;" rows="4">${c}</textarea>
    </div>

    <div class="range-info-container" style="display:${showRangeInfo?'block':'none'}; margin-top:15px;">
        <div style="padding:10px; background:#fdf2f8; border:1px dashed #fbcfe8; border-radius:8px; font-size:0.85rem; color:#be185d;">
            📊 <b>Nota:</b> Esta pregunta se auto-evaluará utilizando el "Puntaje Máximo" global configurado arriba.
        </div>
        <label style="font-size:0.8rem; color:#64748b; margin:12px 0 6px; display:block;">Qué significa cada valor (opcional):</label>
        <div class="guia-escala-valores"></div>
        <label style="font-size:0.8rem; color:#64748b; margin:12px 0 3px; display:block;">Nota general (opcional):</label>
        <textarea class="inp-guia-nota" rows="2" placeholder="Lo que valga para toda la pregunta y no para un valor…" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #94a3b8; border-radius:6px; background:#fdf4ff; font-family:inherit;"></textarea>
        <div style="font-size:0.75rem; color:#94a3b8; margin-top:6px;">Sale plegado bajo la pregunta al contestarla y al calificarla. Es de esta pregunta; las etiquetas cortas de «Escala de puntajes» son de toda la encuesta.</div>
    </div>

    <div class="photo-info-container" style="display:${showPhotoInfo?'block':'none'}; margin-top:15px; padding:10px; background:#eff6ff; border:1px dashed #bfdbfe; border-radius:8px; font-size:0.85rem; color:#1d4ed8;">
        📷 <b>Evidencia:</b> el enunciado de arriba es lo que se le pide fotografiar. La foto se guarda reducida a ${window.MAX_LADO_FOTO_EVAL}px junto a la respuesta, y la califica quien revise si la encuesta pasa a revisión. Para pedir varias evidencias, agrega otra pregunta de este tipo.
    </div>

    <div class="signature-info-container" style="display:${showSignatureInfo?'block':'none'}; margin-top:15px; padding:10px; background:#f5f3ff; border:1px dashed #ddd6fe; border-radius:8px; font-size:0.85rem; color:#6d28d9;">
        🖊️ <b>Firma:</b> el enunciado de arriba dice de qué se deja constancia («Recibí la capacitación y entendí las reglas»). Debajo sale el recuadro donde se firma con el dedo, y lo que se pide escribir es <b>el primer nombre</b>, no la firma oficial: una rúbrica hecha con el dedo no vale como la del documento de identidad y un nombre escrito a mano sí se lee. <b>No cuenta para la calificación</b> y nadie tiene que revisarla.
    </div>

    <div class="attendance-info-container" style="display:${showAttendanceInfo?'block':'none'}; margin-top:15px;">
        <label style="font-size:0.8rem; color:#64748b; margin-bottom:6px; display:block;">Cuándo es el evento (opcional):</label>
        <input type="datetime-local" class="inp-fecha-evento" value="${window.valorLocalDeFecha(window.fechaDelEvento({ question_type: tp, options: op }))}"
               onchange="window.pintarPlazoAsistencia(this)"
               style="width:100%; box-sizing:border-box; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-size:16px; font-family:inherit;">
        <div class="plazo-asistencia" style="font-size:0.8rem; color:#15803d; font-weight:600; margin-top:6px;"></div>
        <div style="margin-top:10px; padding:10px; background:#f0fdf4; border:1px dashed #bbf7d0; border-radius:8px; font-size:0.85rem; color:#15803d;">
            🙋 <b>Asistencia:</b> el enunciado de arriba dice a qué se asistió («Capacitación de seguridad del 4 de septiembre»). Quien la reciba sólo tiene que confirmarlo, y al enviar queda registrada y calificada sola: nadie tiene que revisarla.
            Con fecha y hora, el pendiente <b>no aparece antes del evento</b> y hay ${window.MINUTOS_PARA_REGISTRAR_ASISTENCIA} minutos para registrarlo; pasados, ya no se puede y cuenta como inasistencia. Sin fecha se puede registrar en cualquier momento.
        </div>
    </div>`;
    
    document.getElementById('questions-container').appendChild(d);
    const l=d.querySelector('.dynamic-options-list');
    // Cuáles venían marcadas como correctas. Se leen con el mismo helper que
    // usa el envío para calificar, que es el que aguanta lo guardado antes de
    // que esto existiera.
    const correctas = window.opcionesCorrectas({ question_type: tp, correct_answer_text: c });
    if(showOptionsContainer && op.length>0) op.forEach(o=>window.agregarInputOpcion(l, o, correctas.includes(String(o))));
    else if(showOptionsContainer) window.agregarInputOpcion(l);
    window.actualizarMarcasCorrectas(d);
    // Los recuadros se montan siempre, aunque la pregunta no sea de escala: si
    // se cambia el tipo a «Rango Numérico» ya están puestos, y mientras tanto
    // el bloque entero va escondido.
    window.montarGuiaDeEscala(d, guiaGuardada);
    const campoFechaEvento = d.querySelector('.inp-fecha-evento');
    if (campoFechaEvento && campoFechaEvento.value) window.pintarPlazoAsistencia(campoFechaEvento);
    window.pintarBotonTipo(d);
    window.verificarRestriccionesModo();
    window.renumerarPreguntas();
};

// ==========================================
// ELEGIR EL TIPO DE PREGUNTA
// ==========================================
// El `<select>` sigue siendo la verdad —lo leen el guardado, la edición y las
// restricciones del modo jefe—, pero ya no se ve: en su lugar va un botón que
// dice el tipo elegido y despliega la lista de `window.TIPOS_DE_PREGUNTA` con
// la explicación de cada uno debajo del nombre.
//
// El desplegable nativo de iOS no admite ese segundo renglón: enseña una línea
// por opción y recorta lo que no cabe, así que había que saberse de memoria en
// qué se diferencian «Checklist» y «Recall». Y de paso desaparece una rueda de
// las que descolocan la hoja al cerrarse (ver `TIPOS_SIN_TECLADO`).
//
// Va desplegado dentro de la propia tarjeta y no en otra hoja: apilar una hoja
// sobre `#modal-crear-eval` deja dos tiradores a la vista, y aquí lo que se
// elige es un campo del formulario que ya está abierto.
window.pintarBotonTipo = (wrapper) => {
    const sel = wrapper.querySelector('.inp-tipo');
    const btn = wrapper.querySelector('.tipo-pregunta-boton');
    if (!sel || !btn) return;

    const tipo = window.tipoDePregunta(sel.value);
    const nombre = tipo ? tipo.nombre : sel.value;
    btn.innerHTML = `<span class="tipo-pregunta-icono">${tipo ? tipo.icono : '❓'}</span>
        <span class="tipo-pregunta-nombre">${window.sanitizeForHTML(nombre)}</span>
        <span class="tipo-pregunta-flecha" aria-hidden="true">▾</span>`;
    btn.title = tipo ? tipo.detalle : '';
    btn.setAttribute('aria-label', `Tipo de pregunta: ${nombre}. Toca para cambiarlo.`);
};

// La lista se rehace cada vez que se abre: qué tipos valen depende del modo de
// la encuesta, que se puede haber cambiado desde que se montó la tarjeta. Lo
// dice el propio `<option>`, al que `verificarRestriccionesModo` ya le pone su
// `disabled`, así que la regla no se escribe aquí por segunda vez.
window.listaDeTiposHTML = (wrapper) => {
    const sel = wrapper.querySelector('.inp-tipo');
    if (!sel) return '';

    // El porqué se dice una sola vez y arriba: repetido en cada fila apagada
    // eran cuatro párrafos iguales que tapaban las dos opciones que sí valen.
    const hayBloqueados = window.TIPOS_DE_PREGUNTA.some(t => {
        const o = Array.from(sel.options).find(op => op.value === t.valor);
        return !o || o.disabled;
    });
    const aviso = hayBloqueados
        ? `<div class="tipos-pregunta-aviso">Una evaluación de modo jefe se guarda ya calificada al enviarla, así que sólo admite lo que se puntúa solo y las evidencias, que no puntúan.</div>`
        : '';

    return aviso + window.TIPOS_DE_PREGUNTA.map(t => {
        const opcion = Array.from(sel.options).find(o => o.value === t.valor);
        const bloqueado = !opcion || opcion.disabled;
        const elegido = sel.value === t.valor;

        const nota = bloqueado
            ? `<span class="tipo-opcion-nota">No disponible</span>`
            : '';

        return `<button type="button" class="tipo-opcion${elegido ? ' es-elegido' : ''}"
                        ${bloqueado ? 'disabled' : ''} ${elegido ? 'aria-current="true"' : ''}
                        onclick="window.elegirTipoPregunta(this, '${t.valor}')">
            <span class="tipo-opcion-icono" aria-hidden="true">${t.icono}</span>
            <span class="tipo-opcion-texto">
                <span class="tipo-opcion-nombre">${window.sanitizeForHTML(t.nombre)}</span>
                <span class="tipo-opcion-detalle">${window.sanitizeForHTML(t.detalle)}</span>
                ${nota}
            </span>
            <span class="tipo-opcion-marca" aria-hidden="true">${elegido ? '✓' : ''}</span>
        </button>`;
    }).join('');
};

// Debajo del campo, en cuanto se elige la hora: hasta cuándo se podrá
// registrar. Es la misma cuenta que hará el teléfono de quien la conteste, así
// que quien crea la encuesta ve el plazo real y no tiene que calcularlo.
// El aviso se busca en el contenedor que toque —la tarjeta de la pregunta, o el
// `.form-group` de un formulario—: la fecha se pidió en dos sitios y puede
// volver a pedirse en otro.
window.pintarPlazoAsistencia = (campo) => {
    const wrapper = campo.closest('.pregunta-wrapper, .form-group');
    const aviso = wrapper ? wrapper.querySelector('.plazo-asistencia') : null;
    if (!aviso) return;

    const fecha = campo.value.trim() ? new Date(campo.value) : null;
    if (!fecha || isNaN(fecha.getTime())) {
        aviso.innerText = '';
        return;
    }

    const fin = new Date(fecha.getTime() + window.MINUTOS_PARA_REGISTRAR_ASISTENCIA * 60000);
    aviso.innerText = `Se podrá registrar el ${window.fechaYHoraLegible(fecha)}, y hasta las ${window.horaLegible(fin)}`;
};

// El valor que espera un `<input type="datetime-local">`: hora local, sin zona
// y sin segundos. `toISOString()` daría UTC y el campo enseñaría otra hora.
window.valorLocalDeFecha = (fecha) => {
    if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
    const dos = (n) => String(n).padStart(2, '0');
    return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
           `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
};

window.alternarTiposPregunta = (btn) => {
    const wrapper = btn.closest('.pregunta-wrapper');
    const lista = wrapper ? wrapper.querySelector('.tipos-pregunta') : null;
    if (!lista) return;

    const abrir = lista.hidden;
    if (abrir) lista.innerHTML = window.listaDeTiposHTML(wrapper);
    lista.hidden = !abrir;
    btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
};

window.elegirTipoPregunta = (el, valor) => {
    const wrapper = el.closest('.pregunta-wrapper');
    const sel = wrapper ? wrapper.querySelector('.inp-tipo') : null;
    if (!sel) return;

    sel.value = valor;

    const lista = wrapper.querySelector('.tipos-pregunta');
    if (lista) lista.hidden = true;
    const btn = wrapper.querySelector('.tipo-pregunta-boton');
    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Poner `.value` a mano no dispara el `onchange` del `<select>`, que es
    // quien enseña y esconde los campos de cada tipo.
    window.toggleTipoPregunta(sel);
};

// ==========================================
// LA GUÍA DE UNA ESCALA, RECUADRO POR VALOR
// ==========================================
// Un recuadro por cada valor que ofrece la escala —0, 0.5, 1… hasta el máximo—
// en vez del campo de texto libre que había antes: quien escribe la guía no
// tiene que inventarse el formato ni acordarse de cuántos valores hay, y quien
// contesta lee cada valor con su significado al lado.
//
// Cuántos son lo dicen el «Puntaje máximo» y los «puntos medios» de la hoja,
// que son de toda la encuesta: cambiarlos redibuja los recuadros de todas las
// preguntas de escala a la vez.
window.maximoDeEscalaDeLaHoja = () => {
    const inp = document.getElementById('eval-max-scale');
    const max = inp ? parseInt(inp.value, 10) : 5;
    return (Number.isFinite(max) && max > 0) ? max : 5;
};

window.pasoDeEscalaDeLaHoja = () => {
    const chk = document.getElementById('eval-half-points');
    return (chk && chk.checked) ? 0.5 : 1;
};

// Lo tecleado hasta ahora, sobre lo que ya se sabía. Lo que se guarda en la
// tarjeta y no en el documento es lo que sobrevive a bajar el máximo y volver
// a subirlo: los recuadros desaparecen, pero lo escrito en ellos vuelve.
window.recogerGuiaDeEscala = (wrapper) => {
    const guia = wrapper._guiaEscala || {};
    wrapper.querySelectorAll('.inp-guia-valor').forEach(inp => {
        const texto = inp.value.trim();
        if (texto) guia[inp.dataset.valor] = texto;
        else delete guia[inp.dataset.valor];
    });
    wrapper._guiaEscala = guia;
    return guia;
};

window.renderRecuadrosGuia = (wrapper) => {
    const caja = wrapper ? wrapper.querySelector('.guia-escala-valores') : null;
    if (!caja) return;

    const guia = window.recogerGuiaDeEscala(wrapper);
    const valores = window.valoresDeEscala(0, window.maximoDeEscalaDeLaHoja(), window.pasoDeEscalaDeLaHoja());

    caja.innerHTML = valores.map(v => {
        const clave = String(v);
        return `
        <div class="guia-valor-fila">
            <span class="guia-valor-numero">${clave}</span>
            <input type="text" class="inp-guia-valor" data-valor="${clave}"
                   value="${window.sanitizeForHTML(guia[clave] || '')}"
                   placeholder="Qué significa un ${clave}">
        </div>`;
    }).join('');
};

// Todas a la vez: es lo que llaman el «Puntaje máximo» y la casilla de puntos
// medios, que son de la encuesta entera.
window.renderGuiasDeEscala = () => {
    document.querySelectorAll('#questions-container .pregunta-wrapper').forEach(window.renderRecuadrosGuia);
};

// Lo guardado, repartido en los recuadros. Un objeto es la guía de hoy; un
// texto es una guía vieja y se reparte por renglones, dejando en la nota lo
// que no hable de ningún valor —así no se pierde nada al abrirla—.
window.montarGuiaDeEscala = (wrapper, guardado) => {
    let valores = {}, nota = '';

    if (typeof guardado === 'string') {
        const repartida = window.guiaDesdeTextoLibre(guardado);
        valores = repartida.valores;
        nota = repartida.nota;
    } else if (guardado && typeof guardado === 'object' && !Array.isArray(guardado)) {
        Object.keys(guardado).forEach(llave => {
            if (llave === window.LLAVE_NOTA_GUIA) return;
            const valor = parseFloat(llave);
            const texto = typeof guardado[llave] === 'string' ? guardado[llave].trim() : '';
            if (!isNaN(valor) && texto) valores[String(window.claveDeValorEscala(valor))] = texto;
        });
        const general = guardado[window.LLAVE_NOTA_GUIA];
        nota = typeof general === 'string' ? general.trim() : '';
    }

    wrapper._guiaEscala = valores;
    const campoNota = wrapper.querySelector('.inp-guia-nota');
    if (campoNota) campoNota.value = nota;
    window.renderRecuadrosGuia(wrapper);
};

// Lo que se escribe en `options`: sólo los valores que la escala ofrece hoy
// —lo que quedó fuera al bajar el máximo no se guarda— más la nota general.
window.guiaDeLaPregunta = (wrapper) => {
    const valores = {};
    wrapper.querySelectorAll('.inp-guia-valor').forEach(inp => {
        const texto = inp.value.trim();
        if (texto) valores[inp.dataset.valor] = texto;
    });
    const campoNota = wrapper.querySelector('.inp-guia-nota');
    return window.guiaDeEscalaParaGuardar(valores, campoNota ? campoNota.value : '');
};

// El orden de las preguntas es el que tengan aquí: `guardarNuevaEvaluacion`
// recorre los `.pregunta-wrapper` en el orden del documento y escribe su
// posición en `order_index`. Así que moverlas es literalmente moverlas de
// sitio, sin nada que recalcular.
window.moverPregunta = (btn, direccion) => {
    const wrapper = btn.closest('.pregunta-wrapper');
    if (!wrapper) return;

    const vecino = direccion < 0 ? wrapper.previousElementSibling : wrapper.nextElementSibling;
    if (!vecino || !vecino.classList.contains('pregunta-wrapper')) return;

    if (direccion < 0) vecino.before(wrapper);
    else vecino.after(wrapper);

    window.renumerarPreguntas();
    // Con diez preguntas, la que se movió puede quedar fuera de la pantalla.
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// Numera las tarjetas y apaga la flecha que no lleva a ningún lado, que es lo
// que dice de un vistazo dónde empieza y dónde acaba la lista.
window.renumerarPreguntas = () => {
    const wrappers = Array.from(document.querySelectorAll('#questions-container .pregunta-wrapper'));
    wrappers.forEach((w, i) => {
        const numero = w.querySelector('.pregunta-numero');
        if (numero) numero.innerText = i + 1;

        const [arriba, abajo] = w.querySelectorAll('.mover-pregunta');
        const apagar = (b, inutil) => {
            if (!b) return;
            b.disabled = inutil;
            b.style.opacity = inutil ? '0.35' : '1';
            b.style.cursor = inutil ? 'default' : 'pointer';
        };
        apagar(arriba, i === 0);
        apagar(abajo, i === wrappers.length - 1);
    });
};

window.borrarPreguntaDB = async (questionId, btnElement) => {
    if(!confirm("¿Eliminar esta pregunta permanentemente de la base de datos?")) return;
    btnElement.innerText = "...";
    const { error } = await sb.from('evaluation_questions').delete().eq('id', questionId);
    if(error) { alert("Error al borrar: " + error.message); btnElement.innerText = "🗑️ Eliminar"; }
    else { btnElement.closest('.pregunta-wrapper').remove(); window.renumerarPreguntas(); }
};

// Apagar y encender una encuesta desde su propia tarjeta. Una encuesta
// inactiva se queda en la base con todas sus respuestas, pero sólo la ve el
// administrador y deja de generar pendientes: las consultas que los arman
// filtran por `active`.
// El interruptor de «Activa» vive en la hoja de editar la encuesta —la casilla
// del grupo «Opciones», que `guardarNuevaEvaluacion` escribe con el resto—, así
// que aquí ya no hay ninguna función suelta que lo cambie de un toque: la había
// para el botón del renglón de la lista, que se quitó por ser ese mismo
// interruptor por otra puerta.

// --- ELIMINAR UNA ENCUESTA ---------------------------------------------
// Se entra por el bote de basura del encabezado de la hoja de edición, que es
// donde vive desde que se quitó del renglón de la lista: borrar una encuesta se
// lleva por delante lo que contestó todo el mundo, y ése no es un botón que
// deba estar a un toque en una lista, entre otros dos.
//
// El aviso dice **cuántas respuestas se van con ella**, que es lo que de verdad
// se pierde —una encuesta sin contestar no es nada, una con doscientas es el
// historial de doscientas personas—. Se cuenta con `head` y `count`, así que no
// viaja ninguna fila. Si la cuenta no se puede hacer se dice, que no es lo mismo
// que decir que no hay ninguna.
//
// Devuelve `true` sólo si la fila dejó de existir, que es cuando quien llama
// tiene que cerrar su hoja y recargar.
window.borrarEvaluacion = async (id) => {
    if (!window.modoAdminActivo) return false;

    const ev = window.encuestaEnCache(id);
    const titulo = (ev && ev.title) ? ev.title : 'esta encuesta';

    let respuestas = null;
    try {
        const { count, error } = await sb.from('evaluation_responses')
            .select('id', { count: 'exact', head: true })
            .eq('evaluation_id', id);
        if (error) throw error;
        respuestas = typeof count === 'number' ? count : null;
    } catch (e) {
        console.warn('No se pudo contar las respuestas de la encuesta:', e);
    }

    let aviso = `⚠️ Vas a ELIMINAR «${titulo}».`;
    aviso += respuestas === null
        ? '\n\nNo se pudo comprobar cuántas respuestas tiene, así que no se sabe cuánto se pierde.'
        : (respuestas > 0
            ? `\n\nSe va con sus ${respuestas} respuesta${respuestas === 1 ? '' : 's'}, con sus preguntas y con sus calificaciones. No se puede deshacer.`
            : '\n\nTodavía no la ha contestado nadie.');
    aviso += '\n\nSi lo que quieres es retirarla conservando lo contestado, cierra este aviso y desmarca «Activa» en el grupo «Opciones» de esta misma hoja: deja de verla todo el mundo menos el administrador.';
    aviso += '\n\n¿Eliminarla?';
    if (!confirm(aviso)) return false;

    if (respuestas === null || respuestas > 0) {
        if (!confirm(`Confirma otra vez: «${titulo}» y lo que se haya contestado en ella no se pueden recuperar.`)) return false;
    }

    try {
        // El `.select()` no es adorno: PostgREST responde con éxito a un delete
        // que las políticas de RLS rechazan —afecta a cero filas—, y sin este
        // conteo la pantalla decía «Evaluación eliminada» mientras la encuesta
        // seguía ahí hasta la siguiente recarga.
        const { data, error } = await sb.from('evaluations').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error("La base no borró la encuesta: no se eliminó ninguna fila. Revisa que la tabla evaluations tenga política de DELETE (RLS).");
        }

        window.evalCache = null;
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();
        if (window.refrescarTarjetaDeEncuestas) window.refrescarTarjetaDeEncuestas();
        alert(`🗑️ Se eliminó «${titulo}».`);
        return true;
    } catch (e) {
        console.error('Error al eliminar la encuesta:', e);
        // 23503 es la llave foránea: alguna tabla —sus respuestas, sus
        // preguntas— la tiene declarada sin borrado en cascada y la base se
        // niega a dejar el registro huérfano. Ahí apagarla es la salida.
        if (e && (e.code === '23503' || String(e.message || '').includes('foreign key'))) {
            alert("No se puede eliminar: hay respuestas o preguntas que dependen de esta encuesta y la base no las borra en cascada.\n\nDesmarca «Activa» en el grupo «Opciones» de esta hoja para retirarla conservando lo contestado.");
        } else {
            alert("No se pudo eliminar la encuesta: " + (e.message || JSON.stringify(e)));
        }
        return false;
    }
};

// El botón del encabezado de la hoja de edición. La encuesta es la que se está
// editando, así que no hace falta escapar ningún id en el marcado.
window.borrarEvaluacionEditada = async () => {
    const id = window.idEditandoEval;
    if (!id || window.editandoSoloDestinatarios) return;

    const boton = document.getElementById('btn-borrar-eval');
    if (boton) boton.disabled = true;
    const seFue = await window.borrarEvaluacion(id);
    if (boton) boton.disabled = false;
    if (!seFue) return;

    // La hoja habla de algo que ya no existe: se cierra y se vuelve a la lista,
    // que es de donde se venía —por su renglón o por el lápiz del encabezado de
    // la encuesta, que la cierra al abrir ésta—.
    const hoja = document.getElementById('modal-crear-eval');
    if (hoja) hoja.style.display = 'none';
    window.idEditandoEval = null;
    window.cargarVistaEvaluaciones();
};

window.toggleTipoPregunta = (s) => {
    const w = s.closest('.pregunta-wrapper');
    const o = w.querySelector('.options-container');
    const t = w.querySelector('.text-container');
    const lbl = w.querySelector('.lbl-options');
    const rInfo = w.querySelector('.range-info-container');
    const fInfo = w.querySelector('.photo-info-container');
    const aInfo = w.querySelector('.attendance-info-container');
    const sInfo = w.querySelector('.signature-info-container');

    if(o) o.style.display = 'none';
    if(t) t.style.display = 'none';
    if(rInfo) rInfo.style.display = 'none';
    if(fInfo) fInfo.style.display = 'none';
    if(aInfo) aInfo.style.display = 'none';
    if(sInfo) sInfo.style.display = 'none';

    if (s.value === 'text') {
        if(t) t.style.display = 'block';
    } else if (s.value === 'range') {
        if(rInfo) rInfo.style.display = 'block';
        // El máximo o los puntos medios pueden haber cambiado mientras esta
        // pregunta era de otro tipo y sus recuadros estaban escondidos.
        window.renderRecuadrosGuia(w);
    } else if (s.value === window.TIPO_PREGUNTA_FOTO) {
        // Una evidencia no tiene opciones ni respuesta modelo: sólo el
        // enunciado, que dice qué fotografiar.
        if(fInfo) fInfo.style.display = 'block';
    } else if (s.value === window.TIPO_PREGUNTA_ASISTENCIA) {
        // Tampoco la asistencia: el enunciado dice a qué se asistió y no hay
        // nada más que configurar.
        if(aInfo) aInfo.style.display = 'block';
    } else if (s.value === window.TIPO_PREGUNTA_FIRMA) {
        // Ni la firma: el enunciado dice de qué se deja constancia y el
        // recuadro para firmar sale solo al contestarla.
        if(sInfo) sInfo.style.display = 'block';
    } else {
        if(o) {
            o.style.display = 'block';
            lbl.innerText = (s.value === 'list_match') ? "Elementos Correctos (Respuesta Modelo):" : "Opciones:";
            if(w.querySelector('.dynamic-options-list').children.length === 0) {
                window.agregarInputOpcion(w.querySelector('.dynamic-options-list'));
            }
        }
    }

    // El enunciado no siempre es una pregunta: una evidencia pide qué
    // fotografiar y una asistencia a qué se asistió. Lo dice el catálogo, y se
    // repone aquí porque antes sólo se ponía al montar la tarjeta.
    const campoEnunciado = w.querySelector('.inp-pregunta');
    if (campoEnunciado) campoEnunciado.placeholder = window.enunciadoDeTipo(s.value);

    // Las casillas de «correcta» son de opción múltiple y checklist; en
    // «Recall» sobran, y al cambiar de tipo hay que apagarlas.
    window.actualizarMarcasCorrectas(w);

    // El botón dice el tipo, y aquí pasan los dos caminos que lo cambian: la
    // elección de la lista y el «vuelve a escala» del modo jefe.
    window.pintarBotonTipo(w);
};

// Cada opción lleva delante su casilla de «ésta es correcta». Marcar alguna es
// lo que hace que la pregunta se califique sola al enviarla; sin marcar
// ninguna, la califica quien revise, como siempre. La casilla no se enseña en
// «Recall», que es una lista de elementos y no una elección: eso lo decide
// window.actualizarMarcasCorrectas según el tipo de la pregunta.
window.agregarInputOpcion = (c, v = "", correcta = false) => {
    const d=document.createElement('div');
    d.style.cssText="display:flex;gap:5px;margin-top:5px;align-items:center;";

    const marca = document.createElement('label');
    marca.className = "marca-correcta";
    marca.style.cssText = "display:flex; align-items:center; justify-content:center; width:34px; height:34px; flex-shrink:0; border-radius:8px; background:#f1f5f9; border:1px solid #e2e8f0; cursor:pointer;";
    marca.title = "Marcar como respuesta correcta";
    const chk = document.createElement('input');
    chk.type = "checkbox"; chk.className = "chk-opt-ok"; chk.checked = !!correcta;
    chk.style.cssText = "width:17px; height:17px; accent-color:#16a34a; cursor:pointer;";
    chk.setAttribute('aria-label', 'Esta opción es correcta');
    marca.appendChild(chk);

    const inp = document.createElement('input');
    inp.type = "text"; inp.className = "inp-opt-val"; inp.value = v;
    inp.style.cssText = "flex:1; min-width:0; padding:8px; border:1px solid #cbd5e1; border-radius:6px;";
    const btn = document.createElement('button');
    btn.innerText = "✕"; btn.style.cssText = "color:red; border:none; background:white; font-weight:bold; cursor:pointer;";
    btn.onclick = function() { this.parentElement.remove(); };
    d.appendChild(marca); d.appendChild(inp); d.appendChild(btn); c.appendChild(d);

    const wrapper = c.closest('.pregunta-wrapper');
    if (wrapper) window.actualizarMarcasCorrectas(wrapper);
};

// Enseña o esconde las casillas de «correcta» según el tipo, y dice arriba qué
// significa marcarlas. Se llama al cambiar el tipo y al agregar una opción.
window.actualizarMarcasCorrectas = (wrapper) => {
    const tipoEl = wrapper.querySelector('.inp-tipo');
    const tipo = tipoEl ? tipoEl.value : 'text';
    const llevanMarca = window.PREGUNTAS_CON_OPCIONES.includes(tipo);

    wrapper.querySelectorAll('.marca-correcta').forEach(m => {
        m.style.display = llevanMarca ? 'flex' : 'none';
        if (!llevanMarca) {
            const chk = m.querySelector('.chk-opt-ok');
            if (chk) chk.checked = false;
        }
    });

    const ayuda = wrapper.querySelector('.ayuda-correctas');
    if (ayuda) {
        ayuda.style.display = llevanMarca ? 'block' : 'none';
        ayuda.innerText = tipo === 'checklist'
            ? 'Marca ✔ las opciones correctas: se calificará sola y habrá que marcarlas todas, sin ninguna de más. Sin marcar ninguna, la califica quien revise.'
            : 'Marca ✔ la opción correcta: se calificará sola. Si marcas varias, cualquiera de ellas cuenta como acierto. Sin marcar ninguna, la califica quien revise.';
    }
};

// ==========================================
// QUIÉN ASIGNÓ A CADA DESTINATARIO
// ==========================================
// El mapa `{ idEmpleado: idRevisor }` mientras la hoja está abierta. Se llena
// al abrirla con lo que traiga la encuesta y se va sellando según se agrega
// gente; al guardar se poda con `window.asignacionesVigentes`.
window.asignacionesEnEdicion = {};

// La encuesta tal como estaba al abrir la hoja. Hace falta en el modo
// restringido del revisor, donde el bloque de revisores está escondido y los
// que valen son los que ya tenía la encuesta.
window.encuestaEnEdicion = null;

// Los revisores que tiene la hoja ahora mismo. En el modo restringido no se
// leen del selector —no está a la vista y el revisor no los puede tocar—.
window.revisoresDeLaHoja = () => {
    if (window.editandoSoloDestinatarios) {
        return window.revisoresDeEncuesta(window.encuestaEnEdicion);
    }
    const ids = window.idsDelSelector('revisores');
    if (!Array.isArray(ids)) return [];
    return ids.map(String).filter(x => x.trim() !== '' && x.toUpperCase() !== 'ALL');
};

// Quien agrega a un destinatario se queda con su revisión, pero sólo si es
// revisor de esta encuesta: un administrador que no lo sea reparte como
// siempre. Nunca se pisa un apunte anterior —el de otro revisor es suyo— y
// nadie se asigna a sí mismo, que acabaría calificando su propia respuesta.
window.apuntarQuienAsigno = (empleadoId) => {
    const clave = String(empleadoId);
    if (window.asignacionesEnEdicion[clave]) return;

    const user = JSON.parse(localStorage.getItem("usuarioLogueado") || 'null');
    if (!user) return;

    const yo = String(user.id);
    if (yo === clave) return;
    if (!window.revisoresDeLaHoja().includes(yo)) return;

    window.asignacionesEnEdicion[clave] = yo;
};

// Lo que la ficha dice detrás del nombre. Sólo sale cuando hay apunte y sigue
// valiendo: así se ve de un vistazo a quién le va a tocar calificarla, y quitar
// y volver a agregar a alguien es la forma de devolverlo al reparto común.
window.selloDeAsignacion = (empleadoId) => {
    const asigno = String(window.asignacionesEnEdicion[String(empleadoId)] || '');
    if (!asigno || !window.revisoresDeLaHoja().includes(asigno)) return '';

    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === asigno);
    const nombre = emp && emp.name ? emp.name.split(' ')[0] : `ID ${asigno}`;
    return `<small style="margin-left:5px; font-weight:normal; color:#9333ea;" title="Revisa ${window.sanitizeForHTML(emp && emp.name ? emp.name : asigno)}">· 👁️ ${window.sanitizeForHTML(nombre)}</small>`;
};

// Sin la columna, apuntar quién asignó no se puede guardar: el pendiente se
// sigue repartiendo entre todos los revisores, como hasta ahora. Sólo se dice
// donde importa —una encuesta con revisores nombrados—, que si no es ruido para
// el administrador que sólo está dirigiendo la encuesta.
window.avisarSiFaltaColumnaAsignador = async () => {
    const aviso = document.getElementById('aviso-asignador-no-disponible');
    if (!aviso) return;
    const hay = await window.hayColumnaAsignador();
    aviso.style.display = (!hay && window.revisoresDeLaHoja().length > 0) ? 'block' : 'none';
};

// Las tres columnas de «A quién va dirigida», leídas de la hoja. Devuelve null
// —tras avisar— en el único caso que no se puede guardar: haber desmarcado
// «Todos los colaboradores» sin nombrar a nadie. Lo comparten el guardado
// entero y el del revisor, que sólo escribe esto.
window.destinatariosDeLaHoja = () => {
    const listaMarcada = (idCasillaTodos, selectorItems) => {
        const chkAll = document.getElementById(idCasillaTodos);
        if (!chkAll || chkAll.checked) return ['ALL'];
        const marcados = Array.from(document.querySelectorAll(selectorItems)).map(cb => cb.value);
        return marcados.length > 0 ? marcados : ['ALL'];
    };

    const targetEmployees = window.idsDelSelector('destinatarios');
    if (targetEmployees === null) {
        if (window.abrirGrupoEval) window.abrirGrupoEval('grupo-destinatarios');
        alert("Desmarcaste 'Todos los colaboradores' pero no agregaste a nadie a la lista.");
        return null;
    }

    return {
        target_positions: listaMarcada('chk-all-puestos', '.chk-puesto-item:checked'),
        target_departments: listaMarcada('chk-all-deptos', '.chk-depto-item:checked'),
        target_employees: targetEmployees
    };
};

// El guardado del revisor: sólo los destinatarios. No pasa por el guardado
// entero porque ése lee el título, la escala y las preguntas, que en esta hoja
// están escondidas —y las escribiría con lo que hubiera quedado en los campos—.
// Aquí estuvo la hoja de **relanzar una encuesta**, que volvía a pedirla a todo
// el que la tuviera asignada sellando el instante en `relaunched_at`. Se quitó:
// desde que el «+» del detalle de una clasificación crea una encuesta **copiando
// otra** —con la fecha de hoy en el título—, repetir una junta o una auditoría
// es copiarla, y eso deja cada vuelta con su propia lista, su propio pase de
// lista y su propio historial en vez de mezclar dos eventos en una encuesta.
//
// **Lo que sí se queda es la lectura**: `window.fechaDeRelanzamiento` y
// `window.respuestasTrasRelanzar` siguen en `1-config.js` y las siguen mirando
// los pendientes y el pase de lista. Una encuesta que ya se relanzó lleva su
// instante puesto en la base, y dejar de mirarlo cerraría de golpe los
// pendientes que ese relanzamiento abrió. No se relanza más; lo relanzado sigue
// contando como se relanzó.

window.guardarDestinatariosEncuesta = async () => {
    const eid = window.idEditandoEval;
    if (!eid) { alert("No hay ninguna encuesta abierta."); return; }

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const evaluacion = await window.encuestaDeLaRespuesta(eid);
    if (!window.modoAdminActivo && !(user && window.puedeEditarDestinatarios(evaluacion, user.id))) {
        alert("Sólo quien revisa esta encuesta puede cambiar a quién va dirigida.");
        return;
    }

    const destinatarios = window.destinatariosDeLaHoja();
    if (!destinatarios) return;

    // Quién asignó a cada quien. Los revisores no se tocan desde esta hoja, así
    // que salen de la encuesta. Sin la columna se guardan sólo los
    // destinatarios y el pendiente se reparte como hasta ahora.
    if (await window.hayColumnaAsignador()) {
        destinatarios.assigned_by = window.asignacionesVigentes(
            window.asignacionesEnEdicion,
            destinatarios.target_employees,
            window.revisoresDeEncuesta(evaluacion)
        );
    }

    // El botón no se toca aquí: lo apaga y lo vuelve a encender el pestillo de
    // `guardarNuevaEvaluacion`, que es la única puerta por la que se entra y el
    // que ya lo tiene apagado desde antes de la primera consulta.
    try {
        // PostgREST responde con éxito a un update que las políticas de RLS
        // rechazan: simplemente no afecta a ninguna fila. Aquí escribe alguien
        // que no es administrador, así que comprobar `error` no basta: se
        // encadena `.select()` y se cuentan las filas, o la hoja se cerraría
        // diciendo que guardó lo que la base no dejó pasar.
        const { data, error } = await sb.from('evaluations')
            .update(destinatarios)
            .eq('id', eid)
            .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
            alert("❌ La base no aceptó el cambio: no se modificó ninguna fila. Pide a un administrador que revise los permisos de la tabla de encuestas.");
            return;
        }

        alert("✅ Guardado correctamente");
        document.getElementById('modal-crear-eval').style.display = 'none';
        window.evalCache = null;
        // A quién va dirigida es el padrón, o sea el divisor de la tarjeta del
        // panel: sin esto seguiría repartiendo sobre la lista de antes.
        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();
        if (window.refrescarTarjetaDeEncuestas) window.refrescarTarjetaDeEncuestas();
        cargarVistaEvaluaciones();
    } catch (e) {
        alert("❌ Error: " + e.message);
        console.error(e);
    }
};

// --- EL CUESTIONARIO QUE SE ESTÁ ESCRIBIENDO ---
//
// Las tarjetas de la hoja, leídas en el orden del documento y con la misma
// forma que tienen las filas de `evaluation_questions`: es lo que escribe
// `guardarNuevaEvaluacion` y lo que dibuja la vista previa. Una sola lectura
// para las dos y no dos copias, que es lo que acabaría enseñando en la vista
// previa una encuesta distinta de la que se guarda —justo lo contrario de para
// lo que está—.
//
// Cada pregunta lleva el `id` que ya tiene en la base, o null si es nueva: de
// eso depende insertar o actualizar. Las que se quedaron sin enunciado no
// salen, como no salían antes.
window.preguntasDeLaHoja = () => {
    const inpMax = document.getElementById('eval-max-scale');
    const maxEscala = (inpMax && parseInt(inpMax.value)) || 5;
    const chkHalf = document.getElementById('eval-half-points');
    const paso = (chkHalf && chkHalf.checked) ? 0.5 : 1;

    const preguntas = [];
    document.querySelectorAll('.pregunta-wrapper').forEach((d, i) => {
        const campoTexto = d.querySelector('.inp-pregunta');
        const campoTipo = d.querySelector('.inp-tipo');
        if (!campoTexto || !campoTipo) return;
        const txt = campoTexto.value.trim();
        const tp = campoTipo.value;
        let corr = "", ops = [];

        if (tp === 'multiple' || tp === 'checklist') {
            // `correct_answer_text` guardaba aquí el arreglo con TODAS las
            // opciones, que no decía nada. Ahora guarda las que dan por buena
            // la respuesta, y como objeto: así lo viejo —un arreglo— se
            // distingue de «se marcaron éstas» y no se lee como que todas eran
            // correctas. Sin ninguna marcada, la califica quien revise, igual
            // que hasta ahora.
            const correctas = [];
            d.querySelectorAll('.inp-opt-val').forEach(r => {
                const texto = r.value.trim();
                if (!texto) return;
                ops.push(texto);
                const marca = r.parentElement.querySelector('.chk-opt-ok');
                if (marca && marca.checked) correctas.push(texto);
            });
            corr = JSON.stringify({ [window.LLAVE_OPCIONES_CORRECTAS]: correctas });
        } else if (tp === 'list_match') {
            const items = [];
            d.querySelectorAll('.inp-opt-val').forEach(r => { if (r.value.trim()) items.push(r.value.trim()); });
            corr = JSON.stringify(items);
            ops = [];
        } else if (tp === window.TIPO_PREGUNTA_ASISTENCIA) {
            // Lo único que se configura es cuándo es el evento, y va en la
            // primera posición de `options`. El campo de «Respuesta Modelo»
            // sigue en el marcado aunque esté escondido: sin vaciarlo se
            // guardaría lo que hubiera quedado escrito antes de cambiar el tipo
            // de la pregunta.
            corr = "";
            ops = [];
            const campoFecha = d.querySelector('.inp-fecha-evento');
            const cuando = campoFecha ? campoFecha.value.trim() : '';
            if (cuando) {
                // El `datetime-local` da hora local sin zona; se guarda en ISO
                // para que el teléfono de quien la contesta lea el mismo
                // instante aunque esté en otro huso.
                const fecha = new Date(cuando);
                if (!isNaN(fecha.getTime())) ops[window.PLAZA_FECHA_EVENTO] = fecha.toISOString();
            }
        } else if (tp === window.TIPO_PREGUNTA_FIRMA) {
            // Una firma no tiene opciones ni respuesta modelo. El campo de
            // «Respuesta Modelo» sigue en el marcado aunque esté escondido, así
            // que se vacía a propósito —igual que en la asistencia—: sin esto
            // se guardaría lo que hubiera quedado escrito antes de cambiar el
            // tipo de la pregunta.
            corr = "";
            ops = [];
        } else if (tp === 'range') {
            ops = [0, maxEscala, paso];
            const guia = window.guiaDeLaPregunta(d);
            if (guia) ops[window.PLAZA_GUIA_ESCALA] = guia;
            corr = "";
        } else {
            const campoCorrecta = d.querySelector('.inp-respuesta-correcta-text');
            corr = campoCorrecta ? campoCorrecta.value.trim() : '';
        }

        if (!txt) return;
        preguntas.push({
            id: d.getAttribute('data-id') || null,
            question_text: txt,
            correct_answer_text: corr,
            question_type: tp,
            options: ops,
            order_index: i
        });
    });
    return preguntas;
};

// --- EL BOTÓN DE GUARDAR NO ADMITE DOS PULSACIONES ---
//
// Guardar una encuesta nueva es un `insert`, así que la segunda pulsación no
// repetía el guardado: creaba **otra encuesta**. `idEditandoEval` sigue en null
// mientras el primer insert va de camino, de modo que la segunda vuelta vuelve
// a insertar, y quedan dos encuestas iguales con su propia lista y su propio
// historial.
//
// Y no hacía falta impaciencia para dar dos veces: antes del insert van varias
// preguntas a la base —`hayColumna…` por cada columna que añadió un script, y
// la ficha de la encuesta en la hoja del revisor— y desde un teléfono en 4G eso
// es un segundo o dos en los que la pantalla no dice nada. Las dos mitades van
// juntas: el pestillo impide el duplicado y el estado en el encabezado quita la
// razón de buscarlo.
//
// El estado va al **subtítulo de la hoja** y el botón se apaga mientras tanto,
// nunca con `innerText` sobre el botón: eso borraría su `<svg>`, que es la regla
// de todo botón de icono de la aplicación. Se guarda el subtítulo que había
// para devolverlo, que lo escribió `prepararEncabezadoEval` y dice de qué va la
// hoja.
window.guardandoEncuesta = false;
window.subtituloAntesDeGuardar = null;

window.marcarGuardandoEncuesta = (activo, queVa) => {
    window.guardandoEncuesta = !!activo;
    const btn = document.getElementById('btn-guardar-eval');
    const borrar = document.getElementById('btn-borrar-eval');
    const sub = document.getElementById('subtitulo-crear-eval');

    // El bote de basura se apaga también: eliminar la encuesta a mitad de
    // guardarla es la otra manera de acabar con la hoja diciendo una cosa y la
    // base otra.
    if (btn) btn.disabled = !!activo;
    if (borrar) borrar.disabled = !!activo;

    if (!sub) return;
    if (activo) {
        if (window.subtituloAntesDeGuardar === null) window.subtituloAntesDeGuardar = sub.innerText;
        sub.innerText = queVa || 'Guardando…';
    } else if (window.subtituloAntesDeGuardar !== null) {
        sub.innerText = window.subtituloAntesDeGuardar;
        window.subtituloAntesDeGuardar = null;
    }
};

window.guardarNuevaEvaluacion = async () => {
    // La pulsación de más no vale: se está guardando lo que esa pulsación
    // pedía.
    if (window.guardandoEncuesta) return;

    // La hoja restringida del revisor guarda por su cuenta: el guardado entero
    // lee campos que ella ni siquiera enseña.
    const soloDestinatarios = !!window.editandoSoloDestinatarios;
    window.marcarGuardandoEncuesta(true, soloDestinatarios
        ? 'Guardando a quién va dirigida…'
        : (window.idEditandoEval ? 'Guardando los cambios…' : 'Publicando la encuesta…'));

    try {
        if (soloDestinatarios) return await window.guardarDestinatariosEncuesta();
        await window.publicarEncuestaDeLaHoja();
    } finally {
        // En el `finally` y no al final del guardado: éste se planta en media
        // docena de sitios —falta el título, no hay preguntas, nadie en la
        // lista, la clasificación no es la que se puede crear— y soltar el
        // pestillo sólo por el camino bueno dejaría el botón muerto con la hoja
        // todavía abierta.
        window.marcarGuardandoEncuesta(false);
    }
};

window.publicarEncuestaDeLaHoja = async () => {

    const tit = document.getElementById('eval-title-input').value.trim();
    const cat = document.getElementById('eval-category-input').value.trim() || "General";

    // Quien crea siendo revisor y no administrador sólo puede hacerlo en la
    // clasificación desde la que entró. El campo va bloqueado, pero eso es la
    // pantalla: un `disabled` se quita desde la consola y aquí es donde de
    // verdad se decide.
    const clasifFija = String(window.clasificacionFijaParaCrear || '').trim();
    if (clasifFija && window.normalizarClasificacion(cat) !== window.normalizarClasificacion(clasifFija)) {
        window.abrirGrupoEval('grupo-datos');
        alert(`Sólo puedes crear encuestas en «${clasifFija}», que es la clasificación que revisas.`);
        return;
    }
    
    const descInput = document.getElementById('eval-desc-input');
    const desc = descInput ? descInput.value.trim() : null;
    const freqInput = document.getElementById('eval-frequency-input');
    const freq = freqInput ? freqInput.value : 'once';

    const mode = document.getElementById('eval-mode-input') ? document.getElementById('eval-mode-input').value : 'self';
    const wr = document.querySelectorAll('.pregunta-wrapper');
    // Con las secciones plegadas, «Faltan datos» no dice dónde faltan: se abre
    // la que los tiene y se lleva a la vista.
    if (!tit) { window.abrirGrupoEval('grupo-datos'); alert("Falta el título de la encuesta."); return; }
    if (wr.length === 0) { window.abrirGrupoEval('grupo-preguntas'); alert("Agrega al menos una pregunta."); return; }
    
    try{
        let eid = window.idEditandoEval;
        const rangeLabels = {};
        let hasLabels = false;
        
        const globalMaxVal = parseInt(document.getElementById('eval-max-scale').value) || 5;
        for(let i=0; i<=globalMaxVal; i++) {
            const el = document.getElementById(`lbl-range-${i}`);
            if(el && el.value.trim()) { rangeLabels[i] = el.value.trim(); hasLabels = true; }
        }

        // Las tres listas de «A quién va dirigida» se arman en un solo sitio:
        // el revisor guarda exactamente lo mismo desde su hoja restringida.
        const destinatarios = window.destinatariosDeLaHoja();
        if (!destinatarios) return;

        let isObligatory = true;
        const chkOblig = document.getElementById('chk-eval-obligatoria');
        if(chkOblig) isObligatory = chkOblig.checked;

        const chkArea = document.getElementById('chk-eval-por-area');
                const evaluatesArea = chkArea ? chkArea.checked : false;

                // Sin la casilla marcada la encuesta queda inactiva: sólo la
                // ve el administrador y no genera pendientes a nadie.
                const chkActiva = document.getElementById('chk-eval-activa');
                const estaActiva = chkActiva ? chkActiva.checked : true;

                // Nombrar revisores es opcional: ['ALL'] significa lo de
                // siempre, que la revisa el jefe inmediato.
                const revisores = window.idsDelSelector('revisores');
                if (revisores === null) {
                    window.abrirGrupoEval('grupo-revisores');
                    alert("Desmarcaste 'La revisa el jefe inmediato' pero no agregaste a ningún revisor.");
                    return;
                }

                const payload = {
                    title: tit,
                    category: cat,
                    description: desc,
                    frequency: freq,
                    mode: mode,
                    range_labels: hasLabels ? JSON.stringify(rangeLabels) : null,
                    ...destinatarios,
                    evaluates_area: evaluatesArea,
                    is_obligatory: isObligatory,
                    active: estaActiva
                };

                // Sin la columna en la base no se puede guardar el
                // nombramiento; el resto de la encuesta sí, y la hoja ya avisó.
                if (await window.hayColumnaRevisores()) {
                    payload.reviewer_employees = revisores;
                }

                // Quién dirigió la encuesta a cada persona. Se poda con los
                // revisores que quedan, así que quitar a uno de la lista
                // devuelve a su gente al reparto común sin tocar nada más; y
                // con «todos los colaboradores» marcado el mapa se vacía, que
                // ahí no hay a quién apuntar.
                if (await window.hayColumnaAsignador()) {
                    payload.assigned_by = window.asignacionesVigentes(
                        window.asignacionesEnEdicion,
                        destinatarios.target_employees,
                        revisores
                    );
                }

                const chkUmbral = document.getElementById('chk-eval-umbral');
                if (await window.hayColumna('evaluations', 'requires_min_score')) {
                    payload.requires_min_score = chkUmbral ? chkUmbral.checked : true;
                }

                const inpReintento = document.getElementById('eval-retry-days');
                if (await window.hayColumna('evaluations', 'retry_days')) {
                    const dias = inpReintento ? parseInt(inpReintento.value, 10) : 0;
                    payload.retry_days = (Number.isFinite(dias) && dias > 0) ? dias : 0;
                }

                // Desde cuándo cuenta la encuesta. Se guarda en ISO y no como el
                // 'YYYY-MM-DD' del campo, que la columna es `timestamptz`: así
                // el teléfono de quien la mire lee el mismo instante aunque esté
                // en otro huso. Vaciar el campo la devuelve a null, que es
                // volver a mandar `created_at`.
                if (await window.hayColumnaVigencia()) {
                    const desde = window.fechaDeVigenciaDeLaHoja();
                    payload.vigente_desde = desde ? desde.toISOString() : null;
                }

                if(eid) {
            const { error } = await sb.from('evaluations').update(payload).eq('id', eid);
            if(error) throw error;
        } else {
            const {data, error} = await sb.from('evaluations').insert(payload).select().single();
            if(error) throw error;
            eid = data.id;
        }
        
        const ups=[], ins=[];
        // El cuestionario se lee en un solo sitio, que es el mismo del que sale
        // la vista previa: ver `window.preguntasDeLaHoja`.
        window.preguntasDeLaHoja().forEach(q => {
            const { id: exId, ...campos } = q;
            const p = { evaluation_id: eid, ...campos };
            if (exId) { p.id = exId; ups.push(p); } else { ins.push(p); }
        });
        
        if(ins.length) await sb.from('evaluation_questions').insert(ins);
                if(ups.length) {
                    const updatePromises = ups.map(q => { const { id, ...dataToUpdate } = q; return sb.from('evaluation_questions').update(dataToUpdate).eq('id', id); });
                    await Promise.all(updatePromises);
                }
                
                alert("✅ Guardado correctamente");
                document.getElementById('modal-crear-eval').style.display='none';
                window.evalCache = null;
                // Aquí sí se escriben las preguntas, así que puede haber una
                // asistencia nueva o con la hora movida, y de esa caché salen
                // los pendientes.
                await window.cargarVentanasDeAsistencia(true);
                // Y la tarjeta del panel de detrás, que no se entera sola: se
                // quedaba con las filas que trajo al cargar el inicio, así que
                // el título, la clasificación, «Activa» o la fecha desde la que
                // aplica seguían siendo los de antes hasta la próxima recarga.
                if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();
                if (window.refrescarTarjetaDeEncuestas) window.refrescarTarjetaDeEncuestas();
                cargarVistaEvaluaciones();
            }catch(e){ alert("❌ Error: " + e.message); console.error(e); }
        };

        // --- LOS DOS SELECTORES DE PERSONAS DE LA HOJA ---
        // «A quién va dirigida» y «quién la revisa» son el mismo control con
        // distintos ids: una casilla que lo despliega, un buscador y las
        // fichas de los elegidos. En vez de repetir las cuatro funciones, cada
        // una recibe de qué selector se trata.
        window.SELECTORES_PERSONAS = {
            destinatarios: {
                casilla: 'chk-all-empleados',
                caja: 'container-selector-empleados',
                buscador: 'inp-buscar-empleado-eval',
                resultados: 'lista-resultados-empleados-eval',
                fichas: 'lista-empleados-seleccionados-eval',
                elegidos: []
            },
            revisores: {
                casilla: 'chk-revisa-jefe',
                caja: 'container-selector-revisores',
                buscador: 'inp-buscar-revisor-eval',
                resultados: 'lista-resultados-revisores-eval',
                fichas: 'lista-revisores-seleccionados-eval',
                elegidos: []
            },
            // El mismo control, en la hoja de «Revisores por clasificación» del
            // panel de administración. Sus ids viven en el cuerpo que esa hoja
            // arma con `innerHTML`, así que existen sólo mientras está abierta;
            // todas estas funciones buscan por id con guarda.
            revisoresClasif: {
                casilla: 'chk-revisa-jefe-clasif',
                caja: 'container-selector-revisores-clasif',
                buscador: 'inp-buscar-revisor-clasif',
                resultados: 'lista-resultados-revisores-clasif',
                fichas: 'lista-revisores-clasif-elegidos',
                elegidos: []
            }
        };

        // Los elegidos se guardan como {id, name}: el nombre es para las
        // fichas, y hace falta guardarlo porque la lista se pinta antes de que
        // se pueda buscar a nadie.
        window.personasElegidas = (clave) => window.SELECTORES_PERSONAS[clave].elegidos;

        window.ponerPersonasElegidas = (clave, lista) => {
            window.SELECTORES_PERSONAS[clave].elegidos = lista || [];
        };

        window.toggleSelectorPersonas = (clave) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const chk = document.getElementById(cfg.casilla);
            const caja = document.getElementById(cfg.caja);
            if (!chk || !caja) return;

            // La casilla dice lo de siempre —todos, o el jefe—, así que el
            // selector aparece justo cuando se desmarca.
            if (chk.checked) {
                caja.style.display = 'none';
            } else {
                caja.style.display = 'block';
                window.pintarPersonasEval(clave);
            }

            // Cambiar los revisores cambia qué apuntes siguen valiendo: el
            // sello de una ficha desaparece en cuanto quien asignó deja de ser
            // revisor, que es también lo que hará el guardado.
            if (clave === 'revisores') {
                window.pintarPersonasEval('destinatarios');
                window.avisarSiFaltaColumnaAsignador();
                // Con la casilla marcada la encuesta hereda los de su
                // clasificación, y eso hay que decirlo donde se decide.
                window.pintarNotaRevisoresClasificacion();
            }
        };

        window.buscarPersonaEval = (clave, term) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const resDiv = document.getElementById(cfg.resultados);
            if (!resDiv) return;
            if (!term.trim()) { resDiv.innerHTML = ''; return; }

            const termLow = term.toLowerCase();
            const matches = (window.todosLosEmpleadosData || []).filter(e =>
                (e.name && e.name.toLowerCase().includes(termLow)) || String(e.id).includes(termLow)
            ).slice(0, 8);

            if (matches.length === 0) {
                resDiv.innerHTML = '<div style="font-size:0.85rem; color:#64748b; padding:5px;">No se encontraron coincidencias.</div>';
                return;
            }

            resDiv.innerHTML = matches.map(m => {
                const isSelected = cfg.elegidos.some(s => String(s.id) === String(m.id));
                const nombre = String(m.name || '').replace(/'/g, "\\'");
                const btnState = isSelected ?
                    `<button disabled style="background:#f1f5f9; color:#94a3b8; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:bold;">Agregado</button>` :
                    `<button onclick="window.agregarPersonaEval('${clave}', '${m.id}', '${nombre}')" style="background:#7e22ce; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">+ Agregar</button>`;

                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 5px; border-bottom:1px solid #f1f5f9; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <span style="font-size:0.85rem; color:#334155; font-weight:500;">${m.name} <small style="color:#94a3b8; font-weight:normal;">(${m.id})</small></span>
                    ${btnState}
                </div>`;
            }).join('');
        };

        window.agregarPersonaEval = (clave, id, nombre) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            if (!cfg.elegidos.some(e => String(e.id) === String(id))) {
                cfg.elegidos.push({ id: String(id), name: nombre });
                // Se apunta aquí y no al guardar: al guardar no se sabría cuál
                // de los destinatarios acaba de agregar quien está mirando y se
                // quedarían todos a su nombre, incluidos los que puso otro.
                if (clave === 'destinatarios') window.apuntarQuienAsigno(id);
                window.pintarPersonasEval(clave);
                if (clave === 'revisores') window.pintarPersonasEval('destinatarios');
                const inp = document.getElementById(cfg.buscador);
                if (inp) window.buscarPersonaEval(clave, inp.value);
            }
        };

        window.quitarPersonaEval = (clave, id) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            cfg.elegidos = cfg.elegidos.filter(e => String(e.id) !== String(id));
            if (clave === 'destinatarios') delete window.asignacionesEnEdicion[String(id)];
            window.pintarPersonasEval(clave);
            if (clave === 'revisores') window.pintarPersonasEval('destinatarios');
            const inp = document.getElementById(cfg.buscador);
            if (inp) window.buscarPersonaEval(clave, inp.value);
        };

        window.pintarPersonasEval = (clave) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const container = document.getElementById(cfg.fichas);
            if (!container) return;

            if (cfg.elegidos.length === 0) {
                container.innerHTML = '<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Ninguno seleccionado.</span>';
                return;
            }

            container.innerHTML = cfg.elegidos.map(e => `
                <div style="display:flex; align-items:center; background:#f3e8ff; border:1px solid #d8b4fe; color:#6b21a8; padding:4px 10px; border-radius:20px; font-size:0.85rem; font-weight:500; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    ${window.sanitizeForHTML(e.name)}${clave === 'destinatarios' ? window.selloDeAsignacion(e.id) : ''}
                    <button onclick="window.quitarPersonaEval('${clave}', '${e.id}')" style="background:none; border:none; color:#d946ef; font-weight:bold; margin-left:6px; cursor:pointer; font-size:1rem; line-height:1;">✕</button>
                </div>
            `).join('');
        };

        // Deja el selector como si se abriera la hoja de cero, con la lista de
        // ids que traiga la encuesta. `null` o con 'ALL' es lo de siempre.
        window.prepararSelectorPersonas = (clave, ids) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const chk = document.getElementById(cfg.casilla);
            const concretos = Array.isArray(ids)
                ? ids.map(String).filter(x => x.trim() !== '' && x.toUpperCase() !== 'ALL')
                : [];

            if (concretos.length > 0) {
                if (chk) chk.checked = false;
                cfg.elegidos = concretos.map(id => {
                    const emp = (window.todosLosEmpleadosData || []).find(e => String(e.id) === String(id));
                    return { id: String(id), name: emp ? emp.name : `ID: ${id}` };
                });
            } else {
                if (chk) chk.checked = true;
                cfg.elegidos = [];
            }

            const inp = document.getElementById(cfg.buscador);
            if (inp) inp.value = '';
            const res = document.getElementById(cfg.resultados);
            if (res) res.innerHTML = '';
            window.toggleSelectorPersonas(clave);
        };

        // Lo que hay que guardar: la lista de ids, o ['ALL'] si manda la
        // casilla. Devuelve null si se desmarcó sin elegir a nadie, que es un
        // descuido y no una configuración.
        window.idsDelSelector = (clave) => {
            const cfg = window.SELECTORES_PERSONAS[clave];
            const chk = document.getElementById(cfg.casilla);
            if (!chk || chk.checked) return ['ALL'];
            if (cfg.elegidos.length === 0) return null;
            return cfg.elegidos.map(e => String(e.id));
        };

        console.log("✅ Evaluaciones Admin v52: INTEGRACIÓN DE VISTA Y CALIFICACIÓN.");
