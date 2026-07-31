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

    if(window.modoAdminActivo && document.getElementById('admin-toolbar')) {
        document.getElementById('admin-toolbar').style.display = 'flex';
    }
    
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
                const fechaInc = new Date(dataItem.date);
                const eligibleTeam = myFullTeam.filter(e => new Date(e.date) <= fechaInc);
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
                    <div style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: white;">
                        <h3 id="titulo-modal-detalle" style="margin:0; color:#0f172a; font-size:1.15rem; line-height: 1.3;">Detalles del Registro</h3>
                        <button onclick="document.getElementById('modal-detalle-independiente').style.display='none'" style="border:none; background:#f1f5f9; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#475569; font-weight:bold; font-size: 1rem; flex-shrink: 0; margin-left:10px;">✕</button>
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
        
        const fechaInc = new Date(data.date);
        const eligibleTeam = myFullTeam.filter(e => new Date(e.date) <= fechaInc);
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
        const exentoDeFirmar = ["JR. MANAGER", "SR MANAGER", "JR MANAGER", "SR. MANAGER"].includes(myPuesto);

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

window.borrar = async (id) => {
    if(confirm("¿Borrar registro y todas sus evidencias físicas (fotos y firmas)?")) {
        
        const card = document.getElementById(`card-${id}`);
        if (card) { card.style.opacity = '0.5'; card.style.pointerEvents = 'none'; }
        
        const loading = document.getElementById('loading-indicator');
        if (loading) { loading.innerText = 'Borrando registro y archivos...'; loading.style.display = 'block'; }

        try {
            const { data: galleryFiles } = await sb.storage.from('incident-images').list(`gallery/${id}`);
            if (galleryFiles && galleryFiles.length > 0) {
                const pathsToRemove = galleryFiles.map(file => `gallery/${id}/${file.name}`);
                await sb.storage.from('incident-images').remove(pathsToRemove);
            }

            const { data: sigFiles } = await sb.storage.from('signatures').list(`signatures/${id}`);
            if (sigFiles && sigFiles.length > 0) {
                const pathsToRemove = sigFiles.map(file => `signatures/${id}/${file.name}`);
                await sb.storage.from('signatures').remove(pathsToRemove);
            }

            const { error } = await sb.from('incidents').delete().eq('id', id);
            if (error) throw error;

            if(window.invalidarCacheDashboard) window.invalidarCacheDashboard();
            
            alert("Registro y archivos eliminados completamente.");
            window.recargarListadoCompleto();

        } catch (err) {
            console.error("Error durante el borrado:", err);
            alert("Hubo un error al intentar borrar: " + err.message);
            if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
        } finally {
            if (loading) { loading.style.display = 'none'; loading.innerText = 'Buscando datos...'; }
        }
    }
};

window.abrirVisor = async (incidentId) => {
    const modal = document.getElementById('modal-visor');
    const content = document.getElementById('visor-content');
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

document.getElementById('txt-cerrar').onclick = () => document.getElementById('modal-visor').style.display = 'none';
if(document.getElementById('btn-mas')) document.getElementById('btn-mas').onclick = () => window.cargarIncidentes();

console.log("✅ Incidentes v16: Texto actualizado.");
