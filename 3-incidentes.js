// ==========================================
// 3-incidentes.js (VERSIÓN 16: TEXTO DE BOTÓN ACTUALIZADO)
// ==========================================

function base64ToBlob(base64, mimeType) {
    const byteString = atob(base64.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
}

window.obtenerJerarquiaCompleta = (liderId) => {
    const all = window.todosLosEmpleadosData || [];
    const hierarchyIds = new Set([String(liderId)]);
    const queue = [String(liderId)];

    while(queue.length > 0) {
        const currentId = queue.shift();
        const children = all.filter(e => String(e.supId) === currentId);
        children.forEach(child => {
            const childId = String(child.id);
            if (!hierarchyIds.has(childId)) {
                hierarchyIds.add(childId);
                queue.push(childId);
            }
        });
    }
    return hierarchyIds;
};

window.recargarListadoCompleto = () => {
    window.paginaActual = 0;
    const container = document.getElementById('container-incidentes');
    if(container) container.innerHTML = '';
    window.cargarIncidentes();
};

window.realizarBusqueda = () => { window.recargarListadoCompleto(); };

window.limpiarBusqueda = () => {
    document.getElementById('search-input-text').value = '';
    document.getElementById('search-input-date').value = '';
    window.recargarListadoCompleto();
};

// =========================================================
// --- GESTIÓN DE INCIDENTES (LISTA GENERAL) ---
// =========================================================

window.cargarIncidentes = async function() {
    document.getElementById('search-bar-container').style.display = 'flex';
    
    const container = document.getElementById('container-incidentes');
    
    // NUEVO: Layout tipo cuadrícula en lugar de lista hacia abajo
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
    container.style.gap = '15px';
    container.style.padding = '10px 5px';

    if (window.paginaActual === 0) container.innerHTML = '';

    const loading = document.getElementById('loading-indicator');
    const btnMas = document.getElementById('btn-mas');
    
    if(loading) loading.style.display = 'block';
    if(btnMas) btnMas.style.display = 'none';
    try {
        const filtroTipo = window.currentTypeFilter || "";
        const searchInputText = document.getElementById('search-input-text');
        const searchInputDate = document.getElementById('search-input-date');
        
        const searchText = searchInputText ? searchInputText.value.trim() : "";
        const searchDate = searchInputDate ? searchInputDate.value : "";

        let query = sb.from('incidents').select('*, incident_signatures(employee_id)').order('date', { ascending: false });

        if (window.tempIdFiltro) {
            query = query.eq('id', window.tempIdFiltro);
            document.getElementById('search-bar-container').style.display = 'none';
        } else {
            const desde = window.paginaActual * window.TAMANO_PAGINA;
            query = query.range(desde, desde + window.TAMANO_PAGINA - 1);
            if(filtroTipo) query = query.eq('tipo', filtroTipo);
            if(searchText) query = query.ilike('title', `%${searchText}%`);
            if(searchDate) query = query.eq('date', searchDate);
        }

        const { data, error } = await query;

        if(error || !data || data.length === 0) {
            if(loading) loading.style.display = 'none';
            if(window.paginaActual === 0) {
                container.style.display = 'block'; // Quitar grid si está vacío
                container.insertAdjacentHTML('beforeend', "<p align='center' style='color:#64748b; margin-top:20px;'>No hay registros.</p>");
            }
            return;
        }
        window.paginaActual++;

        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        const hierarchyIds = window.obtenerJerarquiaCompleta(user.id);
        const todosLosEmpleados = window.todosLosEmpleadosData || [];
        const myFullTeam = todosLosEmpleados.filter(e => hierarchyIds.has(String(e.id)));

        const htmlPromises = data.map(async (dataItem) => {
            window.incidentCache[dataItem.id] = dataItem;
            
            let isSigned = dataItem.incident_signatures ? dataItem.incident_signatures.some(s => String(s.employee_id) === String(user.id)) : false;
            const tipo = dataItem.tipo || 'Incidente';
            
            let nombreIcono = 'Difusion.png';
            if (tipo === 'Incidente') nombreIcono = 'Incidente.png';

            // Etiqueta roja de severidad
            let badgeHtml = '';
            if (tipo === 'Incidente' && dataItem.grado) {
                const gradoTexto = dataItem.grado.replace('Incidente ', '').trim();
                badgeHtml = `<div style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; font-size: 0.6rem; font-weight: 800; padding: 2px 4px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); border: 1px solid white; z-index: 5;">${gradoTexto}</div>`;
            }

            // Etiqueta redonda visual (Firmado o Pendiente)
            let signedBadge = '';
            if (isSigned) {
                signedBadge = `<div style="position: absolute; bottom: -5px; right: -5px; background: #16a34a; color: white; font-size: 0.7rem; font-weight:bold; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 5;" title="Ya firmado">✓</div>`;
            } else if (tipo !== 'Capacitación') {
                signedBadge = `<div style="position: absolute; bottom: -5px; right: -5px; background: #ea580c; color: white; font-size: 0.7rem; font-weight:bold; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 5;" title="Falta firmar">!</div>`;
            }

            // Progreso simple para jefes/admin
            let progressText = '';
            if (window.modoAdminActivo || hierarchyIds.size > 1) {
                const fechaInc = window.fechaDeRegistro(dataItem.date);
                const eligibleTeam = myFullTeam.filter(e => window.leTocaFirmar(e, fechaInc));
                const totalMyTarget = eligibleTeam.length;
                let myScopeSigned = 0;
                if (totalMyTarget > 0 && dataItem.incident_signatures) {
                     const signaturesSet = new Set(dataItem.incident_signatures.map(s => String(s.employee_id)));
                     myScopeSigned = eligibleTeam.filter(e => signaturesSet.has(String(e.id))).length;
                }
                if (tipo !== 'Capacitación') {
                    const pct = totalMyTarget > 0 ? Math.round((myScopeSigned / totalMyTarget) * 100) : 0;
                    let colorProgreso = pct === 100 ? '#16a34a' : '#ea580c';
                    progressText = `<div style="font-size:0.65rem; color:${colorProgreso}; font-weight:bold; margin-top:4px;">Avance: ${pct}%</div>`;
                }
            }

            // Nuevo diseño cuadrado tipo iOS App
            return `
            <div id="card-${dataItem.id}" onclick="window.abrirDetalleIndependiente('${dataItem.id}')" style="display: flex; flex-direction: column; align-items: center; text-align: center; cursor: pointer; background: white; padding: 15px 10px; border-radius: 16px; border: 1px solid #f1f5f9; transition: transform 0.2s, box-shadow 0.2s; width: 100%; box-sizing: border-box;" onmouseover="this.style.transform='scale(1.03)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.05)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                <div style="position: relative; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; background: #f8fafc; border-radius: 14px; padding: 5px;">
                    <img src="${nombreIcono}" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1));">
                    ${badgeHtml}
                    ${signedBadge}
                </div>
                <div style="font-weight:700; color:#334155; font-size:0.75rem; line-height:1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; margin-bottom: 4px; word-break: break-word;">${dataItem.title}</div>
                <div style="font-size: 0.65rem; color: #94a3b8; margin-top: auto;">${dataItem.date}</div>
                ${progressText}
            </div>
            `;
        });

        const tarjetas = await Promise.all(htmlPromises);
        container.insertAdjacentHTML('beforeend', tarjetas.join(''));
        if(loading) loading.style.display = 'none';
        
        if(!window.tempIdFiltro && data.length >= window.TAMANO_PAGINA) {
            if(btnMas) btnMas.style.display = 'block';
        }

        if (window.tempIdFiltro) {
            const idExpandir = window.tempIdFiltro;
            setTimeout(() => window.abrirDetalleIndependiente(idExpandir), 300);
            window.tempIdFiltro = null;
        }

    } catch (err) {
        console.error("Error al cargar listado general:", err);
        if(loading) loading.style.display = 'none';
        container.style.display = 'block';
        container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Hubo un error al cargar la lista. Por favor recarga la página.</div>`;
    }
};
// =========================================================
// --- MODAL INDEPENDIENTE BLINDADO (AUTOCREACIÓN HTML) ---
// =========================================================

window.abrirDetalleIndependiente = async (id) => {
    try {
        let modal = document.getElementById('modal-detalle-independiente');
        if (!modal) {
            const modalHTML = `
            <div id="modal-detalle-independiente" class="hoja-overlay" style="z-index:2500;">
                <div class="form-content hoja-contenido" style="max-width: 600px; background: #f8fafc; overflow: hidden; padding: 12px 0 0;">
                    <div class="hoja-encabezado-lista">
                        <h3 id="titulo-modal-detalle" class="hoja-titulo">Detalles del registro</h3>
                        <button onclick="document.getElementById('modal-detalle-independiente').style.display='none'" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
                    </div>
                    <div id="contenido-modal-detalle" style="flex:1; overflow-y: auto; padding: 20px;"></div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('modal-detalle-independiente');
        }

        const content = document.getElementById('contenido-modal-detalle');
        const titleEl = document.getElementById('titulo-modal-detalle');

        modal.style.display = 'flex';
        content.innerHTML = '<div style="text-align:center; padding:40px;"><div class="spinner" style="margin: 0 auto 15px auto;"></div><p style="color:#64748b;">Cargando información...</p></div>';

        const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
        const data = window.incidentCache[id];
        
        if (!data) {
            content.innerHTML = '<div style="text-align:center; padding:40px; color:#ef4444;">⚠️ Datos no encontrados.</div>';
            return;
        }

        titleEl.innerText = data.title;

        const parentId = data.linked_incident_id;
        let imageHtml = '';
        
        if (data.image_url) {
            const safeUrl = window.procesarUrlImagen ? window.procesarUrlImagen(data.image_url) : data.image_url;
            imageHtml = `<img src="${safeUrl}" onclick="if(window.abrirVisor) window.abrirVisor('${id}')" style="width:100%; border-radius:12px; margin-bottom:15px; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.05);" title="Toca para ampliar">`;
        } else if (parentId) {
            const { data: parentData } = await sb.from('incidents').select('image_url').eq('id', parentId).single();
            if(parentData && parentData.image_url) {
                 const safeParentUrl = window.procesarUrlImagen ? window.procesarUrlImagen(parentData.image_url) : parentData.image_url;
                 imageHtml = `<img src="${safeParentUrl}" onclick="if(window.abrirVisor) window.abrirVisor('${id}')" style="width:100%; border-radius:12px; margin-bottom:10px; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.05);" title="Imagen vinculada">`;
                 imageHtml += `<div style="text-align:center; font-size:0.8rem; color:#64748b; margin-bottom:15px;">(Imagen vinculada de la Capacitación)</div>`;
            }
        }

        if (data.tipo === 'Capacitación' && !parentId) {
            content.innerHTML = imageHtml || '<p style="text-align:center; color:#64748b;">Sin imágenes registradas.</p>';
            
            // Botones Admin para Capacitaciones limpias
            if (window.modoAdminActivo) {
                content.innerHTML += `
                <div style="display:flex; flex-wrap: wrap; gap:10px; justify-content:center; margin-top: 20px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px dashed #cbd5e1;">
                    <div style="font-size:0.8rem; color:#64748b; font-weight:bold; width:100%; text-align:center; margin-bottom: 5px;">Herramientas de Admin</div>
                    <button onclick="window.editar('${id}'); document.getElementById('modal-detalle-independiente').style.display='none';" style="flex:1; min-width:100px; background:white; color:#0284c7; border:1px solid #bae6fd; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">✏️ Editar</button>
                    <button onclick="window.borrar('${id}'); document.getElementById('modal-detalle-independiente').style.display='none';" style="flex:1; min-width:100px; background:white; color:#ef4444; border:1px solid #fecaca; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">🗑️ Borrar</button>
                </div>`;
            }
            return;
        }

        const { data: signatures } = await sb.from('incident_signatures').select('id, employee_id, signature_data, created_at, incident_id').eq('incident_id', id).order('created_at', { ascending: false });

        const hierarchyIds = window.obtenerJerarquiaCompleta(user.id);
        const myIdStr = String(user.id);
        
        const todosLosEmpleados = window.todosLosEmpleadosData || [];
        const myFullTeam = todosLosEmpleados.filter(e => hierarchyIds.has(String(e.id)));
        
        const fechaInc = window.fechaDeRegistro(data.date);
        const eligibleTeam = myFullTeam.filter(e => window.leTocaFirmar(e, fechaInc));
        const signedIds = new Set(signatures ? signatures.map(s => String(s.employee_id)) : []);
        const missingTeam = eligibleTeam.filter(e => !signedIds.has(String(e.id)) && String(e.id) !== myIdStr);

        let html = imageHtml;
        if(parentId) html += `<div style="background:#eff6ff; padding:10px; border-radius:8px; color:#1e40af; font-size:0.85rem; margin-bottom:15px; border:1px dashed #bfdbfe;">🔗 <b>Imágenes vinculadas desde otra capacitación.</b></div>`;

        // NUEVO: Agregamos botones de Admin dentro de la vista
        if (window.modoAdminActivo) {
            html += `
            <div style="display:flex; flex-wrap: wrap; gap:10px; justify-content:center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px dashed #cbd5e1;">
                <div style="font-size:0.8rem; color:#64748b; font-weight:bold; width:100%; text-align:center; margin-bottom: 5px;">Herramientas de Admin</div>
                <button onclick="window.editar('${id}'); document.getElementById('modal-detalle-independiente').style.display='none';" style="flex:1; min-width:100px; background:white; color:#0284c7; border:1px solid #bae6fd; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">✏️ Editar</button>
                <button onclick="window.borrar('${id}'); document.getElementById('modal-detalle-independiente').style.display='none';" style="flex:1; min-width:100px; background:white; color:#ef4444; border:1px solid #fecaca; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">🗑️ Borrar</button>
            </div>
            `;
        }

        const yaFirme = signedIds.has(myIdStr);
        const myPuesto = user.puesto ? user.puesto.trim().toUpperCase() : "";
        // La baja no cierra la sesión que ya estaba abierta, así que el estado
        // se mira en la caché de empleados y no en `usuarioLogueado`. Si la
        // caché aún no ha cargado, se da por activo y el botón sigue saliendo.
        const miFicha = (window.todosLosEmpleadosData || []).find(e => String(e.id) === myIdStr);
        const exentoDeFirmar = window.esPuestoExentoDeFirmar(myPuesto) || !window.empleadoActivo(miFicha);

        if (!yaFirme && !exentoDeFirmar && data.tipo !== 'Capacitación') {
            html += `
            <div style="background:#f0fdf4; border:2px dashed #4ade80; padding:25px; border-radius:16px; text-align:center; margin-bottom:20px;">
                <p style="margin-top:0; margin-bottom:8px; color:#166534; font-size:1.2rem; font-weight:bold;">¿Confirmas de enterado?</p>
                <p style="color:#15803d; font-size:0.9rem; margin-bottom:20px; margin-top:0;">He revisado la evidencia anterior y estoy de acuerdo.</p>
                <button onclick="if(window.abrirFirma) window.abrirFirma('${id}')" style="background:#22c55e; color:white; border:none; padding:14px 35px; border-radius:50px; font-weight:bold; cursor:pointer; font-size:1.1rem; box-shadow:0 4px 6px -1px rgba(34,197,94,0.4); transition: transform 0.2s;">Firmar de enterado</button>
            </div>`;
        } else if (yaFirme) {
            html += `<div style="text-align:center; padding:15px; background:#f1f5f9; border-radius:12px; color:#475569; font-weight:bold; margin-bottom:15px;">✅ Ya has firmado este registro</div>`;
        }

        if (missingTeam.length > 0) {
            html += `<h4 style="margin-bottom:10px; color:#ea580c; border-bottom:1px solid #fed7aa; padding-bottom:5px;">⚠️ Pendientes de Firma (Mi Estructura)</h4>`;
            html += `<div class="employee-grid" style="margin-bottom:20px;">`;
            missingTeam.forEach(emp => {
                html += `<div class="employee-card missing" onclick="if(window.abrirFirmaDelegada) window.abrirFirmaDelegada('${emp.id}', '${emp.name}', '${id}')" style="cursor:pointer; border-color:#fdba74;"><span class="missing-badge">Firmar</span><div class="missing-avatar">👤</div><div style="font-size:0.65rem; color:#64748b; margin-top:4px; line-height:1.1;">${emp.name}</div></div>`;
            });
            html += `</div>`;
        }

        const groups = {};
        if (signatures) {
            signatures.forEach(sig => {
                const signerId = String(sig.employee_id);
                const esMio = signerId === myIdStr;
                const esMiSubordinado = hierarchyIds.has(signerId);
                const soyAdmin = window.modoAdminActivo;
                if (soyAdmin || esMio || esMiSubordinado) {
                    const dept = window.employeeDeptMap ? (window.employeeDeptMap[signerId] || "Otros") : "Otros";
                    const sup = window.employeeSupMap ? (window.employeeSupMap[signerId] || "Sin Supervisor") : "Sin Supervisor";
                    if (!groups[dept]) groups[dept] = {};
                    if (!groups[dept][sup]) groups[dept][sup] = [];
                    groups[dept][sup].push(sig);
                }
            });
        }

        html += `<h4 style="margin-bottom:15px; color:#334155; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">📋 Firmas Recibidas</h4>`;
        
        if (Object.keys(groups).length === 0) html += '<p style="color:#94a3b8; font-style:italic;">No hay firmas visibles.</p>';
        else {
            for (const [dept, sups] of Object.entries(groups)) {
                html += `<div class="group-dept"><div class="group-dept-title">${dept}</div>`;
                for (const [sup, sigs] of Object.entries(sups)) {
                    html += `<div class="group-sup"><div class="group-sup-title"><span>👤</span> ${sup}</div><div class="employee-grid">`;
                    sigs.forEach(sig => {
                        const name = window.employeeNameMap ? (window.employeeNameMap[sig.employee_id] || "Desconocido") : "Desconocido";
                        const deleteBtn = window.modoAdminActivo ? `<button class="btn-del-sig" onclick="borrarFirma('${sig.id}', '${id}')">✕</button>` : '';
                        const safeSigUrl = window.procesarUrlImagen ? window.procesarUrlImagen(sig.signature_data) : sig.signature_data;
                        html += `<div class="employee-card">${deleteBtn}<img src="${safeSigUrl}" class="sig-img-small" loading="lazy"><div style="font-size:0.65rem; color:#334155; margin-top:4px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</div></div>`;
                    });
                    html += `</div></div>`;
                }
                html += `</div>`;
            }
        }
        content.innerHTML = html;

    } catch (err) {
        console.error("Error al abrir detalle:", err);
        const content = document.getElementById('contenido-modal-detalle');
        if (content) content.innerHTML = `<div style="text-align:center; padding:40px; color:#ef4444;">Ocurrió un error al cargar la información: ${err.message}</div>`;
    }
};
window.revisarYFirmar = (id) => { window.abrirDetalleIndependiente(id); };

