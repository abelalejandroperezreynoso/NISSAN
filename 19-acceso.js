// ==========================================================================
// ACCESO CON NÚMERO DE EMPLEADO Y PIN
// ==========================================================================
// La pantalla de entrar, la primera vez, el cambio de un PIN temporal, el
// «Cambiar mi PIN» de la hoja de cada persona, el restablecer de un jefe o del
// administrador y la hoja de «Acceso y PINs» del panel de administración.
//
// Todo lo que decide vive en la base (`sql/acceso-con-pin.sql`): el navegador
// no ve ningún PIN ni la lista de quién lo tiene, y los intentos y el bloqueo
// los cuenta ella. Las piezas compartidas —`llamarAcceso`, `textoDeAcceso`,
// `tokenDeSesion`— están en `1-config.js`, que las usa también la hoja que pide
// el PIN a quien contesta desde el teléfono de su jefe.
//
//     window.entrarConPin()  window.activarAcceso()  window.cambiarPinAlEntrar()
//     window.abrirCambiarMiPin()                    // el propio
//     window.restablecerPinDe(empId, nombre)        // el de otro: jefe o admin
//     window.puedeRestablecerPinDe(empId)           // ¿le enseño el botón?
//     window.abrirAccesoAdmin()                     // la hoja del administrador
//
// La migración: quien todavía no tiene PIN entra una vez con su número —que
// era la contraseña de antes; el nombre era el usuario y estaba a la vista— y
// ahí crea su PIN y deja su correo. El administrador cierra esa puerta desde «Acceso y PINs»; a
// partir de ahí, quien falte necesita que le asignen un PIN temporal.

