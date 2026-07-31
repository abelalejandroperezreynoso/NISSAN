// ==========================================
// 8-hallazgos.js (MÓDULO DE HALLAZGOS - CON EDICIÓN Y ELIMINACIÓN)
// ==========================================

// Variable global para saber si estamos editando un registro existente
window.idHallazgoEditando = null;
window.hallazgosHistorialCache = []; // Guardamos los datos temporalmente para poder editarlos

const normalizarTexto = (texto) => {
    if (!texto) return '';
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

window.inicializarModuloHallazgos = () => {
    // 1. Conectamos la lógica a los nuevos botones estilo iOS del index.html
    const btnNuevo = document.getElementById('btn-registrar-hallazgo');
    if (btnNuevo) btnNuevo.onclick = () => window.abrirModalHallazgo();

    const btnPanel = document.getElementById('btn-panel-hallazgos');
    if (btnPanel) btnPanel.onclick = () => window.cargarHistorialHallazgos();

    // 2. Inyectamos SOLAMENTE el modal oculto (quitamos la inyección de los botones viejos)
    const modalHtml = `
    <div id="modal-hallazgo" class="hoja-overlay" style="z-index:4000;">
        <div class="form-content hoja-contenido" style="overflow-y:auto; touch-action: pan-y; -webkit-overflow-scrolling: touch;">
            <div class="hoja-encabezado">
                <h2 id="titulo-modal-hallazgo" class="hoja-titulo">Nuevo hallazgo</h2>
                <button onclick="window.cerrarModalHallazgo()" class="ios-boton-icono ios-boton-cerrar" title="Cerrar" aria-label="Cerrar"></button>
            </div>
            
            <div class="form-group">
                <label>Título / Observación breve:</label>
                <input type="text" id="inp-hallazgo-titulo" placeholder="Ej. Foco fundido en pasillo B" autocomplete="off">
            </div>
            
            <div class="form-group">
                <label>Descripción detallada:</label>
                <textarea id="inp-hallazgo-desc" rows="3" placeholder="Detalla lo que encontraste..."></textarea>
            </div>

            <div class="form-group">
                <label>Asignar responsable:</label>
                <div style="position:relative;">
                    <input type="text" id="inp-buscar-asignado" placeholder="🔍 Escribe para buscar colaborador..." autocomplete="off" 
                           oninput="window.buscarAsignadoHallazgo(this.value)" 
                           onblur="setTimeout(() => document.getElementById('sugerencias-asignado').style.display='none', 200)"
                           style="width: 100%; padding: 10px 10px 10px 30px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; background: #f8fafc; font-size:1rem;">
                    
                    <input type="hidden" id="inp-hallazgo-asignado-id">
                    
                    <div id="sugerencias-asignado" style="display:none; position:absolute; top:100%; left:0; width:100%; background:white; border:1px solid #cbd5e1; border-top:none; border-radius: 0 0 6px 6px; max-height:160px; overflow-y:auto; z-index:1000; box-shadow:0 4px 6px rgba(0,0,0,0.1);"></div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Fecha de la observación:</label>
                <input type="date" id="inp-hallazgo-fecha">
            </div>
            
            <div class="form-actions" style="display:flex; justify-content:flex-end; gap:12px; margin-top:30px;">
                <button onclick="window.cerrarModalHallazgo()" style="padding:10px 20px; background:white; border:none; border-radius:8px; cursor:pointer; color:#64748b;">Cancelar</button>
                <button id="btn-save-hallazgo" onclick="window.guardarHallazgo()" style="padding:10px 25px; background:#f59e0b; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">Guardar Registro</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};


window.buscarAsignadoHallazgo = (termino) => {
    const sugerenciasDiv = document.getElementById('sugerencias-asignado');
    const hiddenId = document.getElementById('inp-hallazgo-asignado-id');
    
    hiddenId.value = '';

    if (!termino || termino.trim().length < 2) {
        sugerenciasDiv.style.display = 'none';
        return;
    }

    const t = normalizarTexto(termino.trim());
    const empleados = window.todosLosEmpleadosData || [];
    
    const filtrados = empleados.filter(e => {
        const nombreNorm = normalizarTexto(e.name);
        const puestoNorm = normalizarTexto(e.puesto);
        return nombreNorm.includes(t) || puestoNorm.includes(t);
    });

    if (filtrados.length === 0) {
        sugerenciasDiv.innerHTML = '<div style="padding:10px; color:#ef4444; font-size:0.9rem; text-align:center;">No se encontraron colaboradores...</div>';
        sugerenciasDiv.style.display = 'block';
        return;
    }

    let html = '';
    filtrados.forEach(emp => {
        html += `
        <div onmousedown="window.seleccionarAsignadoHallazgo('${emp.id}', '${emp.name}')" style="padding:10px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:0.9rem; transition: background 0.2s;" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='white'">
            <div style="font-weight:bold; color:#1e293b;">${emp.name}</div>
            <div style="font-size:0.75rem; color:#64748b;">${emp.puesto || 'Sin puesto asignado'}</div>
        </div>`;
    });
    
    sugerenciasDiv.innerHTML = html;
    sugerenciasDiv.style.display = 'block';
};

window.seleccionarAsignadoHallazgo = (id, nombre) => {
    document.getElementById('inp-buscar-asignado').value = nombre;
    document.getElementById('inp-hallazgo-asignado-id').value = id;
    document.getElementById('sugerencias-asignado').style.display = 'none';
};

window.abrirModalHallazgo = async () => {
    // Reseteamos la variable para indicar que es un registro NUEVO
    window.idHallazgoEditando = null;
    document.getElementById('titulo-modal-hallazgo').innerText = "Nuevo Hallazgo";
    
    document.getElementById('modal-hallazgo').style.display = 'flex';
    document.getElementById('inp-hallazgo-titulo').value = '';
    document.getElementById('inp-hallazgo-desc').value = '';
    document.getElementById('inp-hallazgo-fecha').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('inp-buscar-asignado').value = '';
    document.getElementById('inp-hallazgo-asignado-id').value = '';
    document.getElementById('sugerencias-asignado').style.display = 'none';

    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }
};

// --- NUEVA FUNCIÓN PARA EDITAR ---
window.editarHallazgo = async (idHallazgo) => {
    // Buscamos los datos exactos en la memoria caché
    const hallazgo = window.hallazgosHistorialCache.find(h => h.id === idHallazgo);
    if (!hallazgo) return;

    window.idHallazgoEditando = idHallazgo;
    document.getElementById('titulo-modal-hallazgo').innerText = "Editar Hallazgo";
    
    document.getElementById('modal-hallazgo').style.display = 'flex';
    document.getElementById('inp-hallazgo-titulo').value = hallazgo.title || '';
    document.getElementById('inp-hallazgo-desc').value = hallazgo.description || '';
    document.getElementById('inp-hallazgo-fecha').value = hallazgo.date || '';

    // Buscamos y pre-llenamos al asignado
    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }
    
    const asignadoObj = window.todosLosEmpleadosData ? window.todosLosEmpleadosData.find(e => String(e.id) === String(hallazgo.assigned_to)) : null;
    if (asignadoObj) {
        document.getElementById('inp-buscar-asignado').value = asignadoObj.name;
        document.getElementById('inp-hallazgo-asignado-id').value = asignadoObj.id;
    } else {
        document.getElementById('inp-buscar-asignado').value = '';
        document.getElementById('inp-hallazgo-asignado-id').value = '';
    }
    document.getElementById('sugerencias-asignado').style.display = 'none';
};

window.cerrarModalHallazgo = () => {
    document.getElementById('modal-hallazgo').style.display = 'none';
    window.idHallazgoEditando = null; // Limpiamos por seguridad
};

window.guardarHallazgo = async () => {
    const titulo = document.getElementById('inp-hallazgo-titulo').value.trim();
    const desc = document.getElementById('inp-hallazgo-desc').value.trim();
    const fecha = document.getElementById('inp-hallazgo-fecha').value;
    const asignadoA = document.getElementById('inp-hallazgo-asignado-id').value;
    const nombreEscrito = document.getElementById('inp-buscar-asignado').value.trim();
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));

    if (!titulo || !fecha) {
        alert("Por favor, ingresa al menos el título y la fecha del hallazgo.");
        return;
    }

    if (!asignadoA || !nombreEscrito) {
        alert("Por favor, busca y selecciona a un responsable de la lista.");
        return;
    }

    const btn = document.getElementById('btn-save-hallazgo');
    btn.disabled = true;
    btn.innerText = window.idHallazgoEditando ? "Actualizando..." : "Guardando...";

    try {
        const payload = {
            title: titulo,
            description: desc,
            date: fecha,
            employee_id: String(user.id),
            assigned_to: String(asignadoA)
        };

        // Si existe un ID guardado, hacemos un UPDATE, si no, hacemos un INSERT
        let error = null;
        if (window.idHallazgoEditando) {
            const result = await sb.from('hallazgos').update(payload).eq('id', window.idHallazgoEditando);
            error = result.error;
        } else {
            const result = await sb.from('hallazgos').insert(payload);
            error = result.error;
        }
        
        if (error) throw error;

        alert(window.idHallazgoEditando ? "✅ Hallazgo actualizado correctamente." : "✅ Hallazgo asignado y registrado correctamente.");
        window.cerrarModalHallazgo();
        
        const container = document.getElementById('container-incidentes');
        if (container.style.display === 'block' && container.innerHTML.includes('Panel de Hallazgos')) {
            window.cargarHistorialHallazgos();
        }
        
    } catch (error) {
        console.error("Error al guardar hallazgo:", error);
        alert("Ocurrió un error al guardar: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Guardar Registro";
        window.idHallazgoEditando = null;
    }
};

window.eliminarHallazgo = async (idHallazgo) => {
    const confirmar = confirm("⚠️ ¿Estás seguro de que deseas eliminar este hallazgo? Esta acción no se puede deshacer.");
    if (!confirmar) return;

    try {
        const { error } = await sb.from('hallazgos').delete().eq('id', idHallazgo);
        if (error) throw error;
        window.cargarHistorialHallazgos();
    } catch (error) {
        console.error("Error al eliminar el hallazgo:", error);
        alert("Ocurrió un error al intentar eliminar el registro: " + error.message);
    }
};

window.cargarHistorialHallazgos = async () => {
    // 1. Mostrar el modal flotante que contiene las listas
    const modal = document.getElementById('modal-lista-incidentes');
    if (modal) modal.style.display = 'flex';
    
    // 2. Cambiar el título superior del modal
    const tituloModal = document.getElementById('titulo-modal-lista-incidentes');
    if (tituloModal) {
        tituloModal.innerHTML = "📋 Panel de Hallazgos";
    }
    
    const container = document.getElementById('container-incidentes');
    container.style.display = 'block';
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;"><div class="spinner" style="margin: 0 auto 10px auto;"></div>Buscando historial...</div>';
    
    const user = JSON.parse(localStorage.getItem("usuarioLogueado"));
    
    if (!window.todosLosEmpleadosData || window.todosLosEmpleadosData.length === 0) {
        if (window.cargarDatosEmpleados) await window.cargarDatosEmpleados();
    }

    try {
        const { data, error } = await sb.from('hallazgos')
            .select('*')
            .or(`employee_id.eq.${user.id},assigned_to.eq.${user.id}`)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        // Guardamos los datos en memoria para que la función de edición los encuentre rápido
        window.hallazgosHistorialCache = data || [];
        
        container.innerHTML = ''; // Limpiamos el spinner
        
        const asignadosAMi = data.filter(h => String(h.assigned_to) === String(user.id));
        const reportadosPorMi = data.filter(h => String(h.employee_id) === String(user.id));
        
        const renderizarTarjetas = (arreglo, tipo) => {
            if (arreglo.length === 0) {
                return '<div style="text-align:center; padding:20px; color:#94a3b8; background:white; border-radius:12px; border:1px solid #e2e8f0; font-size: 0.9rem;">No hay registros en esta sección.</div>';
            }
            
            let html = '';
            arreglo.forEach(h => {
                const descHtml = h.description
                    ? `<p style="margin:8px 0 0 0; font-size:0.9rem; color:#475569; line-height:1.4; background:#f8fafc; padding:10px; border-radius:8px; border: 1px solid #e2e8f0;">${h.description}</p>`
                    : '';
                
                let infoExtra = '';
                let accionesHtml = '';

                if (tipo === 'reportados') {
                    const asignadoObj = window.todosLosEmpleadosData.find(e => String(e.id) === String(h.assigned_to));
                    const nombreAsignado = asignadoObj ? asignadoObj.name : 'Usuario Desconocido';
                    infoExtra = `<div style="font-size:0.8rem; color:#0f766e; font-weight:bold; margin-top:4px;">👤 Asignado a: ${nombreAsignado}</div>`;
                    
                    accionesHtml = `
                        <div style="display:flex; gap:5px;">
                            <button onclick="window.editarHallazgo('${h.id}')" style="background:none; border:none; color:#0284c7; font-size:1.1rem; cursor:pointer; padding:5px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='#e0f2fe'" onmouseout="this.style.background='none'" title="Editar hallazgo">
                                ✏️
                            </button>
                            <button onclick="window.eliminarHallazgo('${h.id}')" style="background:none; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer; padding:5px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'" title="Eliminar hallazgo">
                                🗑️
                            </button>
                        </div>
                    `;
                } else {
                    const reporteroObj = window.todosLosEmpleadosData.find(e => String(e.id) === String(h.employee_id));
                    const nombreReportero = reporteroObj ? reporteroObj.name : 'Usuario Desconocido';
                    infoExtra = `<div style="font-size:0.8rem; color:#b45309; font-weight:bold; margin-top:4px;">✍️ Reportado por: ${nombreReportero}</div>`;
                }

                const borderColor = tipo === 'asignados' ? '#0ea5e9' : '#f59e0b';
                    
                html += `
                <div class="incident-card" style="border-left: 5px solid ${borderColor}; padding: 15px; margin-bottom: 15px; background:white; cursor:default; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                <h3 style="margin:0 0 5px 0; color:#1e293b; font-size:1.05rem;">${h.title}</h3>
                                ${accionesHtml}
                            </div>
                            <div style="font-size:0.8rem; color:#64748b; margin-bottom: 3px;">📅 Observado el: <b>${h.date}</b></div>
                            ${infoExtra}
                            ${descHtml}
                        </div>
                    </div>
                </div>`;
            });
            return html;
        };

        container.innerHTML += `
            <div style="margin-bottom: 30px;">
                <h3 style="color:#0284c7; margin: 0 0 15px 0; padding-bottom:5px; border-bottom: 2px solid #bae6fd; font-size:1rem; display:flex; justify-content:space-between; align-items:center;">
                    <span>🎯 Asignados a Mí</span>
                    <span style="background:#e0f2fe; color:#0284c7; padding: 2px 8px; border-radius:12px; font-size:0.8rem;">${asignadosAMi.length}</span>
                </h3>
                ${renderizarTarjetas(asignadosAMi, 'asignados')}
            </div>

            <div>
                <h3 style="color:#b45309; margin: 0 0 15px 0; padding-bottom:5px; border-bottom: 2px solid #fef3c7; font-size:1rem; display:flex; justify-content:space-between; align-items:center;">
                    <span>📝 Reportados por Mí</span>
                    <span style="background:#fef3c7; color:#b45309; padding: 2px 8px; border-radius:12px; font-size:0.8rem;">${reportadosPorMi.length}</span>
                </h3>
                ${renderizarTarjetas(reportadosPorMi, 'reportados')}
            </div>
        `;
        
    } catch (error) {
        container.innerHTML = `<div style="color:red; padding:20px; text-align:center;">Error al cargar: ${error.message}</div>`;
    }
};


document.addEventListener('DOMContentLoaded', () => {
    window.inicializarModuloHallazgos();
});