window.toggleDetails = async (id) => {
    window.abrirDetalleIndependiente(id); // Forzamos a que siempre abra el modal
};

// =========================================================

window.idEmpleadoFirmando = null;

window.abrirFirma = (id) => {
    window.idFirmando = id;
    window.idEmpleadoFirmando = null;
    const h3 = document.querySelector('.firma-content h3');
    if(h3) h3.innerText = "Firmar de Conformidad";
    window.limpiarFirma();
    document.getElementById('modal-firma').style.display = 'flex';
};

window.abrirFirmaDelegada = (empId, empName, incidentId) => {
    window.idFirmando = incidentId;
    window.idEmpleadoFirmando = empId;
    const h3 = document.querySelector('.firma-content h3');
    if(h3) h3.innerText = `Firma de: ${empName}`;
    window.limpiarFirma();
    document.getElementById('modal-firma').style.display = 'flex';
};

window.guardarFirma = async () => {
    const btn = document.getElementById('btn-save-sig');
    const modalContent = document.querySelector('#modal-firma .firma-content');

    btn.disabled = true;
    btn.innerText = "⏳ Guardando...";
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';

    if (modalContent) {
        modalContent.style.pointerEvents = 'none';
        modalContent.style.opacity = '0.8';
    }

    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    const signerId = window.idEmpleadoFirmando || user.id;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    const blob = base64ToBlob(dataUrl, 'image/jpeg');
    const fileName = `signatures/${window.idFirmando}/${signerId}_${Date.now()}.jpg`;

    try {
        const { error: uploadError } = await sb.storage.from('signatures').upload(fileName, blob, { contentType: 'image/jpeg' });
        if(uploadError) throw uploadError;
        
        const { data: urlData } = sb.storage.from('signatures').getPublicUrl(fileName);
        
        const { error: dbError } = await sb.from('incident_signatures').insert({
            incident_id: window.idFirmando,
            employee_id: signerId,
            signature_data: urlData.publicUrl
        });
        if (dbError) throw dbError;

        if (window.invalidarCacheDashboard) window.invalidarCacheDashboard();

        if (window.idEmpleadoFirmando) {
            alert("✅ Firma delegada registrada.");
            window.cerrarFirma();
            const idIncidente = window.idFirmando;
            const modalIndep = document.getElementById('modal-detalle-independiente');
            if (modalIndep && modalIndep.style.display !== 'none') {
                window.abrirDetalleIndependiente(idIncidente);
            }
        } else {
            alert("✅ ¡Firma registrada exitosamente!");
            window.cerrarFirma();
            
            if (window.mostrandoPendientes) {
                 if(window.cargarVistaPendientes) window.cargarVistaPendientes('PROPIOS');
            } else if (window.mostrandoPendientesEquipo) {
                 if(window.cargarVistaPendientes) window.cargarVistaPendientes('EQUIPO');
            } else {
                 const btnSign = document.getElementById(`btn-sign-${window.idFirmando}`);
                 if (btnSign) btnSign.outerHTML = `<button class="btn-firmar btn-firmado" disabled>✅ Enterado</button>`;
            }
            
            const modalIndep = document.getElementById('modal-detalle-independiente');
            if (modalIndep && modalIndep.style.display !== 'none') {
                modalIndep.style.display = 'none';
            }
        }
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Confirmar";
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (modalContent) { modalContent.style.pointerEvents = 'auto'; modalContent.style.opacity = '1'; }
    }
};