(() => {
    const $ = (id) => document.getElementById(id);
    const esc = (t) => window.sanitizeForHTML ? window.sanitizeForHTML(String(t == null ? '' : t)) : String(t == null ? '' : t);

    // Lo que dejó el primer paso: el número, y si hubo que cambiar un PIN
    // temporal, la sesión que se abrió con él.
    const estado = { numero: '', pendiente: null };

    const PASOS = ['login-paso-entrar', 'login-paso-pin', 'login-paso-activar', 'login-paso-cambiar'];

    const decir = (texto, tipo) => {
        const caja = $('error-msg');
        if (!caja) return;
        if (!texto) { caja.style.display = 'none'; caja.textContent = ''; return; }
        caja.textContent = texto;
        caja.classList.toggle('es-aviso', tipo === 'aviso');
        caja.style.display = 'block';
    };

    const verPaso = (id, titulo, explicacion) => {
        PASOS.forEach(p => { const f = $(p); if (f) f.hidden = p !== id; });
        $('login-titulo').textContent = titulo;
        const ex = $('login-explicacion');
        ex.textContent = explicacion || '';
        ex.hidden = !explicacion;
        decir('');
    };

    const ocupado = (btnId, si, texto) => {
        const b = $(btnId);
        if (!b) return;
        if (si) { b.dataset.texto = b.textContent; b.textContent = texto || 'Un momento…'; }
        else if (b.dataset.texto) b.textContent = b.dataset.texto;
        b.disabled = !!si;
    };

    const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
    const correoValido = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);


    const entrar = (ficha, token) => {
        window.guardarSesionConToken(ficha, token);
        ['login-pin', 'login-activar-pin', 'login-cambiar-pin']
            .forEach(id => { const c = $(id); if (c) c.value = ''; });
        estado.pendiente = null;
        window.mostrarDashboard(ficha);
    };

    // ======================================================================
    // LAS CUATRO CAJAS DEL PIN
    // ======================================================================
    // Cada campo de PIN se dibuja como cuatro cajas, pero el campo de verdad
    // sigue ahí: un <input> invisible tendido encima de ellas. Así el teclado
    // numérico, borrar, pegar y el autollenado del teléfono funcionan como en
    // cualquier campo, y las cajas sólo pintan lo que tiene.
    //
    // El `value` del campo se intercepta para que poner `campo.value = ''`
    // desde cualquier sitio repinte las cajas: un `input` programático no
    // dispara ningún evento.
    //
    //     <input type="password" data-cajas-pin data-siguiente="otro-id" …>
    //     window.montarCajasDePin(raiz)   // engancha los que haya dentro
    const DIGITOS_PIN = 4;
    const valorNativo = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    const montarUnaCaja = (campo) => {
        if (campo.__cajasPin) return;
        campo.__cajasPin = true;
        const caja = document.createElement('div');
        caja.className = 'pin-cajas';
        campo.parentNode.insertBefore(caja, campo);
        for (let i = 0; i < DIGITOS_PIN; i++) {
            const c = document.createElement('span');
            c.className = 'pin-caja';
            c.setAttribute('aria-hidden', 'true');
            caja.appendChild(c);
        }
        caja.appendChild(campo);
        campo.classList.add('pin-cajas-campo');
        campo.setAttribute('maxlength', String(DIGITOS_PIN));

        const pintar = () => {
            const largo = (valorNativo.get.call(campo) || '').length;
            const valor = valorNativo.get.call(campo) || '';
            const ver = campo.dataset.ver === '1';
            caja.querySelectorAll('.pin-caja').forEach((c, i) => {
                c.classList.toggle('llena', i < largo && !ver);
                c.textContent = ver && i < largo ? valor[i] : '';
                c.classList.toggle('actual', i === Math.min(largo, DIGITOS_PIN - 1));
            });
        };
        campo.__pintarCajas = pintar;
        Object.defineProperty(campo, 'value', {
            configurable: true,
            get() { return valorNativo.get.call(this); },
            set(v) { valorNativo.set.call(this, v); pintar(); }
        });

        campo.addEventListener('input', () => {
            const limpio = String(valorNativo.get.call(campo) || '').replace(/\D/g, '').slice(0, DIGITOS_PIN);
            if (limpio !== valorNativo.get.call(campo)) valorNativo.set.call(campo, limpio);
            pintar();
            caja.classList.remove('con-error');
            // El aviso del intento anterior ya no habla de lo que se escribe.
            if (campo.closest('#vista-login')) decir('');
            if (limpio.length === DIGITOS_PIN) {
                const sig = campo.dataset.siguiente && $(campo.dataset.siguiente);
                if (sig) sig.focus();
                else if (campo.dataset.alCompletar) window[campo.dataset.alCompletar]();
            }
        });
        // El cursor siempre al final: con cajas no hay dónde ponerlo en medio.
        const alFinal = () => { const n = (valorNativo.get.call(campo) || '').length; try { campo.setSelectionRange(n, n); } catch (e) { /* nada */ } };
        campo.addEventListener('focus', () => { caja.classList.add('con-foco'); alFinal(); });
        campo.addEventListener('click', alFinal);
        campo.addEventListener('blur', () => caja.classList.remove('con-foco'));
        pintar();
    };

    window.montarCajasDePin = (raiz) => {
        (raiz || document).querySelectorAll('input[data-cajas-pin]').forEach(montarUnaCaja);
    };

    // «Mostrar PIN»: los dígitos en las cajas en vez de los puntos, para
    // revisarlo cuando se escribe una sola vez.
    window.alternarVerPin = (id, boton) => {
        const campo = $(id);
        if (!campo) return;
        const ver = campo.dataset.ver !== '1';
        campo.dataset.ver = ver ? '1' : '';
        if (campo.__pintarCajas) campo.__pintarCajas();
        if (boton) boton.textContent = ver ? 'Ocultar PIN' : 'Mostrar PIN';
        campo.focus();
    };
    const ocultarPin = (id) => {
        const campo = $(id);
        if (!campo) return;
        campo.dataset.ver = '';
        if (campo.__pintarCajas) campo.__pintarCajas();
        const b = campo.closest('form') && campo.closest('form').querySelector('.login-ver-pin');
        if (b) b.textContent = 'Mostrar PIN';
    };

    // Sacude las cajas del campo: lo que se escribió no sirvió.
    const cajasConError = (id) => {
        const c = $(id) && $(id).closest('.pin-cajas');
        if (!c) return;
        c.classList.remove('con-error');
        void c.offsetWidth;
        c.classList.add('con-error');
    };

    window.montarCajasDePin(document);

    window.prepararPantallaDeAcceso = () => {
        estado.pendiente = null;
        verPaso('login-paso-entrar', 'Iniciar sesión', '');
        const campo = $('login-numero');
        if (campo && !campo.value) setTimeout(() => campo.focus(), 80);
    };

    window.volverAEntrar = () => {
        estado.pendiente = null;
        verPaso('login-paso-entrar', 'Iniciar sesión', '');
        setTimeout(() => $('login-numero').focus(), 60);
    };

    window.olvideMiPin = () => {
        decir('Pide a tu jefe inmediato o al administrador que restablezca tu PIN. Te darán uno temporal y, al entrar con él, crearás el tuyo.', 'aviso');
    };

    // Lo que se hace con una sesión recién abierta: entrar, o antes cambiar el
    // PIN temporal / dejar el correo que falta.
    const trasAcertar = (r) => {
        if (r.temporal || r.sin_correo) {
            estado.pendiente = r;
            $('login-cambiar-correo-campo').hidden = !r.sin_correo;
            verPaso('login-paso-cambiar', r.temporal ? 'Crea tu PIN' : 'Deja tu correo',
                r.temporal
                    ? 'Entraste con un PIN temporal. Crea ahora tu propio PIN de 4 números; el temporal deja de servir.'
                    : 'Falta tu correo. Escribe el de la empresa o, si no tienes, uno personal, y elige tu PIN.');
            return;
        }
        entrar(r.ficha, r.token);
    };

    // --- Paso 1: el número de empleado ---
    // Se le pregunta a la base sin PIN: si ya lo tiene, se le pide (sin decir
    // de quién es el número); si no, es la primera vez y se le enseña quién es
    // para que confirme.
    window.entrarConPin = async () => {
        const numero = soloDigitos($('login-numero').value) || String($('login-numero').value || '').trim();
        if (!numero) { decir('Escribe tu número de empleado.'); return; }
        estado.numero = numero;

        ocupado('btn-login-action', true, 'Buscando…');
        const r = await window.llamarAcceso('acceso_iniciar', { p_numero: numero, p_pin: '' });
        ocupado('btn-login-action', false);

        if (r.motivo === 'falta_pin') {
            $('login-pin-numero').textContent = numero;
            $('login-pin').value = '';
            verPaso('login-paso-pin', 'Escribe tu PIN', '');
            setTimeout(() => $('login-pin').focus(), 60);
            return;
        }

        if (r.motivo === 'sin_pin') {
            if (r.acceso_por_numero === false) { decir(window.textoDeAcceso({ motivo: 'cerrado' })); return; }
            const p = r.persona || {};
            $('login-persona-nombre').textContent = p.nombre || `Número ${numero}`;
            $('login-persona-detalle').textContent = [p.puesto, p.departamento].filter(Boolean).join(' · ');
            $('login-persona-detalle').hidden = !(p.puesto || p.departamento);
            $('login-confirmar-persona').hidden = false;
            $('login-activar-correo-paso').hidden = true;
            $('login-activar-pin-paso').hidden = true;
            verPaso('login-paso-activar', 'Primera vez', 'Con ese número de empleado encontramos a:');
            return;
        }

        // Sin el script en la base se entra como antes: con el número, que era
        // la contraseña (el nombre era el usuario y estaba a la vista).
        if (r.motivo === 'sin_script') {
            ocupado('btn-login-action', true, 'Entrando…');
            const lista = await window.cargarEmpleadosParaLogin();
            ocupado('btn-login-action', false);
            const u = lista.find(e => String(e.id) === numero);
            if (!u) { decir(window.textoDeAcceso({ motivo: 'incorrecto' })); return; }
            entrar(u, null);
            return;
        }

        if (r.motivo === 'incorrecto') { decir('No encontramos ese número de empleado. Revísalo.'); return; }
        decir(window.textoDeAcceso(r));
    };

    // --- Paso 1b: el PIN de quien ya lo tiene ---
    window.confirmarPinDeEntrada = async () => {
        const pin = soloDigitos($('login-pin').value);
        if (pin.length !== 4) { decir('Escribe tu PIN de 4 números.'); return; }
        ocupado('btn-login-pin', true, 'Entrando…');
        const r = await window.llamarAcceso('acceso_iniciar', { p_numero: estado.numero, p_pin: pin });
        ocupado('btn-login-pin', false);
        if (r.ok) { trasAcertar(r); return; }
        cajasConError('login-pin');
        decir(r.motivo === 'incorrecto' ? 'PIN incorrecto.' + (r.restantes !== undefined && r.restantes <= 3
            ? ` Te ${r.restantes === 1 ? 'queda 1 intento' : 'quedan ' + r.restantes + ' intentos'} antes de que se bloquee.` : '')
            : window.textoDeAcceso(r));
        $('login-pin').value = '';
        $('login-pin').focus();
    };

    // --- Paso 2: la primera vez ---
    // Tres pantallas seguidas: confirma que es esa persona, deja su correo y
    // crea el PIN, que se escribe una sola vez («Mostrar PIN» para revisarlo).
    const verSubpaso = (cual) => {
        $('login-confirmar-persona').hidden = cual !== 'persona';
        $('login-activar-correo-paso').hidden = cual !== 'correo';
        $('login-activar-pin-paso').hidden = cual !== 'pin';
        decir('');
    };

    window.confirmarPersona = (soyYo) => {
        if (!soyYo) {
            window.volverAEntrar();
            decir('Revisa tu número de empleado y vuelve a escribirlo.');
            return;
        }
        verSubpaso('correo');
        $('login-explicacion').textContent = 'Deja tu correo de la empresa.';
        setTimeout(() => $('login-activar-correo').focus(), 60);
    };

    window.continuarConCorreo = () => {
        const correo = $('login-activar-correo').value.trim().toLowerCase();
        if (!correoValido(correo)) { decir(window.textoDeAcceso({ motivo: 'correo' })); return; }
        $('login-activar-pin').value = '';
        ocultarPin('login-activar-pin');
        verSubpaso('pin');
        $('login-explicacion').textContent = 'Crea el PIN de 4 números con el que vas a entrar desde ahora.';
        setTimeout(() => $('login-activar-pin').focus(), 60);
    };

    window.volverAlCorreo = () => {
        verSubpaso('correo');
        $('login-explicacion').textContent = 'Deja tu correo de la empresa.';
    };

    // El formulario es uno solo: Enter en el correo continúa, en el PIN crea.
    window.enviarPasoActivar = () => {
        if (!$('login-activar-correo-paso').hidden) window.continuarConCorreo();
        else if (!$('login-activar-pin-paso').hidden) window.activarAcceso();
    };

    window.activarAcceso = async () => {
        const correo = $('login-activar-correo').value.trim().toLowerCase();
        const pin = soloDigitos($('login-activar-pin').value);
        if (!correoValido(correo)) { window.volverAlCorreo(); decir(window.textoDeAcceso({ motivo: 'correo' })); return; }
        if (pin.length !== 4) { decir('El PIN debe ser de 4 números.'); cajasConError('login-activar-pin'); return; }

        ocupado('btn-login-activar', true, 'Guardando…');
        const r = await window.llamarAcceso('acceso_activar',
            { p_numero: estado.numero, p_nombre: '', p_pin: pin, p_correo: correo });
        ocupado('btn-login-activar', false);

        if (r.ok) { entrar(r.ficha, r.token); return; }
        if (r.motivo === 'ya_tiene_pin') { window.volverAEntrar(); decir(window.textoDeAcceso(r), 'aviso'); return; }
        if (r.motivo === 'correo') { window.volverAlCorreo(); decir(window.textoDeAcceso(r)); return; }
        decir(window.textoDeAcceso(r));
        if (r.motivo === 'pin_debil') { cajasConError('login-activar-pin'); $('login-activar-pin').value = ''; $('login-activar-pin').focus(); }
    };

    // --- Paso 3: cambiar el PIN temporal (o dejar el correo que falta) ---
    window.cambiarPinAlEntrar = async () => {
        const p = estado.pendiente;
        if (!p) { window.volverAEntrar(); return; }
        const pin = soloDigitos($('login-cambiar-pin').value);
        const correo = $('login-cambiar-correo-campo').hidden ? '' : $('login-cambiar-correo').value.trim().toLowerCase();
        if (!$('login-cambiar-correo-campo').hidden && !correoValido(correo)) { decir(window.textoDeAcceso({ motivo: 'correo' })); return; }
        if (pin.length !== 4) { decir('El PIN debe ser de 4 números.'); cajasConError('login-cambiar-pin'); return; }

        ocupado('btn-login-cambiar', true, 'Guardando…');
        const r = await window.llamarAcceso('acceso_cambiar_pin', { p_token: p.token, p_pin: pin, p_correo: correo });
        ocupado('btn-login-cambiar', false);
        if (r.ok) { entrar(p.ficha, p.token); return; }
        decir(window.textoDeAcceso(r));
        if (r.motivo === 'pin_debil') { cajasConError('login-cambiar-pin'); $('login-cambiar-pin').value = ''; $('login-cambiar-pin').focus(); }
    };

    // ======================================================================
    // HOJAS: cambiar mi PIN y el PIN temporal de otro
    // ======================================================================
    const montar = (id, html) => {
        let hoja = $(id);
        if (hoja) return hoja;
        const caja = document.createElement('div');
        caja.innerHTML = html.trim();
        hoja = caja.firstElementChild;
        document.body.appendChild(hoja);
        return hoja;
    };

    const hojaCambiarPin = () => montar('modal-cambiar-pin', `
    <div id="modal-cambiar-pin" class="hoja-overlay" style="z-index:5200;">
        <div class="form-content hoja-contenido" style="max-width:420px; overflow-y:auto; padding:12px 25px 25px;">
            <div class="hoja-encabezado">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Cambiar mi PIN</h3>
                    <div class="hoja-subtitulo" id="subtitulo-cambiar-pin"></div>
                </div>
                <button onclick="window.cerrarCambiarMiPin()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
            </div>
            <form onsubmit="event.preventDefault(); window.guardarMiPin();" novalidate>
                <div class="form-group">
                    <label for="inp-mi-pin">Nuevo PIN de 4 números</label>
                    <input type="password" id="inp-mi-pin" data-cajas-pin data-siguiente="inp-mi-pin2" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label for="inp-mi-pin2">Repite tu PIN</label>
                    <input type="password" id="inp-mi-pin2" data-cajas-pin inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label for="inp-mi-correo">Correo <span style="font-weight:400; color:#8e8e93;">(déjalo vacío para no cambiarlo)</span></label>
                    <input type="email" id="inp-mi-correo" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false">
                </div>
                <div id="error-cambiar-pin" class="acceso-error" hidden></div>
                <button type="submit" id="btn-guardar-mi-pin" class="btn-login" style="margin-top:4px;">Guardar</button>
            </form>
        </div>
    </div>`);

    window.abrirCambiarMiPin = () => {
        if (!window.tokenDeSesion(true)) {
            alert(window.textoDeAcceso({ motivo: 'sesion' }));
            return;
        }
        const hoja = hojaCambiarPin();
        window.montarCajasDePin(hoja);
        ['inp-mi-pin', 'inp-mi-pin2', 'inp-mi-correo'].forEach(id => { $(id).value = ''; });
        $('error-cambiar-pin').hidden = true;
        $('subtitulo-cambiar-pin').textContent = '';
        hoja.style.display = 'flex';
        setTimeout(() => $('inp-mi-pin').focus(), 80);
    };

    window.cerrarCambiarMiPin = () => {
        const hoja = $('modal-cambiar-pin');
        if (hoja) hoja.style.display = 'none';
    };

    window.guardarMiPin = async () => {
        const error = (t) => { const e = $('error-cambiar-pin'); e.textContent = t; e.hidden = !t; };
        const pin = soloDigitos($('inp-mi-pin').value);
        const pin2 = soloDigitos($('inp-mi-pin2').value);
        const correo = $('inp-mi-correo').value.trim().toLowerCase();
        if (pin.length !== 4) { error('El PIN debe ser de 4 números.'); return; }
        if (pin !== pin2) { error('Los dos PIN no coinciden.'); return; }
        if (correo && !correoValido(correo)) { error(window.textoDeAcceso({ motivo: 'correo' })); return; }

        const btn = $('btn-guardar-mi-pin');
        btn.disabled = true;
        $('subtitulo-cambiar-pin').textContent = 'Guardando…';
        const r = await window.llamarAcceso('acceso_cambiar_pin', { p_token: window.tokenDeSesion(true), p_pin: pin, p_correo: correo });
        btn.disabled = false;
        $('subtitulo-cambiar-pin').textContent = '';
        if (!r.ok) { error(window.textoDeAcceso(r)); return; }
        window.cerrarCambiarMiPin();
        alert('✅ Tu PIN quedó cambiado. Úsalo la próxima vez que entres.');
    };

    const hojaPinTemporal = () => montar('modal-pin-temporal', `
    <div id="modal-pin-temporal" class="hoja-overlay" style="z-index:6200;">
        <div class="form-content hoja-contenido" style="max-width:420px; overflow-y:auto; padding:12px 25px 25px;">
            <div class="hoja-encabezado">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">PIN temporal</h3>
                    <div class="hoja-subtitulo" id="subtitulo-pin-temporal"></div>
                </div>
                <button onclick="window.cerrarPinTemporal()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
            </div>
            <div id="pin-temporal-cifra" class="acceso-pin-temporal"></div>
            <p class="acceso-nota">Dáselo en persona. Entra con su número de empleado y este PIN, y en ese momento se le pide crear el suyo.</p>
            <button type="button" class="btn-login" onclick="window.cerrarPinTemporal()">Listo</button>
        </div>
    </div>`);

    window.mostrarPinTemporal = (nombre, numero, pin) => {
        const hoja = hojaPinTemporal();
        $('subtitulo-pin-temporal').textContent = `${nombre || ''}${numero ? ' · Núm. ' + numero : ''}`;
        $('pin-temporal-cifra').textContent = pin;
        hoja.style.display = 'flex';
    };

    window.cerrarPinTemporal = () => {
        const hoja = $('modal-pin-temporal');
        if (hoja) hoja.style.display = 'none';
        if ($('pin-temporal-cifra')) $('pin-temporal-cifra').textContent = '';
    };

    // ¿Está esta persona por debajo de quien mira en la cadena de mando? Es lo
    // que la base comprueba al restablecer; aquí sólo decide si se enseña el
    // botón.
    window.puedeRestablecerPinDe = (empId) => {
        let yo = null;
        try { yo = JSON.parse(localStorage.getItem('usuarioLogueado') || 'null'); } catch (e) { /* nada */ }
        if (!yo || String(yo.id) === String(empId)) return false;
        if (window.modoAdminActivo) return true;
        const plantilla = window.todosLosEmpleadosData || [];
        const porId = new Map(plantilla.map(e => [String(e.id), e]));
        let actual = porId.get(String(empId));
        const vistos = new Set();
        while (actual && actual.supId && !vistos.has(String(actual.id))) {
            vistos.add(String(actual.id));
            if (String(actual.supId) === String(yo.id)) return true;
            actual = porId.get(String(actual.supId));
        }
        return false;
    };

    // Devuelve el resultado de la base; `preguntar` en false lo usa quien ya
    // confirmó por su cuenta (el asistente, con su tarjeta).
    window.restablecerPinDe = async (empId, nombre, opciones) => {
        const { preguntar = true, enseñar = true } = opciones || {};
        const token = window.tokenDeSesion();
        if (!token) {
            const r = { ok: false, motivo: 'sesion' };
            if (enseñar) alert(window.textoDeAcceso(r));
            return r;
        }
        if (preguntar && !confirm(`¿Restablecer el PIN de ${nombre || 'esta persona'}?\n\nSe le asigna un PIN temporal que tendrá que cambiar al entrar. El que tenía deja de servir.`)) {
            return { ok: false, motivo: 'cancelado' };
        }
        const r = await window.llamarAcceso('acceso_restablecer', { p_token: token, p_objetivo: String(empId) });
        if (enseñar) {
            if (r.ok) window.mostrarPinTemporal(r.nombre || nombre, empId, r.pin);
            else alert(window.textoDeAcceso(r));
        }
        if (r.ok && window.accesoAdmin && window.accesoAdmin.personas) {
            const p = window.accesoAdmin.personas.find(x => String(x.id) === String(empId));
            if (p) { p.pin = true; p.temporal = true; p.bloqueado = false; }
            window.pintarAccesoAdmin();
        }
        return r;
    };

    // ======================================================================
    // «Acceso y PINs», para el administrador
    // ======================================================================
    window.accesoAdmin = { personas: null, abierto: true, filtro: 'todos', texto: '' };

    const hojaAcceso = () => montar('modal-acceso', `
    <div id="modal-acceso" class="hoja-overlay" style="z-index:2000;">
        <div class="hoja-contenido" style="max-width:560px; overflow:hidden; padding:12px 0 0; display:flex; flex-direction:column;">
            <div class="hoja-encabezado-lista">
                <div style="min-width:0;">
                    <h3 class="hoja-titulo">Acceso y PINs</h3>
                    <div class="hoja-subtitulo" id="subtitulo-acceso"></div>
                </div>
                <button onclick="window.cerrarAccesoAdmin()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
            </div>
            <div class="acceso-filtros">
                <input type="search" id="buscador-acceso" placeholder="Buscar por nombre o número"
                       oninput="window.accesoAdmin.texto = this.value; window.pintarAccesoAdmin();"
                       autocomplete="off" autocorrect="off" spellcheck="false">
                <div class="acceso-chips" id="chips-acceso"></div>
            </div>
            <div id="cuerpo-acceso" class="hoja-cuerpo-formulario"></div>
        </div>
    </div>`);

    window.abrirAccesoAdmin = async () => {
        if (window.checkAdmin && !window.checkAdmin()) return;
        const hoja = hojaAcceso();
        hoja.style.display = 'flex';
        $('subtitulo-acceso').textContent = 'Cargando…';
        $('cuerpo-acceso').innerHTML = '<div class="persona-vacio">Cargando…</div>';

        if (!window.tokenDeSesion()) {
            $('subtitulo-acceso').textContent = '';
            $('cuerpo-acceso').innerHTML = `<div class="acceso-aviso">${esc(window.textoDeAcceso({ motivo: 'sesion' }))}</div>`;
            return;
        }
        const [r] = await Promise.all([
            window.llamarAcceso('acceso_resumen', { p_token: window.tokenDeSesion() }),
            (window.todosLosEmpleadosData || []).length ? null : window.cargarDatosEmpleados && window.cargarDatosEmpleados()
        ]);
        if (!r.ok) {
            $('subtitulo-acceso').textContent = '';
            const texto = r.motivo === 'sin_permiso'
                ? 'Tu número no está entre los administradores de acceso de la base (tabla administradores_acceso).'
                : window.textoDeAcceso(r);
            $('cuerpo-acceso').innerHTML = `<div class="acceso-aviso">${esc(texto)}</div>`;
            return;
        }
        window.accesoAdmin.personas = r.personas || [];
        window.accesoAdmin.abierto = r.acceso_por_numero !== false;
        window.pintarAccesoAdmin();
    };

    window.cerrarAccesoAdmin = () => {
        const hoja = $('modal-acceso');
        if (hoja) hoja.style.display = 'none';
    };

    const estadoDePersona = (p) => p.bloqueado ? 'bloqueado' : !p.pin ? 'sin' : p.temporal ? 'temporal' : 'activo';
    const ROTULO_ESTADO = { activo: 'Con PIN', temporal: 'Temporal', sin: 'Sin PIN', bloqueado: 'Bloqueado' };

    window.filtrarAccesoAdmin = (f) => { window.accesoAdmin.filtro = f; window.pintarAccesoAdmin(); };

    window.pintarAccesoAdmin = () => {
        const a = window.accesoAdmin;
        const cuerpo = $('cuerpo-acceso');
        if (!cuerpo || !a.personas) return;
        const plantilla = new Map((window.todosLosEmpleadosData || []).map(e => [String(e.id), e]));
        const gente = a.personas.map(p => ({ ...p, emp: plantilla.get(String(p.id)) || null, estado: estadoDePersona(p) }));

        const total = gente.length;
        const cuenta = (e) => gente.filter(g => g.estado === e).length;
        const conPin = gente.filter(g => g.pin).length;
        const conCorreo = gente.filter(g => g.correo).length;
        $('subtitulo-acceso').textContent = `${conPin} de ${total} con PIN · ${conCorreo} correos`;

        const chips = [['todos', 'Todos', total], ['sin', 'Sin PIN', cuenta('sin')], ['temporal', 'Temporal', cuenta('temporal')],
            ['bloqueado', 'Bloqueados', cuenta('bloqueado')], ['activo', 'Con PIN', cuenta('activo')]];
        $('chips-acceso').innerHTML = chips.map(([k, r, n]) =>
            `<button type="button" class="acceso-chip${a.filtro === k ? ' esta-elegido' : ''}" onclick="window.filtrarAccesoAdmin('${k}')">${r} · ${n}</button>`).join('');

        const texto = String(a.texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
        const lista = gente
            .filter(g => a.filtro === 'todos' || g.estado === a.filtro)
            .filter(g => !texto || String(g.id).includes(texto)
                || String(g.emp ? g.emp.name : '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(texto))
            .sort((x, y) => String(x.emp ? x.emp.name : x.id).localeCompare(String(y.emp ? y.emp.name : y.id), 'es'));

        const MAX = 150;
        const pct = total ? Math.round(conPin / total * 100) : 0;
        const filas = lista.slice(0, MAX).map(g => {
            const nombre = g.emp ? g.emp.name : `Núm. ${g.id}`;
            const detalle = [`Núm. ${g.id}`, g.emp && g.emp.dept, g.correo].filter(Boolean).join(' · ');
            return `
            <div class="fila-ios acceso-fila">
                <span class="fila-ios-texto">
                    <span class="fila-ios-titulo">${esc(nombre)}</span>
                    <span class="fila-ios-detalle">${esc(detalle)}</span>
                </span>
                <span class="acceso-estado acceso-estado--${g.estado}">${ROTULO_ESTADO[g.estado]}</span>
                <button type="button" class="acceso-boton" onclick="window.restablecerPinDe('${esc(g.id)}', window.accesoAdmin.nombreDe('${esc(g.id)}'))">Restablecer</button>
            </div>`;
        }).join('');

        cuerpo.innerHTML = `
            <div class="hoja-grupo-titulo">Migración</div>
            <div class="lista-ios persona-seccion acceso-resumen">
                <div class="acceso-resumen-cifra">${conPin} <span>de ${total} con PIN · ${pct}%</span></div>
                <div class="acceso-barra"><div style="width:${pct}%"></div></div>
                <div class="acceso-resumen-detalle">${cuenta('temporal')} con PIN temporal · ${cuenta('bloqueado')} bloqueados · ${conCorreo} correos recogidos</div>
                <div class="acceso-ajuste">
                    <span>
                        <b>Entrada por número: ${a.abierto ? 'abierta' : 'cerrada'}</b>
                        <span>${a.abierto
                            ? 'Quien no tiene PIN entra una vez con su número y su nombre y crea el suyo.'
                            : 'Quien no tiene PIN necesita que su jefe o tú le asignen uno temporal.'}</span>
                    </span>
                    <button type="button" class="acceso-boton" onclick="window.ajustarEntradaPorNumero(${!a.abierto})">${a.abierto ? 'Cerrar' : 'Abrir'}</button>
                </div>
                <button type="button" class="acceso-enlace" onclick="window.descargarCorreosAcceso()">Descargar correos (CSV)</button>
            </div>
            <div class="hoja-grupo-titulo">Personas · ${lista.length}</div>
            <div class="lista-ios persona-seccion">${filas || '<div class="persona-vacio">Nadie con ese filtro.</div>'}</div>
            ${lista.length > MAX ? `<div class="acceso-nota">Se ven ${MAX} de ${lista.length}. Escribe un nombre o número para encontrar a alguien.</div>` : ''}`;
    };

    window.accesoAdmin.nombreDe = (id) => {
        const e = (window.todosLosEmpleadosData || []).find(x => String(x.id) === String(id));
        return e ? e.name : '';
    };

    window.ajustarEntradaPorNumero = async (abrir) => {
        const aviso = abrir
            ? '¿Volver a abrir la entrada por número?\n\nQuien todavía no tenga PIN podrá crearlo entrando con su número y su nombre.'
            : '¿Cerrar la entrada por número?\n\nQuien todavía no tenga PIN ya no podrá crearlo solo: tendrá que asignárselo su jefe o el administrador.';
        if (!confirm(aviso)) return;
        const r = await window.llamarAcceso('acceso_ajustar', { p_token: window.tokenDeSesion(), p_acceso_por_numero: !!abrir });
        if (!r.ok) { alert(window.textoDeAcceso(r)); return; }
        window.accesoAdmin.abierto = r.acceso_por_numero !== false;
        window.pintarAccesoAdmin();
    };

    window.descargarCorreosAcceso = () => {
        const plantilla = new Map((window.todosLosEmpleadosData || []).map(e => [String(e.id), e]));
        const comillas = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const filas = [['Numero', 'Nombre', 'Departamento', 'Puesto', 'Correo', 'Estado']];
        (window.accesoAdmin.personas || []).forEach(p => {
            const e = plantilla.get(String(p.id)) || {};
            filas.push([p.id, e.name, e.dept, e.puesto, p.correo, ROTULO_ESTADO[estadoDePersona(p)]]);
        });
        const csv = '﻿' + filas.map(f => f.map(comillas).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `correos-plantilla-${window.diaLocal ? window.diaLocal(new Date()) : 'hoy'}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
})();