window.borrarFirma = async (sigId, incidentId) => {
    if(!confirm("¿Eliminar esta firma?")) return;
    const { error } = await sb.from('incident_signatures').delete().eq('id', sigId);
    if(error) alert("Error");
    else {
        if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();
        const modalIndep = document.getElementById('modal-detalle-independiente');
        if (modalIndep && modalIndep.style.display !== 'none') {
            window.abrirDetalleIndependiente(incidentId);
        }
    }
};

window.galleryState = [];
const galleryContainer = document.getElementById('gallery-preview-container');
if(galleryContainer) {
    galleryContainer.addEventListener('dragover', e => {
        e.preventDefault();
        const draggable = document.querySelector('.dragging');
        if (!draggable) return;
        const afterElement = getDragAfterElement(galleryContainer, e.clientX, e.clientY);
        if (afterElement == null) galleryContainer.appendChild(draggable);
        else galleryContainer.insertBefore(draggable, afterElement);
    });
    galleryContainer.addEventListener('drop', e => e.preventDefault());
}

window.toggleGradoVisibility = () => {
    const el = document.getElementById('inp-tipo');
    if(!el) return;
    const tipo = el.value;
    const gradoDiv = document.getElementById('div-grado-container');
    if (tipo === 'Incidente') gradoDiv.style.display = 'block';
    else gradoDiv.style.display = 'none';
    const vinculoDiv = document.getElementById('div-vinculo-container');
    if (tipo === 'Difusión') vinculoDiv.style.display = 'block';
    else vinculoDiv.style.display = 'none';
};

window.buscarVinculo = (input) => {
    document.getElementById('inp-vinculo-id').value = '';
    const val = input.value.toLowerCase();
    const list = document.getElementById('vinculo-suggestions');
    list.innerHTML = '';
    if(val.length < 1) { list.style.display = 'none'; return; }
    const matches = window.listaCapacitaciones.filter(c => c.searchStr.includes(val));
    if(matches.length === 0) { list.style.display = 'none'; return; }
    list.style.display = 'block';
    matches.forEach(m => {
        const item = document.createElement('div');
        item.style.padding = '10px 12px'; item.style.borderBottom = '1px solid #f1f5f9'; item.style.cursor = 'pointer'; item.style.fontSize = '0.9rem';
        item.onmouseover = () => item.style.background = '#f1f5f9'; item.onmouseout = () => item.style.background = 'white';
        item.innerHTML = `<div style="font-weight:bold; color:#1e293b;">${m.title}</div><div style="font-size:0.75rem; color:#64748b;">📅 ${m.date}</div>`;
        item.onclick = () => { document.getElementById('inp-vinculo-search').value = `${m.date} - ${m.title}`; document.getElementById('inp-vinculo-id').value = m.id; list.style.display = 'none'; };
        list.appendChild(item);
    });
};

window.abrirModal = async () => {
    document.getElementById('modal-form').style.display = 'flex';
    window.galleryState = [];
    document.getElementById('inp-foto').value = '';
    document.getElementById('inp-vinculo-search').value = '';
    document.getElementById('inp-vinculo-id').value = '';
    document.getElementById('vinculo-suggestions').style.display = 'none';
    const { data: caps } = await sb.from('incidents').select('id, title, date').eq('tipo', 'Capacitación').order('date', { ascending: false }).limit(100);
    window.listaCapacitaciones = caps ? caps.map(c => ({ ...c, searchStr: (c.title + ' ' + c.date).toLowerCase() })) : [];
    
    if(window.idEditando) {
        document.getElementById('form-title').innerText = "Editar Registro";
        const data = window.incidentCache[window.idEditando];
        document.getElementById('inp-tipo').value = data.tipo;
        document.getElementById('inp-titulo').value = data.title;
        document.getElementById('inp-fecha').value = data.date;
        document.getElementById('inp-origen').value = data.origen || 'Otro';
        document.getElementById('inp-grado').value = data.grado || 'Otro';
        if(data.linked_incident_id) {
            document.getElementById('inp-vinculo-id').value = data.linked_incident_id;
            const found = window.listaCapacitaciones.find(c => c.id === data.linked_incident_id);
            if(found) document.getElementById('inp-vinculo-search').value = `${found.date} - ${found.title}`;
            else {
                const { data: single } = await sb.from('incidents').select('title, date').eq('id', data.linked_incident_id).single();
                if(single) document.getElementById('inp-vinculo-search').value = `${single.date} - ${single.title}`;
            }
        }
        window.toggleGradoVisibility();
        const { data: pics } = await sb.from('incident_gallery').select('*').eq('incident_id', window.idEditando).order('position', {ascending: true}).order('id', {ascending: true});
        if (pics) {
            pics.forEach(p => {
                let name = "Imagen";
                try { const parts = p.image_url.split('/'); name = decodeURIComponent(parts[parts.length - 1]).replace(/^\d+_/, ''); } catch(e){}
                const safeUrl = window.procesarUrlImagen ? window.procesarUrlImagen(p.image_url) : p.image_url;
                window.galleryState.push({ id: p.id, url: safeUrl, isNew: false, internalId: Math.random().toString(36), fileName: name });
            });
        }
    } else {
        document.getElementById('form-title').innerText = "Nuevo Registro";
        document.getElementById('inp-titulo').value = "";
        document.getElementById('inp-fecha').value = new Date().toISOString().split('T')[0];
        window.toggleGradoVisibility();
    }
    renderGallery();
};

document.getElementById('inp-foto').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => { window.galleryState.push({ id: `temp-${Date.now()}-${Math.random()}`, url: URL.createObjectURL(file), file: file, isNew: true, internalId: Math.random().toString(36), fileName: file.name }); });
    renderGallery();
});

document.getElementById('btn-paste').onclick = async () => {
    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                const blob = await item.getType(item.types[0]);
                const name = "pasted_" + Date.now() + ".png";
                const file = new File([blob], name, { type: blob.type });
                window.galleryState.push({ id: `temp-paste-${Date.now()}`, url: URL.createObjectURL(file), file: file, isNew: true, internalId: Math.random().toString(36), fileName: name });
            }
        }
        renderGallery();
    } catch (err) { alert("No se pudo pegar la imagen."); }
};

function renderGallery() {
    galleryContainer.innerHTML = '';
    window.galleryState.forEach((item, index) => {
        if(item.isDeleted) return;
        const div = document.createElement('div');
        div.className = 'gallery-preview-item'; div.draggable = true; div.dataset.internalId = item.internalId;
        div.innerHTML = `<div class="gallery-index-badge">${index + 1}</div><img src="${item.url}"><div class="gallery-filename">${item.fileName}</div><button class="btn-remove-img" onclick="removerItemGaleria(${index})">✕</button>`;
        div.addEventListener('dragstart', () => div.classList.add('dragging'));
        div.addEventListener('dragend', () => { div.classList.remove('dragging'); actualizarOrdenLogico(); });
        galleryContainer.appendChild(div);
    });
}

function actualizarOrdenLogico() {
    const newOrder = [];
    const domItems = galleryContainer.querySelectorAll('.gallery-preview-item');
    domItems.forEach(node => {
        const intId = node.dataset.internalId;
        const item = window.galleryState.find(x => x.internalId === intId);
        if(item) newOrder.push(item);
    });
    window.galleryState.forEach(x => { if(x.isDeleted) newOrder.push(x); });
    window.galleryState = newOrder;
    renderGallery();
}

function getDragAfterElement(container, x, y) {
    const draggableElements = [...container.querySelectorAll('.gallery-preview-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offsetX = x - (box.left + box.width / 2);
        const offsetY = y - (box.top + box.height / 2);
        const dist = (offsetX * offsetX) + (offsetY * offsetY);
        if (dist < closest.dist) return { dist: dist, element: child }; else return closest;
    }, { dist: Number.POSITIVE_INFINITY }).element;
}

window.removerItemGaleria = (index) => {
    if(!confirm("¿Quitar imagen?")) return;
    const visualItems = window.galleryState.filter(x => !x.isDeleted);
    const itemToRemove = visualItems[index];
    if (itemToRemove) {
        if(itemToRemove.isNew) window.galleryState = window.galleryState.filter(x => x !== itemToRemove);
        else itemToRemove.isDeleted = true;
    }
    renderGallery();
};

document.getElementById('btn-cancelar').onclick = () => document.getElementById('modal-form').style.display = 'none';

document.getElementById('btn-guardar-db').onclick = async () => {
    const btn = document.getElementById('btn-guardar-db');
    const modalContent = document.querySelector('#modal-form .form-content');
    
    btn.disabled = true;
    btn.innerText = "⏳ Guardando...";
    btn.style.opacity = '0.7';
    btn.style.cursor = 'not-allowed';
    
    if (modalContent) {
        modalContent.style.pointerEvents = 'none';
        modalContent.style.opacity = '0.8';
    }

    try {
        const tipo = document.getElementById('inp-tipo').value;
        const titulo = document.getElementById('inp-titulo').value;
        const fecha = document.getElementById('inp-fecha').value;
        const origen = document.getElementById('inp-origen').value;
        const grado = document.getElementById('inp-grado').value;
        let vinculadoId = null;
        if(tipo === 'Difusión') vinculadoId = document.getElementById('inp-vinculo-id').value || null;
        
        if(!titulo || !fecha) throw new Error("Faltan campos obligatorios");
        
        let recordId = window.idEditando;
        const payload = { title: titulo, date: fecha, tipo: tipo, origen: origen, grado: grado, linked_incident_id: vinculadoId };
        
        if (recordId) {
            await sb.from('incidents').update(payload).eq('id', recordId);
        } else {
            const { data, error } = await sb.from('incidents').insert(payload).select().single();
            if(error) throw error;
            recordId = data.id;
        }
        
        for (const item of window.galleryState) {
            if (item.isNew && !item.isDeleted) {
                const ext = item.file.name.split('.').pop() || 'jpg';
                const fileName = `gallery/${recordId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
                const { error: upErr } = await sb.storage.from('incident-images').upload(fileName, item.file);
                if (upErr) throw upErr;
                const { data: urlData } = sb.storage.from('incident-images').getPublicUrl(fileName);
                item.url = urlData.publicUrl;
                item.isNew = false;
            }
        }
        
        await sb.from('incident_gallery').delete().eq('incident_id', recordId);
        const inserts = [];
        let firstImageUrl = null;
        window.galleryState.forEach((item, index) => {
            if (!item.isDeleted) {
                inserts.push({ incident_id: recordId, image_url: item.url, position: index });
                if (!firstImageUrl) firstImageUrl = item.url;
            }
        });
        
        if (inserts.length > 0) await sb.from('incident_gallery').insert(inserts);
        
        if (!firstImageUrl && vinculadoId) {
             const { data: parentData } = await sb.from('incidents').select('image_url').eq('id', vinculadoId).single();
             if(parentData) firstImageUrl = parentData.image_url;
        }
        
        await sb.from('incidents').update({ image_url: firstImageUrl }).eq('id', recordId);
        
        if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();
        
        alert("Guardado correctamente");
        document.getElementById('modal-form').style.display = 'none';
        window.recargarListadoCompleto();
        
    } catch (e) {
        alert("Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Guardar";
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (modalContent) { modalContent.style.pointerEvents = 'auto'; modalContent.style.opacity = '1'; }
    }
};

window.editar = (id) => { window.idEditando = id; window.abrirModal(); };

// =========================================================
// --- ELIMINAR UN REGISTRO POR COMPLETO ---
// =========================================================
// Un registro (incidente, difusión o capacitación) deja tres cosas: su fila,
// las filas de sus firmas y de su galería, y los archivos de esas firmas y
// fotos en Storage. El espacio está en lo último —una imagen por firma, unos
// 450 por registro—, así que borrar sólo la fila no libera casi nada y deja
// los archivos sin dueño. Esto lo borra todo, y lo usan el bote de basura de
// la tarjeta y el asistente: dos maneras de borrar acabarían borrando cosas
// distintas.

window.BUCKET_FIRMAS_INCIDENTES = 'signatures';
window.BUCKET_IMAGENES_INCIDENTES = 'incident-images';

// Todas las filas de una consulta, de mil en mil: un registro con 455 firmas
// cabe en una página, pero el tope de PostgREST corta en silencio.
window.todasLasFilas = async (armar) => {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await armar().range(desde, desde + 999);
        if (error) throw error;
        filas.push(...(data || []));
        if (!data || data.length < 1000) return filas;
    }
};

// Lo que hay en una carpeta de un bucket, paginando. Un bucket que la
// política no deja listar devuelve vacío sin error —pasa con el de firmas—,
// así que esto sólo suma a las rutas que dicen las filas, nunca las sustituye.
window.archivosDeCarpeta = async (bucket, carpeta) => {
    const rutas = [];
    try {
        for (let desde = 0; ; desde += 1000) {
            const { data, error } = await sb.storage.from(bucket).list(carpeta, { limit: 1000, offset: desde });
            if (error || !data || !data.length) break;
            data.forEach(o => { if (o.id && o.name !== '.emptyFolderPlaceholder') rutas.push(`${carpeta}/${o.name}`); });
            if (data.length < 1000) break;
        }
    } catch (e) { /* sin listado, valen las filas */ }
    return rutas;
};

// La ruta dentro del bucket de una url pública; '' si es de otro bucket.
window.rutaDeArchivoIncidente = (url, bucket) => {
    if (window.rutaDeUrlDeBucket) return window.rutaDeUrlDeBucket(url, bucket);
    const texto = String(url || '');
    const marca = `/${bucket}/`;
    const corte = texto.indexOf(marca);
    if (corte < 0) return '';
    let ruta = texto.slice(corte + marca.length).split('?')[0].split('#')[0];
    try { ruta = decodeURIComponent(ruta); } catch (e) { /* tal cual */ }
    return ruta;
};

// ¿Deja Storage borrar en este bucket? Se prueba con un archivo de un byte
// que se sube y se borra: una política que no deje borrar no da error, sólo
// devuelve una lista vacía, y eso no se puede saber de otra manera. true,
// false, o null si ni siquiera se pudo subir (entonces no se sabe y se
// sigue: lo que no se borre se dirá al final). Una vez por bucket y sesión.
window.permisoDeBorradoStorage = {};
window.storageDejaBorrar = async (bucket) => {
    if (bucket in window.permisoDeBorradoStorage) return window.permisoDeBorradoStorage[bucket];
    let deja = null;
    try {
        const ruta = `_sonda/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: errSubir } = await sb.storage.from(bucket).upload(ruta, new Blob(['x'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
        if (!errSubir) {
            const { data } = await sb.storage.from(bucket).remove([ruta]);
            deja = (data || []).length > 0;
        }
    } catch (e) { deja = null; }
    if (deja !== null) window.permisoDeBorradoStorage[bucket] = deja;
    return deja;
};

// Cuánto se lleva un registro, sin traerse ninguna fila: lo que se enseña en
// la confirmación.
window.resumenDeBorradoIncidente = async (ids) => {
    const lista = (Array.isArray(ids) ? ids : [ids]).filter(v => v != null);
    const contar = async (consulta) => { try { const { count, error } = await consulta; return error ? null : (count || 0); } catch (e) { return null; } };
    const [firmas, fotos, vinculados] = await Promise.all([
        contar(sb.from('incident_signatures').select('id', { count: 'exact', head: true }).in('incident_id', lista)),
        contar(sb.from('incident_gallery').select('id', { count: 'exact', head: true }).in('incident_id', lista)),
        contar(sb.from('incidents').select('id', { count: 'exact', head: true }).in('linked_incident_id', lista)
            .not('id', 'in', `(${lista.join(',')})`))
    ]);
    return { firmas, fotos, vinculados };
};

// El texto de esa confirmación, el mismo en la tarjeta y en el asistente.
window.textoDeBorradoIncidente = (r) => {
    const n = (v, uno, varios) => v == null ? `${varios} sin contar` : `${v} ${v === 1 ? uno : varios}`;
    const partes = [n(r.firmas, 'firma de enterado', 'firmas de enterado'), n(r.fotos, 'foto', 'fotos')];
    let texto = `Se borran ${partes.join(' y ')}, con sus archivos. Sin vuelta atrás.`;
    if (r.vinculados) texto += ` ${r.vinculados === 1 ? 'Un registro vinculado se queda' : `${r.vinculados} registros vinculados se quedan`} sin vínculo (no se borra${r.vinculados === 1 ? '' : 'n'}).`;
    return texto;
};

// Borra un registro y todo lo suyo. Nunca lanza: devuelve lo que de verdad
// pasó, que es lo que se le dice a quien lo pidió.
//
// El orden es el de lo que no tiene vuelta atrás: primero se reúnen las
// rutas (de las filas, que el bucket de firmas no se deja listar), después se
// borra la fila —si la base se niega, no se ha perdido nada— y sólo entonces
// los archivos. Y sólo los de SU carpeta: una difusión sin fotos propias
// guarda en `image_url` la primera foto del registro al que está vinculada,
// y borrarla dejaría a aquél sin foto.
window.eliminarIncidenteCompleto = async (id, avisar) => {
    const decir = (t) => { try { if (avisar) avisar(t); } catch (e) { /* sólo informa */ } };
    const r = { ok: false, id, firmasBorradas: 0, fotosBorradas: 0, archivosBorrados: 0,
        archivosPedidos: 0, archivosPendientes: [], vinculadosDesligados: 0, avisos: [] };
    const bF = window.BUCKET_FIRMAS_INCIDENTES, bI = window.BUCKET_IMAGENES_INCIDENTES;
    const carpetaFirmas = `signatures/${id}/`, carpetaFotos = `gallery/${id}/`;

    try {
        decir('Buscando sus archivos…');
        const { data: inc, error: errInc } = await sb.from('incidents').select('id, title, tipo, image_url').eq('id', id).maybeSingle();
        if (errInc) throw errInc;
        if (!inc) { r.error = 'Ese registro ya no existe.'; return r; }
        r.titulo = inc.title; r.tipo = inc.tipo || 'Incidente';

        const firmas = await window.todasLasFilas(() => sb.from('incident_signatures').select('id, signature_data').eq('incident_id', id).order('id'));
        const fotos = await window.todasLasFilas(() => sb.from('incident_gallery').select('id, image_url').eq('incident_id', id).order('id'));

        const rutasFirmas = new Set(), rutasFotos = new Set();
        firmas.forEach(f => { const p = window.rutaDeArchivoIncidente(f.signature_data, bF); if (p.startsWith(carpetaFirmas)) rutasFirmas.add(p); });
        fotos.forEach(f => { const p = window.rutaDeArchivoIncidente(f.image_url, bI); if (p.startsWith(carpetaFotos)) rutasFotos.add(p); });
        const portada = window.rutaDeArchivoIncidente(inc.image_url, bI);
        if (portada.startsWith(carpetaFotos)) rutasFotos.add(portada);
        // Lo que se dejó atrás antes —una firma borrada de una en una se lleva
        // la fila y no el archivo— sólo se encuentra listando la carpeta.
        (await window.archivosDeCarpeta(bF, carpetaFirmas.slice(0, -1))).forEach(p => rutasFirmas.add(p));
        (await window.archivosDeCarpeta(bI, carpetaFotos.slice(0, -1))).forEach(p => rutasFotos.add(p));

        // Antes de tocar la fila, que Storage deje borrar: después ya no habría
        // de dónde sacar las rutas para reintentarlo, y el registro se iría
        // dejando sus archivos ocupando sitio para siempre.
        for (const [bucket, rutas] of [[bF, rutasFirmas], [bI, rutasFotos]]) {
            if (rutas.size && await window.storageDejaBorrar(bucket) === false) {
                r.error = `No se borró nada: Storage no deja borrar archivos del bucket «${bucket}», así que el registro se iría y sus archivos seguirían ocupando sitio. Falta darle el permiso de borrado.`;
                r.sinPermiso = bucket;
                return r;
            }
        }

        // La fila. Si las firmas o la galería la tienen declarada sin borrado en
        // cascada, la base responde 23503: se quita lo que la sujeta y se
        // reintenta una vez.
        decir('Borrando el registro…');
        const borrarFila = () => sb.from('incidents').delete().eq('id', id).select('id');
        let { data: borrada, error: errBorrar } = await borrarFila();
        if (errBorrar && errBorrar.code === '23503') {
            const { data: desligados } = await sb.from('incidents').update({ linked_incident_id: null }).eq('linked_incident_id', id).select('id');
            r.vinculadosDesligados += (desligados || []).length;
            await sb.from('incident_signatures').delete().eq('incident_id', id);
            await sb.from('incident_gallery').delete().eq('incident_id', id);
            ({ data: borrada, error: errBorrar } = await borrarFila());
        }
        if (errBorrar) { r.error = 'La base no dejó borrarlo: ' + errBorrar.message; return r; }
        if (!borrada || !borrada.length) { r.error = 'La base no dejó borrarlo (una política de seguridad lo impide). No se borró nada.'; return r; }
        r.ok = true;

        // Lo que colgaba de ella. Con borrado en cascada ya no queda nada y
        // esto no toca ninguna fila; sin él, son las que se quedarían huérfanas.
        const quedan = async (tabla, campo) => {
            const { data, error } = await sb.from(tabla).delete().eq(campo, id).select('id');
            if (error) r.avisos.push(`No se pudieron borrar sus filas de ${tabla}: ${error.message}`);
            return (data || []).length;
        };
        const sueltasFirmas = await quedan('incident_signatures', 'incident_id');
        const sueltasFotos = await quedan('incident_gallery', 'incident_id');
        r.firmasBorradas = Math.max(firmas.length, sueltasFirmas);
        r.fotosBorradas = Math.max(fotos.length, sueltasFotos);

        // Los que estaban vinculados a él se quedan, sin el vínculo, y sin la
        // foto que tomaban prestada de su carpeta.
        const { data: vinc } = await sb.from('incidents').select('id, image_url').eq('linked_incident_id', id);
        for (const v of (vinc || [])) {
            const cambios = { linked_incident_id: null };
            if (window.rutaDeArchivoIncidente(v.image_url, bI).startsWith(carpetaFotos)) cambios.image_url = null;
            const { data } = await sb.from('incidents').update(cambios).eq('id', v.id).select('id');
            r.vinculadosDesligados += (data || []).length;
        }
        // Y los que ya no lo apuntan pero siguen con su foto (la base pudo
        // poner el vínculo a null por su cuenta).
        await sb.from('incidents').update({ image_url: null }).like('image_url', `%/${bI}/${carpetaFotos}%`);

        // Los archivos, de cien en cien, contando lo que de verdad se fue: una
        // política que no deje borrar no da error, sólo devuelve una lista vacía.
        const quitar = async (bucket, rutas) => {
            const lista = [...rutas];
            r.archivosPedidos += lista.length;
            for (let i = 0; i < lista.length; i += 100) {
                decir(`Borrando archivos… ${Math.min(i + 100, lista.length)} de ${lista.length}`);
                const tanda = lista.slice(i, i + 100);
                try {
                    const { data, error } = await sb.storage.from(bucket).remove(tanda);
                    const idos = new Set((data || []).map(o => o.name));
                    r.archivosBorrados += idos.size;
                    tanda.filter(p => !idos.has(p)).forEach(p => r.archivosPendientes.push({ bucket, ruta: p, motivo: error ? error.message : null }));
                } catch (e) {
                    tanda.forEach(p => r.archivosPendientes.push({ bucket, ruta: p, motivo: e.message }));
                }
            }
        };
        await quitar(bF, rutasFirmas);
        await quitar(bI, rutasFotos);
        if (r.archivosPendientes.length) {
            const porBucket = {};
            r.archivosPendientes.forEach(p => { porBucket[p.bucket] = (porBucket[p.bucket] || 0) + 1; });
            Object.entries(porBucket).forEach(([b, n]) =>
                r.avisos.push(`Storage no dejó borrar ${n} ${n === 1 ? 'archivo' : 'archivos'} del bucket «${b}»: le falta el permiso de borrado.`));
        }
    } catch (e) {
        r.error = (r.ok ? 'El registro se borró, pero falló la limpieza: ' : 'No se borró: ') + (e.message || e);
    }
    if (r.ok && window.invalidarCacheDashboard) window.invalidarCacheDashboard();
    return r;
};

// Lo que se le dice a quien lo pidió, en una frase.
window.textoDeIncidenteEliminado = (r) => {
    if (!r.ok) return r.error || 'No se borró.';
    let t = `Se borró «${r.titulo}» con ${r.firmasBorradas} ${r.firmasBorradas === 1 ? 'firma' : 'firmas'} y ${r.fotosBorradas} ${r.fotosBorradas === 1 ? 'foto' : 'fotos'}; `
        + `${r.archivosBorrados} de ${r.archivosPedidos} archivos liberados.`;
    if (r.vinculadosDesligados) t += ` ${r.vinculadosDesligados} vinculado${r.vinculadosDesligados === 1 ? '' : 's'} quedó sin vínculo.`;
    if (r.avisos.length) t += ' ' + r.avisos.join(' ');
    if (r.error) t += ' ' + r.error;
    return t;
};

window.borrar = async (id) => {
    const inc = (window.incidentCache || {})[id] || {};
    const resumen = await window.resumenDeBorradoIncidente(id);
    const nombre = inc.title ? `«${inc.title}»` : 'este registro';
    if (!confirm(`¿Eliminar ${nombre} por completo?\n\n${window.textoDeBorradoIncidente(resumen)}`)) return;

    const card = document.getElementById(`card-${id}`);
    if (card) { card.style.opacity = '0.5'; card.style.pointerEvents = 'none'; }
    const loading = document.getElementById('loading-indicator');
    const avisar = (t) => { if (loading) { loading.innerText = t; loading.style.display = 'block'; } };
    avisar('Borrando registro y archivos...');

    const r = await window.eliminarIncidenteCompleto(id, avisar);
    if (loading) { loading.style.display = 'none'; loading.innerText = 'Buscando datos...'; }
    alert(window.textoDeIncidenteEliminado(r));
    if (r.ok) window.recargarListadoCompleto();
    else if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
};

window.abrirVisor = async (incidentId) => {
    const modal = document.getElementById('modal-visor');
    const content = document.getElementById('visor-content');
    if (window.reiniciarZoomVisor) window.reiniciarZoomVisor();
    modal.style.display = 'block';
    content.innerHTML = '<div style="color:white; margin-top:50px; text-align:center;">Cargando...</div>';
    const { data: images } = await sb.from('incident_gallery').select('*').eq('incident_id', incidentId).order('position', { ascending: true }).order('id', { ascending: true });
    content.innerHTML = '';
    let imagesToShow = images || [];
    if(imagesToShow.length === 0) {
        const inc = window.incidentCache[incidentId];
        if(inc && inc.linked_incident_id) {
            const { data: parentImages } = await sb.from('incident_gallery').select('*').eq('incident_id', inc.linked_incident_id).order('position', { ascending: true }).order('id', { ascending: true });
            if (parentImages && parentImages.length > 0) imagesToShow = parentImages;
        }
        if (imagesToShow.length === 0) {
            if(inc && inc.image_url) imagesToShow = [{ image_url: inc.image_url }];
            else { content.innerHTML = '<div style="color:white; margin-top:50px; text-align:center;">Sin imágenes adicionales</div>'; return; }
        }
    }
    imagesToShow.forEach(img => {
        const safeUrl = window.procesarUrlImagen ? window.procesarUrlImagen(img.image_url) : img.image_url;
        content.insertAdjacentHTML('beforeend', `<div class="visor-image-wrapper"><img src="${safeUrl}" class="visor-img-item"></div>`);
    });
};

// El visor de arriba busca las imágenes de un incidente; a veces la lista ya se
// tiene y no hay nada que consultar —las páginas del material de una encuesta,
// que se leen una debajo de otra como se lee un documento—.
window.abrirVisorImagenes = (urls) => {
    const modal = document.getElementById('modal-visor');
    const content = document.getElementById('visor-content');
    const lista = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!modal || !content || lista.length === 0) return;

    if (window.reiniciarZoomVisor) window.reiniciarZoomVisor();
    modal.style.display = 'block';
    content.innerHTML = lista.map(u =>
        `<div class="visor-image-wrapper"><img src="${u}" class="visor-img-item" loading="lazy"></div>`
    ).join('');
    // Se entra por la primera página aunque se haya salido del visor a media
    // lectura la vez anterior.
    content.scrollTop = 0;
};

// Una sola, que es el caso de la foto del área de una evaluación.
window.abrirVisorImagen = (url) => window.abrirVisorImagenes([url]);

// ==========================================
// EL ZOOM DEL VISOR
// ==========================================
// El visor es lo único de esta aplicación que va a pantalla completa a
// propósito, y desde que el material de una encuesta son imágenes es donde se
// lee un documento: una diapositiva de 16:9 en un teléfono de 375 deja la letra
// del cuerpo en 6px, así que **sin zoom no se puede leer lo que se vino a
// leer**. Lo trae puesto, así que vale igual para las fotos de un incidente.
//
// No se delega en el zoom del navegador: `user-scalable=no` y la aplicación
// instalada en la pantalla de inicio lo dejan fuera, y aunque no lo hicieran,
// ampliar el documento entero movería también el botón de cerrar y el
// desplazamiento entre páginas.
//
//   - **Con dos dedos**, que es el gesto que espera el dedo en iOS.
//   - **Doble toque**, que amplía de golpe donde se tocó y vuelve al tamaño.
//   - **En un escritorio**, ctrl (o ⌘) con la rueda —que es también el pellizco
//     del trackpad—, doble click y arrastrar para moverse.
//
// Y sin ningún botón: hubo dos, de más y de menos, en la esquina de enfrente de
// la cruz, y encima de un documento son dos discos flotando sobre lo que se
// está leyendo para decir lo que los dedos ya saben hacer. El doble toque —y el
// doble click— llega a todo lo que llegaban ellos, incluido volver al tamaño.
//
// La rueda a secas se queda para pasar de página, que es de lo que vive un
// documento de veinte; con el zoom puesto pasa a mover la imagen, que ahí ya no
// hay páginas que recorrer.
window.MAX_ZOOM_VISOR = 6;
window.ZOOM_DE_UN_TOQUE = 2.5;

// La imagen ampliada y por dónde va. `img` es la que se está mirando: el zoom
// es de una página y no del visor entero, y cambiar de página lo suelta.
window.zoomVisor = { img: null, escala: 1, x: 0, y: 0 };

// Por dónde iba la lista antes de ampliar: mientras hay zoom el contenedor va
// con `overflow:hidden` —el dedo mueve la imagen, no la lista—, y devolverlo
// sin esto dejaría el documento en la primera página.
window.desplazamientoVisor = null;

// La que se está mirando es la del contenedor cuyo centro cae más cerca del
// centro de la pantalla: el pellizco puede empezar sobre el fondo gris de al
// lado, así que no vale preguntarle al elemento que recibió el toque.
window.imagenActualDelVisor = () => {
    const content = document.getElementById('visor-content');
    if (!content) return null;
    const medio = window.innerHeight / 2;
    let mejor = null, cerca = Infinity;
    content.querySelectorAll('.visor-image-wrapper').forEach(marco => {
        const caja = marco.getBoundingClientRect();
        const d = Math.abs((caja.top + caja.bottom) / 2 - medio);
        if (d < cerca) { cerca = d; mejor = marco.querySelector('img'); }
    });
    return mejor;
};

// La imagen no se sale de su marco: ampliada 2× sólo puede moverse la mitad de
// lo que le sobra por cada lado. Sin esto se pierde de vista y no hay manera de
// traerla de vuelta. `offsetWidth` es la medida de maqueta, o sea la de antes
// de escalar, que es con la que hay que contar.
window.acotarZoomVisor = () => {
    const z = window.zoomVisor;
    if (!z.img) return;
    if (z.escala <= 1.01) { z.escala = 1; z.x = 0; z.y = 0; return; }
    const marco = z.img.parentElement.getBoundingClientRect();
    const sobraX = Math.max(0, (z.img.offsetWidth * z.escala - marco.width) / 2);
    const sobraY = Math.max(0, (z.img.offsetHeight * z.escala - marco.height) / 2);
    z.x = Math.min(sobraX, Math.max(-sobraX, z.x));
    z.y = Math.min(sobraY, Math.max(-sobraY, z.y));
};

window.aplicarZoomVisor = (conTransicion) => {
    const z = window.zoomVisor;
    const modal = document.getElementById('modal-visor');
    const content = document.getElementById('visor-content');
    if (z.img) {
        // Los botones y el doble toque sí se animan; el pellizco no, que ahí la
        // imagen tiene que ir pegada a los dedos.
        z.img.style.transition = conTransicion ? 'transform 0.18s ease-out' : 'none';
        z.img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.escala})`;
    }

    const ampliado = z.escala > 1.01;
    if (modal) modal.classList.toggle('esta-ampliado', ampliado);
    if (!content) return;

    // El desplazamiento se apaga y se enciende con el zoom, guardando por dónde
    // iba: con `overflow:hidden` el gesto de un dedo es para mover la imagen.
    if (ampliado && window.desplazamientoVisor === null) {
        window.desplazamientoVisor = content.scrollTop;
    } else if (!ampliado && window.desplazamientoVisor !== null) {
        const volver = window.desplazamientoVisor;
        window.desplazamientoVisor = null;
        content.scrollTop = volver;
    }
};

// El punto que se tiene debajo del dedo —o del cursor— se queda donde está: es
// lo que hace que ampliar sobre una palabra la deje debajo del dedo en vez de
// llevarse la vista al centro de la página.
window.ponerZoomVisor = (escala, punto, conTransicion) => {
    const z = window.zoomVisor;
    // Sin zoom puesto se vuelve a preguntar cuál se está mirando: lo apuntado
    // es de la última vez y entre medias se pudo pasar de página, así que
    // ampliar en la segunda ampliaba la primera —fuera de la pantalla, o sea
    // sin que pasara nada—. Con el zoom puesto no hay que preguntar: la lista
    // está quieta y la imagen es la que se está moviendo.
    const img = (z.escala > 1.01 && z.img) ? z.img : window.imagenActualDelVisor();
    if (!img || !img.parentElement) return;
    // Otra página: el zoom es de la que se está mirando, así que se empieza de
    // cero y se suelta la anterior.
    if (img !== z.img) {
        if (z.img) { z.img.style.transition = 'none'; z.img.style.transform = ''; }
        z.img = img; z.escala = 1; z.x = 0; z.y = 0;
    }

    const nueva = Math.min(window.MAX_ZOOM_VISOR, Math.max(1, escala));
    const marco = img.parentElement.getBoundingClientRect();
    const cx = marco.left + marco.width / 2;
    const cy = marco.top + marco.height / 2;
    const q = punto || { x: cx, y: cy };
    const razon = nueva / (z.escala || 1);

    z.x = q.x - cx - razon * (q.x - cx - z.x);
    z.y = q.y - cy - razon * (q.y - cy - z.y);
    z.escala = nueva;
    window.acotarZoomVisor();
    window.aplicarZoomVisor(conTransicion);
};

// El doble toque: amplía donde se tocó, y si ya estaba ampliada la devuelve a
// su tamaño. Un solo gesto para las dos cosas, que es lo que se espera de él.
window.alternarZoomVisor = (punto) => {
    const z = window.zoomVisor;
    if (z.escala > 1.01) window.ponerZoomVisor(1, null, true);
    else window.ponerZoomVisor(window.ZOOM_DE_UN_TOQUE, punto, true);
};

// Al abrir y al cerrar el visor. El transform se quita del todo: la imagen
// puede seguir en el documento si sólo se cerró la capa.
window.reiniciarZoomVisor = () => {
    const z = window.zoomVisor;
    if (z.img) { z.img.style.transition = 'none'; z.img.style.transform = ''; }
    z.img = null; z.escala = 1; z.x = 0; z.y = 0;
    window.desplazamientoVisor = null;
    const modal = document.getElementById('modal-visor');
    if (modal) modal.classList.remove('esta-ampliado');
};

// Los gestos. Se enganchan una sola vez, al cargar, sobre el contenedor que
// siempre está en el documento —lo que cambia son las imágenes de dentro—.
(() => {
    const content = document.getElementById('visor-content');
    if (!content) return;

    let pellizco = null;   // { distancia, escala }
    let arrastre = null;   // { x, y, ox, oy }
    let huboGesto = false; // para no confundir un arrastre con un toque
    let ultimoToque = 0, dondeElUltimo = null;

    const separacion = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const entreLosDos = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    content.addEventListener('touchstart', (e) => {
        const z = window.zoomVisor;
        if (e.touches.length === 2) {
            const img = window.imagenActualDelVisor();
            if (!img) return;
            if (img !== z.img) { window.ponerZoomVisor(1, null, false); }
            pellizco = { distancia: separacion(e.touches) || 1, escala: window.zoomVisor.escala };
            arrastre = null;
            huboGesto = true;
        } else if (e.touches.length === 1 && z.escala > 1.01) {
            arrastre = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: z.x, oy: z.y };
        }
    }, { passive: false });

    // No pasivo a propósito: cancelar el desplazamiento del navegador sólo se
    // puede desde aquí. Es la misma razón por la que el gesto de las hojas va
    // con eventos de toque y no de puntero.
    content.addEventListener('touchmove', (e) => {
        const z = window.zoomVisor;
        if (pellizco && e.touches.length === 2) {
            e.preventDefault();
            huboGesto = true;
            window.ponerZoomVisor(
                pellizco.escala * (separacion(e.touches) / pellizco.distancia),
                entreLosDos(e.touches), false);
        } else if (arrastre && e.touches.length === 1 && z.escala > 1.01) {
            e.preventDefault();
            const dx = e.touches[0].clientX - arrastre.x;
            const dy = e.touches[0].clientY - arrastre.y;
            if (Math.hypot(dx, dy) > 6) huboGesto = true;
            z.x = arrastre.ox + dx;
            z.y = arrastre.oy + dy;
            window.acotarZoomVisor();
            window.aplicarZoomVisor(false);
        }
    }, { passive: false });

    content.addEventListener('touchend', (e) => {
        const z = window.zoomVisor;
        pellizco = null;

        // Levantar un dedo de dos no acaba el gesto: el que queda pasa a mover
        // la imagen sin dar un salto.
        if (e.touches.length === 1 && z.escala > 1.01) {
            arrastre = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: z.x, oy: z.y };
            return;
        }
        if (e.touches.length > 0) return;
        arrastre = null;

        // Soltando el pellizco por debajo de 1 se vuelve al tamaño, animado:
        // dejarlo en 1 a secas corta el gesto en seco.
        const t = e.changedTouches[0];
        if (huboGesto) { huboGesto = false; window.ultimoToqueVisor = Date.now(); return; }
        window.ultimoToqueVisor = Date.now();

        const ahora = Date.now();
        const cerca = dondeElUltimo && t &&
            Math.hypot(t.clientX - dondeElUltimo.x, t.clientY - dondeElUltimo.y) < 40;
        if (t && cerca && ahora - ultimoToque < 320) {
            // Y se le quita al navegador su propio doble toque, que ampliaría
            // el documento entero por debajo del nuestro.
            e.preventDefault();
            window.alternarZoomVisor({ x: t.clientX, y: t.clientY });
            ultimoToque = 0; dondeElUltimo = null;
        } else if (t) {
            ultimoToque = ahora; dondeElUltimo = { x: t.clientX, y: t.clientY };
        }
    }, { passive: false });

    content.addEventListener('touchcancel', () => { pellizco = null; arrastre = null; huboGesto = false; });

    // Rueda: con ctrl —o ⌘, o el pellizco del trackpad, que llega así— amplía;
    // a secas pasa de página, salvo con el zoom puesto, donde mueve la imagen.
    content.addEventListener('wheel', (e) => {
        const z = window.zoomVisor;
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const paso = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            window.ponerZoomVisor((z.escala || 1) * Math.exp(-paso * 0.01),
                { x: e.clientX, y: e.clientY }, false);
        } else if (z.escala > 1.01) {
            e.preventDefault();
            z.x -= e.deltaX;
            z.y -= e.deltaY;
            window.acotarZoomVisor();
            window.aplicarZoomVisor(false);
        }
    }, { passive: false });

    // Doble click en un escritorio. El doble toque de un teléfono sintetiza uno
    // detrás, así que se descarta el que llega pegado a un toque: si no,
    // ampliaría y volvería a reducir en el mismo gesto.
    content.addEventListener('dblclick', (e) => {
        if (Date.now() - (window.ultimoToqueVisor || 0) < 600) return;
        window.alternarZoomVisor({ x: e.clientX, y: e.clientY });
    });

    // Arrastrar con el ratón, que con el zoom puesto es lo que se espera. El
    // movimiento y el soltar van en `window`: el cursor se sale de la imagen.
    let raton = null;
    content.addEventListener('mousedown', (e) => {
        if (window.zoomVisor.escala <= 1.01) return;
        e.preventDefault();
        raton = { x: e.clientX, y: e.clientY, ox: window.zoomVisor.x, oy: window.zoomVisor.y };
    });
    window.addEventListener('mousemove', (e) => {
        if (!raton) return;
        const z = window.zoomVisor;
        z.x = raton.ox + (e.clientX - raton.x);
        z.y = raton.oy + (e.clientY - raton.y);
        window.acotarZoomVisor();
        window.aplicarZoomVisor(false);
    });
    window.addEventListener('mouseup', () => { raton = null; });

    // Arrastrar una imagen es el gesto de moverla, no el de llevársela a otra
    // ventana: el navegador la ofrece como archivo y deja el fantasma pegado al
    // cursor a media panorámica.
    content.addEventListener('dragstart', (e) => e.preventDefault());

    // Al girar el teléfono la imagen cabe de otra manera, así que lo que se
    // había movido puede quedarse fuera de sus topes.
    window.addEventListener('resize', () => {
        if (window.zoomVisor.escala > 1.01) {
            window.acotarZoomVisor();
            window.aplicarZoomVisor(false);
        }
    });
})();

document.getElementById('txt-cerrar').onclick = () => {
    window.reiniciarZoomVisor();
    document.getElementById('modal-visor').style.display = 'none';
};
if(document.getElementById('btn-mas')) document.getElementById('btn-mas').onclick = () => window.cargarIncidentes();

console.log("✅ Incidentes v16: Texto actualizado.");
